/**
 * ── Product Visibility Rules ───────────────────────────────────────────
 *
 * Centralized, single-source-of-truth visibility logic for the public
 * storefront.  Every public-facing surface (API responses, SSR cache,
 * client-side cache helpers) imports from HERE.
 *
 * Rule:  A product is publicly visible  ⟺  it has ≥ 1 valid image.
 *
 * "Valid" means the URL is a non-empty string that is NOT a placeholder,
 * a data-URI, a blob, or an obviously broken reference.
 *
 * Admin APIs / dashboard are NEVER filtered by this module.
 */

// ── Image validation ────────────────────────────────────────────────

/** Strings that should never count as a real product image. */
const INVALID_IMAGE_VALUES = new Set([
  "",
  "null",
  "undefined",
  "N/A",
  "n/a",
  "none",
  "/placeholder.svg",
]);

/**
 * Returns `true` when `url` points to a usable product image.
 *
 * Rejects:
 *  - falsy / non-string values
 *  - whitespace-only strings
 *  - known placeholder & sentinel values
 *  - data: / blob: URIs (partial uploads, corrupted refs)
 */
export function isValidImageUrl(url: unknown): url is string {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;
  if (INVALID_IMAGE_VALUES.has(trimmed)) return false;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return false;
  return true;
}

// ── Product-level checks ────────────────────────────────────────────

/**
 * Returns `true` when the product carries at least one valid image.
 *
 * Accepts both the cached shape (`images: string[]`) AND the raw ERP
 * shape (`image: string`), so it works at every layer of the stack.
 */
export function hasValidProductImage(
  product: { images?: unknown; image?: unknown }
): boolean {
  // Cached shape — `images` is an array
  const images = product.images;
  if (Array.isArray(images) && images.length > 0) {
    return images.some(isValidImageUrl);
  }

  // Raw ERP shape — `image` is a single string
  if (isValidImageUrl(product.image)) {
    return true;
  }

  return false;
}

/**
 * A product is publicly visible when it has at least one valid image.
 *
 * This predicate intentionally does NOT check `isActive` or
 * `Item_Isdisabled` — those are handled separately by the existing
 * query logic.  Keeping concerns orthogonal avoids surprises.
 */
export function isPubliclyVisible(
  product: { images?: unknown; image?: unknown }
): boolean {
  return hasValidProductImage(product);
}

// ── Array helpers ───────────────────────────────────────────────────

/**
 * Filters a product array, keeping only publicly visible products.
 *
 * Generic so it preserves the caller's concrete type.
 */
export function filterPublicProducts<
  T extends { images?: unknown; image?: unknown }
>(products: T[]): T[] {
  return products.filter(isPubliclyVisible);
}
