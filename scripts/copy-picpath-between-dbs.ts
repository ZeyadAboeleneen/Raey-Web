/**
 * copy-picpath-between-dbs.ts
 *
 * Copies PicPath values from the OLD MSSQL database (db_a9c631_raey888)
 * to the NEW MSSQL database (db_a9c631_ms), matching by Item_code.
 *
 * Usage:
 *   npx tsx scripts/copy-picpath-between-dbs.ts            # live run
 *   npx tsx scripts/copy-picpath-between-dbs.ts --dry-run  # preview only
 */

import * as sql from "mssql"
import * as fs from "fs"
import * as path from "path"
import * as dotenv from "dotenv"

// ── Load env files ─────────────────────────────────────────────────────────
dotenv.config({ path: path.resolve(process.cwd(), ".env") })
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true })

const isDryRun = process.argv.includes("--dry-run")

// ── Old database (source) — "wael" ────────────────────────────────────────
const OLD_DB_CONFIG: sql.config = {
  server:   "sql8005.site4now.net",
  database: "db_a9c631_wael",
  user:     "db_a9c631_wael_admin",
  password: "Omarwael3@",
  options: {
    encrypt:              true,
    trustServerCertificate: true,
    connectTimeout:       30000,
    requestTimeout:       30000,
  },
}

// ── New database (destination) ─────────────────────────────────────────────
const NEW_DB_CONFIG: sql.config = {
  server:   process.env.MSSQL_SERVER   || "SQL8006.site4now.net",
  database: process.env.MSSQL_DATABASE || "db_a9c631_ms",
  user:     process.env.MSSQL_USER     || "db_a9c631_ms_admin",
  password: process.env.MSSQL_PASSWORD || "Omarwael2@12",
  options: {
    encrypt:              true,
    trustServerCertificate: true,
    connectTimeout:       30000,
    requestTimeout:       30000,
  },
}

const BATCH_SIZE = 100

// ── Report ─────────────────────────────────────────────────────────────────
interface Report {
  completedAt: string
  mode:        string
  total:       number
  updated:     number
  notFound:    number
  skipped:     number   // already had a non-Cloudinary URL
  failed:      number
  errors:      { code: string; error: string }[]
}

const report: Report = {
  completedAt: "",
  mode:        isDryRun ? "DRY RUN" : "LIVE",
  total:       0,
  updated:     0,
  notFound:    0,
  skipped:     0,
  failed:      0,
  errors:      [],
}

function log(msg: string) {
  const ts = new Date().toTimeString().slice(0, 8)
  console.log(`${ts} ${msg}`)
}

function isCloudinaryUrl(url: string | null | undefined): boolean {
  return !!url && url.includes("cloudinary.com")
}

async function run() {
  console.log(`
════════════════════════════════════════════════════════════
  PicPath Copy: ${OLD_DB_CONFIG.database} → ${NEW_DB_CONFIG.database}
════════════════════════════════════════════════════════════
  Mode        : ${isDryRun ? "DRY RUN (no changes)" : "LIVE"}
  Source      : ${OLD_DB_CONFIG.server} / ${OLD_DB_CONFIG.database}
  Destination : ${NEW_DB_CONFIG.server} / ${NEW_DB_CONFIG.database}
════════════════════════════════════════════════════════════
`)

  // ── Connect to both databases ────────────────────────────────────────────
  log("Connecting to OLD database (source)...")
  const oldPool = await sql.connect(OLD_DB_CONFIG)
  log("✅ Connected to OLD database")

  log("Connecting to NEW database (destination)...")
  const newPool = new sql.ConnectionPool(NEW_DB_CONFIG)
  await newPool.connect()
  log("✅ Connected to NEW database")

  // ── Fetch all items from OLD db that have a PicPath ──────────────────────
  log("Fetching items with PicPath from OLD database...")
  const oldItems = await oldPool.request().query<{ Item_code: string; PicPath: string }>(`
    SELECT Item_code, PicPath
    FROM Items
    WHERE PicPath IS NOT NULL
      AND LEN(LTRIM(RTRIM(PicPath))) > 0
    ORDER BY Item_code
  `)

  const sourceItems = oldItems.recordset
  report.total = sourceItems.length
  log(`Found ${sourceItems.length} items with PicPath in OLD database`)

  if (sourceItems.length === 0) {
    log("⚠️  Nothing to copy. Exiting.")
    await oldPool.close()
    await newPool.close()
    return
  }

  // ── Process in batches ────────────────────────────────────────────────────
  for (let i = 0; i < sourceItems.length; i += BATCH_SIZE) {
    const batch = sourceItems.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(sourceItems.length / BATCH_SIZE)
    log(`\nBatch ${batchNum}/${totalBatches} — processing ${batch.length} items...`)

    for (const item of batch) {
      const { Item_code, PicPath } = item

      try {
        // Check if item exists in new DB
        const existsResult = await newPool.request()
          .input("code", sql.NVarChar(64), Item_code)
          .query<{ ID: number; PicPath: string | null }>(`
            SELECT ID, PicPath FROM Items WHERE Item_code = @code
          `)

        if (existsResult.recordset.length === 0) {
          log(`  ⚠️  [${Item_code}] not found in new DB — skipping`)
          report.notFound++
          continue
        }

        const existingPicPath = existsResult.recordset[0].PicPath

        // Skip if new DB already has a local (/uploads/) URL
        if (existingPicPath && !isCloudinaryUrl(existingPicPath) && existingPicPath.startsWith("/uploads/")) {
          log(`  ⏭️  [${Item_code}] already has local URL — skipping`)
          report.skipped++
          continue
        }

        if (isDryRun) {
          log(`  [DRY-RUN] Would set [${Item_code}] PicPath → ${PicPath}`)
          report.updated++
          continue
        }

        // Update PicPath in new DB
        await newPool.request()
          .input("code",    sql.NVarChar(64),       Item_code)
          .input("picPath", sql.NVarChar(sql.MAX),  PicPath)
          .query(`
            UPDATE Items SET PicPath = @picPath WHERE Item_code = @code
          `)

        log(`  ✅ [${Item_code}] updated`)
        report.updated++

      } catch (err: any) {
        log(`  ❌ [${Item_code}] ERROR: ${err?.message}`)
        report.failed++
        report.errors.push({ code: Item_code, error: err?.message })
      }
    }

    // Small pause between batches
    if (i + BATCH_SIZE < sourceItems.length) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await oldPool.close()
  await newPool.close()

  // ── Final report ──────────────────────────────────────────────────────────
  report.completedAt = new Date().toISOString()

  console.log(`
════════════════════════════════════════════════════════════
  COPY REPORT
════════════════════════════════════════════════════════════
  Completed at : ${report.completedAt}
  Mode         : ${report.mode}
  Total found  : ${report.total}
  Updated      : ${report.updated}
  Not found    : ${report.notFound}  (Item_code missing in new DB)
  Skipped      : ${report.skipped}   (already has local URL)
  Failed       : ${report.failed}
${report.errors.length > 0 ? `
  Errors:
${report.errors.map(e => `    [${e.code}] ${e.error}`).join("\n")}
` : ""}════════════════════════════════════════════════════════════
`)

  const reportPath = path.resolve(process.cwd(), "scripts", "copy-picpath-report.json")
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8")
  log(`Report saved to: ${reportPath}`)
}

run().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
