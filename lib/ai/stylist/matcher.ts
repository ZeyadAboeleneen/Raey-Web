/**
 * lib/ai/stylist/matcher.ts
 *
 * Deterministic candidate retrieval and ranking.
 *
 * This is the only thing that decides which gowns a shopper sees. The model
 * never picks products — it reads preferences in, and writes prose out. That
 * separation is what makes "never invent a dress" structurally true rather
 * than a instruction we hope is followed.
 *
 * Scoring is a transparent weighted sum over the vision-derived attribute
 * index, with avoidances applied as hard filters before ranking.
 */

import { getProductsServer } from "@/lib/get-products-server"
import { getAttributesFor, warmIndex } from "./attribute-index"
import type { DressAttributes } from "./attribute-types"
import type { StylistPreferences } from "./preferences"
import { STYLIST_MAX_RESULTS } from "./stylist-config"

export interface CatalogProduct {
  id: string
  name: string
  collection: string
  branch: string
  image: string
  /** What the storefront would show: sell price when sellable, else rental. */
  displayPrice: number | null
  isSellable: boolean
  productUrl: string
}

/** Why a gown scored — used to ground the explanation, never invented prose. */
export interface MatchFacts {
  silhouette: string[]
  neckline: string[]
  sleeves: string[]
  embellishment: string[]
  style: string[]
  color: string[]
  volume: string | null
  train: string | null
  /** Plain-language description read from the gown's photo at tagging time. */
  description: string
  /** Attribute names that matched what the shopper asked for. */
  matched: string[]
}

export interface RankedMatch {
  product: CatalogProduct
  score: number
  facts: MatchFacts
  /** False when the gown has no catalogued attributes yet. */
  grounded: boolean
}

/** Weights — silhouette and neckline drive the look most, so they lead. */
const WEIGHTS = {
  silhouette: 30,
  neckline: 22,
  sleeves: 18,
  embellishment: 16,
  style: 14,
  color: 12,
  volume: 12,
  train: 8,
  collection: 10,
  venue: 6,
} as const

function toCatalogProduct(p: any): CatalogProduct | null {
  const id = String(p?.id ?? "")
  if (!/^\d+$/.test(id)) return null

  const image =
    (Array.isArray(p.images) && p.images.find((i: any) => typeof i === "string" && i)) ||
    (typeof p.image === "string" ? p.image : "")
  if (!image || image === "/placeholder.svg") return null

  const branch = p.branch || "wedding"
  const displayPrice =
    typeof p.sellPrice === "number" && p.sellPrice > 0
      ? p.sellPrice
      : typeof p.rentalPriceC === "number" && p.rentalPriceC > 0
        ? p.rentalPriceC
        : null

  return {
    id,
    name: p.name || `RAEY ${id}`,
    collection: (p.collection || "").toLowerCase(),
    branch,
    image,
    displayPrice,
    isSellable: p.isSellable === true,
    productUrl: `/products/${branch}/${id}`,
  }
}

/** Venues imply a register; used as a light nudge, never a hard filter. */
const VENUE_AFFINITY: Record<string, { style: string[]; volume: string[] }> = {
  ballroom: { style: ["dramatic", "glamorous", "regal", "classic"], volume: ["medium", "dramatic"] },
  garden: { style: ["romantic", "feminine", "timeless"], volume: ["minimal", "medium"] },
  beach: { style: ["minimal", "contemporary", "romantic"], volume: ["minimal"] },
  hotel: { style: ["elegant", "classic", "glamorous", "modern"], volume: ["minimal", "medium"] },
  outdoor: { style: ["romantic", "minimal", "feminine"], volume: ["minimal", "medium"] },
  church: { style: ["classic", "timeless", "regal"], volume: ["medium", "dramatic"] },
  rooftop: { style: ["modern", "contemporary", "minimal"], volume: ["minimal"] },
}

const overlap = <T>(a: T[], b: T[]): T[] => a.filter((x) => b.includes(x))

