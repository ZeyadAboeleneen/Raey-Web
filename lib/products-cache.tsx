"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react"
import { isPubliclyVisible } from "@/lib/product-visibility"

export interface ProductSize {
  size: string
  volume: string
  originalPrice?: number
  discountedPrice?: number
  stockCount?: number
}

export interface CachedProduct {
  _id: string
  id: string
  name: string
  description: string
  images: string[]
  rating: number
  reviews: number
  /** Storefront branch slug from Booking→Stores; null if none / unmapped. */
  branch: string
  collection?: string
  isNew?: boolean
  isBestseller?: boolean
  isOutOfStock?: boolean
  isActive?: boolean
  sizes: ProductSize[]
  isGiftPackage?: boolean
  packagePrice?: number
  packageOriginalPrice?: number
  giftPackageSizes?: any[]
  longDescription?: string
  notes?: {
    top: string[]
    middle: string[]
    base: string[]
  }
  unavailableDates?: { from: string; to: string }[]
  hasBeenRented?: boolean
  /** Category A rental price (cost × 0.8, rounded to 100, floor 3000) from ERP */
  rentalPriceA?: number | null
  /** Category C rental price (cost × 0.4, rounded to 100, floor 3000) — shown to clients */
  rentalPriceC?: number | null
  /** Pre-discount rentalPriceA, set only when a rent ProductDiscount reduced it. */
  rentalPriceAOriginal?: number | null
  /** Pre-discount rentalPriceC, set only when a rent ProductDiscount reduced it. */
  rentalPriceCOriginal?: number | null
  /** Active rent ProductDiscount for this product, if any — used to discount the
   *  client-side speculative per-date price estimate before the server responds. */
  rentDiscount?: { type: "fixed" | "percentage"; value: number } | null
  /** Whether an active ProductDiscount currently reduces this item's buy/rent price. */
  hasBuyDiscount?: boolean
  hasRentDiscount?: boolean
  /** Raw cost from ERP — used for dynamic pricing calculations */
  cost?: number
  /** Sell price (Item_sellpricNow) shown in Buy mode; null when not sellable. */
  sellPrice?: number | null
  /** True when the dress has never been booked (0 bookings) → can be bought. */
  isSellable?: boolean
  /** Raw sell price field from ERP. */
  price?: number
}

interface ProductsCacheContextType {
  /** All products loaded from the API */
  products: CachedProduct[]
  /** Whether the initial fetch is still in progress */
  loading: boolean
  /** Force a fresh fetch from the API */
  refresh: () => Promise<void>
  /** Get a single product by its id */
  getById: (id: string) => CachedProduct | undefined
  /** Get products filtered by branch slug */
  getByBranch: (branchSlug: string) => CachedProduct[]
  /** Get products filtered by collection */
  getByCollection: (collection: string) => CachedProduct[]
  /** Get bestseller products */
  getBestsellers: () => CachedProduct[]
}

const ProductsCacheContext = createContext<ProductsCacheContextType | null>(null)

const STORAGE_KEY = "raey_products_cache_v4"
const STORAGE_TS_KEY = "raey_products_cache_ts_v4"
/** How long the sessionStorage cache is considered fresh for the very first paint —
 *  kept short so price/discount changes show up almost immediately. A background
 *  refetch also runs on mount, tab focus, and periodically (see below), so this
 *  mostly only affects how long a *fresh* mount can skip the loading spinner. */
const STORAGE_MAX_AGE_MS = 15 * 1000
/** Background silent refresh interval — keeps prices (including active
 *  discounts) current in tabs the user leaves open without a manual reload. */
const BACKGROUND_REFRESH_INTERVAL_MS = 30 * 1000

function normalizeCachedProduct(raw: Record<string, unknown>): CachedProduct {
  return raw as unknown as CachedProduct
}

function readFromStorage(): CachedProduct[] | null {
  try {
    if (typeof window === "undefined") return null
    const ts = sessionStorage.getItem(STORAGE_TS_KEY)
    if (!ts || Date.now() - Number(ts) > STORAGE_MAX_AGE_MS) return null
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>[]
    return parsed.map(normalizeCachedProduct)
  } catch {
    return null
  }
}

function writeToStorage(products: CachedProduct[]) {
  try {
    if (typeof window === "undefined") return
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(products))
    sessionStorage.setItem(STORAGE_TS_KEY, String(Date.now()))
  } catch {
    // storage full or disabled – silently ignore
  }
}

interface ProductsCacheProviderProps {
  children: ReactNode
  /** Products pre-fetched on the server and passed as props.
   *  When provided, the first render already has data — no loading spinner. */
  initialProducts?: CachedProduct[]
}

