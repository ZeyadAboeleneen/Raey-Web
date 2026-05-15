import * as XLSX from "xlsx"

export interface ParsedRow {
  rowIndex: number
  name: string
  price: number
  collection: string
  images: string
  branch?: string
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
  branch?: string
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
  const rawPrice = String(normalized.price ?? "0");
  const parsedPrice = parseFloat(rawPrice.replace(/[^0-9.]/g, "")) || 0;

  return {
    rowIndex,
    name: String(normalized.name ?? normalized.product_name ?? "").trim(),
    price: parsedPrice,
    collection: String(normalized.collection ?? "").trim(),
    images: String(normalized.images ?? "").trim(),
    branch: normalized.branch ? String(normalized.branch).trim() : undefined,
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

  return errors
}

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

/**
 * Match image names for a product from a set of available image names.
 * Works with both ZIP filenames (preview) and URL map keys (confirm).
 *
 * Strategy:
 *  1. If `imagesColumn` is provided, try those filenames
 *  2. Fallback: match by slugified product name
 */
export function matchImageNamesToProduct(
  name: string,
  imagesColumn: string,
  availableNames: Set<string>
): string[] {
  const matched: string[] = []

  // Strategy 1: from images column
  if (imagesColumn) {
    const requestedNames = imagesColumn.split(",").map((n) => n.trim().toLowerCase()).filter(Boolean)
    for (const reqName of requestedNames) {
      if (availableNames.has(reqName)) {
        if (!matched.includes(reqName)) matched.push(reqName)
        continue
      }

      // Extension-agnostic match
      const queryBaseName = reqName.includes(".") ? reqName.substring(0, reqName.lastIndexOf(".")) : reqName
      for (const available of availableNames) {
        const availBaseName = available.includes(".") ? available.substring(0, available.lastIndexOf(".")) : available
        if (availBaseName === queryBaseName) {
          if (!matched.includes(available)) matched.push(available)
          break
        }
      }
    }

    if (matched.length > 0) {
      matched.sort()
      return matched
    }
  }

  // Strategy 2: match by slugified name
  if (!name) return []

  const nameSlug = slugify(name)
  for (const available of availableNames) {
    const nameWithoutExt = available.includes(".") ? available.substring(0, available.lastIndexOf(".")) : available
    if (nameWithoutExt === nameSlug || nameWithoutExt.startsWith(nameSlug + "-") || nameWithoutExt.startsWith(nameSlug + "_")) {
      matched.push(available)
    }
  }

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
