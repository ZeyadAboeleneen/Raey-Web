import { sendGAEvent } from '@next/third-parties/google'

export const GA_MEASUREMENT_ID = 'G-F487HSDE42'

// Track custom events (e.g., button clicks, purchases, form submissions)
export const trackEvent = (eventName: string, params?: Record<string, string | number | boolean>) => {
  sendGAEvent('event', eventName, params ?? {})
}

// Common event helpers
export const trackButtonClick = (buttonName: string) => {
  trackEvent('button_click', { button_name: buttonName })
}

export const trackPurchase = (value: number, currency = 'EGP') => {
  trackEvent('purchase', { value, currency })
}

export const trackAddToCart = (productName: string, price: number) => {
  trackEvent('add_to_cart', { product_name: productName, price })
}

export const trackSearch = (searchTerm: string) => {
  trackEvent('search', { search_term: searchTerm })
}
