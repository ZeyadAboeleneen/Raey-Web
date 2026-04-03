import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { v2 as cloudinary } from "cloudinary"
import { prisma } from "@/lib/prisma"
import {
  parseDataFile,
  extractZipImages,
  normalizeRow,
  extractRow,
  validateRow,
  matchImagesToProduct,
  generateProductId,
  findDuplicateRows,
  bufferToDataUrl,
  slugify,
  type ParsedRow,
  type PreviewProduct,
  type ValidationError,
  type UploadReport,
} from "./bulk-upload-helpers"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes for large uploads

// ------------------------------------------------------------------
// Cloudinary helpers (same pattern as /api/admin/upload-image)
// ------------------------------------------------------------------
function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary env vars missing")
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret })
}

async function uploadBufferToCloudinary(buffer: Buffer, publicId?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "products", public_id: publicId, overwrite: true, resource_type: "image" },
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

// ------------------------------------------------------------------
// Auth helper
// ------------------------------------------------------------------
function authenticateAdmin(request: NextRequest): { error?: NextResponse; decoded?: any } {
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: NextResponse.json({ error: "Authorization required" }, { status: 401 }) }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    if (decoded.role !== "admin") {
      return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
    }
    return { decoded }
  } catch {
    return { error: NextResponse.json({ error: "Invalid token" }, { status: 401 }) }
  }
}

