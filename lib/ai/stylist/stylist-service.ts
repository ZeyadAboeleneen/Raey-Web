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
import { findMatches, type MatchOptions, type RankedMatch, type VisualReference } from "./matcher"
import { readInspirationImage } from "./vision-tagger"
import { identifyExactMatch, type ExactMatchCandidate } from "./exact-match"
import { loadProductImageBytes } from "../product-image"
import { EXPLAIN_SYSTEM_PROMPT, UNDERSTAND_SYSTEM_PROMPT } from "./prompts"
import {
  STYLIST_CHAT_MODEL,
  STYLIST_EXACT_MATCH_CANDIDATES,
  STYLIST_EXACT_MATCH_TIMEOUT_MS,
  STYLIST_HISTORY_TURNS,
  STYLIST_IMAGE_TIMEOUT_MS,
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
    clearFields: {
      type: "ARRAY",
      description:
        "Preference categories to RESET because she just broadened her request (see WHEN SHE BROADENS HER REQUEST). Empty on most turns.",
      items: {
        type: "STRING",
        enum: [
          "occasion", "collection", "style", "silhouette", "neckline", "sleeves",
          "embellishment", "color", "volume", "train", "venue", "season", "time", "maxPrice",
        ],
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
  delta: Partial<StylistPreferences> & { replace?: (keyof StylistPreferences)[] }
}

/** List-type preference keys `clearFields` is allowed to reset. */
const CLEARABLE_FIELDS = [
  "occasion", "collection", "style", "silhouette", "neckline", "sleeves",
  "embellishment", "color", "volume", "train", "venue", "season", "time", "maxPrice",
] as const satisfies readonly (keyof StylistPreferences)[]

/** Call 1 — read the message into a reply and a validated preference delta. */
async function understand(
  message: string,
  history: ChatTurn[],
  current: StylistPreferences,
  photoNote: string | null
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
          // The photo is not re-sent to this model: it has already been read
          // into the shared vocabulary by the vision pass, and that reading is
          // both denser and far cheaper than a second image upload against the
          // same quota.
          text: `Already known about this customer (do not ask about these again): ${known}\n\nHer new message:\n${message}${photoNote ? `\n\n${photoNote}` : ""}`,
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
  const clearFields: (keyof StylistPreferences)[] = Array.isArray(parsed.clearFields)
    ? parsed.clearFields.filter((f: any): f is (typeof CLEARABLE_FIELDS)[number] =>
        (CLEARABLE_FIELDS as readonly string[]).includes(f)
      )
    : []

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
      replace: clearFields,
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
  language: string,
  inspiration: string | null
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
    // Read from this gown's own photograph — the source of truth for anything
    // the fixed vocabulary above doesn't cover (slits, coverage, back detail…).
    whatThePhotoShows: m.facts.description,
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
                text: `The customer said (reply in this exact language and register, tagged "${language}"):\n"${userMessage}"${
                  inspiration
                    ? `\n\nShe also sent a photo of a dress she likes. This is what that photo shows:\n"${inspiration}"\nSay for each gown below what it shares with that photo — the specific detail, not "it's similar".`
                    : ""
                }\n\nDresses selected for her:\n${JSON.stringify(dresses, null, 1)}`,
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
  /** True when `identifyExactMatch` confirmed this is literally the dress in
      her uploaded photo, not merely a similar one. */
  isExactMatch?: boolean
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
  /** An inspiration photo she attached to this message ("something like this"). */
  image?: { data: Buffer; mimeType: string } | null
}

/**
 * How far to bend a request before admitting there is nothing to show.
 *
 * Every attribute she names is a veto by default, and vetoes multiply: the
 * catalogue holds 243 mermaid gowns with long sleeves, but not one is tagged
 * with 'minimal' embellishment, so adding the word "simple" turned five good
 * answers into "I have nothing like that" — while the dresses she meant sat
 * right there. Four of eight realistic asks came back empty this way.
 *
 * So secondary attributes are given up one tier at a time, softest first. A
 * relaxed attribute is still SCORED, so the closest gowns keep ranking top —
 * asking for a simple mermaid now returns the least-embellished mermaids
 * rather than nothing at all.
 *
 * Colour is never on this ladder. It is the one thing a shopper means
 * literally, and answering "black" with ivory is worse than answering
 * honestly that there is none. (A colour read from a PHOTO is looser — see
 * `relaxImageColor`, which runs after every rung here.)
 */
const RELAX_LADDER: readonly (readonly string[])[] = [
  [],
  ["embellishment", "volume", "train"],
  ["embellishment", "volume", "train", "neckline"],
  ["embellishment", "volume", "train", "neckline", "sleeves"],
  ["embellishment", "volume", "train", "neckline", "sleeves", "silhouette"],
]

/** The categories an inspiration photo speaks to. */
const PHOTO_DRIVEN_FIELDS = [
  "silhouette", "neckline", "sleeves", "embellishment", "style", "color", "volume", "train",
] as const satisfies readonly (keyof StylistPreferences)[]

/**
 * The colour a photographed gown actually *is*, dropping metallic accents.
 *
 * Vision tags a black gown with silver beadwork as ["black", "silver"], and
 * carrying that whole list into the profile makes "silver" a wildcard that
 * matches the large share of gowns with any metallic embellishment — which is
 * exactly how a black inspiration photo came back full of ivory dresses. The
 * beading is embellishment; the dress is black.
 */
function dominantColors<T extends string>(colors: T[]): T[] {
  const solid = colors.filter((c) => c !== "gold" && c !== "silver")
  return solid.length > 0 ? solid : colors
}

/** What the vision pass made of an attached photo, if there was one. */
interface PhotoContext {
  attributes?: VisualReference
  /** Free-text reading of her photo, shown to the explanation model. */
  description: string | null
  /** Set when the photo could not be used, so the reply can say so honestly. */
  issue: "not-a-dress" | "unreadable" | null
}

/**
 * Reads an attached photo into the same vocabulary the catalogue is indexed
 * in. Never throws: a photo that cannot be read degrades the turn to a normal
 * text turn with an honest note, rather than failing it outright.
 */
async function readPhoto(image: { data: Buffer; mimeType: string }): Promise<PhotoContext> {
  try {
    const reading = await withTimeout(
      readInspirationImage(image.data, image.mimeType),
      STYLIST_IMAGE_TIMEOUT_MS
    )
    if (!reading.ok) return { description: null, issue: reading.reason }
    return {
      attributes: reading.attributes,
      description: reading.attributes.description || null,
      issue: null,
    }
  } catch (error) {
    console.warn(`[AI Stylist] inspiration photo unreadable: ${classify(error).code}`)
    return { description: null, issue: "unreadable" }
  }
}

/** Tells the conversation model what her photo turned out to contain. */
function photoNoteFor(photo: PhotoContext): string | null {
  if (photo.issue === "not-a-dress") {
    return "She attached a photo, but no dress could be made out in it. Tell her that warmly in one line and ask her to send another, or describe what she's after. Do not guess at what was in the photo."
  }
  if (photo.issue === "unreadable") {
    return "She attached a photo that could not be opened. Apologise for it in one line and invite her to try again or describe what she wants. Do not guess at what was in the photo."
  }
  if (!photo.attributes) return null

  const a = photo.attributes
  return [
    "She attached a photo of a dress she likes. Read from that photo:",
    JSON.stringify({
      silhouette: a.silhouette,
      neckline: a.neckline,
      sleeves: a.sleeves,
      embellishment: a.embellishment,
      style: a.style,
      color: a.color,
      volume: a.volume,
      train: a.train,
    }),
    photo.description ? `Described: ${photo.description}` : "",
    // The photo's own attributes are merged into the profile in code, so the
    // model must NOT restate them here. When it did, its echo of the photo
    // ("ivory") counted as a fresh statement and outranked what she had
    // actually asked for in words — "do you have it in black?" returned ivory
    // gowns while the reply claimed to be showing black ones.
    "Speak as though you have seen the photo yourself — name one or two specific things in it, warmly. Set readyToRecommend true.",
    "IMPORTANT: the photo's own attributes are already recorded for you. Put into 'preferences' ONLY what she states in her own WORDS — especially anything that CHANGES the photo, like 'but in black', 'with longer sleeves', 'less puffy'. If her words say nothing about the dress, leave 'preferences' empty.",
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * Starting points offered when a turn produces neither dresses nor chips of
 * its own — a greeting, or something we couldn't read as a request.
 *
 * These exist because the model cannot be relied on to populate
 * `quickReplies` every time it should, and the cost of it forgetting is the
 * worst moment in the whole product: she says "hi", gets a warm sentence
 * back, and is left staring at an empty box with no idea what to type. A
 * deterministic floor means that never happens.
 */
// Every chip is phrased as something she could have typed herself, because
// tapping one sends it as her next message. Nothing here may describe an
// action the chat cannot perform — an "I'll send a photo" chip would just post
// those words and leave her no closer to sending one.
const STARTER_CHIPS = {
  en: ["Something simple", "Something dramatic", "Fitted / mermaid", "A ball gown", "With long sleeves"],
  ar: ["حاجة بسيطة", "حاجة dramatic", "fitted / mermaid", "فستان منفوش", "بأكمام طويلة"],
  arabizi: ["Haga simple", "Haga dramatic", "Fitted / mermaid", "Fostan menfosh", "B akmam tawila"],
} as const

function starterChipsFor(language: string): string[] {
  if (/^arabizi/i.test(language)) return [...STARTER_CHIPS.arabizi]
  if (/^ar|^mixed/i.test(language)) return [...STARTER_CHIPS.ar]
  return [...STARTER_CHIPS.en]
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

/**
 * The line shown on a card `identifyExactMatch` confirmed as the literal same
 * dress in her photo. Fixed rather than model-written: this claim is much
 * stronger than an ordinary similarity sentence ("this IS your dress", not
 * "this is like your dress"), so it is worded exactly once, correctly, rather
 * than trusted to a model that has repeatedly mis-stated smaller things this
 * session. Overrides whatever `explain()` wrote for that one card.
 */
function exactMatchReason(language: string): string {
  if (/^arabizi/i.test(language)) return "Da howa nafs el fostan bezabt elly ba3atteeh! 🤍"
  if (/^ar/i.test(language) || /^mixed/i.test(language)) return "ده هو نفس الفستان بالظبط اللي بعتيه! 🤍"
  return "This is the exact dress from your photo! 🤍"
}

/** Runs one full turn. Throws `StylistError`; the route maps it to safe copy. */
export async function runStylistTurn(input: StylistTurnInput): Promise<StylistTurnResult> {
  // The photo is read first: what it contains shapes both the reply she gets
  // and the ranking, so the conversation model needs it before it speaks.
  const photo: PhotoContext = input.image
    ? await readPhoto(input.image)
    : { description: null, issue: null }

  let understanding: Understanding
  try {
    understanding = await understand(
      input.message,
      input.history,
      input.preferences,
      photoNoteFor(photo)
    )
  } catch (error) {
    throw classify(error)
  }

  // What the photo showed is folded into the profile HERE, deterministically,
  // rather than trusting the conversation model to copy it into its own
  // `preferences` output. Asked to do that it reliably drops most of them —
  // an observed turn kept "ball-gown" and lost the high neckline, long
  // sleeves and lace entirely — which ranks this turn correctly (the matcher
  // is handed the attributes directly) but silently forgets the photo on the
  // very next message. Reading a photo is observation, not interpretation, so
  // it belongs on the deterministic side of the line like every other fact
  // this system derives from an image.
  //
  // `replace` rather than union: the photo states a complete look, so it
  // supersedes whatever these categories held before it arrived.
  const withPhoto = photo.attributes
    ? mergePreferences(input.preferences, {
        replace: [...PHOTO_DRIVEN_FIELDS],
        silhouette: photo.attributes.silhouette,
        neckline: photo.attributes.neckline,
        sleeves: photo.attributes.sleeves,
        embellishment: photo.attributes.embellishment,
        style: photo.attributes.style,
        color: dominantColors(photo.attributes.color),
        volume: photo.attributes.volume,
        train: photo.attributes.train,
      })
    : input.preferences

  // Her words are a correction to the photo, never an addition to it: "like
  // this but in black" must end up black, not black-and-ivory. So any
  // category she actually spoke about replaces what the photo put there.
  const delta = photo.attributes
    ? {
        ...understanding.delta,
        replace: [
          ...(understanding.delta.replace ?? []),
          ...PHOTO_DRIVEN_FIELDS.filter((key) => {
            const stated = understanding.delta[key]
            return Array.isArray(stated) ? stated.length > 0 : stated != null
          }),
        ],
      }
    : understanding.delta

  const preferences = mergePreferences(withPhoto, delta)

  const wantsProducts =
    !!input.similarToProductId ||
    !!photo.attributes ||
    understanding.readyToRecommend ||
    hasEnoughToRecommend(preferences)

  let recommendations: Recommendation[] = []

  if (wantsProducts) {
    // Progressively looser attempts, stopping at the first that returns
    // enough. Each step gives up exactly one thing, strictest first: showing
    // her something new, then matching her photo's colour. What is never
    // given up is grounding — an un-catalogued gown is still not offered as
    // an answer to a concrete ask (see findMatches).
    // Giving up on colour is only ever allowed when the colour came from the
    // PHOTO. A colour she typed is a hard requirement to the end: asked for
    // black with a photo of an ivory gown, and with no black gown of that
    // shape in the catalogue, the honest answer is nothing — this fallback
    // once answered it with white ball-gowns.
    const sheStatedColor = (understanding.delta.color ?? []).length > 0
    const mayRelaxColor = !!photo.attributes && !sheStatedColor

    const attempts: MatchOptions[] = [
      { excludeShown: preferences.shownProductIds.length > 0 },
      ...RELAX_LADDER.map((relaxFields) => ({ excludeShown: false, relaxFields })),
      ...(mayRelaxColor
        ? [{ excludeShown: false, relaxFields: RELAX_LADDER[RELAX_LADDER.length - 1], relaxImageColor: true }]
        : []),
    ]

    let finalMatches: RankedMatch[] = []
    for (const attempt of attempts) {
      finalMatches = await findMatches(preferences, {
        limit: STYLIST_MAX_RESULTS,
        similarToProductId: input.similarToProductId ?? undefined,
        imageAttributes: photo.attributes,
        ...attempt,
      })
      if (finalMatches.length >= STYLIST_MIN_RESULTS) break
    }

    // "Is one of these actually HER dress, not just similar to it?" — see
    // exact-match.ts for why this exists. Only worth asking when there is a
    // fresh photo this turn; a text-only or show-similar turn has nothing to
    // compare against. A wider, looser candidate pool is built specifically
    // for this check — the exact dress can rank outside the top 5 shown for
    // style (an unusual colourway, say) while still being confirmable once a
    // model actually looks at both photos side by side.
    let exactMatchId: string | null = null
    if (input.image && photo.attributes) {
      try {
        const candidatePool = await findMatches(preferences, {
          limit: STYLIST_EXACT_MATCH_CANDIDATES,
          imageAttributes: photo.attributes,
          excludeShown: false,
          relaxFields: RELAX_LADDER[RELAX_LADDER.length - 1],
        })

        const candidatesWithBytes = (
          await Promise.all(
            candidatePool.map(async (m): Promise<ExactMatchCandidate | null> => {
              const bytes = await loadProductImageBytes(m.product.image)
              return bytes ? { productId: m.product.id, bytes } : null
            })
          )
        ).filter((c): c is ExactMatchCandidate => c !== null)

        const result = await withTimeout(
          identifyExactMatch(input.image, candidatesWithBytes),
          STYLIST_EXACT_MATCH_TIMEOUT_MS
        )

        if (result) {
          exactMatchId = result.productId
          // Always lead with it, whether or not it happened to already be in
          // the attribute-ranked list — finding the exact dress and then
          // burying it at position 3 because that's where similarity scoring
          // put it would be the same failure by a different route.
          const pinned = candidatePool.find((m) => m.product.id === result.productId)
          if (pinned) {
            finalMatches = [
              pinned,
              ...finalMatches.filter((m) => m.product.id !== result.productId),
            ].slice(0, STYLIST_MAX_RESULTS)
          }
        }
      } catch (error) {
        // Enhancement, not a requirement — proceed on similarity ranking alone.
        console.warn(`[AI Stylist] exact-match unavailable: ${classify(error).code}`)
      }
    }

    const reasons = await explain(
      finalMatches,
      input.message,
      understanding.language,
      photo.description
    )

    recommendations = finalMatches.map((m) => ({
      productId: m.product.id,
      name: m.product.name,
      collection: m.product.collection,
      branch: m.product.branch,
      image: m.product.image,
      price: m.product.displayPrice,
      isSellable: m.product.isSellable,
      productUrl: m.product.productUrl,
      reason:
        m.product.id === exactMatchId
          ? exactMatchReason(understanding.language)
          : reasons.get(m.product.id) ?? "",
      isExactMatch: m.product.id === exactMatchId,
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

  // Never leave her with nothing to act on. A turn that shows no dresses and
  // offers no chips is a dead end — most often a greeting, where the model was
  // asked for starting points and didn't produce any. Falling back to a fixed
  // set costs nothing and removes the blank-page moment entirely.
  const quickReplies =
    understanding.quickReplies.length > 0
      ? understanding.quickReplies
      : recommendations.length === 0
        ? starterChipsFor(understanding.language)
        : []

  return {
    message,
    language: understanding.language,
    followUpQuestion: understanding.followUpQuestion,
    quickReplies,
    recommendations,
    preferences,
  }
}
