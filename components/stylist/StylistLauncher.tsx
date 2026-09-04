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
 * Opens the consultation in place, like any chat widget, instead of
 * navigating to a separate page — the launcher toggles a floating panel
 * anchored above itself and swaps its own icon for a close mark while open.
 *
 * Sits bottom-right: several pages already anchor a back-to-top control at
 * bottom-left, and z-index stays below the try-on modal (z-100) so it can
 * never float above a full-screen experience.
 */

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import StylistExperience from "./StylistExperience"

const GOLD = "#B9975B"

/** Sections where a floating CTA would be noise or in the way. */
const HIDDEN_PREFIXES = ["/stylist", "/admin", "/checkout", "/cart", "/auth", "/debug", "/slideshow"]

export default function StylistLauncher() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Closing on navigation stops a stale panel surviving a route change
  // underneath it (the composer's sticky bottom bar in particular looks
  // broken pinned over an unrelated page).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  if (!pathname) return null
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed z-[65] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.22)] border border-black/10 overflow-hidden
                       inset-x-3 top-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] rounded-2xl
                       sm:inset-auto sm:bottom-28 sm:right-8 sm:top-auto sm:w-[420px] sm:max-w-[92vw] sm:h-[min(680px,80vh)] sm:rounded-3xl"
          >
            <StylistExperience embedded onClose={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-5 right-5 sm:bottom-8 sm:right-8 z-[60] print:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close the RAEY AI Stylist" : "Open the RAEY AI Stylist"}
          aria-expanded={open}
          className="group flex items-center gap-0 sm:gap-0 sm:hover:gap-3 h-16 sm:h-20 px-4 sm:px-5 rounded-full bg-white border border-black/10 shadow-[0_8px_28px_rgba(0,0,0,0.12)] hover:border-black/25 hover:shadow-[0_12px_36px_rgba(0,0,0,0.16)] transition-all duration-500"
        >
          <span className="relative flex items-center justify-center h-12 w-12 sm:h-16 sm:w-16">
            {open ? (
              <X className="h-6 w-6 text-black" strokeWidth={1.5} />
            ) : (
              <>
                {/* Full mark, uncropped — public/stylist-icon-v2.png, the
                    reference the user supplied (public/ai-icon.png) with its
                    background made transparent so it sits directly on the
                    button's white fill. object-contain on a fixed square
                    keeps the whole wide illustration (dress + wand) visible
                    instead of a tall crop clipping its sides. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/stylist-icon-v2.png"
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-contain select-none"
                  draggable={false}
                />
                {/* Slow, subtle halo — presence without a notification badge.
                    Decorative only: if it never animates, nothing is lost. */}
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full motion-safe:animate-ping"
                  style={{ backgroundColor: GOLD, opacity: 0.14, animationDuration: "3.4s" }}
                />
              </>
            )}
          </span>

          {/* Desktop: the label unfurls on hover, only while closed. */}
          {!open && (
            <span className="hidden sm:block overflow-hidden max-w-0 group-hover:max-w-[190px] transition-all duration-500">
              <span className="block whitespace-nowrap text-[10px] uppercase tracking-[0.22em] text-black">
                RAEY AI Stylist
              </span>
            </span>
          )}
        </button>
      </div>
    </>
  )
}
