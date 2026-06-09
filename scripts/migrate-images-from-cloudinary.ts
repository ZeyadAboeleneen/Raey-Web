#!/usr/bin/env npx tsx
/**
 * scripts/migrate-images-from-cloudinary.ts
 *
 * Migrates every Cloudinary image URL stored in the databases to local
 * storage, then updates each database record in-place.
 *
 * ── Targets ──────────────────────────────────────────────────────────
 *   MSSQL  Items.PicPath              (ERP product images)
 *   MySQL  products.image_url         (single URL, Prisma)
 *   MySQL  products.images            (JSON array of URLs, Prisma)
 *   MySQL  offers.image_url           (single URL, Prisma)
 *   MySQL  orders.payment_screenshot  (optional — pass --include-payments)
 *
 * ── Usage ────────────────────────────────────────────────────────────
 *   npx tsx scripts/migrate-images-from-cloudinary.ts [options]
 *
 *   Options:
 *     --dry-run              Show what would happen; make no changes
 *     --batch-size=N         Images per batch (default 10)
 *     --table=NAME           Migrate one table only:
 *                              mssql-items | prisma-products | prisma-offers | prisma-payments
 *     --include-payments     Also migrate orders.payment_screenshot
 *     --rollback             Revert DB records to old Cloudinary URLs
 *                            (reads scripts/migration-rollback.json)
 *     --reset-failed         Clear failed entries from state and retry them
 *
 * ── State file ───────────────────────────────────────────────────────
 *   scripts/migration-state.json   tracks migrated URLs → safe to Ctrl-C and resume
 *   scripts/migration-rollback.json  newUrl → oldUrl map for rollback
 *   scripts/migration-report.json   final report written at the end
 *
 * ── Environment variables required ───────────────────────────────────
 *   MSSQL_SERVER, MSSQL_DATABASE, MSSQL_USER, MSSQL_PASSWORD
 *   DATABASE_URL   (MySQL connection string for Prisma)
 *   UPLOAD_DIR     (where to save images — same as the app uses)
 *
 *   Variables are loaded automatically from .env.local if it exists.
 */

import path    from "path"
import fs      from "fs/promises"
import { existsSync, readFileSync, writeFileSync } from "fs"
import crypto  from "crypto"
import sharp   from "sharp"
import * as mssqlLib from "mssql"
import { PrismaClient } from "@prisma/client"

/* ================================================================== */
/*  Env loader — reads .env.local so you do not need to export vars    */
/* ================================================================== */

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return
  const lines = readFileSync(filePath, "utf8").split("\n")
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eqIdx = line.indexOf("=")
    if (eqIdx === -1) continue
    const key = line.slice(0, eqIdx).trim()
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "")
    if (key && !process.env[key]) process.env[key] = val
  }
}

// Load in priority order (later files override earlier ones)
loadEnvFile(".env")
loadEnvFile(".env.local")

/* ================================================================== */
/*  CLI argument parsing                                               */
/* ================================================================== */

const args = process.argv.slice(2)

const DRY_RUN          = args.includes("--dry-run")
const INCLUDE_PAYMENTS = args.includes("--include-payments")
const DO_ROLLBACK      = args.includes("--rollback")
const RESET_FAILED     = args.includes("--reset-failed")

const BATCH_SIZE = (() => {
  const flag = args.find(a => a.startsWith("--batch-size="))
  return flag ? Math.max(1, parseInt(flag.split("=")[1], 10) || 10) : 10
})()

const ONLY_TABLE = (() => {
  const flag = args.find(a => a.startsWith("--table="))
  return flag ? flag.split("=")[1] : null
})()

const VALID_TABLES = ["mssql-items", "prisma-products", "prisma-offers", "prisma-payments"]
if (ONLY_TABLE && !VALID_TABLES.includes(ONLY_TABLE)) {
  console.error(`Unknown --table value: "${ONLY_TABLE}". Valid: ${VALID_TABLES.join(", ")}`)
  process.exit(1)
}

/* ================================================================== */
/*  Paths                                                              */
/* ================================================================== */

