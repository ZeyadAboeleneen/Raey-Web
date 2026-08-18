/**
 * lib/ai/stylist/stylist-analytics.ts
 *
 * Stylist funnel events, on the site's existing GA wrapper.
 *
 * Never carries conversation content: no message text, no preference profile,
 * no reasons. Only product ids, collection, counts and outcomes.
 */

import { trackEvent } from "@/lib/gtag"

export type StylistEvent =
  | "ai_stylist_opened"
  | "ai_stylist_message_sent"
  | "ai_dress_search"
  | "ai_recommendation_shown"
  | "ai_recommendation_clicked"
  | "ai_product_rejected"
  | "ai_similar_requested"
  | "ai_try_on_clicked"
  | "ai_whatsapp_clicked"

export interface StylistEventParams {
  product_id?: string
  collection?: string
  /** How many dresses were shown. Never what they were chosen from. */
  result_count?: number
  /** Language tag only — never the message itself. */
  language?: string
  mode?: "chat" | "describe"
  reason_code?: string
  duration_ms?: number
}

export function trackStylist(event: StylistEvent, params: StylistEventParams = {}): void {
  const payload: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) payload[key] = value
  }
  try {
    trackEvent(event, payload)
  } catch {
    // Analytics must never break the consultation.
  }
}
