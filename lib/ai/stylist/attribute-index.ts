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
  _stylistIndexWriteQueue?: Promise<void>
}

function indexPath(): string {
  return path.isAbsolute(STYLIST_INDEX_PATH)
    ? STYLIST_INDEX_PATH
    : path.join(process.cwd(), STYLIST_INDEX_PATH)
}

async function load(): Promise<Map<string, DressAttributes>> {
  if (g._stylistIndexLoaded && g._stylistIndex) return g._stylistIndex

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
  return map
}

/** Serialised writes: concurrent requests must not clobber each other's rows. */
async function persist(): Promise<void> {
  const map = g._stylistIndex
  if (!map) return

  const write = async () => {
    const body: IndexFile = {
      version: ATTRIBUTE_INDEX_VERSION,
      updatedAt: Date.now(),
      entries: Object.fromEntries(map),
    }
    const target = indexPath()
    const tmp = `${target}.tmp`
    try {
      await fs.writeFile(tmp, JSON.stringify(body), "utf8")
      await fs.rename(tmp, target)
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

/**
 * Catalogues one product. Returns the stored row, or null when the image is
 * unreachable or is not a gown.
 */
export async function tagProduct(product: TaggableProduct): Promise<DressAttributes | null> {
  const productId = String(product.id)
  const imageUrl = primaryImage(product)
  if (!imageUrl) return null

  const map = await load()
  const existing = map.get(productId)
  if (!needsTagging(existing, imageUrl)) return existing!

  const bytes = await loadProductImageBytes(imageUrl)
  if (!bytes) return null

  const mimeType = imageUrl.endsWith(".png")
    ? "image/png"
    : imageUrl.endsWith(".jpg") || imageUrl.endsWith(".jpeg")
      ? "image/jpeg"
      : "image/webp"

  const attrs = await tagDressImage(bytes, mimeType)
  if (!attrs) return null

  const entry: DressAttributes = {
    ...attrs,
    productId,
    imageUrl,
    taggedAt: Date.now(),
    version: ATTRIBUTE_INDEX_VERSION,
  }

  map.set(productId, entry)
  await persist()
  return entry
}

/**
 * Tags up to `budget` un-catalogued products from `candidates`, sequentially so
 * a burst of vision calls cannot stampede the upstream quota. Failures are
 * swallowed: an unwarmed index degrades ranking, it must never fail a request.
 */
export async function warmIndex(
  candidates: TaggableProduct[],
  budget: number = STYLIST_LAZY_TAG_BUDGET
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
      const entry = await tagProduct(product)
      if (entry) tagged++
    } catch {
      // Quota, timeout, unreachable image — skip and continue.
    }
  }
  return tagged
}
