import { type NextRequest, NextResponse } from "next/server"
import { calculateRentalPrice } from "@/lib/rental-pricing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/rental/pricing
 *
 * Calculate rental price for a given dress, date range, and exclusive option.
 * Called after form submission — NOT live during selection.
 *
 * Body: { productId, rentStart, rentEnd, isExclusive }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId, rentStart, rentEnd, isExclusive } = body

    // ── Validation ────────────────────────────────────────────────────
    if (!productId) {
      return NextResponse.json({ error: "productId is required" }, { status: 400 })
    }

    if (!rentStart || !rentEnd) {
      return NextResponse.json({ error: "rentStart and rentEnd are required" }, { status: 400 })
    }

    const startDate = new Date(rentStart)
    const endDate = new Date(rentEnd)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
    }

    if (endDate <= startDate) {
      return NextResponse.json({ error: "rentEnd must be after rentStart" }, { status: 400 })
    }

    // ── Calculate price (no transaction — this is a preview, not a commit) ──
    const result = await calculateRentalPrice({
      productId: String(productId),
      rentStart: startDate,
      rentEnd: endDate,
      isExclusive: Boolean(isExclusive),
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    console.error("❌ [Pricing] Error:", error?.message || error)

    if (error?.message?.includes("not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to calculate rental price" },
      { status: 500 },
    )
  }
}
