import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { uploadDataUrlToCloudinary } from "@/lib/cloudinary"
import { isAdminRequest } from "@/lib/erp-items"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 })

    let decoded: any
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!)
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    if (!(await isAdminRequest(request, "canAddProducts")) && !(await isAdminRequest(request, "canEditProducts"))) {
      return NextResponse.json({ error: "Admin access required or insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    const dataUrl = body?.dataUrl
    const productId = body?.productId
    const index = body?.index

    if (!dataUrl || typeof dataUrl !== "string") {
      return NextResponse.json({ error: "dataUrl is required" }, { status: 400 })
    }

    const publicId =
      typeof productId === "string" && productId.trim() !== "" && typeof index === "number"
        ? `${productId}-${index}`
        : undefined

    const url = await uploadDataUrlToCloudinary(dataUrl, "products", publicId)

    return NextResponse.json({ url })
  } catch (error: any) {
    console.error("❌ [API] Error in POST /api/admin/upload-image:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
