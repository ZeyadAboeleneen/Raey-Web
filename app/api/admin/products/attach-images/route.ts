import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 60

type AttachRequestItem = {
  fileName: string
  url: string
}

type AttachError = {
  fileName: string
  reason: string
}

type ProductLite = {
  productId: string
  name: string
  images: unknown
  imageUrl: string | null
}

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

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
}

function baseName(fileName: string): string {
  const clean = fileName.split(/[\\/]/).pop()?.trim() ?? ""
  const dotIndex = clean.lastIndexOf(".")
  return dotIndex > 0 ? clean.slice(0, dotIndex) : clean
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateAdmin(request)
    if (auth.error) return auth.error

    const body = await request.json()
    const images = Array.isArray(body?.images) ? (body.images as AttachRequestItem[]) : []

    if (images.length === 0) {
      return NextResponse.json({ error: "images array is required" }, { status: 400 })
    }

    const errors: AttachError[] = []

    const products = (await prisma.product.findMany({
      select: {
        productId: true,
        name: true,
        images: true,
        imageUrl: true,
      },
    })) as ProductLite[]

    const exactNameMap = new Map<string, ProductLite>()
    const normalizedNameMap = new Map<string, ProductLite>()

    for (const product of products) {
      exactNameMap.set(product.name, product)
      normalizedNameMap.set(normalizeName(product.name), product)
    }

    const buckets = new Map<string, { product: ProductLite; entries: AttachRequestItem[] }>()

    for (const item of images) {
      if (!item || typeof item.fileName !== "string" || typeof item.url !== "string") {
        errors.push({ fileName: item?.fileName ?? "unknown", reason: "Invalid payload item" })
        continue
      }

      const imageName = baseName(item.fileName)
      let matchedProduct = exactNameMap.get(imageName)
      if (!matchedProduct) {
        matchedProduct = normalizedNameMap.get(normalizeName(imageName))
      }

      if (!matchedProduct) {
        errors.push({ fileName: item.fileName, reason: "No matching product found" })
        continue
      }

      const bucket = buckets.get(matchedProduct.productId) ?? { product: matchedProduct, entries: [] }
      bucket.entries.push(item)
      buckets.set(matchedProduct.productId, bucket)
    }

    let matched = 0
    for (const bucket of buckets.values()) {
      const currentImages = asStringArray(bucket.product.images)
      const merged = currentImages.slice()

      for (const entry of bucket.entries) {
        if (!merged.includes(entry.url)) {
          merged.push(entry.url)
        }
        matched += 1
      }

      try {
        await prisma.product.update({
          where: { productId: bucket.product.productId },
          data: {
            images: merged,
            imageUrl: bucket.product.imageUrl ?? merged[0] ?? null,
          },
        })
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Failed to update product images"
        for (const entry of bucket.entries) {
          errors.push({ fileName: entry.fileName, reason })
        }
      }
    }

    return NextResponse.json({
      totalImages: images.length,
      matched,
      failed: errors.length,
      errors,
    })
  } catch (error: unknown) {
    console.error("❌ [API] Error in POST /api/admin/products/attach-images:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: "Internal server error", details: message }, { status: 500 })
  }
}
