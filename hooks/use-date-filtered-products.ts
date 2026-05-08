"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useDateContext } from "@/lib/date-context"
import type { CachedProduct as Product } from "@/lib/products-cache"
import { calculateRentalPrice } from "@/lib/rental-pricing-calc"

export function useDateFilteredProducts(products: Product[]) {
  const { occasionDate, isBrowsingOnly, isOccasionPast45Days } = useDateContext()
  const [dynamicPrices, setDynamicPrices] = useState<Record<string, number>>({})
  const [loadingPrices, setLoadingPrices] = useState(false)

  // Helper to check if a product is available
  const isAvailable = useCallback((product: Product) => {
    if (!occasionDate || isBrowsingOnly) return true
    
    // Normalize target date to midnight local for stable comparison
    const target = new Date(occasionDate)
    target.setHours(0, 0, 0, 0)
    const targetTs = target.getTime()
    
    if (!product.unavailableDates || product.unavailableDates.length === 0) return true

    return !product.unavailableDates.some((range) => {
      if (!range.from || !range.to) return false
      
      const from = new Date(range.from)
      from.setHours(0, 0, 0, 0)
      const to = new Date(range.to)
      to.setHours(0, 0, 0, 0)
      
      const fromTs = from.getTime()
      const toTs = to.getTime()
      
      // A rental usually spans [ReceivedDate, ReturnDate].
      // We check if the occasion falls exactly on or within this window.
      return targetTs >= fromTs && targetTs <= toTs
    })
  }, [occasionDate, isBrowsingOnly])

  // 1. Sort products: Available first, Unavailable last
  const sortedProducts = useMemo(() => {
    if (!occasionDate || isBrowsingOnly) return products

    return [...products].sort((a, b) => {
      const aAvail = isAvailable(a)
      const bAvail = isAvailable(b)
      if (aAvail === bAvail) return 0
      return aAvail ? -1 : 1
    })
  }, [products, occasionDate, isBrowsingOnly, isAvailable])

  const fetchingIdsRef = useRef<Set<string>>(new Set())
  
  // 2. Fetch dynamic prices for specific products
  const fetchPricesForIds = useCallback(async (productIds: string[]) => {
    if (!occasionDate || isBrowsingOnly || isOccasionPast45Days) {
      setDynamicPrices(prev => Object.keys(prev).length === 0 ? prev : {})
      return
    }

    const idsToFetch = productIds
      .filter(p => p !== "sell-dresses" && !(p in dynamicPrices) && !fetchingIdsRef.current.has(p))

    if (idsToFetch.length === 0) return

    idsToFetch.forEach(id => fetchingIdsRef.current.add(id))
    setLoadingPrices(true)

    try {
      const res = await fetch("/api/rental/bulk-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: idsToFetch,
          occasionDate: occasionDate.toISOString()
        })
      })
      const data = await res.json()
      if (data.success && data.prices) {
        setDynamicPrices(prev => ({ ...prev, ...data.prices }))
      }
    } catch (error) {
      console.error("Failed to fetch dynamic prices", error)
    } finally {
      idsToFetch.forEach(id => fetchingIdsRef.current.delete(id))
      setLoadingPrices(false)
    }
  }, [occasionDate, isBrowsingOnly, dynamicPrices])

  const fetchPricesForPage = useCallback(async (pageProducts: Product[]) => {
    const ids = pageProducts
      .filter(p => p.branch !== "sell-dresses" && !p.isGiftPackage && isAvailable(p))
      .map(p => p.id)
    return fetchPricesForIds(ids)
  }, [fetchPricesForIds, isAvailable])

  // Reset prices when date changes OR calculate speculative prices instantly
  useEffect(() => {
    if (!occasionDate || isBrowsingOnly || isOccasionPast45Days) {
      setDynamicPrices({})
      fetchingIdsRef.current.clear()
      return
    }

    // Speculative pricing logic for instant feedback
    // We calculate d exactly as the server does: occasionDate - 1 day vs today
    const msPerDay = 1000 * 60 * 60 * 24
    const occasion = new Date(occasionDate)
    const rentStart = new Date(occasion)
    rentStart.setDate(rentStart.getDate() - 1)
    
    const startDay = new Date(rentStart)
    startDay.setHours(0, 0, 0, 0)
    const bookDay = new Date()
    bookDay.setHours(0, 0, 0, 0)
    
    const d = Math.max(1, Math.round((startDay.getTime() - bookDay.getTime()) / msPerDay))
    
    const speculative: Record<string, number> = {}
    for (const p of products) {
      if (p.branch === "sell-dresses" || p.isGiftPackage) continue
      
      // Use Cat A price / 0.8 as the cost base if cost is missing, but cost should be there now
      const costBase = p.cost || (p.rentalPriceA ? p.rentalPriceA / 0.8 : 0)
      if (costBase > 0) {
        const res = calculateRentalPrice(costBase, d, 0, false) // Assume n=0 for speculation
        speculative[p.id] = res.total
      }
    }

    // Set speculative prices immediately (0ms delay)
    setDynamicPrices(speculative)
    fetchingIdsRef.current.clear()
  }, [occasionDate, products, isBrowsingOnly])

  return {
    sortedProducts,
    isAvailable,
    dynamicPrices,
    loadingPrices,
    fetchPricesForPage,
    fetchPricesForIds,
    occasionDate,
    isBrowsingOnly,
    isOccasionPast45Days
  }
}
