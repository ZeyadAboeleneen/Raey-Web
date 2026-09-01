/**
 * lib/ai/stylist/stylist-service.ts
 *
 * Orchestrates one stylist turn:
 *
 *   message + profile
 *        ↓  understand()          — Gemini, structured
 *   reply + preference delta
 *        ↓  mergePreferences()
 *   updated profile
 *        ↓  findMatches()         — deterministic, catalogue-grounded
 *   3-5 real products
 *        ↓  explain()             — Gemini, constrained to those attributes
 *   reply + cards
 *
 * Gemini is asked what the shopper *means* and how to *phrase* things. It is
 * never asked what exists.
 */

import { GoogleGenAI } from "@google/genai"
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
} from "./vocabulary"
import {
  hasEnoughToRecommend,
  mergePreferences,
  type StylistPreferences,
} from "./preferences"
import { findMatches, type RankedMatch } from "./matcher"
import { EXPLAIN_SYSTEM_PROMPT, UNDERSTAND_SYSTEM_PROMPT } from "./prompts"
import {
  STYLIST_CHAT_MODEL,
  STYLIST_HISTORY_TURNS,
  STYLIST_MAX_RESULTS,
  STYLIST_MIN_RESULTS,
  STYLIST_TIMEOUT_MS,
} from "./stylist-config"

export class StylistError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_CONFIGURED" | "UPSTREAM" | "TIMEOUT" | "RATE_LIMITED" = "UPSTREAM"
  ) {
    super(message)
    this.name = "StylistError"
  }
}

let client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new StylistError("GEMINI_API_KEY is not set", "NOT_CONFIGURED")
  if (!client) client = new GoogleGenAI({ apiKey })
  return client
}

export interface ChatTurn {
  role: "user" | "assistant"
  content: string
}

const enumArray = (values: readonly string[]) => ({
  type: "ARRAY",
  items: { type: "STRING", enum: [...values] },
})

const UNDERSTAND_SCHEMA = {
  type: "OBJECT",
  properties: {
    message: { type: "STRING", description: "Your spoken reply to the customer." },
    language: {
      type: "STRING",
      description: 'Her language tag: "en", "ar-EG", "ar", "arabizi", or "mixed".',
    },
    readyToRecommend: {
      type: "BOOLEAN",
      description: "True when there is enough information to show dresses now.",
    },
    followUpQuestion: {
      type: "STRING",
      description: "At most one short question, in her language. Empty string if none.",
    },
    quickReplies: {
      type: "ARRAY",
      description: "3-5 very short tappable answers in her language, or empty.",
      items: { type: "STRING" },
    },
    preferences: {
      type: "OBJECT",
      properties: {
        occasion: { type: "STRING", enum: [...OCCASIONS] },
        collection: { type: "STRING", enum: [...COLLECTIONS] },
        style: enumArray(STYLES),
        silhouette: enumArray(SILHOUETTES),
        neckline: enumArray(NECKLINES),
        sleeves: enumArray(SLEEVES),
        embellishment: enumArray(EMBELLISHMENTS),
        color: enumArray(COLORS),
        volume: { type: "STRING", enum: [...VOLUMES] },
        train: { type: "STRING", enum: [...TRAINS] },
        venue: { type: "STRING", enum: [...VENUES] },
        season: { type: "STRING", enum: [...SEASONS] },
        time: { type: "STRING", enum: [...TIMES] },
        maxPrice: { type: "NUMBER", description: "Budget ceiling in EGP if she names one." },
      },
    },
    avoid: {
      type: "OBJECT",
      description: "Anything she ruled out, explicitly or implicitly.",
      properties: {
        silhouette: enumArray(SILHOUETTES),
        neckline: enumArray(NECKLINES),
        sleeves: enumArray(SLEEVES),
        embellishment: enumArray(EMBELLISHMENTS),
        color: enumArray(COLORS),
        style: enumArray(STYLES),
        volume: enumArray(VOLUMES),
      },
    },
  },
  required: ["message", "language", "readyToRecommend"],
}

const EXPLAIN_SCHEMA = {
  type: "OBJECT",
  properties: {
    explanations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          productId: { type: "STRING" },
          reason: { type: "STRING" },
        },
        required: ["productId", "reason"],
      },
    },
  },
  required: ["explanations"],
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new StylistError("Stylist timed out", "TIMEOUT")), ms)
    ),
  ])
}

function classify(error: any): StylistError {
  if (error instanceof StylistError) return error
  const message = String(error?.message || error || "")
  const status = error?.status ?? error?.code
  if (status === 429 || /quota|rate limit|resource_exhausted/i.test(message)) {
    return new StylistError("Upstream rate limit", "RATE_LIMITED")
  }
  if (status === 401 || status === 403 || /api key|unauthenticated/i.test(message)) {
    return new StylistError("Provider rejected credentials", "NOT_CONFIGURED")
  }
  if (/abort|timed? ?out|deadline/i.test(message)) {
    return new StylistError("Stylist timed out", "TIMEOUT")
  }
  return new StylistError("Provider request failed", "UPSTREAM")
}

