import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPaymentStatus, isFawryConfigured, mapFawryStatus } from "@/lib/fawry"
import { applyFawryEvent } from "@/lib/payments/apply-fawry-event"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET /api/cron/reconcile-fawry
 *
 * Closes the gap left by a callback that never arrived — a network blip on
 * Fawry's side, a deploy that dropped the request, an outage.
 *
 * Without this, an order the customer genuinely paid for could sit unpaid
 * forever. We ask Fawry directly, and run the answer through exactly the same
 * state machine the callback uses, so a reconciled payment is indistinguishable
 * from a pushed one — and just as idempotent.
 *
 * Schedule every 10–15 minutes. Same auth convention as the other cron routes.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const url = new URL(request.url)
    const querySecret = url.searchParams.get("secret")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isFawryConfigured()) {
      return NextResponse.json({ error: "Fawry is not configured" }, { status: 503 })
    }

    // Candidates: Fawry orders still unsettled, old enough that a callback
    // should have landed, young enough to still be payable.
    const now = Date.now()
    const olderThan = new Date(now - 5 * 60 * 1000)
    const newerThan = new Date(now - 3 * 24 * 60 * 60 * 1000)

    const candidates = await prisma.order.findMany({
      where: {
        paymentMethod: "fawry",
        paymentStatus: { in: ["pending"] },
        createdAt: { lt: olderThan, gt: newerThan },
      },
      orderBy: { createdAt: "asc" },
      take: 25,
      select: { orderId: true },
    })

    if (candidates.length === 0) {
      return NextResponse.json({ success: true, checked: 0, message: "Nothing to reconcile" })
    }

    const results: any[] = []

    for (const { orderId } of candidates) {
      try {
        const status = await getPaymentStatus(orderId)

        if (!status.ok) {
          results.push({ orderId, outcome: "query_failed", error: status.error })
          continue
        }

        const mapped = mapFawryStatus(status.paymentStatus)

        // Nothing has happened yet — leave it for the next pass.
        if (mapped === "unpaid" || mapped === "initiated") {
          results.push({ orderId, outcome: "still_unpaid" })
          continue
        }

        // Feed the provider's own response through the shared state machine.
        // Its messageSignature is verified inside getPaymentStatus; an
        // unverified response can report a status but can never approve.
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
          source: "status-poll",
        })

        results.push({ orderId, outcome: applied.outcome, ...("paymentStatus" in applied ? { paymentStatus: applied.paymentStatus } : {}) })
      } catch (error: any) {
        console.error(`[Fawry/reconcile] ${orderId} failed:`, error)
        results.push({ orderId, outcome: "error", error: error?.message })
      }
    }

    const settled = results.filter((r) => r.outcome === "applied").length
    if (settled > 0) {
      console.log(`[Fawry/reconcile] Settled ${settled} order(s) that never received a callback`)
    }

    return NextResponse.json({ success: true, checked: candidates.length, results })
  } catch (error: any) {
    console.error("[Fawry/reconcile] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
