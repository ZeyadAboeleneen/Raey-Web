/**
 * lib/ai/stylist/preferences.ts
 *
 * The preference profile the stylist maintains across a conversation, plus the
 * merge rules that let it evolve without restarting.
 *
 * The profile is never shown to the shopper. It travels client → server on
 * each turn (the conversation is session-only; see `lib/stylist-session.ts`)
 * and is re-validated here on arrival, so a tampered payload cannot inject
 * anything outside the vocabulary.
 */

import {
  COLLECTIONS,
  COLORS,
  EMBELLISHMENTS,
  NECKLINES,
  OCCASIONS,
  SEASONS,
  SILHOUETTES,
  SLEEVES,
  STYLES,
  TIMES,
  TRAINS,
  VENUES,
  VOLUMES,
  coerceMany,
  coerceOne,
  type Collection,
  type Color,
  type Embellishment,
  type Neckline,
  type Occasion,
  type Season,
  type Silhouette,
  type Sleeve,
  type Style,
  type TimeOfDay,
  type Train,
  type Venue,
  type Volume,
} from "./vocabulary"

/** Attributes the shopper has ruled out. Honoured as hard filters by the matcher. */
export interface Avoidances {
  silhouette: Silhouette[]
  neckline: Neckline[]
  sleeves: Sleeve[]
  embellishment: Embellishment[]
  color: Color[]
  style: Style[]
  volume: Volume[]
}

export interface StylistPreferences {
  /** BCP-47-ish tag the shopper is writing in, e.g. "ar-EG", "en", "arabizi". */
  language: string | null
  occasion: Occasion | null
  collection: Collection | null
  style: Style[]
  silhouette: Silhouette[]
  neckline: Neckline[]
  sleeves: Sleeve[]
  embellishment: Embellishment[]
  color: Color[]
  volume: Volume | null
  train: Train | null
  venue: Venue | null
  season: Season | null
  time: TimeOfDay | null
  /** Product ids the shopper reacted well to. */
  likes: string[]
  /** Product ids the shopper rejected. Never recommended again this session. */
  rejectedProductIds: string[]
  /** Product ids already shown, so follow-ups bring something new. */
  shownProductIds: string[]
  avoid: Avoidances
  /** Budget ceiling in EGP, when the shopper mentions one. */
  maxPrice: number | null
  /**
   * The day she needs the dress for, as `YYYY-MM-DD`, when she names one.
   *
   * Gowns already booked across that date are dropped from the results — a
   * bride should never fall for a card that turns out to be unavailable for
   * the one date she cares about.
   */
  eventDate: string | null
}

export function emptyPreferences(): StylistPreferences {
  return {
    language: null,
    occasion: null,
    collection: null,
    style: [],
    silhouette: [],
    neckline: [],
    sleeves: [],
    embellishment: [],
    color: [],
    volume: null,
    train: null,
    venue: null,
    season: null,
    time: null,
    likes: [],
    rejectedProductIds: [],
    shownProductIds: [],
    avoid: {
      silhouette: [],
      neckline: [],
      sleeves: [],
      embellishment: [],
      color: [],
      style: [],
      volume: [],
    },
    maxPrice: null,
    eventDate: null,
  }
}

/**
 * Accepts a `YYYY-MM-DD` the model extracted, if it is a real date a wedding
 * could plausibly fall on. A misread year ("2019") or a parse failure must
 * not silently filter the entire catalogue down to nothing.
 */
export function sanitizeEventDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return null

  const today = new Date()
  const earliest = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)
  const latest = new Date(today.getTime() + 3 * 365 * 24 * 60 * 60 * 1000)
  if (date < earliest || date > latest) return null

  return value
}

const idList = (v: unknown, cap = 60): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && /^\d{1,10}$/.test(x)).slice(-cap)
    : []

/** Re-validates a profile arriving from the browser against the vocabulary. */
export function sanitizePreferences(raw: any): StylistPreferences {
  const base = emptyPreferences()
  if (!raw || typeof raw !== "object") return base

  const language =
    typeof raw.language === "string" && raw.language.length <= 12 ? raw.language : null

  const price = Number(raw.maxPrice)

  return {
    language,
    occasion: coerceOne(raw.occasion, OCCASIONS),
    collection: coerceOne(raw.collection, COLLECTIONS),
    style: coerceMany(raw.style, STYLES),
    silhouette: coerceMany(raw.silhouette, SILHOUETTES),
    neckline: coerceMany(raw.neckline, NECKLINES),
    sleeves: coerceMany(raw.sleeves, SLEEVES),
    embellishment: coerceMany(raw.embellishment, EMBELLISHMENTS),
    color: coerceMany(raw.color, COLORS),
    volume: coerceOne(raw.volume, VOLUMES),
    train: coerceOne(raw.train, TRAINS),
    venue: coerceOne(raw.venue, VENUES),
    season: coerceOne(raw.season, SEASONS),
    time: coerceOne(raw.time, TIMES),
    likes: idList(raw.likes),
    rejectedProductIds: idList(raw.rejectedProductIds),
    shownProductIds: idList(raw.shownProductIds),
    avoid: {
      silhouette: coerceMany(raw?.avoid?.silhouette, SILHOUETTES),
      neckline: coerceMany(raw?.avoid?.neckline, NECKLINES),
      sleeves: coerceMany(raw?.avoid?.sleeves, SLEEVES),
      embellishment: coerceMany(raw?.avoid?.embellishment, EMBELLISHMENTS),
      color: coerceMany(raw?.avoid?.color, COLORS),
      style: coerceMany(raw?.avoid?.style, STYLES),
      volume: coerceMany(raw?.avoid?.volume, VOLUMES),
    },
    maxPrice: Number.isFinite(price) && price > 0 ? price : null,
    eventDate: sanitizeEventDate(raw.eventDate),
  }
}

