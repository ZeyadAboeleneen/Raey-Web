import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id || id === "undefined") {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get("orderId")

    const baseProductId = id
    console.log("Base product ID from params:", baseProductId)

    const where: any = {
      OR: [
        { productId: baseProductId },
        { productId: { startsWith: `${baseProductId}-` } },
        { originalProductId: { startsWith: baseProductId } },
      ],
    }

    if (orderId) where.orderId = orderId

    const matchingReviews = await prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })

    console.log(`Found ${matchingReviews.length} reviews matching base ID variations`)

    // Deduplicate
    const uniqueReviews = matchingReviews.filter(
      (review, index, self) => index === self.findIndex((r) => r.id === review.id)
    )

    console.log(`Returning ${uniqueReviews.length} unique reviews for base ID`)

    const serializedReviews = uniqueReviews.map((review) => ({
      _id: review.id,
      id: review.id,
      productId: review.productId,
      originalProductId: review.originalProductId,
      userId: review.userId,
      userName: review.userName,
      rating: review.rating,
      comment: review.comment,
      orderId: review.orderId,
      createdAt: review.createdAt ? new Date(review.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: review.updatedAt ? new Date(review.updatedAt).toISOString() : undefined,
    }))

    return NextResponse.json({ reviews: serializedReviews })
  } catch (error) {
    console.error("Error fetching reviews:", error)
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
  }
}
