/**
 * lib/image-upload-service.ts
 *
 * Central image upload, delete, and update service.
 *
 * Storage layout:   {UPLOAD_DIR}/{folder}/{guid}.webp
 * URL layout:       /uploads/{folder}/{guid}.webp  (served by app/uploads/[...path]/route.ts)
 *
 * UPLOAD_DIR env var → absolute path outside deployment (survives redeployments).
 * Not set            → <cwd>/public/uploads  (development fallback only).
 *
 * Processing pipeline
 * ───────────────────
 *   1. Validate folder name (alphanumeric + hyphens only — prevents path injection)
 *   2. Enforce raw file size limit (default 20 MB)
 *   3. Validate by magic bytes (jpg / jpeg / png / webp — rejects renamed files)
 *   4. Decode image metadata; enforce dimension limits (default 8 000 × 8 000 px)
 *   5. Resize to ≤ MAX_WIDTH (1 600 px) preserving aspect ratio
 *   6. Convert to WebP @ quality 80
 *   7. Save with a GUID filename
 *   8. Return { url, fileName, fileSize }
 */

import path   from "path"
import fs     from "fs/promises"
import { existsSync } from "fs"
import crypto from "crypto"
import sharp  from "sharp"

/* ================================================================== */
/*  Public types / interface                                           */
/* ================================================================== */

export interface ImageUploadResult {
  /** Relative URL, e.g. /uploads/products/abc.webp */
  url:      string
  /** File name on disk, e.g. abc.webp */
  fileName: string
  /** File size in bytes after WebP conversion */
  fileSize: number
}

export interface IImageUploadService {
  uploadBuffer(buffer: Buffer, folder?: string): Promise<ImageUploadResult>
  uploadFromDataUrl(dataUrl: string, folder?: string): Promise<ImageUploadResult>
  deleteImage(urlOrAbsPath: string): Promise<boolean>
  updateImage(oldUrl: string, newBuffer: Buffer, folder?: string): Promise<ImageUploadResult>
}

/* ================================================================== */
/*  Upload error — carries a safe client message + HTTP status hint   */
/* ================================================================== */

export class ImageUploadError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number = 400,
    public readonly code: string = "UPLOAD_ERROR"
  ) {
    super(message)
    this.name = "ImageUploadError"
  }
}

/* ================================================================== */
/*  Limits  (change these via env vars in production if needed)       */
/* ================================================================== */

/** Maximum raw input file size in bytes (default: 20 MB) */
const MAX_FILE_BYTES = parseInt(process.env.UPLOAD_MAX_BYTES ?? "", 10) || 20 * 1024 * 1024

/** Maximum pixel dimension on either axis before processing (default: 8 000 px) */
const MAX_DIMENSION  = parseInt(process.env.UPLOAD_MAX_DIMENSION ?? "", 10) || 8_000

/** Output width cap — images wider than this are resized down */
const MAX_OUTPUT_WIDTH = 1_600

/** WebP quality (0–100) */
const WEBP_QUALITY = 80

/* ================================================================== */
/*  Allowed values                                                     */
/* ================================================================== */

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])

/**
 * Folder names must be lowercase alphanumeric + hyphens only.
 * This prevents path traversal via the folder parameter.
 * Valid: "products", "avatars", "banner-images"
 * Invalid: "../etc", "products/../../", "C:\\Windows"
 */
const VALID_FOLDER_RE = /^[a-z0-9][a-z0-9-]*$/

/* ================================================================== */
/*  Configuration                                                      */
/* ================================================================== */

export function getUploadRoot(): string {
  if (process.env.UPLOAD_DIR) return process.env.UPLOAD_DIR
  return path.join(process.cwd(), "public", "uploads")
}

const URL_PREFIX = "/uploads"

/* ================================================================== */
/*  Magic-byte MIME detection (first 12 bytes)                        */
/* ================================================================== */

function detectMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 4) return null

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg"

  // PNG:  89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png"

  // WebP: RIFF????WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf.length >= 12 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  )
    return "image/webp"

  return null
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeFromHeader: string } {
  const commaIdx = dataUrl.indexOf(",")
  if (commaIdx === -1) throw new ImageUploadError("Invalid data URL: no comma separator", 400, "INVALID_DATA_URL")

  const meta      = dataUrl.slice(0, commaIdx)
  const payload   = dataUrl.slice(commaIdx + 1)
  const isBase64  = meta.toLowerCase().includes(";base64")
  const buffer    = Buffer.from(payload, isBase64 ? "base64" : "utf8")
  const mimeMatch = meta.match(/data:([^;,]+)/)
  const mimeFromHeader = mimeMatch ? mimeMatch[1].toLowerCase() : ""

  return { buffer, mimeFromHeader }
}

function validateFolder(folder: string): void {
  if (!VALID_FOLDER_RE.test(folder)) {
    throw new ImageUploadError(
      `Invalid folder name "${folder}". ` +
      "Must be lowercase alphanumeric with optional hyphens (e.g. products, banner-images).",
      400,
      "INVALID_FOLDER"
    )
  }
}

/** Resolve a URL or absolute path to an absolute disk path, safely. */
function resolveUploadPath(urlOrAbsPath: string): string {
  if (path.isAbsolute(urlOrAbsPath)) return urlOrAbsPath

  // Strip the /uploads prefix to get the path segment inside UPLOAD_DIR
  const relative = urlOrAbsPath.startsWith(URL_PREFIX)
    ? urlOrAbsPath.slice(URL_PREFIX.length)
    : urlOrAbsPath

  // Resolve to absolute, then verify it stays inside the upload root
  const root     = path.resolve(getUploadRoot())
  const resolved = path.resolve(path.join(root, relative))

  // Path-traversal guard
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new ImageUploadError(
      "Invalid image path — path traversal attempt detected.",
      400,
      "PATH_TRAVERSAL"
    )
  }

  return resolved
}

/* ================================================================== */
/*  Implementation                                                     */
/* ================================================================== */

export class ImageUploadService implements IImageUploadService {

  async uploadBuffer(buffer: Buffer, folder = "general"): Promise<ImageUploadResult> {
    const context = `[ImageUploadService.uploadBuffer folder=${folder}]`

    /* 1. Validate folder name ──────────────────────────────────── */
    validateFolder(folder)

    /* 2. Enforce raw file size limit ───────────────────────────── */
    if (buffer.length > MAX_FILE_BYTES) {
      const mb = (buffer.length / 1024 / 1024).toFixed(1)
      const maxMb = (MAX_FILE_BYTES / 1024 / 1024).toFixed(0)
      throw new ImageUploadError(
        `File too large: ${mb} MB. Maximum allowed size is ${maxMb} MB.`,
        413,
        "FILE_TOO_LARGE"
      )
    }

    /* 3. Validate by magic bytes ───────────────────────────────── */
    const detectedMime = detectMimeFromBuffer(buffer)
    if (!detectedMime || !ALLOWED_MIME_TYPES.has(detectedMime)) {
      console.warn(`${context} Rejected — unsupported type: ${detectedMime ?? "unknown"}`)
      throw new ImageUploadError(
        `Unsupported image format: ${detectedMime ?? "unknown"}. Allowed: jpg, jpeg, png, webp.`,
        415,
        "UNSUPPORTED_TYPE"
      )
    }

    /* 4. Decode metadata & enforce dimension limits ─────────────── */
    let metadata: sharp.Metadata
    try {
      metadata = await sharp(buffer).metadata()
    } catch (err: any) {
      console.warn(`${context} sharp.metadata() failed:`, err?.message)
      throw new ImageUploadError(
        "Could not read image metadata — the file may be corrupt.",
        422,
        "CORRUPT_IMAGE"
      )
    }

    const { width = 0, height = 0 } = metadata
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      throw new ImageUploadError(
        `Image dimensions too large: ${width}×${height} px. ` +
        `Maximum allowed is ${MAX_DIMENSION}×${MAX_DIMENSION} px.`,
        422,
        "DIMENSIONS_TOO_LARGE"
      )
    }

    /* 5. Ensure output directory exists ────────────────────────── */
    const uploadDir = path.join(getUploadRoot(), folder)
    try {
      await fs.mkdir(uploadDir, { recursive: true })
    } catch (err: any) {
      console.error(`${context} Cannot create upload directory "${uploadDir}":`, err?.message)
      throw new ImageUploadError(
        "Storage is not available. Please contact support.",
        503,
        "STORAGE_UNAVAILABLE"
      )
    }

