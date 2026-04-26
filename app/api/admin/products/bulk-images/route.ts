import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      error:
        "Deprecated endpoint. Upload directly to Cloudinary from frontend, then call POST /api/admin/products/attach-images.",
    },
    { status: 410 }
  )
}