/**
 * Colours that read as the same decision from across a room.
 *
 * Exact colour matching is too brittle to filter on — ivory and champagne are
 * the same choice to almost everyone — while no matching at all answers a
 * black dress with an ivory one. Families are the useful middle.
 *
 * Metallics are deliberately their own family and are ignored when the photo
 * shows anything else: gold and silver turn up as an accent on a large share
 * of beaded gowns, so treating them as the garment's colour makes them a
 * wildcard that matches nearly everything. A photo tagged black + silver is a
 * black dress with silver beading, not a silver dress.
 */
const COLOR_FAMILY: Record<string, string> = {
  white: "light", ivory: "light", champagne: "light", nude: "light", blush: "light",
  black: "dark", navy: "dark", burgundy: "dark", grey: "dark",
  red: "bold", green: "bold", blue: "bold", pink: "bold", lilac: "bold", multicolor: "bold",
  gold: "metallic", silver: "metallic",
}

/**
 * How strictly a colour request is enforced. See `contradictsRequest`.
 *   exact  — she typed a colour and means it literally
 *   family — the colour came from her photo; match the look, not the swatch
 *   ignore — a retry that gave up on colour rather than show her nothing
 */
export type ColorMode = "exact" | "family" | "ignore"

/** The families a set of colours belongs to, metallic accents set aside. */
function colorFamilies(colors: string[]): string[] {
  const families = new Set<string>()
  for (const color of colors) {
    const family = COLOR_FAMILY[color]
    if (family) families.add(family)
  }
  if (families.size > 1) families.delete("metallic")
  return Array.from(families)
}

/** A gown is excluded when it visibly carries something the shopper ruled out. */
function violatesAvoidance(attrs: DressAttributes | undefined, p: StylistPreferences): boolean {
  if (!attrs) return false // nothing catalogued — cannot prove a violation
  const a = p.avoid
  return (
    overlap(attrs.silhouette, a.silhouette).length > 0 ||
    overlap(attrs.neckline, a.neckline).length > 0 ||
    overlap(attrs.sleeves, a.sleeves).length > 0 ||
    overlap(attrs.embellishment, a.embellishment).length > 0 ||
    overlap(attrs.color, a.color).length > 0 ||
    overlap(attrs.style, a.style).length > 0 ||
    (attrs.volume !== null && a.volume.includes(attrs.volume))
  )
}

/**
 * A gown is excluded when the shopper asked for a specific value in some
 * FACTUAL category and this gown is confirmed to be something else there.
 *
 * Positive requests need the same hard-filter treatment `violatesAvoidance`
 * gives negative ones: scoring alone only ever ADDS a bonus for a match, so
 * when nothing in the tagged pool actually has the asked-for colour, every
 * candidate — including ones confirmed gold or silver — scores identically
 * and one gets shown anyway. Asking for "black" must never surface a gown
 * this system has already looked at and confirmed is not black.
 *
 * Deliberately excludes `style`: it's a handful of subjective adjectives a
 * human picked from many valid ones, not a mutually-exclusive fact the way a
 * colour or silhouette is — treating "not tagged romantic" as "confirmed not
 * romantic" would over-filter on a fuzzy dimension. Style stays a soft bonus.
 */
