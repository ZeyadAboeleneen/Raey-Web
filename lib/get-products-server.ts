import { prisma } from "./prisma"

/**
 * Server-side product fetcher with an in-memory cache.
 * Called from the root layout (server component).
 *
 * CRITICAL: This function NEVER blocks the page render.
 * - If the cache is warm → returns cached data instantly.
 * - If the cache is cold → returns empty array instantly and
 *   kicks off a background warm-up for the NEXT request.
 * - The client-side ProductsCacheProvider will fetch via the
 *   /api/products endpoint in the background either way.
 */

interface CacheEntry {
    data: any[]
    expiresAt: number
}

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes — the catalog rarely changes

const g = globalThis as typeof globalThis & {
    _ssrProductsCache?: CacheEntry
    _ssrProductsWarmingUp?: boolean
}

const calculateIsOutOfStock = (sizes: any[]): boolean => {
    if (!sizes || sizes.length === 0) return false
    return sizes.every((size: any) => {
        const stockCount = size.stockCount ?? size.stock_count
        return stockCount === undefined || stockCount === null || stockCount === 0
    })
}

function transformProduct(product: any) {
    const sizes = product.sizes || []
    const isOutOfStock =
        product.isOutOfStock !== undefined
            ? product.isOutOfStock
            : calculateIsOutOfStock(sizes)

    return {
        _id: product.productId,
        id: product.productId,
        name: product.name,
        description: product.description ?? "",
        longDescription: product.longDescription ?? "",
        images: product.images || [],
        rating: product.rating || 0,
        reviews: product.reviewCount || 0,
        category: product.category,
        isNew: product.isNew === true,
        isBestseller: product.isBestseller === true,
        isActive: product.isActive !== false,
        isOutOfStock,
        sizes: sizes.map((s: any) => ({
            ...s,
            stockCount: s.stockCount ?? s.stock_count,
        })),
        isGiftPackage: product.isGiftPackage || false,
        packagePrice: product.packagePrice,
        packageOriginalPrice: product.packageOriginalPrice,
        giftPackageSizes: product.giftPackageSizes || [],
        notes: product.notes || { top: [], middle: [], base: [] },
    }
}

/** Fire-and-forget: fetch products from DB and populate the cache. */
function warmCacheInBackground() {
    if (g._ssrProductsWarmingUp) return // already warming
    g._ssrProductsWarmingUp = true

    prisma.product
        .findMany({
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            take: 40,
        })
        .then((products) => {
            const transformed = products.map(transformProduct)
            g._ssrProductsCache = {
                data: transformed,
                expiresAt: Date.now() + CACHE_TTL_MS,
            }
            console.log(`✅ [SSR] Cache warmed with ${transformed.length} products`)
        })
        .catch((err) => {
            console.error("❌ [SSR] Background cache warm-up failed:", err?.message || err)
        })
        .finally(() => {
            g._ssrProductsWarmingUp = false
        })
}

export async function getProductsServer(): Promise<any[]> {
    // 1. Cache is warm → return instantly
    if (g._ssrProductsCache && Date.now() < g._ssrProductsCache.expiresAt) {
        return g._ssrProductsCache.data
    }

    // 2. Cache is stale but still has data → return stale data + refresh in background
    if (g._ssrProductsCache?.data?.length) {
        warmCacheInBackground()
        return g._ssrProductsCache.data
    }

    // 3. Cache is completely cold → return empty, warm in background.
    //    The client-side ProductsCacheProvider will fetch via /api/products.
    warmCacheInBackground()
    return []
}
