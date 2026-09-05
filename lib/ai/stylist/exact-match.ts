/**
 * lib/ai/stylist/exact-match.ts
 *
 * "Is this actually one of OUR dresses?"
 *
 * matcher.ts finds gowns that LOOK alike by attribute tags. It has no notion
 * of visual identity, so a shopper's own photo of a real RAEY dress — worn by
 * a different model, shot from a different angle, in different light — can
 * lose the attribute-similarity ranking to a merely-similar gown, or worse,
 * land her on a genuinely different dress that happens to share the same
 * tags. That reads as "this AI doesn't even know its own catalogue", and it's
 * a fair complaint: nothing in the pipeline ever looked at whether the two
 * photos show the same garment.
 *
 * This module does exactly that one thing: given her photo and a shortlist of
 * attribute-ranked candidates (already computed, so this costs nothing extra
 * to build), it asks a vision model to look at all of them side by side and
 * say whether one is actually the same dress — not similar, the same design.
 */

import { GoogleGenAI } from "@google/genai"
import sharp from "sharp"
import {
  STYLIST_EXACT_MATCH_CANDIDATES,
  STYLIST_EXACT_MATCH_MODEL,
  STYLIST_EXACT_MATCH_THUMB_PX,
} from "./stylist-config"

let client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set")
  if (!client) client = new GoogleGenAI({ apiKey })
  return client
}

export interface ExactMatchCandidate {
  productId: string
  bytes: Buffer
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    matchedIndex: {
      type: "INTEGER",
      description:
        "The 1-based number of the candidate photo that shows the EXACT SAME dress design as the shopper's photo — same cut, same neckline, same embellishment layout, same fabric. NOT merely similar in style. 0 if none of the candidates is actually the same dress.",
    },
    confidence: {
      type: "NUMBER",
      description: "0.0-1.0. How sure you are this is truly the same garment, not a lookalike.",
    },
  },
  required: ["matchedIndex", "confidence"],
}

const SYSTEM_INSTRUCTION = `You compare one shopper's photo of a dress against a numbered list of catalogue product photos, to find out if any of them shows the EXACT SAME dress.

This is identity, not style. Two dresses can share silhouette, colour and neckline while being different designs — different lace pattern, different beading placement, a different slit, a different back. Only answer a match when you would tell the shopper "yes, this is that exact dress," not "this is similar."

Photos of the same real dress can still differ in: the model wearing it, pose, camera angle, lighting, crop, and photo quality. Look past all of that to the garment itself.

If you are not genuinely confident it is the same design, say no match (matchedIndex: 0) rather than guess — a wrong "yes" is far worse than a missed one, since it would tell a customer she's looking at a dress that isn't actually the one in her photo.`

/** Resizes to a flat token cost and strips to JPEG so every candidate call is predictable. */
async function toThumb(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .resize(STYLIST_EXACT_MATCH_THUMB_PX, STYLIST_EXACT_MATCH_THUMB_PX, { fit: "inside" })
    .jpeg({ quality: 82 })
    .toBuffer()
}

/**
 * Returns the productId of a candidate confirmed to be the exact same dress
 * as the shopper's photo, or null when none is — including when the call
 * fails. This is an enhancement layer: its failure must never break the
 * turn, only fall back to the attribute-similarity result the caller already
 * has.
 */
export async function identifyExactMatch(
  shopperImage: { data: Buffer; mimeType: string },
  candidates: ExactMatchCandidate[]
): Promise<{ productId: string; confidence: number } | null> {
  const pool = candidates.slice(0, STYLIST_EXACT_MATCH_CANDIDATES)
  if (pool.length === 0) return null

  try {
    const ai = getClient()

    const shopperThumb = await toThumb(shopperImage.data)
    const candidateThumbs = await Promise.all(pool.map((c) => toThumb(c.bytes)))

    const parts: any[] = [
      { text: "Shopper's photo:" },
      { inlineData: { data: shopperThumb.toString("base64"), mimeType: "image/jpeg" } },
      { text: `Candidates, numbered 1 to ${pool.length}:` },
    ]
    candidateThumbs.forEach((thumb, i) => {
      parts.push({ text: `Candidate ${i + 1}:` })
      parts.push({ inlineData: { data: thumb.toString("base64"), mimeType: "image/jpeg" } })
    })

    const response = await ai.models.generateContent({
      model: STYLIST_EXACT_MATCH_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as any,
        temperature: 0,
      },
    })

    const text = response.text
    if (!text) return null
    const parsed = JSON.parse(text)
    const index = Number(parsed?.matchedIndex)
    const confidence = Number(parsed?.confidence)

    // A high bar deliberately: this claim ("this IS your dress") is much
    // stronger than a similarity ranking's, so it only fires when the model
    // is genuinely confident, not merely leaning yes.
    if (!Number.isInteger(index) || index < 1 || index > pool.length) return null
    if (!Number.isFinite(confidence) || confidence < 0.75) return null

    return { productId: pool[index - 1].productId, confidence }
  } catch {
    // Enhancement, not a requirement — the turn proceeds on attribute
    // similarity alone if this fails or times out.
    return null
  }
}
