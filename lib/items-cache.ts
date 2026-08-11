/**
 * In-memory cache backing GET /api/items responses. Lives in its own module
 * (rather than inside the route file) because Next.js route files may only
 * export recognized handler names — an arbitrary helper export there breaks
 * its route type-checking.
 */

interface CacheEntry {
  body: string;
  /** Total matching rows before pagination — needed to rebuild X-Total-Count/
   *  X-Total-Pages on a cache hit. Without this a cache hit for page 1 reports
   *  no total-pages count, so a caller paginating through the full catalog
   *  (e.g. the discount admin page) silently stops after page 1. */
  totalCount: number | null;
  expiresAt: number;
}

// Kept short so admin changes (discounts, prices, availability) reach the client
// quickly — this used to be 5 minutes, which meant a client-side refresh could
// overwrite a correct, freshly-rendered page with pre-discount cached data.
export const ITEMS_CACHE_TTL_MS = 30 * 1000; // 30 seconds

const globalCache = globalThis as typeof globalThis & {
  _erpItemsCache?: Map<string, CacheEntry>;
};
const cache = globalCache._erpItemsCache ?? new Map<string, CacheEntry>();
if (!globalCache._erpItemsCache) globalCache._erpItemsCache = cache;

export function getCachedItems(key: string): { body: string; totalCount: number | null } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { body: entry.body, totalCount: entry.totalCount };
}

export function setCachedItems(key: string, body: string, totalCount: number | null = null) {
  cache.set(key, { body, totalCount, expiresAt: Date.now() + ITEMS_CACHE_TTL_MS });
}

/** Invalidates every cached /api/items response immediately — call after any
 *  write that changes displayed pricing (e.g. a ProductDiscount create/update/
 *  delete) so the next request gets fresh data instead of waiting out the TTL. */
export function invalidateItemsCache(): void {
  cache.clear();
}
