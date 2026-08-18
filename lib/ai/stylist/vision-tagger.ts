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
import { STYLIST_VISION_MODEL } from "./stylist-config"

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
    confidence: {
      type: "NUMBER",
      description: "0.0-1.0 confidence that these attributes are correct and clearly visible.",
    },
  },
  required: ["isDress", "silhouette", "neckline", "sleeves", "embellishment", "style", "color", "volume", "train", "confidence"],
}

const SYSTEM_INSTRUCTION = `You are a bridal atelier cataloguer for RAEY.
You are shown one photograph of a single gown from the RAEY catalogue.
Describe ONLY the garment, using the controlled vocabulary provided by the schema.

Rules:
- Report only what is clearly visible. If a feature is hidden, obscured, or ambiguous, leave that array empty rather than guessing.
- 'embellishment' must reflect visible surface detail. A clean gown with no applied decoration is 'minimal'.
- 'train' is 'none' when no train is visible.
- Never describe the model, her body, face, size, or appearance. Only the garment.
- Lower your confidence when the photo is small, dark, cropped, angled, or the gown is partly out of frame.`

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
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
  }
}
