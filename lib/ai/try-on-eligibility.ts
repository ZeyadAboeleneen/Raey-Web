/**
 * lib/ai/try-on-eligibility.ts
 *
 * Client-safe eligibility predicate. Imported by both the product page (to
 * decide whether to render the CTA) and the API route (to enforce it).
 *
 * The browser copy is a hint only — `app/api/ai/virtual-try-on/route.ts`
 * re-checks against the server config before spending a Gemini call.
 */

/** Wildcard entry: every dress is eligible, whatever its collection. */
export const ALL_COLLECTIONS = "*"

/**
 * Default allow-list. Every collection is eligible — wedding, soiree and
 * anything the ERP adds later — for both rent and buy. Narrow it by setting
 * AI_TRYON_COLLECTIONS to a comma-separated list (e.g. "wedding,soiree").
 */
export const DEFAULT_TRYON_COLLECTIONS = [ALL_COLLECTIONS]

export function isTryOnEligible(
  collection: string | null | undefined,
  allowed: string[] = DEFAULT_TRYON_COLLECTIONS
): boolean {
  // Wildcard short-circuits before the collection is even inspected, so a
  // product the ERP left uncategorised is still eligible.
  if (allowed.includes(ALL_COLLECTIONS)) return true

  if (!collection) return false
  const normalized = collection.trim().toLowerCase()
  if (!normalized) return false
  return allowed.some((c) => normalized === c || normalized.includes(c))
}
