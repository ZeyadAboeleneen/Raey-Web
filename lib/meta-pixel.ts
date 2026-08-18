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

// =============================================================================
// Page naming (used by PageView and by the button/link tracker below)
// =============================================================================
//
// A small, explicit route → human name table, matching this app's actual
// route structure (see app/**/page.tsx). Ordered most-specific-first. This is
// the one place that maps a path to a name — both PageView and ButtonClick
// events read it, so the two can never disagree about what a page is called.

interface PageNameRule {
  test: RegExp
  name: string
}

const PAGE_NAME_RULES: PageNameRule[] = [
  { test: /^\/$/, name: 'Home' },
  { test: /^\/about\/?$/, name: 'About Us' },
  { test: /^\/contact\/?$/, name: 'Contact Us' },
  { test: /^\/stylist\/?$/, name: 'AI Stylist' },
  { test: /^\/favorites\/?$/, name: 'Favorites' },
  { test: /^\/cart\/?$/, name: 'Cart' },
  { test: /^\/checkout\/success\/?$/, name: 'Order Confirmation' },
  { test: /^\/checkout\/?$/, name: 'Checkout' },
  { test: /^\/auth\/login\/?$/, name: 'Login' },
  { test: /^\/auth\/register\/?$/, name: 'Register' },
  { test: /^\/auth\/forgot-password\/?$/, name: 'Forgot Password' },
  { test: /^\/user\/dashboard\/?$/, name: 'My Account' },
  { test: /^\/products\/[^/]+\/[^/]+\/?$/, name: 'Product Detail' }, // /products/:branch/:productId
  { test: /^\/products\/[^/]+\/?$/, name: 'Products' }, // /products/:branch
  { test: /^\/wedding\/products\/?$/, name: 'All Wedding Dresses' },
  { test: /^\/soiree\/products\/?$/, name: 'All Soirée Dresses' },
  { test: /^\/wedding\/[^/]+\/?$/, name: 'Wedding Collection' }, // /wedding/:branch
  { test: /^\/soiree\/[^/]+\/?$/, name: 'Soirée Collection' }, // /soiree/:branch
  { test: /^\/wedding\/?$/, name: 'Wedding Collection' },
  { test: /^\/soiree\/?$/, name: 'Soirée Collection' },
  { test: /^\/slideshow\/?$/, name: 'Slideshow' },
]

