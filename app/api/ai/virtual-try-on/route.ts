/**
 * POST /api/ai/virtual-try-on
 *
 * The single network surface of the RAEY AI Try-On.
 *
 *   Browser → this route → Gemini → this route → Browser
 *
 * The browser sends multipart/form-data:
 *   photo   — the shopper's full-body photo (File)
 *   dressId — ERP item id of the gown (string)
 *   branch  — optional storefront branch slug, used only to build the product URL
 *
 * It never sends a dress image URL; the server resolves the official catalogue
 * image itself. The Gemini key stays server-side and raw provider errors are
 * translated to safe codes before they reach the client.
 *
 * Privacy: the uploaded photo exists only as a Buffer for the life of this
 * request. It is not written to disk, not stored, and never logged — including
 * in error paths.
 */

import { type NextRequest, NextResponse } from "next/server"
import { rateLimit } from "@/lib/rate-limit"
import {
  TRYON_ACCEPTED_MIME,
  TRYON_ENABLED,
  TRYON_MAX_DIMENSION,
  TRYON_MAX_REQUESTS_PER_DAY,
  TRYON_MAX_REQUESTS_PER_HOUR,
  TRYON_MAX_REQUESTS_PER_MINUTE,
  TRYON_MAX_UPLOAD_BYTES,
} from "@/lib/ai/try-on-config"
import { DressResolveError, resolveDressForTryOn } from "@/lib/ai/dress-resolver"
import { ImagePrepError, prepareTryOnImage } from "@/lib/ai/image-prep"
import { TryOnError, generateVirtualTryOn } from "@/lib/ai/virtual-try-on"
import { TRYON_PROMPT_VERSION } from "@/lib/ai/try-on-prompt"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Generation regularly runs past the default budget on larger photos.
export const maxDuration = 120

/* ── Client-facing error shape ────────────────────────────────────── */

interface ClientError {
  status: number
  code: string
  /** Shown to the shopper. Elegant, non-technical, never a provider message. */
  message: string
  /** Whether the UI should offer TRY AGAIN (vs. CHOOSE ANOTHER PHOTO only). */
  retryable: boolean
}

const GENERIC_FAILURE: ClientError = {
  status: 502,
  code: "GENERATION_FAILED",
  message: "We couldn't create your look this time. Please try again with a clear full-body photo.",
  retryable: true,
}

function fail(error: ClientError) {
  return NextResponse.json(
    { error: error.message, code: error.code, retryable: error.retryable },
    { status: error.status }
  )
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("x-real-ip") || "unknown"
}

/* ── Error translation ────────────────────────────────────────────── */

function translatePrepError(error: ImagePrepError): ClientError {
  switch (error.code) {
    case "EMPTY":
      return {
        status: 400,
        code: "NO_PHOTO",
        message: "Please choose a photo to continue.",
        retryable: false,
      }
    case "TOO_LARGE":
      return {
        status: 413,
        code: "PHOTO_TOO_LARGE",
        message: `That photo is larger than ${Math.round(TRYON_MAX_UPLOAD_BYTES / (1024 * 1024))} MB. Please choose a smaller one.`,
        retryable: false,
      }
    case "UNSUPPORTED_TYPE":
      return {
        status: 415,
        code: "PHOTO_UNSUPPORTED",
        message: "That file type isn't supported. Please upload a JPG, PNG or WEBP photo.",
        retryable: false,
      }
    case "TOO_SMALL":
      return {
        status: 400,
        code: "PHOTO_TOO_SMALL",
        message:
          "We couldn't get a clear view of you. For the best result, upload a full-body photo with your entire body visible.",
        retryable: false,
      }
    default:
      return {
        status: 400,
        code: "PHOTO_UNREADABLE",
        message: "We couldn't read that photo. Please try another one.",
        retryable: false,
      }
  }
}

function translateDressError(error: DressResolveError): ClientError {
  switch (error.code) {
    case "INVALID_ID":
    case "NOT_FOUND":
      return {
        status: 404,
        code: "DRESS_NOT_FOUND",
        message: "We couldn't find that gown. Please choose another dress.",
        retryable: false,
      }
    case "NOT_ELIGIBLE":
      return {
        status: 400,
        code: "DRESS_NOT_ELIGIBLE",
        message: "AI Try-On isn't available for this gown yet.",
        retryable: false,
      }
    default:
      return {
        status: 503,
        code: "DRESS_IMAGE_UNAVAILABLE",
        message: "This gown's imagery isn't ready for Try-On right now. Please try another dress.",
        retryable: false,
      }
  }
}

function translateTryOnError(error: TryOnError): ClientError {
  switch (error.code) {
    case "NOT_CONFIGURED":
      return {
        status: 503,
        code: "UNAVAILABLE",
        message: "RAEY AI Try-On is unavailable at the moment. Please try again shortly.",
        retryable: false,
      }
    case "SAFETY_BLOCKED":
      return {
        status: 422,
        code: "PHOTO_REJECTED",
        message:
          "We couldn't create a look from that photo. Please try a clear, full-body photo of yourself.",
        retryable: false,
      }
    case "TIMEOUT":
      return {
        status: 504,
        code: "TIMEOUT",
        message: "Creating your look took longer than expected. Please try again.",
        retryable: true,
      }
    case "RATE_LIMITED_UPSTREAM":
      return {
        status: 503,
        code: "BUSY",
        message: "RAEY AI Try-On is very busy right now. Please try again in a few minutes.",
        retryable: true,
      }
    default:
      return GENERIC_FAILURE
  }
}

