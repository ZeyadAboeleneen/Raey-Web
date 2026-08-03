import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildChargeRequest, initHostedCheckout, isFawryConfigured, getFawryConfig } from "@/lib/fawry"
import { recordInitiated } from "@/lib/payments/fawry-ledger"
import { rateLimit, generateCheckoutRateLimitKey } from "@/lib/rate-limit"
import jwt from "jsonwebtoken"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/payments/fawry/init
 *
 * Creates a Fawry hosted-checkout session for an order that already exists.
 *
 * The amount charged is read from the order row — which /api/orders wrote from
 * server-computed prices — so nothing this endpoint receives from the browser
 * can influence what the customer is charged. The body carries only an orderId.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isFawryConfigured()) {
      console.error("[Fawry/init] FAWRY_MERCHANT_CODE / FAWRY_SECURE_KEY are not set")
      return NextResponse.json({ error: "Online payment is temporarily unavailable." }, { status: 503 })
    }

    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1"
    const { success } = await rateLimit(generateCheckoutRateLimitKey(ip, "fawry-init", null), 20, 900)
    if (!success) {
      return NextResponse.json({ error: "Too many payment attempts. Please try again later." }, { status: 429 })
    }

    const { orderId } = await request.json()
    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 })
    }

    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    // A logged-in customer may only pay for their own order. Guest orders are
    // reachable by orderId alone, which is how guest checkout already works —
    // the id is single-use and reveals nothing beyond what the payer knows.
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (order.userId && token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
        if (decoded.userId && decoded.userId !== order.userId && decoded.role !== "admin") {
          return NextResponse.json({ error: "Not authorized for this order" }, { status: 403 })
        }
      } catch {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 })
      }
    }

    if (order.paymentStatus === "approved") {
      return NextResponse.json({ error: "This order is already paid." }, { status: 409 })
    }

    // Charge the deposit when the order has one, otherwise the full total.
    const chargeAmount = Number(order.depositAmount) > 0 ? Number(order.depositAmount) : Number(order.total)
    if (!isFinite(chargeAmount) || chargeAmount <= 0) {
      console.error(`[Fawry/init] Order ${orderId} has a non-payable amount: ${chargeAmount}`)
      return NextResponse.json({ error: "This order has no payable amount." }, { status: 400 })
    }

    const config = getFawryConfig()
    if (!config.appUrl) {
      console.error("[Fawry/init] NEXT_PUBLIC_BASE_URL is not set — cannot build returnUrl")
      return NextResponse.json({ error: "Online payment is temporarily unavailable." }, { status: 503 })
    }

    const shipping = (order.shippingAddress || {}) as any

    // Fawry is sent a single line for the order rather than the cart lines: the
    // charge total is what matters, and the item breakdown is already stored
    // with the order. This also keeps the signature stable.
    const chargeRequest = buildChargeRequest({
      merchantRefNum: order.orderId,
      customerProfileId: order.userId || undefined,
      customerName: shipping.name || undefined,
      customerMobile: normalizeEgyptianMobile(shipping.phone),
      customerEmail: shipping.email || undefined,
      items: [
        {
          itemId: order.orderId,
          description: Number(order.depositAmount) > 0 ? "Order deposit" : "Order payment",
          price: chargeAmount,
          quantity: 1,
        },
      ],
      returnUrl: `${config.appUrl}/checkout/success?orderId=${encodeURIComponent(order.orderId)}`,
      webhookUrl: `${config.appUrl}/api/payments/fawry/callback`,
      language: "en-gb",
      // Link expires in 24h so an abandoned checkout can't be paid days later
      // against stock we've since released.
      paymentExpiry: Date.now() + 24 * 60 * 60 * 1000,
    })

    const result = await initHostedCheckout(chargeRequest)

    if (!result.ok || !result.redirectUrl) {
      console.error(`[Fawry/init] Charge init failed for ${orderId}:`, result.error, result.raw)
      return NextResponse.json(
        { error: "We couldn't start the payment. Please try again." },
        { status: 502 },
      )
    }

    // Record the attempt in the ERP ledger so a callback arriving before the
    // customer returns has something to correlate against. Never fatal — the
    // customer already has a valid payment link at this point.
    try {
      await recordInitiated({
        orderRef: order.orderId,
        expectedAmount: chargeAmount,
        requestPayload: { ...chargeRequest, signature: "[redacted]" },
      })
    } catch (ledgerError) {
      console.error(`[Fawry/init] Could not write initiated row for ${orderId}:`, ledgerError)
    }

    return NextResponse.json({ success: true, redirectUrl: result.redirectUrl })
  } catch (error: any) {
    console.error("[Fawry/init] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** Fawry expects a local 01XXXXXXXXX mobile; strip a +20 / 0020 country prefix. */
function normalizeEgyptianMobile(phone: unknown): string | undefined {
  if (!phone || typeof phone !== "string") return undefined
  const digits = phone.replace(/[^\d]/g, "")
  if (digits.startsWith("20") && digits.length >= 12) return "0" + digits.slice(2)
  if (digits.startsWith("0") && digits.length === 11) return digits
  return undefined
}
