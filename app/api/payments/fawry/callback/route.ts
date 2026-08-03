import { type NextRequest, NextResponse } from "next/server"
import { verifyCallbackSignature, isFawryConfigured, type FawryCallbackPayload } from "@/lib/fawry"
import { applyFawryEvent } from "@/lib/payments/apply-fawry-event"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/payments/fawry/callback
 *
 * Fawry's server-to-server notification. This is the *only* path that may mark
 * an order paid — the browser's return URL never does.
 *
 * Notes on behaviour that is deliberate:
 *   - Unauthenticated by design; the SHA-256 messageSignature is the auth.
 *     An unsigned or wrongly-signed body is recorded and rejected, never applied.
 *   - Returns 200 for anything we have durably handled, including duplicates,
 *     so Fawry stops retrying. Only genuine server faults return non-200, which
 *     is what we *want* retried.
 *   - Must be excluded from CSRF and auth middleware. See middleware.ts.
 */
export async function POST(request: NextRequest) {
  let payload: FawryCallbackPayload

  try {
    payload = (await request.json()) as FawryCallbackPayload
  } catch {
    console.warn("[Fawry/callback] Unparseable body rejected")
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  if (!isFawryConfigured()) {
    // Fail loud, and let Fawry retry once configuration is fixed.
    console.error("[Fawry/callback] Received a callback while Fawry is not configured")
    return NextResponse.json({ error: "Not configured" }, { status: 503 })
  }

  const signatureValid = verifyCallbackSignature(payload)

  if (!signatureValid) {
    // Never apply it. Log enough to investigate without dumping the whole body.
    console.error(
      `[Fawry/callback][SIGNATURE-FAIL] merchantRef=${payload.merchantRefNumber} ` +
      `fawryRef=${payload.fawryRefNumber} status=${payload.orderStatus} ` +
      `ip=${request.headers.get("x-forwarded-for") || "?"}`,
    )
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  try {
    const result = await applyFawryEvent({ payload, signatureValid, source: "callback" })

    switch (result.outcome) {
      case "applied":
        console.log(
          `[Fawry/callback] ${result.orderId}: txn=${result.txnStatus} payment=${result.paymentStatus}`,
        )
        return NextResponse.json({ received: true })

      case "duplicate":
        // Already applied — acknowledge so retries stop.
        console.log(`[Fawry/callback] Duplicate event for ${result.orderId}, ignored`)
        return NextResponse.json({ received: true, duplicate: true })

      case "order_not_found":
        // Acknowledged deliberately: retrying will not conjure the order, and
        // an unbounded retry loop is worse than an alert.
        console.error(
          `[Fawry/callback][ORPHAN] No local order for merchantRef=${result.merchantRefNum} — needs manual review`,
        )
        return NextResponse.json({ received: true, unmatched: true })

      case "rejected":
        console.error(`[Fawry/callback] Rejected: ${result.reason}`)
        return NextResponse.json({ error: result.reason }, { status: 400 })
    }
  } catch (error: any) {
    // A real fault — let Fawry retry.
    console.error("[Fawry/callback] Processing error:", error)
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}

/** Some Fawry configurations probe the endpoint with a GET before enabling it. */
export async function GET() {
  return NextResponse.json({ status: "ok" })
}
