import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { v2 as cloudinary } from "cloudinary"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Default hero images (fallbacks)
const DEFAULT_SETTINGS = {
  heroImages: {
    wedding: "/wedding.jpg?v=2",
    soiree: "/elraey-bg.PNG",
  },
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

function dataUrlToBuffer(dataUrl: string): Buffer {
  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex === -1) throw new Error("Invalid data URL")
  const meta = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)
  const isBase64 = meta.toLowerCase().includes(";base64")
  return Buffer.from(payload, isBase64 ? "base64" : "utf8")
}

async function uploadBufferToCloudinary(buffer: Buffer, publicId: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "hero-images",
        public_id: publicId,
        overwrite: true,
        resource_type: "image",
        transformation: [{ quality: "auto", fetch_format: "auto" }],
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

// GET - Fetch current settings (public, no auth required)
export async function GET() {
  try {
    const setting = await prisma.siteSetting.findUnique({
      where: { key: "site_settings" }
    })

    if (!setting || !setting.value) {
      return NextResponse.json(DEFAULT_SETTINGS)
    }

    const value = setting.value as any

    return NextResponse.json({
      heroImages: {
        wedding: value.heroImages?.wedding || DEFAULT_SETTINGS.heroImages.wedding,
        soiree: value.heroImages?.soiree || DEFAULT_SETTINGS.heroImages.soiree,
      },
    })
  } catch (error: any) {
    console.error("❌ [API] Error in GET /api/settings:", error)
    // Return defaults on error so the site never breaks
    return NextResponse.json(DEFAULT_SETTINGS)
  }
}

// PUT - Update settings (admin only)
export async function PUT(request: NextRequest) {
  try {
    // Auth check
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 })
    }

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
    const { weddingImage, soireeImage } = body

    const updateData: any = {}

    // Upload wedding hero image if provided as data URL
    if (weddingImage && weddingImage.startsWith("data:")) {
      configureCloudinary()
      const buffer = dataUrlToBuffer(weddingImage)
      const url = await uploadBufferToCloudinary(buffer, `hero-wedding-${Date.now()}`)
      updateData.wedding = url
    } else if (weddingImage) {
      // If it's already a URL, store it directly
      updateData.wedding = weddingImage
    }

    // Upload soiree hero image if provided as data URL
    if (soireeImage && soireeImage.startsWith("data:")) {
      configureCloudinary()
      const buffer = dataUrlToBuffer(soireeImage)
      const url = await uploadBufferToCloudinary(buffer, `hero-soiree-${Date.now()}`)
      updateData.soiree = url
    } else if (soireeImage) {
      updateData.soiree = soireeImage
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No image data provided" }, { status: 400 })
    }

    // Get current settings first to merge them
    const currentSetting = await prisma.siteSetting.findUnique({
      where: { key: "site_settings" }
    })
    
    const currentValue = (currentSetting?.value as any) || {}
    const currentHeroImages = currentValue.heroImages || {}

    const newValue = {
      ...currentValue,
      heroImages: {
        ...currentHeroImages,
        ...updateData
      }
    }

    // Upsert settings
    const updated = await prisma.siteSetting.upsert({
      where: { key: "site_settings" },
      update: {
        value: newValue
      },
      create: {
        key: "site_settings",
        value: newValue
      }
    })

    const resultValue = updated.value as any

    // Clear the Next.js cache for the root layout so the new images show immediately on the frontend
    try {
      const { revalidatePath } = require("next/cache");
      revalidatePath("/", "layout");
    } catch (e) {
      console.warn("Failed to revalidate path:", e);
    }

    return NextResponse.json({
      success: true,
      heroImages: {
        wedding: resultValue.heroImages?.wedding || DEFAULT_SETTINGS.heroImages.wedding,
        soiree: resultValue.heroImages?.soiree || DEFAULT_SETTINGS.heroImages.soiree,
      },
    })
  } catch (error: any) {
    console.error("❌ [API] Error in PUT /api/settings:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
