import { type NextRequest, NextResponse } from "next/server";
import { getMssqlPool, sql } from "@/lib/mssql";
import {
  type ErpItemRow,
  transformErpRows,
  erpProductToCachedShape,
  VALID_ERP_LINE_IDS,
} from "@/lib/erp-mappings";
import { isAdminRequest } from "@/lib/erp-items";
import { decodeEmployeeJWT } from "@/lib/auth-helpers";
import { filterPublicProducts } from "@/lib/product-visibility";
import { getActiveProductDiscounts } from "@/lib/product-discounts";

// ── In-memory cache (shared module — see lib/items-cache.ts) ─────────
import { getCachedItems, setCachedItems } from "@/lib/items-cache";
const getCached = getCachedItems;
const setCache = setCachedItems;

// ── Helpers ─────────────────────────────────────────────────────────
const jsonHeaders = {
  "Content-Type": "application/json",
  // Live pricing data — never let a browser/CDN serve a stale body. The previous
  // `public, s-maxage=30, stale-while-revalidate=30` had no `max-age` and no
  // validator, so the browser's heuristic freshness was 0 and SWR told it to serve
  // the stale copy instantly on every reload. That silently overwrote correct,
  // freshly server-rendered discount prices with a pre-discount cached body.
  "Cache-Control": "no-store, must-revalidate",

};

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message, timestamp: new Date().toISOString() }, { status });

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET /api/items ──────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const collection = searchParams.get("collection"); // "wedding" | "soiree"
    const branch = searchParams.get("branch");
    const search = (searchParams.get("search") || searchParams.get("q") || "").trim();
    const format = searchParams.get("format"); // "erp" for raw ERP shape, default = cached shape
    const includeInactive = searchParams.get("includeInactive") === "true" && (await isAdminRequest(request, "canViewProducts"));
    const includeNoImages = searchParams.get("includeNoImages") === "true" && (await isAdminRequest(request, "canViewProducts"));
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "40", 10), 1), 500);
    const hasPagination = searchParams.has("page") || searchParams.has("limit");

    const hasImage = searchParams.get("hasImage"); // "with-image" | "without-image" | "all"

    // Build cache key
    const cacheKey = `items|${collection || ""}|${branch || ""}|${search}|${format || ""}|${includeInactive ? "all" : "active"}|${includeNoImages ? "allimg" : "img"}|${page}|${limit}|${hasPagination ? "paged" : "all"}|imgFilter:${hasImage || "all"}`;
    const cached = getCached(cacheKey);
    if (cached) {
      console.log("⚡ [ERP] Served items from cache");
      const cachedHeaders = {
        ...jsonHeaders,
        ...(hasPagination ? { "X-Page": String(page), "X-Limit": String(limit) } : {}),
      };
      return new NextResponse(cached, { status: 200, headers: cachedHeaders });
    }

    const pool = await getMssqlPool();
    const req = pool.request();

    // ── Build query ─────────────────────────────────────────────────
    // Main query: Items LEFT JOIN Booking + Stores + ERP line table
    // LEFT JOIN so items without bookings still appear
    let query = `
      SELECT
        i.ID          AS ItemID,
        i.Item_name,
        i.Item_sellpricNow,
        i.Item_buypric,
        i.Item_code,
        i.Notes,
        i.PicPath,
        i.Item_Isdisabled,
        ISNULL(i.IsBestseller, 0) AS IsBestseller,
        ISNULL(i.IsNew, 0)        AS IsNew,
        CASE WHEN sellOp.OP_ItemID IS NOT NULL THEN 1 ELSE 0 END AS IsSellDressOp,
        opStore.OP_StoreID AS OpStoreID,
        (SELECT COUNT(*) FROM Booking bkAll WHERE bkAll.ModelTypeID = i.ID) AS TotalBookings,
        i.Category_id AS LineId,
        c.Name        AS LineName,
        b.ID          AS BookingID,
        b.ReceivedDate,
        b.ReturnDate,
        b.BranchID,
        s.Store_name  AS StoreName,
        istore.Branch_ID AS ItemStoreBranchID,
        istore.Store_name AS ItemStoreName,
        fallback.FallbackStoreName
      FROM Items i
      LEFT JOIN Category c ON i.Category_id = c.ID
      LEFT JOIN Booking  b ON b.ModelTypeID  = i.ID AND b.ReturnDate >= CAST(GETDATE() AS DATE)
      LEFT JOIN Stores   s ON b.BranchID     = s.Branch_ID
      LEFT JOIN (
          SELECT itemst.ItemID, st.Store_name, st.Branch_ID
          FROM tb_ItemStores itemst
          JOIN Stores st ON itemst.StoreID = st.ID
      ) istore ON istore.ItemID = i.ID
      LEFT JOIN (
          SELECT DISTINCT op.OP_ItemID
          FROM tb_ItemOperations op
          INNER JOIN Stores sop ON sop.ID = op.OP_StoreID
          WHERE sop.Store_name = '15'
            AND op.OP_ItemID IS NOT NULL
      ) sellOp ON sellOp.OP_ItemID = i.ID
      OUTER APPLY (
          SELECT TOP 1 s2.Store_name AS FallbackStoreName
          FROM Booking b2
          JOIN Stores s2 ON b2.BranchID = s2.Branch_ID
          WHERE b2.ModelTypeID = i.ID
          ORDER BY b2.ID DESC
      ) fallback
      OUTER APPLY (
          SELECT TOP 1 op.OP_StoreID
          FROM tb_ItemOperations op
          WHERE op.OP_ItemID = i.ID AND op.OP_StoreID IS NOT NULL
          GROUP BY op.OP_StoreID
          ORDER BY CASE WHEN op.OP_StoreID = 16 THEN 1 ELSE 0 END, COUNT(*) DESC
      ) opStore
      WHERE (
        i.Category_id IN (${VALID_ERP_LINE_IDS.join(",")})
        OR sellOp.OP_ItemID IS NOT NULL
      )
      AND i.Item_sellpricNow > 0
    `;

    if (!includeInactive) {
      query += ` AND i.Item_Isdisabled = 0`;
    }

    // Optional filters
    if (collection) {
      const catIds = collection.toLowerCase() === "wedding" ? [6, 11, 13, 15] : collection.toLowerCase() === "soiree" ? [1, 5, 10, 12, 18] : collection.toLowerCase() === "fionka" ? [9] : null;
      if (catIds !== null) {
        query += ` AND i.Category_id IN (${catIds.join(",")})`;
      }
    }

    if (search) {
      query += ` AND i.Item_name LIKE @search`;
      req.input("search", sql.NVarChar, `%${search}%`);
    }

    if (hasImage === "with-image") {
      query += ` AND i.PicPath IS NOT NULL AND i.PicPath != '' AND i.PicPath != '/placeholder.svg' AND i.PicPath NOT LIKE 'data:%'`;
    } else if (hasImage === "without-image") {
      query += ` AND (i.PicPath IS NULL OR i.PicPath = '' OR i.PicPath = '/placeholder.svg' OR i.PicPath LIKE 'data:%')`;
    }

    query += ` ORDER BY i.ID DESC`;

    const result = await req.query<ErpItemRow>(query);
    const erpProducts = transformErpRows(result.recordset as ErpItemRow[]);

    // If branch filter requested, filter post-query
    let finalProducts = erpProducts;
    if (branch) {
      finalProducts = erpProducts.filter((p) => p.branch === branch);
    }

    // ── Public visibility: hide products without valid images ────────
    // `includeNoImages` lets the dashboard see all products regardless of images.
    // `includeInactive` also bypasses this for backward compat.
    // When a search query is present, no-image products are included so users
    // can find items by name even if photos haven't been uploaded yet.
    if (!includeNoImages && !includeInactive && !search) {
      finalProducts = filterPublicProducts(finalProducts);
    }

    const totalCount = finalProducts.length;
    const pagedProducts = hasPagination
      ? finalProducts.slice((page - 1) * limit, (page - 1) * limit + limit)
      : finalProducts;

    // Transform to the shape the frontend expects
    let output: any[];
    if (format === "erp") {
      output = pagedProducts;
    } else {
      const activeProductDiscounts = await getActiveProductDiscounts();
      output = pagedProducts.map((item) => erpProductToCachedShape(item, activeProductDiscounts));
    }

    // ── Strip prices based on permissions ──────────────────────────────
    const canViewPrices = await isAdminRequest(request, "canViewPricesOnWebsite");

    if (!canViewPrices) {
      output = output.map((item: any) => {
        const cleaned = { ...item };
        delete cleaned.price;
        delete cleaned.beforeSalePrice;
        delete cleaned.afterSalePrice;
        delete cleaned.packagePrice;
        delete cleaned.packageOriginalPrice;
        return cleaned;
      });
    }

    const body = JSON.stringify(output);
    setCache(cacheKey, body);

    console.log(
      `✅ [ERP] Fetched ${pagedProducts.length}/${totalCount} items in ${Date.now() - startTime}ms`
    );
    const responseHeaders = {
      ...jsonHeaders,
      ...(hasPagination
        ? {
            "X-Total-Count": String(totalCount),
            "X-Page": String(page),
            "X-Limit": String(limit),
            "X-Total-Pages": String(Math.max(Math.ceil(totalCount / limit), 1)),
          }
        : {}),
    };
    return new NextResponse(body, { status: 200, headers: responseHeaders });
  } catch (error: any) {
    console.error("❌ [ERP] Error in GET /api/items:", error?.message || error);
    return errorResponse(500, "Failed to fetch items from ERP");
  }
}
