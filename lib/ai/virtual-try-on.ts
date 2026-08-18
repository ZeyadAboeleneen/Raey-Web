/**
 * lib/ai/virtual-try-on.ts
 *
 * Provider-agnostic entry point for the RAEY AI Try-On.
 *
 * Everything outside `lib/ai/providers/*` talks to this module only, so a
 * second provider (or a replacement for Gemini) is a one-line dispatch change
 * rather than a refactor of the API route and the UI.
 *
 *   generateVirtualTryOn(personImage, dressImage, options)
 *       → { image, mimeType, provider, model, durationMs }
 *
 * The architecture is also the seam a future LIVE MIRROR / AR mode would plug
 * into: same inputs, a different provider capability.
 */

import { TRYON_PROVIDER, TRYON_TIMEOUT_MS } from "./try-on-config"
import type { TryOnPromptContext } from "./try-on-prompt"

/* ── Shared types ─────────────────────────────────────────────────── */

/** A normalised image ready to hand to a model — raw bytes plus its type. */
export interface TryOnImage {
  buffer: Buffer
  mimeType: string
}

export interface TryOnOptions extends TryOnPromptContext {
  /** Abort ceiling in ms. Defaults to AI_TRYON_TIMEOUT_MS. */
  timeoutMs?: number
}

export interface TryOnResult {
  /** Generated image bytes. */
  image: Buffer
  mimeType: string
  provider: string
  model: string
  durationMs: number
}

/**
 * Machine-readable failure reasons. The API route maps these to the copy the
 * shopper sees — raw provider errors never reach the browser.
 */
export type TryOnErrorCode =
  | "NOT_CONFIGURED"
  | "SAFETY_BLOCKED"
  | "NO_IMAGE_RETURNED"
  | "TIMEOUT"
  | "RATE_LIMITED_UPSTREAM"
  | "PROVIDER_ERROR"

export class TryOnError extends Error {
  constructor(
    message: string,
    public readonly code: TryOnErrorCode = "PROVIDER_ERROR",
    public readonly retryable: boolean = true
  ) {
    super(message)
    this.name = "TryOnError"
  }
}

/** The contract every provider implementation satisfies. */
export interface TryOnProvider {
  readonly name: string
  generate(person: TryOnImage, dress: TryOnImage, options: TryOnOptions): Promise<TryOnResult>
}

/* ── Dispatch ─────────────────────────────────────────────────────── */

let cachedProvider: TryOnProvider | null = null

async function resolveProvider(): Promise<TryOnProvider> {
  if (cachedProvider) return cachedProvider

  switch (TRYON_PROVIDER) {
    case "gemini": {
      const { geminiTryOnProvider } = await import("./providers/gemini")
      cachedProvider = geminiTryOnProvider
      break
    }
    default:
      throw new TryOnError(
        `Unknown try-on provider "${TRYON_PROVIDER}"`,
        "NOT_CONFIGURED",
        false
      )
  }

  return cachedProvider
}

/**
 * Generates a photorealistic visualization of `person` wearing `dress`.
 *
 * Both images must already be normalised (size/format) by the caller — see
 * `prepareTryOnImage` in `lib/ai/image-prep.ts`.
 */
export async function generateVirtualTryOn(
  person: TryOnImage,
  dress: TryOnImage,
  options: TryOnOptions = {}
): Promise<TryOnResult> {
  const provider = await resolveProvider()
  return provider.generate(person, dress, {
    ...options,
    timeoutMs: options.timeoutMs ?? TRYON_TIMEOUT_MS,
  })
}