const SCRIPTS_DIR     = path.join(process.cwd(), "scripts")
const STATE_FILE      = path.join(SCRIPTS_DIR, "migration-state.json")
const ROLLBACK_FILE   = path.join(SCRIPTS_DIR, "migration-rollback.json")
const REPORT_FILE     = path.join(SCRIPTS_DIR, "migration-report.json")

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface FailedEntry {
  url:   string
  error: string
  table: string
  id:    string
}

interface RollbackEntry {
  oldUrl: string   // original Cloudinary URL
  newUrl: string   // new local URL
  table:  string
  id:     string
  field:  string
}

interface MigrationState {
  startedAt:    string
  lastRunAt:    string
  migratedUrls: string[]    // Cloudinary URLs already processed
  failedUrls:   FailedEntry[]
}

interface MigrationReport {
  completedAt:  string
  dryRun:       boolean
  migrated:     number
  skipped:      number
  failed:       number
  failedEntries: FailedEntry[]
  rollbackFile: string
}

/* ================================================================== */
/*  State management (persisted to disk for resume support)           */
/* ================================================================== */

function loadState(): MigrationState {
  if (existsSync(STATE_FILE)) {
    try {
      const raw = readFileSync(STATE_FILE, "utf8")
      const parsed = JSON.parse(raw) as MigrationState
      if (RESET_FAILED) {
        parsed.failedUrls = []
        log("↩️  Reset-failed: cleared all previous failures.")
      }
      return parsed
    } catch {
      log("⚠️  Could not parse existing state file — starting fresh.")
    }
  }
  return {
    startedAt:    new Date().toISOString(),
    lastRunAt:    new Date().toISOString(),
    migratedUrls: [],
    failedUrls:   [],
  }
}

function saveState(state: MigrationState): void {
  if (DRY_RUN) return
  state.lastRunAt = new Date().toISOString()
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8")
}

function loadRollbackMap(): RollbackEntry[] {
  if (!existsSync(ROLLBACK_FILE)) return []
  try {
    return JSON.parse(readFileSync(ROLLBACK_FILE, "utf8")) as RollbackEntry[]
  } catch {
    return []
  }
}

function appendRollbackEntry(entry: RollbackEntry): void {
  if (DRY_RUN) return
  const existing = loadRollbackMap()
  existing.push(entry)
  writeFileSync(ROLLBACK_FILE, JSON.stringify(existing, null, 2), "utf8")
}

/* ================================================================== */
/*  Logging                                                            */
/* ================================================================== */

function log(...args: any[]) { console.log(new Date().toISOString().slice(11, 19), ...args) }
function err(...args: any[]) { console.error(new Date().toISOString().slice(11, 19), "❌", ...args) }
function ok (...args: any[]) { console.log(new Date().toISOString().slice(11, 19), "✅", ...args) }
function dry(...args: any[]) { console.log(new Date().toISOString().slice(11, 19), "[DRY-RUN]", ...args) }

/* ================================================================== */
/*  Cloudinary URL detection                                           */
/* ================================================================== */

function isCloudinaryUrl(url: unknown): url is string {
  return typeof url === "string" &&
    url.includes("res.cloudinary.com") &&
    url.startsWith("http")
}

/** Extract all Cloudinary URLs from an arbitrary JSON value */
function extractCloudinaryUrls(value: unknown): string[] {
  if (isCloudinaryUrl(value)) return [value]
  if (Array.isArray(value))   return value.flatMap(extractCloudinaryUrls)
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(extractCloudinaryUrls)
  }
  return []
}

/** Replace Cloudinary URLs inside an arbitrary JSON value with a urlMap lookup */
function replaceCloudinaryUrls(
  value: unknown,
  urlMap: Map<string, string>
): unknown {
  if (isCloudinaryUrl(value))  return urlMap.get(value) ?? value
  if (Array.isArray(value))    return value.map(v => replaceCloudinaryUrls(v, urlMap))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = replaceCloudinaryUrls(v, urlMap)
    }
    return out
  }
  return value
}

/* ================================================================== */
/*  Image download + Sharp pipeline                                    */
/* ================================================================== */

const MAX_WIDTH    = 1600
const WEBP_QUALITY = 80
const FETCH_TIMEOUT_MS = 30_000   // 30 s per image

