import "server-only"
import { prisma } from "@/lib/prisma"

export type DiscountContext = "buy" | "rent"

export interface ActiveProductDiscount {
  id: string
  name: string
  discountType: "fixed" | "percentage"
  discountValue: number
  /** Percentage discounts only — caps the EGP amount taken off a single unit's
   *  price. Null = uncapped. Ignored for "fixed" discounts. */
  maxDiscountAmount: number | null
  /** Branch slugs this rule applies to. Empty = every branch. */
  branches: string[]
  productIds: string[]
  /** Which sale mode this rule discounts — "buy", "rent", or "both". */
  appliesTo: DiscountContext | "both"
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Every currently-active ProductDiscount row: isActive=true AND (no
 * validFrom or it's already started) AND (no validUntil or it hasn't
 * ended yet). Callers should fetch this once and reuse it across a batch
 * of products rather than querying per product.
 */
export async function getActiveProductDiscounts(): Promise<ActiveProductDiscount[]> {
  const now = new Date()
  const rows = await prisma.productDiscount.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
      ],
    },
  })

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    discountType: r.discountType === "percentage" ? "percentage" : "fixed",
    discountValue: Number(r.discountValue) || 0,
    maxDiscountAmount: r.maxDiscountAmount != null ? Number(r.maxDiscountAmount) : null,
    branches: Array.isArray(r.branches) ? (r.branches as unknown[]).map(String) : [],
    productIds: Array.isArray(r.productIds) ? (r.productIds as unknown[]).map(String) : [],
    appliesTo: r.appliesTo === "rent" || r.appliesTo === "both" ? r.appliesTo : "buy",
  }))
}

/**
 * Which active discount (if any) applies to a given item in the given sale
 * mode. Only rules whose `appliesTo` covers `context` ("both" always
 * counts) are considered. Specific `productIds` beat a `branch`-wide rule;
 * if two rules both match a product only the first one found is used
 * (admin UI is expected to prevent overlapping rules, but this guarantees a
 * single deterministic price either way rather than silently stacking
 * discounts).
 */
export function findDiscountForProduct(
  productId: string | number,
  branch: string | null | undefined,
  activeDiscounts: ActiveProductDiscount[],
  context: DiscountContext,
): ActiveProductDiscount | null {
  const pid = String(productId)
  const applicable = activeDiscounts.filter((d) => d.appliesTo === "both" || d.appliesTo === context)

  const byProduct = applicable.find((d) => d.productIds.includes(pid))
  if (byProduct) return byProduct

  const byBranch = applicable.find(
    (d) => d.productIds.length === 0 && (d.branches.length === 0 || (!!branch && d.branches.includes(branch))),
  )
  return byBranch ?? null
}

/** Applies a discount to a single unit's price. Never goes below 0, always 2dp. */
export function applyProductDiscount(originalPrice: number, discount: ActiveProductDiscount): number {
  if (!originalPrice || originalPrice <= 0) return originalPrice
  if (discount.discountType === "percentage") {
    const pct = Math.min(100, Math.max(0, discount.discountValue))
    let amountOff = originalPrice * (pct / 100)
    // e.g. 50% off, capped at 2000 EGP off — the percentage never takes more
    // than the cap off a single unit, regardless of how expensive it is.
    if (discount.maxDiscountAmount != null && discount.maxDiscountAmount >= 0) {
      amountOff = Math.min(amountOff, discount.maxDiscountAmount)
    }
    return round2(Math.max(0, originalPrice - amountOff))
  }
  return round2(Math.max(0, originalPrice - discount.discountValue))
}
