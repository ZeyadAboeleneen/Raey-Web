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

const QuickAddModal = dynamic(
  () => import("@/components/quick-add-modal").then((m) => m.QuickAddModal),
  { ssr: false }
)


// WhatsApp ordering removed — using cart-based checkout

export default function WeddingProductsPage() {
  const { products: cachedProducts, loading, refresh } = useProductsCache()
  
  // Filter for Wedding collection only
  const products = useMemo(() => {
    const target = "wedding"
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
    if (showSizeSelector || showGiftPackageSelector) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [showSizeSelector, showGiftPackageSelector])


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
    // This function is now handled by QuickAddModal for regular products
    // We can keep it if needed for other parts or remove it if unused
  }

  const toggleFavorite = async (product: any) => {
    try {
      if (isFavorite(product.id)) {
        await removeFromFavorites(product.id)
      } else {
        // For gift packages, use package price; for regular products, use smallest size price
        const price = product.isGiftPackage && product.packagePrice
          ? product.packagePrice
          : (product.branch !== "sell-dresses" && product.rentalPriceA && product.rentalPriceA > 0)
            ? product.rentalPriceA
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
          isGiftPackage: product.isGiftPackage,
          packagePrice: product.packagePrice,
          packageOriginalPrice: product.packageOriginalPrice,
          giftPackageSizes: product.giftPackageSizes,
          rentalPriceA: product.rentalPriceA,
          rentalPriceC: product.rentalPriceC,
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

      const price = (product.branch !== "sell-dresses" && product.rentalPriceA && product.rentalPriceA > 0)
        ? product.rentalPriceA
        : getSmallestPrice(product.sizes)
      const original = getSmallestOriginalPrice(product.sizes)
      return { price, original }
    }, [product])

    const hasDiscount = product.branch === "sell-dresses" && priceData.original > 0 && priceData.price < priceData.original

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
                  {(() => {
                    const showProductPrice = showPrices || product.branch === "sell-dresses"
                    const clientRentalPrice = product.branch !== "sell-dresses" && product.rentalPriceC && product.rentalPriceC > 0 ? product.rentalPriceC : null
                    return (
                      <>
                        {(showProductPrice || clientRentalPrice) ? (
                          <h3 className="text-xs sm:text-sm font-medium mb-1 line-clamp-2">
                            {product.name}
                          </h3>
                        ) : null}

                        <div className={priceRowClassName}>
                          {(!showProductPrice && !clientRentalPrice) ? (
                            <div className="flex-1 min-w-0">
                              <div className="text-sm sm:text-base font-semibold tracking-wide leading-snug line-clamp-2">
                                {product.name}
                              </div>
                            </div>
                          ) : !showProductPrice && clientRentalPrice ? (
                            <div className={`${priceTextWrapperClassName} flex flex-col items-start`}>
                              <span className="text-[9px] text-rose-300 font-medium mb-0.5">
                                Starting from
                              </span>
                              <span className="text-xs sm:text-sm font-semibold">
                                {formatPrice(clientRentalPrice)}
                              </span>
                            </div>
                          ) : (
                            <div className={`${priceTextWrapperClassName} flex flex-col items-start`}>
                              {product.branch !== "sell-dresses" && product.rentalPriceA && product.rentalPriceA > 0 && (
                                <span className="text-[9px] text-purple-300 font-medium mb-0.5">
                                  Starting at (Cat A)
                                </span>
                              )}
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

      <QuickAddModal
        product={selectedProduct}
        isOpen={showSizeSelector}
        onClose={closeSizeSelector}
        sizeChart={sizeChart}
      />

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
              {t("weddingCollectionsTitle")}
            </h1>
            <p className="mt-3 text-sm md:text-base text-gray-500 max-w-2xl mx-auto">
              {t("weddingCollectionsDesc")}
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
              <Link href="/wedding/mona-saleh" className="mt-4 md:mt-0">
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
              <Link href="/wedding/el-raey-1" className="mt-4 md:mt-0">
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
              <Link href="/wedding/el-raey-2" className="mt-4 md:mt-0">
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
              <Link href="/wedding/el-raey-the-yard" className="mt-4 md:mt-0">
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
              <Link href="/wedding/sell-dresses" className="mt-4 md:mt-0">
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
