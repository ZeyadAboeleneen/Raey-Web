import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { verifyPaymentReceiptWithGemini } from "@/lib/payment-verification"
import { runFraudDecisionEngine } from "@/lib/fraud-engine"
import { syncOrderToErp } from "@/lib/erp-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const requireAdminOrPermission = async (request: NextRequest, permissionKey: string) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: "Authorization required", status: 401 }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    if (decoded.role === "admin") return { decoded }
    
    if (decoded.employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: decoded.employeeId } })
      if (!employee || !employee.isActive) return { error: "Unauthorized", status: 401 }
      if (employee[permissionKey as keyof typeof employee]) return { decoded, employee }
    }
    
    return { error: "Permission denied", status: 403 }
  } catch {
    return { error: "Invalid token", status: 401 }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const { orderId } = params
    if (!orderId) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 })
    }

    // Require update permission
    const auth = await requireAdminOrPermission(request, "canUpdateOrders")
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    if (!order.paymentScreenshot) {
      return NextResponse.json({ error: "No payment screenshot uploaded for this order." }, { status: 400 })
    }

    console.log(`[Manual AI Verification] Initiating Gemini analysis for Order: ${orderId}`)

    // 1. Run AI Verification
    const aiResult = await verifyPaymentReceiptWithGemini(order.paymentScreenshot)
    
    if (!aiResult.success || !aiResult.data) {
      return NextResponse.json({ error: `AI Verification failed: ${aiResult.error}` }, { status: 500 })
    }

    // 2. Run Backend Fraud Rules Decision Engine
    const decision = await runFraudDecisionEngine(
      order.depositAmount,
      order.paymentMethod,
      aiResult.data
    )

    let shouldSyncToErp = false

    // 3. Update Order Database atomically
    await prisma.$transaction(async (tx) => {
      // Store results
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: decision.status,
          paymentFraudReason: decision.reason,
          paymentAiConfidence: decision.confidenceScore,
          paymentVerifiedAt: new Date(),
          paymentReceiptHash: null,
          paymentTransactionId: aiResult.data?.transactionId || (order as any).paymentTransactionId,
          paymentAiRaw: aiResult.raw ? JSON.parse(aiResult.raw) : null,
          paymentAiPromptVersion: "v1.0"
        } as any
      })

      // 4. If Auto-Approved AND wasn't already approved, Reserve Stock!
      if (decision.status === "approved" && (order as any).paymentStatus !== "approved") {
        shouldSyncToErp = true
        const items = order.items as any[]
        for (const item of items) {
          if (!item.productId || !item.size || item.quantity === undefined) continue
          
          const product = await tx.product.findUnique({ where: { productId: item.productId } })
          if (!product) continue

          const isOutOfStockField = (product as any)?.isOutOfStock
          const isSellDress = (product as any)?.branch === "sell-dresses" || item.branch === "sell-dresses"
          
          if (isSellDress) {
            await tx.product.update({
              where: { productId: item.productId },
              data: { isOutOfStock: true }
            })
            continue
          }

          const sizes = product.sizes as any[]
          const updatedSizes = sizes?.map((s: any) => {
            const matches = s.size === item.size || s.volume === item.size || s.size === item.volume || s.volume === item.volume
            if (matches && s.stockCount !== null && s.stockCount !== undefined) {
              return { ...s, stockCount: Math.max(0, s.stockCount - item.quantity) }
            }
            return s
          })

          if (updatedSizes) {
            const isOutOfStock = (updatedSizes as any[]).every((s: any) => !s.stockCount && s.stockCount !== undefined)
            await tx.product.update({
              where: { productId: item.productId },
              data: {
                sizes: updatedSizes,
                isOutOfStock: isOutOfStock
              }
            })
          }
        }
      }
    })

    // 5. Trigger ERP Sync Outside the Prisma Transaction Block
    if (shouldSyncToErp) {
      try {
        console.log(`[Manual AI Verification] Syncing Order ${orderId} to ERP MSSQL...`)
        await syncOrderToErp(orderId)
      } catch (erpError) {
        console.error(`❌ [Manual AI Verification] Failed to sync order ${orderId} to ERP MSSQL:`, erpError)
      }
    }

    return NextResponse.json({
      success: true,
      message: `AI analysis completed. Decision: ${decision.status}`,
      decision
    })

  } catch (error: any) {
    console.error("❌ [Manual AI Verification Error]:", error)
    return NextResponse.json({ error: error.message || "An unexpected error occurred during AI verification." }, { status: 500 })
  }
}