    /* 6. GUID filename ─────────────────────────────────────────── */
    const guid     = crypto.randomUUID()
    const fileName = `${guid}.webp`
    const filePath = path.join(uploadDir, fileName)

    /* 7. Resize + convert ──────────────────────────────────────── */
    let pipeline = sharp(buffer)
    if (width > MAX_OUTPUT_WIDTH) {
      pipeline = pipeline.resize({ width: MAX_OUTPUT_WIDTH, withoutEnlargement: true })
    }

    let processedBuffer: Buffer
    try {
      processedBuffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()
    } catch (err: any) {
      console.error(`${context} sharp processing failed:`, err?.message)
      throw new ImageUploadError(
        "Image processing failed. The file may be corrupt or unsupported.",
        422,
        "PROCESSING_FAILED"
      )
    }

    /* 8. Write to disk ─────────────────────────────────────────── */
    try {
      await fs.writeFile(filePath, processedBuffer)
    } catch (err: any) {
      console.error(
        `${context} Failed to write file "${filePath}":`, err?.message,
        "\n  → Verify UPLOAD_DIR is writable by the IIS app pool account."
      )
      throw new ImageUploadError(
        "Storage write failed. Please contact support.",
        503,
        "STORAGE_WRITE_FAILED"
      )
    }

    const result: ImageUploadResult = {
      url:      `${URL_PREFIX}/${folder}/${fileName}`,
      fileName,
      fileSize: processedBuffer.length,
    }

    console.log(
      `${context} ✅ Saved ${(processedBuffer.length / 1024).toFixed(1)} KB ` +
      `(original: ${(buffer.length / 1024).toFixed(1)} KB, ` +
      `dims: ${width}×${height} → WebP) → ${result.url}`
    )

    return result
  }

  /* ── uploadFromDataUrl ──────────────────────────────────────────── */
  async uploadFromDataUrl(dataUrl: string, folder = "general"): Promise<ImageUploadResult> {
    const { buffer, mimeFromHeader } = dataUrlToBuffer(dataUrl)

    // Pre-check the declared MIME type — reject before processing
    if (mimeFromHeader && !ALLOWED_MIME_TYPES.has(mimeFromHeader)) {
      throw new ImageUploadError(
        `Unsupported image type declared in data URL: ${mimeFromHeader}. Allowed: jpg, jpeg, png, webp.`,
        415,
        "UNSUPPORTED_TYPE"
      )
    }

    return this.uploadBuffer(buffer, folder)
  }

  /* ── deleteImage ────────────────────────────────────────────────── */
  async deleteImage(urlOrAbsPath: string): Promise<boolean> {
    let absPath: string
    try {
      absPath = resolveUploadPath(urlOrAbsPath)
    } catch (err: any) {
      // Path-traversal or invalid path — log and treat as a safe no-op
      console.warn("[ImageUploadService.deleteImage] Rejected path:", urlOrAbsPath, err?.message)
      return false
    }

    try {
      if (!existsSync(absPath)) return true   // Already gone — not an error
      await fs.unlink(absPath)
      console.log(`[ImageUploadService.deleteImage] Deleted: ${absPath}`)
      return true
    } catch (err: any) {
      console.error("[ImageUploadService.deleteImage] Failed to delete:", absPath, err?.message)
      return false
    }
  }

  /* ── updateImage ────────────────────────────────────────────────── */
  async updateImage(
    oldUrl:    string,
    newBuffer: Buffer,
    folder     = "general"
  ): Promise<ImageUploadResult> {
    // Upload first — if it fails, old image is still intact
    const result = await this.uploadBuffer(newBuffer, folder)

    // Only delete the old image after the new one is safely saved
    await this.deleteImage(oldUrl)

    return result
  }
}

/* ================================================================== */
/*  Singleton                                                          */
/* ================================================================== */

let _instance: ImageUploadService | null = null

export function getImageUploadService(): IImageUploadService {
  if (!_instance) _instance = new ImageUploadService()
  return _instance
}