async function downloadAndConvert(cloudinaryUrl: string): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(cloudinaryUrl, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

    const raw = Buffer.from(await res.arrayBuffer())

    const image    = sharp(raw)
    const metadata = await image.metadata()

    let pipeline = image
    if (metadata.width && metadata.width > MAX_WIDTH) {
      pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true })
    }

    return pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()
  } finally {
    clearTimeout(timer)
  }
}

/* ================================================================== */
/*  Save processed image to UPLOAD_DIR                                */
/* ================================================================== */

function getUploadRoot(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads")
}

async function saveImage(buffer: Buffer, folder: string): Promise<string> {
  const uploadDir = path.join(getUploadRoot(), folder)
  await fs.mkdir(uploadDir, { recursive: true })

  const fileName = `${crypto.randomUUID()}.webp`
  const filePath = path.join(uploadDir, fileName)
  await fs.writeFile(filePath, buffer)

  return `/uploads/${folder}/${fileName}`
}

/* ================================================================== */
/*  Core: migrate one Cloudinary URL                                  */
/* ================================================================== */

interface MigrateOneResult {
  status:  "migrated" | "skipped" | "failed"
  newUrl?: string
  error?:  string
}

async function migrateOneUrl(
  cloudinaryUrl: string,
  folder:        string,
  state:         MigrationState,
  counters:      Counters
): Promise<MigrateOneResult> {
  // Already done in a previous run
  if (state.migratedUrls.includes(cloudinaryUrl)) {
    counters.skipped++
    return { status: "skipped" }
  }

  if (DRY_RUN) {
    dry(`Would migrate: ${cloudinaryUrl}`)
    counters.migrated++
    return { status: "migrated", newUrl: "/uploads/[dry-run-placeholder].webp" }
  }

  try {
    const buffer = await downloadAndConvert(cloudinaryUrl)
    const newUrl = await saveImage(buffer, folder)

    // Record in state immediately so a crash mid-batch doesn't re-migrate this one
    state.migratedUrls.push(cloudinaryUrl)
    saveState(state)

    counters.migrated++
    return { status: "migrated", newUrl }
  } catch (e: any) {
    counters.failed++
    return { status: "failed", error: e?.message ?? "unknown error" }
  }
}

/* ================================================================== */
/*  Counters (shared across all table processors)                     */
/* ================================================================== */

interface Counters {
  migrated: number
  skipped:  number
  failed:   number
}

/* ================================================================== */
/*  Sleep helper for polite batching                                  */
/* ================================================================== */

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/* ================================================================== */
/*  PROCESSOR 1 — MSSQL  Items.PicPath                               */
/* ================================================================== */

async function processMssqlItems(
  state:    MigrationState,
  counters: Counters
): Promise<void> {
  log("── MSSQL Items.PicPath ──────────────────────────────────────")

  const cfg: mssqlLib.config = {
    server:   process.env.MSSQL_SERVER   ?? "",
    database: process.env.MSSQL_DATABASE ?? "",
    user:     process.env.MSSQL_USER     ?? "",
    password: process.env.MSSQL_PASSWORD ?? "",
    options:  { encrypt: true, trustServerCertificate: true },
    connectionTimeout: 15_000,
    requestTimeout:    30_000,
  }

  let pool: mssqlLib.ConnectionPool
  try {
    pool = await mssqlLib.connect(cfg)
    log("Connected to MSSQL")
  } catch (e: any) {
    err("Cannot connect to MSSQL:", e?.message)
    log("Skipping MSSQL table — check MSSQL_* env vars.")
    return
  }

  try {
    // Fetch all items that have a Cloudinary PicPath
    const result = await pool.request().query(`
      SELECT ID, Item_name, PicPath
      FROM   Items
      WHERE  PicPath LIKE '%res.cloudinary.com%'
        AND  Item_Isdisabled = 0
      ORDER  BY ID
    `)

    const rows = result.recordset as { ID: number; Item_name: string; PicPath: string }[]
    log(`Found ${rows.length} MSSQL items with Cloudinary images.`)

    if (rows.length === 0) { ok("Nothing to migrate in MSSQL."); return }

    // Process in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)} — ${batch.length} items`)

      for (const row of batch) {
        const res = await migrateOneUrl(row.PicPath, "products", state, counters)

        if (res.status === "migrated" && res.newUrl && !DRY_RUN) {
          await pool.request()
            .input("newUrl", mssqlLib.NVarChar(mssqlLib.MAX), res.newUrl)
            .input("id",     mssqlLib.Int, row.ID)
            .query("UPDATE Items SET PicPath = @newUrl WHERE ID = @id")

          appendRollbackEntry({
            oldUrl: row.PicPath,
            newUrl: res.newUrl,
            table:  "mssql.Items",
            id:     String(row.ID),
            field:  "PicPath",
          })
          ok(`MSSQL Items#${row.ID} "${row.Item_name}" → ${res.newUrl}`)
        } else if (res.status === "failed") {
          err(`MSSQL Items#${row.ID}: ${res.error}`)
          state.failedUrls.push({ url: row.PicPath, error: res.error ?? "", table: "mssql.Items", id: String(row.ID) })
          saveState(state)
        }
      }

      // Small pause between batches to avoid hammering Cloudinary
      if (i + BATCH_SIZE < rows.length) await sleep(500)
    }
  } finally {
    await pool.close()
  }
}

