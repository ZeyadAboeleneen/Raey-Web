"use client"

/**
 * components/stylist/StylistProductCard.tsx
 *
 * A real RAEY product, rendered inside the consultation.
 *
 * Every field comes from the catalogue via the server — the card never
 * displays anything the model wrote except `reason`, which is itself
 * constrained to attributes catalogued from the product's own photograph.
 *
 * Visual language matches the storefront's existing cards: 4:7 portrait image,
 * rounded-2xl, gradient scrim, uppercase tracked labels.
 */

import Image from "next/image"
import Link from "next/link"
import { Sparkles, ThumbsDown, Copy } from "lucide-react"
import { isTryOnEligible } from "@/lib/ai/try-on-eligibility"
import type { StylistRecommendation } from "@/lib/stylist-session"

const GOLD = "#B9975B"

interface Props {
  product: StylistRecommendation
  rtl: boolean
  onShowSimilar: (product: StylistRecommendation) => void
  onReject: (product: StylistRecommendation) => void
  onTryOn: (product: StylistRecommendation) => void
  onOpen: (product: StylistRecommendation) => void
  labels: {
    viewDress: string
    tryItOn: string
    showSimilar: string
    notForMe: string
  }
}

export default function StylistProductCard({
  product,
  rtl,
  onShowSimilar,
  onReject,
  onTryOn,
  onOpen,
  labels,
}: Props) {
  const canTryOn = isTryOnEligible(product.collection)

  return (
    <article
      className="group w-[240px] sm:w-[260px] flex-shrink-0 snap-start"
      dir={rtl ? "rtl" : "ltr"}
    >
      <Link
        href={product.productUrl}
        onClick={() => onOpen(product)}
        className="block relative w-full aspect-[4/7] sm:aspect-[3/5] overflow-hidden rounded-2xl bg-gray-50"
      >
        <Image
          src={product.image || "/placeholder.svg"}
          alt={product.name}
          fill
          sizes="260px"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 p-4 text-white">
          <p className="text-[9px] uppercase tracking-[0.22em] text-white/70 mb-1">
            {product.collection}
          </p>
          <h4 className="text-base font-light tracking-wide">{product.name}</h4>
          {product.price ? (
            <p className="text-[11px] text-white/85 mt-1">
              {product.isSellable ? "" : "From "}
              {new Intl.NumberFormat("en-EG").format(product.price)} EGP
            </p>
          ) : null}
        </div>
      </Link>

      {product.reason ? (
        <p
          className="mt-3 text-[12px] leading-relaxed text-gray-600"
          style={{ textAlign: rtl ? "right" : "left" }}
        >
          {product.reason}
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        <Link
          href={product.productUrl}
          onClick={() => onOpen(product)}
          className="w-full py-2.5 text-center border border-black/15 text-[10px] uppercase tracking-[0.18em] hover:border-black transition-colors duration-300"
        >
          {labels.viewDress}
        </Link>

        {canTryOn && (
          <Link
            href={`${product.productUrl}?tryon=1`}
            onClick={() => onTryOn(product)}
            className="w-full py-2.5 flex items-center justify-center gap-2 border border-black/15 text-[10px] uppercase tracking-[0.18em] hover:border-black transition-colors duration-300"
          >
            {labels.tryItOn}
            <Sparkles className="h-3 w-3" style={{ color: GOLD }} />
          </Link>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onShowSimilar(product)}
            className="flex-1 py-2 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-gray-500 hover:text-black transition-colors"
          >
            <Copy className="h-3 w-3" />
            {labels.showSimilar}
          </button>
          <button
            type="button"
            onClick={() => onReject(product)}
            className="flex-1 py-2 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-gray-400 hover:text-black transition-colors"
          >
            <ThumbsDown className="h-3 w-3" />
            {labels.notForMe}
          </button>
        </div>
      </div>
    </article>
  )
}
