/**
 * lib/ai/dress-resolver.ts
 *
 * Resolves a product id to the OFFICIAL RAEY gown image, server-side.
 *
 * Security note: the browser only ever sends `dressId`. It can never supply an
 * image URL, so this feature cannot be turned into an open image-fetch proxy
 * or used to make the server pull arbitrary hosts. Every byte the model sees
 * on the garment side comes from the ERP catalogue via `getProductServer`.
 */

import { getProductServer } from "@/lib/get-products-server"
import { loadProductImageBytes, usableProductImages } from "./product-image"
import { TRYON_ELIGIBLE_COLLECTIONS } from "./try-on-config"
import { isTryOnEligible } from "./try-on-eligibility"

export type DressResolveErrorCode =
  | "INVALID_ID"
  | "NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "NO_IMAGE"
  | "IMAGE_UNREACHABLE"

export class DressResolveError extends Error {
  constructor(message: string, public readonly code: DressResolveErrorCode) {
    super(message)
    this.name = "DressResolveError"
  }
}

export interface ResolvedDress {
  id: string
  name: string
  collection: string
  branch: string
  /** Public URL of the image the model was shown — safe to echo to the client. */
  imageUrl: string
  /** Raw bytes of that image. */
  imageBuffer: Buffer
  /** Canonical product page, for VIEW DRESS DETAILS. */
  productUrl: string
}

/**
 * Chooses the best catalogue image for the transformation.
 *
 * ERP items currently carry a single `PicPath`, so in practice this returns
 * the first usable entry. The selection is isolated here so that when
 * multi-angle product photography lands, "prefer the full-body front view"
 * becomes a change to this function alone.
 */
function pickBestDressImage(images: string[]): string | null {
  if (images.length === 0) return null

  const preferred = images.find((img) => /front|full|main|hero/i.test(img))
  return preferred ?? images[0]
}

/**
 * Resolves `dressId` to the official gown image and product metadata.
 * Throws `DressResolveError` — the API route maps the code to safe copy.
 */
export async function resolveDressForTryOn(
  dressId: string,
  branchSlug?: string | null
): Promise<ResolvedDress> {
  const id = String(dressId || "").trim()
  // ERP item ids are numeric; rejecting anything else keeps arbitrary strings
  // out of the lookup path.
  if (!/^\d+$/.test(id)) {
    throw new DressResolveError("Invalid dress id", "INVALID_ID")
  }

  const product = await getProductServer(id)
  if (!product || product.isActive === false) {
    throw new DressResolveError("Dress not found", "NOT_FOUND")
  }

  if (!isTryOnEligible(product.collection, TRYON_ELIGIBLE_COLLECTIONS)) {
    throw new DressResolveError("Dress is not eligible for try-on", "NOT_ELIGIBLE")
  }

  const imageUrl = pickBestDressImage(usableProductImages(product.images))
  if (!imageUrl) {
    throw new DressResolveError("Dress has no usable image", "NO_IMAGE")
  }

  const imageBuffer = await loadProductImageBytes(imageUrl)
  if (!imageBuffer) {
    throw new DressResolveError("Dress image could not be loaded", "IMAGE_UNREACHABLE")
  }

  const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://raeygroup.com").replace(/\/$/, "")
  const branch = branchSlug || product.branch || "wedding"

  return {
    id,
    name: product.name || `RAEY ${id}`,
    collection: product.collection || "wedding",
    branch,
    imageUrl,
    imageBuffer,
    productUrl: `${siteUrl}/products/${branch}/${id}`,
  }
}
