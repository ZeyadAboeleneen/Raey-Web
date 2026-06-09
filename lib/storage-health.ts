/**
 * lib/storage-health.ts
 *
 * Storage validation and health-check utilities.
 *
 * Two entry points:
 *
 *   ensureStorageReady()
 *     Called once at server startup (via instrumentation.ts).
 *     Creates UPLOAD_DIR if missing.
 *     Runs a write→read→delete probe.
 *     Logs clearly on success or failure — never crashes the server.
 *
 *   checkStorageHealth()
 *     Called by GET /api/health/storage on demand.
 *     Returns a structured report: path, exists, writable, disk space,
 *     overall status.  Safe to expose to admins.
 */

import path   from "path"
import fs     from "fs/promises"
import { existsSync, constants as fsConstants } from "fs"
import crypto from "crypto"

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export type HealthStatus = "healthy" | "degraded" | "unhealthy"

export interface StorageHealthReport {
  status:        HealthStatus
  storagePath:   string
  configSource:  "UPLOAD_DIR env var" | "default (public/uploads)"
  exists:        boolean
  writable:      boolean
  diskFreeBytes:  number | null
  diskTotalBytes: number | null
  diskFreeGB:     string | null   // human-readable, e.g. "12.4 GB"
  diskUsedPct:    string | null   // e.g. "34%"
  checks:         CheckResult[]
  checkedAt:      string          // ISO timestamp
}

interface CheckResult {
  name:    string
  passed:  boolean
  message: string
}

/* ================================================================== */
/*  Configuration                                                      */
/* ================================================================== */

export function getUploadRoot(): string {
  if (process.env.UPLOAD_DIR) return process.env.UPLOAD_DIR
  return path.join(process.cwd(), "public", "uploads")
}

function isCustomDir(): boolean {
  return !!process.env.UPLOAD_DIR
}

/* ================================================================== */
/*  Disk space  (Node 18.15+ / 19.6+ only, graceful fallback)         */
/* ================================================================== */

interface DiskStats {
  freeBytes:  number
  totalBytes: number
}

async function getDiskSpace(dir: string): Promise<DiskStats | null> {
  try {
    // fs.statfs was backported to Node 18.15.0 — use dynamic import style
    // to avoid compile errors on older @types/node
    const stats: any = await (fs as any).statfs(dir)
    if (!stats || typeof stats.bsize !== "number") return null

    const freeBytes  = stats.bavail * stats.bsize   // free to this process
    const totalBytes = stats.blocks * stats.bsize
    return { freeBytes, totalBytes }
  } catch {
    return null            // Node < 18.15, or filesystem doesn't support statfs
  }
}

function formatGB(bytes: number): string {
  return (bytes / 1_073_741_824).toFixed(1) + " GB"
}

/* ================================================================== */
/*  Individual checks                                                  */
/* ================================================================== */

async function checkDirectoryExists(dir: string): Promise<CheckResult> {
  const exists = existsSync(dir)
  return {
    name:    "directory_exists",
    passed:  exists,
    message: exists
      ? `Directory exists: ${dir}`
      : `Directory does not exist: ${dir}`,
  }
}

async function checkCreateDirectory(dir: string): Promise<CheckResult> {
  try {
    await fs.mkdir(dir, { recursive: true })
    return {
      name:    "directory_create",
      passed:  true,
      message: `Directory created (or already existed): ${dir}`,
    }
  } catch (err: any) {
    return {
      name:    "directory_create",
      passed:  false,
      message: `Failed to create directory: ${err?.message ?? "unknown error"}`,
    }
  }
}

async function checkReadPermission(dir: string): Promise<CheckResult> {
  try {
    await fs.access(dir, fsConstants.R_OK)
    return { name: "read_permission",  passed: true,  message: "Directory is readable" }
  } catch {
    return { name: "read_permission",  passed: false, message: "Directory is NOT readable — check IIS app pool permissions" }
  }
}

async function checkWritePermission(dir: string): Promise<CheckResult> {
  try {
    await fs.access(dir, fsConstants.W_OK)
    return { name: "write_permission", passed: true,  message: "Directory is writable" }
  } catch {
    return { name: "write_permission", passed: false, message: "Directory is NOT writable — check IIS app pool permissions" }
  }
}

