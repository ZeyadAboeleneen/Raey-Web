import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("productId")
    const token = request.headers.get("authorization")?.replace("Bearer ", "")

    // Build where clause
    const where: any = {}
    if (productId) where.productId = productId

    const reviews = await prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({
      reviews: reviews.map((r) => ({
        _id: r.id,
        id: r.id,
        productId: r.productId,
        userId: r.userId,
        userName: r.userName,
        rating: r.rating,
        comment: r.comment,
        orderId: r.orderId,
        createdAt: r.createdAt,
      })),
    })
  } catch (error) {
    console.error("Get reviews error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 })

    let decoded: any
    try { decoded = jwt.verify(token, process.env.JWT_SECRET!) } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }) }

    const { productId, rating, comment } = await request.json()

    if (!productId || rating === undefined) {
      return NextResponse.json({ error: "Product ID and rating are required" }, { status: 400 })
    }

    const product = await prisma.product.findUnique({ where: { productId }, select: { productId: true } })
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { name: true, email: true },
    })

    const review = await prisma.review.create({
      data: {
        productId,
        userId: decoded.userId,
        userName: user?.name || decoded.email,
        rating: Number(rating),
        comment: comment || "",
        orderId: "direct",
      },
    })

    // Update product rating
    const allReviews = await prisma.review.findMany({
      where: { productId },
      select: { rating: true },
    })
    const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
    await prisma.product.update({
      where: { productId },
      data: { rating: Math.round(avg * 100) / 100, reviewCount: allReviews.length },
    })

    return NextResponse.json({ success: true, review: { ...review, _id: review.id } })
  } catch (error) {
    console.error("Create review error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
