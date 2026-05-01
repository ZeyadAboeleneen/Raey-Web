import { type NextRequest, NextResponse } from "next/server";
import { getMssqlPool, sql } from "@/lib/mssql";
import { v2 as cloudinary } from "cloudinary";
import { mapCollectionToLineId } from "@/lib/erp-mappings";
import { clearErpProductCaches, isAdminRequest } from "@/lib/erp-items";
import {
  parseDataFile,
  extractZipImages,
  normalizeRow,
  extractRow,
  validateRow,
  matchImagesToProduct,
  generateProductId,
  findDuplicateRows,
  type ParsedRow,
  type ValidationError,
  type PreviewProduct,
  type UploadReport,
} from "./bulk-upload-helpers";

export const runtime = "nodejs";
export const maxDuration = 120;

/* ─── branch code / slug → MSSQL Stores.ID ─────────────────────────── */
const STORE_MAP: Record<string, number> = {
  E: 6,
  M: 8,
  D: 13,
  R: 14,
  "15": 16,
  "el-raey-1": 6,
  "mona-saleh": 8,
  "el-raey-2": 13,
  "el-raey-the-yard": 14,
  "sell-dresses": 16,
};

function resolveStoreId(branch: string | undefined | null): number | null {
  if (!branch) return null;
  const key = branch.trim();
  return STORE_MAP[key] ?? STORE_MAP[key.toUpperCase()] ?? STORE_MAP[key.toLowerCase()] ?? null;
}

/* ─── helpers ───────────────────────────────────────────────────────── */
const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message, timestamp: new Date().toISOString() }, { status });

function generateItemCode(name: string): string {
  const baseCode = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `${baseCode || "ITEM"}-${Date.now().toString().slice(-6)}`;
}

/* ─── Cloudinary helpers ────────────────────────────────────────────── */
function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary env vars missing (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

async function uploadBufferToCloudinary(buffer: Buffer, publicId?: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "products",
        public_id: publicId,
        overwrite: true,
        resource_type: "image",
      },
      (err, result) => {
        if (err) return reject(err);
        const url = (result as any)?.secure_url;
        if (!url) return reject(new Error("Cloudinary returned no secure_url"));
        resolve(url);
      }
    );
    stream.end(buffer);
  });
}

/**
 * Normalize an image filename to a product-matchable base name.
 * "E8000.jpg" → "E8000"
 * "Dress-Red_v2.png" → "Dress Red v2"
 */
function normalizeImageName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, "")   // strip extension
    .replace(/[-_]+/g, " ")     // dashes/underscores → spaces
    .trim();
}

/* ================================================================== */
/*  POST handler — supports FormData, JSON, and image-only modes      */
/* ================================================================== */
export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminRequest(request, "canAddProducts"))) {
      return errorResponse(403, "Admin access required or insufficient permissions");
    }

    const contentType = request.headers.get("content-type") || "";

    /* PATH A — JSON payload (dashboard quick-upload) */
    if (contentType.includes("application/json")) {
      return await handleJsonUpload(request);
    }

    /* PATH B / C — FormData payload */
    return await handleFormDataUpload(request);
  } catch (err: any) {
    console.error("❌ [Bulk] Unhandled error:", err?.message || err);
    return errorResponse(500, "Internal server error during bulk upload");
  }
}

/* ================================================================== */
/*  PATH A — Dashboard quick JSON upload                              */
/* ================================================================== */
async function handleJsonUpload(request: NextRequest) {
  const body = await request.json();
  const products: any[] = body.products;

  if (!Array.isArray(products) || products.length === 0) {
    return errorResponse(400, "No products provided");
  }

  const pool = await getMssqlPool();
  let created = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const name = String(p.name || "").trim();
    const price =
      Number(p.price ?? p.sizes?.[0]?.originalPrice ?? p.sizes?.[0]?.discountedPrice ?? 0);
    const image = Array.isArray(p.images) ? p.images[0] || "" : String(p.image || "");
    const collection = String(p.collection || "").trim();
    const branch = String(p.branch || "").trim();

    if (!name) {
      errors.push({ row: i + 1, reason: "Missing product name" });
      continue;
    }

    const lineId = mapCollectionToLineId(collection) ?? 1;
    const itemCode = generateItemCode(name);

    try {
      const result = await pool
        .request()
        .input("itemCode", sql.NVarChar(64), itemCode)
        .input("name", sql.NVarChar(sql.MAX), name)
        .input("price", sql.Decimal(18, 2), price)
        .input("image", sql.NVarChar(sql.MAX), image || null)
        .input("lineId", sql.Int, lineId)
        .input("requestPoint", sql.Decimal(18, 2), 0)
        .query(`
          INSERT INTO Items (
            Item_code, Item_name, Item_sellpricNow, PicPath,
            Category_id, Item_request_point, Item_Isdisabled
          )
          OUTPUT INSERTED.ID AS id
          VALUES (@itemCode, @name, @price, @image, @lineId, @requestPoint, 0)
        `);

      const newId = result.recordset[0]?.id;
      created++;

      const storeId = resolveStoreId(branch);
      if (newId && storeId) {
        await pool
          .request()
          .input("itemId", sql.Int, newId)
          .input("storeId", sql.Int, storeId)
          .query(`INSERT INTO ItemStores (ItemID, StoreID) VALUES (@itemId, @storeId)`);
      }
    } catch (err: any) {
      console.error(`❌ [Bulk JSON] Row ${i + 1} failed:`, err?.message);
      errors.push({ row: i + 1, reason: err?.message || "Database error" });
    }
  }

  clearErpProductCaches();

  return NextResponse.json({
    success: true,
    message: `${created} product(s) uploaded successfully`,
    created,
    errors,
  });
}

