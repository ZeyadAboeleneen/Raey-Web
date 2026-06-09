/**
 * /api/admin/cloudinary-sign  — DEPRECATED
 *
 * This endpoint used to generate Cloudinary upload signatures.
 * Images are now uploaded directly to the server via /api/admin/upload-file.
 * Kept here so any cached/old client code receives a clear error instead of a 404.
 */

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Cloudinary upload signing is no longer supported. " +
        "Upload images via POST /api/admin/upload-file instead.",
    },
    { status: 410 } // 410 Gone — intentionally removed
  )
}
