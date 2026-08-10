import "server-only"
import { prisma } from "@/lib/prisma"
import { getMssqlPool, sql } from "@/lib/mssql"
import { calculateRentalPrice } from "@/lib/rental-pricing"
import { evaluateDiscount } from "@/lib/discounts"
import { getActiveProductDiscounts, findDiscountForProduct, applyProductDiscount } from "@/lib/product-discounts"

/**
 * Server-authoritative cart pricing.
 *
 * Nothing money-related may be taken from the client. Everything a customer's
 * charge depends on — unit price, discount, deposit, remaining balance — is
 * recomputed here from the ERP (MSSQL) and the discount table.
 *
 * The one sanctioned exception is a staff price override, which the *caller*
 * applies after verifying the actor's role. This module never reads a price
 * out of its own input.
 *
 * Deposit rules mirror app/checkout/page.tsx so the customer sees what they pay:
 *   - Buy items              → 100% of price
 *   - Exclusive rental hold  → 50% of rental price
 *   - Wedding rental         → flat 5,000 EGP per unit
 *   - Any other rental       → flat 1,000 EGP per unit
 * When a discount applies, the deposit scales by the same ratio as the discount.
 */

export const WEDDING_DEPOSIT_PER_UNIT = 5000
export const DEFAULT_RENTAL_DEPOSIT_PER_UNIT = 1000

export interface PriceCartItemInput {
  id?: string
  productId?: string
  name?: string
  quantity?: number
  size?: string
  volume?: string
  image?: string
  branch?: string
  collection?: string
  type?: "buy" | "rent"
  rentStart?: string
  rentEnd?: string
  isExclusive?: boolean
  isGiftPackage?: boolean
  /** Passed through untouched — never used to derive a price. */
  customMeasurements?: any
  selectedProducts?: any[]
  packageDetails?: any
}

export interface PricedItem extends PriceCartItemInput {
  id: string
  quantity: number
  /** Authoritative unit price, from ERP/product data. */
  unitPrice: number
  /** unitPrice × quantity. */
  lineTotal: number
  /** Deposit owed for this line before any discount scaling. */
  baseDeposit: number
  /** Where the price came from, for audit. */
  priceSource: "rental-erp" | "sell-erp" | "gift-package" | "product-cache" | "staff-override"
  priceFormula?: string
  /** Set when an active ProductDiscount reduced this line's unitPrice — the
   *  pre-discount price, kept for receipts/audit. unitPrice is already the
   *  discounted figure everywhere else. */
  originalUnitPrice?: number
  appliedProductDiscountId?: string
}

export interface PricedCart {
  items: PricedItem[]
  subtotal: number
  discountCode: string | null
  discountAmount: number
  /** subtotal − discountAmount */
  total: number
  depositAmount: number
  remainingAmount: number
  /** Populated when a supplied discount code was rejected. */
  discountError?: { reason: string; message: string; details?: Record<string, any> }
}

export interface PriceCartOptions {
  items: PriceCartItemInput[]
  discountCode?: string | null
  userId?: string
  email?: string
  /**
   * Staff-only per-line overrides, keyed by cart item id. The caller is
   * responsible for having verified the actor is an employee or admin before
   * passing this — see app/api/orders/route.ts.
   */
  staffOverrides?: Record<string, { lineTotal?: number; deposit?: number }>
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Rental if explicitly typed "rent", or anything not in the sell-dresses branch. */
export function isRentalItem(item: PriceCartItemInput): boolean {
  if (item.type === "rent") return true
  if (item.type === "buy") return false
  return !item.branch || item.branch !== "sell-dresses"
}

/**
 * Authoritative sell prices straight from the ERP, keyed by product id.
 * Mirrors the `Item_sellpricNow > 0 AND Item_Isdisabled = 0` filter the
 * storefront uses, so a disabled or unpriced item yields nothing and the
 * caller rejects the line.
 */
async function fetchErpSellPrices(productIds: string[]): Promise<Record<string, number>> {
  const ids = productIds.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id))
  if (!ids.length) return {}

  const pool = await getMssqlPool()
  const result = await pool.request().query<{ ID: number; price: number }>(`
    SELECT ID, Item_sellpricNow AS price
    FROM Items
    WHERE ID IN (${ids.join(",")})
      AND Item_Isdisabled = 0
      AND Item_sellpricNow > 0
  `)

  const out: Record<string, number> = {}
  for (const row of result.recordset) out[String(row.ID)] = Number(row.price)
  return out
}

