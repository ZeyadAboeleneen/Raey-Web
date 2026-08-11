import type { CachedProduct } from "@/lib/products-cache"

/**
 * Stable-sorts discounted products to the front of a list. "Discounted" is mode-aware:
 * a buy-only ProductDiscount shouldn't bump a product to the top of a rent listing it
 * doesn't actually discount, and vice versa. Everything else keeps its relative order.
 */
export function sortDiscountedFirst<T extends Pick<CachedProduct, "hasBuyDiscount" | "hasRentDiscount">>(
  products: T[],
  isBuyMode: boolean,
): T[] {
  const isDiscounted = (p: T) => !!(isBuyMode ? p.hasBuyDiscount : p.hasRentDiscount)
  return [...products].sort((a, b) => Number(isDiscounted(b)) - Number(isDiscounted(a)))
}
