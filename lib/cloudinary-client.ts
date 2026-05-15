/**
 * cloudinary-client.ts
 *
 * Client-side direct-to-Cloudinary upload utilities.
 *
 * Architecture:
 *   Browser extracts ZIP → uploads each image directly to Cloudinary
 *   using signed uploads → server never touches image bytes.
 *
 * Features:
 *   - Chunked uploads for large files (>20MB)
 *   - Concurrency control (p-limit style, default 5)
 *   - Retry with exponential backoff (3 attempts)
 *   - AbortController support for cancellation
 *   - Streaming ZIP extraction (extract → upload → release reference)
 *   - Per-file and aggregate progress tracking
 */

import JSZip from "jszip";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface UploadResult {
  filename: string;
  url: string;
  publicId: string;
  success: boolean;
  error?: string;
  retries: number;
}

export interface UploadProgress {
  completed: number;
  total: number;
  currentFile: string;
  percentage: number;
  failures: number;
  retries: number;
}

export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  folder: string;
  publicId?: string;
  apiKey: string;
  cloudName: string;
}

export interface UploadOptions {
  /** Auth token for the signing endpoint */
  authToken: string;
  /** Cloudinary folder, default "products" */
  folder?: string;
  /** Max parallel uploads, default 5 */
  concurrency?: number;
  /** Max retries per file, default 3 */
  maxRetries?: number;
  /** Chunk size in bytes for chunked upload, default 20MB */
  chunkSize?: number;
  /** Called on each file completion */
  onProgress?: (progress: UploadProgress) => void;
  /** AbortController signal for cancellation */
  signal?: AbortSignal;
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif",
]);

const CHUNK_THRESHOLD = 20 * 1024 * 1024; // 20MB — files larger than this use chunked upload
const DEFAULT_CHUNK_SIZE = 6 * 1024 * 1024; // 6MB per chunk (Cloudinary minimum is 5MB)
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MAX_RETRIES = 3;

/* ================================================================== */
/*  Concurrency limiter (p-limit style, no external dependency)        */
/* ================================================================== */

function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (queue.length > 0 && active < concurrency) {
      active++;
      const resolve = queue.shift()!;
      resolve();
    }
  }

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for a slot
    if (active >= concurrency) {
      await new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    } else {
      active++;
    }

    try {
      return await fn();
    } finally {
      active--;
      next();
    }
  };
}

/* ================================================================== */
/*  Signing                                                            */
/* ================================================================== */

/**
 * Fetch a Cloudinary upload signature from our server-side signing endpoint.
 */
