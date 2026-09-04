/**
 * lib/ai/stylist/vision-tagger.ts
 *
 * Derives structured style attributes from a product's official photograph.
 *
 * Why this exists: the ERP catalogue carries no style metadata at all — no
 * silhouette, neckline, sleeve, embellishment or colour fields, and every
 * product description is empty. The product image is the only place that
 * information exists, so the stylist reads it once per product and caches the
 * result (see `attribute-index.ts`). Matching then runs deterministically over
 * those cached attributes; the model never picks products at request time.
 *
 * Attributes are observations about a garment, constrained to a closed
 * vocabulary and schema — never free text, and never anything about a person.
 */

import { GoogleGenAI } from "@google/genai"
import {
  COLORS,
  EMBELLISHMENTS,
  NECKLINES,
  SILHOUETTES,
  SLEEVES,
  STYLES,
  TRAINS,
  VOLUMES,
  coerceMany,
  coerceOne,
} from "./vocabulary"
import type { DressAttributes } from "./attribute-types"
import { STYLIST_INSPIRATION_MODEL, STYLIST_VISION_MODEL } from "./stylist-config"

let client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set")
  if (!client) client = new GoogleGenAI({ apiKey })
  return client
}

const enumArray = (values: readonly string[], description: string) => ({
  type: "ARRAY",
  description,
  items: { type: "STRING", enum: [...values] },
})

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    isDress: {
      type: "BOOLEAN",
      description: "True only if the image clearly shows a dress or gown.",
    },
    silhouette: enumArray(SILHOUETTES, "Overall shape of the gown. Usually one value."),
    neckline: enumArray(NECKLINES, "Neckline type. Usually one value."),
    sleeves: enumArray(SLEEVES, "Sleeve treatment. Usually one value."),
    embellishment: enumArray(
      EMBELLISHMENTS,
      "Surface detail actually visible. Use 'minimal' for a clean, undecorated gown."
    ),
    style: enumArray(STYLES, "Two to four adjectives describing the mood of the gown."),
    color: enumArray(COLORS, "Dominant colours of the fabric."),
    volume: { type: "STRING", enum: [...VOLUMES], description: "Fullness of the skirt." },
    train: { type: "STRING", enum: [...TRAINS], description: "Train length, 'none' if absent." },
    description: {
      type: "STRING",
      description:
        "2-4 sentences describing this gown as a stylist would: fabric look, how it falls, sleeve/neckline detail, embellishment density and placement, slit or cut-outs, coverage, train, overall impression. Only what is visible. Never mention the model/person.",
    },
    confidence: {
      type: "NUMBER",
      description: "0.0-1.0 confidence that these attributes are correct and clearly visible.",
    },
  },
  required: ["isDress", "silhouette", "neckline", "sleeves", "embellishment", "style", "color", "volume", "train", "description", "confidence"],
}

const SYSTEM_INSTRUCTION = `You are a bridal atelier cataloguer for RAEY.
You are shown one photograph of a single gown from the RAEY catalogue.
Describe ONLY the garment, using the controlled vocabulary provided by the schema.

Rules:
- Report only what is clearly visible. If a feature is hidden, obscured, or ambiguous, leave that array empty rather than guessing.
- 'embellishment' must reflect visible surface detail. A clean gown with no applied decoration is 'minimal'.
- 'train' is 'none' when no train is visible.
- Never describe the model, her body, face, size, or appearance. Only the garment.
- The 'description' field is read later to answer detailed customer questions the fixed vocabulary cannot cover (slits, cut-outs, coverage/modesty, sheerness, fabric look, where the beading sits, back detail). Write it densely and factually — every concrete visible detail you can state, no marketing adjectives, no speculation.
- Lower your confidence when the photo is small, dark, cropped, angled, or the gown is partly out of frame.`

/**
 * The same reading, applied to a photo the SHOPPER brought ("I want something
 * like this") rather than one of RAEY's own product shots.
 *
 * Deliberately the same schema and the same closed vocabulary as the catalogue
 * tagger above. That is the whole trick: her photo and every gown in the index
 * get described in one shared attribute space, so "find me something like this"
 * becomes a real comparison between comparable descriptions rather than a
 * model being asked to eyeball a resemblance.
 *
 * Unlike `tagDressImage` this reports WHY it failed. A shopper who uploads a
 * photo of her shoes deserves to be told the stylist couldn't see a dress in
 * it, not a generic apology.
 */
