import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { v2 as cloudinary } from "cloudinary"

export const runtime = "nodejs"

function dataUrlToBuffer(dataUrl: string): Buffer {
  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex === -1) throw new Error("Invalid data URL")
  const meta = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)
  const isBase64 = meta.toLowerCase().includes(";base64")
  return Buffer.from(payload, isBase64 ? "base64" : "utf8")
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
}

async function uploadBufferToCloudinary(buffer: Buffer, publicId?: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "products",
        public_id: publicId,
        overwrite: false,
        resource_type: "image",
      },
      (err, result) => {
        if (err) return reject(err)
        const url = (result as any)?.secure_url
        if (!url) return reject(new Error("Cloudinary returned no secure_url"))
        resolve(url)
      }
    )

    stream.end(buffer)
  })
}

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

    if (decoded.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const dataUrl = body?.dataUrl
    const productId = body?.productId
    const index = body?.index

    if (!dataUrl || typeof dataUrl !== "string") {
      return NextResponse.json({ error: "dataUrl is required" }, { status: 400 })
    }

    configureCloudinary()

    const buffer = dataUrlToBuffer(dataUrl)

    const publicId =
      typeof productId === "string" && productId.trim() !== "" && typeof index === "number"
        ? `${productId}-${index}`
        : undefined

    const url = await uploadBufferToCloudinary(buffer, publicId)

    return NextResponse.json({ url })
  } catch (error: any) {
    console.error("❌ [API] Error in POST /api/admin/upload-image:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
