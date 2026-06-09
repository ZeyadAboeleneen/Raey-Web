/**
 * GET /uploads/[...path]
 *
 * Dynamic file server for locally stored uploads.
 *
 * Reads from:
 *   UPLOAD_DIR env var  (production — path outside deployment folder)
 *   <cwd>/public/uploads  (development fallback)
 *
 * Security:
 *   - Path-traversal blocked: resolved path must stay inside upload root.
 *   - Only .webp / .jpg / .jpeg / .png served; all other extensions → 404.
 *   - Directory listings blocked: only file paths are resolved.
 *
 * Caching:
 *   - GUID filenames never change content → 1-year immutable cache.
 *   - ETag + Last-Modified headers for conditional GET support.
 *   - 304 Not Modified returned when If-None-Match matches.
 */

import { type NextRequest, NextResponse } from "next/server"
import path from "path"
import fs   from "fs/promises"
import { statSync } from "fs"

export const runtime = "nodejs"

/* ── MIME map — only these types will be served ─────────────────────── */
const MIME: Record<string, string> = {
  webp: "image/webp",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  png:  "image/png",
}

/* ── upload root ─────────────────────────────────────────────────────── */
function uploadRoot(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads")
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  /* ── 1. Resolve and sanitise path ───────────────────────────────── */
  const root   = path.resolve(uploadRoot())
  const joined = path.resolve(path.join(root, ...params.path))

  // Block path-traversal: resolved path must start with root + separator
  if (!joined.startsWith(root + path.sep) && joined !== root) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  /* ── 2. Extension whitelist ─────────────────────────────────────── */
  const ext         = path.extname(joined).slice(1).toLowerCase()
  const contentType = MIME[ext]
  if (!contentType) {
    // Return 404 (not 403) to not hint that the file exists
    return new NextResponse("Not Found", { status: 404 })
  }

  /* ── 3. Stat the file ───────────────────────────────────────────── */
  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(joined)
    if (!stat.isFile()) return new NextResponse("Not Found", { status: 404 })
  } catch {
    return new NextResponse("Not Found", { status: 404 })
  }

  /* ── 4. Conditional GET (ETag / If-None-Match) ──────────────────── */
  // ETag based on mtime + size — cheap to compute, no file read needed
  const etag           = `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`
  const ifNoneMatch    = request.headers.get("if-none-match")
  if (ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        "ETag":          etag,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  }

  /* ── 5. Read and return ─────────────────────────────────────────── */
  try {
    const buffer = await fs.readFile(joined)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":   contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control":  "public, max-age=31536000, immutable",
        "ETag":           etag,
        "Last-Modified":  new Date(stat.mtimeMs).toUTCString(),
      },
    })
  } catch (err: any) {
    if (err?.code === "ENOENT") return new NextResponse("Not Found",            { status: 404 })
    if (err?.code === "EACCES") return new NextResponse("Forbidden",            { status: 403 })
    console.error("[uploads route] Error reading file:", joined, err?.message)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