export type InspirationReading =
  | { ok: true; attributes: NonNullable<Awaited<ReturnType<typeof tagDressImage>>> }
  | { ok: false; reason: "not-a-dress" | "unreadable" }

const INSPIRATION_INSTRUCTION = `You are a bridal atelier cataloguer for RAEY.
A customer has sent a photograph of a dress she likes, as inspiration for what she wants. It may be a screenshot, a magazine page, a runway or event photo — not necessarily a clean studio shot.
Read the DRESS in it using the controlled vocabulary provided by the schema.

Rules:
- Describe only the garment. Never describe, identify, or comment on any person in the photo — not her face, body, size, skin, hair, or who she might be. The person is not part of the answer.
- Set 'isDress' false if no dress or gown is discernible (a photo of shoes, a face, a room, a blurred mess).
- If several outfits appear, read the single most prominent dress.
- Report only what is visible. Leave an array empty rather than guessing at something the angle or crop hides.
- 'embellishment' is 'minimal' for a clean, undecorated gown. 'train' is 'none' when none is visible.
- The 'description' is used to explain to her which catalogue gowns resemble this one, so state every concrete visible detail: fabric look, how it falls, neckline and sleeve treatment, where any beading or lace sits, slits or cut-outs, coverage, back detail, train.
- Lower confidence for small, dark, cropped, angled or partly obscured photos.`

export async function readInspirationImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<InspirationReading> {
  const ai = getClient()

  const response = await ai.models.generateContent({
    model: STYLIST_INSPIRATION_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: imageBuffer.toString("base64"), mimeType } },
          { text: "Read the dress in this inspiration photo using the schema." },
        ],
      },
    ],
    config: {
      systemInstruction: INSPIRATION_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA as any,
      temperature: 0,
    },
  })

  const text = response.text
  if (!text) return { ok: false, reason: "unreadable" }

  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: "unreadable" }
  }

  if (parsed?.isDress === false) return { ok: false, reason: "not-a-dress" }

  const confidence = Number(parsed?.confidence)
  const attributes = {
    silhouette: coerceMany(parsed.silhouette, SILHOUETTES),
    neckline: coerceMany(parsed.neckline, NECKLINES),
    sleeves: coerceMany(parsed.sleeves, SLEEVES),
    embellishment: coerceMany(parsed.embellishment, EMBELLISHMENTS),
    style: coerceMany(parsed.style, STYLES),
    color: coerceMany(parsed.color, COLORS),
    volume: coerceOne(parsed.volume, VOLUMES),
    train: coerceOne(parsed.train, TRAINS),
    description: String(parsed.description || "").trim().slice(0, 1200),
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
  }

  // Nothing usable came back in the vocabulary — treat it as unread rather
  // than matching the entire catalogue against an empty profile.
  const readAnything =
    attributes.silhouette.length > 0 ||
    attributes.neckline.length > 0 ||
    attributes.sleeves.length > 0 ||
    attributes.embellishment.length > 0 ||
    attributes.color.length > 0 ||
    attributes.volume !== null
  if (!readAnything) return { ok: false, reason: "not-a-dress" }

  return { ok: true, attributes }
}

/**
 * Reads one gown photograph into structured attributes.
 * Returns null when the image cannot be interpreted as a gown.
 */
export async function tagDressImage(
  imageBuffer: Buffer,
  mimeType = "image/webp"
): Promise<Omit<DressAttributes, "productId" | "imageUrl" | "taggedAt" | "version"> | null> {
  const ai = getClient()

  const response = await ai.models.generateContent({
    model: STYLIST_VISION_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: imageBuffer.toString("base64"), mimeType } },
          { text: "Catalogue this gown using the schema." },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA as any,
      // Cataloguing is observation, not invention.
      temperature: 0,
    },
  })

  const text = response.text
  if (!text) return null

  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (parsed?.isDress === false) return null

  const confidence = Number(parsed?.confidence)

  return {
    silhouette: coerceMany(parsed.silhouette, SILHOUETTES),
    neckline: coerceMany(parsed.neckline, NECKLINES),
    sleeves: coerceMany(parsed.sleeves, SLEEVES),
    embellishment: coerceMany(parsed.embellishment, EMBELLISHMENTS),
    style: coerceMany(parsed.style, STYLES),
    color: coerceMany(parsed.color, COLORS),
    volume: coerceOne(parsed.volume, VOLUMES),
    train: coerceOne(parsed.train, TRAINS),
    description: String(parsed.description || "").trim().slice(0, 1200),
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
  }
}
