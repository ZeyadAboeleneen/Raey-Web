/**
 * lib/cloudinary.ts — backward-compatibility shim
 *
 * Cloudinary has been removed. This file re-exports the local
 * image upload service under the same function names so that any
 * code still importing from here continues to work without changes.
 *
 * Prefer importing from @/lib/image-upload-service directly in new code.
 */

export {
  getImageUploadService,
  ImageUploadService,
} from "@/lib/image-upload-service"

import { getImageUploadService } from "@/lib/image-upload-service"

/**
 * @deprecated Use getImageUploadService().uploadBuffer() instead.
 */
export async function uploadBufferToCloudinary(
  buffer: Buffer,
  folder: string = "general",
  _publicId?: string
): Promise<string> {
  const result = await getImageUploadService().uploadBuffer(buffer, folder)
  return result.url
}

/**
 * @deprecated Use getImageUploadService().uploadFromDataUrl() instead.
 */
export async function uploadDataUrlToCloudinary(
  dataUrl: string,
  folder: string = "general",
  _publicId?: string
): Promise<string> {
  const result = await getImageUploadService().uploadFromDataUrl(dataUrl, folder)
  return result.url
}

/**
 * @deprecated Use getImageUploadService().deleteImage() instead.
 */
export async function deleteImageFromCloudinary(url: string): Promise<boolean> {
  return getImageUploadService().deleteImage(url)
}

/** No-op shim — configuration is no longer needed. */
export function configureCloudinary(): void {}

/** @deprecated Use Buffer.from(dataUrl.split(',')[1], 'base64') instead. */
export function dataUrlToBuffer(dataUrl: string): Buffer {
  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex === -1) throw new Error("Invalid data URL")
  const meta = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)
  const isBase64 = meta.toLowerCase().includes(";base64")
  return Buffer.from(payload, isBase64 ? "base64" : "utf8")
}
