/**
 * lib/cloudinary-client.ts — local upload replacement
 *
 * Previously uploaded images directly to Cloudinary from the browser.
 * Now sends each image to  POST /api/admin/upload-file  on our server.
 *
 * Public API is identical to the old cloudinary-client.ts so all
 * callers (bulk-upload page, etc.) work without any import changes.
 *
 * Features retained:
 *   - Concurrency control (default 5 parallel uploads)
 *   - Retry with exponential backoff (3 attempts)
 *   - AbortController support for cancellation
 *   - ZIP extraction pipeline
 *   - Per-file and aggregate progress tracking
 */

import JSZip from "jszip"

/* ================================================================== */
/*  Types  (same shape as before — callers depend on these)           */
/* ================================================================== */

export interface UploadResult {
  filename: string
  /** Relative URL returned by the server, e.g. /uploads/products/abc.webp */
  url: string
  /** Same as filename — kept for backward compatibility with bulk route */
  publicId: string
  success: boolean
  error?: string
  retries: number
}

export interface UploadProgress {
  completed: number
  total: number
  currentFile: string
  percentage: number
  failures: number
  retries: number
}

export interface UploadOptions {
  /** Auth token sent as Bearer in the Authorization header */
  authToken: string
  /** Sub-folder on the server, default "products" */
  folder?: string
  /** Max parallel uploads, default 5 */
  concurrency?: number
  /** Max retries per file, default 3 */
  maxRetries?: number
  /** Called after each file completes */
  onProgress?: (progress: UploadProgress) => void
  /** AbortController signal for cancellation */
  signal?: AbortSignal
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"])
const DEFAULT_CONCURRENCY = 5
const DEFAULT_MAX_RETRIES = 3

/* ================================================================== */
/*  Concurrency limiter (no external dependency)                       */
/* ================================================================== */

function createLimiter(concurrency: number) {
  let active = 0
  const queue: Array<() => void> = []

  function next() {
    if (queue.length > 0 && active < concurrency) {
      active++
      queue.shift()!()
    }
  }

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve))
    } else {
      active++
    }
    try {
      return await fn()
    } finally {
      active--
      next()
    }
  }
}

/* ================================================================== */
/*  Core upload — sends one file to our server                        */
/* ================================================================== */

async function uploadSingleFile(
  file: File | Blob,
  filename: string,
  options: UploadOptions
): Promise<UploadResult> {
  const {
    authToken,
    folder = "products",
    maxRetries = DEFAULT_MAX_RETRIES,
    signal,
  } = options

  let lastError = ""
  let retries = 0

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      return { filename, url: "", publicId: filename, success: false, error: "Cancelled", retries }
    }

    try {
      const formData = new FormData()
      formData.append("file", file, filename)
      formData.append("folder", folder)

      const res = await fetch("/api/admin/upload-file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
        signal,
      })

      if (!res.ok) {
        let errMsg = `Server error (${res.status})`
        try {
          const data = await res.json()
          errMsg = data?.error || errMsg
        } catch {}
        throw new Error(errMsg)
      }

      const data = await res.json()
      const url: string = data?.url || ""

      return {
        filename,
        url,
        publicId: filename, // kept for backward compat with bulk route imageUrlMap keys
        success: true,
        retries,
      }
    } catch (err: any) {
      lastError = err?.message || "Unknown upload error"
      retries++

      if (signal?.aborted || err?.name === "AbortError") {
        return { filename, url: "", publicId: filename, success: false, error: "Cancelled", retries }
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000
        console.warn(`⚠️ [Upload] Retry ${attempt + 1}/${maxRetries} for "${filename}" in ${delay}ms`)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  return { filename, url: "", publicId: filename, success: false, error: lastError, retries }
}

/* ================================================================== */
/*  ZIP extraction + upload pipeline                                   */
/* ================================================================== */

/**
 * Extract images from a ZIP file and upload each to the server.
 * Same signature as the old Cloudinary version.
 */
export async function extractAndUploadZip(
  zipFile: File,
  options: UploadOptions
): Promise<UploadResult[]> {
  const { concurrency = DEFAULT_CONCURRENCY, onProgress, signal } = options

  const zipBuffer = await zipFile.arrayBuffer()
  if (signal?.aborted) return []

  const zip = await JSZip.loadAsync(zipBuffer)
  if (signal?.aborted) return []

  const imageFiles: string[] = []
  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return
    const name = relativePath.split("/").pop() || relativePath
    if (name.startsWith("._") || name.startsWith("__MACOSX")) return
    const ext = name.substring(name.lastIndexOf(".")).toLowerCase()
    if (IMAGE_EXTENSIONS.has(ext)) imageFiles.push(relativePath)
  })

  if (imageFiles.length === 0) return []

  const limit = createLimiter(concurrency)
  const results: UploadResult[] = []
  let completed = 0
  let failures = 0
  let totalRetries = 0

  const promises = imageFiles.map((filePath) =>
    limit(async () => {
      if (signal?.aborted) {
        return {
          filename: filePath.split("/").pop()!,
          url: "", publicId: "", success: false, error: "Cancelled", retries: 0,
        }
      }

      const name = filePath.split("/").pop()!

      onProgress?.({
        completed, total: imageFiles.length, currentFile: name,
        percentage: Math.round((completed / imageFiles.length) * 100),
        failures, retries: totalRetries,
      })

      const zipEntry = zip.file(filePath)
      if (!zipEntry) {
        const r: UploadResult = {
          filename: name, url: "", publicId: name, success: false,
          error: "File not found in ZIP", retries: 0,
        }
        failures++; completed++; results.push(r); return r
      }

      const blob = await zipEntry.async("blob")
      const file = new File([blob], name, { type: getMimeType(name) })
      const result = await uploadSingleFile(file, name, options)

      completed++
      totalRetries += result.retries
      if (!result.success) failures++

      onProgress?.({
        completed, total: imageFiles.length, currentFile: name,
        percentage: Math.round((completed / imageFiles.length) * 100),
        failures, retries: totalRetries,
      })

      results.push(result)
      return result
    })
  )

  await Promise.all(promises)
  return results
}

