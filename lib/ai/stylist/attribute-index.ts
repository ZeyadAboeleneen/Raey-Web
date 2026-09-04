/**
 * lib/ai/stylist/attribute-index.ts
 *
 * The persistent store of vision-derived gown attributes.
 *
 * The ERP has no style metadata, so this index *is* the searchable catalogue
 * as far as the stylist is concerned. It is derived data: safe to delete, and
 * rebuilt on demand. Rows are keyed by product id and carry the image URL they
 * were read from, so a re-photographed gown is automatically re-tagged.
 *
 * Warming happens two ways:
 *   - `scripts/build-stylist-index.mjs` for a proper backfill;
 *   - a small per-request budget (`STYLIST_LAZY_TAG_BUDGET`) so a fresh deploy
 *     starts returning good matches without waiting for the script.
 */

import path from "path"
import fs from "fs/promises"
import { loadProductImageBytes, usableProductImages } from "../product-image"
import { ATTRIBUTE_INDEX_VERSION, type DressAttributes } from "./attribute-types"
import { STYLIST_INDEX_PATH, STYLIST_LAZY_TAG_BUDGET } from "./stylist-config"
import { tagDressImage } from "./vision-tagger"

interface IndexFile {
  version: number
  updatedAt: number
  entries: Record<string, DressAttributes>
}

const g = globalThis as typeof globalThis & {
  _stylistIndex?: Map<string, DressAttributes>
  _stylistIndexLoaded?: boolean
  _stylistIndexMtime?: number
  _stylistIndexWriteQueue?: Promise<void>
}

function indexPath(): string {
  return path.isAbsolute(STYLIST_INDEX_PATH)
    ? STYLIST_INDEX_PATH
    : path.join(process.cwd(), STYLIST_INDEX_PATH)
}

async function load(): Promise<Map<string, DressAttributes>> {
  // Re-read when the file has changed underneath us. The backfill script
  // (scripts/build-stylist-index.mjs) appends to this file for hours while the
  // server is up; without an mtime check a long-running process would serve the
  // catalogue as it looked at boot and never see a single newly-tagged gown.
  let mtime = 0
  try {
    mtime = (await fs.stat(indexPath())).mtimeMs
  } catch {
    // No file yet — fall through and load an empty index.
  }
  if (g._stylistIndexLoaded && g._stylistIndex && g._stylistIndexMtime === mtime) {
    return g._stylistIndex
  }

  const map = new Map<string, DressAttributes>()
  try {
    const raw = await fs.readFile(indexPath(), "utf8")
    const parsed: IndexFile = JSON.parse(raw)
    if (parsed?.entries && parsed.version === ATTRIBUTE_INDEX_VERSION) {
      for (const [id, entry] of Object.entries(parsed.entries)) {
        if (entry && entry.version === ATTRIBUTE_INDEX_VERSION) map.set(id, entry)
      }
    }
  } catch {
    // No index yet — the first warm run creates it.
  }

  g._stylistIndex = map
  g._stylistIndexLoaded = true
  g._stylistIndexMtime = mtime
  return map
}

/** Serialised writes: concurrent requests must not clobber each other's rows. */
async function persist(): Promise<void> {
  const map = g._stylistIndex
  if (!map) return

  const write = async () => {
    const target = indexPath()
    const tmp = `${target}.tmp`
    try {
      // Merge onto whatever is on disk rather than overwriting with our own
      // in-memory view. The backfill script writes this same file for hours,
      // and a server that booted with 50 rows would otherwise flatten a run
      // that had since catalogued hundreds. Ours wins only for rows we hold.
      let onDisk: Record<string, DressAttributes> = {}
      try {
        const raw = await fs.readFile(target, "utf8")
        const parsed: IndexFile = JSON.parse(raw)
        if (parsed?.entries && parsed.version === ATTRIBUTE_INDEX_VERSION) onDisk = parsed.entries
      } catch {
        // No readable file yet — we are creating it.
      }

      const body: IndexFile = {
        version: ATTRIBUTE_INDEX_VERSION,
        updatedAt: Date.now(),
        entries: { ...onDisk, ...Object.fromEntries(map) },
      }
      await fs.writeFile(tmp, JSON.stringify(body), "utf8")
      await fs.rename(tmp, target)
      // Our own write is the newest state; keep the mtime guard in step so the
      // next read doesn't needlessly reload what we just wrote.
      try {
        g._stylistIndexMtime = (await fs.stat(target)).mtimeMs
      } catch {
        g._stylistIndexMtime = undefined
      }
    } catch (err: any) {
      console.warn("[Stylist] could not persist attribute index:", err?.code || "write failed")
    }
  }

  g._stylistIndexWriteQueue = (g._stylistIndexWriteQueue ?? Promise.resolve()).then(write, write)
  return g._stylistIndexWriteQueue
}

