"use client"

/**
 * components/try-on/TryItOnButton.tsx
 *
 * The product-page entry point to RAEY AI TRY-ON.
 *
 * Eligible for every dress by default (wedding, soiree, rent or buy); renders
 * nothing when AI_TRYON_COLLECTIONS narrows the allow-list and this gown falls
 * outside it, so dropping it into a shared product page is safe. Products with
 * no catalogue image are skipped — there would be nothing to fit.
 *
 * The modal itself is code-split — the
 * try-on bundle (framer-motion stages, image compression) only loads once a
 * shopper actually asks for it, leaving product-page load time untouched.
 */

import { useState } from "react"
import dynamic from "next/dynamic"
import { Sparkles } from "lucide-react"
import { isTryOnEligible } from "@/lib/ai/try-on-eligibility"
import type { TryOnDress } from "./TryOnModal"

const TryOnModal = dynamic(() => import("./TryOnModal"), { ssr: false })

interface Props {
  dress: TryOnDress
  className?: string
}

export default function TryItOnButton({ dress, className = "" }: Props) {
  const [open, setOpen] = useState(false)

  if (!isTryOnEligible(dress.collection)) return null
  if (!dress.id || !dress.image) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`group inline-flex items-center justify-center gap-2.5 px-7 py-3.5 border border-black bg-transparent text-black text-[11px] uppercase tracking-[0.22em] transition-colors duration-300 hover:bg-black hover:text-white ${className}`}
      >
        Try It On
        <Sparkles className="h-3.5 w-3.5" style={{ color: "#B9975B" }} />
      </button>

      {open && <TryOnModal open={open} onClose={() => setOpen(false)} dress={dress} />}
    </>
  )
}
