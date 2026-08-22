"use client"

/**
 * components/stylist/StylistLauncher.tsx
 *
 * The site-wide entry point to the RAEY AI Stylist.
 *
 * Deliberately not a round "chat bubble" — that reads as customer-support
 * software. It is a small ivory pill with the gold monogram mark, which on
 * desktop expands to name itself on hover, and stays a compact mark on mobile
 * where screen space belongs to the collection.
 *
 * Sits bottom-right: several pages already anchor a back-to-top control at
 * bottom-left, and z-index stays below the try-on modal (z-100) so it can
 * never float above a full-screen experience.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sparkles } from "lucide-react"

const GOLD = "#B9975B"

/** Sections where a floating CTA would be noise or in the way. */
const HIDDEN_PREFIXES = ["/stylist", "/admin", "/checkout", "/cart", "/auth", "/debug", "/slideshow"]

export default function StylistLauncher() {
  const pathname = usePathname()

  if (!pathname) return null
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null

  return (
    // No entrance animation on the wrapper, deliberately. This is the only
    // way into the stylist, and an opacity animation that starts transparent
    // leaves it invisible whenever animations are paused or throttled (a
    // backgrounded tab, reduced-motion, a slow first paint). Polish lives in
    // the hover transition below, which only ever moves away from a visible
    // resting state.
    <div className="fixed bottom-5 right-5 sm:bottom-8 sm:right-8 z-[60] print:hidden">
      <Link
        href="/stylist"
        aria-label="Open the RAEY AI Stylist"
        className="group flex items-center gap-0 sm:gap-0 sm:hover:gap-3 h-12 sm:h-13 px-3.5 sm:px-4 rounded-full bg-white border border-black/10 shadow-[0_6px_24px_rgba(0,0,0,0.10)] hover:border-black/25 hover:shadow-[0_10px_32px_rgba(0,0,0,0.14)] transition-all duration-500"
      >
        <span className="relative flex items-center justify-center h-6 w-6">
          <Sparkles className="h-4.5 w-4.5" style={{ color: GOLD }} strokeWidth={1.5} />
          {/* Slow, subtle halo — presence without a notification badge.
              Decorative only: if it never animates, nothing is lost. */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full motion-safe:animate-ping"
            style={{ backgroundColor: GOLD, opacity: 0.14, animationDuration: "3.4s" }}
          />
        </span>

        {/* Desktop: the label unfurls on hover. Mobile keeps the mark alone. */}
        <span className="hidden sm:block overflow-hidden max-w-0 group-hover:max-w-[190px] transition-all duration-500">
          <span className="block whitespace-nowrap text-[10px] uppercase tracking-[0.22em] text-black">
            RAEY AI Stylist
          </span>
        </span>
      </Link>
    </div>
  )
}