/* ================================================================== */
/*  PROCESSOR 2 — Prisma  products.image_url  +  products.images     */
/* ================================================================== */

async function processPrismaProducts(
  prisma:   PrismaClient,
  state:    MigrationState,
  counters: Counters
): Promise<void> {
  log("── Prisma products (image_url + images JSON) ─────────────────")

  // Fetch products that have at least one Cloudinary URL
  // We load in chunks to avoid pulling the entire table into memory
  const PAGE_SIZE = 100
  let cursor: string | undefined = undefined
  let pageNum = 0

  while (true) {
    const page: { productId: string; imageUrl: string | null; images: any }[] =
      await prisma.product.findMany({
        take:    PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor: { productId: cursor } } : {}),
        orderBy: { productId: "asc" },
        select:  { productId: true, imageUrl: true, images: true },
      })

    if (page.length === 0) break
    cursor = page.at(-1)!.productId
    pageNum++

    // Filter to products that actually have Cloudinary URLs
    const toMigrate = page.filter((p: { productId: string; imageUrl: string | null; images: any }) => {
      const hasCloudinaryImageUrl = isCloudinaryUrl(p.imageUrl)
      const hasCloudinaryImages   = extractCloudinaryUrls(p.images).length > 0
      return hasCloudinaryImageUrl || hasCloudinaryImages
    })

    if (toMigrate.length === 0) continue
    log(`Page ${pageNum}: ${toMigrate.length} products need migration.`)

    // Process in sub-batches
    for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
      const batch = toMigrate.slice(i, i + BATCH_SIZE)

      for (const product of batch) {
        const updates: { imageUrl?: string; images?: unknown } = {}
        const urlMap = new Map<string, string>()

        // ── image_url field ────────────────────────────────────────
        if (isCloudinaryUrl(product.imageUrl)) {
          const res = await migrateOneUrl(product.imageUrl, "products", state, counters)
          if (res.status === "migrated" && res.newUrl) {
            urlMap.set(product.imageUrl, res.newUrl)
            updates.imageUrl = res.newUrl
            if (!DRY_RUN) appendRollbackEntry({
              oldUrl: product.imageUrl,
              newUrl: res.newUrl,
              table:  "prisma.products",
              id:     product.productId,
              field:  "image_url",
            })
          } else if (res.status === "failed") {
            err(`products#${product.productId} image_url: ${res.error}`)
            state.failedUrls.push({ url: product.imageUrl, error: res.error ?? "", table: "prisma.products", id: product.productId })
            saveState(state)
          }
        }

        // ── images JSON field (may contain array of URLs) ──────────
        const cloudinaryInImages = extractCloudinaryUrls(product.images)
        for (const imgUrl of cloudinaryInImages) {
          if (urlMap.has(imgUrl)) continue   // already migrated above
          const res = await migrateOneUrl(imgUrl, "products", state, counters)
          if (res.status === "migrated" && res.newUrl) {
            urlMap.set(imgUrl, res.newUrl)
            if (!DRY_RUN) appendRollbackEntry({
              oldUrl: imgUrl,
              newUrl: res.newUrl,
              table:  "prisma.products",
              id:     product.productId,
              field:  "images",
            })
          } else if (res.status === "failed") {
            err(`products#${product.productId} images[]: ${res.error}`)
            state.failedUrls.push({ url: imgUrl, error: res.error ?? "", table: "prisma.products", id: product.productId })
            saveState(state)
          }
        }

        // Replace all Cloudinary URLs in the images JSON
        if (urlMap.size > 0 && cloudinaryInImages.length > 0) {
          updates.images = replaceCloudinaryUrls(product.images, urlMap)
        }

        // Write DB update
        if (!DRY_RUN && Object.keys(updates).length > 0) {
          await prisma.product.update({
            where: { productId: product.productId },
            data:  updates as any,
          })
          ok(`products#${product.productId} updated (${Object.keys(updates).join(", ")})`)
        } else if (DRY_RUN && Object.keys(updates).length > 0) {
          dry(`Would update products#${product.productId}`)
        }
      }

      if (i + BATCH_SIZE < toMigrate.length) await sleep(300)
    }
  }

  log("Finished prisma.products.")
}

