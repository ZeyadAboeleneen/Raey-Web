/**
 * lib/ai/stylist/embeddings.ts
 *
 * Semantic search over what the tagger actually wrote about each gown.
 *
 * The attribute vocabulary is eight categories wide. Everything else the
 * vision pass observed — sheer panels, a leg slit, a cape, a corset bodice,
 * how much the gown covers — lives only in the free-text `description`, which
 * until now was used to *write* card copy and never to *find* anything. A
 * shopper asking for a dress with a cape matched on nothing at all.
 *
 * Embedding those descriptions fixes that without loosening the architecture:
 * the similarity score is added to the matcher's existing weighted sum, so it
 * reorders candidates the catalogue already contains. It never filters, and
 * the model still never decides which gowns exist.
 *
 * Vectors live in their own file (see `scripts/build-stylist-embeddings.mjs`)
 * so a rebuild never risks the attribute index the whole stylist depends on.
 */

import path from "path"
import fs from "fs/promises"
import { GoogleGenAI } from "@google/genai"
import {
  STYLIST_EMBEDDINGS_PATH,
  STYLIST_EMBEDDING_DIMS,
  STYLIST_EMBEDDING_MODEL,
} from "./stylist-config"

/** Retrieval quality improves measurably when the two sides are embedded for
    their actual role, so documents and queries are tagged differently. */
type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"

let client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set")
  if (!client) client = new GoogleGenAI({ apiKey })
  return client
}

/**
 * Scales a vector to unit length so cosine similarity is a plain dot product.
 * Required below the model's native 3072 dimensions, where output is no
 * longer normalised (a 768-dim vector comes back with a norm around 0.57).
 */
export function normalize(values: number[]): Float32Array {
  let sum = 0
  for (const v of values) sum += v * v
  const norm = Math.sqrt(sum) || 1
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = values[i] / norm
  return out
}

/** Both sides are unit vectors, so this is the cosine similarity. */
export function similarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

export async function embedText(text: string, taskType: TaskType): Promise<Float32Array | null> {
  const trimmed = text.trim()
  if (!trimmed) return null

  const response = await getClient().models.embedContent({
    model: STYLIST_EMBEDDING_MODEL,
    contents: trimmed,
    config: { outputDimensionality: STYLIST_EMBEDDING_DIMS, taskType },
  })

  const values = response.embeddings?.[0]?.values
  return Array.isArray(values) ? normalize(values) : null
}

/* ── The stored index ───────────────────────────────────────────────── */

interface EmbeddingFile {
  model: string
  dims: number
  updatedAt: number
  /** productId → base64 of the Float32Array. Far smaller than JSON numbers:
      768 floats is 3KB packed against roughly 15KB spelled out. */
  vectors: Record<string, string>
}

const g = globalThis as typeof globalThis & {
  _stylistEmbeddings?: Map<string, Float32Array>
  _stylistEmbeddingsMtime?: number
}

function indexPath(): string {
  return path.isAbsolute(STYLIST_EMBEDDINGS_PATH)
    ? STYLIST_EMBEDDINGS_PATH
    : path.join(process.cwd(), STYLIST_EMBEDDINGS_PATH)
}

export function decodeVector(base64: string): Float32Array {
  const buffer = Buffer.from(base64, "base64")
  // Copy rather than view: a Buffer from the pool may not be 4-byte aligned,
  // and Float32Array demands alignment.
  const copy = new ArrayBuffer(buffer.byteLength)
  Buffer.from(copy).set(buffer)
  return new Float32Array(copy)
}

export function encodeVector(vector: Float32Array): string {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).toString("base64")
}

/**
 * Loads the vector index, re-reading when the file changes underneath a
 * long-running server — the same mtime guard the attribute index uses, for
 * the same reason: a backfill writes this file while the site is up.
 */
export async function loadEmbeddingIndex(): Promise<Map<string, Float32Array>> {
  let mtime = 0
  try {
    mtime = (await fs.stat(indexPath())).mtimeMs
  } catch {
    // No index yet — semantic ranking simply stays off.
  }
  if (g._stylistEmbeddings && g._stylistEmbeddingsMtime === mtime) return g._stylistEmbeddings

  const map = new Map<string, Float32Array>()
  try {
    const parsed: EmbeddingFile = JSON.parse(await fs.readFile(indexPath(), "utf8"))
    if (parsed?.vectors && parsed.dims === STYLIST_EMBEDDING_DIMS) {
      for (const [id, encoded] of Object.entries(parsed.vectors)) {
        const vector = decodeVector(encoded)
        if (vector.length === STYLIST_EMBEDDING_DIMS) map.set(id, vector)
      }
    }
  } catch {
    // Missing or unreadable: the stylist works exactly as it did before.
  }

  g._stylistEmbeddings = map
  g._stylistEmbeddingsMtime = mtime
  return map
}

