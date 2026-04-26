"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Star, ShoppingCart, X, Heart, Sparkles, RefreshCw, Package, Instagram, Facebook, AlertCircle, MessageCircle, ArrowRight } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { useCart } from "@/lib/cart-context"
import { useFavorites } from "@/lib/favorites-context"
import useEmblaCarousel from 'embla-carousel-react'
import { useCurrencyFormatter } from "@/hooks/use-currency"
import { useCustomSize } from "@/hooks/use-custom-size"
import type { SizeChartRow } from "@/components/custom-size-form"
import { useLocale } from "@/lib/locale-context"
import { useTranslation } from "@/lib/translations"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useProductsCache, type CachedProduct as Product, type ProductSize } from "@/lib/products-cache"

const GiftPackageSelector = dynamic(
  () => import("@/components/gift-package-selector").then((m) => m.GiftPackageSelector),
  { ssr: false }
)

const CustomSizeForm = dynamic(
  () => import("@/components/custom-size-form").then((m) => m.CustomSizeForm),
  { ssr: false }
)


// WhatsApp ordering removed — using cart-based checkout

export default function SoireeProductsPage() {
  const { products: cachedProducts, loading, refresh } = useProductsCache()
  
  // Filter for Soiree collection only
  const products = useMemo(() => {
    const target = "soiree"
    return cachedProducts.filter(p => {
      const pColl = (p.collection || "").toLowerCase().trim()
      return (pColl.includes(target) || target.includes(pColl)) && p.isActive !== false
    })
  }, [cachedProducts])

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [showSizeSelector, setShowSizeSelector] = useState(false)
  const [showGiftPackageSelector, setShowGiftPackageSelector] = useState(false)
  const [showCustomSizeConfirmation, setShowCustomSizeConfirmation] = useState(false)
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
  const { formatPrice, showPrices } = useCurrencyFormatter()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)

  // Enhanced collection theming with subtle, premium styling
  const collectionDetails = {
    "mona-saleh": {
      title: t("monaSalehCollection"),
      description: t("monaSalehDesc"),
      className: "bg-white",
      accent: "after:content-[''] after:block after:w-10 after:h-px after:bg-gray-900/80 after:mt-3 after:transition-all after:duration-300 group-hover:after:w-16",
      buttonStyle: "border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white"
    },
    "el-raey-1": {
      title: t("elRaey1Collection"),
      description: t("elRaey1Desc"),
      className: "bg-gray-50",
      accent: "after:content-[''] after:block after:w-10 after:h-px after:bg-gray-800/80 after:mt-3 after:transition-all after:duration-300 group-hover:after:w-16",
      buttonStyle: "border-gray-800 text-gray-800 hover:bg-gray-800 hover:text-white"
    },
    "el-raey-2": {
      title: t("elRaey2Collection"),
      description: t("elRaey2Desc"),
      className: "bg-white",
      accent: "after:content-[''] after:block after:w-10 after:h-px after:bg-gray-900/80 after:mt-3 after:transition-all after:duration-300 group-hover:after:w-16",
      buttonStyle: "border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white"
    },
    "el-raey-the-yard": {
      title: t("elRaeyTheYardCollection"),
      description: t("elRaeyTheYardDesc"),
      className: "bg-gray-50",
      accent: "after:content-[''] after:block after:w-10 after:h-px after:bg-gray-800/80 after:mt-3 after:transition-all after:duration-300 group-hover:after:w-16",
      buttonStyle: "border-gray-800 text-gray-800 hover:bg-gray-800 hover:text-white"
    },
    "sell-dresses": {
      title: t("sellDressesCollection"),
      description: t("sellDressesDesc"),
      className: "bg-white",
      accent: "after:content-[''] after:block after:w-10 after:h-px after:bg-gray-900/80 after:mt-3 after:transition-all after:duration-300 group-hover:after:w-16",
      buttonStyle: "border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white"
    }
  }
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

  // Embla Carousel state
  const [emblaRefMen, emblaApiMen] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    dragFree: true,
    loop: false
  })
  const [selectedIndexMen, setSelectedIndexMen] = useState(0)

  const [emblaRefWomen, emblaApiWomen] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    dragFree: true,
    loop: false
  })
  const [selectedIndexWomen, setSelectedIndexWomen] = useState(0)

  const [emblaRefPackages, emblaApiPackages] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    dragFree: true,
    loop: false
  })
  const [selectedIndexPackages, setSelectedIndexPackages] = useState(0)

  const [emblaRefOutlet, emblaApiOutlet] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    dragFree: true,
    loop: false
  })
  const [selectedIndexOutlet, setSelectedIndexOutlet] = useState(0)

  const { dispatch: cartDispatch } = useCart()
  const {
    addToFavorites,
    removeFromFavorites,
    isFavorite,
    loading: favoritesLoading
  } = useFavorites()

  type ProductCardLayout = "mobile" | "desktop"
  type ProductSection = string

  useEffect(() => {
    if (!selectedProduct) return
    if (isCustomSizeMode) {
      setSelectedSize(null)
    } else if (!selectedSize && selectedProduct.sizes.length > 0) {
      setSelectedSize(selectedProduct.sizes[0])
    }
  }, [isCustomSizeMode, selectedProduct, selectedSize])

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


  const categorizedProducts = useMemo(
    () => ({
      winter: products.filter((p) => p.branch === "mona-saleh" && p.isActive),
      summer: products.filter((p) => p.branch === "el-raey-1" && p.isActive),
      fall: products.filter((p) => p.branch === "el-raey-2" && p.isActive),
      yard: products.filter((p) => p.branch === "el-raey-the-yard" && p.isActive),
      sellDresses: products.filter((p) => p.branch === "sell-dresses" && p.isActive),
    }),
    [products]
  )

  const openSizeSelector = (product: Product) => {
    // For gift packages, open the gift package selector instead
    if (product.isGiftPackage) {
      setSelectedProduct(product)
      setShowGiftPackageSelector(true)
    } else {
      setSelectedProduct(product)
      setSelectedSize(null) // Start with no size selected - user must choose
      setQuantity(1)
      setShowSizeSelector(true)
      setIsCustomSizeMode(true) // Default to custom size mode
      resetMeasurements()
    }
  }

  const closeSizeSelector = () => {
    setShowSizeSelector(false)
    setTimeout(() => {
      setSelectedProduct(null)
      setSelectedSize(null)
      resetMeasurements()
      setIsCustomSizeMode(true)
      setConfirmMeasurements(false)
    }, 300)
  }

  // WhatsApp ordering removed — using cart-based checkout


  const addToCart = () => {
    if (!selectedProduct) return
    if (isCustomSizeMode && !isMeasurementsValid) return
    if (!isCustomSizeMode && !selectedSize) return

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

    const baseSize = selectedSize || selectedProduct.sizes[0] || {
      size: "custom",
      volume: measurementUnit,
      discountedPrice: selectedProduct.packagePrice || (selectedProduct.sizes?.[0] as ProductSize | undefined)?.discountedPrice,
      originalPrice: (selectedProduct.sizes?.[0] as ProductSize | undefined)?.originalPrice,
    }

    if (selectedProduct.branch !== "sell-dresses") {
      window.location.href = `/products/${selectedProduct.branch}/${selectedProduct.id}`
      return
    }

    cartDispatch({
      type: "ADD_ITEM",
      payload: {
        id: `${selectedProduct.id}-${isCustomSizeMode ? "custom" : baseSize.size}`,
        productId: selectedProduct.id,
        name: selectedProduct.name,
        price: baseSize.discountedPrice || baseSize.originalPrice || selectedProduct.packagePrice || 0,
        originalPrice: baseSize.originalPrice,
        size: isCustomSizeMode ? "custom" : baseSize.size,
        volume: isCustomSizeMode ? measurementUnit : baseSize.volume,
        image: selectedProduct.images[0],
        branch: selectedProduct.branch,
        stockCount: isCustomSizeMode ? undefined : baseSize.stockCount,
        quantity,
        type: "buy",
        customMeasurements: isCustomSizeMode
          ? {
            unit: measurementUnit,
            values: measurements,
          }
          : undefined,
      }
    })

    closeSizeSelector()
  }

  const toggleFavorite = async (product: any) => {
    try {
      if (isFavorite(product.id)) {
        await removeFromFavorites(product.id)
      } else {
        // For gift packages, use package price; for regular products, use smallest size price
        const price = product.isGiftPackage && product.packagePrice
          ? product.packagePrice
          : getSmallestPrice(product.sizes);

        await addToFavorites({
          id: product.id,
          name: product.name,
          price: price,
          image: product.images[0],
          branch: product.branch,
          collection: product.collection,
          rating: product.rating,
          isNew: product.isNew,
          isBestseller: product.isBestseller,
          sizes: product.sizes,
          // Add gift package fields
          isGiftPackage: product.isGiftPackage,
          packagePrice: product.packagePrice,
          packageOriginalPrice: product.packageOriginalPrice,
          giftPackageSizes: product.giftPackageSizes,
        })
      }
    } catch (error) {
      console.error("Error toggling favorite:", error)
    }
  }

  // Carousel scroll functions
  const scrollToMen = useCallback((index: number) => {
    if (!emblaApiMen) return
    emblaApiMen.scrollTo(index)
  }, [emblaApiMen])

  const scrollToWomen = useCallback((index: number) => {
    if (!emblaApiWomen) return
    emblaApiWomen.scrollTo(index)
  }, [emblaApiWomen])

  const scrollToPackages = useCallback((index: number) => {
    if (!emblaApiPackages) return
    emblaApiPackages.scrollTo(index)
  }, [emblaApiPackages])

  const scrollToOutlet = useCallback((index: number) => {
    if (!emblaApiOutlet) return
    emblaApiOutlet.scrollTo(index)
  }, [emblaApiOutlet])

  interface ProductCardProps {
    product: Product
    layout: ProductCardLayout
    section: ProductSection
    index: number
  }

  const ProductCard = ({ product, layout, section, index }: ProductCardProps) => {
    const priceData = useMemo(() => {
      if (product.isGiftPackage) {
        const price = product.packagePrice || 0
        const original = product.packageOriginalPrice || 0
        return { price, original }
      }

      const price = getSmallestPrice(product.sizes)
      const original = getSmallestOriginalPrice(product.sizes)
      return { price, original }
    }, [product])

    const hasDiscount = priceData.original > 0 && priceData.price < priceData.original

    const handleFavoriteClick = useCallback(
      async (e: any) => {
        e.stopPropagation()
        await toggleFavorite(product)
      },
      [product, toggleFavorite]
    )

    const handleAddToCartClick = useCallback(
      (e: any) => {
        e.preventDefault()
        e.stopPropagation()
        openSizeSelector(product)
      },
      [product, openSizeSelector]
    )

    const isWinter = section === "winter"
    const priceRowClassName = "mt-0.5 flex items-center justify-between gap-2"
    const priceTextWrapperClassName = "text-[11px] sm:text-xs"
    const cartIconClassName = "h-4 w-4"
    const addToCartAriaLabel =
      layout === "desktop" && product.isGiftPackage
        ? "Customize Package"
        : product.branch !== "sell-dresses"
          ? "Rent Now"
          : "Buy Now"

    const imageSizes = "(max-width: 768px) 80vw, (max-width: 1200px) 33vw, 25vw"

    return (
      <div className="group relative h-full">
        {/* Favorite Button */}
        <button
          onClick={handleFavoriteClick}
          className="absolute top-2 right-2 z-20 p-1.5 bg-white/95 rounded-full shadow-sm hover:bg-gray-100 transition-colors border border-gray-200"
          aria-label={isFavorite(product.id) ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart
            className={`h-4 w-4 ${isFavorite(product.id)
              ? "text-gray-900 fill-gray-900"
              : "text-gray-400"
              }`}
          />
        </button>

        {/* Badges - match Best Sellers design */}
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

        {/* Product Card with image overlay - aligned with Best Sellers */}
        <Card
          className={`h-full rounded-2xl border border-gray-100 bg-transparent shadow-none hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${layout === "mobile" ? "mr-4" : ""
            }`}
        >
          <CardContent className="p-0 h-full">
            <Link
              href={`/products/${product.branch}/${product.id}`}
              className="block relative w-full h-full"
            >
              <div className="relative w-full aspect-[4/7] sm:aspect-[3/5] overflow-hidden rounded-2xl bg-gray-50">
                <Image
                  src={product.images[0] || "/placeholder.svg"}
                  alt={product.name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes={imageSizes}
                  priority={index < 4}
                />

                {/* Gradient overlay for text */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                {/* Bottom overlay with name, price and cart button - mirror Best Sellers */}
                <div className="absolute inset-x-2 bottom-2 text-white drop-shadow-[0_6px_12_rgba(0,0,0,0.9)]">
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

                        <div className={priceRowClassName}>
                          {!showProductPrice ? (
                            <div className="flex-1 min-w-0">
                              <div className="text-sm sm:text-base font-semibold tracking-wide leading-snug line-clamp-2">
                                {product.name}
                              </div>
                            </div>
                          ) : (
                            <div className={priceTextWrapperClassName}>
                              {hasDiscount ? (
                                <>
                                  <span className="line-through text-gray-300 text-[10px] sm:text-xs block">
                                    {formatPrice(priceData.original)}
                                  </span>
                                  <span className="text-xs sm:text-sm font-semibold">
                                    {formatPrice(priceData.price)}
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs sm:text-sm font-semibold">
                                  {formatPrice(priceData.price)}
                                </span>
                              )}
                            </div>
                          )}

                          <Button
                            onClick={handleAddToCartClick}
                            className={`flex items-center justify-center rounded-full px-2.5 py-2 sm:px-3 sm:py-2 shadow-[0_4px_10px_rgba(0,0,0,0.85)] ${product.isOutOfStock
                              ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                              : "bg-rose-100 text-rose-700 hover:bg-rose-200"
                              }`}
                            disabled={product.isOutOfStock}
                            aria-label={addToCartAriaLabel}
                          >
                            {layout === "desktop" && product.isGiftPackage ? (
                              <Package className={cartIconClassName} />
                            ) : (
                              <ShoppingCart className={`${cartIconClassName} text-rose-500`} />
                            )}
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
    )
  }

  // Carousel event listeners
  useEffect(() => {
    if (!emblaApiMen) return
    emblaApiMen.on('select', () => {
      setSelectedIndexMen(emblaApiMen.selectedScrollSnap())
    })
  }, [emblaApiMen])

  useEffect(() => {
    if (!emblaApiWomen) return
    emblaApiWomen.on('select', () => {
      setSelectedIndexWomen(emblaApiWomen.selectedScrollSnap())
    })
  }, [emblaApiWomen])

  useEffect(() => {
    if (!emblaApiPackages) return
    emblaApiPackages.on('select', () => {
      setSelectedIndexPackages(emblaApiPackages.selectedScrollSnap())
    })
  }, [emblaApiPackages])

  useEffect(() => {
    if (!emblaApiOutlet) return
    emblaApiOutlet.on('select', () => {
      setSelectedIndexOutlet(emblaApiOutlet.selectedScrollSnap())
    })
  }, [emblaApiOutlet])

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      {/* Size Selector Modal */}
      {showSizeSelector && selectedProduct && (
        <>
          {/* Gift Package Selector */}
          {selectedProduct.isGiftPackage ? (
            <GiftPackageSelector
              product={selectedProduct}
              isOpen={showSizeSelector}
              onClose={closeSizeSelector}
              onToggleFavorite={toggleFavorite}
              isFavorite={isFavorite}
            />
          ) : (
            /* Regular Product Size Selector */
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
                      <p className="text-gray-600 text-sm">Select your size to {selectedProduct.branch !== "sell-dresses" ? "rent" : "buy"}</p>
                    </div>
                    <div className="flex">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleFavorite(selectedProduct)
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
                        sizes="80px"
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
                        setSelectedSize(size as ProductSize)
                      }}
                      formatPrice={formatPrice}
                    />
                  </div>

                  <div className="flex justify-between items-center py-4 border-t border-gray-100">
                    <div>
                      {selectedProduct ? (
                        (() => {
                          const qty = quantity;
                          const referenceSize = selectedSize || selectedProduct.sizes[0];
                          const unitOriginal = referenceSize?.originalPrice ?? selectedProduct.packagePrice ?? 0;
                          const unitDiscount = referenceSize?.discountedPrice;
                          const hasDiscount = unitDiscount !== undefined && unitDiscount < (referenceSize?.originalPrice ?? unitDiscount);
                          const totalOriginal = unitOriginal * qty;
                          const totalPrice = (hasDiscount ? unitDiscount! : unitOriginal) * qty;

                          return (
                            <div>
                              {hasDiscount ? (
                                <>
                                  <span className="line-through text-gray-400 text-lg block">{formatPrice(totalOriginal)}</span>
                                  <span className="text-xl font-medium text-red-600">{formatPrice(totalPrice)}</span>
                                </>
                              ) : (
                                <span className="text-xl font-medium">{formatPrice(totalPrice)}</span>
                              )}
                              {isCustomSizeMode && (
                                <span className="text-xs text-gray-500 mt-1 block">
                                  Custom measurements will be confirmed by our atelier concierge.
                                </span>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <span className="text-xl font-medium text-gray-400">Select a gown</span>
                      )}
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
                      className={`flex items-center rounded-full px-6 py-5 ${selectedProduct?.isOutOfStock
                        ? 'bg-gray-400 cursor-not-allowed opacity-60'
                        : 'bg-black hover:bg-gray-800'
                        }`}
                      disabled={
                        selectedProduct?.isOutOfStock ||
                        (isCustomSizeMode ? !isMeasurementsValid : !selectedSize)
                      }
                      aria-label={
                        selectedProduct?.isOutOfStock
                          ? "Out of stock"
                          : selectedProduct.branch !== "sell-dresses"
                            ? "Rent Now"
                            : "Buy Now"
                      }
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      {selectedProduct?.isOutOfStock
                        ? t("outOfStock")
                        : selectedProduct.branch !== "sell-dresses"
                          ? "Rent Now"
                          : "Buy Now"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </>
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
              <p className="text-amber-600 font-medium">{t("ifAnythingIncorrect")}</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCustomSizeConfirmation(false)}>
              {t("reviewAgain")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                addToCart()
                setShowCustomSizeConfirmation(false)
              }}
              className="bg-black hover:bg-gray-800"
            >
              Confirm {selectedProduct && selectedProduct.branch !== "sell-dresses" ? "Rent" : "Buy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hero Section */}
      <section className="pt-28 md:pt-24 pb-8 bg-rose-50">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl mx-auto text-center"
          >
            <h1
              className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900"
              style={{ fontFamily: 'var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)' }}
            >
              {t("soireeCollectionsTitle")}
            </h1>
            <p className="mt-3 text-sm md:text-base text-gray-500 max-w-2xl mx-auto">
              {t("soireeCollectionsDesc")}
            </p>
            <div className="mt-6 flex items-center justify-center">
              <Button
                onClick={refresh}
                variant="outline"
                size="lg"
                className={`rounded-full border-gray-300 text-gray-800 hover:bg-gray-50 ${settings.language === "ar" ? "flex-row-reverse" : ""
                  }`}
              >
                <RefreshCw className={`h-5 w-5 ${settings.language === "ar" ? "ml-2" : "mr-2"}`} />
                {t("refreshAllProducts")}
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Collection Section - Mona Saleh */}
      <section className={`py-16 ${collectionDetails["mona-saleh"].className} transition-colors duration-300`}>
        <div className="container mx-auto px-6 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, margin: "-50px" }}
            className="mb-12"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12">
              <div className="space-y-3 max-w-2xl">
                <div className="relative group">
                  <h2
                    className={`text-3xl md:text-[2.1rem] font-light text-gray-900 tracking-[0.06em] ${collectionDetails["mona-saleh"].accent}`}
                    style={{ fontFamily: 'var(--font-playfair-display), "Playfair Display", serif' }}
                  >
                    {collectionDetails["mona-saleh"].title}
                  </h2>
                </div>
                <p className="text-sm md:text-base text-gray-600 leading-relaxed max-w-2xl">
                  {collectionDetails["mona-saleh"].description}
                </p>
              </div>
              <Link href="/soiree/mona-saleh" className="mt-4 md:mt-0">
                <Button
                  variant="outline"
                  className={`inline-flex items-center gap-2 rounded-full border px-6 py-2 text-[0.7rem] font-medium tracking-[0.18em] uppercase ${collectionDetails["mona-saleh"].buttonStyle} transition-colors duration-300`}
                >
                  {t("viewAll")}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {/* Mobile Carousel */}
            <div className="md:hidden">
              <div className="overflow-hidden" ref={emblaRefMen}>
                <div className="flex">
                  {categorizedProducts.winter?.slice(0, 8).map((product, index) => (
                    <div key={product._id} className="flex-[0_0_80%] min-w-0 pl-4 relative h-full">
                      <ProductCard
                        product={product}
                        layout="mobile"
                        section="winter"
                        index={index}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-center mt-4 md:hidden">
                {categorizedProducts.winter?.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => scrollToMen(index)}
                    className={`w-2 h-2 mx-1 rounded-full transition-colors ${index === selectedIndexMen ? 'bg-black' : 'bg-gray-300'
                      }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Desktop Grid */}
            <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {categorizedProducts.winter?.slice(0, 8).map((product, index) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  layout="desktop"
                  section="winter"
                  index={index}
                />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Collection Section - Raey 1 */}
      <section className={`py-16 ${collectionDetails["el-raey-1"].className} transition-colors duration-300`}>
        <div className="container mx-auto px-6 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, margin: "-50px" }}
            className="mb-12"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12">
              <div className="space-y-3 max-w-2xl">
                <div className="relative group">
                  <h2
                    className={`text-3xl md:text-[2.1rem] font-light text-gray-900 tracking-[0.06em] ${collectionDetails["el-raey-1"].accent}`}
                    style={{ fontFamily: 'var(--font-playfair-display), "Playfair Display", serif' }}
                  >
                    {collectionDetails["el-raey-1"].title}
                  </h2>
                </div>
                <p className="text-sm md:text-base text-gray-600 leading-relaxed max-w-2xl">
                  {collectionDetails["el-raey-1"].description}
                </p>
              </div>
              <Link href="/soiree/el-raey-1" className="mt-4 md:mt-0">
                <Button
                  variant="outline"
                  className={`inline-flex items-center gap-2 rounded-full border px-6 py-2 text-[0.7rem] font-medium tracking-[0.18em] uppercase ${collectionDetails["el-raey-1"].buttonStyle} transition-colors duration-300`}
                >
                  {t("viewAll")}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {/* Mobile Carousel */}
            <div className="md:hidden">
              <div className="overflow-hidden" ref={emblaRefWomen}>
                <div className="flex">
                  {categorizedProducts.summer?.slice(0, 8).map((product, index) => (
                    <div key={product._id} className="flex-[0_0_80%] min-w-0 pl-4 relative h-full">
                      <ProductCard
                        product={product}
                        layout="mobile"
                        section="summer"
                        index={index}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-center mt-4 md:hidden">
                {categorizedProducts.summer?.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => scrollToWomen(index)}
                    className={`w-2 h-2 mx-1 rounded-full transition-colors ${index === selectedIndexWomen ? 'bg-black' : 'bg-gray-300'
                      }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Desktop Grid */}
            <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {categorizedProducts.summer?.slice(0, 8).map((product, index) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  layout="desktop"
                  section="summer"
                  index={index}
                />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Collection Section - Raey 2 */}
      <section className={`py-16 ${collectionDetails["el-raey-2"].className} transition-colors duration-300`}>
        <div className="container mx-auto px-6 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, margin: "-50px" }}
            className="mb-12"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12">
              <div className="space-y-3 max-w-2xl">
                <div className="relative group">
                  <h2
                    className={`text-3xl md:text-[2.1rem] font-light text-gray-900 tracking-[0.06em] ${collectionDetails["el-raey-2"].accent}`}
                    style={{ fontFamily: 'var(--font-playfair-display), "Playfair Display", serif' }}
                  >
                    {collectionDetails["el-raey-2"].title}
                  </h2>
                </div>
                <p className="text-sm md:text-base text-gray-600 leading-relaxed max-w-2xl">
                  {collectionDetails["el-raey-2"].description}
                </p>
              </div>
              <Link href="/soiree/el-raey-2" className="mt-4 md:mt-0">
                <Button
                  variant="outline"
                  className={`inline-flex items-center gap-2 rounded-full border px-6 py-2 text-[0.7rem] font-medium tracking-[0.18em] uppercase ${collectionDetails["el-raey-2"].buttonStyle} transition-colors duration-300`}
                >
                  {t("viewAll")}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {/* Mobile Carousel */}
            <div className="md:hidden">
              <div className="overflow-hidden" ref={emblaRefPackages}>
                <div className="flex">
                  {categorizedProducts.fall?.slice(0, 8).map((product, index) => (
                    <div key={product._id} className="flex-[0_0_80%] min-w-0 pl-4 relative h-full">
                      <ProductCard
                        product={product}
                        layout="mobile"
                        section="fall"
                        index={index}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-center mt-4 md:hidden">
                {categorizedProducts.fall?.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => scrollToPackages(index)}
                    className={`w-2 h-2 mx-1 rounded-full transition-colors ${index === selectedIndexPackages ? 'bg-black' : 'bg-gray-300'
                      }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Desktop Grid */}
            <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {categorizedProducts.fall?.map((product, index) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  layout="desktop"
                  section="fall"
                  index={index}
                />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Collection Section - Raey The Yard */}
      <section className={`py-16 ${collectionDetails["el-raey-the-yard"].className} transition-colors duration-300`}>
        <div className="container mx-auto px-6 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, margin: "-50px" }}
            className="mb-12"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12">
              <div className="space-y-3 max-w-2xl">
                <div className="relative group">
                  <h2
                    className={`text-3xl md:text-[2.1rem] font-light text-gray-900 tracking-[0.06em] ${collectionDetails["el-raey-the-yard"].accent}`}
                    style={{ fontFamily: 'var(--font-playfair-display), "Playfair Display", serif' }}
                  >
                    {collectionDetails["el-raey-the-yard"].title}
                  </h2>
                </div>
                <p className="text-sm md:text-base text-gray-600 leading-relaxed max-w-2xl">
                  {collectionDetails["el-raey-the-yard"].description}
                </p>
              </div>
              <Link href="/soiree/el-raey-the-yard" className="mt-4 md:mt-0">
                <Button
                  variant="outline"
                  className={`inline-flex items-center gap-2 rounded-full border px-6 py-2 text-[0.7rem] font-medium tracking-[0.18em] uppercase ${collectionDetails["el-raey-the-yard"].buttonStyle} transition-colors duration-300`}
                >
                  {t("viewAll")}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {/* Mobile Carousel */}
            <div className="md:hidden">
              <div className="overflow-hidden" ref={emblaRefOutlet}>
                <div className="flex">
                  {categorizedProducts.yard?.slice(0, 8).map((product, index) => (
                    <div key={product._id} className="flex-[0_0_80%] min-w-0 pl-4 relative h-full">
                      <ProductCard
                        product={product}
                        layout="mobile"
                        section="yard"
                        index={index}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-center mt-4 md:hidden">
                {categorizedProducts.yard?.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => scrollToOutlet(index)}
                    className={`w-2 h-2 mx-1 rounded-full transition-colors ${index === selectedIndexOutlet ? 'bg-black' : 'bg-gray-300'
                      }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Desktop Grid */}
            <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {categorizedProducts.yard?.slice(0, 8).map((product, index) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  layout="desktop"
                  section="yard"
                  index={index}
                />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Collection Section - Sell Dresses */}
      <section className={`py-16 ${collectionDetails["sell-dresses"].className} transition-colors duration-300`}>
        <div className="container mx-auto px-6 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, margin: "-50px" }}
            className="mb-12"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12">
              <div className="space-y-3 max-w-2xl">
                <div className="relative group">
                  <h2
                    className={`text-3xl md:text-[2.1rem] font-light text-gray-900 tracking-[0.06em] ${collectionDetails["sell-dresses"].accent}`}
                    style={{ fontFamily: 'var(--font-playfair-display), "Playfair Display", serif' }}
                  >
                    {collectionDetails["sell-dresses"].title}
                  </h2>
                </div>
                <p className="text-sm md:text-base text-gray-600 leading-relaxed max-w-2xl">
                  {collectionDetails["sell-dresses"].description}
                </p>
              </div>
              <Link href="/soiree/sell-dresses" className="mt-4 md:mt-0">
                <Button
                  variant="outline"
                  className={`inline-flex items-center gap-2 rounded-full border px-6 py-2 text-[0.7rem] font-medium tracking-[0.18em] uppercase ${collectionDetails["sell-dresses"].buttonStyle} transition-colors duration-300`}
                >
                  {t("viewAll")}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {/* Mobile Carousel */}
            <div className="md:hidden">
              <div className="overflow-hidden">
                <div className="flex">
                  {categorizedProducts.sellDresses?.slice(0, 8).map((product, index) => (
                    <div key={product._id} className="flex-[0_0_80%] min-w-0 pl-4 relative h-full">
                      <ProductCard
                        product={product}
                        layout="mobile"
                        section="sell-dresses"
                        index={index}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Desktop Grid */}
            <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {categorizedProducts.sellDresses?.slice(0, 8).map((product, index) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  layout="desktop"
                  section="sell-dresses"
                  index={index}
                />
              ))}
            </div>
          </motion.div>
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

      {/* Footer */}
      <Footer />

      {/* Decorative floating elements */}
      <motion.div
        animate={{ y: [0, -15, 0], rotate: [0, 5, 0] }}
        transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        className="fixed bottom-8 left-8 z-10"
      >
        <Sparkles className="h-6 w-6 text-purple-400" />
      </motion.div>

      <motion.div
        animate={{ y: [0, 15, 0], rotate: [0, -5, 0] }}
        transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        className="fixed top-1/4 right-8 z-10"
      >
        <Sparkles className="h-4 w-4 text-pink-400" />
      </motion.div>
    </div>
  )
}
