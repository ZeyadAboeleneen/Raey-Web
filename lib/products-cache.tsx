"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"

interface ProductSize {
  size: string
  volume: string
  originalPrice?: number
  discountedPrice?: number
  stockCount?: number
}

interface CachedProduct {
  _id: string
  id: string
  name: string
  description: string
  images: string[]
  rating: number
  reviews: number
  category: string
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
  /** Get products filtered by category */
  getByCategory: (category: string) => CachedProduct[]
  /** Get products filtered by collection */
  getByCollection: (collection: string) => CachedProduct[]
  /** Get bestseller products */
  getBestsellers: () => CachedProduct[]
}

const ProductsCacheContext = createContext<ProductsCacheContextType | null>(null)

const STORAGE_KEY = "raey_products_cache"
const STORAGE_TS_KEY = "raey_products_cache_ts"
/** How long the sessionStorage cache is considered fresh (5 minutes) */
const STORAGE_MAX_AGE_MS = 5 * 60 * 1000

function readFromStorage(): CachedProduct[] | null {
  try {
    if (typeof window === "undefined") return null
    const ts = sessionStorage.getItem(STORAGE_TS_KEY)
    if (!ts || Date.now() - Number(ts) > STORAGE_MAX_AGE_MS) return null
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CachedProduct[]
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
  // Priority: server-side initialProducts > sessionStorage > empty
  const [products, setProducts] = useState<CachedProduct[]>(() => {
    if (initialProducts && initialProducts.length > 0) return initialProducts
    return readFromStorage() ?? []
  })

  // If we already have data (from server or storage), start with loading=false
  const [loading, setLoading] = useState(() => {
    if (initialProducts && initialProducts.length > 0) return false
    return readFromStorage() === null
  })

  const fetched = useRef(false)

  const fetchAll = useCallback(async (quiet: boolean = false) => {
    try {
      if (!quiet) setLoading(true)
      const response = await fetch("/api/products?limit=1000")
      if (response.ok) {
        const data: CachedProduct[] = await response.json()
        setProducts(data)
        writeToStorage(data)
      }
    } catch (error) {
      console.error("Error preloading products:", error)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  // On mount: if we already have server-provided data we still do a quiet
  // background revalidation so the client picks up any recent changes.
  // If we have NO data, we do a loud fetch that sets loading=true.
  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true
      const hasData = products.length > 0
      fetchAll(/* quiet */ hasData)
    }
  }, [fetchAll, products.length])

  // Persist server-provided initialProducts to sessionStorage on first mount
  // so subsequent client-side navigations are also instant.
  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      writeToStorage(initialProducts)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    await fetchAll(false)
  }, [fetchAll])

  const getByCategory = useCallback(
    (category: string) => {
      return products.filter(
        (p) => p.category === category && p.isActive !== false
      )
    },
    [products]
  )

  const getByCollection = useCallback(
    (collection: string) => {
      return products.filter(
        (p) => p.collection === collection && p.isActive !== false
      )
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
      value={{ products, loading, refresh, getById, getByCategory, getByCollection, getBestsellers }}
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
