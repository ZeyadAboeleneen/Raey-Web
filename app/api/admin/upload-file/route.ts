/**
 * POST /api/admin/upload-file
 *
 * Multipart image upload endpoint — used by the bulk-upload client.
 *
 * Form fields:
 *   file   — the image File (jpg / jpeg / png / webp)
 *   folder — target sub-folder, default "products"
 *
 * Returns:
 *   200  { url: string, fileName: string, fileSize: number }
 *   400  bad request (missing file, invalid folder)
 *   401  not authenticated
 *   403  not admin
 *   413  file too large
 *   415  unsupported file type
 *   429  rate limit exceeded  { error, retryAfterSeconds }
 *   503  storage unavailable
 */

import { type NextRequest, NextResponse } from "next/server"
import { isAdminRequest }           from "@/lib/erp-items"
import { getImageUploadService, ImageUploadError } from "@/lib/image-upload-service"
import { checkRateLimit, getClientIp }             from "@/lib/upload-rate-limiter"

export const runtime    = "nodejs"
export const maxDuration = 60

// ── file size guard (reject before reading into memory) ──────────────
const MAX_CONTENT_LENGTH = parseInt(process.env.UPLOAD_MAX_BYTES ?? "", 10) || 20 * 1024 * 1024

export async function POST(request: NextRequest) {
  /* ── 1. Auth ──────────────────────────────────────────────────── */
  if (
    !(await isAdminRequest(request, "canAddProducts")) &&
    !(await isAdminRequest(request, "canEditProducts"))
  ) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  /* ── 2. Rate limit ────────────────────────────────────────────── */
  const ip     = getClientIp(request)
  const rl     = checkRateLimit(ip)
  if (!rl.allowed) {
    console.warn(`[upload-file] Rate limit exceeded — IP: ${ip}, retry after ${rl.retryAfterSeconds}s`)
    return NextResponse.json(
      {
        error:              "Too many upload requests. Please slow down.",
        retryAfterSeconds:  rl.retryAfterSeconds,
      },
      {
        status:  429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    )
  }

  /* ── 3. Content-Length pre-check (fast-fail before reading body) ─ */
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > 0 && contentLength > MAX_CONTENT_LENGTH * 1.1) {
    // Allow 10% overhead for form-data boundary bytes
    return NextResponse.json(
      { error: `File too large. Maximum allowed size is ${MAX_CONTENT_LENGTH / 1024 / 1024} MB.` },
      { status: 413 }
    )
  }

  /* ── 4. Parse multipart form ──────────────────────────────────── */
  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err: any) {
    console.error("[upload-file] formData parse error:", err?.message)
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 })
  }

  const file   = formData.get("file")
  const folder = String(formData.get("folder") || "products").toLowerCase().trim()

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided in form field 'file'" }, { status: 400 })
  }

  /* ── 5. Extension pre-check (fast, before reading bytes) ─────── */
  const lastDot = file.name.lastIndexOf(".")
  const ext     = lastDot !== -1 ? file.name.slice(lastDot).toLowerCase() : ""
  const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"])
  if (!ALLOWED_EXTS.has(ext)) {
    return NextResponse.json(
      { error: `File type not allowed: "${ext || "(none)"}". Allowed: .jpg .jpeg .png .webp` },
      { status: 415 }
    )
  }

  /* ── 6. Read buffer ───────────────────────────────────────────── */
  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch (err: any) {
    console.error("[upload-file] arrayBuffer error:", err?.message)
    return NextResponse.json({ error: "Failed to read file data" }, { status: 400 })
  }

  /* ── 7. Process and save ──────────────────────────────────────── */
  try {
    const service = getImageUploadService()
    const result  = await service.uploadBuffer(buffer, folder)

    return NextResponse.json(result, {
      headers: { "X-RateLimit-Remaining": String(rl.remainingMinute) },
    })
  } catch (err: any) {
    if (err instanceof ImageUploadError) {
      console.warn(`[upload-file] Upload rejected (${err.code}): ${err.message}`)
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus })
    }

    console.error("[upload-file] Unexpected error:", err?.message, err?.stack)
    return NextResponse.json({ error: "Internal server error during upload" }, { status: 500 })
  }
}