/* ================================================================== */
/*  Upload a list of File objects (non-ZIP use)                        */
/* ================================================================== */

export async function uploadFiles(
  files: File[],
  options: UploadOptions
): Promise<UploadResult[]> {
  const { concurrency = DEFAULT_CONCURRENCY, onProgress, signal } = options

  const limit = createLimiter(concurrency)
  const results: UploadResult[] = []
  let completed = 0
  let failures = 0
  let totalRetries = 0

  const promises = files.map((file) =>
    limit(async () => {
      if (signal?.aborted) {
        return {
          filename: file.name, url: "", publicId: file.name, success: false, error: "Cancelled", retries: 0,
        }
      }

      onProgress?.({
        completed, total: files.length, currentFile: file.name,
        percentage: Math.round((completed / files.length) * 100),
        failures, retries: totalRetries,
      })

      const result = await uploadSingleFile(file, file.name, options)
      completed++
      totalRetries += result.retries
      if (!result.success) failures++

      onProgress?.({
        completed, total: files.length, currentFile: file.name,
        percentage: Math.round((completed / files.length) * 100),
        failures, retries: totalRetries,
      })

      results.push(result)
      return result
    })
  )

  await Promise.all(promises)
  return results
}

/* ================================================================== */
/*  Safe fetch helper  (unchanged from original)                       */
/* ================================================================== */

export async function safeFetch<T = any>(
  url: string,
  init: RequestInit
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const res = await fetch(url, init)
    const contentType = res.headers.get("content-type") || ""

    if (contentType.includes("application/json")) {
      const data = await res.json()
      if (!res.ok) {
        return { data: null, error: data.error || `Server error (${res.status})`, status: res.status }
      }
      return { data, error: null, status: res.status }
    }

    const text = await res.text()
    const preview = text.slice(0, 200).replace(/<[^>]*>/g, " ").trim()
    return { data: null, error: `Server error (${res.status}): ${preview}`, status: res.status }
  } catch (err: any) {
    if (err?.name === "AbortError") return { data: null, error: "Request cancelled", status: 0 }
    return { data: null, error: err?.message || "Network error", status: 0 }
  }
}

/* ================================================================== */
/*  Preview ZIP contents without uploading  (unchanged)               */
/* ================================================================== */

export async function getZipImageList(
  zipFile: File
): Promise<{ name: string; size: number }[]> {
  const zipBuffer = await zipFile.arrayBuffer()
  const zip = await JSZip.loadAsync(zipBuffer)
  const images: { name: string; size: number }[] = []

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return
    const name = relativePath.split("/").pop() || relativePath
    if (name.startsWith("._") || name.startsWith("__MACOSX")) return
    const ext = name.substring(name.lastIndexOf(".")).toLowerCase()
    if (IMAGE_EXTENSIONS.has(ext)) {
      images.push({ name: name.toLowerCase(), size: (zipEntry as any)._data?.uncompressedSize || 0 })
    }
  })

  return images
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function getMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf(".") + 1).toLowerCase()
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png", gif: "image/gif",
    webp: "image/webp", avif: "image/avif",
  }
  return map[ext] || "image/jpeg"
}
