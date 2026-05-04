import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { uploadDataUrlToCloudinary } from "@/lib/cloudinary"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Default hero images (fallbacks)
const DEFAULT_SETTINGS = {
  heroImages: {
    wedding: "/wedding.jpg?v=2",
    soiree: "/elraey-bg.PNG",
  },
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
      const url = await uploadDataUrlToCloudinary(weddingImage, "hero-images", `hero-wedding-${Date.now()}`)
      updateData.wedding = url
    } else if (weddingImage) {
      // If it's already a URL, store it directly
      updateData.wedding = weddingImage
    }

    // Upload soiree hero image if provided as data URL
    if (soireeImage && soireeImage.startsWith("data:")) {
      const url = await uploadDataUrlToCloudinary(soireeImage, "hero-images", `hero-soiree-${Date.now()}`)
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
