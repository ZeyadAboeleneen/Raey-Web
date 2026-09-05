/**
 * lib/ai/stylist/color-terms.ts
 *
 * Reads colour words straight out of her message.
 *
 * A safety net, not a replacement for the model. The conversation model
 * extracts colour correctly on a simple request — but hand it two things at
 * once ("my wedding is on June 12 and I want a black mermaid dress") and it
 * reliably keeps the silhouette and drops the colour, reproducibly, on every
 * run. That turns a request for black into a row of champagne gowns, which is
 * the single worst answer this stylist can give.
 *
 * Colour is a closed vocabulary and shoppers name it in plain words, so it
 * does not need a language model to recognise. Used only when the model
 * returned no colour at all — anything it does extract still wins.
 */

import { COLORS, type Color } from "./vocabulary"

/** Words that name a colour, across the languages RAEY's customers write in. */
const TERMS: Record<Color, string[]> = {
  white: ["white", "أبيض", "ابيض", "abyad"],
  ivory: ["ivory", "off-white", "offwhite", "عاجي", "أوف وايت", "اوف وايت"],
  champagne: ["champagne", "شمبانيا", "شامبين"],
  nude: ["nude", "beige", "نود", "بيج"],
  blush: ["blush", "بلاش"],
  gold: ["gold", "golden", "ذهبي", "دهبي", "dahaby", "gold"],
  silver: ["silver", "فضي", "فضى", "fady"],
  black: ["black", "أسود", "اسود", "aswad", "sooda", "سودا"],
  navy: ["navy", "كحلي", "كحلى"],
  red: ["red", "أحمر", "احمر", "a7mar", "ahmar"],
  burgundy: ["burgundy", "maroon", "نبيتي", "نبيتى", "عنابي", "عنابى"],
  green: ["green", "أخضر", "اخضر", "akhdar"],
  blue: ["blue", "أزرق", "ازرق", "azra2", "azraq"],
  pink: ["pink", "بمبي", "بمبى", "زهري", "وردي", "وردى"],
  lilac: ["lilac", "lavender", "ليلكي", "ليلكى", "بنفسجي", "بنفسجى"],
  grey: ["grey", "gray", "رمادي", "رمادى"],
  multicolor: ["multicolor", "multicoloured", "multicolored"],
}

/**
 * Negations. A colour she is ruling out is an avoidance, which is the model's
 * job — picking "black" out of "not black" would invert her request, so any
 * colour sitting close after one of these is left alone entirely.
 */
const NEGATIONS = [
  "not", "no", "without", "except", "anything but", "other than",
  "مش", "مو", "بلا", "من غير", "بدون", "غير", "لا",
  "mesh", "msh", "men gher", "bedoon",
]

/** JavaScript's \b is ASCII-only and never fires beside Arabic script. */
const B0 = "(?<![\\p{L}\\p{N}])"
const B1 = "(?![\\p{L}\\p{N}])"

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Colours named in the message, minus any she is ruling out. Empty when she
 * mentions none — never a guess.
 */
export function extractColors(message: string): Color[] {
  const text = String(message || "").toLowerCase()
  if (!text) return []

  const found: Color[] = []

  for (const color of COLORS) {
    for (const term of TERMS[color] ?? []) {
      const pattern = new RegExp(`${B0}${escape(term)}${B1}`, "iu")
      const match = pattern.exec(text)
      if (!match) continue

      // Look at the short run of words just before the colour: "not black",
      // "من غير أسود". Only that window, so "I don't like lace, I want black"
      // still reads as black.
      const before = text.slice(Math.max(0, match.index - 22), match.index)
      const negated = NEGATIONS.some((n) => before.includes(n))
      if (negated) break

      found.push(color)
      break
    }
  }

  return found
}
