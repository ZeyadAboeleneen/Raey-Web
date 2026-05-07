"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Star, ShoppingCart, X, Heart, AlertCircle, Search, ChevronDown, Package, ArrowRight, Sparkles, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import dynamic from "next/dynamic"

// Lazy load heavy components for faster initial render
const Navigation = dynamic(() => import("@/components/navigation").then(mod => ({ default: mod.Navigation })), {
  ssr: true,
})

const Footer = dynamic(() => import("@/components/footer").then(mod => ({ default: mod.Footer })), {
  ssr: true,
})

const QuickAddModal = dynamic(
  () => import("@/components/quick-add-modal").then((m) => m.QuickAddModal),
  { ssr: false }
)
import { useCart } from "@/lib/cart-context"
import { useFavorites } from "@/lib/favorites-context"
import useEmblaCarousel from 'embla-carousel-react'
import { GiftPackageSelector } from "@/components/gift-package-selector"
import { useCurrencyFormatter } from "@/hooks/use-currency"
import { useCustomSize } from "@/hooks/use-custom-size"
import { useTranslation } from "@/lib/translations"
import { useLocale } from "@/lib/locale-context"
import { useSiteSettings } from "@/lib/site-settings-context"
import { CustomSizeForm, SizeChartRow } from "@/components/custom-size-form"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useProductsCache, type CachedProduct as Product, type ProductSize } from "@/lib/products-cache"
import { useToast } from "@/hooks/use-toast"
import { useDateFilteredProducts } from "@/hooks/use-date-filtered-products"



const PAGE_SIZE = 12
// WhatsApp ordering removed — using cart-based checkout

const PRICE_RANGES = [
  { label: "4,000 – 6,000", min: 4000, max: 6000 },
  { label: "6,000 – 8,000", min: 6000, max: 8000 },
  { label: "8,000 – 10,000", min: 8000, max: 10000 },
  { label: "10,000 – 12,000", min: 10000, max: 12000 },
  { label: "12,000+", min: 12000, max: Infinity },
]