function contradictsRequest(
  attrs: DressAttributes | undefined,
  p: StylistPreferences,
  colorMode: ColorMode = "exact",
  relaxed: ReadonlySet<string> = new Set()
): boolean {
  if (!attrs) return false // nothing catalogued — cannot prove a contradiction either

  const conflicts = (requested: string[], actual: string[]) =>
    requested.length > 0 && actual.length > 0 && overlap(actual, requested).length === 0

  /** A relaxed category stops vetoing, but still scores — see findMatches. */
  const vetoes = (field: string, requested: string[], actual: string[]) =>
    !relaxed.has(field) && conflicts(requested, actual)

  // A colour she TYPED is meant literally — "black" is not a request for navy.
  // A colour read from her photo is a description of a look, so it matches by
  // family: ivory and champagne are the same decision, black and ivory are not.
  const colorConflicts =
    colorMode === "ignore"
      ? false
      : colorMode === "family"
        ? conflicts(colorFamilies(p.color), colorFamilies(attrs.color))
        : conflicts(p.color, attrs.color)

  return (
    colorConflicts ||
    vetoes("silhouette", p.silhouette, attrs.silhouette) ||
    vetoes("neckline", p.neckline, attrs.neckline) ||
    vetoes("sleeves", p.sleeves, attrs.sleeves) ||
    vetoes("embellishment", p.embellishment, attrs.embellishment) ||
    (!relaxed.has("volume") &&
      p.volume !== null &&
      attrs.volume !== null &&
      attrs.volume !== p.volume) ||
    (!relaxed.has("train") && p.train !== null && attrs.train !== null && attrs.train !== p.train)
  )
}

function scoreProduct(
  product: CatalogProduct,
  attrs: DressAttributes | undefined,
  p: StylistPreferences
): { score: number; facts: MatchFacts } {
  const matched: string[] = []
  let score = 0

  if (p.collection && product.collection === p.collection) score += WEIGHTS.collection

  if (attrs) {
    const add = (key: keyof typeof WEIGHTS, hits: string[]) => {
      if (hits.length > 0) {
        // Diminishing returns: a second matching value is worth less than the first.
        score += WEIGHTS[key] * (1 + (hits.length - 1) * 0.35)
        matched.push(key)
      }
    }

    add("silhouette", overlap(attrs.silhouette, p.silhouette))
    add("neckline", overlap(attrs.neckline, p.neckline))
    add("sleeves", overlap(attrs.sleeves, p.sleeves))
    add("embellishment", overlap(attrs.embellishment, p.embellishment))
    add("style", overlap(attrs.style, p.style))
    add("color", overlap(attrs.color, p.color))

    if (p.volume && attrs.volume === p.volume) {
      score += WEIGHTS.volume
      matched.push("volume")
    }
    if (p.train && attrs.train === p.train) {
      score += WEIGHTS.train
      matched.push("train")
    }

    if (p.venue) {
      const affinity = VENUE_AFFINITY[p.venue]
      if (affinity) {
        if (overlap(attrs.style, affinity.style).length > 0) score += WEIGHTS.venue
        if (attrs.volume && affinity.volume.includes(attrs.volume)) score += WEIGHTS.venue / 2
      }
    }

    // Low-confidence catalogue rows rank below confident ones.
    score *= 0.6 + 0.4 * attrs.confidence
  }

  return {
    score,
    facts: {
      silhouette: attrs?.silhouette ?? [],
      neckline: attrs?.neckline ?? [],
      sleeves: attrs?.sleeves ?? [],
      embellishment: attrs?.embellishment ?? [],
      style: attrs?.style ?? [],
      color: attrs?.color ?? [],
      volume: attrs?.volume ?? null,
      train: attrs?.train ?? null,
      description: attrs?.description ?? "",
      matched,
    },
  }
}

/**
 * A look to rank against, rather than a set of requirements to satisfy.
 *
 * Comes either from a gown she tapped "show similar" on, or from an
 * inspiration photo she uploaded — both read into the same vocabulary as the
 * catalogue index, which is what makes the comparison meaningful.
 */
export type VisualReference = Pick<
  DressAttributes,
  "silhouette" | "neckline" | "sleeves" | "embellishment" | "style" | "color" | "volume" | "train"
>

export interface MatchOptions {
  limit?: number
  /** Exclude gowns already shown this session, so refinements bring news. */
  excludeShown?: boolean
  /** Rank by similarity to this gown instead of the preference profile. */
  similarToProductId?: string
  /** Rank by similarity to a photo the shopper sent. */
  imageAttributes?: VisualReference
  /**
   * Drop the photo's colour as a hard constraint. Set on a retry, when
   * honouring it exactly left too little to show.
   */
  relaxImageColor?: boolean
  /**
   * Attribute categories that stop excluding a gown outright on this pass.
   * They keep scoring, so true matches still rank first — a relaxed category
   * is a preference rather than a requirement. Set by the caller's retry
   * ladder; see `runStylistTurn`.
   */
  relaxFields?: readonly string[]
  /** Allow inline cataloguing of un-tagged candidates. */
  allowWarm?: boolean
}