interface Understanding {
  message: string
  language: string
  readyToRecommend: boolean
  followUpQuestion: string
  quickReplies: string[]
  delta: Partial<StylistPreferences>
}

/** Call 1 — read the message into a reply and a validated preference delta. */
async function understand(
  message: string,
  history: ChatTurn[],
  current: StylistPreferences
): Promise<Understanding> {
  const ai = getClient()

  // A compact digest of what we already know, so the model does not re-ask.
  const known = JSON.stringify({
    style: current.style,
    silhouette: current.silhouette,
    neckline: current.neckline,
    sleeves: current.sleeves,
    embellishment: current.embellishment,
    color: current.color,
    volume: current.volume,
    train: current.train,
    venue: current.venue,
    occasion: current.occasion,
    collection: current.collection,
    avoid: current.avoid,
  })

  const contents = [
    ...history.slice(-STYLIST_HISTORY_TURNS).map((turn) => ({
      role: turn.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: turn.content }],
    })),
    {
      role: "user" as const,
      parts: [
        {
          text: `Already known about this customer (do not ask about these again): ${known}\n\nHer new message:\n${message}`,
        },
      ],
    },
  ]

  const response = await withTimeout(
    ai.models.generateContent({
      model: STYLIST_CHAT_MODEL,
      contents,
      config: {
        systemInstruction: UNDERSTAND_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: UNDERSTAND_SCHEMA as any,
        temperature: 0.7,
      },
    }),
    STYLIST_TIMEOUT_MS
  )

  const text = response.text
  if (!text) throw new StylistError("Empty response", "UPSTREAM")

  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new StylistError("Unparseable response", "UPSTREAM")
  }

  const p = parsed.preferences ?? {}
  const a = parsed.avoid ?? {}
  const price = Number(p.maxPrice)

  return {
    message: String(parsed.message || "").trim(),
    language: String(parsed.language || "en").slice(0, 12),
    readyToRecommend: parsed.readyToRecommend === true,
    followUpQuestion: String(parsed.followUpQuestion || "").trim(),
    quickReplies: Array.isArray(parsed.quickReplies)
      ? parsed.quickReplies
          .filter((q: any) => typeof q === "string" && q.trim())
          .slice(0, 5)
          .map((q: string) => q.trim().slice(0, 40))
      : [],
    delta: {
      language: String(parsed.language || "en").slice(0, 12),
      occasion: coerceOne(p.occasion, OCCASIONS),
      collection: coerceOne(p.collection, COLLECTIONS),
      style: coerceMany(p.style, STYLES),
      silhouette: coerceMany(p.silhouette, SILHOUETTES),
      neckline: coerceMany(p.neckline, NECKLINES),
      sleeves: coerceMany(p.sleeves, SLEEVES),
      embellishment: coerceMany(p.embellishment, EMBELLISHMENTS),
      color: coerceMany(p.color, COLORS),
      volume: coerceOne(p.volume, VOLUMES),
      train: coerceOne(p.train, TRAINS),
      venue: coerceOne(p.venue, VENUES),
      season: coerceOne(p.season, SEASONS),
      time: coerceOne(p.time, TIMES),
      maxPrice: Number.isFinite(price) && price > 0 ? price : null,
      avoid: {
        silhouette: coerceMany(a.silhouette, SILHOUETTES),
        neckline: coerceMany(a.neckline, NECKLINES),
        sleeves: coerceMany(a.sleeves, SLEEVES),
        embellishment: coerceMany(a.embellishment, EMBELLISHMENTS),
        color: coerceMany(a.color, COLORS),
        style: coerceMany(a.style, STYLES),
        volume: coerceMany(a.volume, VOLUMES),
      },
    },
  }
}