/* ================================================================== */
/*  PATH B/C router — FormData (bulk-upload page or image-only)       */
/* ================================================================== */
async function handleFormDataUpload(request: NextRequest) {
  const formData = await request.formData();
  const mode = String(formData.get("mode") || "preview");
  const dataFile = formData.get("dataFile") as File | null;
  const imagesFile = formData.get("imagesFile") as File | null;

  /* ── PATH C: Image-only auto-match mode ──────────────────────── */
  if (!dataFile && imagesFile) {
    return await handleImageOnlyUpload(imagesFile);
  }

  /* ── PATH B: Normal CSV/Excel + optional images ──────────────── */
  if (!dataFile) {
    return errorResponse(400, "Missing data file (Excel/CSV)");
  }

  /* ── parse data file ──────────────────────────────────────────── */
  const dataBuffer = Buffer.from(await dataFile.arrayBuffer());
  const { rows: rawRows, errors: parseErrors } = parseDataFile(dataBuffer, dataFile.name);

  if (parseErrors.length > 0) {
    return errorResponse(400, `Parse errors: ${parseErrors.join("; ")}`);
  }
  if (rawRows.length === 0) {
    return errorResponse(400, "No data rows found in the file");
  }

  /* ── parse ZIP images (optional) ──────────────────────────────── */
  let zipMap = new Map<string, Buffer>();
  if (imagesFile) {
    const zipBuffer = Buffer.from(await imagesFile.arrayBuffer());
    zipMap = await extractZipImages(zipBuffer);
  }

  /* ── normalize & extract rows ─────────────────────────────────── */
  const parsedRows: ParsedRow[] = rawRows.map((raw, i) => {
    const normalized = normalizeRow(raw);
    return extractRow(normalized, i + 2);
  });

  /* ── validate ─────────────────────────────────────────────────── */
  const allErrors: ValidationError[] = [];
  const rowErrorsMap = new Map<number, ValidationError[]>();

  for (const row of parsedRows) {
    const errs = validateRow(row);
    if (errs.length > 0) {
      rowErrorsMap.set(row.rowIndex, errs);
      allErrors.push(...errs);
    }
  }

  const dupErrors = findDuplicateRows(parsedRows);
  for (const de of dupErrors) {
    const existing = rowErrorsMap.get(de.row) || [];
    existing.push(de);
    rowErrorsMap.set(de.row, existing);
    allErrors.push(de);
  }

  /* ── match images ─────────────────────────────────────────────── */
  const productImageMap = new Map<number, string[]>();
  const allMatchedImages = new Set<string>();

  for (const row of parsedRows) {
    const matched = matchImagesToProduct(row.name, row.images, zipMap);
    productImageMap.set(row.rowIndex, matched);
    matched.forEach((img) => allMatchedImages.add(img));
  }

  const unmatchedImages = Array.from(zipMap.keys()).filter(
    (k) => !allMatchedImages.has(k)
  );

  /* ── check existing items in MSSQL ────────────────────────────── */
  const pool = await getMssqlPool();
  const existingNames = new Set<string>();
  try {
    const nameResult = await pool.request().query(`SELECT Item_name FROM Items WHERE Item_Isdisabled = 0`);
    for (const r of nameResult.recordset) {
      if (r.Item_name) existingNames.add(r.Item_name.trim().toLowerCase());
    }
  } catch (err: any) {
    console.warn("⚠️ [Bulk] Could not fetch existing items:", err?.message);
  }

  /* ── build preview products ───────────────────────────────────── */
  const previewProducts: PreviewProduct[] = parsedRows.map((row) => ({
    rowIndex: row.rowIndex,
    name: row.name,
    price: row.price,
    collection: row.collection,
    branch: row.branch,
    description: row.description,
    status: existingNames.has(row.name.toLowerCase()) ? "update" : "create",
    matchedImages: productImageMap.get(row.rowIndex) || [],
    errors: rowErrorsMap.get(row.rowIndex) || [],
  }));

  /* ── PREVIEW MODE ─────────────────────────────────────────────── */
  if (mode === "preview") {
    const withErrors = previewProducts.filter((p) => p.errors.length > 0).length;

    return NextResponse.json({
      summary: {
        totalRows: parsedRows.length,
        toCreate: previewProducts.filter((p) => p.status === "create" && p.errors.length === 0).length,
        toUpdate: previewProducts.filter((p) => p.status === "update" && p.errors.length === 0).length,
        withErrors,
        totalImages: zipMap.size,
        linkedImages: allMatchedImages.size,
        unmatchedImages,
      },
      products: previewProducts,
      allErrors,
    });
  }

  /* ── CONFIRM MODE ─────────────────────────────────────────────── */
  const report: UploadReport = {
    created: 0,
    updated: 0,
    linkedImages: 0,
    errors: [],
    unmatchedImages,
  };

  for (const row of parsedRows) {
    const rowErrors = rowErrorsMap.get(row.rowIndex);
    if (rowErrors && rowErrors.length > 0) {
      report.errors.push({
        row: row.rowIndex,
        reason: rowErrors.map((e) => `${e.field}: ${e.message}`).join("; "),
      });
      continue;
    }

    const isUpdate = existingNames.has(row.name.toLowerCase());
    const lineId = mapCollectionToLineId(row.collection) ?? 1;
    const matchedImgs = productImageMap.get(row.rowIndex) || [];
    const picPath = matchedImgs.length > 0 ? matchedImgs[0] : "";

    try {
      if (isUpdate) {
        await pool
          .request()
          .input("name", sql.NVarChar(sql.MAX), row.name.trim())
          .input("price", sql.Decimal(18, 2), row.price)
          .input("image", sql.NVarChar(sql.MAX), picPath || null)
          .input("lineId", sql.Int, lineId)
          .query(`
            UPDATE Items
            SET Item_sellpricNow = @price,
                PicPath = CASE WHEN @image IS NOT NULL AND @image <> '' THEN @image ELSE PicPath END,
                Category_id = @lineId
            WHERE LTRIM(RTRIM(Item_name)) = @name
              AND Item_Isdisabled = 0
          `);
        report.updated++;

        const storeId = resolveStoreId(row.branch);
        if (storeId) {
          const idResult = await pool
            .request()
            .input("name", sql.NVarChar(sql.MAX), row.name.trim())
            .query(`SELECT TOP 1 ID FROM Items WHERE LTRIM(RTRIM(Item_name)) = @name AND Item_Isdisabled = 0`);
          const itemId = idResult.recordset[0]?.ID;
          if (itemId) {
            await pool
              .request()
              .input("itemId", sql.Int, itemId)
              .input("storeId", sql.Int, storeId)
              .query(`
                IF NOT EXISTS (SELECT 1 FROM ItemStores WHERE ItemID = @itemId AND StoreID = @storeId)
                  INSERT INTO ItemStores (ItemID, StoreID) VALUES (@itemId, @storeId)
              `);
          }
        }
      } else {
        const itemCode = generateItemCode(row.name);

        const result = await pool
          .request()
          .input("itemCode", sql.NVarChar(64), itemCode)
          .input("name", sql.NVarChar(sql.MAX), row.name.trim())
          .input("price", sql.Decimal(18, 2), row.price)
          .input("image", sql.NVarChar(sql.MAX), picPath || null)
          .input("lineId", sql.Int, lineId)
          .input("requestPoint", sql.Decimal(18, 2), 0)
          .query(`
            INSERT INTO Items (
              Item_code, Item_name, Item_sellpricNow, PicPath,
              Category_id, Item_request_point, Item_Isdisabled
            )
            OUTPUT INSERTED.ID AS id
            VALUES (@itemCode, @name, @price, @image, @lineId, @requestPoint, 0)
          `);

        const newId = result.recordset[0]?.id;
        report.created++;

        const storeId = resolveStoreId(row.branch);
        if (newId && storeId) {
          await pool
            .request()
            .input("itemId", sql.Int, newId)
            .input("storeId", sql.Int, storeId)
            .query(`INSERT INTO ItemStores (ItemID, StoreID) VALUES (@itemId, @storeId)`);
        }
      }

      if (matchedImgs.length > 0) {
        report.linkedImages += matchedImgs.length;
      }
    } catch (err: any) {
      console.error(`❌ [Bulk] Row ${row.rowIndex} (${row.name}) failed:`, err?.message);
      report.errors.push({ row: row.rowIndex, reason: err?.message || "Database error" });
    }
  }

  clearErpProductCaches();

  return NextResponse.json({
    success: true,
    message: `Bulk upload complete: ${report.created} created, ${report.updated} updated`,
    report,
  });
}

