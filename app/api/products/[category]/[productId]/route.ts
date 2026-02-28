import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Product } from "@/lib/models/types"

const transformProduct = (product: any): Product => ({
  id: product.productId,
  product_id: product.productId,
  name: product.name,
  description: product.description,
  longDescription: product.longDescription,
  price: product.price || 0,
  beforeSalePrice: product.beforeSalePrice,
  afterSalePrice: product.afterSalePrice,
  sizes: product.sizes || [],
  images: product.images || [],
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
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ category: string; productId: string }> }
) {
  try {
    const { category, productId } = await params

    const product = await prisma.product.findFirst({
      where: { productId, category, isActive: true },
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    return NextResponse.json(transformProduct(product), {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    })
  } catch (error) {
    console.error("Get product error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