/** Call 2 — one grounded sentence per selected gown. */
async function explain(
  matches: RankedMatch[],
  userMessage: string,
  language: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (matches.length === 0) return out

  const ai = getClient()

  // Only catalogued attributes are exposed — the model cannot reference
  // anything it was not given.
  const dresses = matches.map((m) => ({
    productId: m.product.id,
    collection: m.product.collection,
    attributes: {
      silhouette: m.facts.silhouette,
      neckline: m.facts.neckline,
      sleeves: m.facts.sleeves,
      embellishment: m.facts.embellishment,
      style: m.facts.style,
      color: m.facts.color,
      volume: m.facts.volume,
      train: m.facts.train,
    },
    matchedWhatSheAskedFor: m.facts.matched,
  }))

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: STYLIST_CHAT_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `The customer said (reply in this exact language and register, tagged "${language}"):\n"${userMessage}"\n\nDresses selected for her:\n${JSON.stringify(dresses, null, 1)}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: EXPLAIN_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: EXPLAIN_SCHEMA as any,
          temperature: 0.6,
        },
      }),
      STYLIST_TIMEOUT_MS
    )

    const parsed = JSON.parse(response.text || "{}")
    const valid = new Set(matches.map((m) => m.product.id))
    for (const item of parsed?.explanations ?? []) {
      const id = String(item?.productId || "")
      const reason = String(item?.reason || "").trim()
      // Ignore ids the model invented or reordered in.
      if (valid.has(id) && reason) out.set(id, reason.slice(0, 400))
    }
  } catch (error) {
    // Cards still render without a line — better than failing the turn.
    console.warn(`[AI Stylist] explanations unavailable: ${classify(error).code}`)
  }

  return out
}

export interface Recommendation {
  productId: string
  name: string
  collection: string
  branch: string
  image: string
  price: number | null
  isSellable: boolean
  productUrl: string
  reason: string
}

export interface StylistTurnResult {
  message: string
  language: string
  followUpQuestion: string
  quickReplies: string[]
  recommendations: Recommendation[]
  preferences: StylistPreferences
}

export interface StylistTurnInput {
  message: string
  history: ChatTurn[]
  preferences: StylistPreferences
  /** Set by SHOW SIMILAR — ranks against that gown instead of the profile. */
  similarToProductId?: string | null
}

/**
 * A short, honest, on-brand line for when a factual ask (colour, silhouette,
 * neckline, sleeves, embellishment, volume, or train) matched nothing the
 * system has actually catalogued — findMatches() returns zero rather than
 * guess in that case, and this says so instead of leaving "here are your
 * options" hanging over an empty result. Matched by language prefix, the same
 * pattern the API route's own fallback copy uses.
 */
function noConfirmedMatchNote(language: string): string {
  if (/^arabizi/i.test(language)) {
    return "Sorra2a, mafeesh 3andy dilwa2ty confirmed dress bel mwasfat de fel catalogue. 3ayza awareeky a2rab haga leha, wala nbadel fel wasf shwaya? 🤍"
  }
  if (/^ar/i.test(language) || /^mixed/i.test(language)) {
    return "للأسف مفيش عندي حاليًا فستان مؤكد بالمواصفات دي في الكتالوج. حابة أوريكي أقرب حاجة ليها، ولا نغيّر في الوصف شوية؟ 🤍"
  }
  return "I don't have a confirmed match for that in the catalogue right now. Want me to show you the closest alternatives, or adjust what you're looking for? 🤍"
}

/** Runs one full turn. Throws `StylistError`; the route maps it to safe copy. */
export async function runStylistTurn(input: StylistTurnInput): Promise<StylistTurnResult> {
  let understanding: Understanding
  try {
    understanding = await understand(input.message, input.history, input.preferences)
  } catch (error) {
    throw classify(error)
  }

  const preferences = mergePreferences(input.preferences, understanding.delta)

  const wantsProducts =
    !!input.similarToProductId ||
    understanding.readyToRecommend ||
    hasEnoughToRecommend(preferences)

  let recommendations: Recommendation[] = []

  if (wantsProducts) {
    const matches = await findMatches(preferences, {
      limit: STYLIST_MAX_RESULTS,
      similarToProductId: input.similarToProductId ?? undefined,
      // Keep bringing new gowns on refinement, unless that would leave nothing.
      excludeShown: preferences.shownProductIds.length > 0,
    })

    const finalMatches =
      matches.length >= STYLIST_MIN_RESULTS
        ? matches
        : await findMatches(preferences, {
            limit: STYLIST_MAX_RESULTS,
            similarToProductId: input.similarToProductId ?? undefined,
            excludeShown: false,
          })

    const reasons = await explain(finalMatches, input.message, understanding.language)

    recommendations = finalMatches.map((m) => ({
      productId: m.product.id,
      name: m.product.name,
      collection: m.product.collection,
      branch: m.product.branch,
      image: m.product.image,
      price: m.product.displayPrice,
      isSellable: m.product.isSellable,
      productUrl: m.product.productUrl,
      reason: reasons.get(m.product.id) ?? "",
    }))

    preferences.shownProductIds = Array.from(
      new Set([...preferences.shownProductIds, ...recommendations.map((r) => r.productId)])
    ).slice(-60)
  }

  // The reply above was written before matching ran, so it can promise dresses
  // that then fail to materialise — findMatches() now correctly returns zero
  // rather than padding a factual ask (colour, silhouette, ...) with unverified
  // guesses, but that means "here are your options" can land with no cards
  // under it unless this is said out loud. No second Gemini call for this —
  // a short, honest, on-brand line appended in her language beats staying
  // silent about it.
  const message =
    wantsProducts && recommendations.length === 0
      ? `${understanding.message}\n\n${noConfirmedMatchNote(understanding.language)}`
      : understanding.message

  return {
    message,
    language: understanding.language,
    followUpQuestion: understanding.followUpQuestion,
    quickReplies: understanding.quickReplies,
    recommendations,
    preferences,
  }
}