/* ================================================================== */
/*  PATH C — Image-only auto-match upload                             */
/*                                                                    */
/*  User uploads ONLY a ZIP (no Excel/CSV). Each image filename is    */
/*  normalized and matched against Items.Item_name in MSSQL.          */
/*  Matched images → Cloudinary → PicPath update.                     */
/* ================================================================== */
async function handleImageOnlyUpload(imagesFile: File) {
  console.log("🖼️ [Bulk] Image-only mode activated");

  /* ── extract images from ZIP ──────────────────────────────────── */
  const zipBuffer = Buffer.from(await imagesFile.arrayBuffer());
  const zipMap = await extractZipImages(zipBuffer);

  if (zipMap.size === 0) {
    return errorResponse(400, "No images found in the ZIP file");
  }

  console.log(`🖼️ [Bulk] Extracted ${zipMap.size} images from ZIP`);

  /* ── configure Cloudinary ─────────────────────────────────────── */
  configureCloudinary();

  /* ── load all active items from MSSQL ─────────────────────────── */
  const pool = await getMssqlPool();
  let allItems: { ID: number; Item_name: string }[] = [];
  try {
    const result = await pool.request().query(
      `SELECT ID, Item_name FROM Items WHERE Item_Isdisabled = 0 AND Item_name IS NOT NULL`
    );
    allItems = result.recordset;
  } catch (err: any) {
    console.error("❌ [Bulk Image] Failed to fetch items:", err?.message);
    return errorResponse(500, "Failed to fetch items from database");
  }

  /* ── build lookup maps for matching ───────────────────────────── */
  // Exact match map: lowercased Item_name → { ID, Item_name }
  const exactMap = new Map<string, { ID: number; Item_name: string }>();
  for (const item of allItems) {
    const key = item.Item_name.trim().toLowerCase();
    if (!exactMap.has(key)) {
      exactMap.set(key, item);
    }
  }

  /* ── process each image ───────────────────────────────────────── */
  let matched = 0;
  let updated = 0;
  let failed = 0;
  const errors: { file: string; reason: string }[] = [];
  const details: { file: string; matchedTo: string; imageUrl: string }[] = [];

  for (const [filename, buffer] of zipMap) {
    // Skip empty or extensionless filenames
    if (!filename || !filename.includes(".")) {
      errors.push({ file: filename || "(empty)", reason: "Invalid filename (no extension)" });
      failed++;
      continue;
    }

    const baseName = normalizeImageName(filename);
    if (!baseName) {
      errors.push({ file: filename, reason: "Empty base name after normalization" });
      failed++;
      continue;
    }

    const baseNameLower = baseName.toLowerCase();

    /* ── Step 1: Exact match ──────────────────────────────────── */
    let matchedItem = exactMap.get(baseNameLower);

    /* ── Step 2: Fuzzy match (LIKE) if exact fails ────────────── */
    if (!matchedItem) {
      // Try finding an item whose name contains the base name
      for (const item of allItems) {
        const itemNameLower = item.Item_name.trim().toLowerCase();
        if (itemNameLower.includes(baseNameLower) || baseNameLower.includes(itemNameLower)) {
          matchedItem = item;
          break;
        }
      }
    }

    if (!matchedItem) {
      console.log(`⚠️ [Bulk Image] No match for "${filename}" (base: "${baseName}")`);
      errors.push({ file: filename, reason: "No matching product found" });
      failed++;
      continue;
    }

    matched++;

    /* ── Upload to Cloudinary ─────────────────────────────────── */
    try {
      const publicId = `erp-${matchedItem.ID}-${Date.now().toString().slice(-6)}`;
      const imageUrl = await uploadBufferToCloudinary(buffer, publicId);

      /* ── Update PicPath in MSSQL ─────────────────────────────── */
      await pool
        .request()
        .input("imageUrl", sql.NVarChar(sql.MAX), imageUrl)
        .input("itemId", sql.Int, matchedItem.ID)
        .query(`UPDATE Items SET PicPath = @imageUrl WHERE ID = @itemId`);

      updated++;
      details.push({
        file: filename,
        matchedTo: matchedItem.Item_name,
        imageUrl,
      });

      console.log(`✅ [Bulk Image] "${filename}" → "${matchedItem.Item_name}" (ID: ${matchedItem.ID})`);
    } catch (err: any) {
      console.error(`❌ [Bulk Image] Upload/update failed for "${filename}":`, err?.message);
      errors.push({ file: filename, reason: `Upload failed: ${err?.message || "Unknown error"}` });
      failed++;
    }
  }

  clearErpProductCaches();

  return NextResponse.json({
    success: true,
    mode: "image-only",
    message: `Image auto-match complete: ${updated} updated, ${failed} failed out of ${zipMap.size} images`,
    total: zipMap.size,
    matched,
    updated,
    failed,
    errors,
    details,
  });
}