async function getSignature(
  authToken: string,
  folder: string,
  publicId?: string,
  signal?: AbortSignal
): Promise<CloudinarySignature> {
  const res = await fetch("/api/admin/cloudinary-sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ folder, publicId }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Signing failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

/* ================================================================== */
/*  Single file upload (standard or chunked)                           */
/* ================================================================== */

/**
 * Upload a single file directly to Cloudinary using a signed upload.
 * Automatically uses chunked upload for files > CHUNK_THRESHOLD.
 */
async function uploadSingleFile(
  file: File | Blob,
  filename: string,
  options: UploadOptions
): Promise<UploadResult> {
  const {
    authToken,
    folder = "products",
    maxRetries = DEFAULT_MAX_RETRIES,
    chunkSize = DEFAULT_CHUNK_SIZE,
    signal,
  } = options;

  let lastError = "";
  let retries = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      return { filename, url: "", publicId: "", success: false, error: "Cancelled", retries };
    }

    try {
      // Generate a unique public_id from the filename
      const baseName = filename
        .replace(/\.[^/.]+$/, "")     // strip extension
        .replace(/[^a-zA-Z0-9_-]/g, "-") // sanitize
        .slice(0, 60);
      const uniqueId = `${baseName}-${Date.now().toString(36)}`;

      // Get a fresh signature for this upload
      const sig = await getSignature(authToken, folder, uniqueId, signal);

      const uploadUrl = `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`;

      let result: any;

      if (file.size > CHUNK_THRESHOLD) {
        // ── Chunked upload for large files ──────────────────
        result = await chunkedUpload(file, uploadUrl, sig, uniqueId, chunkSize, signal);
      } else {
        // ── Standard upload for small files ─────────────────
        const formData = new FormData();
        formData.append("file", file, filename);
        formData.append("api_key", sig.apiKey);
        formData.append("timestamp", String(sig.timestamp));
        formData.append("signature", sig.signature);
        formData.append("folder", sig.folder);
        formData.append("public_id", uniqueId);
        formData.append("overwrite", "1");

        const res = await fetch(uploadUrl, {
          method: "POST",
          body: formData,
          signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Cloudinary upload failed (${res.status}): ${errText.slice(0, 200)}`);
        }

        result = await res.json();
      }

      return {
        filename,
        url: result.secure_url || result.url || "",
        publicId: result.public_id || uniqueId,
        success: true,
        retries,
      };
    } catch (err: any) {
      lastError = err?.message || "Unknown upload error";
      retries++;

      // Don't retry on abort
      if (signal?.aborted || err?.name === "AbortError") {
        return { filename, url: "", publicId: "", success: false, error: "Cancelled", retries };
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️ [Upload] Retry ${attempt + 1}/${maxRetries} for "${filename}" in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  return {
    filename,
    url: "",
    publicId: "",
    success: false,
    error: lastError,
    retries,
  };
}

/* ================================================================== */
/*  Chunked upload                                                     */
/* ================================================================== */

/**
 * Upload a large file in chunks to Cloudinary.
 * Uses the X-Unique-Upload-Id header for Cloudinary to reassemble.
 */
async function chunkedUpload(
  file: File | Blob,
  uploadUrl: string,
  sig: CloudinarySignature,
  publicId: string,
  chunkSize: number,
  signal?: AbortSignal
): Promise<any> {
  const totalSize = file.size;
  const uploadId = `uqid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let offset = 0;
  let result: any = null;

  while (offset < totalSize) {
    if (signal?.aborted) throw new Error("Cancelled");

    const end = Math.min(offset + chunkSize, totalSize);
    const chunk = file.slice(offset, end);
    const isLast = end === totalSize;

    const formData = new FormData();
    formData.append("file", chunk, `chunk`);
    formData.append("api_key", sig.apiKey);
    formData.append("timestamp", String(sig.timestamp));
    formData.append("signature", sig.signature);
    formData.append("folder", sig.folder);
    formData.append("public_id", publicId);
    formData.append("overwrite", "1");

    const res = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
      headers: {
        "X-Unique-Upload-Id": uploadId,
        "Content-Range": `bytes ${offset}-${end - 1}/${totalSize}`,
      },
      signal,
    });

    if (!res.ok && !isLast) {
      // Non-last chunks return 200 on success
      const errText = await res.text();
      throw new Error(`Chunked upload failed at offset ${offset}: ${errText.slice(0, 200)}`);
    }

    if (isLast) {
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Final chunk failed: ${errText.slice(0, 200)}`);
      }
      result = await res.json();
    }

    offset = end;
  }

  return result;
}

/* ================================================================== */
/*  ZIP extraction + upload pipeline                                   */
/* ================================================================== */

/**
 * Extract images from a ZIP file and upload each directly to Cloudinary.
 *
 * MEMORY PATTERN: extract → upload → release reference
 * Each image buffer is released after upload to prevent memory spikes.
 */
export async function extractAndUploadZip(
  zipFile: File,
  options: UploadOptions
): Promise<UploadResult[]> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    onProgress,
    signal,
  } = options;

  /* ── extract file list from ZIP ──────────────────────────── */
  const zipBuffer = await zipFile.arrayBuffer();
  if (signal?.aborted) return [];

  const zip = await JSZip.loadAsync(zipBuffer);
  if (signal?.aborted) return [];

  // Collect image file paths (filter out directories, macOS junk, non-images)
  const imageFiles: string[] = [];
  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    const name = relativePath.split("/").pop() || relativePath;
    if (name.startsWith("._") || name.startsWith("__MACOSX")) return;

    const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) {
      imageFiles.push(relativePath);
    }
  });

  if (imageFiles.length === 0) {
    return [];
  }

  /* ── upload with concurrency control ─────────────────────── */
  const limit = createLimiter(concurrency);
  const results: UploadResult[] = [];
  let completed = 0;
  let failures = 0;
  let totalRetries = 0;

  const promises = imageFiles.map((filePath) =>
    limit(async () => {
      if (signal?.aborted) {
        return { filename: filePath.split("/").pop()!, url: "", publicId: "", success: false, error: "Cancelled", retries: 0 };
      }

      const name = filePath.split("/").pop()!;

      // Report current file
      onProgress?.({
        completed,
        total: imageFiles.length,
        currentFile: name,
        percentage: Math.round((completed / imageFiles.length) * 100),
        failures,
        retries: totalRetries,
      });

      // ── extract single image (memory-efficient: only one at a time per slot) ──
      const zipEntry = zip.file(filePath);
      if (!zipEntry) {
        const r: UploadResult = { filename: name, url: "", publicId: "", success: false, error: "File not found in ZIP", retries: 0 };
        failures++;
        completed++;
        results.push(r);
        return r;
      }

      const blob = await zipEntry.async("blob");
      const file = new File([blob], name, { type: getMimeType(name) });

      // ── upload ──
      const result = await uploadSingleFile(file, name, options);

      // ── track stats ──
      completed++;
      totalRetries += result.retries;
      if (!result.success) failures++;

      onProgress?.({
        completed,
        total: imageFiles.length,
        currentFile: name,
        percentage: Math.round((completed / imageFiles.length) * 100),
        failures,
        retries: totalRetries,
      });

      results.push(result);
      return result;

      // Blob/file references are released here when they go out of scope
    })
  );

  await Promise.all(promises);

  return results;
}

/* ================================================================== */
/*  Upload a list of File objects directly (for non-ZIP use)           */
/* ================================================================== */

export async function uploadFiles(
  files: File[],
  options: UploadOptions
): Promise<UploadResult[]> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    onProgress,
    signal,
  } = options;

  const limit = createLimiter(concurrency);
  const results: UploadResult[] = [];
  let completed = 0;
  let failures = 0;
  let totalRetries = 0;

  const promises = files.map((file) =>
    limit(async () => {
      if (signal?.aborted) {
        return { filename: file.name, url: "", publicId: "", success: false, error: "Cancelled", retries: 0 };
      }

      onProgress?.({
        completed,
        total: files.length,
        currentFile: file.name,
        percentage: Math.round((completed / files.length) * 100),
        failures,
        retries: totalRetries,
      });

      const result = await uploadSingleFile(file, file.name, options);

      completed++;
      totalRetries += result.retries;
      if (!result.success) failures++;

      onProgress?.({
        completed,
        total: files.length,
        currentFile: file.name,
        percentage: Math.round((completed / files.length) * 100),
        failures,
        retries: totalRetries,
      });

      results.push(result);
      return result;
    })
  );

  await Promise.all(promises);
  return results;
}

/* ================================================================== */
/*  Safe fetch helper (checks content-type before JSON parse)          */
/* ================================================================== */

/**
 * Fetch wrapper that handles IIS HTML error pages gracefully.
 * Returns { data, error } instead of throwing.
 */
export async function safeFetch<T = any>(
  url: string,
  init: RequestInit
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const res = await fetch(url, init);
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await res.json();
      if (!res.ok) {
        return {
          data: null,
          error: data.error || `Server error (${res.status})`,
          status: res.status,
        };
      }
      return { data, error: null, status: res.status };
    }

    // Non-JSON response (IIS HTML error page, 413, 502, etc.)
    const text = await res.text();
    const preview = text.slice(0, 200).replace(/<[^>]*>/g, " ").trim();
    return {
      data: null,
      error: `Server error (${res.status}): ${preview}`,
      status: res.status,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { data: null, error: "Request cancelled", status: 0 };
    }
    return { data: null, error: err?.message || "Network error", status: 0 };
  }
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function getMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf(".") + 1).toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
  };
  return mimeMap[ext] || "image/jpeg";
}

/**
 * Extract image file info from a ZIP without extracting the actual data.
 * Used for client-side preview (no upload needed).
 */
export async function getZipImageList(
  zipFile: File
): Promise<{ name: string; size: number }[]> {
  const zipBuffer = await zipFile.arrayBuffer();
  const zip = await JSZip.loadAsync(zipBuffer);
  const images: { name: string; size: number }[] = [];

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    const name = relativePath.split("/").pop() || relativePath;
    if (name.startsWith("._") || name.startsWith("__MACOSX")) return;

    const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) {
      images.push({
        name: name.toLowerCase(),
        size: zipEntry._data?.uncompressedSize || 0,
      });
    }
  });

  return images;
}
