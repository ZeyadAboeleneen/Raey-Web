"use client"

import { useState, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { ArrowLeft, Star, ShoppingCart, X, Heart, Instagram, Facebook, Package, AlertCircle, MessageCircle, Search } from "lucide-react"
import { useParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
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
  category: string
  isNew?: boolean
  isBestseller?: boolean
  isOutOfStock?: boolean
  sizes: ProductSize[]
  // Gift package fields
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

const WHATSAPP_NUMBER = "201094448044"

export default function CategoryPage() {
  const { category } = useParams() as { category: string }
  const isRentCategory = category !== "sell-dresses"
  const { getByCategory, loading: cacheLoading } = useProductsCache()
  const allCategoryProducts = useMemo(() => getByCategory(category), [getByCategory, category])
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
  const { formatPrice } = useCurrencyFormatter()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)

  // Use cached products instead of fetching
  useEffect(() => {
    if (!cacheLoading) {
      setProducts(allCategoryProducts as Product[])
      setLoading(false)
    }
  }, [cacheLoading, allCategoryProducts])

  // Reset page when category changes
  useEffect(() => {
    if (category) {
      setPage(1)
    }
  }, [category])

  // Debounce search query for better UX
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), 250)
    return () => clearTimeout(handle)
  }, [searchQuery])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showSizeSelector || showGiftPackageSelector || showCustomSizeConfirmation) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [showSizeSelector, showGiftPackageSelector, showCustomSizeConfirmation])



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

  const openWhatsAppOrder = () => {
    if (!selectedProduct) return

    const isRent = isRentCategory
    const actionVerb = isRent ? "rent" : "buy"
    const now = new Date()
    const requestDate = now.toLocaleString()

    const baseImage = selectedProduct.images?.[0]
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const imageUrl = baseImage
      ? baseImage.startsWith("http")
        ? baseImage
        : `${origin}${baseImage}`
      : ""

    let message = `Hello, I'd like to ${actionVerb} this dress.\n\n`
    message += `Name: ${selectedProduct.name}\n`
    message += `Dress Code: ${selectedProduct.id}\n`
    message += `Category: ${selectedProduct.category}\n\n`

    if (isCustomSizeMode) {
      message += `Size Mode: Custom (${measurementUnit})\n`
      message += `Measurements:\n`
      Object.entries(measurements || {}).forEach(([key, value]) => {
        if (value == null || value === "") return
        message += `- ${key}: ${value} ${measurementUnit}\n`
      })
      message += `\n`
    } else if (selectedSize) {
      message += `Selected Size:\n`
      if (selectedSize.size) {
        message += `- Size: ${selectedSize.size}\n`
      }
      if (selectedSize.volume) {
        message += `- Volume: ${selectedSize.volume}\n`
      }
      message += `\n`
    }

    if (occasionDate) {
      try {
        message += `Occasion Date: ${occasionDate.toLocaleDateString()}\n`
      } catch {
        // ignore formatting errors
      }
    }

    message += `Quantity: ${quantity}\n`
    message += `Request Date: ${requestDate}\n`

    const encoded = encodeURIComponent(message)
    if (typeof window !== "undefined") {
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`, "_blank")
    }
  }

  const addToCart = () => {
    if (!selectedProduct) return
    if (!isCustomSizeMode && !selectedSize) return
    if (isCustomSizeMode && !isMeasurementsValid) return

    // Check stock for standard sizes
    if (!isCustomSizeMode && selectedSize) {
      if (selectedSize.stockCount !== undefined && selectedSize.stockCount < quantity) {
        alert(`Insufficient stock for ${selectedProduct.name} - Size ${selectedSize.size}. Available: ${selectedSize.stockCount}, Requested: ${quantity}`)
        return
      }
      if (selectedSize.stockCount !== undefined && selectedSize.stockCount === 0) {
        alert(`Size ${selectedSize.size} is out of stock`)
        return
      }
    }

    let firstSize: ProductSize | null = null
    if (selectedProduct.sizes && selectedProduct.sizes.length > 0) {
      firstSize = selectedProduct.sizes[0]
    }
    const fallbackSize: ProductSize = {
      size: "custom",
      volume: measurementUnit,
      discountedPrice: selectedProduct.packagePrice || (firstSize ? (firstSize.discountedPrice ?? 0) : 0),
      originalPrice: firstSize ? (firstSize.originalPrice ?? 0) : 0
    }
    const baseSize: ProductSize = selectedSize || firstSize || fallbackSize

    const computedPrice = baseSize.discountedPrice || baseSize.originalPrice || selectedProduct.packagePrice || 0

    cartDispatch({
      type: "ADD_ITEM",
      payload: {
        id: `${selectedProduct.id}-${isCustomSizeMode ? "custom" : baseSize.size}`,
        productId: selectedProduct.id,
        name: selectedProduct.name,
        price: computedPrice,
        originalPrice: baseSize.originalPrice,
        size: isCustomSizeMode ? "custom" : baseSize.size,
        volume: isCustomSizeMode ? measurementUnit : baseSize.volume,
        image: selectedProduct.images[0],
        category: selectedProduct.category,
        quantity,
        stockCount: isCustomSizeMode ? undefined : baseSize.stockCount,
        customMeasurements: isCustomSizeMode
          ? {
            unit: measurementUnit,
            values: measurements,
          }
          : undefined,
      }
    })

    openWhatsAppOrder()
    closeSizeSelector()
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

  const details = collectionDetails[category as keyof typeof collectionDetails];

  if (!details) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="pt-28 md:pt-24 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-medium mb-4">Category not found</h1>
            <Link href="/products">
              <Button className="bg-black text-white hover:bg-gray-800">
                Back to Collections
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

      {/* Enhanced Size Selector Modal */}
      {showSizeSelector && selectedProduct && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeSizeSelector}
        >
          <motion.div
            className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: 'pan-y' }}
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-medium">{selectedProduct.name}</h3>
                  <p className="text-gray-600 text-sm">Select your size to {isRentCategory ? "rent" : "buy"}</p>
                </div>
                <div className="flex">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isFavorite(selectedProduct.id)) {
                        removeFromFavorites(selectedProduct.id)
                      } else {
                        addToFavorites({
                          id: selectedProduct.id,
                          name: selectedProduct.name,
                          price: selectedSize ? (selectedSize.discountedPrice || selectedSize.originalPrice || 0) : getSmallestPrice(selectedProduct.sizes),
                          image: selectedProduct.images[0],
                          category: selectedProduct.category,
                          rating: selectedProduct.rating,
                          isNew: selectedProduct.isNew,
                          isBestseller: selectedProduct.isBestseller,
                          sizes: selectedProduct.sizes,
                        })
                      }
                    }}
                    className="mr-2 p-1.5 bg-white/80 backdrop-blur-sm rounded-full shadow-md hover:bg-gray-100 transition-colors"
                    aria-label={isFavorite(selectedProduct.id) ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Heart
                      className={`h-5 w-5 ${isFavorite(selectedProduct.id)
                        ? "text-red-500 fill-red-500"
                        : "text-gray-700"
                        }`}
                    />
                  </button>
                  <button
                    onClick={closeSizeSelector}
                    className="text-gray-500 hover:text-gray-700 transition-colors"
                    aria-label="Close size selector"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center mb-6">
                <div className="relative w-20 h-20 mr-4">
                  <Image
                    src={selectedProduct.images[0] || "/placeholder.svg"}
                    alt={selectedProduct.name}
                    fill
                    className="rounded-lg object-cover"
                  />
                </div>
                <div>
                  <p className="text-gray-600 text-sm line-clamp-2">
                    {selectedProduct.description}
                  </p>
                  <div className="flex items-center mt-1">
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 ${i < Math.floor(selectedProduct.rating)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-300"
                            }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-600 ml-2">
                      ({selectedProduct.rating.toFixed(1)})
                    </span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <CustomSizeForm
                  controller={{
                    isCustomSizeMode,
                    setIsCustomSizeMode,
                    measurementUnit,
                    setMeasurementUnit,
                    measurements,
                    onMeasurementChange: handleMeasurementChange,
                    confirmMeasurements,
                    setConfirmMeasurements,
                    isMeasurementsValid,
                  }}
                  sizeChart={sizeChart}
                  sizes={selectedProduct.sizes}
                  selectedSize={selectedSize}
                  onSelectSize={(size) => {
                    setIsCustomSizeMode(false)
                    setSelectedSize(size as any)
                  }}
                  formatPrice={formatPrice}
                />
                {isCustomSizeMode && isRentCategory && (
                  <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                    <p className="mb-2 font-medium">Select your occasion date</p>
                    <Calendar
                      mode="single"
                      selected={occasionDate}
                      onSelect={setOccasionDate}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center py-4 border-t border-gray-100">
                <div>
                  <span className="text-gray-600">Total:</span>
                  <div className="text-xl font-medium ml-2">
                    {(() => {
                      const qty = quantity;

                      if (selectedSize) {
                        const unitOriginal = selectedSize.originalPrice || 0;
                        const unitDiscount = selectedSize.discountedPrice || 0;
                        const hasDiscount = unitOriginal > 0 && selectedSize.discountedPrice !== undefined && unitDiscount < unitOriginal;
                        const totalOriginal = unitOriginal * qty;
                        const totalPrice = (hasDiscount ? unitDiscount : unitOriginal || unitDiscount) * qty;

                        if (hasDiscount) {
                          return (
                            <>
                              <span className="line-through text-gray-400 mr-2 text-lg">{formatPrice(totalOriginal)}</span>
                              <span className="text-red-600 font-bold">{formatPrice(totalPrice)}</span>
                            </>
                          );
                        }

                        return <>{formatPrice(totalPrice)}</>;
                      }

                      if (isCustomSizeMode && selectedProduct.sizes && selectedProduct.sizes.length > 0) {
                        const firstSize = selectedProduct.sizes[0];
                        const unitPrice = firstSize.discountedPrice || firstSize.originalPrice || 0;
                        return <>{formatPrice(unitPrice * qty)}</>;
                      }

                      const baseUnitPrice = getSmallestPrice(selectedProduct.sizes);
                      return <>{formatPrice(baseUnitPrice * qty)}</>;
                    })()}
                  </div>
                </div>

                <Button
                  onClick={() => {
                    if (!selectedProduct || selectedProduct.isOutOfStock) return
                    if (!isCustomSizeMode) {
                      addToCart()
                      return
                    }
                    if (!isMeasurementsValid) {
                      alert("Please complete your custom measurements")
                      return
                    }
                    setShowCustomSizeConfirmation(true)
                  }}
                  className={`flex items-center rounded-full px-6 py-5 ${selectedProduct?.isOutOfStock || (!isCustomSizeMode && selectedSize && selectedSize.stockCount !== undefined && selectedSize.stockCount === 0)
                    ? 'bg-gray-400 cursor-not-allowed opacity-60'
                    : 'bg-black hover:bg-gray-800'
                    }`}
                  disabled={
                    selectedProduct?.isOutOfStock ||
                    (!isCustomSizeMode && selectedSize && selectedSize.stockCount !== undefined && selectedSize.stockCount === 0) ||
                    (isCustomSizeMode ? !isMeasurementsValid : !selectedSize)
                  }
                  aria-label={
                    selectedProduct?.isOutOfStock
                      ? "Out of stock"
                      : isRentCategory
                        ? "Rent Now"
                        : "Buy Now"
                  }
                >
                  <ShoppingCart className="h-4 w-4" />
                  {selectedProduct?.isOutOfStock || (!isCustomSizeMode && selectedSize && selectedSize.stockCount !== undefined && selectedSize.stockCount === 0)
                    ? "Out of Stock"
                    : isRentCategory
                      ? "Rent Now"
                      : "Buy Now"}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Custom Size Confirmation Alert */}
      <AlertDialog open={showCustomSizeConfirmation} onOpenChange={setShowCustomSizeConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Confirm Your Custom Size
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-2">
              <p>These are the custom measurements we will use for this gown. Please review them carefully:</p>
              <div className="bg-gray-50 p-4 rounded-lg space-y-1 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span><strong>Shoulder:</strong> {measurements.shoulder} {measurementUnit}</span>
                  <span><strong>Bust:</strong> {measurements.bust} {measurementUnit}</span>
                  <span><strong>Waist:</strong> {measurements.waist} {measurementUnit}</span>
                  <span><strong>Hips:</strong> {measurements.hips} {measurementUnit}</span>
                  <span><strong>Sleeve:</strong> {measurements.sleeve} {measurementUnit}</span>
                  <span><strong>Length:</strong> {measurements.length} {measurementUnit}</span>
                </div>
              </div>
              <p className="text-amber-600 font-medium">If anything looks incorrect, choose "Review Again" to adjust your measurements before adding to cart.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCustomSizeConfirmation(false)}>
              Review Again
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                addToCart()
                setShowCustomSizeConfirmation(false)
              }}
              className="bg-black hover:bg-gray-800"
            >
              Confirm {isRentCategory ? "Rent" : "Buy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              href="/products"
              className="inline-flex items-center justify-center text-xs md:text-sm font-medium text-gray-500 hover:text-gray-800 mb-4 transition-colors"
            >
              <ArrowLeft className="mr-2 h-3.5 w-3.5" />
              Back to Collections
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
            <label htmlFor="category-search" className="sr-only">Search products</label>
            <div className="relative group">
              <div
                className={`pointer-events-none absolute inset-y-0 flex items-center text-gray-400 transition-colors duration-200 ${settings.language === "ar" ? "right-5" : "left-5"
                  }`}
              >
                <Search className="h-4 w-4" />
              </div>
              <Input
                id="category-search"
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
              <p className="text-gray-600 text-lg">No products found in this category.</p>
              <Link href="/products">
                <Button className="mt-4 bg-black text-white hover:bg-gray-800">Browse All Collections</Button>
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
                      : getSmallestPrice(product.sizes)
                    const originalPrice = isGift
                      ? product.packageOriginalPrice || 0
                      : getSmallestOriginalPrice(product.sizes)
                    const hasDiscount = originalPrice > 0 && price > 0 && price < originalPrice

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
                                  category: product.category,
                                  rating: product.rating,
                                  isNew: product.isNew,
                                  isBestseller: product.isBestseller,
                                  sizes: product.sizes,
                                  isGiftPackage: product.isGiftPackage,
                                  packagePrice: product.packagePrice,
                                  packageOriginalPrice: product.packageOriginalPrice,
                                  giftPackageSizes: product.giftPackageSizes,
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
                              <Badge className="bg-white/90 text-gray-900 text-[10px] px-2 py-0.5 rounded-full">
                                New
                              </Badge>
                            )}
                            {product.isBestseller && (
                              <Badge className="bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                                Best Seller
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
                              <Link href={`/products/${category}/${product.id}`} className="block relative w-full h-full">
                                <div className="relative w-full aspect-[4/7] sm:aspect-[3/5] overflow-hidden rounded-2xl bg-gray-50">
                                  <Image
                                    src={product.images[0] || "/placeholder.svg"}
                                    alt={product.name}
                                    fill
                                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                                  />

                                  {/* Gradient overlay */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                                  {/* Bottom overlay with name, price and cart button */}
                                  <div className="absolute inset-x-2 bottom-2 text-white drop-shadow-[0_6px_12px_rgba(0,0,0,0.9)]">
                                    <h3 className="text-xs sm:text-sm font-medium mb-1 line-clamp-2">
                                      {product.name}
                                    </h3>

                                    <div className="mt-0.5 flex items-center justify-between gap-2">
                                      <div className="text-[11px] sm:text-xs">
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
                                            : isRentCategory
                                              ? "Rent Now"
                                              : "Buy Now"
                                        }
                                      >
                                        <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-500" />
                                      </Button>
                                    </div>
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
                        {Array.from({ length: clientTotalPages }, (_, i) => i + 1).map((p) => (
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
                category: product.category,
                rating: product.rating,
                isNew: product.isNew || false,
                isBestseller: product.isBestseller || false,
                sizes: product.giftPackageSizes || [],
                isGiftPackage: product.isGiftPackage,
                packagePrice: product.packagePrice,
                packageOriginalPrice: product.packageOriginalPrice,
                giftPackageSizes: product.giftPackageSizes,
              })
            }
          }}
          isFavorite={isFavorite}
        />
      )}

      {/* Footer */}
      <Footer />
    </div>
  )
}