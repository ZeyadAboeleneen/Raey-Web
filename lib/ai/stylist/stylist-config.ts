/**
 * lib/ai/stylist/stylist-config.ts
 *
 * Server-only configuration for the RAEY AI Stylist.
 */

const int = (raw: string | undefined, fallback: number): number => {
  const n = parseInt(raw ?? "", 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Master switch — hides the entrypoint and disables the endpoint. */
export const STYLIST_ENABLED = (process.env.AI_STYLIST_ENABLED ?? "true").toLowerCase() !== "false"

/**
 * Conversation model. Needs strong multilingual ability (Egyptian Arabic and
 * Arabizi in particular) and structured JSON output.
 *
 * `gemini-flash-lite-latest` rather than `gemini-2.5-flash`: it sits on its
 * own free-tier quota bucket, while 2.5-flash and flash-latest share one that
 * a catalogue backfill can exhaust for the rest of the day — taking the live
 * stylist down with it. It answered the whole consultation well in testing
 * (correct Egyptian Arabic register, clean structured output) and is faster.
 * Set AI_STYLIST_MODEL to move back to a heavier model on a paid key.
 */
export const STYLIST_CHAT_MODEL = process.env.AI_STYLIST_MODEL || "gemini-flash-lite-latest"

/** Vision model used to catalogue gown photographs into attributes. */
export const STYLIST_VISION_MODEL = process.env.AI_STYLIST_VISION_MODEL || "gemini-2.5-flash"

/**
 * Model that reads a shopper's inspiration photo into the catalogue's
 * vocabulary. A constrained-schema extraction, which the lite model does
 * accurately (0.98 confidence on a test gown) and quickly.
 *
 * Note this currently matches STYLIST_CHAT_MODEL, so a photo turn puts all
 * three of its upstream calls — read the photo, understand, explain — on one
 * free-tier bucket. That was fine in testing, but it is the first thing to
 * change if photo turns start hitting quota: point this at a model on the
 * other bucket (`gemini-flash-latest`) via AI_STYLIST_INSPIRATION_MODEL and
 * the photo read stops competing with the conversation.
 */
export const STYLIST_INSPIRATION_MODEL =
  process.env.AI_STYLIST_INSPIRATION_MODEL || "gemini-flash-lite-latest"

/**
 * Ceiling for the photo read specifically, well under the conversation
 * timeout. If reading her photo is going to fail, it must fail fast enough to
 * still answer her as a normal text turn rather than spending the whole
 * request budget retrying and then timing out with nothing to show.
 */
export const STYLIST_IMAGE_TIMEOUT_MS = int(process.env.AI_STYLIST_IMAGE_TIMEOUT_MS, 20_000)

/** Where the derived attribute index is persisted. */
export const STYLIST_INDEX_PATH =
  process.env.AI_STYLIST_INDEX_PATH || ".raey-stylist-index.json"

/** Recommendations returned per turn. The brief asks for 3-5, never 20. */
export const STYLIST_MIN_RESULTS = int(process.env.AI_STYLIST_MIN_RESULTS, 3)
export const STYLIST_MAX_RESULTS = int(process.env.AI_STYLIST_MAX_RESULTS, 5)

/**
 * How many un-catalogued gowns a single request may nudge into the index.
 * This runs in the background, after the response is on its way, so it is kept
 * small: vision calls are seconds each and share the upstream per-minute quota
 * with live conversations. Bulk backfill belongs to POST /api/ai/stylist/index.
 */
export const STYLIST_LAZY_TAG_BUDGET = int(process.env.AI_STYLIST_LAZY_TAG_BUDGET, 3)

/** Turns of history sent upstream. Keeps latency and payload bounded. */
export const STYLIST_HISTORY_TURNS = int(process.env.AI_STYLIST_HISTORY_TURNS, 12)

/** Per-IP rate limits. */
export const STYLIST_MAX_MESSAGES_PER_MINUTE = int(process.env.AI_STYLIST_MAX_PER_MINUTE, 12)
export const STYLIST_MAX_MESSAGES_PER_HOUR = int(process.env.AI_STYLIST_MAX_PER_HOUR, 120)

/** Upstream call ceiling. */
export const STYLIST_TIMEOUT_MS = int(process.env.AI_STYLIST_TIMEOUT_MS, 45_000)

/** Longest shopper message accepted, in characters. */
export const STYLIST_MAX_MESSAGE_CHARS = int(process.env.AI_STYLIST_MAX_MESSAGE_CHARS, 1200)

/**
 * Inspiration photos ("I want something like this").
 *
 * The browser downscales before upload, so this ceiling is a guard against a
 * hand-crafted payload rather than a real user's camera roll. Kept well under
 * the body limit because every byte here is also sent upstream to the vision
 * model on a shared free-tier quota.
 */
export const STYLIST_IMAGE_MAX_BYTES = int(process.env.AI_STYLIST_IMAGE_MAX_BYTES, 4_000_000)

/** Formats the vision model accepts and the browser can produce. */
export const STYLIST_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

/**
 * A tighter per-IP ceiling for photo turns specifically: each one costs an
 * extra vision call, which is the scarce resource on the free tier. A text
 * conversation is cheap; a hundred uploads is not.
 */
export const STYLIST_MAX_IMAGES_PER_HOUR = int(process.env.AI_STYLIST_MAX_IMAGES_PER_HOUR, 20)

/**
 * "Is this actually one of OUR dresses?" recognition.
 *
 * The attribute-similarity ranking (matcher.ts) only ever finds gowns that
 * LOOK alike by 8 loose tags — silhouette, colour, neckline, and so on. It has
 * no concept of "this literally is the same garment", so a shopper's photo of
 * a RAEY dress worn by a different model, in a different photo, can lose to a
 * merely-similar dress in the ranking, or land the shopper on an entirely
 * different gown that happens to share the same tags. This pass compares her
 * photo directly against a shortlist of catalogue photos to catch that case.
 */
export const STYLIST_EXACT_MATCH_MODEL =
  process.env.AI_STYLIST_EXACT_MATCH_MODEL || "gemini-flash-lite-latest"

/** How many attribute-ranked candidates get shown to the recognition pass. */
export const STYLIST_EXACT_MATCH_CANDIDATES = int(process.env.AI_STYLIST_EXACT_MATCH_CANDIDATES, 12)

/** Side each candidate thumbnail is resized to before the comparison call —
    keeps every image at Gemini's flat 258-token tile rate regardless of the
    catalogue photo's real size. */
export const STYLIST_EXACT_MATCH_THUMB_PX = int(process.env.AI_STYLIST_EXACT_MATCH_THUMB_PX, 384)

export const STYLIST_EXACT_MATCH_TIMEOUT_MS = int(process.env.AI_STYLIST_EXACT_MATCH_TIMEOUT_MS, 20_000)
