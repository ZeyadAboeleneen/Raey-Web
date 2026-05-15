import { type NextRequest, NextResponse } from "next/server";
import { getMssqlPool, sql } from "@/lib/mssql";
import { mapCollectionToLineId } from "@/lib/erp-mappings";
import { clearErpProductCaches, isAdminRequest } from "@/lib/erp-items";
import {
  normalizeRow,
  extractRow,
  validateRow,
  matchImageNamesToProduct,
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
  E: 6, M: 8, D: 13, R: 14, "15": 16,
  "el-raey-1": 6, "mona-saleh": 8, "el-raey-2": 13,
  "el-raey-the-yard": 14, "sell-dresses": 16,
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

/**
 * Normalize an image filename to a product-matchable base name.
 */
function normalizeImageName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

/* ================================================================== */
/*  POST handler — JSON only (no file uploads)                         */
/*                                                                     */
/*  New architecture:                                                  */
/*    Client uploads images directly to Cloudinary                     */
/*    Client sends JSON (product data + Cloudinary URLs) here          */
/* ================================================================== */
export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminRequest(request, "canAddProducts"))) {
      return errorResponse(403, "Admin access required or insufficient permissions");
    }

    const body = await request.json();
    const mode = String(body.mode || "preview");

    switch (mode) {
      case "preview":
        return await handlePreview(body);
      case "confirm":
        return await handleConfirm(body);
      case "image-only":
        return await handleImageOnly(body);
      case "dashboard":
        return await handleDashboardUpload(body);
      default:
        return errorResponse(400, `Unknown mode: ${mode}`);
    }
  } catch (err: any) {
    console.error("❌ [Bulk] Unhandled error:", err?.message || err);
    return errorResponse(500, "Internal server error during bulk upload");
  }
}

/* ================================================================== */
/*  PREVIEW — receives parsed rows + image names, returns preview      */
/* ================================================================== */
async function handlePreview(body: any) {
  const rawRows: Record<string, any>[] = body.rows;
  const zipImageNames: string[] = body.zipImageNames || [];

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return errorResponse(400, "No data rows provided");
  }

  /* ── normalize & extract rows ─────────────────────────────── */
  const parsedRows: ParsedRow[] = rawRows.map((raw, i) => {
    const normalized = normalizeRow(raw);
    return extractRow(normalized, i + 2);
  });

  /* ── validate ─────────────────────────────────────────────── */
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

  /* ── match images by name ─────────────────────────────────── */
  const zipNameSet = new Set(zipImageNames.map((n) => n.toLowerCase()));
  const productImageMap = new Map<number, string[]>();
  const allMatchedImages = new Set<string>();

  for (const row of parsedRows) {
    const matched = matchImageNamesToProduct(row.name, row.images, zipNameSet);
    productImageMap.set(row.rowIndex, matched);
    matched.forEach((img) => allMatchedImages.add(img));
  }

  const unmatchedImages = zipImageNames.filter(
    (n) => !allMatchedImages.has(n.toLowerCase())
  );

  /* ── check existing items in MSSQL ────────────────────────── */
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

  /* ── build preview products ───────────────────────────────── */
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

  const withErrors = previewProducts.filter((p) => p.errors.length > 0).length;

  return NextResponse.json({
    summary: {
      totalRows: parsedRows.length,
      toCreate: previewProducts.filter((p) => p.status === "create" && p.errors.length === 0).length,
      toUpdate: previewProducts.filter((p) => p.status === "update" && p.errors.length === 0).length,
      withErrors,
      totalImages: zipNameSet.size,
      linkedImages: allMatchedImages.size,
      unmatchedImages,
    },
    products: previewProducts,
    allErrors,
  });
}