export async function embeddingIndexSize(): Promise<number> {
  return (await loadEmbeddingIndex()).size
}

/* ── Keeping the index current on its own ───────────────────────────── */

/**
 * The text a gown is embedded as. Mirrors `documentText` in
 * scripts/build-stylist-embeddings.mjs — the two must agree, or a gown
 * embedded live would sit in a different part of the space from one embedded
 * by the batch script.
 */
export interface EmbeddableDress {
  productId: string
  silhouette?: readonly string[]
  neckline?: readonly string[]
  sleeves?: readonly string[]
  embellishment?: readonly string[]
  color?: readonly string[]
  volume?: string | null
  train?: string | null
  description?: string
}

export function documentTextFor(entry: EmbeddableDress): string {
  const attrs = [
    ...(entry.silhouette ?? []),
    ...(entry.neckline ?? []),
    ...(entry.sleeves ?? []),
    ...(entry.embellishment ?? []),
    ...(entry.color ?? []),
    entry.volume ? `${entry.volume} volume` : "",
    entry.train && entry.train !== "none" ? `${entry.train} train` : "",
  ]
    .filter(Boolean)
    .join(", ")

  return `${attrs}. ${entry.description ?? ""}`.trim()
}

const writeQueue = { current: Promise.resolve() }

/**
 * Adds one gown's vector to the index, merging onto whatever is on disk.
 *
 * Merge rather than overwrite for the same reason the attribute index does
 * it: the batch script may be running against this file at the same time, and
 * a live write must never flatten hours of its work.
 */
async function persistVector(productId: string, vector: Float32Array): Promise<void> {
  const write = async () => {
    const target = indexPath()
    const tmp = `${target}.tmp`
    try {
      let file: EmbeddingFile = {
        model: STYLIST_EMBEDDING_MODEL,
        dims: STYLIST_EMBEDDING_DIMS,
        updatedAt: Date.now(),
        vectors: {},
      }
      try {
        const parsed: EmbeddingFile = JSON.parse(await fs.readFile(target, "utf8"))
        if (parsed?.vectors && parsed.dims === STYLIST_EMBEDDING_DIMS) file = parsed
      } catch {
        // No file yet — this creates it.
      }

      file.vectors[productId] = encodeVector(vector)
      file.updatedAt = Date.now()

      await fs.writeFile(tmp, JSON.stringify(file), "utf8")
      await fs.rename(tmp, target)

      // Keep the in-memory copy in step so the next request sees the new gown
      // without waiting for an mtime-triggered reload.
      if (g._stylistEmbeddings) g._stylistEmbeddings.set(productId, vector)
      try {
        g._stylistEmbeddingsMtime = (await fs.stat(target)).mtimeMs
      } catch {
        g._stylistEmbeddingsMtime = undefined
      }
    } catch (err: any) {
      console.warn("[Stylist] could not persist embedding:", err?.code || "write failed")
    }
  }

  writeQueue.current = writeQueue.current.then(write, write)
  return writeQueue.current
}

/**
 * Embeds gowns that are catalogued but have no vector yet, so a dress added
 * to the shop becomes searchable by description without anyone running a
 * script. Cheap enough to do inline: one short embedding call is a fraction
 * of a cent and returns in well under a second.
 *
 * Never throws — an un-embedded gown still matches on its attributes.
 */
export async function warmEmbeddings(
  entries: readonly EmbeddableDress[],
  budget: number
): Promise<number> {
  if (budget <= 0 || entries.length === 0) return 0
  const index = await loadEmbeddingIndex()

  let done = 0
  for (const entry of entries) {
    if (done >= budget) break
    if (index.has(entry.productId)) continue
    try {
      const vector = await embedText(documentTextFor(entry), "RETRIEVAL_DOCUMENT")
      if (!vector) continue
      await persistVector(entry.productId, vector)
      done++
    } catch {
      // Quota, network — the next request tries again.
    }
  }
  return done
}

/**
 * The best similarity anything in the catalogue has to this query.
 *
 * Used as a "did she actually describe a dress?" test. Whether a turn even
 * reaches the matcher otherwise depends on the conversation model setting
 * `readyToRecommend`, and for a request the eight-category vocabulary cannot
 * express — "a dress with a leg slit" — almost nothing gets extracted, so
 * that flag becomes a coin flip: the same sentence searched on one run and
 * asked a follow-up question on the next.
 *
 * This replaces that with something measured. A real request has a gown
 * somewhere above the noise floor; "hi" does not, peaking below where genuine
 * queries even average. Cheap enough to run every turn — a thousand dot
 * products over 768 dimensions.
 */
export async function bestSimilarity(query: Float32Array): Promise<number> {
  const index = await loadEmbeddingIndex()
  let best = 0
  for (const vector of index.values()) {
    const score = similarity(query, vector)
    if (score > best) best = score
  }
  return best
}