// ------------------------------------------------------------------
// POST handler — multipart form data
// ------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const auth = authenticateAdmin(request)
    if (auth.error) return auth.error

    // Parse multipart form data
    const formData = await request.formData()
    const mode = (formData.get("mode") as string) || "preview"
    const dataFile = formData.get("dataFile") as File | null
    const imagesFile = formData.get("imagesFile") as File | null

    if (!dataFile) {
      return NextResponse.json({ error: "Data file (Excel/CSV) is required" }, { status: 400 })
    }

    // Read data file
    const dataBuffer = Buffer.from(await dataFile.arrayBuffer())
    const { rows: rawRows, errors: parseErrors } = parseDataFile(dataBuffer, dataFile.name)

    if (parseErrors.length > 0) {
      return NextResponse.json({ error: "Failed to parse data file", details: parseErrors }, { status: 400 })
    }

    if (rawRows.length === 0) {
      return NextResponse.json({ error: "Data file is empty — no rows found" }, { status: 400 })
    }

    // Extract ZIP images if provided
    let zipMap = new Map<string, Buffer>()
    if (imagesFile) {
      const zipBuffer = Buffer.from(await imagesFile.arrayBuffer())
      zipMap = await extractZipImages(zipBuffer)
    }

    // Normalize and parse rows
    const parsedRows: ParsedRow[] = rawRows.map((raw, i) => {
      const normalized = normalizeRow(raw)
      return extractRow(normalized, i + 2) // +2 because row 1 is header
    })

    // Validate each row
    const allErrors: ValidationError[] = []
    for (const row of parsedRows) {
      allErrors.push(...validateRow(row))
    }

    // Check for duplicate rows
    allErrors.push(...findDuplicateRows(parsedRows))

    // Look up existing products in DB for upsert status
    const nameCollectionPairs = parsedRows
      .filter((r) => r.name && r.collection)
      .map((r) => ({ name: r.name, collection: r.collection }))

    const existingProducts = await prisma.product.findMany({
      where: {
        OR: nameCollectionPairs.map(({ name, collection }) => ({
          name: name,
          collection: collection,
        })),
      },
      select: { productId: true, name: true, collection: true },
    })

    const existingSet = new Set(
      existingProducts.map((p) => `${slugify(p.name || "")}::${slugify(p.collection || "")}`)
    )

    // Build preview data
    const matchedImagesAll = new Set<string>()
    const previewProducts: PreviewProduct[] = parsedRows.map((row) => {
      const key = `${slugify(row.name)}::${slugify(row.collection)}`
      const status = existingSet.has(key) ? "update" : "create"
      const rowErrors = allErrors.filter((e) => e.row === row.rowIndex)
      const matchedImages = matchImagesToProduct(row.name, row.images, zipMap)
      
      matchedImages.forEach((img) => matchedImagesAll.add(img.toLowerCase()))

      return {
        rowIndex: row.rowIndex,
        name: row.name,
        price: row.price,
        collection: row.collection,
        category: row.category,
        description: row.description,
        status,
        matchedImages,
        errors: rowErrors,
      }
    })

    // Compute unmatched images
    const unmatchedImages: string[] = []
    if (imagesFile) {
      for (const imgName of zipMap.keys()) {
        if (!matchedImagesAll.has(imgName.toLowerCase())) {
          unmatchedImages.push(imgName)
        }
      }
    }

    // ======================== PREVIEW MODE ========================
    if (mode === "preview") {
      const summary = {
        totalRows: previewProducts.length,
        toCreate: previewProducts.filter((p) => p.status === "create").length,
        toUpdate: previewProducts.filter((p) => p.status === "update").length,
        withErrors: previewProducts.filter((p) => p.errors.length > 0).length,
        totalImages: zipMap.size,
        linkedImages: previewProducts.reduce((sum, p) => sum + p.matchedImages.length, 0),
        unmatchedImages,
      }

      return NextResponse.json({
        mode: "preview",
        summary,
        products: previewProducts,
        allErrors: allErrors,
      })
    }

    // ======================== CONFIRM MODE ========================
    if (mode === "confirm") {
      // Only process rows without errors
      const validProducts = previewProducts.filter((p) => p.errors.length === 0)
      const report: UploadReport = { created: 0, updated: 0, linkedImages: 0, errors: [], unmatchedImages }

      configureCloudinary()

      // Process in batches of 10
      const BATCH_SIZE = 10
      for (let i = 0; i < validProducts.length; i += BATCH_SIZE) {
        const batch = validProducts.slice(i, i + BATCH_SIZE)

        const batchPromises = batch.map(async (product) => {
          try {
            // Upload matched images to Cloudinary
            const imageUrls: string[] = []
            for (const imgName of product.matchedImages) {
              const imgBuffer = zipMap.get(imgName)
              if (imgBuffer) {
                try {
                  const publicId = `${slugify(product.collection)}-${slugify(product.name)}-${imageUrls.length}`
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-")
                  const url = await uploadBufferToCloudinary(imgBuffer, publicId)
                  imageUrls.push(url)
                  report.linkedImages++
                } catch (imgErr: any) {
                  console.error(`Failed to upload image ${imgName}:`, imgErr.message)
                }
              }
            }

            const productId = generateProductId(product.name, product.collection)
            const key = `${slugify(product.name)}::${slugify(product.collection)}`
            const isUpdate = existingSet.has(key)

            // Find existing product ID if updating
            let existingId: string | undefined
            if (isUpdate) {
              const existing = existingProducts.find(
                (p) =>
                  slugify(p.name || "") === slugify(product.name) &&
                  slugify(p.collection || "") === slugify(product.collection)
              )
              existingId = existing?.productId
            }

            const data: any = {
              name: product.name,
              price: product.price,
              collection: product.collection,
              category: product.category || null,
              description: product.description || null,
              isActive: true,
            }

            if (imageUrls.length > 0) {
              data.images = imageUrls
              data.imageUrl = imageUrls[0]
            }

            if (isUpdate && existingId) {
              await prisma.product.update({
                where: { productId: existingId },
                data,
              })
              report.updated++
            } else {
              await prisma.product.create({
                data: {
                  productId,
                  ...data,
                  images: imageUrls.length > 0 ? imageUrls : ["/placeholder.svg"],
                  rating: 0,
                  reviewCount: 0,
                  notes: { top: [], middle: [], base: [] },
                },
              })
              report.created++
            }
          } catch (err: any) {
            report.errors.push({
              row: product.rowIndex,
              reason: err.message || "Unknown error",
            })
          }
        })

        await Promise.all(batchPromises)
      }

      // Add skipped rows (with validation errors) to report
      const skippedProducts = previewProducts.filter((p) => p.errors.length > 0)
      for (const skipped of skippedProducts) {
        report.errors.push({
          row: skipped.rowIndex,
          reason: skipped.errors.map((e) => `${e.field}: ${e.message}`).join("; "),
        })
      }

      return NextResponse.json({
        mode: "confirm",
        success: true,
        report,
        message: `Bulk upload complete: ${report.created} created, ${report.updated} updated, ${report.linkedImages} images linked, ${report.errors.length} errors`,
      })
    }

    return NextResponse.json({ error: 'Invalid mode. Use "preview" or "confirm"' }, { status: 400 })
  } catch (error: any) {
    console.error("❌ [API] Error in POST /api/products/bulk:", error)
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}
