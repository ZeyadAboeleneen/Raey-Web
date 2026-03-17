import { prisma } from "./prisma"

/**
 * Server-side product fetcher with an in-memory cache.
 * Called from the root layout (server component).
 *
 * This version waits for the first fetch if the cache is cold,
 * ensuring that the first request after an update gets the latest data.
 */

interface CacheEntry {
    data: any[]
    expiresAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes is enough for SSR cache

const g = globalThis as typeof globalThis & {
    _ssrProductsCache?: CacheEntry
    _ssrProductsPromise?: Promise<any[]>
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

    const imagesArray = Array.isArray(product.images) ? product.images : []
    const primaryImage = product.imageUrl || product.image_url

    return {
        _id: product.productId,
        id: product.productId,
        name: product.name,
        description: product.description ?? "",
        longDescription: product.longDescription ?? "",
        images: primaryImage
            ? [primaryImage, ...imagesArray.filter((x: any) => x && x !== primaryImage)]
            : imagesArray,
        rating: product.rating || 0,
        reviews: product.reviewCount || 0,
        category: product.category,
        collection: product.collection || null,
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

async function fetchProductsFromDB(): Promise<any[]> {
    try {
        const products = await prisma.product.findMany({
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            take: 1000,
        })
        const transformed = products.map(transformProduct)
        g._ssrProductsCache = {
            data: transformed,
            expiresAt: Date.now() + CACHE_TTL_MS,
        }
        console.log(`✅ [SSR] Cache warmed with ${transformed.length} products`)
        return transformed
    } catch (err: any) {
        console.error("❌ [SSR] Fetch from DB failed:", err?.message || err)
        return []
    } finally {
        g._ssrProductsPromise = undefined
    }
}

export function warmProductsServerCache(): void {
    if (g._ssrProductsCache && Date.now() < g._ssrProductsCache.expiresAt) {
        return
    }

    if (g._ssrProductsPromise) {
        return
    }

    g._ssrProductsPromise = fetchProductsFromDB()
}

export async function getProductsServer(): Promise<any[]> {
    // 1. Cache is warm and not expired → return instantly
    if (g._ssrProductsCache && Date.now() < g._ssrProductsCache.expiresAt) {
        return g._ssrProductsCache.data
    }

    // 1b. Cache exists but is expired → serve stale instantly and refresh in background
    if (g._ssrProductsCache) {
        if (!g._ssrProductsPromise) {
            g._ssrProductsPromise = fetchProductsFromDB()
        }
        return g._ssrProductsCache.data
    }

    // 2. Already fetching? Return the existing promise
    if (g._ssrProductsPromise) {
        return g._ssrProductsPromise
    }

    // 3. Cache is cold or expired → fetch and wait
    console.log("🔍 [SSR] Cache cold, fetching from DB...")
    g._ssrProductsPromise = fetchProductsFromDB()
    return g._ssrProductsPromise
}
