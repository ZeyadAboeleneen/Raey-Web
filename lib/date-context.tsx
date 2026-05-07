"use client"

import React, { createContext, useContext, useState, type ReactNode } from "react"

interface DateContextType {
  occasionDate: Date | null
  setOccasionDate: (date: Date | null) => void
  isBrowsingOnly: boolean
  setIsBrowsingOnly: (isBrowsing: boolean) => void
  hasMadeSelection: boolean
}

const DateContext = createContext<DateContextType | undefined>(undefined)

export function DateProvider({ children }: { children: ReactNode }) {
  const [occasionDate, setOccasionDate] = useState<Date | null>(null)
  const [isBrowsingOnly, setIsBrowsingOnly] = useState<boolean>(false)

  const hasMadeSelection = occasionDate !== null || isBrowsingOnly

  return (
    <DateContext.Provider
      value={{
        occasionDate,
        setOccasionDate,
        isBrowsingOnly,
        setIsBrowsingOnly,
        hasMadeSelection,
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
