"use client"

import React, { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from "react"

export type ShoppingMode = "rent" | "buy"

interface DateContextType {
  occasionDate: Date | null
  setOccasionDate: (date: Date | null) => void
  isBrowsingOnly: boolean
  setIsBrowsingOnly: (isBrowsing: boolean) => void
  /** Whether the user is browsing to rent or to buy. Chosen before the date. */
  mode: ShoppingMode
  setMode: (mode: ShoppingMode) => void
  hasMadeSelection: boolean
  /** True when the selected occasion date is more than 45 days from today.
   *  Prices are NOT available online in this case — user must contact branch. */
  isOccasionPast45Days: boolean
}

const DateContext = createContext<DateContextType | undefined>(undefined)

export function DateProvider({ children }: { children: ReactNode }) {
  const [occasionDate, setOccasionDate] = useState<Date | null>(null)
  const [isBrowsingOnly, setIsBrowsingOnly] = useState<boolean>(false)
  const [mode, setMode] = useState<ShoppingMode>("rent")
  const [hydrated, setHydrated] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedDate = localStorage.getItem("raey_occasion_date")
      const savedBrowsing = localStorage.getItem("raey_browsing_only")
      const savedMode = localStorage.getItem("raey_shopping_mode")

      if (savedDate) {
        try {
          const date = new Date(savedDate)
          if (!isNaN(date.getTime())) {
            setOccasionDate(date)
          }
        } catch (e) {
          console.error("Error parsing saved date", e)
        }
      }

      if (savedBrowsing === "true") {
        setIsBrowsingOnly(true)
      }

      if (savedMode === "buy" || savedMode === "rent") {
        setMode(savedMode)
      }
    }
    setHydrated(true)
  }, [])

  // Persist to localStorage
  useEffect(() => {
    if (hydrated && typeof window !== "undefined") {
      if (occasionDate) {
        localStorage.setItem("raey_occasion_date", occasionDate.toISOString())
      } else {
        localStorage.removeItem("raey_occasion_date")
      }

      localStorage.setItem("raey_browsing_only", isBrowsingOnly ? "true" : "false")
      localStorage.setItem("raey_shopping_mode", mode)
    }
  }, [occasionDate, isBrowsingOnly, mode, hydrated])

  // In Buy mode no date is needed — choosing Buy completes the selection.
  // In Rent mode the user must pick a date or opt into browse-only.
  const hasMadeSelection = mode === "buy" || occasionDate !== null || isBrowsingOnly

  // Mirror the rental-pricing `d` calculation: d = calendar days from today to (occasionDate - 1)
  const isOccasionPast45Days = useMemo(() => {
    if (!occasionDate) return false
    const msPerDay = 1000 * 60 * 60 * 24
    const rentStart = new Date(occasionDate)
    rentStart.setDate(rentStart.getDate() - 1)
    const sd = new Date(rentStart); sd.setHours(0, 0, 0, 0)
    const bd = new Date(); bd.setHours(0, 0, 0, 0)
    const d = Math.max(1, Math.round((sd.getTime() - bd.getTime()) / msPerDay))
    return d > 45
  }, [occasionDate])

  return (
    <DateContext.Provider
      value={{
        occasionDate,
        setOccasionDate,
        isBrowsingOnly,
        setIsBrowsingOnly,
        mode,
        setMode,
        hasMadeSelection,
        isOccasionPast45Days,
      }}
    >
      {children}
    </DateContext.Provider>
  )
}

export function useDateContext() {
  const context = useContext(DateContext)
  if (context === undefined) {
    throw new Error("useDateContext must be used within a DateProvider")
  }
  return context
}
