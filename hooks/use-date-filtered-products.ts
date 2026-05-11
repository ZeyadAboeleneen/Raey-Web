"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useDateContext } from "@/lib/date-context"
import type { CachedProduct as Product } from "@/lib/products-cache"
import { calculateRentalPrice } from "@/lib/rental-pricing-calc"
import { usePermission } from "@/lib/auth-context"

export function useDateFilteredProducts(products: Product[]) {
  const { occasionDate, isBrowsingOnly, isOccasionPast45Days } = useDateContext()
  const canViewPrices = usePermission("canViewPricesOnWebsite")
  const [serverPrices, setServerPrices] = useState<Record<string, number>>({})
  const [loadingPrices, setLoadingPrices] = useState(false)

  // Ref to track serverPrices without causing dependency cycles
  const serverPricesRef = useRef<Record<string, number>>({})
  serverPricesRef.current = serverPrices

  // Track number of active fetches to correctly manage loadingPrices
  const activeFetchCountRef = useRef(0)

  // Track the current occasionDate to discard stale fetch results
  const currentDateRef = useRef<Date | null>(occasionDate)
  currentDateRef.current = occasionDate

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
  // NOTE: serverPrices removed from deps — we read from serverPricesRef instead
  // to prevent the infinite loop where serverPrices change → fetchPricesForIds
  // identity changes → page useEffect re-fires → fetch → serverPrices change → …
  const fetchPricesForIds = useCallback(async (productIds: string[]) => {
    if (!occasionDate || isBrowsingOnly || isOccasionPast45Days) {
      setServerPrices(prev => Object.keys(prev).length === 0 ? prev : {})
      return
    }

    // Read the latest server prices from the ref (no dependency needed)
    const currentServerPrices = serverPricesRef.current
    const idsToFetch = productIds
      .filter(p => p !== "sell-dresses" && !(p in currentServerPrices) && !fetchingIdsRef.current.has(p))

    if (idsToFetch.length === 0) return

    idsToFetch.forEach(id => fetchingIdsRef.current.add(id))
    activeFetchCountRef.current += 1
    setLoadingPrices(true)

    // Capture the date this fetch is for, so we can discard stale results
    const fetchDate = occasionDate

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
      // Only apply results if the date hasn't changed while we were fetching
      if (data.success && data.prices && currentDateRef.current?.getTime() === fetchDate.getTime()) {
        setServerPrices(prev => ({ ...prev, ...data.prices }))
      }
    } catch (error) {
      console.error("Failed to fetch dynamic prices", error)
    } finally {
      idsToFetch.forEach(id => fetchingIdsRef.current.delete(id))
      activeFetchCountRef.current -= 1
      // Only clear loading when ALL concurrent fetches are done
      if (activeFetchCountRef.current <= 0) {
        activeFetchCountRef.current = 0
        setLoadingPrices(false)
      }
    }
  }, [occasionDate, isBrowsingOnly, isOccasionPast45Days])

  const fetchPricesForPage = useCallback(async (pageProducts: Product[]) => {
    const ids = pageProducts
      .filter(p => p.branch !== "sell-dresses" && !p.isGiftPackage && isAvailable(p))
      .map(p => p.id)
    return fetchPricesForIds(ids)
  }, [fetchPricesForIds, isAvailable])

  // Clear server prices and fetching cache when date changes
  useEffect(() => {
    setServerPrices({})
    serverPricesRef.current = {}
    fetchingIdsRef.current.clear()
    activeFetchCountRef.current = 0
    setLoadingPrices(false)
  }, [occasionDate])

  // Speculative pricing logic for instant feedback (calculated during render)
  const speculativePrices = useMemo(() => {
    if (!occasionDate || isBrowsingOnly || isOccasionPast45Days) {
      return {}
    }

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
      
      const costBase = p.cost || (p.rentalPriceA ? p.rentalPriceA / 0.8 : 0)
      if (costBase > 0) {
        const res = calculateRentalPrice(costBase, d, 0, false)
        speculative[p.id] = res.total
      }
    }
    return speculative
  }, [occasionDate, products, isBrowsingOnly, isOccasionPast45Days])

  // Combined prices: server prices override speculative ones
  const dynamicPrices = useMemo(() => ({
    ...speculativePrices,
    ...serverPrices
  }), [speculativePrices, serverPrices])

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