/** Gift packages live only in the MySQL product cache, not the ERP. */
async function fetchGiftPackagePrices(productIds: string[]): Promise<Record<string, number>> {
  if (!productIds.length) return {}
  const rows = await prisma.product.findMany({
    where: { productId: { in: productIds }, isActive: true },
    select: { productId: true, packagePrice: true, price: true },
  })
  const out: Record<string, number> = {}
  for (const r of rows) out[r.productId] = Number(r.packagePrice ?? r.price ?? 0)
  return out
}

export class PricingError extends Error {
  constructor(message: string, public readonly itemId?: string) {
    super(message)
    this.name = "PricingError"
  }
}

/**
 * Price a cart. Throws PricingError when a line cannot be priced — an order
 * must never be created at a guessed price.
 */
export async function priceCart(opts: PriceCartOptions): Promise<PricedCart> {
  const { items, discountCode, userId = "guest", email, staffOverrides } = opts

  if (!Array.isArray(items) || items.length === 0) {
    throw new PricingError("Cart is empty")
  }

  // Rentals are priced per line further down — each depends on its own dates
  // and booking history — so only the two batchable lookups are collected here.
  const sellItems: PriceCartItemInput[] = []
  const packageItems: PriceCartItemInput[] = []

  for (const item of items) {
    if (item.isGiftPackage) packageItems.push(item)
    else if (!isRentalItem(item)) sellItems.push(item)
  }

  const [sellPrices, packagePrices, activeProductDiscounts] = await Promise.all([
    fetchErpSellPrices(sellItems.map((i) => String(i.productId ?? i.id ?? ""))),
    fetchGiftPackagePrices(packageItems.map((i) => String(i.productId ?? i.id ?? ""))),
    getActiveProductDiscounts(),
  ])

  const priced: PricedItem[] = []

  for (const item of items) {
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1))
    const itemId = String(item.id ?? item.productId ?? "")
    const productId = String(item.productId ?? item.id ?? "")

    if (!productId) throw new PricingError("Cart item is missing a product id", itemId)

    let unitPrice: number
    let priceSource: PricedItem["priceSource"]
    let priceFormula: string | undefined
    let originalUnitPrice: number | undefined
    let appliedProductDiscountId: string | undefined

    if (item.isGiftPackage) {
      const p = packagePrices[productId]
      if (!p || p <= 0) throw new PricingError(`Gift package is unavailable: ${item.name || productId}`, itemId)
      unitPrice = p
      priceSource = "gift-package"
    } else if (isRentalItem(item)) {
      if (!item.rentStart || !item.rentEnd) {
        throw new PricingError(`Rental dates are missing for ${item.name || productId}`, itemId)
      }
      const rentStart = new Date(item.rentStart)
      const rentEnd = new Date(item.rentEnd)
      if (isNaN(rentStart.getTime()) || isNaN(rentEnd.getTime()) || rentEnd <= rentStart) {
        throw new PricingError(`Rental dates are invalid for ${item.name || productId}`, itemId)
      }
      // A customer cannot book a pickup in the past — that would also skew `d`
      // in the pricing formula toward a cheaper bracket.
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      if (rentStart < todayStart) {
        throw new PricingError(`Rental start date is in the past for ${item.name || productId}`, itemId)
      }

      const result = await calculateRentalPrice({
        productId,
        rentStart,
        rentEnd,
        isExclusive: Boolean(item.isExclusive),
      })
      priceSource = "rental-erp"
      priceFormula = `${result.category}: ${result.formula}`

      // Automatic, no-code discount (see lib/product-discounts.ts) — applies
      // when the rule's appliesTo covers "rent". Takes effect purely
      // server-side; the client never supplies or influences this price.
      const rentDiscount = findDiscountForProduct(productId, item.branch, activeProductDiscounts, "rent")
      if (rentDiscount) {
        unitPrice = applyProductDiscount(result.total, rentDiscount)
        originalUnitPrice = result.total
        appliedProductDiscountId = rentDiscount.id
      } else {
        unitPrice = result.total
      }
    } else {
      const p = sellPrices[productId]
      if (!p || p <= 0) throw new PricingError(`Item is unavailable for purchase: ${item.name || productId}`, itemId)
      priceSource = "sell-erp"

      // Automatic, no-code discount (see lib/product-discounts.ts) — applies
      // when the rule's appliesTo covers "buy". Takes effect purely
      // server-side; the client never supplies or influences this price.
      const discount = findDiscountForProduct(productId, item.branch, activeProductDiscounts, "buy")
      if (discount) {
        unitPrice = applyProductDiscount(p, discount)
        originalUnitPrice = p
        appliedProductDiscountId = discount.id
      } else {
        unitPrice = p
      }
    }

    let lineTotal = round2(unitPrice * quantity)

    // ── Deposit for this line (pre-discount) ─────────────────────────
    let baseDeposit: number
    if (!isRentalItem(item) || item.isGiftPackage) {
      baseDeposit = Math.round(lineTotal)
    } else if (item.isExclusive) {
      baseDeposit = Math.round(lineTotal * 0.5)
    } else if ((item.collection || "").toLowerCase() === "wedding") {
      baseDeposit = WEDDING_DEPOSIT_PER_UNIT * quantity
    } else {
      baseDeposit = DEFAULT_RENTAL_DEPOSIT_PER_UNIT * quantity
    }

    // ── Sanctioned staff override (role already verified by the caller) ──
    const override = staffOverrides?.[itemId]
    if (override) {
      if (typeof override.lineTotal === "number" && isFinite(override.lineTotal) && override.lineTotal >= 0) {
        lineTotal = round2(override.lineTotal)
        unitPrice = round2(lineTotal / quantity)
        priceSource = "staff-override"
        priceFormula = `staff override (server price was ${round2(unitPrice * quantity)})`
        // A manual staff price supersedes the automatic discount entirely.
        originalUnitPrice = undefined
        appliedProductDiscountId = undefined
      }
      if (typeof override.deposit === "number" && isFinite(override.deposit) && override.deposit >= 0) {
        baseDeposit = Math.round(override.deposit)
      }
    }

    // A deposit can never exceed the line it secures.
    baseDeposit = Math.min(baseDeposit, Math.round(lineTotal))

    priced.push({
      ...item,
      id: itemId,
      productId,
      quantity,
      unitPrice,
      lineTotal,
      baseDeposit,
      priceSource,
      priceFormula,
      originalUnitPrice,
      appliedProductDiscountId,
    })
  }

  const subtotal = round2(priced.reduce((sum, i) => sum + i.lineTotal, 0))
  const baseDepositTotal = priced.reduce((sum, i) => sum + i.baseDeposit, 0)

  // ── Discount ───────────────────────────────────────────────────────
  let discountAmount = 0
  let appliedCode: string | null = null
  let discountError: PricedCart["discountError"] | undefined

  if (discountCode) {
    // No stacking: a line already reduced by an automatic ProductDiscount is
    // excluded from both the code's order-amount threshold and the set of
    // items it can discount — a code can still discount the rest of a mixed
    // cart, but never compounds on top of a price that's already on sale.
    const codeEligibleItems = priced.filter((i) => !i.appliedProductDiscountId)
    const codeEligibleSubtotal = round2(codeEligibleItems.reduce((sum, i) => sum + i.lineTotal, 0))

    const result = await evaluateDiscount({
      code: discountCode,
      orderAmount: codeEligibleSubtotal,
      items: codeEligibleItems.map((i) => ({ price: i.unitPrice, quantity: i.quantity, name: i.name, id: i.id })),
      userId,
      email,
    })
    if (result.ok) {
      discountAmount = round2(result.discountAmount)
      appliedCode = result.code
    } else {
      discountError = { reason: result.reason, message: result.message, details: result.details }
    }
  }

  const total = round2(Math.max(0, subtotal - discountAmount))

  // Deposit scales with the discount, matching the checkout summary.
  const depositRatio = subtotal > 0 ? baseDepositTotal / subtotal : 0
  const depositAmount = discountAmount > 0 ? Math.round(total * depositRatio) : Math.round(baseDepositTotal)
  const cappedDeposit = Math.min(depositAmount, total)
  const remainingAmount = round2(Math.max(0, total - cappedDeposit))

  return {
    items: priced,
    subtotal,
    discountCode: appliedCode,
    discountAmount,
    total,
    depositAmount: cappedDeposit,
    remainingAmount,
    discountError,
  }
}
