/**
 * lib/ai/stylist/vocabulary.ts
 *
 * The controlled vocabulary shared by every layer of the stylist:
 * the vision tagger writes it, the preference extractor writes it, and the
 * matcher compares it. Keeping one closed set is what makes matching
 * deterministic — free-text attributes could never be scored reliably.
 *
 * Values are lowercase, hyphen-free tokens.
 */

export const SILHOUETTES = [
  "a-line",
  "ball-gown",
  "mermaid",
  "trumpet",
  "sheath",
  "fitted",
  "straight",
  "empire",
] as const

export const NECKLINES = [
  "strapless",
  "off-shoulder",
  "v-neck",
  "square",
  "sweetheart",
  "high-neck",
  "halter",
  "one-shoulder",
  "scoop",
  "illusion",
] as const

export const SLEEVES = [
  "sleeveless",
  "short",
  "long",
  "off-shoulder",
  "cap",
  "three-quarter",
  "detachable",
] as const

export const EMBELLISHMENTS = [
  "lace",
  "beading",
  "embroidery",
  "sequins",
  "applique",
  "draping",
  "ruffles",
  "feathers",
  "bow",
  "minimal",
] as const

export const STYLES = [
  "romantic",
  "classic",
  "minimal",
  "modern",
  "dramatic",
  "glamorous",
  "feminine",
  "timeless",
  "contemporary",
  "regal",
] as const

export const VOLUMES = ["minimal", "medium", "dramatic"] as const
export const TRAINS = ["none", "short", "medium", "long", "dramatic"] as const

export const COLORS = [
  "white",
  "ivory",
  "champagne",
  "nude",
  "blush",
  "gold",
  "silver",
  "black",
  "navy",
  "red",
  "burgundy",
  "green",
  "blue",
  "pink",
  "lilac",
  "grey",
  "multicolor",
] as const

export const VENUES = [
  "ballroom",
  "garden",
  "beach",
  "hotel",
  "outdoor",
  "church",
  "rooftop",
] as const

export const SEASONS = ["summer", "winter", "spring", "autumn"] as const
export const TIMES = ["day", "evening"] as const
export const OCCASIONS = ["wedding", "engagement", "reception", "gala", "formal", "other"] as const

/** Storefront collections, as produced by `mapLineIdToCollection`. */
export const COLLECTIONS = ["wedding", "soiree"] as const

export type Silhouette = (typeof SILHOUETTES)[number]
export type Neckline = (typeof NECKLINES)[number]
export type Sleeve = (typeof SLEEVES)[number]
export type Embellishment = (typeof EMBELLISHMENTS)[number]
export type Style = (typeof STYLES)[number]
export type Volume = (typeof VOLUMES)[number]
export type Train = (typeof TRAINS)[number]
export type Color = (typeof COLORS)[number]
export type Venue = (typeof VENUES)[number]
export type Season = (typeof SEASONS)[number]
export type TimeOfDay = (typeof TIMES)[number]
export type Occasion = (typeof OCCASIONS)[number]
export type Collection = (typeof COLLECTIONS)[number]

/**
 * Filters an arbitrary list down to members of a vocabulary.
 * Both Gemini calls are schema-constrained, but a model can still emit a
 * near-miss ("ballgown", "V neck"), so every value crossing a boundary is
 * normalised here rather than trusted.
 */
export function coerceMany<T extends string>(
  values: unknown,
  vocabulary: readonly T[]
): T[] {
  if (!Array.isArray(values)) return []
  const allowed = new Set<string>(vocabulary)
  const out: T[] = []
  for (const raw of values) {
    const v = normalizeToken(raw)
    if (v && allowed.has(v) && !out.includes(v as T)) out.push(v as T)
  }
  return out
}

export function coerceOne<T extends string>(
  value: unknown,
  vocabulary: readonly T[]
): T | null {
  const v = normalizeToken(value)
  if (!v) return null
  return (vocabulary as readonly string[]).includes(v) ? (v as T) : null
}

/** "Ball Gown" / "ballgown" / "BALL_GOWN" → "ball-gown" */
function normalizeToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const v = raw.trim().toLowerCase().replace(/[\s_]+/g, "-")
  if (!v) return null

  const aliases: Record<string, string> = {
    ballgown: "ball-gown",
    "ball-gown": "ball-gown",
    aline: "a-line",
    "a-line": "a-line",
    offshoulder: "off-shoulder",
    "off-the-shoulder": "off-shoulder",
    vneck: "v-neck",
    "v-neckline": "v-neck",
    highneck: "high-neck",
    "high-neckline": "high-neck",
    "cap-sleeve": "cap",
    "long-sleeve": "long",
    "long-sleeves": "long",
    "short-sleeve": "short",
    "no-sleeves": "sleeveless",
    beads: "beading",
    beaded: "beading",
    sequin: "sequins",
    embroidered: "embroidery",
    appliqué: "applique",
    "glitter": "sequins",
    "off-white": "ivory",
    cream: "ivory",
  }

  return aliases[v] ?? v
}
