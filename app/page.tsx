"use client"

import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useLocale } from "@/lib/locale-context"
import { useTranslation } from "@/lib/translations"
import { useSiteSettings } from "@/lib/site-settings-context"

// Lazy load Navigation to improve initial page load
const Navigation = dynamic(() => import("@/components/navigation").then(mod => ({ default: mod.Navigation })), {
  ssr: true,
})

export default function HomePage() {
  const router = useRouter()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)

  const [weddingLoaded, setWeddingLoaded] = useState(false)
  const [soireeLoaded, setSoireeLoaded] = useState(false)
  const { heroImages } = useSiteSettings()

  const imagesReady = useMemo(() => weddingLoaded && soireeLoaded, [soireeLoaded, weddingLoaded])

  // Pre-navigation handler with prefetching
  const handleNavigation = (href: string) => {
    // Prefetch the route immediately
    router.prefetch(href)
    router.push(href)
  }

  // Prefetch on hover for instant navigation
  const handleMouseEnter = (href: string) => {
    router.prefetch(href)
  }

  return (
    <div className="fixed inset-0 h-[100dvh] w-full overflow-hidden bg-black z-0">
      <Navigation />

      {!imagesReady && (
        <div className="absolute inset-0 z-[100] bg-black" />
      )}

      {/* Hero Section - 50/50 Vertical Split Screen */}
      <section className="absolute inset-0 h-[100dvh] flex flex-col md:flex-row w-full overflow-hidden">
        {/* Left Panel - Wedding Collection */}
        <div
          onClick={() => handleNavigation("/wedding")}
          onMouseEnter={() => handleMouseEnter("/wedding")}
          className="relative h-1/2 md:h-full md:w-1/2 group overflow-hidden block cursor-pointer"
        >
          <Image
            src={heroImages.wedding}
            alt="Wedding collection"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            quality={85}
            className="absolute inset-0 z-0 object-cover object-[center_50%] transition-transform duration-[1200ms] ease-out group-hover:scale-110"
            onLoad={() => setWeddingLoaded(true)}
          />
          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/75 z-10" />
          {/* Text */}
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white uppercase tracking-[0.2em] leading-tight drop-shadow-2xl">
              {t("weddingCollectionsTitle")}
            </h1>
          </div>
        </div>

        {/* Right Panel - Soiree Collection */}
        <div
          onClick={() => handleNavigation("/soiree")}
          onMouseEnter={() => handleMouseEnter("/soiree")}
          className="relative h-1/2 md:h-full md:w-1/2 group overflow-hidden block cursor-pointer"
        >
          <Image
            src={heroImages.soiree}
            alt="Soiree collection"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            quality={85}
            className="absolute inset-0 z-0 object-cover object-center transition-transform duration-[1200ms] ease-out group-hover:scale-110"
            onLoad={() => setSoireeLoaded(true)}
          />
          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/75 z-10" />
          {/* Text */}
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white uppercase tracking-[0.2em] leading-tight drop-shadow-2xl">
              {t("soireeCollectionsTitle")}
            </h1>
          </div>
        </div>
      </section>
    </div>
  )
}
