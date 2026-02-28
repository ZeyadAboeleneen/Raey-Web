import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  console.log("🧪 [API] Database test endpoint called")

  try {
    // Test basic connection
    const [users, products, orders, reviews, offers, discountCodes] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.order.count(),
      prisma.review.count(),
      prisma.offer.count(),
      prisma.discountCode.count(),
    ])

    const activeProducts = await prisma.product.count({ where: { isActive: true } })
    const sampleProducts = await prisma.product.findMany({
      where: { isActive: true },
      select: { productId: true, name: true, category: true, price: true },
      take: 3,
    })

    return NextResponse.json({
      success: true,
      database: "MySQL (Prisma)",
      timestamp: new Date().toISOString(),
      tests: {
        connection: true,
        tables: { users, products, orders, reviews, offers, discount_codes: discountCodes },
        queries: {
          products: { stats: { total: products, active: activeProducts }, samples: sampleProducts },
          orders: { total: orders },
          users: { total: users },
        },
      },
    })
  } catch (error: any) {
    console.error("❌ [API] Database test failed:", error)
    return NextResponse.json({ success: false, error: "Database test failed", details: error.message, timestamp: new Date().toISOString() }, { status: 500 })
  }
}
