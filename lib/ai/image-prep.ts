/**
 * lib/ai/image-prep.ts
 *
 * Server-side validation and normalisation of the two images that go to the
 * model. Runs entirely in memory — the shopper's photo is never written to
 * disk and is discarded when the request ends.
 *
 * Responsibilities:
 *   1. Reject anything that is not a real jpg/png/webp (magic bytes, not the
 *      filename or the client-supplied content type).
 *   2. Enforce byte-size and dimension floors/ceilings.
 *   3. Downscale oversized uploads and re-encode to JPEG so the payload sent
 *      upstream stays reasonable without visibly degrading the result.
 */

import sharp from "sharp"
import {
  TRYON_JPEG_QUALITY,
  TRYON_MAX_DIMENSION,
  TRYON_MAX_UPLOAD_BYTES,
  TRYON_MIN_DIMENSION,
} from "./try-on-config"
import type { TryOnImage } from "./virtual-try-on"

export type ImagePrepErrorCode =
  | "EMPTY"
  | "TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "TOO_SMALL"
  | "UNREADABLE"

export class ImagePrepError extends Error {
  constructor(message: string, public readonly code: ImagePrepErrorCode) {
    super(message)
    this.name = "ImagePrepError"
  }
}

/** Magic-byte sniffing — a renamed .exe must not reach sharp or the model. */
function sniffFormat(buffer: Buffer): "jpeg" | "png" | "webp" | null {
  if (buffer.length < 12) return null

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg"

  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "png"
  }

  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "webp"
  }

  return null
}

export interface PrepareOptions {
  /** Long-edge ceiling. Defaults to AI_TRYON_MAX_DIMENSION. */
  maxDimension?: number
  /** Short-edge floor. Defaults to AI_TRYON_MIN_DIMENSION. Pass 0 to skip. */
  minDimension?: number
  /** Byte ceiling on the raw input. Defaults to AI_TRYON_MAX_UPLOAD_BYTES. */
  maxBytes?: number
}

export interface PreparedImage extends TryOnImage {
  width: number
  height: number
  /** True when the source was downscaled to fit `maxDimension`. */
  resized: boolean
}

/**
 * Validates, downscales and re-encodes an image for model consumption.
 * Throws `ImagePrepError` with a code the caller maps to shopper-facing copy.
 */
export async function prepareTryOnImage(
  input: Buffer,
  options: PrepareOptions = {}
): Promise<PreparedImage> {
  const maxBytes = options.maxBytes ?? TRYON_MAX_UPLOAD_BYTES
  const maxDimension = options.maxDimension ?? TRYON_MAX_DIMENSION
  const minDimension = options.minDimension ?? TRYON_MIN_DIMENSION

  if (!input || input.length === 0) {
    throw new ImagePrepError("Empty image", "EMPTY")
  }
  if (input.length > maxBytes) {
    throw new ImagePrepError("Image exceeds the size limit", "TOO_LARGE")
  }
  if (!sniffFormat(input)) {
    throw new ImagePrepError("Unsupported image format", "UNSUPPORTED_TYPE")
  }

  let metadata: sharp.Metadata
  try {
    metadata = await sharp(input).metadata()
  } catch {
    throw new ImagePrepError("Image could not be decoded", "UNREADABLE")
  }

  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  if (!width || !height) {
    throw new ImagePrepError("Image has no readable dimensions", "UNREADABLE")
  }
  if (minDimension > 0 && Math.min(width, height) < minDimension) {
    throw new ImagePrepError("Image resolution is too low", "TOO_SMALL")
  }

  const needsResize = Math.max(width, height) > maxDimension

  try {
    // `rotate()` with no argument applies the EXIF orientation — without it a
    // portrait phone photo arrives sideways and the model fits the gown to a
    // rotated body.
    const pipeline = sharp(input).rotate()
    if (needsResize) {
      pipeline.resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
    }

    const { data, info } = await pipeline
      .jpeg({ quality: TRYON_JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })

    return {
      buffer: data,
      mimeType: "image/jpeg",
      width: info.width,
      height: info.height,
      resized: needsResize,
    }
  } catch {
    throw new ImagePrepError("Image could not be processed", "UNREADABLE")
  }
}

/**
 * Parses a `data:image/...;base64,...` URL into raw bytes.
 * Returns null for anything that is not a base64 image data URL.
 */
export function decodeDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim())
  if (!match) return null
  try {
    return Buffer.from(match[2], "base64")
  } catch {
    return null
  }
}