/** Turns "forgot-password" / "el_raey_1" into "Forgot Password" / "El Raey 1". */
function humanizeSegment(segment: string): string {
  return segment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Maps a path to a short, human-readable page name.
 *
 * Falls back to humanizing the last path segment (never the full URL) for
 * routes not in the table above — e.g. a future `/lookbook` page reads as
 * "Lookbook" rather than being unnamed or showing the raw path.
 */
export function getPageName(pathname: string): string {
  const path = (pathname || '/').split('?')[0].split('#')[0]
  for (const rule of PAGE_NAME_RULES) {
    if (rule.test.test(path)) return rule.name
  }
  const segments = path.split('/').filter(Boolean)
  return segments.length ? humanizeSegment(segments[segments.length - 1]) : 'Home'
}

// =============================================================================
// Site-wide button/link click tracking
// =============================================================================
//
// The product flows above (ViewContent, AddToCart, Purchase, InitiateCheckout)
// stay exactly as they are — they carry real price/currency/content_id data
// and must only ever be fired from those specific, deliberate call sites. This
// section never fires those events and never substitutes for them.
//
// Every other button and button-styled link on the site is covered generically
// by <MetaPixelButtonTracker/> (mounted once in the root layout), which reports
// the EXACT control clicked — not a category — via one custom event:
//
//   ButtonClick  { button_name, page_name, page_path, element_type, destination }
//
// A small number of button texts additionally have a genuine Meta standard-
// event meaning (a WhatsApp button really is a "Contact" action). For those,
// the standard event fires TOO, carrying the same exact name — it never
// replaces the ButtonClick event, and the list is short and conservative on
// purpose: firing the wrong standard conversion event (Purchase, Lead,
// CompleteRegistration, AddPaymentInfo, etc.) pollutes the exact
// ad-optimization signals those events exist for, so only a fixed, explicit
// set of unambiguous categories is eligible — this function can never return
// one of the transactional events above.

/** The one event every generic button/link click fires, carrying its exact name. */
export const BUTTON_CLICK_EVENT = 'ButtonClick'

interface ButtonKeywordRule {
  /** A real Meta standard event — never one of the transactional ones above. */
  event: string
  /** Lower-cased English/Arabic/Franco phrases matched against the button's name. */
  keywords: string[]
}

const BUTTON_EVENT_RULES: ButtonKeywordRule[] = [
  {
    event: 'Contact',
    keywords: ['whatsapp', 'واتساب', 'وتساب', 'call us', 'اتصل', 'contact us', 'تواصل', 'راسل'],
  },
  {
    event: 'CustomizeProduct',
    keywords: ['try it on', 'try-it-on', 'try on', 'ai stylist', 'ai try-on', 'جربيه', 'جربي', 'جرب'],
  },
  {
    event: 'FindLocation',
    keywords: ['our branches', 'find a branch', 'store location', 'branches', 'الفروع', 'فروعنا', 'أقرب فرع'],
  },
  {
    event: 'Subscribe',
    keywords: ['subscribe', 'newsletter', 'اشترك', 'النشرة البريدية'],
  },
  {
    event: 'AddToWishlist',
    keywords: ['add to favorites', 'add to wishlist', 'remove from favorites', 'اضافة للمفضلة', 'المفضلة'],
  },
  {
    event: 'Search',
    keywords: ['search', 'بحث', 'دور على'],
  },
]

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g

/**
 * Whether `haystack` contains `keyword`. Single ASCII words are matched on a
 * real word boundary — a naive substring check would match "search" inside
 * "research". Phrases and non-ASCII (Arabic) keywords use plain substring
 * matching, where that collision risk doesn't apply the same way.
 */
function matchesKeyword(haystack: string, keyword: string): boolean {
  const isSingleAsciiWord = /^[\x00-\x7F]+$/.test(keyword) && !keyword.includes(' ')
  if (isSingleAsciiWord) {
    return new RegExp(`\\b${keyword.replace(REGEX_ESCAPE, '\\$&')}\\b`).test(haystack)
  }
  return haystack.includes(keyword)
}

/**
 * Maps a button/link's exact name to an ADDITIONAL Meta standard event, or
 * null when none applies. Never returns a transactional event — this is the
 * complete, fixed set of categories inferable from text alone.
 */
export function matchStandardEvent(name: string): string | null {
  const lower = name.toLowerCase()
  for (const rule of BUTTON_EVENT_RULES) {
    if (rule.keywords.some((kw) => matchesKeyword(lower, kw))) return rule.event
  }
  return null
}

export interface ButtonInteraction {
  /** The exact, visible name of the control — never a category. */
  buttonName: string
  pageName: string
  pagePath: string
  elementType: string
  /** href for links; empty string when not applicable. */
  destination?: string
}

/**
 * Reports one button/link click: always the detailed `ButtonClick` custom
 * event carrying the exact control clicked, and additionally the matching
 * Meta standard event when the name has a genuine marketing meaning (see
 * `matchStandardEvent`) — the standard event never replaces the detailed one.
 *
 * Called by <MetaPixelButtonTracker/>. Page code tracking a specific,
 * deliberate action (add to cart, purchase, etc.) should keep using the typed
 * helpers above instead — this function is for the generic site-wide layer.
 */
export function fbTrackInteraction(details: ButtonInteraction) {
  const payload = {
    button_name: details.buttonName,
    page_name: details.pageName,
    page_path: details.pagePath,
    element_type: details.elementType,
    destination: details.destination ?? '',
  }

  fbCustomEvent(BUTTON_CLICK_EVENT, payload)

  const standardEvent = matchStandardEvent(details.buttonName)
  if (standardEvent) {
    fbEvent(standardEvent, {
      content_name: details.buttonName,
      page_name: details.pageName,
      page_path: details.pagePath,
    })
  }
}
