/**
 * lib/stylist-image.ts
 *
 * Prepares an inspiration photo in the browser, before it is ever uploaded.
 *
 * Three things happen here, all of them deliberately client-side:
 *
 *  - Downscaling. A modern phone photo is 4-12MB; the vision model reads a
 *    1024px copy just as well. Everything saved here is latency the shopper
 *    doesn't wait through and free-tier quota that isn't spent.
 *  - Re-encoding. Drawing through a canvas discards EXIF, so the GPS
 *    coordinates and camera serial that ride along in a phone photo never
 *    leave her device. She is sending a dress, not a location.
 *  - A thumbnail, so the transcript can show what she sent without keeping a
 *    megabyte of base64 in sessionStorage per message.
 */

/** What the file picker offers, and what the endpoint accepts. */
export const STYLIST_IMAGE_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp"

/** Longest edge sent upstream. Beyond this the model gains nothing. */
const UPLOAD_MAX_EDGE = 1024
const UPLOAD_QUALITY = 0.82

/** Longest edge kept in the transcript. */
const THUMB_MAX_EDGE = 240
const THUMB_QUALITY = 0.7

/** Guard against a 100MB RAW before we try to decode it. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024

export interface PreparedImage {
  /** Bare base64 (no `data:` prefix) — what the endpoint wants. */
  data: string
  mimeType: string
  /** Data URL small enough to keep in the transcript. */
  thumb: string
}

export type PrepareResult =
  | { ok: true; image: PreparedImage }
  | { ok: false; reason: "unsupported" | "too-large" | "unreadable" }

function isSupported(file: File): boolean {
  return /^image\/(jpe?g|png|webp)$/i.test(file.type)
}

/**
 * Decodes to something `drawImage` accepts, honouring EXIF orientation so a
 * portrait phone photo doesn't arrive sideways.
 */
async function decode(file: File): Promise<{ source: CanvasImageSource; w: number; h: number; release(): void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as any)
      return { source: bitmap, w: bitmap.width, h: bitmap.height, release: () => bitmap.close() }
    } catch {
      // Older Safari rejects the options bag — fall through to the <img> path.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("decode failed"))
      el.src = url
    })
    return {
      source: img,
      w: img.naturalWidth,
      h: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function render(source: CanvasImageSource, w: number, h: number, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  const width = Math.max(1, Math.round(w * scale))
  const height = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no 2d context")

  // JPEG has no alpha: without this, a transparent PNG renders on black.
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)

  return canvas.toDataURL("image/jpeg", quality)
}

export async function prepareInspirationImage(file: File): Promise<PrepareResult> {
  if (!isSupported(file)) return { ok: false, reason: "unsupported" }
  if (file.size > MAX_INPUT_BYTES) return { ok: false, reason: "too-large" }

  let decoded: Awaited<ReturnType<typeof decode>>
  try {
    decoded = await decode(file)
  } catch {
    return { ok: false, reason: "unreadable" }
  }

  try {
    const upload = render(decoded.source, decoded.w, decoded.h, UPLOAD_MAX_EDGE, UPLOAD_QUALITY)
    const thumb = render(decoded.source, decoded.w, decoded.h, THUMB_MAX_EDGE, THUMB_QUALITY)
    return {
      ok: true,
      image: {
        data: upload.slice(upload.indexOf(",") + 1),
        mimeType: "image/jpeg",
        thumb,
      },
    }
  } catch {
    return { ok: false, reason: "unreadable" }
  } finally {
    decoded.release()
  }
}

/** First image on a paste or drop event, if there is one. */
export function imageFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null
  for (const item of Array.from(data.files)) {
    if (item.type.startsWith("image/")) return item
  }
  return null
}
