import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getProductServer } from "@/lib/get-products-server"
import ProductDetailPageClient from "./ProductDetailPageClient"

interface Props {
  params: { branch: string; product: string }
}

// Product data changes rarely enough (price/stock) that a short ISR window
// keeps pages fast while staying acceptably fresh; live availability/date
// pricing is still fetched client-side and is never subject to this cache.
export const revalidate = 60

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { branch, product: productId } = params
  const product = await getProductServer(productId)

  if (!product) {
    return { title: "Product Not Found | Raey" }
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://raeygroup.com").replace(/\/$/, "")
  const productUrl = `${siteUrl}/products/${branch}/${productId}`
  const description =
    (product.description && product.description.trim()) ||
    `${product.name} — available to rent or buy at Raey.`
  const image = product.images?.[0]
    ? product.images[0].startsWith("http")
      ? product.images[0]
      : `${siteUrl}${product.images[0].startsWith("/") ? "" : "/"}${product.images[0]}`
    : undefined

  return {
    title: `${product.name} | Raey`,
    description,
    alternates: { canonical: productUrl },
    openGraph: {
      title: product.name,
      description,
      url: productUrl,
      images: image ? [{ url: image }] : undefined,
      type: "website",
    },
  }
}

/**
 * Normalises and deduplicates image URLs for the JSON-LD schema.
 * - Removes empty / placeholder values
 * - Converts relative paths to absolute URLs
 * - Keeps already-absolute http(s) URLs (e.g. Cloudinary)
 * - Deduplicates
 */
function buildSchemaImages(images: string[] | undefined | null, siteUrl: string): string[] | undefined {
  if (!images || images.length === 0) return undefined

  const seen = new Set<string>()
  const result: string[] = []

  for (const img of images) {
    if (!img) continue
    if (img === "/placeholder.svg") continue
    if (img.startsWith("data:") || img.startsWith("blob:")) continue

    let absolute: string
    if (img.startsWith("http://") || img.startsWith("https://")) {
      absolute = img
    } else {
      absolute = `${siteUrl}${img.startsWith("/") ? "" : "/"}${img}`
    }

    if (!seen.has(absolute)) {
      seen.add(absolute)
      result.push(absolute)
    }
  }

  return result.length > 0 ? result : undefined
}

/**
 * Builds a validated price number from a raw value.
 * Returns null if the value is missing, NaN, Infinity, zero, or negative.
 */
function validPrice(raw: number | null | undefined): number | null {
  if (raw == null) return null
  if (!Number.isFinite(raw)) return null
  if (raw <= 0) return null
  return raw
}

export default async function ProductDetailPage({ params }: Props) {
  const { branch, product: productId } = params

  const product = await getProductServer(productId)

  if (!product) {
    notFound()
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://raeygroup.com").replace(/\/$/, "")
  const productUrl = `${siteUrl}/products/${branch}/${productId}`

  // ── Build JSON-LD ──────────────────────────────────────────────────
  const isRentProduct = product.branch !== "sell-dresses"

  const schemaImages = buildSchemaImages(product.images, siteUrl)

  // Determine offers
  let offersSchema: Record<string, any> | undefined

  if (isRentProduct) {
    // Rental: use rentalPriceC (client-facing category C price) as the single offer price
    const price = validPrice(product.rentalPriceC)
    if (price !== null) {
      offersSchema = {
        "@type": "Offer",
        price: String(price),
        priceCurrency: "EGP",
        // availability from ERP isActive flag; isOutOfStock mirrors !isActive in erpProductToCachedShape
        availability: product.isOutOfStock || product.isActive === false
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
        url: productUrl,
      }
    }
  } else {
    // Buy product: sizes array may contain multiple prices
    const prices = (product.sizes as Array<{ discountedPrice?: number; originalPrice?: number }>)
      .map((s) => validPrice(s.discountedPrice) ?? validPrice(s.originalPrice))
      .filter((p): p is number => p !== null)

    if (prices.length === 1) {
      offersSchema = {
        "@type": "Offer",
        price: String(prices[0]),
        priceCurrency: "EGP",
        availability: product.isOutOfStock || product.isActive === false
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
        url: productUrl,
      }
    } else if (prices.length > 1) {
      const lowPrice = Math.min(...prices)
      const highPrice = Math.max(...prices)
      offersSchema = {
        "@type": "AggregateOffer",
        lowPrice: String(lowPrice),
        highPrice: String(highPrice),
        priceCurrency: "EGP",
        offerCount: prices.length,
        availability: product.isOutOfStock || product.isActive === false
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
        url: productUrl,
      }
    }
    // If no valid prices, offersSchema stays undefined — no Offer object emitted
  }

  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    id: String(product.id || productId),
    productID: String(product.id || productId),
    sku: product.code || String(product.id || productId),
    name: product.name,
    description: (product.description && product.description.trim()) || product.name,
    brand: {
      "@type": "Brand",
      name: "Raey",
    },
    category: product.collection || branch,
    url: productUrl,
  }

  if (schemaImages) {
    jsonLd.image = schemaImages
  }

  if (offersSchema) {
    jsonLd.offers = offersSchema
  }

  // Safely serialize — escape < to prevent script injection
  const jsonLdString = JSON.stringify(jsonLd).replace(/</g, "\\u003c")

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString }}
      />
      <ProductDetailPageClient initialProduct={product} />
    </>
  )
}