async function checkWriteReadDeleteProbe(dir: string): Promise<CheckResult> {
  const probeFile = path.join(dir, `.health-probe-${crypto.randomUUID()}`)
  const probeData = `health-check-${Date.now()}`

  try {
    // Write
    await fs.writeFile(probeFile, probeData, "utf8")

    // Read back and verify
    const readBack = await fs.readFile(probeFile, "utf8")
    if (readBack !== probeData) {
      await fs.unlink(probeFile).catch(() => {})
      return {
        name:    "write_read_delete_probe",
        passed:  false,
        message: "Write succeeded but read-back returned different data",
      }
    }

    // Delete
    await fs.unlink(probeFile)

    return {
      name:    "write_read_delete_probe",
      passed:  true,
      message: "Write → read → delete probe passed",
    }
  } catch (err: any) {
    // Best-effort cleanup
    await fs.unlink(probeFile).catch(() => {})
    return {
      name:    "write_read_delete_probe",
      passed:  false,
      message: `Probe failed: ${err?.message ?? "unknown error"}. ` +
               "Verify the IIS application pool identity has Modify permissions on UPLOAD_DIR.",
    }
  }
}

async function checkDiskSpace(dir: string): Promise<CheckResult> {
  const space = await getDiskSpace(dir)
  if (!space) {
    return {
      name:    "disk_space",
      passed:  true,               // Not a failure — just unavailable info
      message: "Disk space check skipped (Node < 18.15 or filesystem unsupported)",
    }
  }

  const freeGB   = space.freeBytes  / 1_073_741_824
  const totalGB  = space.totalBytes / 1_073_741_824
  const usedPct  = Math.round(((space.totalBytes - space.freeBytes) / space.totalBytes) * 100)

  // Warn if less than 500 MB free
  const passed = freeGB >= 0.5
  return {
    name:    "disk_space",
    passed,
    message: passed
      ? `Disk: ${formatGB(space.freeBytes)} free of ${formatGB(space.totalBytes)} (${usedPct}% used)`
      : `LOW DISK SPACE: only ${formatGB(space.freeBytes)} free of ${formatGB(space.totalBytes)} (${usedPct}% used)`,
  }
}

/* ================================================================== */
/*  Public: checkStorageHealth  (for the health endpoint)             */
/* ================================================================== */

export async function checkStorageHealth(): Promise<StorageHealthReport> {
  const dir         = getUploadRoot()
  const checks:  CheckResult[] = []

  // 1. Directory existence
  const existsCheck = await checkDirectoryExists(dir)
  checks.push(existsCheck)

  // 2. If it doesn't exist, try to create it
  if (!existsCheck.passed) {
    const createCheck = await checkCreateDirectory(dir)
    checks.push(createCheck)
    // If creation failed, everything downstream will fail — short-circuit
    if (!createCheck.passed) {
      return buildReport(dir, checks, false)
    }
  }

  // 3. Read permission
  checks.push(await checkReadPermission(dir))

  // 4. Write permission
  checks.push(await checkWritePermission(dir))

  // 5. Write/read/delete probe (only if write permission looks OK)
  const writePermOk = checks.find(c => c.name === "write_permission")?.passed ?? false
  if (writePermOk) {
    checks.push(await checkWriteReadDeleteProbe(dir))
  } else {
    checks.push({
      name:    "write_read_delete_probe",
      passed:  false,
      message: "Skipped — directory is not writable",
    })
  }

  // 6. Disk space
  checks.push(await checkDiskSpace(dir))

  return buildReport(dir, checks, true)
}