/* ── Handler ──────────────────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  if (!TRYON_ENABLED) {
    return fail({
      status: 503,
      code: "DISABLED",
      message: "RAEY AI Try-On is unavailable at the moment.",
      retryable: false,
    })
  }

  const startedAt = Date.now()
  const ip = clientIp(request)

  /* 1. Rate limiting — three windows so neither a burst nor a slow drip gets
        through. Enforced here, server-side; the UI restriction is cosmetic. */
  const [perMinute, perHour, perDay] = await Promise.all([
    rateLimit(`tryon:m:${ip}`, TRYON_MAX_REQUESTS_PER_MINUTE, 60),
    rateLimit(`tryon:h:${ip}`, TRYON_MAX_REQUESTS_PER_HOUR, 3600),
    rateLimit(`tryon:d:${ip}`, TRYON_MAX_REQUESTS_PER_DAY, 86_400),
  ])

  const exceeded = [perMinute, perHour, perDay].find((r) => !r.success)
  if (exceeded) {
    return NextResponse.json(
      {
        error:
          "You've reached the Try-On limit for now. Please try again a little later, or book a private appointment to see the gown in person.",
        code: "RATE_LIMITED",
        retryable: false,
        retryAfter: Math.max(0, Math.ceil((exceeded.reset - Date.now()) / 1000)),
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((exceeded.reset - Date.now()) / 1000))) },
      }
    )
  }

  /* 2. Parse the multipart body. */
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail({
      status: 400,
      code: "BAD_REQUEST",
      message: "Something went wrong sending your photo. Please try again.",
      retryable: true,
    })
  }

  const photo = form.get("photo")
  const dressId = String(form.get("dressId") || "")
  const branch = form.get("branch") ? String(form.get("branch")) : null

  if (!(photo instanceof File) || photo.size === 0) {
    return fail({
      status: 400,
      code: "NO_PHOTO",
      message: "Please choose a photo to continue.",
      retryable: false,
    })
  }
  if (photo.size > TRYON_MAX_UPLOAD_BYTES) {
    return fail(translatePrepError(new ImagePrepError("too large", "TOO_LARGE")))
  }
  // Declared type is a cheap first filter; magic bytes are the real check.
  if (photo.type && !TRYON_ACCEPTED_MIME.includes(photo.type as any)) {
    return fail(translatePrepError(new ImagePrepError("unsupported", "UNSUPPORTED_TYPE")))
  }

  /* 3. Validate and normalise the shopper's photo FIRST. It is the input they
        control, so a problem with it must surface as a photo message rather
        than being masked by an unrelated catalogue error — and a bad upload
        should not cost an ERP lookup. */
  let personImage
  try {
    personImage = await prepareTryOnImage(Buffer.from(await photo.arrayBuffer()))
  } catch (error) {
    if (error instanceof ImagePrepError) return fail(translatePrepError(error))
    console.error("[AI Try-On] photo preparation failed")
    return fail(GENERIC_FAILURE)
  }

  /* 4. Resolve the official gown image (never trusts a client-supplied URL). */
  let dress
  let dressImage
  try {
    dress = await resolveDressForTryOn(dressId, branch)
    dressImage = await prepareTryOnImage(dress.imageBuffer, {
      // The catalogue image is a reference, not the canvas — a smaller ceiling
      // keeps the payload down without losing garment detail.
      maxDimension: Math.min(TRYON_MAX_DIMENSION, 1280),
      minDimension: 0,
      maxBytes: 30 * 1024 * 1024,
    })
  } catch (error) {
    if (error instanceof DressResolveError) return fail(translateDressError(error))
    // A catalogue image we cannot decode is our problem, not the shopper's —
    // report it as gown imagery being unavailable, not as a bad photo.
    if (error instanceof ImagePrepError) {
      return fail(translateDressError(new DressResolveError("unreadable", "IMAGE_UNREACHABLE")))
    }
    console.error("[AI Try-On] dress resolution failed")
    return fail(GENERIC_FAILURE)
  }

  /* 5. Generate. */
  try {
    const result = await generateVirtualTryOn(personImage, dressImage, {
      dressName: dress.name,
      collection: dress.collection,
    })

    // Metrics only — no image bytes, no photo metadata, nothing identifying.
    console.log(
      `[AI Try-On] ok dress=${dress.id} model=${result.model} prompt=${TRYON_PROMPT_VERSION} ms=${Date.now() - startedAt}`
    )

    return NextResponse.json(
      {
        image: `data:${result.mimeType};base64,${result.image.toString("base64")}`,
        dress: {
          id: dress.id,
          name: dress.name,
          collection: dress.collection,
          branch: dress.branch,
          imageUrl: dress.imageUrl,
          productUrl: dress.productUrl,
        },
        meta: {
          durationMs: Date.now() - startedAt,
          model: result.model,
          promptVersion: TRYON_PROMPT_VERSION,
        },
      },
      // A personal, non-cacheable result.
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof TryOnError) {
      console.error(`[AI Try-On] failed dress=${dress.id} code=${error.code}`)
      return fail(translateTryOnError(error))
    }
    console.error("[AI Try-On] unexpected generation failure")
    return fail(GENERIC_FAILURE)
  }
}