const union = <T>(a: T[], b: T[]): T[] => Array.from(new Set([...a, ...b]))

/**
 * Applies a turn's delta to the running profile.
 *
 * Rules that matter:
 *  - A newly avoided attribute is removed from the "wanted" side. Saying
 *    "not strapless" after asking for strapless must actually drop it, or the
 *    matcher would score a dress up and filter it out at the same time.
 *  - Scalars (volume/train/venue/…) overwrite; the latest statement wins.
 *  - Lists union, so preferences accumulate as the conversation develops —
 *    except when the delta explicitly replaces them (see `replace`).
 */
export function mergePreferences(
  current: StylistPreferences,
  delta: Partial<StylistPreferences> & { replace?: (keyof StylistPreferences)[] },
): StylistPreferences {
  const replace = new Set(delta.replace ?? [])
  const listOf = <K extends keyof StylistPreferences>(key: K, incoming: any[]): any[] =>
    replace.has(key) ? incoming : union(current[key] as any[], incoming)
  // A `replace`-flagged scalar resets to whatever the delta says (null if the
  // model didn't restate it) rather than falling back to the old value — that
  // fallback is exactly what made a stale "minimal" or "hotel" linger forever
  // once she'd moved past it.
  const scalarOf = <K extends keyof StylistPreferences>(key: K, incoming: any): any =>
    replace.has(key) ? incoming ?? null : incoming ?? current[key]

  const next: StylistPreferences = {
    ...current,
    language: delta.language ?? current.language,
    occasion: scalarOf("occasion", delta.occasion),
    collection: scalarOf("collection", delta.collection),
    style: listOf("style", delta.style ?? []),
    silhouette: listOf("silhouette", delta.silhouette ?? []),
    neckline: listOf("neckline", delta.neckline ?? []),
    sleeves: listOf("sleeves", delta.sleeves ?? []),
    embellishment: listOf("embellishment", delta.embellishment ?? []),
    color: listOf("color", delta.color ?? []),
    volume: scalarOf("volume", delta.volume),
    train: scalarOf("train", delta.train),
    venue: scalarOf("venue", delta.venue),
    season: scalarOf("season", delta.season),
    time: scalarOf("time", delta.time),
    likes: union(current.likes, delta.likes ?? []),
    rejectedProductIds: union(current.rejectedProductIds, delta.rejectedProductIds ?? []),
    shownProductIds: union(current.shownProductIds, delta.shownProductIds ?? []),
    maxPrice: scalarOf("maxPrice", delta.maxPrice),
    eventDate: scalarOf("eventDate", delta.eventDate),
    avoid: {
      silhouette: union(current.avoid.silhouette, delta.avoid?.silhouette ?? []),
      neckline: union(current.avoid.neckline, delta.avoid?.neckline ?? []),
      sleeves: union(current.avoid.sleeves, delta.avoid?.sleeves ?? []),
      embellishment: union(current.avoid.embellishment, delta.avoid?.embellishment ?? []),
      color: union(current.avoid.color, delta.avoid?.color ?? []),
      style: union(current.avoid.style, delta.avoid?.style ?? []),
      volume: union(current.avoid.volume, delta.avoid?.volume ?? []),
    },
  }

  // An avoided attribute cannot also be a wanted one.
  next.silhouette = next.silhouette.filter((v) => !next.avoid.silhouette.includes(v))
  next.neckline = next.neckline.filter((v) => !next.avoid.neckline.includes(v))
  next.sleeves = next.sleeves.filter((v) => !next.avoid.sleeves.includes(v))
  next.embellishment = next.embellishment.filter((v) => !next.avoid.embellishment.includes(v))
  next.color = next.color.filter((v) => !next.avoid.color.includes(v))
  next.style = next.style.filter((v) => !next.avoid.style.includes(v))
  if (next.volume && next.avoid.volume.includes(next.volume)) next.volume = null

  return next
}

/**
 * Whether we know enough to recommend rather than keep asking.
 * Two signals is the threshold — the brief is explicit that a shopper must not
 * be walked through a questionnaire before seeing anything.
 */
export function hasEnoughToRecommend(p: StylistPreferences): boolean {
  const signals = [
    p.style.length > 0,
    p.silhouette.length > 0,
    p.neckline.length > 0,
    p.sleeves.length > 0,
    p.embellishment.length > 0,
    p.color.length > 0,
    p.volume !== null,
    p.train !== null,
    p.venue !== null,
    p.occasion !== null,
    p.collection !== null,
  ].filter(Boolean).length

  return signals >= 2 || hasConcreteGarmentAsk(p)
}

/**
 * Whether she has named something concrete about the garment itself.
 *
 * The two-signal threshold above is right for vague context — an occasion and
 * a venue tell you little on their own. But it also swallowed requests that
 * could not be more actionable: "I want a navy dress" is one signal, so
 * whether she saw any of the 29 navy gowns came down to the model happening
 * to set readyToRecommend, and the identical sentence showed five dresses on
 * one run and none on the next.
 *
 * A named colour, silhouette, neckline, sleeve, embellishment, volume or
 * train is a fact the matcher can act on immediately, so one is enough.
 * Style is excluded deliberately: "something romantic" really is too vague to
 * start pulling gowns on alone.
 */
export function hasConcreteGarmentAsk(p: StylistPreferences): boolean {
  return (
    p.color.length > 0 ||
    p.silhouette.length > 0 ||
    p.neckline.length > 0 ||
    p.sleeves.length > 0 ||
    p.embellishment.length > 0 ||
    p.volume !== null ||
    p.train !== null
  )
}
