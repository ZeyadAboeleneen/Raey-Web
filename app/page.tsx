"use client"

import Link from "next/link"
import { Navigation } from "@/components/navigation"

export default function HomePage() {
  return (
    <div className="fixed inset-0 h-[100dvh] w-full overflow-hidden bg-black z-0">
      <Navigation />

      {/* Hero Section - 50/50 Vertical Split Screen */}
      <section className="absolute inset-0 h-[100dvh] flex flex-col md:flex-row w-full overflow-hidden">
        {/* Left Panel - Wedding Collection */}
        <Link
          href="/wedding"
          className="relative h-1/2 md:h-full md:w-1/2 group overflow-hidden block cursor-pointer"
        >
          {/* Background Image with CSS zoom via group-hover */}
          <div
            className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-[1200ms] ease-out group-hover:scale-110"
            style={{ backgroundImage: "url('/wedding.jpg')" }}
          />
          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/75 z-10" />
          {/* Text */}
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white uppercase tracking-[0.2em] leading-tight drop-shadow-2xl">
              Wedding<br />Collection
            </h1>
          </div>
        </Link>

        {/* Right Panel - Soiree Collection */}
        <Link
          href="/soiree/products"
          className="relative h-1/2 md:h-full md:w-1/2 group overflow-hidden block cursor-pointer"
        >
          {/* Background Image with CSS zoom via group-hover */}
          <div
            className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-[1200ms] ease-out group-hover:scale-110"
            style={{ backgroundImage: "url('/elraey-bg.PNG')" }}
          />
          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/75 z-10" />
          {/* Text */}
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white uppercase tracking-[0.2em] leading-tight drop-shadow-2xl">
              Soiree<br />Collection
            </h1>
          </div>
        </Link>
      </section>
    </div>
  )
}
