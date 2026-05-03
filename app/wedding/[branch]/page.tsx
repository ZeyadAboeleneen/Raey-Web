"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Star, ShoppingCart, X, Heart, AlertCircle, Search, ArrowLeft } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import dynamic from "next/dynamic"

const QuickAddModal = dynamic(
  () => import("@/components/quick-add-modal").then((m) => m.QuickAddModal),
  { ssr: false }
)
import { useCart } from "@/lib/cart-context"
import { useFavorites } from "@/lib/favorites-context"
import { GiftPackageSelector } from "@/components/gift-package-selector"
import { useCurrencyFormatter } from "@/hooks/use-currency"
import { useCustomSize } from "@/hooks/use-custom-size"
import { useTranslation } from "@/lib/translations"
import { useLocale } from "@/lib/locale-context"
import { CustomSizeForm, SizeChartRow } from "@/components/custom-size-form"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useProductsCache } from "@/lib/products-cache"

interface ProductSize {
  size: string
  volume: string
  originalPrice?: number
  discountedPrice?: number
  stockCount?: number
}

interface Product {
  _id: string
  id: string
  name: string
  description: string
  images: string[]
  rating: number
  reviews: number
  branch: string
  collection?: string
  isNew?: boolean
  isBestseller?: boolean
  isOutOfStock?: boolean
  sizes: ProductSize[]
  isGiftPackage?: boolean
  packagePrice?: number
  packageOriginalPrice?: number
  giftPackageSizes?: any[]
}

const collectionDetails: { [key: string]: { titleKey: any; descKey: any } } = {
  "mona-saleh": { titleKey: "monaSalehCollection", descKey: "monaSalehDesc" },
  "el-raey-1": { titleKey: "elRaey1Collection", descKey: "elRaey1Desc" },
  "el-raey-2": { titleKey: "elRaey2Collection", descKey: "elRaey2Desc" },
  "el-raey-the-yard": { titleKey: "elRaeyTheYardCollection", descKey: "elRaeyTheYardDesc" },
  "sell-dresses": { titleKey: "sellDressesCollection", descKey: "sellDressesDesc" },
}

const CATEGORY_PAGE_SIZE = 10
// WhatsApp ordering removed — using cart-based checkout

