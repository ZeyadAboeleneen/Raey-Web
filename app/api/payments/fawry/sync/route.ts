import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPaymentStatus, isFawryConfigured, mapFawryStatus } from "@/lib/fawry"
import { applyFawryEvent } from "@/lib/payments/apply-fawry-event"
import { rateLimit, generateCheckoutRateLimitKey } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/payments/fawry/sync   { orderId }
 *
 * Settles a Fawry order on demand by asking Fawry for its authoritative status.
 *
 * Why this exists: the customer can leave Fawry's hosted page without a clean
 * redirect — a 3DS step erroring, a closed tab, a back button. The callback may
 * also be delayed or lost. Either way the order sits `pending`, which is limbo:
 * it shows nowhere useful and tells the customer nothing.
 *
 * The success page calls this when it lands on a still-pending Fawry order, so
 * the moment the customer is back in front of us the order becomes definite.
 * The reconciliation cron does the same thing on a timer for customers who
 * never return; this is just the impatient path.
 *
 * Safe to expose: the answer comes from Fawry over a signed request, its
 * `messageSignature` is verified inside getPaymentStatus, and applyFawryEvent
 * refuses to approve anything whose signature didn't verify or whose amount is
 * short. The worst a caller can do with someone else's order id is ask us to
 * refresh it from the provider — which is the correct answer anyway.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isFawryConfigured()) {
      return NextResponse.json({ error: "Fawry is not configured" }, { status: 503 })
    }

    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1"
    const { success } = await rateLimit(generateCheckoutRateLimitKey(ip, "fawry-sync", null), 30, 300)
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { orderId } = await request.json()
    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 })
    }

    const order = await prisma.order.findUnique({
      where: { orderId },
      select: { orderId: true, paymentMethod: true, paymentStatus: true },
    })
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    // Nothing to do for orders that aren't Fawry, or are already settled.
    if (order.paymentMethod !== "fawry" || order.paymentStatus !== "pending") {
      return NextResponse.json({ success: true, paymentStatus: order.paymentStatus, changed: false })
    }

    const status = await getPaymentStatus(orderId)
    if (!status.ok) {
      console.warn(`[Fawry/sync] Status query failed for ${orderId}: ${status.error}`)
      return NextResponse.json({ success: false, paymentStatus: "pending", changed: false })
    }

    const mapped = mapFawryStatus(status.paymentStatus)

    // Still genuinely awaiting payment — leave it pending.
    if (mapped === "unpaid" || mapped === "initiated") {
      return NextResponse.json({ success: true, paymentStatus: "pending", changed: false })
    }

    const applied = await applyFawryEvent({
      payload: {
        ...status.raw,
        merchantRefNumber: orderId,
        orderStatus: status.paymentStatus,
        paymentAmount: status.paymentAmount,
        orderAmount: status.orderAmount,
        paymentMethod: status.paymentMethod,
        fawryRefNumber: status.fawryRefNumber,
        paymentRefrenceNumber: status.paymentRefrenceNumber,
      },
      signatureValid: Boolean(status.signatureValid),
      source: "return-sync",
    })

    const paymentStatus = "paymentStatus" in applied ? applied.paymentStatus : "pending"
    console.log(`[Fawry/sync] ${orderId}: ${status.paymentStatus} → ${paymentStatus}`)

    return NextResponse.json({ success: true, paymentStatus, changed: paymentStatus !== "pending" })
  } catch (error: any) {
    console.error("[Fawry/sync] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
