"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useDateContext } from "@/lib/date-context"
import type { CachedProduct as Product } from "@/lib/products-cache"
import { calculateRentalPrice } from "@/lib/rental-pricing-calc"
import { usePermission } from "@/lib/auth-context"
import { useAuth } from "@/lib/auth-context"

export function useDateFilteredProducts(products: Product[]) {
  const { occasionDate, isBrowsingOnly, mode, isOccasionPast45Days: rawIsOccasionPast45Days } = useDateContext()
  const canViewPrices = usePermission("canViewPricesOnWebsite")
  const canEditProducts = usePermission("canEditProducts")
  const { state: authState } = useAuth()
  const userRole = authState.user?.role || ""

  // Admins and staff with canEditProducts bypass the 45-day restriction
  const canBypass45Days = userRole === "admin" || canEditProducts || canViewPrices
  const isOccasionPast45Days = canBypass45Days ? false : rawIsOccasionPast45Days
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

  // 2. Dynamic pricing for listing cards. The client-side estimate (getDynamicPrice
  // below) assumes n=0, which is only correct for dresses still in their first 4
  // rentals. POST4 dresses (5th rental onward) are priced from rental history and
  // can't be derived client-side, so we fetch the n-aware price from
  // /api/rental/bulk-pricing and override the estimate with it.
  const fetchPricesForIds = useCallback(async (productIds: string[]) => {
    const date = currentDateRef.current
    if (!date || !productIds.length) return

    // Only fetch ids we don't already have a server price for and aren't fetching.
    const toFetch = productIds.filter(
      (id) => serverPricesRef.current[id] === undefined && !fetchingIdsRef.current.has(id)
    )
    if (!toFetch.length) return

    toFetch.forEach((id) => fetchingIdsRef.current.add(id))
    activeFetchCountRef.current += 1
    setLoadingPrices(true)

    try {
      const res = await fetch("/api/rental/bulk-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: toFetch, occasionDate: date.toISOString() }),
      })
      // Discard stale results if the occasion date changed mid-flight.
      if (currentDateRef.current !== date) return
      if (res.ok) {
        const data = await res.json()
        if (data?.prices) {
          setServerPrices((prev) => ({ ...prev, ...data.prices }))
        }
      }
    } catch (err) {
      console.error("[useDateFilteredProducts] bulk price fetch failed:", err)
    } finally {
      toFetch.forEach((id) => fetchingIdsRef.current.delete(id))
      activeFetchCountRef.current = Math.max(0, activeFetchCountRef.current - 1)
      if (activeFetchCountRef.current === 0) setLoadingPrices(false)
    }
  }, [])

  const fetchPricesForPage = useCallback(
    async (pageProducts: Product[]) => {
      await fetchPricesForIds(
        pageProducts
          .filter((p) => p.branch !== "sell-dresses" && !p.isGiftPackage)
          .map((p) => p.id)
      )
    },
    [fetchPricesForIds]
  )

  // Clear server prices and fetching cache when date changes
  useEffect(() => {
    setServerPrices({})
    serverPricesRef.current = {}
    fetchingIdsRef.current.clear()
    activeFetchCountRef.current = 0
    setLoadingPrices(false)
  }, [occasionDate])

  // Number of days from booking (today) to the rental start (occasion − 1 day).
  // Same `d` the server pricing uses. Null when there's no usable occasion date.
  const dayOffset = useMemo(() => {
    if (!occasionDate || isBrowsingOnly || isOccasionPast45Days) return null
    const msPerDay = 1000 * 60 * 60 * 24
    const rentStart = new Date(occasionDate)
    rentStart.setDate(rentStart.getDate() - 1)
    const startDay = new Date(rentStart)
    startDay.setHours(0, 0, 0, 0)
    const bookDay = new Date()
    bookDay.setHours(0, 0, 0, 0)
    return Math.max(1, Math.round((startDay.getTime() - bookDay.getTime()) / msPerDay))
  }, [occasionDate, isBrowsingOnly, isOccasionPast45Days])

  // Date-based rental price for a SINGLE product, computed on the fly.
  // Works for any product (grid, bestsellers, new-arrivals) regardless of which
  // list it came from — it does not depend on the product being in `products`.
  // Uses the identical formula/inputs as the /api/rental/bulk-pricing endpoint.
  const getDynamicPrice = useCallback((product: Product): number | null => {
    if (dayOffset === null) return null
    if (!product || product.branch === "sell-dresses" || product.isGiftPackage) return null
    // The server price is n-aware (handles POST4); prefer it once it's loaded.
    const serverPrice = serverPrices[product.id]
    if (serverPrice !== undefined) return serverPrice
    const costBase = product.cost || (product.rentalPriceA ? product.rentalPriceA / 0.8 : 0)
    if (costBase <= 0) return null
    return calculateRentalPrice(costBase, dayOffset, 0, false).total
  }, [dayOffset, serverPrices])

  // Map form (id → price) for the products passed to this hook, for callers that
  // index by id. Individual cards should prefer getDynamicPrice(product).
  const dynamicPrices = useMemo(() => {
    const map: Record<string, number> = {}
    if (dayOffset === null) return map
    for (const p of products) {
      const price = getDynamicPrice(p)
      if (price !== null) map[p.id] = price
    }
    return map
  }, [products, dayOffset, getDynamicPrice])

  return {
    sortedProducts,
    isAvailable,
    dynamicPrices,
    getDynamicPrice,
    loadingPrices,
    fetchPricesForPage,
    fetchPricesForIds,
    occasionDate,
    isBrowsingOnly,
    mode,
    isOccasionPast45Days
  }
}
