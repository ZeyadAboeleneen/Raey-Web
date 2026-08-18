/**
 * lib/ai/try-on-config.ts
 *
 * Single source of truth for every knob of the RAEY AI Try-On feature.
 * Nothing here may be imported into client components — the values are read
 * from server-only environment variables.
 *
 * All limits are configurable so they can be tuned in production without a
 * redeploy of application code.
 */

import { DEFAULT_TRYON_COLLECTIONS } from "./try-on-eligibility"

const int = (raw: string | undefined, fallback: number): number => {
  const n = parseInt(raw ?? "", 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/* ── AI provider ──────────────────────────────────────────────────── */

/** Which provider implementation `generateVirtualTryOn` dispatches to. */
export const TRYON_PROVIDER = (process.env.AI_TRYON_PROVIDER || "gemini").toLowerCase()

/**
 * Gemini native image generation/editing model ("Nano Banana 2").
 * Overridable so the model can be rolled forward without a code change.
 */
export const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image"

/** Hard ceiling on a single generation before we give up and show a retry. */
export const TRYON_TIMEOUT_MS = int(process.env.AI_TRYON_TIMEOUT_MS, 90_000)

/* ── Upload limits ────────────────────────────────────────────────── */

/** Largest raw upload we will accept from the browser (default 12 MB). */
export const TRYON_MAX_UPLOAD_BYTES = int(process.env.AI_TRYON_MAX_UPLOAD_BYTES, 12 * 1024 * 1024)

/** Minimum useful dimension — below this the photo cannot yield a good result. */
export const TRYON_MIN_DIMENSION = int(process.env.AI_TRYON_MIN_DIMENSION, 256)

/** Photos larger than this on the long edge are downscaled before generation. */
export const TRYON_MAX_DIMENSION = int(process.env.AI_TRYON_MAX_DIMENSION, 1536)

/** JPEG quality used when normalising both the person photo and the gown image. */
export const TRYON_JPEG_QUALITY = int(process.env.AI_TRYON_JPEG_QUALITY, 90)

/** Accepted upload mime types. Kept narrow on purpose. */
export const TRYON_ACCEPTED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const

/* ── Rate limiting ────────────────────────────────────────────────── */

/** Generations allowed per IP per rolling hour. */
export const TRYON_MAX_REQUESTS_PER_HOUR = int(process.env.AI_TRYON_MAX_REQUESTS_PER_HOUR, 8)

/** Generations allowed per IP per rolling day — stops slow-drip abuse. */
export const TRYON_MAX_REQUESTS_PER_DAY = int(process.env.AI_TRYON_MAX_REQUESTS_PER_DAY, 25)

/** Burst guard: generations per minute per IP. */
export const TRYON_MAX_REQUESTS_PER_MINUTE = int(process.env.AI_TRYON_MAX_REQUESTS_PER_MINUTE, 2)

/* ── Eligibility ──────────────────────────────────────────────────── */

/**
 * Collections whose products expose the "TRY IT ON" CTA. Defaults to the
 * wildcard — every dress, every collection, rent or buy. Set a comma-separated
 * list to narrow it. ERP collections arrive lowercase from
 * `mapLineIdToCollection`.
 */
export const TRYON_ELIGIBLE_COLLECTIONS = (
  process.env.AI_TRYON_COLLECTIONS || DEFAULT_TRYON_COLLECTIONS.join(",")
)
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean)

/** Master switch — lets the feature be dark-launched. */
export const TRYON_ENABLED = (process.env.AI_TRYON_ENABLED ?? "true").toLowerCase() !== "false"
