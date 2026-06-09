/**
 * GET /api/health/storage
 *
 * Returns a full storage health report.
 * Admin-auth required — do not expose this publicly.
 *
 * Response shape:
 * {
 *   status:        "healthy" | "degraded" | "unhealthy"
 *   storagePath:   string        // physical path on disk
 *   configSource:  string        // "UPLOAD_DIR env var" | "default (public/uploads)"
 *   exists:        boolean
 *   writable:      boolean
 *   diskFreeBytes:  number | null
 *   diskTotalBytes: number | null
 *   diskFreeGB:     string | null  // "12.4 GB"
 *   diskUsedPct:    string | null  // "34%"
 *   checks:  [{ name, passed, message }]
 *   checkedAt: string              // ISO timestamp
 * }
 *
 * HTTP status codes:
 *   200  healthy or degraded (degraded = non-fatal issues, e.g. low disk space)
 *   503  unhealthy (directory not writable — uploads will fail)
 *   401/403  not authenticated / not admin
 */

import { type NextRequest, NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/erp-items"
import { checkStorageHealthFull } from "@/lib/storage-health"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"   // Never cache — always live data

export async function GET(request: NextRequest) {
  /* ── auth ─────────────────────────────────────────────────────── */
  // Allow any admin role — this is read-only diagnostic info
  const isAdmin =
    (await isAdminRequest(request, "canAddProducts"))  ||
    (await isAdminRequest(request, "canEditProducts")) ||
    (await isAdminRequest(request, "canViewOrders"))

  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  /* ── run health check ────────────────────────────────────────── */
  try {
    const report = await checkStorageHealthFull()

    const httpStatus = report.status === "unhealthy" ? 503 : 200

    return NextResponse.json(report, { status: httpStatus })
  } catch (err: any) {
    console.error("[health/storage] Unexpected error:", err?.message)
    return NextResponse.json(
      {
        status:      "unhealthy",
        error:       "Health check threw an unexpected error",
        detail:      err?.message ?? "unknown",
        checkedAt:   new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