/** Pulls the live catalogue and applies the shopper's hard constraints. */
async function eligibleProducts(p: StylistPreferences, options: MatchOptions) {
  const raw = await getProductsServer()

  const rejected = new Set(p.rejectedProductIds)
  const shown = new Set(p.shownProductIds)

  const products: CatalogProduct[] = []
  for (const item of raw) {
    if (item?.isActive === false || item?.isOutOfStock === true) continue
    const product = toCatalogProduct(item)
    if (!product) continue
    if (rejected.has(product.id)) continue
    if (options.excludeShown && shown.has(product.id)) continue
    if (p.collection && product.collection && product.collection !== p.collection) continue
    if (p.maxPrice && product.displayPrice && product.displayPrice > p.maxPrice) continue
    products.push(product)
  }
  return products
}

/**
 * Ranks the catalogue against the preference profile.
 *
 * Products with no catalogued attributes are kept as a low-ranked tail so a
 * cold index still returns something, but grounded matches always come first
 * and the explanation layer is told which are which.
 */
export async function findMatches(
  p: StylistPreferences,
  options: MatchOptions = {}
): Promise<RankedMatch[]> {
  const limit = options.limit ?? STYLIST_MAX_RESULTS
  const products = await eligibleProducts(p, options)
  if (products.length === 0) return []

  const attributeMap = await getAttributesFor(products.map((x) => x.id))

  // Cold index: nudge a few candidates into the catalogue for NEXT time.
  // Deliberately not awaited — a vision call takes seconds, so blocking on a
  // backfill here would add minutes to a shopper's turn and burn the upstream
  // per-minute quota that this same turn still needs. Real backfilling is
  // POST /api/ai/stylist/index.
  if (options.allowWarm !== false && attributeMap.size < limit * 2) {
    const untagged = products.filter((x) => !attributeMap.has(x.id)).slice(0, 20)
    void warmIndex(untagged).catch(() => {})
  }

  // A look to rank against: her uploaded photo takes precedence over a
  // "show similar" tap, since it is the more recent and more deliberate act.
  const reference: VisualReference | undefined =
    options.imageAttributes ??
    (options.similarToProductId
      ? attributeMap.get(String(options.similarToProductId))
      : undefined)

  // Ranking runs against the reference look; FILTERING never does.
  //
  // The distinction matters enormously. A reference carries a value in every
  // category at once — silhouette AND neckline AND sleeves AND embellishment
  // AND colour AND volume AND train. Hard-filtering on all seven would demand
  // a near-duplicate and return nothing at all, which is the opposite of what
  // "show me something like this" asks for. Her *words* stay hard constraints
  // (see contradictsRequest below); the look she showed us is what sorts the
  // survivors. So "like this photo, but in black" filters to black and ranks
  // by resemblance to the photo.
  const scoringTarget: StylistPreferences = reference
    ? {
        ...p,
        silhouette: reference.silhouette,
        neckline: reference.neckline,
        sleeves: reference.sleeves,
        embellishment: reference.embellishment,
        style: reference.style,
        // Her stated colour still leads when she named one — the photo only
        // supplies a colour she never mentioned.
        color: p.color.length > 0 ? p.color : reference.color,
        volume: p.volume ?? reference.volume,
        train: p.train ?? reference.train,
      }
    : p

  // Colour is the one dimension a photo is allowed to constrain rather than
  // merely rank. It is the most immediately visible thing about a dress, and
  // unlike silhouette or neckline it is a plain fact — answering a photo of a
  // black gown with ivory ones reads as never having opened the photo,
  // however well the shape matches.
  const colorMode: ColorMode = options.relaxImageColor
    ? "ignore"
    : options.imageAttributes
      ? "family"
      : "exact"

  // What the photo showed is carried in the profile too (so it survives into
  // later turns), but it must not become a hard filter on the way back out —
  // that is the near-duplicate trap described above, and it really bites: an
  // eight-attribute reading cut a photo search from five good matches to two.
  // Strip the photo's own contribution back out here, leaving only what she
  // asked for in WORDS to filter on. Colour is the deliberate exception,
  // handled by `colorMode`.
  const withoutPhoto = <T extends string>(stated: T[], fromPhoto: readonly string[]): T[] =>
    stated.filter((value) => !fromPhoto.includes(value))

  const relaxed = new Set(options.relaxFields ?? [])

  const ref = options.imageAttributes
  const filterBasis: StylistPreferences = ref
    ? {
        ...p,
        silhouette: withoutPhoto(p.silhouette, ref.silhouette),
        neckline: withoutPhoto(p.neckline, ref.neckline),
        sleeves: withoutPhoto(p.sleeves, ref.sleeves),
        embellishment: withoutPhoto(p.embellishment, ref.embellishment),
        volume: p.volume && p.volume === ref.volume ? null : p.volume,
        train: p.train && p.train === ref.train ? null : p.train,
      }
    : p

  const ranked: RankedMatch[] = []
  for (const product of products) {
    if (options.similarToProductId && product.id === String(options.similarToProductId)) continue

    const attrs = attributeMap.get(product.id)
    if (violatesAvoidance(attrs, p)) continue
    if (contradictsRequest(attrs, filterBasis, colorMode, relaxed)) continue

    const { score, facts } = scoreProduct(product, attrs, scoringTarget)
    ranked.push({ product, score, facts, grounded: !!attrs })
  }

  ranked.sort((a, b) => {
    if (a.grounded !== b.grounded) return a.grounded ? -1 : 1
    if (b.score !== a.score) return b.score - a.score
    return a.product.id.localeCompare(b.product.id) // stable
  })

  // An un-catalogued gown is a coin flip against whatever the shopper actually
  // asked for — its attributes are simply unknown, not neutral. Padding the
  // result out to `limit` with them once the grounded matches run out used to
  // mean a specific ask ("long sleeves", "no sequins") could get answered with
  // dresses that silently contradict it. When the shopper has stated any real
  // preference, only fall back to ungrounded gowns if there are literally no
  // grounded matches at all — better to honestly show fewer than to fill the
  // row with guesses. An open-ended ask (nothing about the garment itself, e.g.
  // just an occasion/venue) has nothing concrete to contradict, so padding is
  // fine there.
  //
  // A reference look counts as concrete for exactly the same reason: an
  // un-catalogued gown cannot honestly be offered as "like the one you sent",
  // because nothing is known about what it looks like.
  const hasConcreteAsk =
    scoringTarget.style.length > 0 ||
    scoringTarget.silhouette.length > 0 ||
    scoringTarget.neckline.length > 0 ||
    scoringTarget.sleeves.length > 0 ||
    scoringTarget.embellishment.length > 0 ||
    scoringTarget.color.length > 0 ||
    scoringTarget.volume !== null ||
    scoringTarget.train !== null

  const groundedMatches = ranked.filter((m) => m.grounded)

  // A concrete ask ALWAYS resolves to grounded matches only — including down
  // to zero. The previous rule only enforced this when at least one grounded
  // match existed; once none did, it fell through to padding with ungrounded
  // gowns anyway, which is exactly how an off-white dress could get shown for
  // "black": nothing was confirmed to match, so anything ranked got shown.
  // Zero honest results is the correct answer when the tagged catalogue
  // genuinely has nothing confirmed for what was asked — the caller surfaces
  // that honestly rather than this function ever guessing on a factual ask.
  if (hasConcreteAsk) {
    return groundedMatches.slice(0, limit)
  }

  return ranked.slice(0, limit)
}