/* ================================================================== */
/*  CONFIRM — receives rows + imageUrlMap, writes to MSSQL             */
/* ================================================================== */
async function handleConfirm(body: any) {
  const rawRows: Record<string, any>[] = body.rows;
  const imageUrlMap: Record<string, string> = body.imageUrlMap || {};

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return errorResponse(400, "No data rows provided");
  }

  const parsedRows: ParsedRow[] = rawRows.map((raw, i) => {
    const normalized = normalizeRow(raw);
    return extractRow(normalized, i + 2);
  });

  /* ── validate ─────────────────────────────────────────────── */
  const rowErrorsMap = new Map<number, ValidationError[]>();
  for (const row of parsedRows) {
    const errs = validateRow(row);
    if (errs.length > 0) rowErrorsMap.set(row.rowIndex, errs);
  }

  /* ── match images from the URL map ────────────────────────── */
  const urlMapKeys = new Set(Object.keys(imageUrlMap));

  /* ── check existing items ─────────────────────────────────── */
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

  /* ── process rows ─────────────────────────────────────────── */
  const report: UploadReport = { created: 0, updated: 0, linkedImages: 0, errors: [], unmatchedImages: [] };

  for (const row of parsedRows) {
    const rowErrors = rowErrorsMap.get(row.rowIndex);
    if (rowErrors && rowErrors.length > 0) {
      report.errors.push({ row: row.rowIndex, reason: rowErrors.map((e) => `${e.field}: ${e.message}`).join("; ") });
      continue;
    }
    if (row.price <= 0) {
      report.errors.push({ row: row.rowIndex, reason: "Invalid price: must be greater than 0" });
      continue;
    }

    const isUpdate = existingNames.has(row.name.toLowerCase());
    const lineId = mapCollectionToLineId(row.collection) ?? 1;

    // Find the best Cloudinary URL for this product
    const matchedImgs = matchImageNamesToProduct(row.name, row.images, urlMapKeys);
    const picPath = matchedImgs.length > 0 ? (imageUrlMap[matchedImgs[0]] || "") : "";

    try {
      if (isUpdate) {
        await pool.request()
          .input("name", sql.NVarChar(sql.MAX), row.name.trim())
          .input("price", sql.Decimal(18, 2), row.price)
          .input("image", sql.NVarChar(sql.MAX), picPath || null)
          .input("lineId", sql.Int, lineId)
          .query(`
            UPDATE Items
            SET Item_sellpricNow = @price,
                PicPath = CASE WHEN @image IS NOT NULL AND @image <> '' THEN @image ELSE PicPath END,
                Category_id = @lineId
            WHERE LTRIM(RTRIM(Item_name)) = @name AND Item_Isdisabled = 0
          `);
        report.updated++;

        const storeId = resolveStoreId(row.branch);
        if (storeId) {
          const idResult = await pool.request()
            .input("name", sql.NVarChar(sql.MAX), row.name.trim())
            .query(`SELECT TOP 1 ID FROM Items WHERE LTRIM(RTRIM(Item_name)) = @name AND Item_Isdisabled = 0`);
          const itemId = idResult.recordset[0]?.ID;
          if (itemId) {
            await pool.request()
              .input("itemId", sql.Int, itemId)
              .input("storeId", sql.Int, storeId)
              .query(`IF NOT EXISTS (SELECT 1 FROM tb_ItemStores WHERE ItemID = @itemId AND StoreID = @storeId) INSERT INTO tb_ItemStores (ItemID, StoreID) VALUES (@itemId, @storeId)`);
          }
        }
      } else {
        const itemCode = generateItemCode(row.name);
        const result = await pool.request()
          .input("itemCode", sql.NVarChar(64), itemCode)
          .input("name", sql.NVarChar(sql.MAX), row.name.trim())
          .input("price", sql.Decimal(18, 2), row.price)
          .input("image", sql.NVarChar(sql.MAX), picPath || null)
          .input("lineId", sql.Int, lineId)
          .input("requestPoint", sql.Decimal(18, 2), 0)
          .query(`
            INSERT INTO Items (Item_code, Item_name, Item_sellpricNow, PicPath, Category_id, Item_request_point, Item_Isdisabled)
            OUTPUT INSERTED.ID AS id
            VALUES (@itemCode, @name, @price, @image, @lineId, @requestPoint, 0)
          `);
        const newId = result.recordset[0]?.id;
        report.created++;

        const storeId = resolveStoreId(row.branch);
        if (newId && storeId) {
          await pool.request()
            .input("itemId", sql.Int, newId)
            .input("storeId", sql.Int, storeId)
            .query(`INSERT INTO tb_ItemStores (ItemID, StoreID) VALUES (@itemId, @storeId)`);
        }
      }

      if (matchedImgs.length > 0) report.linkedImages += matchedImgs.length;
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
/*  IMAGE-ONLY — receives Cloudinary URLs, auto-matches to products    */
/* ================================================================== */
async function handleImageOnly(body: any) {
  const images: { filename: string; url: string; publicId: string }[] = body.images;

  if (!Array.isArray(images) || images.length === 0) {
    return errorResponse(400, "No images provided");
  }

  console.log(`🖼️ [Bulk] Image-only mode: ${images.length} images received`);

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

  const exactMap = new Map<string, { ID: number; Item_name: string }>();
  for (const item of allItems) {
    const key = item.Item_name.trim().toLowerCase();
    if (!exactMap.has(key)) exactMap.set(key, item);
  }

  let matched = 0, updated = 0, failed = 0;
  const errors: { file: string; reason: string }[] = [];
  const details: { file: string; matchedTo: string; imageUrl: string }[] = [];

  for (const img of images) {
    const baseName = normalizeImageName(img.filename);
    if (!baseName) {
      errors.push({ file: img.filename, reason: "Empty base name" });
      failed++;
      continue;
    }

    const baseNameLower = baseName.toLowerCase();
    let matchedItem = exactMap.get(baseNameLower);

    if (!matchedItem) {
      for (const item of allItems) {
        const itemNameLower = item.Item_name.trim().toLowerCase();
        if (itemNameLower.includes(baseNameLower) || baseNameLower.includes(itemNameLower)) {
          matchedItem = item;
          break;
        }
      }
    }

    if (!matchedItem) {
      errors.push({ file: img.filename, reason: "No matching product found" });
      failed++;
      continue;
    }

    matched++;

    try {
      await pool.request()
        .input("imageUrl", sql.NVarChar(sql.MAX), img.url)
        .input("itemId", sql.Int, matchedItem.ID)
        .query(`UPDATE Items SET PicPath = @imageUrl WHERE ID = @itemId`);

      updated++;
      details.push({ file: img.filename, matchedTo: matchedItem.Item_name, imageUrl: img.url });
      console.log(`✅ [Bulk Image] "${img.filename}" → "${matchedItem.Item_name}"`);
    } catch (err: any) {
      errors.push({ file: img.filename, reason: `DB update failed: ${err?.message || "Unknown"}` });
      failed++;
    }
  }

  clearErpProductCaches();

  return NextResponse.json({
    success: true,
    mode: "image-only",
    message: `Image auto-match complete: ${updated} updated, ${failed} failed out of ${images.length} images`,
    total: images.length,
    matched, updated, failed,
    errors, details,
  });
}

/* ================================================================== */
/*  DASHBOARD — quick JSON upload (backward compat)                    */
/* ================================================================== */
async function handleDashboardUpload(body: any) {
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
    const price = Number(p.price ?? p.sizes?.[0]?.originalPrice ?? p.sizes?.[0]?.discountedPrice ?? 0);
    const image = Array.isArray(p.images) ? p.images[0] || "" : String(p.image || "");
    const collection = String(p.collection || "").trim();
    const branch = String(p.branch || "").trim();

    if (!name) { errors.push({ row: i + 1, reason: "Missing product name" }); continue; }
    if (price <= 0) { errors.push({ row: i + 1, reason: `Invalid price for "${name}"` }); continue; }

    const lineId = mapCollectionToLineId(collection) ?? 1;
    const itemCode = generateItemCode(name);

    try {
      const result = await pool.request()
        .input("itemCode", sql.NVarChar(64), itemCode)
        .input("name", sql.NVarChar(sql.MAX), name)
        .input("price", sql.Decimal(18, 2), price)
        .input("image", sql.NVarChar(sql.MAX), image || null)
        .input("lineId", sql.Int, lineId)
        .input("requestPoint", sql.Decimal(18, 2), 0)
        .query(`
          INSERT INTO Items (Item_code, Item_name, Item_sellpricNow, PicPath, Category_id, Item_request_point, Item_Isdisabled)
          OUTPUT INSERTED.ID AS id
          VALUES (@itemCode, @name, @price, @image, @lineId, @requestPoint, 0)
        `);

      const newId = result.recordset[0]?.id;
      created++;

      const storeId = resolveStoreId(branch);
      if (newId && storeId) {
        await pool.request()
          .input("itemId", sql.Int, newId)
          .input("storeId", sql.Int, storeId)
          .query(`INSERT INTO tb_ItemStores (ItemID, StoreID) VALUES (@itemId, @storeId)`);
      }
    } catch (err: any) {
      errors.push({ row: i + 1, reason: err?.message || "Database error" });
    }
  }

  clearErpProductCaches();
  return NextResponse.json({ success: true, message: `${created} product(s) uploaded successfully`, created, errors });
}