export default function WeddingBranchPage() {
  const { branch } = useParams() as { branch: string }
  const isRentBranch = branch !== "sell-dresses"

  const { products: cachedProducts, loading: cacheLoading, getByCollection } = useProductsCache()
  const allProducts = useMemo(
    () => getByCollection("wedding").filter(p => p.branch === branch),
    [getByCollection, branch]
  )

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [showSizeSelector, setShowSizeSelector] = useState(false)
  const [showGiftPackageSelector, setShowGiftPackageSelector] = useState(false)
  const [showCustomSizeConfirmation, setShowCustomSizeConfirmation] = useState(false)
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [occasionDate, setOccasionDate] = useState<Date | undefined>(undefined)

  const {
    isCustomSizeMode,
    setIsCustomSizeMode,
    measurementUnit,
    setMeasurementUnit,
    measurements,
    handleMeasurementChange,
    confirmMeasurements,
    setConfirmMeasurements,
    resetMeasurements,
    isMeasurementsValid,
  } = useCustomSize()

  const sizeChart: SizeChartRow[] = [
    {
      label: "XL",
      shoulderIn: "16",
      waistIn: "32",
      bustIn: "40",
      hipsIn: "42",
      sleeveIn: "23",
      shoulderCm: "40",
      waistCm: "81",
      bustCm: "101",
      hipsCm: "106",
      sleeveCm: "58",
    },
    {
      label: "L",
      shoulderIn: "15",
      waistIn: "31",
      bustIn: "39",
      hipsIn: "40",
      sleeveIn: "22.5",
      shoulderCm: "38",
      waistCm: "78",
      bustCm: "99",
      hipsCm: "101",
      sleeveCm: "57",
    },
    {
      label: "M",
      shoulderIn: "14.5",
      waistIn: "29",
      bustIn: "37",
      hipsIn: "38",
      sleeveIn: "22",
      shoulderCm: "37",
      waistCm: "73",
      bustCm: "94",
      hipsCm: "96",
      sleeveCm: "55",
    },
    {
      label: "S",
      shoulderIn: "14",
      waistIn: "27",
      bustIn: "35",
      hipsIn: "36",
      sleeveIn: "21.5",
      shoulderCm: "35",
      waistCm: "68",
      bustCm: "90",
      hipsCm: "91",
      sleeveCm: "54",
    },
    {
      label: "XS",
      shoulderIn: "14",
      waistIn: "25",
      bustIn: "34",
      hipsIn: "35",
      sleeveIn: "21",
      shoulderCm: "34",
      waistCm: "63",
      bustCm: "86",
      hipsCm: "88",
      sleeveCm: "53",
    },
  ]

  // Function to calculate the smallest price from all sizes
  const getSmallestPrice = (sizes: ProductSize[]) => {
    if (!sizes || sizes.length === 0) return 0

    const prices = sizes.map(size => size.discountedPrice || size.originalPrice || 0)
    return Math.min(...prices.filter(price => price > 0))
  }

  // Function to calculate the smallest original price from all sizes
  const getSmallestOriginalPrice = (sizes: ProductSize[]) => {
    if (!sizes || sizes.length === 0) return 0

    const prices = sizes.map(size => size.originalPrice || 0)
    return Math.min(...prices.filter(price => price > 0))
  }

  const { dispatch: cartDispatch } = useCart()
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites()
  const { formatPrice, showPrices } = useCurrencyFormatter()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)

  // Use cached products instead of fetching
  useEffect(() => {
    if (!cacheLoading) {
      setProducts(allProducts as Product[])
      setLoading(false)
    }
  }, [cacheLoading, allProducts])

  // Reset page when branch changes
  useEffect(() => {
    if (branch) {
      setPage(1)
    }
  }, [branch])

  // Debounce search query for better UX
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), 250)
    return () => clearTimeout(handle)
  }, [searchQuery])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showSizeSelector || showGiftPackageSelector) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [showSizeSelector, showGiftPackageSelector])



  const openSizeSelector = (product: Product) => {
    setSelectedProduct(product)
    setSelectedSize(null)
    setQuantity(1)
    setShowSizeSelector(true)
    setIsCustomSizeMode(true)
    resetMeasurements()
  }

  const closeSizeSelector = () => {
    setShowSizeSelector(false)
    setTimeout(() => {
      setSelectedProduct(null)
      setSelectedSize(null)
      resetMeasurements()
      setIsCustomSizeMode(true)
      setMeasurementUnit("cm")
      setConfirmMeasurements(false)
    }, 300)
  }

  // WhatsApp ordering removed — using cart-based checkout


  const addToCart = () => {
    // Handled by QuickAddModal
  }

  const getMinPrice = (product: Product) => {
    return getSmallestPrice(product.sizes);
  }

  // Smarter search with normalization, tokenization and relevance scoring
  const filteredProducts = useMemo(() => {
    const normalize = (value: string) =>
      (value || "")
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

    const q = normalize(debouncedQuery.trim())
    if (!q) return products

    const terms = q.split(/\s+/).filter(Boolean)

    const scoreProduct = (p: Product) => {
      const name = normalize(p.name)
      const description = normalize(p.description)
      const sizesText = normalize(
        (p.sizes || []).map(s => `${s.size} ${s.volume}`).join(' ')
      )

      let score = 0

      // Full phrase boosts
      if (name === q) score += 8
      if (name.startsWith(q)) score += 5
      if (name.includes(q)) score += 3
      if (description.includes(q)) score += 2
      if (sizesText.includes(q)) score += 2

      // Token-based scoring
      for (const t of terms) {
        if (!t) continue
        if (name === t) score += 4
        else if (name.startsWith(t)) score += 3
        else if (name.includes(t)) score += 2
        if (description.includes(t)) score += 1
        if (sizesText.includes(t)) score += 2
      }

      // Light boosts
      if (p.isBestseller) score += 0.5
      if (p.isNew) score += 0.25

      // Slight rating factor
      score += Math.min(Math.max(p.rating || 0, 0), 5) * 0.05

      return score
    }

    const scored = products.map(p => ({ p, s: scoreProduct(p) }))
    const kept = scored.filter(x => x.s > 0)
    kept.sort((a, b) => b.s - a.s)
    return kept.map(x => x.p)
  }, [products, debouncedQuery])

  const details = collectionDetails[branch as keyof typeof collectionDetails];

  if (!details) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="pt-28 md:pt-24 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-medium mb-4">branch not found</h1>
            <Link href="/wedding/products">
              <Button className="bg-black text-white hover:bg-gray-800">
                Back to Wedding
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      <QuickAddModal
        product={selectedProduct as any}
        isOpen={showSizeSelector}
        onClose={closeSizeSelector}
        sizeChart={sizeChart}
      />

      {/* Hero Section */}
      <section className="pt-24 md:pt-20 pb-6 bg-rose-50">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl mx-auto text-center"
          >
            <Link
              href="/wedding/products"
              className="inline-flex items-center justify-center text-xs md:text-sm font-medium text-gray-500 hover:text-gray-800 mb-4 transition-colors"
            >
              <ArrowLeft className="mr-2 h-3.5 w-3.5" />
              Back to Wedding Collection
            </Link>

            <h1
              className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900"
              style={{ fontFamily: 'var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)' }}
            >
              {t(details.titleKey)}
            </h1>
            <p className="mt-3 text-sm md:text-base text-gray-500 max-w-2xl mx-auto leading-relaxed">
              {t(details.descKey)}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Search + Products Grid */}
      <section className="pt-6 pb-16">
        <div className="container mx-auto px-6">
          <div className="mb-10 max-w-2xl mx-auto">
            <label htmlFor="branch-search" className="sr-only">Search products</label>
            <div className="relative group">
              <div
                className={`pointer-events-none absolute inset-y-0 flex items-center text-gray-400 transition-colors duration-200 ${settings.language === "ar" ? "right-5" : "left-5"
                  }`}
              >
                <Search className="h-4 w-4" />
              </div>
              <Input
                id="branch-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${t(details.titleKey)}...`}
                className={`w-full rounded-full border border-gray-200 bg-white/90
                  py-3 text-sm md:text-base tracking-wide
                  focus-visible:ring-0 focus-visible:border-black
                  placeholder:text-gray-400 transition-colors duration-200
                  ${settings.language === "ar"
                    ? "pr-11 pl-5 text-right placeholder:text-right"
                    : "pl-11 pr-5"
                  }
                `}
              />
            </div>
            <div className="mt-4 text-sm text-gray-500 text-center">
              {debouncedQuery
                ? `Showing ${filteredProducts.length} of ${products.length}`
                : `Showing all ${products.length} products`}
            </div>
          </div>
          {(debouncedQuery && filteredProducts.length === 0 && products.length > 0) ? (
            <div className="text-center py-16">
              <p className="text-gray-600 text-lg">No products match your search.</p>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-600 text-lg">No products found in this branch.</p>
              <Link href="/wedding/products">
                <Button className="mt-4 bg-black text-white hover:bg-gray-800">Browse Wedding Collection</Button>
              </Link>
            </div>
          ) : (
            <>
              <div id="products-grid" className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 md:gap-8">

                {filteredProducts
                  .slice((page - 1) * CATEGORY_PAGE_SIZE, page * CATEGORY_PAGE_SIZE)
                  .map((product, index) => {
                    const isGift = product.isGiftPackage
                    const price = isGift
                      ? product.packagePrice || 0
                      : (isRentBranch && (product as any).rentalPriceA && (product as any).rentalPriceA > 0)
                        ? (product as any).rentalPriceA
                        : getSmallestPrice(product.sizes)
                    const originalPrice = isGift
                      ? product.packageOriginalPrice || 0
                      : getSmallestOriginalPrice(product.sizes)
                    const hasDiscount = !isRentBranch && originalPrice > 0 && price > 0 && price < originalPrice

                    return (
                      <motion.div
                        key={product._id}
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: index * 0.1 }}
                        viewport={{ once: true }}
                        whileHover={{ y: -10 }}
                        className="relative h-full"
                      >
                        <div className="group relative h-full">
                          {/* Favorite Button */}
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (isFavorite(product.id)) {
                                removeFromFavorites(product.id)
                              } else {
                                addToFavorites({
                                  id: product.id,
                                  name: product.name,
                                  price,
                                  image: product.images[0],
                                  branch: product.branch,
                                  collection: product.collection,
                                  rating: product.rating,
                                  isNew: product.isNew,
                                  isBestseller: product.isBestseller,
                                  sizes: product.sizes,
                                  isGiftPackage: product.isGiftPackage,
                                  packagePrice: product.packagePrice,
                                  packageOriginalPrice: product.packageOriginalPrice,
                                  giftPackageSizes: product.giftPackageSizes,
                                  rentalPriceA: (product as any).rentalPriceA,
                                })
                              }
                            }}
                            className="absolute top-2 right-2 z-20 p-1.5 bg-white/95 rounded-full shadow-sm hover:bg-gray-100 transition-colors border border-gray-200"
                            aria-label={isFavorite(product.id) ? "Remove from favorites" : "Add to favorites"}
                          >
                            <Heart
                              className={`h-4 w-4 ${isFavorite(product.id)
                                ? "text-gray-900 fill-gray-900"
                                : "text-gray-400"
                                }`}
                            />
                          </motion.button>

                          {/* Badges - Best Sellers style */}
                          <div className="absolute top-2 left-2 z-20 space-y-1">
                            {product.isNew && (
                              <Badge className="bg-gradient-to-r from-amber-400 to-yellow-600 text-white text-[10px] px-2 py-0.5 rounded-full border-none shadow-sm">
                                New
                              </Badge>
                            )}
                            {product.isBestseller && (
                              <Badge className="bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] px-2 py-0.5 rounded-full border-none shadow-sm">
                                Best Rental
                              </Badge>
                            )}
                            {product.isOutOfStock && (
                              <Badge className="bg-gray-900 text-white text-[10px] px-2 py-0.5 rounded-full">
                                Out of Stock
                              </Badge>
                            )}
                          </div>

                          {/* Product Card - aligned with Best Sellers */}
                          <Card className="h-full rounded-2xl border border-gray-100 bg-transparent shadow-none hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                            <CardContent className="p-0 h-full">
                              <Link href={`/products/${branch}/${product.id}`} className="block relative w-full h-full">
                                <div className="relative w-full aspect-[4/7] sm:aspect-[3/5] overflow-hidden rounded-2xl bg-gray-50">
                                  <Image
                                    src={product.images[0] || "/placeholder.svg"}
                                    alt={product.name}
                                    fill
                                    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                                  />

                                  {/* Gradient overlay */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                                  {/* Bottom overlay with name, price and cart button */}
                                  <div className="absolute inset-x-2 bottom-2 text-white drop-shadow-[0_6px_12px_rgba(0,0,0,0.9)]">
                                    {/* Show prices if global showPrices is true OR if it's a sell dress in wedding/soiree */}
                                    {(() => {
                                      const showProductPrice = showPrices || product.branch === "sell-dresses"
                                      return (
                                        <>
                                          {showProductPrice ? (
                                            <h3 className="text-xs sm:text-sm font-medium mb-1 line-clamp-2">
                                              {product.name}
                                            </h3>
                                          ) : null}

                                          <div className="mt-0.5 flex items-center justify-between gap-2">
                                            {!showProductPrice ? (
                                              <div className="flex-1 min-w-0">
                                                <div className="text-sm sm:text-base font-semibold tracking-wide leading-snug line-clamp-2">
                                                  {product.name}
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="text-[11px] sm:text-xs flex flex-col items-start">
                                                {isRentBranch && (product as any).rentalPriceA && (product as any).rentalPriceA > 0 && (
                                                  <span className="text-[9px] text-purple-300 font-medium mb-0.5">
                                                    Starting at (Cat A)
                                                  </span>
                                                )}
                                                {hasDiscount ? (
                                                  <>
                                                    <span className="line-through text-gray-300 text-[10px] sm:text-xs block">
                                                      {formatPrice(originalPrice)}
                                                    </span>
                                                    <span className="text-xs sm:text-sm font-semibold">
                                                      {formatPrice(price)}
                                                    </span>
                                                  </>
                                                ) : (
                                                  <span className="text-xs sm:text-sm font-semibold">
                                                    {formatPrice(price)}
                                                  </span>
                                                )}
                                              </div>
                                            )}

                                            <Button
                                              onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()

                                                if (product.isOutOfStock) return
                                                if (product.isGiftPackage) {
                                                  setSelectedProduct(product)
                                                  setShowGiftPackageSelector(true)
                                                } else {
                                                  openSizeSelector(product)
                                                }
                                              }}
                                              className={`flex items-center justify-center rounded-full px-2.5 py-2 sm:px-3 sm:py-2 shadow-[0_4px_10px_rgba(0,0,0,0.85)] ${product.isOutOfStock
                                                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                                                : "bg-rose-100 text-rose-700 hover:bg-rose-200"
                                                }`}
                                              disabled={product.isOutOfStock}
                                              aria-label={
                                                product.isOutOfStock
                                                  ? "Out of stock"
                                                  : isRentBranch
                                                    ? "Rent Now"
                                                    : "Buy Now"
                                              }
                                            >
                                              <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-500" />
                                            </Button>
                                          </div>
                                        </>
                                      )
                                    })()}
                                  </div>
                                </div>
                              </Link>
                            </CardContent>
                          </Card>
                        </div>
                      </motion.div>
                    )
                  })}
              </div>
              {(() => {
                const clientTotalPages = Math.max(Math.ceil(filteredProducts.length / CATEGORY_PAGE_SIZE), 1)
                if (filteredProducts.length <= CATEGORY_PAGE_SIZE) return null

                const handlePageChange = (newPage: number) => {
                  setPage(newPage)
                  // Scroll to the absolute top of the window for maximum reliability across all devices
                  setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }, 100)
                }

                return (
                  <div className="flex flex-col items-center gap-4 mt-12 border-t border-gray-100 pt-8">
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => handlePageChange(page - 1)}
                        className="rounded-full px-4 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      >
                        Previous
                      </Button>

                      <div className="flex flex-wrap items-center justify-center gap-1 max-w-[210px] sm:max-w-none">
                        {Array.from({ length: Math.min(5, clientTotalPages) }, (_, i) => { let start = Math.max(1, page - 2); if (start + 4 > clientTotalPages) start = Math.max(1, clientTotalPages - 4); return start + i; }).map((p) => (
                          <Button
                            key={p}
                            variant={page === p ? "default" : "ghost"}
                            size="sm"
                            onClick={() => handlePageChange(p)}
                            className={`w-9 h-9 rounded-full p-0 transition-all duration-200 ${
                              page === p 
                                ? "bg-black text-white shadow-md scale-110" 
                                : "hover:bg-rose-50 hover:text-rose-600 text-gray-500"
                            }`}
                          >
                            {p}
                          </Button>
                        ))}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={page >= clientTotalPages}
                        onClick={() => handlePageChange(page + 1)}
                        className="rounded-full px-4 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      >
                        Next
                      </Button>
                    </div>
                    <span className="text-xs text-gray-400 uppercase tracking-widest">
                      Page {page} of {clientTotalPages} — {filteredProducts.length} total products
                    </span>
                  </div>
                )
              })()}
            </>
          )}
        </div>
      </section>

      {/* Gift Package Selector Modal */}
      {showGiftPackageSelector && selectedProduct && (
        <GiftPackageSelector
          product={selectedProduct}
          isOpen={showGiftPackageSelector}
          onClose={() => setShowGiftPackageSelector(false)}
          onToggleFavorite={(product) => {
            if (isFavorite(product.id)) {
              removeFromFavorites(product.id)
            } else {
              addToFavorites({
                id: product.id,
                name: product.name,
                price: product.packagePrice || 0,
                image: product.images[0],
                branch: product.branch,
                collection: product.collection,
                rating: product.rating,
                isNew: product.isNew || false,
                isBestseller: product.isBestseller || false,
                sizes: product.giftPackageSizes || [],
                isGiftPackage: product.isGiftPackage,
                packagePrice: product.packagePrice,
                packageOriginalPrice: product.packageOriginalPrice,
                giftPackageSizes: product.giftPackageSizes
              })
            }
          }}
          isFavorite={isFavorite}
        />
      )}

      <Footer />
    </div>
  )
}
