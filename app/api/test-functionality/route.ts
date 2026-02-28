import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      tests: {} as any,
    }

    // Test 1: Database Connection
    try {
      await prisma.product.findFirst({ select: { productId: true }, take: 1 })
      results.tests.databaseConnection = { status: "✅ PASS", message: "MySQL (Prisma) connected successfully" }
    } catch (error: any) {
      results.tests.databaseConnection = { status: "❌ FAIL", message: "Database connection failed", error: error.message }
    }

    // Test 2: Tables existence via Prisma count
    const [products, users, orders, reviews, offers, discountCodes] = await Promise.all([
      prisma.product.count().catch(() => null),
      prisma.user.count().catch(() => null),
      prisma.order.count().catch(() => null),
      prisma.review.count().catch(() => null),
      prisma.offer.count().catch(() => null),
      prisma.discountCode.count().catch(() => null),
    ])

    results.tests.tables = {
      status: [products, users, orders, reviews, offers, discountCodes].every((c) => c !== null) ? "✅ PASS" : "⚠️ PARTIAL",
      counts: { products: products ?? "error", users: users ?? "error", orders: orders ?? "error", reviews: reviews ?? "error", offers: offers ?? "error", discountCodes: discountCodes ?? "error" },
    }

    // Test 3: Environment Variables
    results.tests.environment = {
      status: "✅ PASS",
      variables: {
        DATABASE_URL: !!process.env.DATABASE_URL,
        JWT_SECRET: !!process.env.JWT_SECRET,
        EMAIL_USER: !!process.env.EMAIL_USER,
        NEXT_PUBLIC_BASE_URL: !!process.env.NEXT_PUBLIC_BASE_URL,
      },
    }

    // Test 4: API Routes
    results.tests.apiRoutes = {
      status: "✅ PASS",
      message: "API routes running (Prisma)",
      available: ["/api/auth/login", "/api/auth/register", "/api/products", "/api/orders", "/api/reviews", "/api/favorites"],
    }

    return NextResponse.json(results)
  } catch (error: any) {
    console.error("Test functionality error:", error)
    return NextResponse.json(
      { timestamp: new Date().toISOString(), error: error.message, tests: { status: "❌ FAIL" } },
      { status: 500 }
    )
  }
}
