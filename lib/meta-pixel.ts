<<<<<<< HEAD
// =============================================================================
// Meta Pixel (Facebook Pixel) – Utility helpers
// Pixel ID: 1047926623793568
// =============================================================================

export const META_PIXEL_ID = '1047926623793568'

// ---------------------------------------------------------------------------
// Typed helpers for Meta Pixel standard & custom events.
// Call these from any client component after the pixel script has loaded.
// Docs: https://developers.facebook.com/docs/meta-pixel/reference
// ---------------------------------------------------------------------------

/** Generic wrapper – fires any standard or custom event. */
export const fbEvent = (
  eventName: string,
  params?: Record<string, string | number | boolean>,
) => {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', eventName, params ?? {})
  }
}

// ---- Standard ecommerce events ------------------------------------------

/** Fires the Purchase event after a completed transaction. */
export const fbTrackPurchase = (
  value: number,
  currency = 'EGP',
  contentIds?: string[],
  contentType = 'product',
) => {
  fbEvent('Purchase', {
    value,
    currency,
    ...(contentIds ? { content_ids: contentIds.join(',') } : {}),
    content_type: contentType,
  })
}

/** Fires the AddToCart event when a product is added to the cart. */
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
    ...(contentId ? { content_ids: contentId, content_type: 'product' } : {}),
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
    ...(contentId ? { content_ids: contentId, content_type: 'product' } : {}),
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
=======
/**
 * Meta Pixel (Facebook Pixel) Utilities
 * 
 * Pixel ID: 1047926623793568
 * 
 * This module provides type-safe helpers for tracking Meta Pixel events.
 * The pixel base code is loaded by the <MetaPixel /> component in the root layout.
 * 
 * Usage examples:
 *   import { trackEvent, trackPurchase, trackAddToCart } from '@/lib/meta-pixel'
 *   
 *   // Track a purchase
 *   trackPurchase({ value: 299.99, currency: 'EGP' })
 *   
 *   // Track add to cart
 *   trackAddToCart({ content_name: 'Red Soirée Gown', content_ids: ['4258'], value: 150, currency: 'EGP' })
 *   
 *   // Track any custom event
 *   trackEvent('Lead', { content_name: 'Newsletter Signup' })
 */

export const META_PIXEL_ID = '1047926623793568'

// ─── Type Definitions ────────────────────────────────────────────────────────

/** Standard Meta Pixel event names */
export type MetaStandardEvent =
  | 'AddPaymentInfo'
  | 'AddToCart'
  | 'AddToWishlist'
  | 'CompleteRegistration'
  | 'Contact'
  | 'CustomizeProduct'
  | 'Donate'
  | 'FindLocation'
  | 'InitiateCheckout'
  | 'Lead'
  | 'PageView'
  | 'Purchase'
  | 'Schedule'
  | 'Search'
  | 'StartTrial'
  | 'SubmitApplication'
  | 'Subscribe'
  | 'ViewContent'

export interface PurchaseData {
  value: number
  currency: string
  content_ids?: string[]
  content_type?: string
  contents?: Array<{ id: string; quantity: number }>
  num_items?: number
}

export interface AddToCartData {
  content_name?: string
  content_ids?: string[]
  content_type?: string
  value?: number
  currency?: string
}

export interface ViewContentData {
  content_name?: string
  content_ids?: string[]
  content_type?: string
  value?: number
  currency?: string
  content_category?: string
}

export interface InitiateCheckoutData {
  value?: number
  currency?: string
  content_ids?: string[]
  num_items?: number
}

// ─── Core Tracking Functions ─────────────────────────────────────────────────

/**
 * Safely call fbq — returns silently if the pixel hasn't loaded yet
 * or if running on the server.
 */
function getFbq(): Function | null {
  if (typeof window === 'undefined') return null
  return (window as any).fbq ?? null
}

/**
 * Track a standard Meta Pixel event.
 * @param eventName - The standard event name (e.g., 'Purchase', 'AddToCart')
 * @param data - Optional event parameters
 */
export function trackEvent(eventName: MetaStandardEvent, data?: Record<string, any>): void {
  const fbq = getFbq()
  if (!fbq) return
  if (data) {
    fbq('track', eventName, data)
  } else {
    fbq('track', eventName)
  }
}

/**
 * Track a custom (non-standard) event.
 * @param eventName - Your custom event name
 * @param data - Optional event parameters
 */
export function trackCustomEvent(eventName: string, data?: Record<string, any>): void {
  const fbq = getFbq()
  if (!fbq) return
  if (data) {
    fbq('trackCustom', eventName, data)
  } else {
    fbq('trackCustom', eventName)
  }
}

// ─── Pre-built Event Helpers ─────────────────────────────────────────────────

/** Track a purchase event */
export function trackPurchase(data: PurchaseData): void {
  trackEvent('Purchase', data)
}

/** Track an add-to-cart event */
export function trackAddToCart(data: AddToCartData): void {
  trackEvent('AddToCart', data)
}

/** Track a view-content event (e.g., product page view) */
export function trackViewContent(data: ViewContentData): void {
  trackEvent('ViewContent', data)
}

/** Track initiate checkout */
export function trackInitiateCheckout(data?: InitiateCheckoutData): void {
  trackEvent('InitiateCheckout', data)
}

/** Track add to wishlist */
export function trackAddToWishlist(data?: AddToCartData): void {
  trackEvent('AddToWishlist', data)
}

/** Track completed registration */
export function trackCompleteRegistration(data?: Record<string, any>): void {
  trackEvent('CompleteRegistration', data)
}

/** Track a search event */
export function trackSearch(searchString: string): void {
  trackEvent('Search', { search_string: searchString })
}

/** Track a contact event */
export function trackContact(): void {
  trackEvent('Contact')
}

/** Track a lead event */
export function trackLead(data?: Record<string, any>): void {
  trackEvent('Lead', data)
}
>>>>>>> 5270b62d89cf27b9e6962b1b45f56ac2232df669
