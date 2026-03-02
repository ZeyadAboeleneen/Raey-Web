import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import jwt from "jsonwebtoken"

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
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

    const { products } = await request.json()

    if (!products || !Array.isArray(products)) {
      return NextResponse.json({ error: "Invalid products data" }, { status: 400 })
    }

    const results = await prisma.$transaction(
      products.map((product: any) => {
        const productId = product.id || `product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        
        // Ensure sizes is an array and formatted correctly
        const sizes = Array.isArray(product.sizes) 
          ? product.sizes.map((s: any) => ({
              size: String(s.size || ""),
              volume: String(s.volume || ""),
              originalPrice: s.originalPrice ? Number(s.originalPrice) : undefined,
              discountedPrice: s.discountedPrice ? Number(s.discountedPrice) : undefined,
              stockCount: s.stockCount !== undefined ? Number(s.stockCount) : undefined
            }))
          : []

        return prisma.product.upsert({
          where: { productId: productId },
          update: {
            name: product.name,
            description: product.description,
            longDescription: product.longDescription || "",
            category: product.category,
            images: product.images || ["/placeholder.svg"],
            isActive: product.isActive !== false,
            isNew: product.isNew === true,
            isBestseller: product.isBestseller === true,
            sizes: sizes,
            price: sizes.length > 0 
              ? Math.min(...sizes.map((s: any) => s.discountedPrice || s.originalPrice || 0))
              : 0,
          },
          create: {
            productId,
            name: product.name,
            description: product.description,
            longDescription: product.longDescription || "",
            category: product.category,
            images: product.images || ["/placeholder.svg"],
            isActive: product.isActive !== false,
            isNew: product.isNew === true,
            isBestseller: product.isBestseller === true,
            sizes: sizes,
            price: sizes.length > 0 
              ? Math.min(...sizes.map((s: any) => s.discountedPrice || s.originalPrice || 0))
              : 0,
            rating: 0,
            reviewCount: 0,
            notes: { top: [], middle: [], base: [] }
          }
        })
      })
    )

    return NextResponse.json({ 
      success: true, 
      message: `${results.length} products processed successfully`,
      count: results.length 
    })

  } catch (error) {
    console.error("❌ [API] Error in POST /api/products/bulk:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
