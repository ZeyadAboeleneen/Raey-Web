import { getMssqlPool, sql } from "./mssql";
import {
  type ErpItemRow,
  transformErpRows,
  erpProductToCachedShape,
  VALID_ERP_LINE_IDS,
} from "./erp-mappings";

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
      WHERE i.Item_Isdisabled = 0
        AND i.Category_id IN (${VALID_ERP_LINE_IDS.join(",")})
      ORDER BY i.ID DESC
    `);

    const erpProducts = transformErpRows(result.recordset as ErpItemRow[]);
    const transformed = erpProducts.map(erpProductToCachedShape);

    g._ssrProductsCache = {
      data: transformed,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    console.log(`✅ [SSR] Cache warmed with ${transformed.length} ERP products`);
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