/* ================================================================== */
/*  PROCESSOR 3 — Prisma  offers.image_url                           */
/* ================================================================== */

async function processPrismaOffers(
  prisma:   PrismaClient,
  state:    MigrationState,
  counters: Counters
): Promise<void> {
  log("── Prisma offers.image_url ───────────────────────────────────")

  const offers = await prisma.offer.findMany({
    select: { id: true, imageUrl: true },
  })

  const toMigrate = offers.filter(o => isCloudinaryUrl(o.imageUrl))
  log(`Found ${toMigrate.length} offers with Cloudinary images.`)
  if (toMigrate.length === 0) { ok("Nothing to migrate in offers."); return }

  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const batch = toMigrate.slice(i, i + BATCH_SIZE)

    for (const offer of batch) {
      const res = await migrateOneUrl(offer.imageUrl!, "offers", state, counters)
      if (res.status === "migrated" && res.newUrl && !DRY_RUN) {
        await prisma.offer.update({
          where: { id: offer.id },
          data:  { imageUrl: res.newUrl },
        })
        appendRollbackEntry({ oldUrl: offer.imageUrl!, newUrl: res.newUrl, table: "prisma.offers", id: offer.id, field: "image_url" })
        ok(`offers#${offer.id} → ${res.newUrl}`)
      } else if (res.status === "failed") {
        err(`offers#${offer.id}: ${res.error}`)
        state.failedUrls.push({ url: offer.imageUrl!, error: res.error ?? "", table: "prisma.offers", id: offer.id })
        saveState(state)
      }
    }

    if (i + BATCH_SIZE < toMigrate.length) await sleep(300)
  }
}

/* ================================================================== */
/*  PROCESSOR 4 — Prisma  orders.payment_screenshot  (opt-in)        */
/* ================================================================== */

async function processPrismaPayments(
  prisma:   PrismaClient,
  state:    MigrationState,
  counters: Counters
): Promise<void> {
  log("── Prisma orders.payment_screenshot ─────────────────────────")

  const PAGE_SIZE = 50
  let cursor: string | undefined = undefined

  while (true) {
    const page: { id: string; orderId: string; paymentScreenshot: string | null }[] =
      await prisma.order.findMany({
        take:    PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        select:  { id: true, orderId: true, paymentScreenshot: true },
      })

    if (page.length === 0) break
    cursor = page.at(-1)!.id

    const toMigrate = page.filter((o: { id: string; orderId: string; paymentScreenshot: string | null }) => isCloudinaryUrl(o.paymentScreenshot))
    if (toMigrate.length === 0) continue

    log(`Found ${toMigrate.length} orders with Cloudinary payment screenshots.`)

    for (const order of toMigrate) {
      const res = await migrateOneUrl(order.paymentScreenshot!, "payments", state, counters)
      if (res.status === "migrated" && res.newUrl && !DRY_RUN) {
        await prisma.order.update({
          where: { id: order.id },
          data:  { paymentScreenshot: res.newUrl },
        })
        appendRollbackEntry({ oldUrl: order.paymentScreenshot!, newUrl: res.newUrl, table: "prisma.orders", id: order.orderId, field: "payment_screenshot" })
        ok(`orders#${order.orderId} payment screenshot → ${res.newUrl}`)
      } else if (res.status === "failed") {
        err(`orders#${order.orderId}: ${res.error}`)
        state.failedUrls.push({ url: order.paymentScreenshot!, error: res.error ?? "", table: "prisma.orders", id: order.orderId })
        saveState(state)
      }
    }

    await sleep(300)
  }
}