export function ProductsCacheProvider({ children, initialProducts }: ProductsCacheProviderProps) {
  // sessionStorage doesn't exist during SSR, so reading it here (synchronously, in the
  // initializer) would make the client's first render diverge from the server's HTML —
  // a guaranteed hydration mismatch on any reload where the tab already has a cache.
  // Both server and client must start from the exact same value: initialProducts, or
  // empty. The sessionStorage cache is instead read in the mount effect below, which
  // only runs after hydration has already succeeded.
  const [products, setProducts] = useState<CachedProduct[]>(() => {
    if (initialProducts && initialProducts.length > 0) {
      return initialProducts.map((p) => normalizeCachedProduct(p as unknown as Record<string, unknown>))
    }
    return []
  })

  const [loading, setLoading] = useState(() => {
    if (initialProducts && initialProducts.length > 0) return false
    return true
  })

  const fetched = useRef(false)

  const mergeById = useCallback((prev: CachedProduct[], next: CachedProduct[]) => {
    if (!next || next.length === 0) return prev
    if (!prev || prev.length === 0) return next

    const map = new Map<string, CachedProduct>()
    for (const p of prev) map.set(p.id, p)
    for (const p of next) map.set(p.id, p)
    return Array.from(map.values())
  }, [])

  const fetchAll = useCallback(async (quiet: boolean = false) => {
    try {
      if (!quiet) setLoading(true)
      // limit=500 — the bare /api/items endpoint defaults to a 40-item page, which would
      // otherwise silently truncate the full catalog (SSR-provided or previously fetched)
      // down to 40 products on every quiet background refresh.
      // `no-store` bypasses the browser HTTP cache in both directions. Without it the
      // browser could resolve this fetch instantly from a stale cached body (see the
      // Cache-Control note in app/api/items/route.ts), silently reverting correct
      // server-rendered discount prices a moment after the page loaded.
      const response = await fetch(`/api/items?limit=500`, { cache: "no-store" })
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>[]
        const normalized = data.map(normalizeCachedProduct)
        // Merge rather than replace: the API caps at 500 items but the catalog is
        // larger, so replacing would drop everything past that cap.
        setProducts((prev) => {
          const merged = mergeById(prev, normalized)
          writeToStorage(merged)
          return merged
        })
      }
    } catch (error) {
      console.error("Error preloading products:", error)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [mergeById])

  const fetchStage = useCallback(async (url: string) => {
    const response = await fetch(url, { cache: "no-store" })
    if (!response.ok) return [] as CachedProduct[]
    const data = (await response.json()) as Record<string, unknown>[]
    return data.map(normalizeCachedProduct)
  }, [])

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true
      const hasData = products.length > 0

      if (hasData) {
        fetchAll(true)
        return
      }

      // Safe to read sessionStorage now — hydration has already completed, so this
      // can't cause a server/client mismatch the way reading it in the initializer would.
      const cached = readFromStorage()
      if (cached && cached.length > 0) {
        setProducts(cached)
        setLoading(false)
        fetchAll(true) // still refresh in the background in case it's gone slightly stale
        return
      }

      ;(async () => {
        try {
          setLoading(true)

          const newArrivals = await fetchStage(`/api/items`)
          setProducts((prev) => mergeById(prev, newArrivals))

          const [weddingFirstPage, soireeFirstPage] = await Promise.all([
            fetchStage(`/api/items?collection=wedding`),
            fetchStage(`/api/items?collection=soiree`),
          ])
          setProducts((prev) => mergeById(prev, mergeById(weddingFirstPage, soireeFirstPage)))

          setLoading(false)

          const fullList = await fetchStage(`/api/items?limit=500`)
          setProducts((prev) => {
            const merged = mergeById(prev, fullList)
            writeToStorage(merged)
            return merged
          })
        } catch (error) {
          console.error("Error preloading products:", error)
          setLoading(false)
        }
      })()
    }
  }, [fetchAll, fetchStage, mergeById, products.length])

  // Keep already-open tabs current: silently refetch when the tab regains focus
  // (e.g. an admin just saved a discount in another tab) and on a short interval.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") fetchAll(true)
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    const interval = setInterval(() => fetchAll(true), BACKGROUND_REFRESH_INTERVAL_MS)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
      clearInterval(interval)
    }
  }, [fetchAll])

  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      writeToStorage(initialProducts.map((p) => normalizeCachedProduct(p as unknown as Record<string, unknown>)))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    await fetchAll(false)
  }, [fetchAll])

  // ── Public visibility filter (defensive client-side layer) ──────
  // Products without valid images are excluded from all public queries.
  // This mirrors the server-side filter in /api/items as a safety net.
  const publicProducts = useMemo(
    () => products.filter((p) => isPubliclyVisible(p)),
    [products]
  )

  const getByBranch = useCallback(
    (branchSlug: string) => {
      return publicProducts.filter(
        (p) => p.branch === branchSlug && p.isActive !== false
      )
    },
    [publicProducts]
  )

  const getByCollection = useCallback(
    (collection: string) => {
      const target = collection.toLowerCase().trim()
      return publicProducts.filter((p) => {
        const pCollection = (p.collection || "").toLowerCase().trim()
        const isActive = p.isActive !== false
        return pCollection === target && isActive
      })
    },
    [publicProducts]
  )

  const getBestsellers = useCallback(() => {
    return publicProducts.filter(
      (p) => p.isBestseller && p.isActive !== false
    )
  }, [publicProducts])

  const getById = useCallback(
    (id: string) => {
      return products.find((p) => p.id === id)
    },
    [products]
  )

  return (
    <ProductsCacheContext.Provider
      value={{ products: publicProducts, loading, refresh, getById, getByBranch, getByCollection, getBestsellers }}
    >
      {children}
    </ProductsCacheContext.Provider>
  )
}

export function useProductsCache() {
  const context = useContext(ProductsCacheContext)
  if (!context) {
    throw new Error("useProductsCache must be used within a ProductsCacheProvider")
  }
  return context
}
