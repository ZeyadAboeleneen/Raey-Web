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
 */
export const STYLIST_CHAT_MODEL = process.env.AI_STYLIST_MODEL || "gemini-2.5-flash"

/** Vision model used to catalogue gown photographs into attributes. */
export const STYLIST_VISION_MODEL = process.env.AI_STYLIST_VISION_MODEL || "gemini-2.5-flash"

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
