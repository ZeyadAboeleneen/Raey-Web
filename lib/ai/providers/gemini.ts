/**
 * lib/ai/providers/gemini.ts
 *
 * Gemini native image generation/editing implementation of `TryOnProvider`.
 *
 * This is the ONLY file in the application that knows the try-on runs on
 * Gemini. Swapping providers means adding a sibling here and changing the
 * dispatch in `lib/ai/virtual-try-on.ts` — nothing else.
 *
 * The API key is read from the server environment and never leaves it.
 */

import { GoogleGenAI } from "@google/genai"
import { GEMINI_IMAGE_MODEL } from "../try-on-config"
import { buildTryOnPrompt } from "../try-on-prompt"
import {
  TryOnError,
  type TryOnImage,
  type TryOnOptions,
  type TryOnProvider,
  type TryOnResult,
} from "../virtual-try-on"

let client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new TryOnError("GEMINI_API_KEY is not set", "NOT_CONFIGURED", false)
  }
  if (!client) client = new GoogleGenAI({ apiKey })
  return client
}

/** Pulls the first inline image part out of a generateContent response. */
function extractImage(response: any): { data: string; mimeType: string } | null {
  const parts = response?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return null

  for (const part of parts) {
    const inline = part?.inlineData
    if (inline?.data && String(inline.mimeType || "").startsWith("image/")) {
      return { data: inline.data, mimeType: inline.mimeType }
    }
  }
  return null
}

/**
 * Classifies an upstream failure into a `TryOnErrorCode`.
 * We inspect message text because the SDK surfaces HTTP failures as generic
 * Errors; the raw message is used for classification only and is never
 * forwarded to the browser.
 */
function classify(error: any): TryOnError {
  if (error instanceof TryOnError) return error

  const message = String(error?.message || error || "")
  const status = error?.status ?? error?.code

  if (error?.name === "AbortError" || /abort|timed? ?out|deadline/i.test(message)) {
    return new TryOnError("Generation timed out", "TIMEOUT", true)
  }
  if (status === 429 || /quota|rate limit|resource_exhausted/i.test(message)) {
    return new TryOnError("Upstream rate limit", "RATE_LIMITED_UPSTREAM", true)
  }
  if (/safety|blocked|prohibited|policy/i.test(message)) {
    return new TryOnError("Blocked by safety filters", "SAFETY_BLOCKED", false)
  }
  if (status === 401 || status === 403 || /api key|permission|unauthenticated/i.test(message)) {
    return new TryOnError("Provider rejected credentials", "NOT_CONFIGURED", false)
  }
  return new TryOnError("Provider request failed", "PROVIDER_ERROR", true)
}

export const geminiTryOnProvider: TryOnProvider = {
  name: "gemini",

  async generate(
    person: TryOnImage,
    dress: TryOnImage,
    options: TryOnOptions
  ): Promise<TryOnResult> {
    const ai = getClient()
    const startedAt = Date.now()

    // The SDK honours an AbortSignal, so a hung upstream call cannot pin a
    // Node request handler open indefinitely.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000)

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_IMAGE_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              // Order matters — the prompt refers to IMAGE 1 / IMAGE 2.
              { inlineData: { data: person.buffer.toString("base64"), mimeType: person.mimeType } },
              { inlineData: { data: dress.buffer.toString("base64"), mimeType: dress.mimeType } },
              { text: buildTryOnPrompt(options) },
            ],
          },
        ],
        config: {
          responseModalities: ["IMAGE"],
          // Low temperature: this is a faithful transformation, not a creative
          // reinterpretation of either the person or the gown.
          temperature: 0.2,
          abortSignal: controller.signal,
        },
      })

      const blockReason = (response as any)?.promptFeedback?.blockReason
      if (blockReason) {
        throw new TryOnError(`Prompt blocked: ${blockReason}`, "SAFETY_BLOCKED", false)
      }

      const image = extractImage(response)
      if (!image) {
        const finishReason = (response as any)?.candidates?.[0]?.finishReason
        if (finishReason && /safety|prohibited|blocklist/i.test(String(finishReason))) {
          throw new TryOnError(`Blocked: ${finishReason}`, "SAFETY_BLOCKED", false)
        }
        throw new TryOnError("Model returned no image", "NO_IMAGE_RETURNED", true)
      }

      return {
        image: Buffer.from(image.data, "base64"),
        mimeType: image.mimeType,
        provider: "gemini",
        model: GEMINI_IMAGE_MODEL,
        durationMs: Date.now() - startedAt,
      }
    } catch (error: any) {
      throw classify(error)
    } finally {
      clearTimeout(timeout)
    }
  },
}
