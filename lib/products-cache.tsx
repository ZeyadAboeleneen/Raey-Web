"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"

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
  /** Raw cost from ERP — used for dynamic pricing calculations */
  cost?: number
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
/** How long the sessionStorage cache is considered fresh (5 minutes) */
const STORAGE_MAX_AGE_MS = 5 * 60 * 1000

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
  const [products, setProducts] = useState<CachedProduct[]>(() => {
    if (initialProducts && initialProducts.length > 0) {
      return initialProducts.map((p) => normalizeCachedProduct(p as unknown as Record<string, unknown>))
    }
    return readFromStorage() ?? []
  })

  const [loading, setLoading] = useState(() => {
    if (initialProducts && initialProducts.length > 0) return false
    return readFromStorage() === null
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
      const response = await fetch(`/api/items`)
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>[]
        const normalized = data.map(normalizeCachedProduct)
        setProducts(normalized)
        writeToStorage(normalized)
      }
    } catch (error) {
      console.error("Error preloading products:", error)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  const fetchStage = useCallback(async (url: string) => {
    const response = await fetch(url)
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

  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      writeToStorage(initialProducts.map((p) => normalizeCachedProduct(p as unknown as Record<string, unknown>)))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    await fetchAll(false)
  }, [fetchAll])

  const getByBranch = useCallback(
    (branchSlug: string) => {
      return products.filter(
        (p) => p.branch === branchSlug && p.isActive !== false
      )
    },
    [products]
  )

  const getByCollection = useCallback(
    (collection: string) => {
      const target = collection.toLowerCase().trim()
      return products.filter((p) => {
        const pCollection = (p.collection || "").toLowerCase().trim()
        const isActive = p.isActive !== false
        return pCollection === target && isActive
      })
    },
    [products]
  )

  const getBestsellers = useCallback(() => {
    return products.filter(
      (p) => p.isBestseller && p.isActive !== false
    )
  }, [products])

  const getById = useCallback(
    (id: string) => {
      return products.find((p) => p.id === id)
    },
    [products]
  )

  return (
    <ProductsCacheContext.Provider
      value={{ products, loading, refresh, getById, getByBranch, getByCollection, getBestsellers }}
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
