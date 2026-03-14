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

    // Only return fields needed for the initial listing/caching
    // Long descriptions and notes can be fetched or handled separately if they are too large
    return {
        id: product.productId,
        name: product.name,
        // Keep description short for the list
        description: product.description ? (product.description.length > 100 ? product.description.substring(0, 100) + "..." : product.description) : "",
        images: Array.isArray(product.images) ? product.images.slice(0, 2) : [], // Only first 2 images for listing
        rating: product.rating || 0,
        reviews: product.reviewCount || 0,
        category: product.category,
        collection: product.collection || null,
        isNew: product.isNew === true,
        isBestseller: product.isBestseller === true,
        isActive: product.isActive !== false,
        isOutOfStock,
        sizes: sizes.map((s: any) => ({
            size: s.size,
            originalPrice: s.originalPrice ?? s.original_price,
            discountedPrice: s.discountedPrice ?? s.discounted_price,
            stockCount: s.stockCount ?? s.stock_count,
        })),
        isGiftPackage: product.isGiftPackage || false,
        packagePrice: product.packagePrice,
        packageOriginalPrice: product.packageOriginalPrice,
        giftPackageSizes: product.giftPackageSizes || [],
        // Omit longDescription and notes for the global cache to save payload size
        // If the product detail page needs them, it can fetch them or we can include them only if they aren't huge
    }
}

async function fetchProductsFromDB(): Promise<any[]> {
    try {
        console.time("fetchProductsFromDB")
        const products = await prisma.product.findMany({
            where: { isActive: true },
            select: {
                productId: true,
                name: true,
                description: true,
                images: true,
                rating: true,
                reviewCount: true,
                category: true,
                collection: true,
                isNew: true,
                isBestseller: true,
                isActive: true,
                isOutOfStock: true,
                sizes: true,
                isGiftPackage: true,
                packagePrice: true,
                packageOriginalPrice: true,
                giftPackageSizes: true,
                // longDescription and notes are intentionally omitted to reduce payload
            },
            orderBy: { createdAt: "desc" },
            take: 500, // Reduced from 1000 to 500 for better performance
        })
        const transformed = products.map(transformProduct)
        g._ssrProductsCache = {
            data: transformed,
            expiresAt: Date.now() + CACHE_TTL_MS,
        }
        console.timeEnd("fetchProductsFromDB")
        console.log(`✅ [SSR] Cache warmed with ${transformed.length} products`)
        return transformed
    } catch (err: any) {
        console.error("❌ [SSR] Fetch from DB failed:", err?.message || err)
        return []
    } finally {
        g._ssrProductsPromise = undefined
    }
}

export async function getProductsServer(): Promise<any[]> {
    // 1. Cache is warm and not expired → return instantly
    if (g._ssrProductsCache && Date.now() < g._ssrProductsCache.expiresAt) {
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
