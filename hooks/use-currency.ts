"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { useLocale } from "@/lib/locale-context"
import { usePermission } from "@/lib/auth-context"

export const useCurrencyFormatter = () => {
  const { settings } = useLocale()
  const pathname = usePathname()
  const canViewPrices = usePermission("canViewPricesOnWebsite")
  
  const showPrices = useMemo(() => {
    return (
      (pathname?.startsWith("/admin") ?? false) || 
      (pathname?.startsWith("/checkout") ?? false) || 
      (pathname?.startsWith("/cart") ?? false) || 
      canViewPrices
    )
  }, [pathname, canViewPrices])

  const formatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(settings.language === "ar" ? settings.locale : "en-US", {
        style: "currency",
        currency: settings.currencyCode || "EGP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })
    } catch {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "EGP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })
    }
  }, [settings.currencyCode, settings.language, settings.locale])

  const formatPrice = (amount: number | undefined | null) => {
    if (!amount || Number.isNaN(amount)) return formatter.format(0)
    const converted = amount * (settings.exchangeRate || 1)
    // Round to nearest integer (e.g., 954.4 -> 954)
    const rounded = Math.round(converted)
    return formatter.format(rounded)
  }

  return {
    formatPrice,
    showPrices,
    canViewPrices,
    currencyCode: settings.currencyCode,
    currencySymbol: settings.currencySymbol,
    localeSettings: settings
  }
}

