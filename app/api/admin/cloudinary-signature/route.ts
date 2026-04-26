import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { v2 as cloudinary } from "cloudinary"

export const runtime = "nodejs"

function authenticateAdmin(request: NextRequest): { error?: NextResponse } {
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: NextResponse.json({ error: "Authorization required" }, { status: 401 }) }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { role?: string }
    if (decoded.role !== "admin") {
      return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
    }
    return {}
  } catch {
    return { error: NextResponse.json({ error: "Invalid token" }, { status: 401 }) }
  }
}

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary env vars missing")
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  })

  return { cloudName, apiKey, apiSecret }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateAdmin(request)
    if (auth.error) return auth.error

    const { folder } = (await request.json().catch(() => ({ folder: "products" }))) as {
      folder?: string
    }

    const { cloudName, apiKey, apiSecret } = configureCloudinary()
    const timestamp = Math.round(Date.now() / 1000)
    const safeFolder = folder?.trim() || "products"
    const signature = cloudinary.utils.api_sign_request({ timestamp, folder: safeFolder }, apiSecret)

    return NextResponse.json({
      timestamp,
      signature,
      apiKey,
      cloudName,
      folder: safeFolder,
    })
  } catch (error: unknown) {
    console.error("❌ [API] Error in POST /api/admin/cloudinary-signature:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: "Internal server error", details: message }, { status: 500 })
  }
}
