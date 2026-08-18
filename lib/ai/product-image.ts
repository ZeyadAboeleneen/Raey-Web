/**
 * lib/ai/product-image.ts
 *
 * Loads official catalogue image bytes, server-side.
 *
 * Catalogue images are stored as site-relative `/uploads/products/<guid>.webp`
 * paths, which are read straight off the upload volume rather than round-
 * tripping through our own HTTP server. Remote URLs (legacy Cloudinary rows)
 * still fetch normally.
 *
 * Shared by the try-on dress resolver and the stylist's vision tagger so the
 * path-traversal guard lives in exactly one place.
 */

import path from "path"
import fs from "fs/promises"

/** Mirrors the guard in `app/uploads/[...path]/route.ts`. */
async function readLocalUpload(relativePath: string): Promise<Buffer | null> {
  const root = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads"))
  const withoutPrefix = relativePath.replace(/^\/uploads\/?/, "")
  const resolved = path.resolve(path.join(root, withoutPrefix))

  if (!resolved.startsWith(root + path.sep)) return null

  try {
    return await fs.readFile(resolved)
  } catch {
    return null
  }
}

/** Returns the image bytes, or null when the asset cannot be reached. */
export async function loadProductImageBytes(imageUrl: string): Promise<Buffer | null> {
  if (!imageUrl) return null

  if (imageUrl.startsWith("/uploads/")) {
    const local = await readLocalUpload(imageUrl)
    if (local) return local
  }

  const absolute = imageUrl.startsWith("http")
    ? imageUrl
    : `${(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "")}${
        imageUrl.startsWith("/") ? "" : "/"
      }${imageUrl}`

  try {
    const response = await fetch(absolute, { cache: "no-store" })
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer.length > 0 ? buffer : null
  } catch {
    return null
  }
}

/** Drops placeholders and non-fetchable values from a catalogue image list. */
export function usableProductImages(images: unknown): string[] {
  if (!Array.isArray(images)) return []
  return images.filter(
    (img): img is string =>
      typeof img === "string" &&
      img.length > 0 &&
      img !== "/placeholder.svg" &&
      !img.startsWith("data:") &&
      !img.startsWith("blob:")
  )
}
