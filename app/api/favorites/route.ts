import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 })

    let decoded: any
    try { decoded = jwt.verify(token, process.env.JWT_SECRET!) } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }) }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { favorites: true },
    })

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const favoriteIds = (user.favorites as string[]) || []

    if (favoriteIds.length === 0) {
      return NextResponse.json([])
    }

    const products = await prisma.product.findMany({
      where: { productId: { in: favoriteIds }, isActive: true },
    })

    const transformProduct = (p: any) => ({
      _id: p.productId, id: p.productId, product_id: p.productId, name: p.name,
      description: p.description, price: p.price || 0, beforeSalePrice: p.beforeSalePrice,
      afterSalePrice: p.afterSalePrice, sizes: p.sizes || [], images: p.images || [],
      rating: p.rating || 0, reviews: p.reviewCount || 0, notes: p.notes,
      branch: p.branch, isNew: p.isNew, isBestseller: p.isBestseller, isActive: p.isActive,
      isOutOfStock: p.isOutOfStock, isGiftPackage: p.isGiftPackage,
      packagePrice: p.packagePrice, packageOriginalPrice: p.packageOriginalPrice,
      giftPackageSizes: p.giftPackageSizes || [],
      image: p.images?.[0] || "/placeholder.svg",
    })

    return NextResponse.json(products.map(transformProduct))
  } catch (error) {
    console.error("Get favorites error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 })

    let decoded: any
    try { decoded = jwt.verify(token, process.env.JWT_SECRET!) } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }) }

    const { productId } = await request.json()
    if (!productId) return NextResponse.json({ error: "Product ID is required" }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { favorites: true } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const favorites = (user.favorites as string[]) || []
    if (!favorites.includes(productId)) {
      favorites.push(productId)
      await prisma.user.update({ where: { id: decoded.userId }, data: { favorites } })
    }

    return NextResponse.json({ success: true, favorites })
  } catch (error) {
    console.error("Add favorite error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 })

    let decoded: any
    try { decoded = jwt.verify(token, process.env.JWT_SECRET!) } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }) }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("productId")
    if (!productId) return NextResponse.json({ error: "Product ID is required" }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { favorites: true } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const favorites = ((user.favorites as string[]) || []).filter((id) => id !== productId)
    await prisma.user.update({ where: { id: decoded.userId }, data: { favorites } })

    return NextResponse.json({ success: true, favorites })
  } catch (error) {
    console.error("Remove favorite error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
