import { NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 })

    let decoded: any
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!)
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    if (!decoded.employeeId && decoded.role !== "admin") {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    // 1. Overall Status Counts
    const statusGroups = await (prisma.order.groupBy({
      by: ['paymentStatus'],
      _count: { paymentStatus: true }
    } as any) as Promise<any[]>)
    
    let totalApproved = 0
    let totalRejected = 0
    let totalPendingReview = 0
    
    for (const group of statusGroups) {
      if (group.paymentStatus === "approved") totalApproved = group._count.paymentStatus
      if (group.paymentStatus === "rejected") totalRejected = group._count.paymentStatus
      if (group.paymentStatus === "pending_review") totalPendingReview = group._count.paymentStatus
    }

    // 2. Fraud Severity Breakdown (Top Reasons)
    const fraudReasons = await (prisma.order.groupBy({
      by: ['paymentFraudReason'],
      where: {
        paymentFraudReason: { not: null }
      },
      _count: { paymentFraudReason: true },
      orderBy: { _count: { paymentFraudReason: 'desc' } },
      take: 10
    } as any) as Promise<any[]>)

    // 3. AI Performance (Average Confidence)
    const aiStats = await (prisma.order.aggregate({
      where: { paymentAiConfidence: { not: null } },
      _avg: { paymentAiConfidence: true },
      _count: { paymentAiConfidence: true }
    } as any) as Promise<any>)

    // 4. Revenue Impact
    const revenueStats = await (prisma.order.groupBy({
      by: ['paymentStatus'],
      _sum: { total: true }
    } as any) as Promise<any[]>)

    let revenueApproved = 0
    let revenueRejected = 0
    
    for (const group of revenueStats) {
      if (group.paymentStatus === "approved") revenueApproved = group._sum.total || 0
      if (group.paymentStatus === "rejected") revenueRejected = group._sum.total || 0
    }

    return NextResponse.json({
      success: true,
      data: {
        ratios: { totalApproved, totalRejected, totalPendingReview },
        fraudReasons: fraudReasons.map(r => ({ reason: r.paymentFraudReason, count: r._count.paymentFraudReason })),
        aiPerformance: {
          averageConfidence: aiStats._avg.paymentAiConfidence || 0,
          totalProcessed: aiStats._count.paymentAiConfidence
        },
        revenueImpact: { revenueApproved, revenueRejected }
      }
    })

  } catch (error) {
    console.error("Fraud analytics API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