export async function getAttributes(productId: string): Promise<DressAttributes | null> {
  const map = await load()
  return map.get(String(productId)) ?? null
}

/** Attributes for many products at once; missing rows are simply absent. */
export async function getAttributesFor(
  productIds: string[]
): Promise<Map<string, DressAttributes>> {
  const map = await load()
  const out = new Map<string, DressAttributes>()
  for (const id of productIds) {
    const hit = map.get(String(id))
    if (hit) out.set(String(id), hit)
  }
  return out
}

export async function indexStats(): Promise<{ tagged: number; version: number }> {
  const map = await load()
  return { tagged: map.size, version: ATTRIBUTE_INDEX_VERSION }
}

/** True when the stored row is missing or was read from a different photo. */
function needsTagging(entry: DressAttributes | undefined, imageUrl: string): boolean {
  if (!entry) return true
  if (entry.version !== ATTRIBUTE_INDEX_VERSION) return true
  return entry.imageUrl !== imageUrl
}

export interface TaggableProduct {
  id: string | number
  image?: string | null
  images?: unknown
}

function primaryImage(product: TaggableProduct): string | null {
  const fromList = usableProductImages(product.images)
  if (fromList.length > 0) return fromList[0]
  const single = typeof product.image === "string" ? product.image.trim() : ""
  return single && single !== "/placeholder.svg" ? single : null
}

/** Strips anything that could resemble a leaked API key from an upstream error string. */
function scrubErrorMessage(raw: string): string {
  return raw.replace(/([?&]key=)[^&\s"]+/gi, "$1***").slice(0, 200)
}

/**
 * Catalogues one product, reporting WHY it failed rather than just null — the
 * failure modes (no image on record, image unreachable, upstream quota,
 * missing credentials, not recognisable as a dress) look identical from the
 * outside otherwise, which made a silent `tagged: 0` on a remote deploy
 * undiagnosable without server log access.
 */
async function tagProductInternal(
  product: TaggableProduct
): Promise<{ entry: DressAttributes | null; reason?: string }> {
  const productId = String(product.id)
  const imageUrl = primaryImage(product)
  if (!imageUrl) return { entry: null, reason: "no-image-on-record" }

  const map = await load()
  const existing = map.get(productId)
  if (!needsTagging(existing, imageUrl)) return { entry: existing! }

  const bytes = await loadProductImageBytes(imageUrl)
  if (!bytes) return { entry: null, reason: `image-unreachable (${imageUrl})` }

  const mimeType = imageUrl.endsWith(".png")
    ? "image/png"
    : imageUrl.endsWith(".jpg") || imageUrl.endsWith(".jpeg")
      ? "image/jpeg"
      : "image/webp"

  let attrs: Awaited<ReturnType<typeof tagDressImage>>
  try {
    attrs = await tagDressImage(bytes, mimeType)
  } catch (err: any) {
    return { entry: null, reason: scrubErrorMessage(String(err?.message || err)) }
  }
  if (!attrs) return { entry: null, reason: "model-did-not-recognise-a-dress" }

  const entry: DressAttributes = {
    ...attrs,
    productId,
    imageUrl,
    taggedAt: Date.now(),
    version: ATTRIBUTE_INDEX_VERSION,
  }

  map.set(productId, entry)
  await persist()
  return { entry }
}

/**
 * Catalogues one product. Returns the stored row, or null when the image is
 * unreachable or is not a gown. Use `warmIndex` with `diagnostics` if you need
 * to know *why* it returned null.
 */
export async function tagProduct(product: TaggableProduct): Promise<DressAttributes | null> {
  return (await tagProductInternal(product)).entry
}

/**
 * Tags up to `budget` un-catalogued products from `candidates`, sequentially so
 * a burst of vision calls cannot stampede the upstream quota. Failures are
 * swallowed for the caller's return value (an unwarmed index degrades ranking,
 * it must never fail a request) but are appended to `diagnostics` when
 * provided, so a batch backfill run can report exactly why it made no
 * progress instead of a bare zero.
 */
export async function warmIndex(
  candidates: TaggableProduct[],
  budget: number = STYLIST_LAZY_TAG_BUDGET,
  diagnostics?: { productId: string; reason: string }[]
): Promise<number> {
  if (budget <= 0) return 0
  const map = await load()

  let tagged = 0
  for (const product of candidates) {
    if (tagged >= budget) break
    const imageUrl = primaryImage(product)
    if (!imageUrl) continue
    if (!needsTagging(map.get(String(product.id)), imageUrl)) continue

    try {
      const { entry, reason } = await tagProductInternal(product)
      if (entry) {
        tagged++
      } else if (diagnostics) {
        diagnostics.push({ productId: String(product.id), reason: reason || "unknown" })
      }
    } catch (err: any) {
      if (diagnostics) {
        diagnostics.push({
          productId: String(product.id),
          reason: scrubErrorMessage(String(err?.message || err)),
        })
      }
    }
  }
  return tagged
}
