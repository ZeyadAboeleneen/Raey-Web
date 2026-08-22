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
      matched,
    },
  }
}

export interface MatchOptions {
  limit?: number
  /** Exclude gowns already shown this session, so refinements bring news. */
  excludeShown?: boolean
  /** Rank by similarity to this gown instead of the preference profile. */
  similarToProductId?: string
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

  const reference = options.similarToProductId
    ? attributeMap.get(String(options.similarToProductId))
    : undefined

  // "Show similar" ranks against the reference gown's own attributes.
  const target: StylistPreferences = reference
    ? {
        ...p,
        silhouette: reference.silhouette,
        neckline: reference.neckline,
        sleeves: reference.sleeves,
        embellishment: reference.embellishment,
        style: reference.style,
        color: reference.color,
        volume: reference.volume,
        train: reference.train,
      }
    : p

  const ranked: RankedMatch[] = []
  for (const product of products) {
    if (options.similarToProductId && product.id === String(options.similarToProductId)) continue

    const attrs = attributeMap.get(product.id)
    if (violatesAvoidance(attrs, target)) continue

    const { score, facts } = scoreProduct(product, attrs, target)
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
  const hasConcreteAsk =
    target.style.length > 0 ||
    target.silhouette.length > 0 ||
    target.neckline.length > 0 ||
    target.sleeves.length > 0 ||
    target.embellishment.length > 0 ||
    target.color.length > 0 ||
    target.volume !== null ||
    target.train !== null

  const groundedMatches = ranked.filter((m) => m.grounded)

  if (hasConcreteAsk && groundedMatches.length > 0) {
    return groundedMatches.slice(0, limit)
  }

  return ranked.slice(0, limit)
}