const COLLECTIONS_FILTER = [
  { slug: "mona-saleh", label: "Hay El-Gamaa" },
  { slug: "el-raey-1", label: "El Mashaya 1" },
  { slug: "el-raey-2", label: "El Mashaya 2" },
  { slug: "el-raey-the-yard", label: "The yard cairo" },
  { slug: "sell-dresses", label: "Sell Dresses" },
]
export default function WeddingPage() {
  const { products: cachedProducts, loading: cacheLoading, getBestsellers } = useProductsCache()
  const allProducts = useMemo(() => {
    const target = "wedding"
    return cachedProducts.filter(p => {
      const pColl = (p.collection || "").toLowerCase().trim()
      return pColl === target
    })
  }, [cachedProducts])

  // Show loading state only if we have NO products at all
  const isLoading = cacheLoading && cachedProducts.length === 0
  const bestSellers = useMemo(() => {
    const target = "wedding"
    return getBestsellers().filter(p => {
      const pColl = (p.collection || "").toLowerCase().trim()
      return pColl === target
    })
  }, [getBestsellers])
  const bestSellersRent = bestSellers
  const newProducts = useMemo(() => allProducts.filter((p) => p.isNew), [allProducts])

  const [visibleNewCount, setVisibleNewCount] = useState(10)
  const [visibleBestCount, setVisibleBestCount] = useState(10)

  const displayedNewProducts = useMemo(() => newProducts.slice(0, visibleNewCount), [newProducts, visibleNewCount])
  const displayedBestProducts = useMemo(() => bestSellersRent.slice(0, visibleBestCount), [bestSellersRent, visibleBestCount])

  const bestSellersRef = useRef<HTMLElement>(null)
  const newProductsRef = useRef<HTMLElement>(null)
  const allProductsRef = useRef<HTMLElement>(null)

  const [emblaRefNew, emblaApiNew] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", dragFree: true })
  const [emblaRefBest, emblaApiBest] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", dragFree: true })

  const [canScrollPrevNew, setCanScrollPrevNew] = useState(false)
  const [canScrollNextNew, setCanScrollNextNew] = useState(false)
  const [canScrollPrevBest, setCanScrollPrevBest] = useState(false)
  const [canScrollNextBest, setCanScrollNextBest] = useState(false)

  const updateNewScrollButtons = useCallback(() => {
    if (!emblaApiNew) return
    setCanScrollPrevNew(emblaApiNew.canScrollPrev())
    setCanScrollNextNew(emblaApiNew.canScrollNext())
  }, [emblaApiNew])

  const updateBestScrollButtons = useCallback(() => {
    if (!emblaApiBest) return
    setCanScrollPrevBest(emblaApiBest.canScrollPrev())
    setCanScrollNextBest(emblaApiBest.canScrollNext())
  }, [emblaApiBest])

  useEffect(() => {
    if (!emblaApiNew) return
    updateNewScrollButtons()
    emblaApiNew.on('select', updateNewScrollButtons)
    emblaApiNew.on('reInit', updateNewScrollButtons)
  }, [emblaApiNew, updateNewScrollButtons])

  useEffect(() => {
    if (!emblaApiBest) return
    updateBestScrollButtons()
    emblaApiBest.on('select', updateBestScrollButtons)
    emblaApiBest.on('reInit', updateBestScrollButtons)
  }, [emblaApiBest, updateBestScrollButtons])

  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [selectedCollection, setSelectedCollection] = useState("")
  const [selectedPriceRanges, setSelectedPriceRanges] = useState<number[]>([])
  const [page, setPage] = useState(1)

  const [newsletterEmail, setNewsletterEmail] = useState("")
  const [isSubscribing, setIsSubscribing] = useState(false)
  const { toast } = useToast()

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null)
  const [showSizeSelector, setShowSizeSelector] = useState(false)
  const [showGiftPackageSelector, setShowGiftPackageSelector] = useState(false)
  const [showCustomSizeConfirmation, setShowCustomSizeConfirmation] = useState(false)

  const {
    isCustomSizeMode, setIsCustomSizeMode,
    measurementUnit, setMeasurementUnit,
    measurements, handleMeasurementChange,
    confirmMeasurements, setConfirmMeasurements,
    resetMeasurements, isMeasurementsValid,
  } = useCustomSize()

  const { dispatch: cartDispatch } = useCart()
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites()
  const router = useRouter()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)
  const { heroImages } = useSiteSettings()
  const { formatPrice, showPrices } = useCurrencyFormatter()

  const sizeChart: SizeChartRow[] = [
    { label: "XL", shoulderIn: "16", waistIn: "32", bustIn: "40", hipsIn: "42", sleeveIn: "23", shoulderCm: "40", waistCm: "81", bustCm: "101", hipsCm: "106", sleeveCm: "58" },
    { label: "L", shoulderIn: "15", waistIn: "31", bustIn: "39", hipsIn: "40", sleeveIn: "22.5", shoulderCm: "38", waistCm: "78", bustCm: "99", hipsCm: "101", sleeveCm: "57" },
    { label: "M", shoulderIn: "14.5", waistIn: "29", bustIn: "37", hipsIn: "38", sleeveIn: "22", shoulderCm: "37", waistCm: "73", bustCm: "94", hipsCm: "96", sleeveCm: "55" },
    { label: "S", shoulderIn: "14", waistIn: "27", bustIn: "35", hipsIn: "36", sleeveIn: "21.5", shoulderCm: "35", waistCm: "68", bustCm: "90", hipsCm: "91", sleeveCm: "54" },
    { label: "XS", shoulderIn: "14", waistIn: "25", bustIn: "34", hipsIn: "35", sleeveIn: "21", shoulderCm: "34", waistCm: "63", bustCm: "86", hipsCm: "88", sleeveCm: "53" },
  ]

  const getSmallestPrice = (sizes: ProductSize[]) => {
    if (!sizes || sizes.length === 0) return 0
    const prices = sizes.map(s => s.discountedPrice || s.originalPrice || 0)
    return Math.min(...prices.filter(p => p > 0))
  }

  const getSmallestOriginalPrice = (sizes: ProductSize[]) => {
    if (!sizes || sizes.length === 0) return 0
    const prices = sizes.map(s => s.originalPrice || 0)
    return Math.min(...prices.filter(p => p > 0))
  }

  const getProductPrice = (product: Product) => {
    if (product.isGiftPackage) return product.packagePrice || 0
    const isRent = product.branch !== "sell-dresses"
    if (isRent) {
      if (showPrices && (product as any).rentalPriceA && (product as any).rentalPriceA > 0) return (product as any).rentalPriceA
      if (!showPrices && (product as any).rentalPriceC && (product as any).rentalPriceC > 0) return (product as any).rentalPriceC
    }
    return getSmallestPrice(product.sizes)
  }

  const isRentBranch = (branchSlug: string | null) => branchSlug !== "sell-dresses"

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), 250)
    return () => clearTimeout(handle)
  }, [searchQuery])

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, selectedCollection, selectedPriceRanges])

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

  useEffect(() => {
    if (!selectedProduct) return
    if (isCustomSizeMode) {
      setSelectedSize(null)
    } else if (!selectedSize && selectedProduct.sizes.length > 0) {
      setSelectedSize(selectedProduct.sizes[0])
    }
  }, [isCustomSizeMode, selectedProduct, selectedSize])

  const togglePriceRange = (index: number) => {
    setSelectedPriceRanges(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index])
  }

  const handleNewsletterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = newsletterEmail.trim()
    if (!email) {
      toast({ title: t("stayUpdated"), description: t("enterValidEmail") })
      return
    }
    try {
      setIsSubscribing(true)
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || (data && data.error)) {
        toast({ title: t("stayUpdated"), description: (data && data.error) || t("newsletterError") })
        return
      }
      setNewsletterEmail("")
      toast({
        title: t("stayUpdated"),
        description: data && data.alreadySubscribed ? t("newsletterAlreadySubscribed") : t("newsletterSuccess")
      })
    } catch (error) {
      console.error("Newsletter error:", error)
      toast({ title: t("stayUpdated"), description: t("newsletterError") })
    } finally {
      setIsSubscribing(false)
    }
  }

  const candidateProducts = useMemo(() => {
    let result = allProducts
    if (selectedCollection) result = result.filter(p => p.branch === selectedCollection)
    if (debouncedQuery.trim()) {
      const normalize = (v: string) => (v || "").toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const q = normalize(debouncedQuery.trim())
      const terms = q.split(/\s+/).filter(Boolean)
      const score = (p: Product) => {
        const n = normalize(p.name)
        const d = normalize(p.description)
        let s = 0
        if (n === q) s += 8
        if (n.startsWith(q)) s += 5
        if (n.includes(q)) s += 3
        if (d.includes(q)) s += 2
        for (const t of terms) {
          if (n.includes(t)) s += 2
          if (d.includes(t)) s += 1
        }
        if (p.isBestseller) s += 0.5
        if (p.isNew) s += 0.25
        return s
      }
      const scored = result.map(p => ({ p, s: score(p) }))
      result = scored.filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.p)
    }
    return result
  }, [allProducts, selectedCollection, debouncedQuery])

  const { sortedProducts, isAvailable, dynamicPrices, loadingPrices, fetchPricesForPage, fetchPricesForIds, occasionDate } = useDateFilteredProducts(candidateProducts)

  const finalFilteredProducts = useMemo(() => {
    let result = sortedProducts
    if (selectedPriceRanges.length > 0) {
      result = result.filter(p => {
        const isRent = p.branch !== "sell-dresses"
        const dynamicPrice = (occasionDate && isRent && !p.isGiftPackage) ? dynamicPrices[p.id] : null
        const price = dynamicPrice ?? getProductPrice(p)
        return selectedPriceRanges.some(i => {
          const r = PRICE_RANGES[i]
          return price >= r.min && price < r.max
        })
      })
    }
    return result
  }, [sortedProducts, selectedPriceRanges, dynamicPrices, occasionDate, showPrices])

  const totalPages = Math.max(Math.ceil(finalFilteredProducts.length / PAGE_SIZE), 1)
  const paginatedProducts = finalFilteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    if (occasionDate && candidateProducts.length > 0) {
      // Eagerly fetch ALL candidate prices if a date is selected
      const ids = candidateProducts
        .filter(p => p.branch !== "sell-dresses" && !p.isGiftPackage)
        .map(p => p.id)
      fetchPricesForIds(ids)
    }
  }, [occasionDate, candidateProducts, fetchPricesForIds])

  useEffect(() => {
    // Also keep the page-based fetch as a fallback / to refresh visible items
    fetchPricesForPage(paginatedProducts)
  }, [paginatedProducts, fetchPricesForPage])

  const openSizeSelector = (product: Product) => {
    if (product.isGiftPackage) {
      setSelectedProduct(product)
      setShowGiftPackageSelector(true)
    } else {
      setSelectedProduct(product)
      setSelectedSize(null)
      setShowSizeSelector(true)
      setIsCustomSizeMode(true)
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
      setMeasurementUnit("cm")
      setConfirmMeasurements(false)
    }, 300)
  }

  // WhatsApp ordering removed — using cart-based checkout


  const addToCart = () => {
    // Handled by QuickAddModal
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    setTimeout(() => {
      allProductsRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 100)
  }

  const handleFavoriteClick = (e: React.MouseEvent, product: Product) => {
    e.preventDefault()
    e.stopPropagation()
    if (isFavorite(product.id)) {
      removeFromFavorites(product.id)
    } else {
      const isRentBranch = product.branch !== "sell-dresses"
    const price = product.isGiftPackage ? (product.packagePrice || 0) : (isRentBranch && (product as any).rentalPriceA && (product as any).rentalPriceA > 0) ? (product as any).rentalPriceA : getSmallestPrice(product.sizes)
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
        rentalPriceA: (product as any).rentalPriceA ?? undefined,
        rentalPriceC: (product as any).rentalPriceC ?? undefined,
      })
    }
  }

  const renderProductCard = (product: Product, index: number) => {
    const isGift = product.isGiftPackage
    const isRentBranch = product.branch !== "sell-dresses"
    
    // Dynamic price logic
    let exactDynamicPrice: number | null = null
    if (occasionDate && isRentBranch && !isGift) {
      if (dynamicPrices[product.id]) {
        exactDynamicPrice = dynamicPrices[product.id]
      }
    }

    const price = isGift ? product.packagePrice || 0 : (exactDynamicPrice || ((isRentBranch && (product as any).rentalPriceA && (product as any).rentalPriceA > 0) ? (product as any).rentalPriceA : getSmallestPrice(product.sizes)))
    const originalPrice = isGift ? product.packageOriginalPrice || 0 : getSmallestOriginalPrice(product.sizes)
    const hasDiscount = !isRentBranch && originalPrice > 0 && price > 0 && price < originalPrice

    const showProductPrice = showPrices || product.branch === "sell-dresses"
    const clientRentalPrice = exactDynamicPrice || (isRentBranch && (product as any).rentalPriceC && (product as any).rentalPriceC > 0 ? (product as any).rentalPriceC : null)

    const available = isAvailable(product)

    return (
      <motion.div key={product._id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.05 }} viewport={{ once: true }} className={!available ? "opacity-60 grayscale hover:grayscale-0 transition-all duration-300" : ""}>
        <Card className="h-full rounded-2xl border border-gray-100 bg-transparent shadow-none hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <CardContent className="p-0 h-full">
            <Link href={`/products/${product.branch}/${product.id || product._id}`} className="block relative w-full h-full">
              <div className="relative w-full aspect-[4/7] sm:aspect-[3/5] overflow-hidden rounded-2xl bg-gray-50">
                <Image src={product.images[0] || "/placeholder.svg"} alt={product.name} fill sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
                <button onClick={(e) => handleFavoriteClick(e, product)} className="absolute top-2 right-2 z-20 p-1.5 bg-white/95 rounded-full shadow-sm hover:bg-gray-100 transition-colors border border-gray-200 pointer-events-auto">
                  <Heart className={`h-4 w-4 ${isFavorite(product.id) ? "text-gray-900 fill-gray-900" : "text-gray-400"}`} />
                </button>
                <div className="absolute top-2 left-2 z-20 space-y-1">
                  {!available && <Badge className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full border-none shadow-sm">Not Available</Badge>}
                  {product.isNew && available && <Badge className="bg-gradient-to-r from-amber-400 to-yellow-600 text-white text-[10px] px-2 py-0.5 rounded-full border-none shadow-sm">New</Badge>}
                  {product.isBestseller && available && <Badge className="bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] px-2 py-0.5 rounded-full border-none shadow-sm">{t("bestRental")}</Badge>}
                  {product.isOutOfStock && available && <Badge className="bg-gray-900 text-white text-[10px] px-2 py-0.5 rounded-full">{t("outOfStock")}</Badge>}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute inset-x-2 bottom-2 text-white drop-shadow-[0_6px_12px_rgba(0,0,0,0.9)]">
                  {(showProductPrice || clientRentalPrice) ? (
                    <h3 className="text-xs sm:text-sm font-medium mb-1 line-clamp-2">{product.name}</h3>
                  ) : null}
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    {(!showProductPrice && !clientRentalPrice) ? (
                      <div className="flex-1 min-w-0">
                        <div className="text-sm sm:text-base font-semibold tracking-wide leading-snug line-clamp-2">
                          {product.name}
                        </div>
                      </div>
                    ) : !showProductPrice && clientRentalPrice ? (
                      <div className="text-[11px] sm:text-xs flex flex-col items-start">
                        <span className="text-[9px] text-rose-300 font-medium mb-0.5">
                          {exactDynamicPrice ? "" : "Starting from"}
                        </span>
                        <span className="text-xs sm:text-sm font-semibold">
                          {(occasionDate && !exactDynamicPrice && !loadingPrices) ? (
                            <span className="animate-pulse text-gray-300 text-[10px]">Calculating...</span>
                          ) : formatPrice(clientRentalPrice)}
                        </span>
                      </div>
                    ) : (
                      <div className="text-[11px] sm:text-xs flex flex-col items-start">
                        {isRentBranch && (product as any).rentalPriceA && (product as any).rentalPriceA > 0 && !exactDynamicPrice && (
                          <span className="text-[9px] text-rose-300 font-medium mb-0.5">
                            Starting at (Cat A)
                          </span>
                        )}
                        {hasDiscount ? (
                          <>
                            <span className="line-through text-gray-300 text-[10px] sm:text-xs block">{formatPrice(originalPrice)}</span>
                            <span className="text-xs sm:text-sm font-semibold">{formatPrice(price)}</span>
                          </>
                        ) : (
                          <span className="text-xs sm:text-sm font-semibold">
                            {(occasionDate && !exactDynamicPrice && !loadingPrices && isRentBranch && !isGift) ? (
                              <span className="animate-pulse text-gray-300 text-[10px]">Calculating...</span>
                            ) : formatPrice(price)}
                          </span>
                        )}
                      </div>
                    )}
                    <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!product.isOutOfStock && available) openSizeSelector(product) }} className={`flex items-center justify-center rounded-full px-2.5 py-2 sm:px-3 sm:py-2 shadow-[0_4px_10px_rgba(0,0,0,0.85)] ${(!available || product.isOutOfStock) ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-rose-100 text-rose-700 hover:bg-rose-200"} pointer-events-auto`} disabled={product.isOutOfStock || !available}>
                      <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-500" />
                    </Button>
                  </div>
                </div>
              </div>
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  // Show skeleton loader only on initial load with no data
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 h-16 animate-pulse" />
        <div className="h-[60vh] md:h-[70vh] bg-gray-200 animate-pulse" />
        <div className="container mx-auto px-6 py-16">
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-[4/7] bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      <QuickAddModal
        product={selectedProduct}
        isOpen={showSizeSelector}
        onClose={closeSizeSelector}
        sizeChart={sizeChart}
      />

      {showGiftPackageSelector && selectedProduct && (
        <GiftPackageSelector product={selectedProduct} isOpen={showGiftPackageSelector} onClose={() => setShowGiftPackageSelector(false)}
          onToggleFavorite={(product) => { if (isFavorite(product.id)) { removeFromFavorites(product.id) } else { addToFavorites({ id: product.id, name: product.name, price: product.packagePrice || 0, image: product.images[0], branch: product.branch, collection: product.collection, rating: product.rating, isNew: product.isNew || false, isBestseller: product.isBestseller || false, sizes: product.giftPackageSizes || [], isGiftPackage: product.isGiftPackage, packagePrice: product.packagePrice, packageOriginalPrice: product.packageOriginalPrice, giftPackageSizes: product.giftPackageSizes }) } }}
          isFavorite={isFavorite} />
      )}

      {/* ─── Hero ─── */}
      <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="relative h-[60vh] md:h-[70vh] flex items-center justify-center overflow-hidden">
        <motion.div className="absolute inset-0 z-0" animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 15, ease: "easeInOut", repeat: Infinity }}>
          <Image src={heroImages.wedding} alt="Wedding background" fill priority sizes="100vw" className="object-cover object-[center_35%]" />
          <div className="absolute inset-0 bg-black/45" />
        </motion.div>
        <motion.div className="relative z-10 max-w-3xl mx-auto px-4 text-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-5xl sm:text-6xl md:text-8xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-rose-200 to-white mb-8 leading-[1.2] pb-4">{t("weddingCollectionsTitle")}</h1>
          <p className="text-sm sm:text-base text-gray-200 max-w-2xl mx-auto">{t("weddingCollectionsDesc")}</p>
        </motion.div>
      </motion.section>

      {/* ─── New Collection ─── */}
      {newProducts.length > 0 && (
        <motion.section ref={newProductsRef} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.6 }} viewport={{ once: true, amount: 0.3 }} className="py-16 bg-gray-50 overflow-hidden">
          <div className="container mx-auto px-6">
            <div className="flex items-end justify-between mb-10">
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-2xl md:text-3xl font-semibold tracking-[0.35em] uppercase bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 bg-clip-text text-transparent mb-4 font-serif">{t("newArrivals")}</h2>
                <p className="text-gray-600 max-w-2xl text-sm md:text-base">{t("newArrivalsDesc")}</p>
              </div>
            </div>

            <div className="relative group/carousel">
              <div className="absolute top-1/2 -left-4 sm:-left-6 -translate-y-1/2 z-10">
                <Button variant="outline" size="icon" className={`rounded-full h-10 w-10 border-rose-500 bg-rose-500 text-white shadow-md transition-all ${!canScrollPrevNew ? 'opacity-0 scale-90 pointer-events-none' : 'hover:bg-rose-600 hover:text-white hover:border-rose-600 group-hover/carousel:opacity-100'}`} onClick={() => emblaApiNew?.scrollPrev()} disabled={!canScrollPrevNew}><ChevronLeft className="h-6 w-6" /></Button>
              </div>
              <div className="absolute top-1/2 -right-4 sm:-right-6 -translate-y-1/2 z-10">
                <Button variant="outline" size="icon" className={`rounded-full h-10 w-10 border-rose-500 bg-rose-500 text-white shadow-md transition-all ${!canScrollNextNew ? 'opacity-0 scale-90 pointer-events-none' : 'hover:bg-rose-600 hover:text-white hover:border-rose-600 group-hover/carousel:opacity-100'}`} onClick={() => emblaApiNew?.scrollNext()} disabled={!canScrollNextNew}><ChevronRight className="h-6 w-6" /></Button>
              </div>

              <div className="overflow-hidden cursor-grab active:cursor-grabbing" ref={emblaRefNew}>
                <div className="flex -ml-4">
                  {displayedNewProducts.map((product, index) => (
                    <div key={product._id} className="flex-[0_0_45%] sm:flex-[0_0_30%] md:flex-[0_0_25%] lg:flex-[0_0_20%] xl:flex-[0_0_18%] min-w-0 pl-4 h-full">
                      {renderProductCard(product as Product, index)}
                    </div>
                  ))}

                  {newProducts.length > visibleNewCount && (
                    <div className="flex-[0_0_45%] sm:flex-[0_0_30%] md:flex-[0_0_25%] lg:flex-[0_0_20%] xl:flex-[0_0_18%] min-w-0 pl-4 h-full self-stretch">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setVisibleNewCount(prev => prev + 10)}
                        className="w-full h-full min-h-[300px] flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl bg-white/50 hover:bg-white hover:border-black transition-all group"
                      >
                        <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 group-hover:bg-black group-hover:text-white transition-colors">
                          <Plus className="h-6 w-6" />
                        </div>
                        <span className="text-sm font-medium tracking-wide uppercase">{t("viewAll")}</span>
                        <span className="text-xs text-gray-500 mt-1">{newProducts.length - visibleNewCount} more</span>
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      )}

      {/* ─── Best Rental ─── */}
      <motion.section ref={bestSellersRef} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.6 }} viewport={{ once: true, amount: 0.3 }} className="py-16 bg-white overflow-hidden">
        <div className="container mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} viewport={{ once: true }} className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[0.35em] uppercase bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 bg-clip-text text-transparent mb-4 font-serif">{t("bestRental")}</h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base">{t("bestRentalDesc")}</p>
          </motion.div>

          {bestSellersRent.length === 0 && !cacheLoading ? (
            <div className="flex justify-center py-10 text-gray-500 text-sm">{t("noBestRentals")}</div>
          ) : (
            <div className="relative group/carousel">
              <div className="absolute top-1/2 -left-4 sm:-left-6 -translate-y-1/2 z-10">
                <Button variant="outline" size="icon" className={`rounded-full h-10 w-10 border-rose-500 bg-rose-500 text-white shadow-md transition-all ${!canScrollPrevBest ? 'opacity-0 scale-90 pointer-events-none' : 'hover:bg-rose-600 hover:text-white hover:border-rose-600 group-hover/carousel:opacity-100'}`} onClick={() => emblaApiBest?.scrollPrev()} disabled={!canScrollPrevBest}><ChevronLeft className="h-6 w-6" /></Button>
              </div>
              <div className="absolute top-1/2 -right-4 sm:-right-6 -translate-y-1/2 z-10">
                <Button variant="outline" size="icon" className={`rounded-full h-10 w-10 border-rose-500 bg-rose-500 text-white shadow-md transition-all ${!canScrollNextBest ? 'opacity-0 scale-90 pointer-events-none' : 'hover:bg-rose-600 hover:text-white hover:border-rose-600 group-hover/carousel:opacity-100'}`} onClick={() => emblaApiBest?.scrollNext()} disabled={!canScrollNextBest}><ChevronRight className="h-6 w-6" /></Button>
              </div>
              <div className="overflow-hidden cursor-grab active:cursor-grabbing" ref={emblaRefBest}>
                <div className="flex -ml-4">
                  {displayedBestProducts.map((product, index) => (<div key={product._id} className="flex-[0_0_45%] sm:flex-[0_0_30%] md:flex-[0_0_25%] lg:flex-[0_0_20%] xl:flex-[0_0_18%] min-w-0 pl-4 h-full">{renderProductCard(product as Product, index)}</div>))}
                  {bestSellersRent.length > visibleBestCount && (
                    <div className="flex-[0_0_45%] sm:flex-[0_0_30%] md:flex-[0_0_25%] lg:flex-[0_0_20%] xl:flex-[0_0_18%] min-w-0 pl-4 h-full self-stretch">
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setVisibleBestCount(prev => prev + 10)} className="w-full h-full min-h-[300px] flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl bg-white/50 hover:bg-white hover:border-black transition-all group"><div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 group-hover:bg-black group-hover:text-white transition-colors"><Plus className="h-6 w-6" /></div><span className="text-sm font-medium tracking-wide uppercase">{t("viewAll")}</span><span className="text-xs text-gray-500 mt-1">{bestSellersRent.length - visibleBestCount} more</span></motion.button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.section>

      {/* ─── All Products ─── */}
      <section ref={allProductsRef} className="pt-8 pb-16 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} viewport={{ once: true }} className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[0.35em] uppercase bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 bg-clip-text text-transparent mb-4 font-serif">{t("allProducts")}</h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base">{t("allProductsDesc")}</p>
          </motion.div>
          <div className="mb-8 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 max-w-4xl mx-auto">
              <div className="relative flex-1"><div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-gray-400"><Search className="h-4 w-4" /></div><Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("searchProducts")} className="w-full rounded-full border border-gray-200 bg-white/90 py-3 pl-11 pr-5 text-sm tracking-wide focus-visible:ring-0 focus-visible:border-black placeholder:text-gray-400 transition-colors" /></div>
              <div className="relative sm:w-56"><select value={selectedCollection} onChange={(e) => setSelectedCollection(e.target.value)} className="w-full appearance-none rounded-full border border-gray-200 bg-white/90 py-3 pl-5 pr-10 text-sm tracking-wide focus:outline-none focus:border-black transition-colors cursor-pointer"><option value="">{t("allCollections")}</option>{COLLECTIONS_FILTER.map(c => (<option key={c.slug} value={c.slug}>{c.label}</option>))}</select><ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /></div>
            </div>
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                <motion.button type="button" onClick={() => setSelectedPriceRanges([])} whileTap={{ scale: 0.97 }} className={`inline-flex items-center justify-center h-[38px] sm:h-[40px] px-4 sm:px-5 rounded-full text-[11px] sm:text-xs tracking-wide uppercase font-medium border transition-all duration-300 cursor-pointer select-none ${selectedPriceRanges.length === 0 ? "bg-rose-400 text-white border-rose-400 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-rose-50 hover:border-rose-200"}`}>{t("allPrices")}</motion.button>
                {PRICE_RANGES.map((range, idx) => (<motion.button key={idx} type="button" onClick={() => togglePriceRange(idx)} whileTap={{ scale: 0.97 }} className={`inline-flex items-center justify-center h-[38px] sm:h-[40px] px-4 sm:px-5 rounded-full text-[11px] sm:text-xs tracking-wide uppercase font-medium border transition-all duration-300 cursor-pointer select-none ${selectedPriceRanges.includes(idx) ? "bg-rose-400 text-white border-rose-400 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-rose-50 hover:border-rose-200"}`}>{range.label}</motion.button>))}
              </div>
            </div>
            <div className="text-center text-sm text-gray-500">
              {debouncedQuery || selectedCollection || selectedPriceRanges.length > 0
                ? t("showingProducts", { count: finalFilteredProducts.length, total: allProducts.length })
                : t("showingAllProducts", { total: allProducts.length })}
            </div>
          </div>
          {finalFilteredProducts.length === 0 && !cacheLoading ? (<div className="text-center py-16"><p className="text-gray-600 text-lg">{t("noProductsFound")}</p><Button onClick={() => { setSearchQuery(""); setSelectedCollection(""); setSelectedPriceRanges([]) }} className="mt-4 bg-black text-white hover:bg-gray-800 rounded-full">{t("clearFilters")}</Button></div>) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 md:gap-6">{paginatedProducts.map((product, index) => renderProductCard(product as Product, index))}</div>
              {finalFilteredProducts.length > PAGE_SIZE && (
                <div className="flex flex-col items-center gap-4 mt-12 border-t border-gray-100 pt-8">
                  <div className="flex items-center justify-center gap-2">
                    <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => handlePageChange(page - 1)} className="rounded-full px-4 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30">{t("previous")}</Button>
                    <div className="flex flex-wrap items-center justify-center gap-1 max-w-[210px] sm:max-w-none">{Array.from({ length: Math.min(5, totalPages) }, (_, i) => { let start = Math.max(1, page - 2); if (start + 4 > totalPages) start = Math.max(1, totalPages - 4); return start + i; }).map((p) => (<Button key={p} variant={page === p ? "default" : "ghost"} size="sm" onClick={() => handlePageChange(p)} className={`w-9 h-9 rounded-full p-0 transition-all duration-200 ${page === p ? "bg-black text-white shadow-md scale-110" : "hover:bg-rose-50 hover:text-rose-600 text-gray-500"}`}>{p}</Button>))}</div>
                    <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)} className="rounded-full px-4 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30">{t("next")}</Button>
                  </div>
                  <span className="text-xs text-gray-400 uppercase tracking-widest">{t("page")} {page} {t("of")} {totalPages} — {finalFilteredProducts.length} {t("totalProducts")}</span>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ─── Newsletter ─── */}
      <section className="py-10 md:py-16 bg-rose-50">
        <div className="container mx-auto px-4 sm:px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} viewport={{ once: true }} className="max-w-md mx-auto text-center px-2">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold text-gray-900 mb-2 sm:mb-3">{t("stayUpdated")}</h2>
            <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-8 max-w-md mx-auto">{t("subscribeForOffers")}</p>
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full max-w-xs sm:max-w-md mx-auto">
              <input type="email" placeholder={t("yourEmail")} className="flex-1 px-4 py-2 sm:py-3 text-sm sm:text-base rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent" value={newsletterEmail} onChange={(e) => setNewsletterEmail(e.target.value)} disabled={isSubscribing} required />
              <button type="submit" className="bg-rose-400 text-white text-sm sm:text-base px-4 sm:px-6 py-2 sm:py-3 rounded-full hover:bg-rose-500 transition-colors whitespace-nowrap disabled:opacity-70 disabled:cursor-not-allowed" disabled={isSubscribing}>{isSubscribing ? t("saving") : t("subscribe")}</button>
            </form>
            <p className="text-xs text-gray-500 mt-2 sm:mt-3 px-2">{t("subscribeDisclaimer")}</p>
          </motion.div>
        </div>
      </section>

      {/* ─── About Preview ─── */}
      <motion.section initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.6 }} viewport={{ once: true, amount: 0.3 }} className="py-20 bg-white overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }} viewport={{ once: true }} className="order-1 md:order-2">
              <h2 className="text-3xl md:text-4xl font-light tracking-wider mb-6">{t("whyChooseRaey")}</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">{t("whyChooseRaeyDesc")}</p>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
                <div className="flex items-start space-x-3"><div className="mt-1 rounded-full bg-rose-100 text-rose-600 p-2"><Sparkles className="h-4 w-4" /></div><div><h3 className="text-sm font-semibold tracking-wide uppercase">{t("signatureDesigns")}</h3><p className="text-sm text-gray-600">{t("signatureDesignsDesc")}</p></div></div>
                <div className="flex items-start space-x-3"><div className="mt-1 rounded-full bg-rose-100 text-rose-600 p-2"><Star className="h-4 w-4" /></div><div><h3 className="text-sm font-semibold tracking-wide uppercase">{t("premiumQuality")}</h3><p className="text-sm text-gray-600">{t("premiumQualityDesc")}</p></div></div>
                <div className="flex items-start space-x-3"><div className="mt-1 rounded-full bg-rose-100 text-rose-600 p-2"><Package className="h-4 w-4" /></div><div><h3 className="text-sm font-semibold tracking-wide uppercase">{t("flexibleChoices")}</h3><p className="text-sm text-gray-600">{t("flexibleChoicesDesc")}</p></div></div>
              </div>
              <Link href="/about"><Button variant="outline" className="border-black text-black hover:bg-black hover:text-white bg-transparent rounded-full px-6 py-5 group relative overflow-hidden"><span className="relative z-10">{t("learnMoreAboutUs")}</span><ArrowRight className="ml-2 h-4 w-4 relative z-10 text-rose-400" /></Button></Link>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }} viewport={{ once: true }} className="order-2 md:order-1">
              <div className="w-full h-64 md:h-96 relative"><Image src="/elraey-bg.PNG" alt="Raey Background" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover rounded-lg" priority /></div>
            </motion.div>
          </div>
        </div>
      </motion.section>

      <Footer />
    </div>
  )
}
