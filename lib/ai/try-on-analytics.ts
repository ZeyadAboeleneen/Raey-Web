/**
 * lib/ai/try-on-analytics.ts
 *
 * Try-On funnel events, on top of the site's existing GA wrapper.
 *
 * Only non-sensitive metadata is ever emitted: product id, collection,
 * success/failure and timing. The shopper's photo and the generated image are
 * never included in an analytics payload, in any form.
 */

import { trackEvent } from "@/lib/gtag"

export type TryOnEvent =
  | "try_on_opened"
  | "try_on_photo_uploaded"
  | "try_on_generation_started"
  | "try_on_generation_success"
  | "try_on_generation_failed"
  | "try_on_result_viewed"
  | "try_on_saved"
  | "try_on_shared"
  | "try_on_appointment_clicked"

export interface TryOnEventParams {
  product_id?: string
  collection?: string
  branch?: string
  /** Milliseconds spent generating — success and failure alike. */
  duration_ms?: number
  /** Safe machine code, e.g. "TIMEOUT". Never a raw provider message. */
  error_code?: string
  /** How the shopper supplied the photo. */
  source?: "upload" | "camera"
  method?: string
}

export function trackTryOn(event: TryOnEvent, params: TryOnEventParams = {}): void {
  const payload: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) payload[key] = value
  }

  try {
    trackEvent(event, payload)
  } catch {
    // Analytics must never break the experience.
  }
}
