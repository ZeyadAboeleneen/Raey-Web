import { getMssqlPool, sql } from "./mssql";
import {
  type ErpItemRow,
  transformErpRows,
  erpProductToCachedShape,
  VALID_ERP_LINE_IDS,
} from "./erp-mappings";
import { filterPublicProducts } from "./product-visibility";

/**
 * Server-side product fetcher with an in-memory cache.
 * Now reads from MSSQL ERP instead of MySQL/Prisma.
 */

interface CacheEntry {
  data: any[];
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const g = globalThis as typeof globalThis & {
  _ssrProductsCache?: CacheEntry;
  _ssrProductsPromise?: Promise<any[]>;
};

async function fetchProductsFromDB(): Promise<any[]> {
  try {
    const pool = await getMssqlPool();
    const result = await pool.request().query<ErpItemRow>(`
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
      WHERE i.Item_Isdisabled = 0
        AND i.Item_sellpricNow > 0
        AND (
          i.Category_id IN (${VALID_ERP_LINE_IDS.join(",")})
          OR sellOp.OP_ItemID IS NOT NULL
        )
      ORDER BY i.ID DESC
    `);

    const erpProducts = transformErpRows(result.recordset as ErpItemRow[]);
    const allTransformed = erpProducts.map(erpProductToCachedShape);

    // Only publicly-visible products (those with valid images) enter the SSR cache.
    // Admin surfaces never use this cache — they hit the API directly.
    const transformed = filterPublicProducts(allTransformed);

    g._ssrProductsCache = {
      data: transformed,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    console.log(`✅ [SSR] Cache warmed with ${transformed.length}/${allTransformed.length} visible ERP products`);
    return transformed;
  } catch (err: any) {
    console.error("❌ [SSR] Fetch from MSSQL ERP failed:", err?.message || err);
    return [];
  } finally {
    g._ssrProductsPromise = undefined;
  }
}

export function warmProductsServerCache(): void {
  if (g._ssrProductsCache && Date.now() < g._ssrProductsCache.expiresAt) {
    return;
  }

  if (g._ssrProductsPromise) {
    return;
  }

  g._ssrProductsPromise = fetchProductsFromDB();
}

/**
 * Fetches a single product by numeric ID directly from MSSQL for SSR.
 * Used by the product detail page to build JSON-LD without a client-side fetch.
 */
export async function getProductServer(itemIdStr: string): Promise<any | null> {
  const itemId = parseInt(itemIdStr, 10);
  if (isNaN(itemId)) return null;

  try {
    const pool = await getMssqlPool();
    const result = await pool
      .request()
      .input("itemId", sql.Int, itemId)
      .query<ErpItemRow>(`
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
        LEFT JOIN Booking  b ON b.ModelTypeID  = i.ID
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
        WHERE i.ID = @itemId
          AND (i.Category_id IN (${VALID_ERP_LINE_IDS.join(",")}) OR sellOp.OP_ItemID IS NOT NULL)
          AND i.Item_Isdisabled = 0
      `);

    if (result.recordset.length === 0) return null;

    const erpProducts = transformErpRows(result.recordset as ErpItemRow[]);
    if (erpProducts.length === 0) return null;

    return erpProductToCachedShape(erpProducts[0]);
  } catch (err: any) {
    console.error("❌ [SSR] getProductServer failed:", err?.message || err);
    return null;
  }
}

export async function getProductsServer(): Promise<any[]> {
  // 1. Cache is warm and not expired → return instantly
  if (g._ssrProductsCache && Date.now() < g._ssrProductsCache.expiresAt) {
    return g._ssrProductsCache.data;
  }

  // 1b. Cache exists but is expired → serve stale instantly and refresh in background
  if (g._ssrProductsCache) {
    if (!g._ssrProductsPromise) {
      g._ssrProductsPromise = fetchProductsFromDB();
    }
    return g._ssrProductsCache.data;
  }

  // 2. Already fetching? Return the existing promise
  if (g._ssrProductsPromise) {
    return g._ssrProductsPromise;
  }

  // 3. Cache is cold → fetch and wait
  console.log("🔍 [SSR] Cache cold, fetching from MSSQL ERP...");
  g._ssrProductsPromise = fetchProductsFromDB();
  return g._ssrProductsPromise;
}
