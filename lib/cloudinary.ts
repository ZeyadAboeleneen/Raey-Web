import { v2 as cloudinary } from "cloudinary"

/**
 * Configure Cloudinary using environment variables.
 * Throws an error if any required variables are missing.
 */
export function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary environment variables missing (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)")
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  })
}

/**
 * Convert a base64 Data URL to a Buffer.
 */
export function dataUrlToBuffer(dataUrl: string): Buffer {
  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex === -1) throw new Error("Invalid data URL")
  const meta = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)
  const isBase64 = meta.toLowerCase().includes(";base64")
  return Buffer.from(payload, isBase64 ? "base64" : "utf8")
}

/**
 * Upload a Buffer to Cloudinary.
 * 
 * @param buffer The image buffer to upload
 * @param folder The folder in Cloudinary to store the image
 * @param publicId Optional public_id for the image
 * @returns The secure URL of the uploaded image
 */
export async function uploadBufferToCloudinary(
  buffer: Buffer, 
  folder: string = "general", 
  publicId?: string
): Promise<string> {
  configureCloudinary()
  
  return await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        overwrite: true,
        resource_type: "image",
      },
      (err, result) => {
        if (err) return reject(err)
        const url = (result as any)?.secure_url
        if (!url) return reject(new Error("Cloudinary returned no secure_url"))
        resolve(url)
      }
    )

    stream.end(buffer)
  })
}

/**
 * Upload a base64 Data URL to Cloudinary.
 * 
 * @param dataUrl The base64 data URL to upload
 * @param folder The folder in Cloudinary to store the image
 * @param publicId Optional public_id for the image
 * @returns The secure URL of the uploaded image
 */
export async function uploadDataUrlToCloudinary(
  dataUrl: string,
  folder: string = "general",
  publicId?: string
): Promise<string> {
  const buffer = dataUrlToBuffer(dataUrl)
  return uploadBufferToCloudinary(buffer, folder, publicId)
}