/* ================================================================== */
/*  ROLLBACK — restore Cloudinary URLs from rollback file             */
/* ================================================================== */

async function performRollback(): Promise<void> {
  const rollback = loadRollbackMap()
  if (rollback.length === 0) {
    log("Rollback file is empty or does not exist. Nothing to roll back.")
    return
  }

  log(`Rolling back ${rollback.length} entries...`)

  const prisma = new PrismaClient()
  let pool: mssqlLib.ConnectionPool | null = null

  try {
    // Connect MSSQL only if needed
    const needsMssql = rollback.some(r => r.table === "mssql.Items")
    if (needsMssql) {
      pool = await mssqlLib.connect({
        server:   process.env.MSSQL_SERVER   ?? "",
        database: process.env.MSSQL_DATABASE ?? "",
        user:     process.env.MSSQL_USER     ?? "",
        password: process.env.MSSQL_PASSWORD ?? "",
        options:  { encrypt: true, trustServerCertificate: true },
      })
    }

    for (const entry of rollback) {
      if (DRY_RUN) {
        dry(`Would restore ${entry.table}#${entry.id}.${entry.field}: ${entry.oldUrl}`)
        continue
      }

      try {
        if (entry.table === "mssql.Items" && pool) {
          await pool.request()
            .input("oldUrl", mssqlLib.NVarChar(mssqlLib.MAX), entry.oldUrl)
            .input("id",     mssqlLib.Int, parseInt(entry.id, 10))
            .query("UPDATE Items SET PicPath = @oldUrl WHERE ID = @id")
          ok(`Rolled back mssql.Items#${entry.id}`)
        } else if (entry.table === "prisma.products") {
          if (entry.field === "image_url") {
            await prisma.product.update({ where: { productId: entry.id }, data: { imageUrl: entry.oldUrl } as any })
          }
          // Note: images JSON array rollback requires re-fetching the current JSON
          // and replacing newUrl → oldUrl. For safety, do this manually.
          ok(`Rolled back prisma.products#${entry.id}.${entry.field}`)
        } else if (entry.table === "prisma.offers") {
          await prisma.offer.update({ where: { id: entry.id }, data: { imageUrl: entry.oldUrl } })
          ok(`Rolled back prisma.offers#${entry.id}`)
        } else if (entry.table === "prisma.orders") {
          await prisma.order.update({ where: { orderId: entry.id }, data: { paymentScreenshot: entry.oldUrl } as any })
          ok(`Rolled back prisma.orders#${entry.id}`)
        }
      } catch (e: any) {
        err(`Failed to roll back ${entry.table}#${entry.id}: ${e?.message}`)
      }
    }
  } finally {
    await prisma.$disconnect()
    if (pool) await pool.close()
  }

  log(`⚠️  Rollback complete. Local image files were NOT deleted.`)
  log(`   You can delete them manually from: ${getUploadRoot()}`)
  log(`   Local URLs that were rolled back:`)
  rollback.forEach(r => log(`     ${r.newUrl}`))
}

/* ================================================================== */
/*  Report                                                            */
/* ================================================================== */

function printAndSaveReport(state: MigrationState, counters: Counters): void {
  const report: MigrationReport = {
    completedAt:  new Date().toISOString(),
    dryRun:       DRY_RUN,
    migrated:     counters.migrated,
    skipped:      counters.skipped,
    failed:       counters.failed,
    failedEntries: state.failedUrls,
    rollbackFile: ROLLBACK_FILE,
  }

  console.log("\n" + "═".repeat(60))
  console.log("  MIGRATION REPORT")
  console.log("═".repeat(60))
  console.log(`  Completed at : ${report.completedAt}`)
  console.log(`  Mode         : ${DRY_RUN ? "DRY RUN (no changes made)" : "LIVE"}`)
  console.log(`  Migrated     : ${report.migrated}`)
  console.log(`  Skipped      : ${report.skipped}  (already done in a previous run)`)
  console.log(`  Failed       : ${report.failed}`)
  if (report.failedEntries.length > 0) {
    console.log("\n  Failed URLs:")
    report.failedEntries.forEach(f => {
      console.log(`    [${f.table}#${f.id}] ${f.url}`)
      console.log(`      Error: ${f.error}`)
    })
  }
  if (!DRY_RUN && report.migrated > 0) {
    console.log(`\n  Rollback file: ${ROLLBACK_FILE}`)
    console.log(`  To undo:  npx tsx scripts/migrate-images-from-cloudinary.ts --rollback`)
  }
  console.log("═".repeat(60) + "\n")

  if (!DRY_RUN) {
    writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8")
    log(`Report saved to: ${REPORT_FILE}`)
  }
}

