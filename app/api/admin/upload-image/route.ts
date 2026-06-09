/**
 * POST /api/admin/upload-image
 *
 * Base64 data-URL image upload — used by the single-product add/edit pages.
 *
 * Body: { dataUrl: string, folder?: string, productId?: string, index?: number }
 *
 * Returns:
 *   200  { url: string }
 *   400  bad request
 *   401  not authenticated
 *   403  not admin
 *   413  payload too large
 *   415  unsupported file type
 *   429  rate limit exceeded  { error, retryAfterSeconds }
 *   503  storage unavailable
 */

import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { isAdminRequest }           from "@/lib/erp-items"
import { getImageUploadService, ImageUploadError } from "@/lib/image-upload-service"
import { checkRateLimit, getClientIp }             from "@/lib/upload-rate-limiter"

export const runtime = "nodejs"

// Base64 overhead ≈ 33 % — a 20 MB image becomes ~27 MB as base64
const MAX_DATA_URL_BYTES =
  Math.ceil((parseInt(process.env.UPLOAD_MAX_BYTES ?? "", 10) || 20 * 1024 * 1024) * 1.4)

export async function POST(request: NextRequest) {
  /* ── 1. Auth ──────────────────────────────────────────────────── */
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 })

  try {
    jwt.verify(token, process.env.JWT_SECRET!)
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
  }

  if (
    !(await isAdminRequest(request, "canAddProducts")) &&
    !(await isAdminRequest(request, "canEditProducts"))
  ) {
    return NextResponse.json(
      { error: "Admin access required or insufficient permissions" },
      { status: 403 }
    )
  }

  /* ── 2. Rate limit ────────────────────────────────────────────── */
  const ip = getClientIp(request)
  const rl = checkRateLimit(ip)
  if (!rl.allowed) {
    console.warn(`[upload-image] Rate limit exceeded — IP: ${ip}, retry after ${rl.retryAfterSeconds}s`)
    return NextResponse.json(
      {
        error:             "Too many upload requests. Please slow down.",
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      {
        status:  429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    )
  }

  /* ── 3. Content-Length pre-check ─────────────────────────────── */
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > 0 && contentLength > MAX_DATA_URL_BYTES) {
    return NextResponse.json(
      { error: `Request body too large. Maximum allowed is ${MAX_DATA_URL_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    )
  }

  /* ── 4. Parse body ────────────────────────────────────────────── */
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const dataUrl: string = body?.dataUrl
  const folder = String(body?.folder || "products").toLowerCase().trim()

  if (!dataUrl || typeof dataUrl !== "string") {
    return NextResponse.json({ error: "dataUrl is required" }, { status: 400 })
  }

  // Reject implausibly large data URLs before passing to service
  if (Buffer.byteLength(dataUrl, "utf8") > MAX_DATA_URL_BYTES) {
    return NextResponse.json(
      { error: `Image data too large. Maximum allowed size is ${MAX_DATA_URL_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    )
  }

  /* ── 5. Process and save ──────────────────────────────────────── */
  try {
    const service = getImageUploadService()
    const result  = await service.uploadFromDataUrl(dataUrl, folder)

    return NextResponse.json({ url: result.url }, {
      headers: { "X-RateLimit-Remaining": String(rl.remainingMinute) },
    })
  } catch (err: any) {
    if (err instanceof ImageUploadError) {
      console.warn(`[upload-image] Upload rejected (${err.code}): ${err.message}`)
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus })
    }

    console.error("[upload-image] Unexpected error:", err?.message, err?.stack)
    return NextResponse.json({ error: "Internal server error during upload" }, { status: 500 })
  }
}
