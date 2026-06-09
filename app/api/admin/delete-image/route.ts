/**
 * DELETE /api/admin/delete-image
 *
 * Deletes a locally stored image by its relative URL.
 *
 * Body: { url: string }   e.g. { url: "/uploads/products/abc.webp" }
 * Returns: { success: boolean }
 */

import { type NextRequest, NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/erp-items"
import { getImageUploadService } from "@/lib/image-upload-service"

export const runtime = "nodejs"

export async function DELETE(request: NextRequest) {
  try {
    /* ── auth ───────────────────────────────────────────────── */
    if (
      !(await isAdminRequest(request, "canAddProducts")) &&
      !(await isAdminRequest(request, "canEditProducts"))
    ) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const url: string = body?.url

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 })
    }

    // Only allow deleting from our own uploads folder
    if (!url.startsWith("/uploads/")) {
      return NextResponse.json(
        { error: "Can only delete images from /uploads/" },
        { status: 400 }
      )
    }

    const service = getImageUploadService()
    const deleted = await service.deleteImage(url)

    return NextResponse.json({ success: deleted })
  } catch (err: any) {
    console.error("❌ [delete-image] Error:", err?.message)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
