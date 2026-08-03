import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { evaluateDiscount } from "@/lib/discounts"
import { priceCart } from "@/lib/pricing/server-pricing"
import type { OrderItem } from "@/lib/models/types"

/**
 * Discount preview for the checkout page.
 *
 * The amount returned here is a *preview only*. The authoritative discount is
 * recomputed from scratch when the order is created, against server-priced items —
 * a client that tampers with the prices it sends here changes nothing downstream.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    let userId = "guest"

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
        userId = decoded.userId || "guest"
      } catch { }
    }

    const { code, items, email }: { code: string; orderAmount?: number; items: OrderItem[]; email?: string } =
      await request.json()

    if (!code) return NextResponse.json({ error: "Discount code is required" }, { status: 400 })
    if (items && !Array.isArray(items)) return NextResponse.json({ error: "Items must be an array" }, { status: 400 })

    // Price the cart server-side rather than trusting the client's `orderAmount`,
    // so the preview matches what checkout will actually charge.
    const priced = await priceCart({ items: (items || []) as any[] })

    const result = await evaluateDiscount({
      code,
      orderAmount: priced.subtotal,
      items: priced.items.map((i) => ({
        price: i.unitPrice,
        quantity: i.quantity,
        name: i.name,
        id: i.id,
      })),
      userId,
      email,
    })

    if (!result.ok) {
      // Preserve the shape the checkout page already branches on.
      if (result.reason === "MIN_ORDER_AMOUNT") {
        return NextResponse.json({ error: "MIN_ORDER_AMOUNT", ...result.details }, { status: 400 })
      }
      return NextResponse.json({ error: result.message, ...(result.details || {}) }, { status: 400 })
    }

    return NextResponse.json({
      valid: true,
      discountAmount: result.discountAmount,
      code: result.code,
      type: result.type,
      value: result.value,
      discountDetails: result.discountDetails,
      // Echo the server's view of the cart so the summary can correct itself.
      subtotal: priced.subtotal,
    })
  } catch (error) {
    console.error("Discount validation error:", error)
    return NextResponse.json({ error: "An error occurred while validating discount code" }, { status: 500 })
  }
}
