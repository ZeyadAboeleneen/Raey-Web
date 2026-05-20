import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { deleteImageFromCloudinary } from "@/lib/cloudinary"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    // 0. Protect Endpoint (Supports Authorization header or ?secret=... query parameter for easy setup on SmarterASP.NET / Contabo)
    const authHeader = request.headers.get("authorization")
    const url = new URL(request.url)
    const querySecret = url.searchParams.get("secret")
    const cronSecret = process.env.CRON_SECRET

    if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()
    
    // ==========================================
    // STAGE 1: SOFT EXPIRE (> 24 hours pending)
    // ==========================================
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    // Find orders that are pending (no AI worker got to them, or awaiting payment)
    const stalePending = await prisma.order.findMany({
      where: {
        paymentStatus: "pending",
        createdAt: { lt: oneDayAgo }
      } as any,
      take: 50 // process in batches
    })

    let softExpiredCount = 0
    for (const order of stalePending) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "expired",
          paymentStatus: "rejected", // we reject it so the AI/admin ignores it
          paymentFraudReason: "Auto-expired after 24 hours of inactivity"
        } as any
      })
      softExpiredCount++
    }

    // ==========================================
    // STAGE 2: HARD PURGE (> 30 days expired/rejected)
    // ==========================================
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    
    const ancientOrders = await prisma.order.findMany({
      where: {
        paymentStatus: "rejected",
        createdAt: { lt: thirtyDaysAgo }
      } as any,
      take: 20
    })

    let hardPurgedCount = 0
    for (const order of ancientOrders) {
      // 1. Delete from Cloudinary if screenshot exists
      if (order.paymentScreenshot && order.paymentScreenshot.startsWith("http")) {
        await deleteImageFromCloudinary(order.paymentScreenshot)
      }

      // 2. Hard delete from Database
      await prisma.order.delete({
        where: { id: order.id }
      })
      
      hardPurgedCount++
    }

    return NextResponse.json({ 
      success: true, 
      softExpiredCount,
      hardPurgedCount,
      message: "Cleanup completed successfully" 
    })

  } catch (error: any) {
    console.error("[Cron Cleanup] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
