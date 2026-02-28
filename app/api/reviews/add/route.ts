import { NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

// Global cache clearing function
const globalForCache = globalThis as typeof globalThis & {
  _productsCache?: Map<string, any>
}

const clearProductsCache = () => {
  const cache = globalForCache._productsCache
  if (cache && cache.size > 0) {
    cache.clear()
    console.log("🗑️ Cleared products list cache")
  }
}

async function calculateAverageRating(productId: string) {
  console.log("🔍 Calculating average rating for productId:", productId)

  // Find all reviews where product_id matches or starts with the productId
  const matchingReviews = await prisma.review.findMany({
    where: {
      OR: [
        { productId: productId },
        { productId: { startsWith: `${productId}-` } },
        { originalProductId: { startsWith: productId } },
      ],
    },
    select: { id: true, rating: true, productId: true, originalProductId: true },
  })

  if (!matchingReviews || matchingReviews.length === 0) {
    console.log("❌ No reviews found, returning 0")
    return 0
  }

  // Deduplicate
  const uniqueReviews = matchingReviews.filter(
    (review, index, self) => index === self.findIndex((r) => r.id === review.id)
  )

  const total = uniqueReviews.reduce((sum, review) => sum + Number(review.rating), 0)
  const averageRating = Math.round((total / uniqueReviews.length) * 100) / 100

  console.log("⭐ Average rating:", averageRating, "from", uniqueReviews.length, "reviews")
  return averageRating
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication
    const token = req.headers.get("authorization")?.split(" ")[1]
    if (!token) {
      return NextResponse.json({ error: "Authorization token missing" }, { status: 401 })
    }

    // 2. Token Verification
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string
      email: string
      name?: string
    }

    // 3. Parse and Validate Request
    const body = await req.json()
    const productId = body.id || body.productId
    if (!productId) {
      return NextResponse.json({ error: "Product identifier is required" }, { status: 400 })
    }

    const orderId = body.orderId || body.order_id
    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 })
    }

    if (body.rating === undefined || body.rating === null) {
      return NextResponse.json({ error: "Rating is required" }, { status: 400 })
    }

    const rating = Number(body.rating)
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 })
    }

    // 4. Verify order exists and is completed
    let orderData = await prisma.order.findFirst({
      where: {
        orderId: orderId,
        userId: decoded.userId,
        status: { in: ["shipped", "delivered"] },
      },
    })

    if (!orderData) {
      orderData = await prisma.order.findFirst({
        where: {
          id: orderId,
          userId: decoded.userId,
          status: { in: ["shipped", "delivered"] },
        },
      })
    }

    if (!orderData) {
      return NextResponse.json({ error: "Order not found or not delivered" }, { status: 400 })
    }

    const items = (orderData.items as any[]) || []
    const item = items.find(
      (i: any) => i.productId === productId || i.id === productId || i.product_id === productId
    )

    if (!item) {
      return NextResponse.json({ error: "Product not found in order" }, { status: 400 })
    }

    if (item.reviewed) {
      return NextResponse.json({ error: "This product has already been reviewed" }, { status: 400 })
    }

    const actualBaseProductId = productId

    // Check if review already exists
    const existingReview = await prisma.review.findFirst({
      where: { productId: actualBaseProductId, userId: decoded.userId, orderId: orderId },
    })

    if (existingReview) {
      return NextResponse.json({ error: "You have already reviewed this product for this order" }, { status: 400 })
    }

    // Verify product exists
    const productRow = await prisma.product.findUnique({
      where: { productId: actualBaseProductId },
      select: { productId: true },
    })

    if (!productRow) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // Get user name
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { name: true },
    })

    // 5. Save Review
    const reviewResult = await prisma.review.create({
      data: {
        productId: actualBaseProductId,
        originalProductId: productId,
        orderId: orderId,
        userId: decoded.userId,
        userName: decoded.name || user?.name || decoded.email,
        rating: rating,
        comment: body.comment || "",
      },
    })

    // 6. Update Order — mark item as reviewed
    const updatedItems = items.map((i: any) => {
      if (i.productId === productId || i.id === productId || i.product_id === productId) {
        return { ...i, reviewed: true, review: { rating, comment: body.comment || "", userName: decoded.name || decoded.email } }
      }
      return i
    })

    await prisma.order.update({
      where: { id: orderData.id },
      data: { items: updatedItems },
    })

    // 7. Update product stats
    clearProductsCache()

    const calculatedRating = await calculateAverageRating(actualBaseProductId)
    const reviewCount = await prisma.review.count({ where: { productId: actualBaseProductId } })

    await prisma.product.update({
      where: { productId: actualBaseProductId },
      data: { rating: calculatedRating, reviewCount },
    })

    return NextResponse.json({
      success: true,
      message: "Review submitted successfully",
      review: {
        productId: actualBaseProductId,
        orderId,
        userId: decoded.userId,
        userName: decoded.name || decoded.email,
        rating,
        comment: body.comment || "",
        originalProductId: productId,
        id: reviewResult.id,
        _id: reviewResult.id,
      },
    })
  } catch (error: any) {
    console.error("Review submission error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
