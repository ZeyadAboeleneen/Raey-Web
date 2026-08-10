// =============================================================================
// Meta Pixel (Facebook Pixel) – Utility helpers
// Pixel ID: 1051747087351896
// =============================================================================

export const META_PIXEL_ID = '1051747087351896'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://raeygroup.com').replace(/\/$/, '')

/**
 * Meta's Commerce Manager catalog was populated by auto-scraping this site's
 * Product JSON-LD, which uses `${productUrl}#product` as its `@id` (see
 * app/products/[branch]/[product]/page.tsx). Every existing catalog entry's
 * "Content ID" is that exact URL — confirmed directly in Commerce Manager,
 * e.g. "https://raeygroup.com/products/mona-saleh/4052#product" — not the
 * bare numeric item id and not the SKU. Pixel events must send this same
 * value so they match the catalog Meta already has.
 */
export const buildMetaContentId = (branch: string, productId: string | number): string =>
  `${SITE_URL}/products/${branch}/${productId}#product`

// ---------------------------------------------------------------------------
// Typed helpers for Meta Pixel standard & custom events.
// Call these from any client component after the pixel script has loaded.
// Docs: https://developers.facebook.com/docs/meta-pixel/reference
// ---------------------------------------------------------------------------

/** Generic wrapper – fires any standard or custom event. */
export const fbEvent = (
  eventName: string,
  params?: Record<string, string | number | boolean | string[]>,
) => {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', eventName, params ?? {})
  }
}

// ---- Standard ecommerce events ------------------------------------------

/**
 * Fires the Purchase event after a completed transaction.
 * `contentIds` must be the same `${productUrl}#product` values used
 * everywhere else (see buildMetaContentId) — sent as a real array, per
 * Meta's spec, not a joined string.
 */
export const fbTrackPurchase = (
  value: number,
  currency = 'EGP',
  contentIds?: string[],
  contentType = 'product',
) => {
  fbEvent('Purchase', {
    value,
    currency,
    ...(contentIds && contentIds.length ? { content_ids: contentIds } : {}),
    content_type: contentType,
  })
}

/** Fires the AddToCart event when a product is actually added to the cart. */
export const fbTrackAddToCart = (
  productName: string,
  value: number,
  currency = 'EGP',
  contentId?: string,
) => {
  fbEvent('AddToCart', {
    content_name: productName,
    value,
    currency,
    ...(contentId ? { content_ids: [contentId], content_type: 'product' } : {}),
  })
}

/** Fires the ViewContent event on product detail pages. */
export const fbTrackViewContent = (
  productName: string,
  value: number,
  currency = 'EGP',
  contentId?: string,
) => {
  fbEvent('ViewContent', {
    content_name: productName,
    value,
    currency,
    ...(contentId ? { content_ids: [contentId], content_type: 'product' } : {}),
  })
}

/** Fires the InitiateCheckout event when a user starts checkout. */
export const fbTrackInitiateCheckout = (
  value: number,
  currency = 'EGP',
  numItems?: number,
) => {
  fbEvent('InitiateCheckout', {
    value,
    currency,
    ...(numItems !== undefined ? { num_items: numItems } : {}),
  })
}

/** Fires the Search event when a user performs a search. */
export const fbTrackSearch = (searchString: string) => {
  fbEvent('Search', { search_string: searchString })
}

/** Fires the AddToWishlist event. */
export const fbTrackAddToWishlist = (
  productName: string,
  value: number,
  currency = 'EGP',
) => {
  fbEvent('AddToWishlist', {
    content_name: productName,
    value,
    currency,
  })
}

/** Fires the Lead event (e.g. newsletter signup, contact form). */
export const fbTrackLead = (params?: Record<string, string | number | boolean>) => {
  fbEvent('Lead', params)
}

/** Fires the CompleteRegistration event. */
export const fbTrackCompleteRegistration = (method?: string) => {
  fbEvent('CompleteRegistration', method ? { method } : {})
}

// ---- Custom events -------------------------------------------------------

/** Fire an arbitrary custom event (shows as "Custom" in Events Manager). */
export const fbCustomEvent = (
  eventName: string,
  params?: Record<string, string | number | boolean>,
) => {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('trackCustom', eventName, params ?? {})
  }
}
