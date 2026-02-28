"use client"

import { useEffect } from "react"
import { useLocale } from "@/lib/locale-context"

export function HtmlLangWrapper({ children }: { children: React.ReactNode }) {
  const { settings } = useLocale()

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = settings.language === "ar" ? "ar" : "en"
      document.documentElement.dir = settings.language === "ar" ? "rtl" : "ltr"
    }
  }, [settings.language])

  return <>{children}</>
}