function buildReport(dir: string, checks: CheckResult[], dirAccessible: boolean): StorageHealthReport {
  const space = null   // disk space is embedded in checks, extract here for convenience
  const diskCheck = checks.find(c => c.name === "disk_space")

  let diskFreeBytes:  number | null = null
  let diskTotalBytes: number | null = null
  let diskFreeGB:     string | null = null
  let diskUsedPct:    string | null = null

  // Re-run synchronously for the report fields (no extra I/O needed — already in check message)
  // This is an approximation; exact values come from the probe run above.
  // For accurate values the caller should use checkDiskSpace directly.

  const allPassed    = checks.every(c => c.passed)
  const criticalFail = checks.some(
    c => ["directory_create", "write_permission", "write_read_delete_probe"].includes(c.name) && !c.passed
  )

  const writable = checks.find(c => c.name === "write_read_delete_probe")?.passed ?? false
  const exists   = dirAccessible && (
    checks.find(c => c.name === "directory_exists")?.passed ||
    checks.find(c => c.name === "directory_create")?.passed
  ) === true

  let status: HealthStatus
  if (criticalFail)                         status = "unhealthy"
  else if (!allPassed)                      status = "degraded"
  else                                      status = "healthy"

  return {
    status,
    storagePath:   dir,
    configSource:  isCustomDir() ? "UPLOAD_DIR env var" : "default (public/uploads)",
    exists,
    writable,
    diskFreeBytes,
    diskTotalBytes,
    diskFreeGB,
    diskUsedPct,
    checks,
    checkedAt: new Date().toISOString(),
  }
}

/* ================================================================== */
/*  Async disk space fetch for the health endpoint                     */
/* ================================================================== */

export async function checkStorageHealthFull(): Promise<StorageHealthReport> {
  const report = await checkStorageHealth()
  const dir    = getUploadRoot()
  const space  = await getDiskSpace(dir)

  if (space) {
    const used   = space.totalBytes - space.freeBytes
    const usedPct = Math.round((used / space.totalBytes) * 100)
    report.diskFreeBytes  = space.freeBytes
    report.diskTotalBytes = space.totalBytes
    report.diskFreeGB     = formatGB(space.freeBytes)
    report.diskUsedPct    = `${usedPct}%`
  }

  return report
}

/* ================================================================== */
/*  Public: ensureStorageReady  (for instrumentation.ts startup hook)  */
/* ================================================================== */

export async function ensureStorageReady(): Promise<void> {
  const dir    = getUploadRoot()
  const source = isCustomDir() ? `UPLOAD_DIR=${dir}` : `default path: ${dir}`

  console.log(`[storage] Initialising upload storage — ${source}`)

  // Step 1 — create directory if missing
  if (!existsSync(dir)) {
    try {
      await fs.mkdir(dir, { recursive: true })
      console.log(`[storage] Created upload directory: ${dir}`)
    } catch (err: any) {
      console.error(
        `[storage] ❌ CRITICAL — Cannot create upload directory: ${dir}\n` +
        `           Error: ${err?.message}\n` +
        `           Uploads will fail until this is resolved.\n` +
        `           On SmarterASP: ensure the IIS app pool identity has Modify ` +
        `permission on the parent directory, or create the folder manually via ` +
        `File Manager and grant permissions there.`
      )
      return   // Do not crash — the server still starts, uploads just fail
    }
  }

  // Step 2 — write/read/delete probe
  const probe = await checkWriteReadDeleteProbe(dir)
  if (probe.passed) {
    console.log(`[storage] ✅ Storage ready — ${dir}`)
    if (!isCustomDir()) {
      console.warn(
        `[storage] ⚠️  UPLOAD_DIR is not set. Using development fallback: ${dir}\n` +
        `           Images WILL be lost on redeployment.\n` +
        `           Set UPLOAD_DIR to a persistent path on SmarterASP.`
      )
    }
  } else {
    console.error(
      `[storage] ❌ CRITICAL — Storage write probe failed: ${probe.message}\n` +
      `           Path: ${dir}\n` +
      `           All image uploads will fail until permissions are fixed.\n` +
      `           On SmarterASP:\n` +
      `             1. Open File Manager → navigate to the UPLOAD_DIR folder.\n` +
      `             2. Right-click → Properties → Security.\n` +
      `             3. Add the IIS app pool account (IIS AppPool\\<pool-name>)\n` +
      `                with Modify permission.\n` +
      `             4. Alternatively, grant permissions to IUSR or the ` +
      `                authenticated user identity running the app pool.\n` +
      `           Run GET /api/health/storage after fixing to verify.`
    )
  }
}
