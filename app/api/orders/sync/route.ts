import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncOrderToErp } from "@/lib/erp-sync"
import { OutboxService } from "@/services/outbox.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { orderId, paymentScreenshot } = await request.json()
    if (!orderId) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 })
    }

    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    let finalScreenshot = paymentScreenshot || order.paymentScreenshot
    const isBase64Screenshot = finalScreenshot && finalScreenshot.startsWith("data:image/")
    
    // 1. Upload Cloudinary Image if it's base64 (always do this regardless of paymentStatus so it is preserved and visible to admin/AI!)
    if (isBase64Screenshot && finalScreenshot) {
      try {
        console.log("📸 [API/Sync] Uploading payment screenshot to Cloudinary...")
        const { uploadDataUrlToCloudinary } = await import("@/lib/cloudinary")
        const uploadedUrl = await uploadDataUrlToCloudinary(
          finalScreenshot,
          "payments",
          `order-${orderId}`
        )
        console.log("✅ [API/Sync] Payment screenshot uploaded:", uploadedUrl)
        
        // Update order in Postgres with Cloudinary URL
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentScreenshot: uploadedUrl }
        })
        finalScreenshot = uploadedUrl

        // Run AI Verification synchronously on order placement for instant approval and booking!
        if (order.paymentStatus === "pending") {
          try {
            console.log(`[API/Sync] Running synchronous AI Verification for order ${orderId}...`)
            const { verifyPaymentReceiptWithGemini } = await import("@/lib/payment-verification")
            const { runFraudDecisionEngine } = await import("@/lib/fraud-engine")
            
            const aiResult = await verifyPaymentReceiptWithGemini(uploadedUrl)
            if (aiResult.success && aiResult.data) {
              const decision = await runFraudDecisionEngine(
                order.depositAmount,
                order.paymentMethod,
                aiResult.data
              )
              
              let shouldSyncToErp = false
              
              // Atomically update database status and stock
              await prisma.$transaction(async (tx) => {
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
                
                if (decision.status === "approved") {
                  shouldSyncToErp = true
                  const items = order.items as any[]
                  for (const item of items) {
                    if (!item.productId || !item.size || item.quantity === undefined) continue
                    
                    const product = await tx.product.findUnique({ where: { productId: item.productId } })
                    if (!product) continue

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
              
              // Trigger ERP booking immediately if approved!
              if (shouldSyncToErp) {
                try {
                  console.log(`[API/Sync] Synchronously syncing order ${orderId} to ERP MSSQL...`)
                  await syncOrderToErp(orderId)
                } catch (erpError) {
                  console.error(`❌ [API/Sync] Synchronous ERP Sync failed:`, erpError)
                }
                
                // Update local variable to proceed below
                order.paymentStatus = "approved"
              } else {
                // Update status to whatever the decision was (e.g. pending_review, rejected)
                order.paymentStatus = decision.status
              }
            } else {
              throw new Error(aiResult.error || "AI returned empty result")
            }
          } catch (syncVerifyError) {
            console.error("❌ [API/Sync] Synchronous AI verification failed, falling back to background queue:", syncVerifyError)
            // If synchronous verification fails, we enqueue the background outbox event as a reliable fallback!
            await OutboxService.enqueue(
              "VERIFY_PAYMENT",
              {
                orderId: order.orderId,
                expectedAmount: order.depositAmount,
                expectedProvider: order.paymentMethod,
                imageUrl: uploadedUrl
              }
            )
          }
        }
      } catch (uploadError) {
        console.error("❌ [API/Sync] Failed to upload payment screenshot:", uploadError)
      }
    }

    // Gate sync by payment status
    if (order.paymentStatus !== "approved") {
      console.log(`[ERP/Sync] Order ${orderId} has status ${order.paymentStatus}. Sync deferred until approved.`)
      return NextResponse.json({ 
        success: true, 
        message: `Awaiting payment verification. Status: ${order.paymentStatus}`,
        screenshotUrl: finalScreenshot
      })
    }

    const result = await syncOrderToErp(orderId, paymentScreenshot)
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: result.message || "Order synced successfully" })

  } catch (error: any) {
    console.error("[Sync API] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
