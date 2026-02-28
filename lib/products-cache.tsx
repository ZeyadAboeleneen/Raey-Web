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
  /** Get bestseller products */
  getBestsellers: () => CachedProduct[]
}

const ProductsCacheContext = createContext<ProductsCacheContextType | null>(null)

export function ProductsCacheProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<CachedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const fetched = useRef(false)

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true)
      // Fetch all active products in one call (no page param = all products)
      const response = await fetch("/api/products?limit=40")
      if (response.ok) {
        const data = await response.json()
        setProducts(data)
      }
    } catch (error) {
      console.error("Error preloading products:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Preload on mount (once)
  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true
      fetchAll()
    }
  }, [fetchAll])

  const refresh = useCallback(async () => {
    await fetchAll()
  }, [fetchAll])

  const getByCategory = useCallback(
    (category: string) => {
      return products.filter(
        (p) => p.category === category && p.isActive !== false
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
      value={{ products, loading, refresh, getById, getByCategory, getBestsellers }}
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
