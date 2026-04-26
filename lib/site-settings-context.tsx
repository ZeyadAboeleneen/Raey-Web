"use client"

import React, { createContext, useContext } from "react"

export interface HeroImages {
  wedding: string
  soiree: string
}

export interface SiteSettings {
  heroImages: HeroImages
}

export const DEFAULT_SETTINGS: SiteSettings = {
  heroImages: {
    wedding: "/wedding.jpg?v=2",
    soiree: "/elraey-bg.PNG",
  },
}

const SiteSettingsContext = createContext<SiteSettings>(DEFAULT_SETTINGS)

export function SiteSettingsProvider({ 
  children, 
  initialSettings 
}: { 
  children: React.ReactNode
  initialSettings: SiteSettings 
}) {
  return (
    <SiteSettingsContext.Provider value={initialSettings}>
      {children}
    </SiteSettingsContext.Provider>
  )
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext)
}
