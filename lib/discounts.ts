import "server-only"
import { prisma } from "@/lib/prisma"

/**
 * Shared discount evaluation.
 *
 * Both `/api/discount-codes/validate` (the checkout preview call) and the server
 * pricing engine call into here, so a code can never evaluate to one amount when
 * previewed and a different amount when the order is actually priced.
 *
 * Every input that affects the outcome — item prices above all — must already be
 * server-authoritative before it reaches this module. See lib/pricing/server-pricing.ts.
 */

export interface DiscountItemInput {
  price: number
  quantity?: number
  name?: string
  id?: string
}

export interface DiscountContext {
  code: string
  /** Server-computed subtotal the discount applies to. Never a client figure. */
  orderAmount: number
  items: DiscountItemInput[]
  /** Logged-in user id, or "guest". */
  userId?: string
  /** Guest email, used for per-email usage limits. */
  email?: string
}

export type DiscountResult =
  | {
      ok: true
      code: string
      type: string
      value: number
      discountAmount: number
      discountDetails: Record<string, any>
    }
  | {
      ok: false
      /** Machine-readable reason, e.g. "MIN_ORDER_AMOUNT". */
      reason: string
      message: string
      details?: Record<string, any>
    }

const fail = (message: string, reason = "INVALID", details?: Record<string, any>): DiscountResult => ({
  ok: false,
  reason,
  message,
  details,
})

/** Expand items into one entry per unit, cheapest first — used by the buyX rules. */
function expandUnitsCheapestFirst(items: DiscountItemInput[]) {
  return items
    .flatMap((item) =>
      Array(Math.max(1, item.quantity || 1))
        .fill(null)
        .map(() => ({ price: item.price || 0, name: item.name || "", id: item.id || "" })),
    )
    .sort((a, b) => a.price - b.price)
}

export async function evaluateDiscount(ctx: DiscountContext): Promise<DiscountResult> {
  const { orderAmount, items = [], userId = "guest", email } = ctx

  if (!ctx.code) return fail("Discount code is required", "MISSING_CODE")

  const normalizedCode = ctx.code.trim().toUpperCase()

  const discountCode = await prisma.discountCode.findFirst({
    where: { isActive: true, code: { equals: normalizedCode } },
  })

  if (!discountCode) return fail("Invalid discount code", "NOT_FOUND")

  // ── Validity window ────────────────────────────────────────────────
  if (discountCode.validFrom && new Date() < new Date(discountCode.validFrom)) {
    return fail("Discount code is not yet valid", "NOT_YET_VALID")
  }
  if (discountCode.validUntil && new Date() > new Date(discountCode.validUntil)) {
    return fail("Discount code has expired", "EXPIRED")
  }

  // ── Usage limits ───────────────────────────────────────────────────
  if (discountCode.usageLimit) {
    if (userId && userId !== "guest") {
      const userUsageCount = await prisma.order.count({
        where: { userId, discountCode: discountCode.code },
      })
      if (userUsageCount >= discountCode.usageLimit) {
        return fail(
          `You have already used this discount code ${discountCode.usageLimit} times.`,
          "USAGE_LIMIT_REACHED",
        )
      }
    } else if (email) {
      // Guests are tracked by the email on the order's shipping address.
      // MySQL JSON path extraction — Prisma can't express this natively.
      const result = await prisma.$queryRaw<[{ cnt: number }]>`
        SELECT COUNT(*) as cnt FROM orders
        WHERE JSON_EXTRACT(shipping_address, '$.email') = ${email}
        AND discount_code = ${discountCode.code}
      `
      const guestUsageCount = Number(result[0]?.cnt ?? 0)
      if (guestUsageCount >= discountCode.usageLimit) {
        return fail(
          `This email has already used this discount code ${discountCode.usageLimit} times.`,
          "USAGE_LIMIT_REACHED",
        )
      }
    }
  }

  // ── Minimum order ──────────────────────────────────────────────────
  if (discountCode.minPurchase && orderAmount < discountCode.minPurchase) {
    return fail("Order total is below the minimum for this code", "MIN_ORDER_AMOUNT", {
      minOrderAmount: discountCode.minPurchase,
      minOrderRemaining: discountCode.minPurchase - orderAmount,
    })
  }

  const actualType = discountCode.originalType || discountCode.discountType
  let discountAmount = 0
  let discountDetails: Record<string, any> = {}

  if (actualType === "percentage") {
    discountAmount = (orderAmount * discountCode.discountValue) / 100
    if (discountCode.maxDiscount) discountAmount = Math.min(discountAmount, discountCode.maxDiscount)
    discountDetails = { percentage: discountCode.discountValue }
  } else if (actualType === "fixed") {
    discountAmount = Math.min(discountCode.discountValue, orderAmount)
    discountDetails = { fixedAmount: discountCode.discountValue }
  } else if (actualType === "buyXgetX") {
    if (!items.length) return fail("Add items to your cart to apply this discount", "NO_ITEMS")
    const buyX = discountCode.buyX || 0
    const getX = discountCode.getX || 0
    if (!buyX || !getX) return fail("Invalid discount code configuration", "BAD_CONFIG")

    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0)
    const minimumRequired = buyX + getX
    if (totalQuantity < minimumRequired) {
      const needed = minimumRequired - totalQuantity
      return fail(
        `Add ${needed} more item${needed > 1 ? "s" : ""} to your cart (Buy ${buyX} Get ${getX} Free — minimum ${minimumRequired} items required)`,
        "NOT_ENOUGH_ITEMS",
        { neededItems: needed, buyX, getX, minimumRequired },
      )
    }

    const setsOfBuyX = Math.floor(totalQuantity / (buyX + getX))
    const freeItemsCount = setsOfBuyX * getX
    const sortedItems = expandUnitsCheapestFirst(items)
    discountAmount = sortedItems.slice(0, freeItemsCount).reduce((sum, item) => sum + item.price, 0)
    discountDetails = { buyX, getX, freeItemsCount, type: "buyXgetX" }
  } else if (actualType === "buyXgetYpercent") {
    if (!items.length) return fail("Add items to your cart to apply this discount", "NO_ITEMS")
    const buyX = discountCode.buyX || 0
    const discountPercentage = discountCode.discountPercentage || 0
    if (!buyX || !discountPercentage) return fail("Invalid discount code configuration", "BAD_CONFIG")

    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0)
    if (totalQuantity < buyX) {
      const needed = buyX - totalQuantity
      return fail(
        `Add ${needed} more item${needed > 1 ? "s" : ""} to get ${discountPercentage}% off on the next item`,
        "NOT_ENOUGH_ITEMS",
        { neededItems: needed, buyX, discountPercentage },
      )
    }

    const sortedItems = expandUnitsCheapestFirst(items)
    if (sortedItems.length > 0) discountAmount = (sortedItems[0].price * discountPercentage) / 100
    discountDetails = { buyX, discountPercentage, type: "buyXgetYpercent" }
  } else {
    return fail("This discount code type is not supported", "UNSUPPORTED_TYPE")
  }

  // A discount can never exceed the order, or go negative.
  discountAmount = Math.max(0, Math.min(discountAmount, orderAmount))

  return {
    ok: true,
    code: discountCode.code,
    type: actualType,
    value: discountCode.discountValue,
    discountAmount,
    discountDetails,
  }
}
