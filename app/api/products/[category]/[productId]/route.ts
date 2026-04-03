import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Product } from "@/lib/models/types"

export const dynamic = "force-dynamic"

// ─── In-memory cache for product detail ───
type CachedEntry = { body: string; expiresAt: number }
const DETAIL_TTL_MS = 300_000 // 5 minutes

const globalForDetail = globalThis as typeof globalThis & {
  _productDetailCache?: Map<string, CachedEntry>
}
const detailCache = globalForDetail._productDetailCache ?? new Map<string, CachedEntry>()
if (!globalForDetail._productDetailCache) {
  globalForDetail._productDetailCache = detailCache
}

const transformProduct = (product: any): Product => {
  const imagesArray = Array.isArray(product.images) ? product.images : []
  const primaryImage = product.imageUrl || product.image_url

  let sizes = product.sizes || []
  if (sizes.length === 0 && product.price) {
    sizes = [{
      size: "Standard",
      volume: "-",
      originalPrice: product.beforeSalePrice || product.price,
      discountedPrice: product.price,
      stockCount: 10
    }]
  }

  return {
    id: product.productId,
    product_id: product.productId,
    name: product.name,
    description: product.description,
    longDescription: product.longDescription,
    price: product.price || 0,
    beforeSalePrice: product.beforeSalePrice,
    afterSalePrice: product.afterSalePrice,
    sizes,
    images: primaryImage
      ? [primaryImage, ...imagesArray.filter((x: any) => x && x !== primaryImage)]
      : imagesArray,
    rating: product.rating || 0,
    reviews: product.reviewCount || 0,
    notes: product.notes || { top: [], middle: [], base: [] },
    category: product.category,
    isNew: product.isNew || false,
    isBestseller: product.isBestseller || false,
    isActive: product.isActive !== false,
    isOutOfStock: product.isOutOfStock || false,
    isGiftPackage: product.isGiftPackage || false,
    packagePrice: product.packagePrice,
    packageOriginalPrice: product.packageOriginalPrice,
    giftPackageSizes: product.giftPackageSizes || [],
    created_at: product.createdAt ? new Date(product.createdAt) : new Date(),
    updated_at: product.updatedAt ? new Date(product.updatedAt) : new Date(),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ category: string; productId: string }> }
) {
  try {
    const { category, productId } = await params
    const cacheKey = `${category}/${productId}`

    // Check in-memory cache first
    const cached = detailCache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) {
      return new NextResponse(cached.body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      })
    }

    const product = await prisma.product.findFirst({
      where: { productId, category, isActive: true },
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const body = JSON.stringify(transformProduct(product))

    // Store in cache
    detailCache.set(cacheKey, { body, expiresAt: Date.now() + DETAIL_TTL_MS })

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (error) {
    console.error("Get product error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
