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

  // 2. Dynamic pricing for listing cards is computed entirely client-side via
  // `speculativePrices` below. That uses the SAME formula and inputs
  // (cost, date-derived `d`, n=0) as the /api/rental/bulk-pricing endpoint, so a
  // server round-trip produces an identical number while adding latency and, at
  // scale, a perpetual `loadingPrices` state that froze every card on
  // "Calculating…". These fetchers are intentionally no-ops; the detail page /
  // quick-add modal still call the server directly when an exact (n-aware) price
  // is needed. Kept as stable callbacks so the page effects that call them don't loop.
  const fetchPricesForIds = useCallback(async (_productIds: string[]) => {}, [])

  const fetchPricesForPage = useCallback(async (_pageProducts: Product[]) => {}, [])

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
    const costBase = product.cost || (product.rentalPriceA ? product.rentalPriceA / 0.8 : 0)
    if (costBase <= 0) return null
    return calculateRentalPrice(costBase, dayOffset, 0, false).total
  }, [dayOffset])

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
