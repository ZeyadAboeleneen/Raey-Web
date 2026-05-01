import { type NextRequest, NextResponse } from "next/server";
import { getMssqlPool, sql } from "@/lib/mssql";
import {
  type ErpItemRow,
  transformErpRows,
  erpProductToCachedShape,
  VALID_ERP_LINE_IDS,
} from "@/lib/erp-mappings";
import { isAdminRequest } from "@/lib/erp-items";
import { prisma } from "@/lib/prisma";
import { decodeEmployeeJWT } from "@/lib/auth-helpers";

// ── In-memory cache ─────────────────────────────────────────────────
interface CacheEntry {
  body: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const globalCache = globalThis as typeof globalThis & {
  _erpItemsCache?: Map<string, CacheEntry>;
};
const cache =
  globalCache._erpItemsCache ?? new Map<string, CacheEntry>();
if (!globalCache._erpItemsCache) globalCache._erpItemsCache = cache;

function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.body;
}

function setCache(key: string, body: string) {
  cache.set(key, { body, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Helpers ─────────────────────────────────────────────────────────
const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
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
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "40", 10), 1), 500);
    const hasPagination = searchParams.has("page") || searchParams.has("limit");

    // Build cache key
    const cacheKey = `items|${collection || ""}|${branch || ""}|${search}|${format || ""}|${includeInactive ? "all" : "active"}|${page}|${limit}|${hasPagination ? "paged" : "all"}`;
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
        i.PicPath,
        i.Item_Isdisabled,
        i.Category_id AS LineId,
        c.Name        AS LineName,
        b.ID          AS BookingID,
        b.ReceivedDate,
        b.ReturnDate,
        b.BranchID,
        s.Store_name  AS StoreName,
        istore.Branch_ID AS ItemStoreBranchID,
        istore.Store_name AS ItemStoreName
      FROM Items i
      LEFT JOIN Category c ON i.Category_id = c.ID
      LEFT JOIN Booking  b ON b.ModelTypeID  = i.ID
      LEFT JOIN Stores   s ON b.BranchID     = s.Branch_ID
      LEFT JOIN (
          SELECT itemst.ItemID, st.Store_name, st.Branch_ID 
          FROM ItemStores itemst 
          JOIN Stores st ON itemst.StoreID = st.ID
      ) istore ON istore.ItemID = i.ID
      WHERE i.Category_id IN (${VALID_ERP_LINE_IDS.join(",")})
    `;

    if (!includeInactive) {
      query += ` AND i.Item_Isdisabled = 0`;
    }

    // Optional filters
    if (collection) {
      const catId = collection.toLowerCase() === "wedding" ? 6 : collection.toLowerCase() === "soiree" ? 1 : null;
      if (catId !== null) {
        query += ` AND i.Category_id = @catId`;
        req.input("catId", sql.Int, catId);
      }
    }

    if (search) {
      query += ` AND i.Item_name LIKE @search`;
      req.input("search", sql.NVarChar, `%${search}%`);
    }

    query += ` ORDER BY i.ID DESC`;

    const result = await req.query<ErpItemRow>(query);
    const erpProducts = transformErpRows(result.recordset as ErpItemRow[]);

    // If branch filter requested, filter post-query
    let finalProducts = erpProducts;
    if (branch) {
      finalProducts = erpProducts.filter((p) => p.branch === branch);
    }

    const totalCount = finalProducts.length;
    const pagedProducts = hasPagination
      ? finalProducts.slice((page - 1) * limit, (page - 1) * limit + limit)
      : finalProducts;

    // Transform to the shape the frontend expects
    let output =
      format === "erp"
        ? pagedProducts
        : pagedProducts.map(erpProductToCachedShape);

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
