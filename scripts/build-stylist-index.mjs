/**
 * scripts/build-stylist-index.mjs
 *
 * Builds the stylist's attribute report for the whole catalogue: reads every
 * product photo once with Gemini vision and writes the structured attributes
 * plus a plain-language description into .raey-stylist-index.json.
 *
 * Built for a FREE-TIER key, which is the whole reason this exists as a
 * long-running script rather than the batch API route:
 *   - rotates across several models, each with its own quota bucket
 *   - backs off per-model on 429 instead of dying
 *   - saves after every single dress, so it is fully resumable: stop it and
 *     re-run any time and it picks up exactly where it left off
 *
 * Usage:  node --use-system-ca scripts/build-stylist-index.mjs [--limit N]
 */
import fs from "fs"
import path from "path"
import sql from "mssql"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const INDEX_PATH = ".raey-stylist-index.json"
const INDEX_VERSION = 2
const UPLOADS = "public/uploads/products"

// Each model is a separate free-tier quota bucket; rotating multiplies throughput.
const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash"]
const cooldownUntil = new Map(MODELS.map((m) => [m, 0]))

const KEY = process.env.GEMINI_API_KEY
const limitArg = process.argv.indexOf("--limit")
const LIMIT = limitArg > -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity

const VOCAB = {
  silhouette: ["a-line", "ball-gown", "mermaid", "trumpet", "sheath", "fitted", "straight", "empire"],
  neckline: ["strapless", "off-shoulder", "v-neck", "square", "sweetheart", "high-neck", "halter", "one-shoulder", "scoop", "illusion"],
  sleeves: ["sleeveless", "short", "long", "off-shoulder", "cap", "three-quarter", "detachable"],
  embellishment: ["lace", "beading", "embroidery", "sequins", "applique", "draping", "ruffles", "feathers", "bow", "minimal"],
  style: ["romantic", "classic", "minimal", "modern", "dramatic", "glamorous", "feminine", "timeless", "contemporary", "regal"],
  color: ["white", "ivory", "champagne", "nude", "blush", "gold", "silver", "black", "navy", "red", "burgundy", "green", "blue", "pink", "lilac", "grey", "multicolor"],
  volume: ["minimal", "medium", "dramatic"],
  train: ["none", "short", "medium", "long", "dramatic"],
}

const arr = (v) => ({ type: "ARRAY", items: { type: "STRING", enum: v } })

const SCHEMA = {
  type: "OBJECT",
  properties: {
    isDress: { type: "BOOLEAN" },
    silhouette: arr(VOCAB.silhouette),
    neckline: arr(VOCAB.neckline),
    sleeves: arr(VOCAB.sleeves),
    embellishment: arr(VOCAB.embellishment),
    style: arr(VOCAB.style),
    color: arr(VOCAB.color),
    volume: { type: "STRING", enum: VOCAB.volume },
    train: { type: "STRING", enum: VOCAB.train },
    description: { type: "STRING" },
    confidence: { type: "NUMBER" },
  },
  required: ["isDress", "silhouette", "neckline", "sleeves", "embellishment", "style", "color", "volume", "train", "description", "confidence"],
}

const SYSTEM = [
  "You are a bridal atelier cataloguer for RAEY.",
  "You are shown one photograph of a single gown. Describe ONLY the garment, using the schema's controlled vocabulary.",
  "",
  "Rules:",
  "- Report only what is clearly visible. If a feature is hidden or ambiguous, leave that array empty rather than guessing.",
  "- 'embellishment': a clean undecorated gown is 'minimal'. 'train': 'none' when absent.",
  "- Never describe the model, her body, face, size or appearance. Only the garment.",
  "- 'description': 2-4 dense factual sentences covering fabric look, how it falls, sleeve/neckline detail, embellishment density and placement, slits or cut-outs, coverage, back detail, train. This is read later to answer detailed customer questions, so state every concrete visible detail. No marketing adjectives, no speculation.",
  "- Lower confidence when the photo is small, dark, cropped or the gown is partly out of frame.",
].join("\n")

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"))
    if (j.version !== INDEX_VERSION) return {}
    return j.entries || {}
  } catch {
    return {}
  }
}

