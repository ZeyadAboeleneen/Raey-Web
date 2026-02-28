import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

async function calculateAverageRating(productId: string) {
  console.log("🔍 Calculating average rating for productId:", productId)

  const matchingReviews = await prisma.review.findMany({
    where: {
      OR: [
        { productId: productId },
        { productId: { startsWith: `${productId}-` } },
        { originalProductId: { startsWith: productId } },
      ],
    },
    select: { id: true, rating: true },
  })

  if (!matchingReviews || matchingReviews.length === 0) {
    console.log("❌ No reviews found, returning 0")
    return { average: 0, count: 0 }
  }

  // Deduplicate by id
  const uniqueReviews = matchingReviews.filter(
    (review, index, self) => index === self.findIndex((r) => r.id === review.id)
  )

  const total = uniqueReviews.reduce((sum, review) => sum + Number(review.rating), 0)
  const average = Math.round((total / uniqueReviews.length) * 100) / 100

  console.log("⭐ Calculated rating:", average, "from", uniqueReviews.length, "reviews")
  return { average, count: uniqueReviews.length }
}

export async function POST(req: NextRequest) {
  try {
    const { productId } = await req.json()

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 })
    }

    const product = await prisma.product.findUnique({
      where: { productId },
      select: { productId: true },
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    console.log("🔄 Recalculating rating for product:", productId)

    const { average: averageRating, count: uniqueReviewsCount } = await calculateAverageRating(productId)

    if (averageRating === 0 && uniqueReviewsCount === 0) {
      return NextResponse.json({
        message: "No reviews found for this product",
        rating: 0,
        reviewCount: 0,
      })
    }

    await prisma.product.update({
      where: { productId },
      data: { rating: averageRating, reviewCount: uniqueReviewsCount },
    })

    console.log("✅ Product updated successfully")

    return NextResponse.json({
      success: true,
      message: "Rating recalculated successfully",
      productId,
      rating: averageRating,
      reviewCount: uniqueReviewsCount,
    })
  } catch (error: any) {
    console.error("Recalculate rating error:", error)
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}
