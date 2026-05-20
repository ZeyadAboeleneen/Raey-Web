import { NextResponse } from "next/server"
import { OutboxService } from "@/services/outbox.service"
import { verifyPaymentReceiptWithGemini } from "@/lib/payment-verification"
import { runFraudDecisionEngine } from "@/lib/fraud-engine"
import { prisma } from "@/lib/prisma"
import { syncOrderToErp } from "@/lib/erp-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // Allow up to 60s for AI processing

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

    // 1. Pick a batch of events (SKIP LOCKED is used under the hood to prevent collisions)
    // We only take 5 at a time to prevent serverless function timeouts
    const events = await OutboxService.pickBatch(5)

    if (!events || events.length === 0) {
      return NextResponse.json({ success: true, message: "No pending events" })
    }

    const results = []

    for (const event of events) {
      try {
        if (event.type === "VERIFY_PAYMENT") {
          const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload
          const { orderId, expectedAmount, expectedProvider, imageUrl } = payload

          console.log(`[Worker] Processing VERIFY_PAYMENT for Order: ${orderId}`)

          // 1. Run AI Verification
          const aiResult = await verifyPaymentReceiptWithGemini(imageUrl)
          
          if (!aiResult.success || !aiResult.data) {
            throw new Error(`AI Extraction Failed: ${aiResult.error}`)
          }

          // 2. Run Backend Fraud Rules Decision Engine
          const decision = await runFraudDecisionEngine(
            expectedAmount,
            expectedProvider,
            aiResult.data
          )

          let shouldSyncToErp = false

          // 3. Update Order Database atomically
          await prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({ where: { orderId } })
            if (!order) throw new Error("Order not found")

            // Store results
            await tx.order.update({
              where: { id: order.id },
              data: {
                paymentStatus: decision.status,
                paymentFraudReason: decision.reason,
                paymentAiConfidence: decision.confidenceScore,
                paymentVerifiedAt: new Date(),
                paymentReceiptHash: null, // Hash would go here if we hashed the image
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

                // Check if sell dress
                const isSellDress = (product as any)?.branch === "sell-dresses" || item.branch === "sell-dresses"
                if (isSellDress) {
                  await tx.product.update({
                    where: { productId: item.productId },
                    data: { isOutOfStock: true }
                  })
                  continue
                }

                // Update sizes array
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
                    data: { sizes: updatedSizes, isOutOfStock }
                  })
                }
              }
            }
          })

          // Sync to ERP if approved (executed outside the Postgres transaction block)
          if (shouldSyncToErp) {
            console.log(`[Worker] Auto-approved order ${orderId}, syncing to ERP...`)
            const syncResult = await syncOrderToErp(orderId, imageUrl)
            if (!syncResult.success) {
              console.error(`[Worker] ERP Sync failed for order ${orderId}:`, syncResult.error)
            }
          }

          // Mark event completed
          await OutboxService.complete(event.id)
          results.push({ id: event.id, status: "completed", decision: decision.status })
          
        } else {
          // Other event types like AUDIT_LOG or ERP_SYNC
          await OutboxService.complete(event.id)
          results.push({ id: event.id, status: "completed" })
        }
      } catch (err: any) {
        console.error(`[Worker] Failed event ${event.id}:`, err)
        await OutboxService.fail(event.id, err.message || "Unknown error", (event.attempts || 0) + 1)
        results.push({ id: event.id, status: "failed", error: err.message })
      }
    }

    return NextResponse.json({ success: true, processed: results.length, results })
  } catch (error: any) {
    console.error("[Worker] Outbox processing error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
