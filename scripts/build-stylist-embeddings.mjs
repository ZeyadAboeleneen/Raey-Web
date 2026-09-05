/**
 * scripts/build-stylist-embeddings.mjs
 *
 * Embeds every gown's written description so the stylist can search on the
 * detail the eight-category vocabulary can't express — sheer panels, a leg
 * slit, a cape, a corset bodice, how much a gown covers.
 *
 * Reads .raey-stylist-index.json (built by build-stylist-index.mjs) and writes
 * .raey-stylist-embeddings.json. Separate files on purpose: rebuilding vectors
 * must never put the attribute index the whole stylist depends on at risk.
 *
 * Resumable and cheap. A description is re-embedded only when its text has
 * actually changed, so a re-run after a partial pass costs almost nothing.
 *
 * Usage:  node --use-system-ca scripts/build-stylist-embeddings.mjs [--limit N]
 */
import fs from "fs"
import crypto from "crypto"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const SOURCE = ".raey-stylist-index.json"
const TARGET = ".raey-stylist-embeddings.json"
const MODEL = process.env.AI_STYLIST_EMBEDDING_MODEL || "gemini-embedding-001"
const DIMS = parseInt(process.env.AI_STYLIST_EMBEDDING_DIMS || "768", 10)
const KEY = process.env.GEMINI_API_KEY

const limitArg = process.argv.indexOf("--limit")
const LIMIT = limitArg > -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12)

function normalize(values) {
  let sum = 0
  for (const v of values) sum += v * v
  const norm = Math.sqrt(sum) || 1
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = values[i] / norm
  return out
}

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(TARGET, "utf8"))
    if (j.model !== MODEL || j.dims !== DIMS) return { vectors: {}, hashes: {} }
    return { vectors: j.vectors || {}, hashes: j.hashes || {} }
  } catch {
    return { vectors: {}, hashes: {} }
  }
}

function save(vectors, hashes) {
  const tmp = TARGET + ".tmp"
  fs.writeFileSync(
    tmp,
    JSON.stringify({ model: MODEL, dims: DIMS, updatedAt: Date.now(), vectors, hashes })
  )
  fs.renameSync(tmp, TARGET)
}

/**
 * The text that represents a gown for retrieval. The description carries the
 * detail, but the structured attributes are appended so a query naming a
 * silhouette or colour still lands on the right side of the vector space.
 */
function documentText(entry) {
  const attrs = [
    ...(entry.silhouette || []),
    ...(entry.neckline || []),
    ...(entry.sleeves || []),
    ...(entry.embellishment || []),
    ...(entry.color || []),
    entry.volume ? `${entry.volume} volume` : "",
    entry.train && entry.train !== "none" ? `${entry.train} train` : "",
  ]
    .filter(Boolean)
    .join(", ")

  return `${attrs}. ${entry.description || ""}`.trim()
}

async function embed(text) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: `models/${MODEL}`,
            content: { parts: [{ text }] },
            taskType: "RETRIEVAL_DOCUMENT",
            outputDimensionality: DIMS,
          }),
        }
      )

      if (res.status === 429) {
        const body = await res.text()
        const m = body.match(/retry in ([\d.]+)s/)
        await sleep((m ? Number(m[1]) : 20) * 1000 + 1000)
        continue
      }
      if (!res.ok) {
        await sleep(1500)
        continue
      }

      const j = await res.json()
      const values = j?.embedding?.values
      if (Array.isArray(values)) return normalize(values)
      return null
    } catch {
      await sleep(2000)
    }
  }
  return null
}

async function main() {
  if (!KEY) throw new Error("GEMINI_API_KEY is not set")

  const source = JSON.parse(fs.readFileSync(SOURCE, "utf8"))
  const entries = Object.values(source.entries || {})
  const { vectors, hashes } = load()

  const todo = []
  for (const entry of entries) {
    const text = documentText(entry)
    if (!text) continue
    const h = hash(text)
    if (vectors[entry.productId] && hashes[entry.productId] === h) continue
    todo.push({ id: entry.productId, text, hash: h })
  }

  console.log(
    `catalogue: ${entries.length} tagged | already embedded: ${Object.keys(vectors).length} | to embed now: ${todo.length}`
  )

  const batch = todo.slice(0, LIMIT)
  let done = 0
  let failed = 0
  const started = Date.now()

  for (const item of batch) {
    const vector = await embed(item.text)
    if (!vector) {
      failed++
      continue
    }
    vectors[item.id] = Buffer.from(vector.buffer).toString("base64")
    hashes[item.id] = item.hash
    done++

    // Save periodically rather than every row: these are fast, and a hundred
    // rows of progress is a cheap thing to risk against constant disk writes.
    if (done % 25 === 0) {
      save(vectors, hashes)
      const rate = done / ((Date.now() - started) / 60000)
      console.log(
        `  ${done} embedded (${failed} failed) | ${rate.toFixed(0)}/min | ~${Math.round(
          Math.max(0, batch.length - done) / Math.max(rate, 0.1)
        )} min left`
      )
    }
  }

  save(vectors, hashes)
  const bytes = fs.statSync(TARGET).size
  console.log(
    `FINISHED: ${done} embedded, ${failed} failed, ${Object.keys(vectors).length} total | ${(
      bytes / 1024 / 1024
    ).toFixed(1)} MB`
  )
}

main().catch((e) => {
  console.error("fatal:", e.message)
  process.exit(1)
})