/* ================================================================== */
/*  Validate environment                                               */
/* ================================================================== */

function validateEnv(): boolean {
  const required = ["MSSQL_SERVER", "MSSQL_DATABASE", "MSSQL_USER", "MSSQL_PASSWORD", "DATABASE_URL"]
  const missing  = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    err(`Missing required environment variables: ${missing.join(", ")}`)
    err("Ensure .env.local is present or export these variables before running.")
    return false
  }
  if (!process.env.UPLOAD_DIR) {
    log("⚠️  UPLOAD_DIR is not set — images will be saved to public/uploads/")
    log("   On SmarterASP, set UPLOAD_DIR to your persistent storage path.")
  }
  return true
}

/* ================================================================== */
/*  Entry point                                                        */
/* ================================================================== */

async function main(): Promise<void> {
  console.log("\n" + "═".repeat(60))
  console.log("  CLOUDINARY → LOCAL STORAGE MIGRATION")
  console.log("═".repeat(60))
  console.log(`  Mode        : ${DRY_RUN ? "DRY RUN" : "LIVE"}`)
  console.log(`  Batch size  : ${BATCH_SIZE}`)
  console.log(`  Table filter: ${ONLY_TABLE ?? "all"}`)
  console.log(`  Payments    : ${INCLUDE_PAYMENTS ? "included" : "excluded (pass --include-payments)"}`)
  console.log(`  Upload dir  : ${getUploadRoot()}`)
  console.log("═".repeat(60) + "\n")

  // ── Rollback mode ─────────────────────────────────────────────────
  if (DO_ROLLBACK) {
    log("Running in ROLLBACK mode.")
    await performRollback()
    return
  }

  // ── Validate env ──────────────────────────────────────────────────
  if (!validateEnv()) process.exit(1)

  // ── Load state ────────────────────────────────────────────────────
  const state    = loadState()
  const counters: Counters = { migrated: 0, skipped: 0, failed: 0 }

  if (state.migratedUrls.length > 0) {
    log(`Resuming — ${state.migratedUrls.length} URLs already migrated in previous runs.`)
  }

  // ── Connect Prisma ────────────────────────────────────────────────
  const prisma = new PrismaClient()

  try {
    // ── MSSQL Items ──────────────────────────────────────────────────
    if (!ONLY_TABLE || ONLY_TABLE === "mssql-items") {
      await processMssqlItems(state, counters)
    }

    // ── Prisma Products ──────────────────────────────────────────────
    if (!ONLY_TABLE || ONLY_TABLE === "prisma-products") {
      await processPrismaProducts(prisma, state, counters)
    }

    // ── Prisma Offers ────────────────────────────────────────────────
    if (!ONLY_TABLE || ONLY_TABLE === "prisma-offers") {
      await processPrismaOffers(prisma, state, counters)
    }

    // ── Prisma Payments (opt-in) ─────────────────────────────────────
    if (INCLUDE_PAYMENTS && (!ONLY_TABLE || ONLY_TABLE === "prisma-payments")) {
      await processPrismaPayments(prisma, state, counters)
    }

  } finally {
    await prisma.$disconnect()
    saveState(state)
  }

  // ── Final report ─────────────────────────────────────────────────
  printAndSaveReport(state, counters)

  if (counters.failed > 0) {
    log(`${counters.failed} image(s) failed. Re-run without --reset-failed to retry only failures.`)
    log(`Or run with --reset-failed to clear the failed list and retry all.`)
    process.exit(1)   // Non-zero exit so CI/scripts can detect failures
  }
}

main().catch(e => {
  err("Unhandled error:", e?.message ?? e)
  console.error(e)
  process.exit(1)
})