function save(entries) {
  const tmp = INDEX_PATH + ".tmp"
  fs.writeFileSync(tmp, JSON.stringify({ version: INDEX_VERSION, updatedAt: Date.now(), entries }))
  fs.renameSync(tmp, INDEX_PATH)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Picks the next model off cooldown; waits if all are cooling down. */
async function pickModel() {
  for (;;) {
    const now = Date.now()
    const free = MODELS.filter((m) => (cooldownUntil.get(m) ?? 0) <= now)
    if (free.length) return free[Math.floor(Math.random() * free.length)]
    const soonest = Math.min(...MODELS.map((m) => cooldownUntil.get(m) ?? 0))
    await sleep(Math.max(1000, soonest - now))
  }
}

async function tag(b64, mime) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const model = await pickModel()
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + KEY,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { data: b64, mimeType: mime } },
                  { text: "Catalogue this gown using the schema." },
                ],
              },
            ],
            systemInstruction: { parts: [{ text: SYSTEM }] },
            generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0 },
          }),
        }
      )

      if (res.status === 429) {
        const body = await res.text()
        const m = body.match(/retry in ([\d.]+)s/)
        const secs = m ? Number(m[1]) : 35
        cooldownUntil.set(model, Date.now() + secs * 1000 + 1500)
        continue
      }
      if (!res.ok) {
        await sleep(1500)
        continue
      }

      const j = await res.json()
      const parts = j?.candidates?.[0]?.content?.parts || []
      const text = parts.map((p) => p.text || "").join("")
      const parsed = JSON.parse(text)
      return parsed?.isDress === false ? null : parsed
    } catch {
      await sleep(2000)
    }
  }
  return null
}

async function main() {
  const pool = await sql.connect({
    server: process.env.MSSQL_SERVER,
    database: process.env.MSSQL_DATABASE,
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 2 },
  })

  const rows = (
    await pool.request().query(
      "SELECT i.ID, i.PicPath FROM Items i WHERE i.Item_Isdisabled = 0 AND i.PicPath IS NOT NULL AND LTRIM(RTRIM(i.PicPath)) <> ''"
    )
  ).recordset
  await pool.close()

  const entries = load()
  const onDisk = new Set(fs.readdirSync(UPLOADS))

  const todo = []
  for (const r of rows) {
    const id = String(r.ID)
    const url = String(r.PicPath).trim()
    const file = url.split("/").pop()
    if (!onDisk.has(file)) continue // no local image to read
    if (entries[id] && entries[id].imageUrl === url) continue // already catalogued from this photo
    todo.push({ id, url, file })
  }

  console.log("catalogue: " + rows.length + " active | already done: " + Object.keys(entries).length + " | to tag now: " + todo.length)

  let done = 0
  let failed = 0
  const started = Date.now()
  const batch = todo.slice(0, LIMIT)

  for (const item of batch) {
    const buf = fs.readFileSync(path.join(UPLOADS, item.file))
    const mime = item.file.endsWith(".png")
      ? "image/png"
      : /\.jpe?g$/.test(item.file)
        ? "image/jpeg"
        : "image/webp"

    const a = await tag(buf.toString("base64"), mime)
    if (!a) {
      failed++
      continue
    }

    entries[item.id] = {
      productId: item.id,
      imageUrl: item.url,
      silhouette: a.silhouette || [],
      neckline: a.neckline || [],
      sleeves: a.sleeves || [],
      embellishment: a.embellishment || [],
      style: a.style || [],
      color: a.color || [],
      volume: a.volume ?? null,
      train: a.train ?? null,
      description: String(a.description || "").slice(0, 1200),
      confidence: typeof a.confidence === "number" ? a.confidence : 0.5,
      taggedAt: Date.now(),
      version: INDEX_VERSION,
    }
    save(entries)
    done++

    if (done % 10 === 0) {
      const rate = done / ((Date.now() - started) / 60000)
      const left = Math.max(0, batch.length - done)
      console.log("  " + done + " tagged (" + failed + " failed) | " + rate.toFixed(1) + "/min | ~" + Math.round(left / Math.max(rate, 0.1)) + " min left")
    }
  }

  console.log("FINISHED: " + done + " tagged, " + failed + " failed, " + Object.keys(entries).length + " total in index")
}

main().catch((e) => {
  console.error("fatal:", e.message)
  process.exit(1)
})
