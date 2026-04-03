import * as XLSX from "xlsx"
import JSZip from "jszip"

export interface ParsedRow {
  rowIndex: number
  name: string
  price: number
  collection: string
  images: string
  category?: string
  description?: string
}

export interface ValidationError {
  row: number
  field: string
  message: string
}

export interface PreviewProduct {
  rowIndex: number
  name: string
  price: number
  collection: string
  category?: string
  description?: string
  status: "create" | "update"
  matchedImages: string[]
  errors: ValidationError[]
}

export interface UploadReport {
  created: number
  updated: number
  linkedImages: number
  errors: { row: number; reason: string }[]
  unmatchedImages?: string[]
}

/**
 * Parse Excel (.xlsx) or CSV (.csv) buffer into JSON rows
 */
export function parseDataFile(
  buffer: Buffer,
  filename: string
): { rows: Record<string, any>[]; errors: string[] } {
  const errors: string[] = []
  try {
    const isCSV = filename.toLowerCase().endsWith(".csv")
    const wb = XLSX.read(buffer, { type: "buffer" })
    const wsName = wb.SheetNames[0]
    if (!wsName) {
      return { rows: [], errors: ["No sheets found in the file"] }
    }
    const ws = wb.Sheets[wsName]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" })
    return { rows: rows as Record<string, any>[], errors }
  } catch (err: any) {
    return { rows: [], errors: [`Failed to parse file: ${err.message}`] }
  }
}

/**
 * Extract images from a ZIP buffer, returning map of lowercase filename → Buffer
 */
export async function extractZipImages(
  buffer: Buffer
): Promise<Map<string, Buffer>> {
  const imageMap = new Map<string, Buffer>()
  try {
    const zip = await JSZip.loadAsync(buffer)
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"]

    const entries = Object.entries(zip.files)
    for (const [path, file] of entries) {
      if (file.dir) continue
      const name = path.split("/").pop() || path
      
      // Ignore MacOS hidden files
      if (name.startsWith("._") || name.startsWith("__MACOSX")) continue;

      const ext = name.substring(name.lastIndexOf(".")).toLowerCase()
      if (imageExtensions.includes(ext)) {
        const data = await file.async("nodebuffer")
        console.log(`[ZIP Extract] Found image: ${name} -> saved as ${name.toLowerCase()}`)
        imageMap.set(name.toLowerCase(), data)
      }
    }
  } catch (err: any) {
    console.error("Failed to extract ZIP:", err.message)
  }
  return imageMap
}

/**
 * Normalize column headers to standard field names
 */
export function normalizeRow(raw: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {}
  for (const [key, value] of Object.entries(raw)) {
    const k = key.trim().toLowerCase().replace(/[\s_-]+/g, "_")
    normalized[k] = value
  }
  return normalized
}

/**
 * Extract a typed ParsedRow from a normalized row
 */
export function extractRow(
  normalized: Record<string, any>,
  rowIndex: number
): ParsedRow {
  // Extract number from price, like "150 EGP" -> 150
  const rawPrice = String(normalized.price ?? "0");
  const parsedPrice = parseFloat(rawPrice.replace(/[^0-9.]/g, "")) || 0;
  
  if (rawPrice !== "0") {
    console.log(`[Price Parse] Row ${rowIndex}: "${rawPrice}" -> ${parsedPrice}`);
  }

  return {
    rowIndex,
    name: String(normalized.name ?? normalized.product_name ?? "").trim(),
    price: parsedPrice,
    collection: String(normalized.collection ?? "").trim(),
    images: String(normalized.images ?? "").trim(),
    category: normalized.category ? String(normalized.category).trim() : undefined,
    description: normalized.description ? String(normalized.description).trim() : undefined,
  }
}

/**
 * Validate a single parsed row and return errors
 */
export function validateRow(row: ParsedRow): ValidationError[] {
  const errors: ValidationError[] = []

  if (!row.name) {
    errors.push({ row: row.rowIndex, field: "name", message: "Missing product name" })
  }
  if (!row.collection) {
    errors.push({ row: row.rowIndex, field: "collection", message: "Missing collection" })
  }
  if (!row.price || isNaN(row.price) || row.price <= 0) {
    errors.push({ row: row.rowIndex, field: "price", message: "Price must be a positive number" })
  }

  // Warning for missing images is handled in preview UI, not blocking

  return errors
}

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

/**
 * Match images for a product code from the ZIP image map.
 * Strategy:
 *  1. If `imagesColumn` is provided, try those filenames
 *  2. Fallback: match by product name (e.g., "Red Dress" -> "red-dress.jpg", "red-dress-1.jpg")
 */
export function matchImagesToProduct(
  name: string,
  imagesColumn: string,
  zipMap: Map<string, Buffer>
): string[] {
  const matched: string[] = []
  
  // Strategy 1: from images column
  if (imagesColumn) {
    const names = imagesColumn.split(",").map((n) => n.trim()).filter(Boolean)
    for (const imgName of names) {
      if (zipMap.has(imgName.toLowerCase())) {
        matched.push(imgName.toLowerCase())
      } else {
        console.log(`[Image Match] Row "${name}": requested explicit image "${imgName}" not found in ZIP!`)
      }
    }
    if (matched.length > 0) {
      console.log(`[Image Match] Row "${name}": matched ${matched.length} images via explicit column.`);
      return matched
    }
  }

  // Strategy 2: match by slugified name
  if (!name) return []
  
  const nameSlug = slugify(name)
  for (const [filename] of zipMap) {
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf("."))
    if (nameWithoutExt === nameSlug || nameWithoutExt.startsWith(nameSlug + "-") || nameWithoutExt.startsWith(nameSlug + "_")) {
      matched.push(filename)
    }
  }

  if (matched.length > 0) {
    console.log(`[Image Match] Row "${name}": automatically matched ${matched.length} images using slug "${nameSlug}".`);
  } else {
    console.log(`[Image Match] Row "${name}": NO matches found (searched explicit and fallback slug "${nameSlug}").`);
  }

  // Sort by name so ordering is deterministic
  matched.sort()
  return matched
}

/**
 * Generate a deterministic product ID from name + collection
 */
export function generateProductId(name: string, collection: string): string {
  return slugify(`${collection}-${name}`)
}

/**
 * Check for duplicate rows (same name + collection) within the parsed data
 */
export function findDuplicateRows(rows: ParsedRow[]): ValidationError[] {
  const errors: ValidationError[] = []
  const seen = new Map<string, number>()

  for (const row of rows) {
    if (!row.name || !row.collection) continue
    const key = `${slugify(row.name)}::${slugify(row.collection)}`
    const prevRow = seen.get(key)
    if (prevRow !== undefined) {
      errors.push({
        row: row.rowIndex,
        field: "name+collection",
        message: `Duplicate of row ${prevRow}: same name "${row.name}" + collection "${row.collection}"`,
      })
    } else {
      seen.set(key, row.rowIndex)
    }
  }

  return errors
}

/**
 * Convert an image buffer to a base64 data URL
 */
export function bufferToDataUrl(buffer: Buffer, filename: string): string {
  const ext = filename.substring(filename.lastIndexOf(".") + 1).toLowerCase()
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
  }
  const mime = mimeMap[ext] || "image/jpeg"
  return `data:${mime};base64,${buffer.toString("base64")}`
}
