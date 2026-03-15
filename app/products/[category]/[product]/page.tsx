"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import dynamic from "next/dynamic"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Calendar } from "@/components/ui/calendar"
import { ArrowLeft, Star, Heart, ShoppingCart, Truck, Shield, RotateCcw, ChevronDown, X, Package, Instagram, Facebook, ChevronLeft, ChevronRight, AlertCircle, MessageCircle } from "lucide-react"
import { useParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { useCart } from "@/lib/cart-context"
import { useFavorites } from "@/lib/favorites-context"
import { useAuth } from "@/lib/auth-context"
import { useCurrencyFormatter } from "@/hooks/use-currency"
import { useCustomSize } from "@/hooks/use-custom-size"
import { toast } from "@/hooks/use-toast"
import { useTranslation } from "@/lib/translations"
import { useLocale } from "@/lib/locale-context"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import type { SizeChartRow } from "@/components/custom-size-form"
import { useProductsCache } from "@/lib/products-cache"

const GiftPackageSelector = dynamic(
  () => import("@/components/gift-package-selector").then((m) => m.GiftPackageSelector),
  { ssr: false }
)

const CustomSizeForm = dynamic(
  () => import("@/components/custom-size-form").then((m) => m.CustomSizeForm),
  { ssr: false }
)

interface ProductDetail {
  _id: string
  id: string
  name: string
  description: string
  longDescription: string
  sizes: {
    originalPrice?: number;
    discountedPrice?: number;
    stockCount?: number;
  }[]
  images: string[]
  rating: number
  reviews: number
  notes: { top: string[]; middle: string[]; base: string[] }
  category: string
  isNew?: boolean
  isBestseller?: boolean
  isOutOfStock?: boolean
  isActive?: boolean
  isGiftPackage?: boolean
  packagePrice?: number
  packageOriginalPrice?: number
  giftPackageSizes?: any[]
}

interface Review {
  _id: string
  productId: string
  originalProductId?: string
  userId: string
  userName: string
  rating: number
  comment: string
  orderId: string
  createdAt: string
}

const collectionDetails: { [key: string]: { titleKey: any } } = {
  "mona-saleh": { titleKey: "monaSalehCollection" },
  "el-raey-1": { titleKey: "elRaey1Collection" },
  "el-raey-2": { titleKey: "elRaey2Collection" },
  "el-raey-the-yard": { titleKey: "elRaeyTheYardCollection" },
  "sell-dresses": { titleKey: "sellDressesCollection" },
}

const WHATSAPP_NUMBER = "201094448044"

const getValidImages = (images?: string[] | null) => {
  if (!images || images.length === 0) return []
  return images.filter((img) => {
    if (!img) return false
    if (img === "/placeholder.svg") return false
    if (img.startsWith("data:") || img.startsWith("blob:")) return false
    return true
  })
}

export default function ProductDetailPage() {
  const { category, product: productId } = useParams() as { category: string; product: string }
  const isRentCategory = category !== "sell-dresses"
  const { getById, getByCategory, loading: cacheLoading } = useProductsCache()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSize, setSelectedSize] = useState<number>(0)
  const [selectedImage, setSelectedImage] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [occasionDate, setOccasionDate] = useState<Date | undefined>(undefined)

  const { dispatch } = useCart()
  const { state: favoritesState, addToFavorites, removeFromFavorites } = useFavorites()
  const { formatPrice, showPrices } = useCurrencyFormatter()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)
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

  const [reviews, setReviews] = useState<Review[]>([])
  const [relatedProducts, setRelatedProducts] = useState<ProductDetail[]>([])
  const { state: authState } = useAuth()
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(null)
  const [showSizeSelector, setShowSizeSelector] = useState(false)
  const [selectedRelatedSize, setSelectedRelatedSize] = useState<any>(null)
  const [showGiftPackageSelector, setShowGiftPackageSelector] = useState(false)
  const [showRelatedGiftPackageSelector, setShowRelatedGiftPackageSelector] = useState(false)
  const [showMainProductSizeSelector, setShowMainProductSizeSelector] = useState(false)
  const [showCustomSizeConfirmation, setShowCustomSizeConfirmation] = useState(false)
  const [showRelatedCustomSizeConfirmation, setShowRelatedCustomSizeConfirmation] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [showFullDescription, setShowFullDescription] = useState(false)
  const validImages = getValidImages(product?.images)
  const touchStartXRef = useRef<number | null>(null)
  const lastScrollTimeRef = useRef<number>(0)

  const goToPrevImage = () => {
    setSelectedImage(prev => {
      const images = validImages.length ? validImages : (product?.images || [])
      if (!images.length) return 0
      return (prev - 1 + images.length) % images.length
    })
  }

  const goToNextImage = () => {
    setSelectedImage(prev => {
      const images = validImages.length ? validImages : (product?.images || [])
      if (!images.length) return 0
      return (prev + 1) % images.length
    })
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Debounce to avoid skipping many images on trackpads
    const now = Date.now()
    if (now - lastScrollTimeRef.current < 200) return
    lastScrollTimeRef.current = now

    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      // Vertical scroll
      if (e.deltaY > 0) {
        goToNextImage()
      } else {
        goToPrevImage()
      }
      e.preventDefault()
    } else if (Math.abs(e.deltaX) > 0) {
      // Horizontal scroll
      if (e.deltaX > 0) {
        goToNextImage()
      } else {
        goToPrevImage()
      }
      e.preventDefault()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      goToNextImage()
    } else if (e.key === 'ArrowLeft') {
      goToPrevImage()
    }
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current
    if (startX == null) return
    const endX = e.changedTouches[0]?.clientX ?? startX
    const deltaX = endX - startX
    const threshold = 40
    if (Math.abs(deltaX) >= threshold) {
      if (deltaX < 0) {
        goToNextImage()
      } else {
        goToPrevImage()
      }
    }
    touchStartXRef.current = null
  }

  // Calculate the smallest price from all sizes
  const getSmallestPrice = (sizes: ProductDetail['sizes']) => {
    if (!sizes || sizes.length === 0) return 0

    const prices = sizes.map(size => size.discountedPrice || size.originalPrice || 0)
    return Math.min(...prices.filter(price => price > 0))
  }

  // Calculate the smallest original price from all sizes
  const getSmallestOriginalPrice = (sizes: ProductDetail['sizes']) => {
    if (!sizes || sizes.length === 0) return 0

    const prices = sizes.map(size => size.originalPrice || 0)
    return Math.min(...prices.filter(price => price > 0))
  }

  const isFavorite = (productId: string) => {
    return favoritesState.items.some(item => item.id === productId)
  }

  // Helper function to get the selected price
  const getSelectedPrice = () => {
    if (!product || !product.sizes || product.sizes.length === 0) return 0
    const selectedSizeObj = product.sizes[selectedSize]
    return selectedSizeObj?.discountedPrice || selectedSizeObj?.originalPrice || 0
  }

  const openWhatsAppOrder = () => {
    if (!product) return

    const isRent = isRentCategory
    const actionVerb = isRent ? "rent" : "buy"
    const now = new Date()
    const requestDate = now.toLocaleString()

    const imagesForMessage = validImages.length ? validImages : (product.images || [])
    const baseImage = imagesForMessage[0]

    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const imageUrl = baseImage
      ? baseImage.startsWith("http")
        ? baseImage
        : `${origin}${baseImage}`
      : ""

    let message = `Hello, I'd like to ${actionVerb} this dress.\n\n`
    message += `Name: ${product.name}\n`
    message += `Dress Code: ${product.id}\n`
    message += `Category: ${product.category}\n\n`

    if (isCustomSizeMode) {
      message += `Size Mode: Custom (${measurementUnit})\n`
      message += `Measurements:\n`
      Object.entries(measurements || {}).forEach(([key, value]) => {
        if (value == null || value === "") return
        message += `- ${key}: ${value} ${measurementUnit}\n`
      })
      message += `\n`
    } else if (product.sizes && product.sizes.length > 0 && selectedSize >= 0) {
      const selectedSizeObj: any = product.sizes[selectedSize] as any
      if (selectedSizeObj) {
        message += `Selected Size:\n`
        if (selectedSizeObj.size) {
          message += `- Size: ${selectedSizeObj.size}\n`
        }
        if (selectedSizeObj.volume) {
          message += `- Volume: ${selectedSizeObj.volume}\n`
        }
        message += `\n`
      }
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

  // Handle adding to cart with custom size support
  const handleAddToCart = async () => {
    if (!product || product.isOutOfStock) return

    const imagesForCart = validImages.length ? validImages : (product.images || [])
    const cartImage = imagesForCart[0] || "/placeholder.svg"

    if (isCustomSizeMode) {
      // Validate custom measurements
      if (!isMeasurementsValid) {
        return
      }

      // Get price from first available size
      const firstSize = product.sizes[0]
      const price = firstSize?.discountedPrice || firstSize?.originalPrice || 0

      dispatch({
        type: "ADD_ITEM",
        payload: {
          id: `${product.id}-custom`,
          productId: product.id,
          name: product.name,
          price,
          originalPrice: firstSize?.originalPrice,
          size: "custom",
          volume: measurementUnit,
          image: cartImage,
          category: product.category,
          quantity,
          stockCount: undefined,
          customMeasurements: {
            unit: measurementUnit,
            values: measurements,
          },
        },
      })

      // Reset custom size mode
      setIsCustomSizeMode(false)
      resetMeasurements()
    } else {
      // Standard size - validate stock
      const selectedSizeObj = product.sizes[selectedSize]
      if (!selectedSizeObj) return

      // Check stock availability
      if (selectedSizeObj.stockCount !== undefined && selectedSizeObj.stockCount < quantity) {
        toast({
          variant: "destructive",
          title: "Insufficient stock",
          description: `You requested ${quantity}, but only ${selectedSizeObj.stockCount} piece${selectedSizeObj.stockCount === 1 ? "" : "s"} are available.`,
        })
        return
      }

      dispatch({
        type: "ADD_ITEM",
        payload: {
          id: `${product.id}`,
          productId: product.id,
          name: product.name,
          price: getSelectedPrice(),
          originalPrice: selectedSizeObj.originalPrice,
          size: "one-size",
          volume: undefined,
          image: cartImage,
          category: product.category,
          quantity,
          stockCount: selectedSizeObj.stockCount,
        },
      })
    }

    openWhatsAppOrder()
    setShowMainProductSizeSelector(false)
  }

  const openSizeSelector = (product: any) => {
    setSelectedProduct(product)
    setSelectedRelatedSize(null)
    setShowSizeSelector(true)
    setQuantity(1)
    setIsCustomSizeMode(true)
    resetMeasurements()
  }

  const fetchRelatedProducts = async () => {
    // Try cache first
    const cached = getByCategory(category)
    if (cached.length > 0) {
      const filtered = (cached as unknown as ProductDetail[])
        .filter((p) => p.id !== productId && p.isActive !== false)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 4)
      setRelatedProducts(filtered)
      return
    }
    try {
      // Fetch products from the same category, excluding the current product
      const response = await fetch(`/api/products?category=${category}&limit=4`)
      if (response.ok) {
        const data = await response.json()
        const filteredProducts = data
          .filter((p: ProductDetail) => p.id !== productId && p.isActive !== false)
          .sort((a: ProductDetail, b: ProductDetail) => b.rating - a.rating)
        setRelatedProducts(filteredProducts)
      }
    } catch (error) {
      console.error("Error fetching related products:", error)
    }
  }

  // Try to load from cache first, fall back to API
  useEffect(() => {
    if (!category || !productId) return

    // Try cache
    const cached = getById(productId) as unknown as ProductDetail | undefined
    if (cached) {
      setProduct(cached)
      setLoading(false)
      void fetchReviewsForProduct(cached.id)
      fetchRelatedProducts()
      return
    }

    // Cache not ready yet or product not found — fall back to API
    if (!cacheLoading) {
      // Cache has finished loading but product wasn't found, fetch from API
      fetchProduct()
      fetchRelatedProducts()
    }
  }, [category, productId, cacheLoading, getById])

  // Set custom size mode as default when product loads
  useEffect(() => {
    if (product && !product.isGiftPackage) {
      setIsCustomSizeMode(true)
      setSelectedSize(-1) // No size selected initially
      resetMeasurements()
    }
  }, [product])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showSizeSelector) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [showSizeSelector])

  const getBaseProductId = (id: string) => {
    // For gift packages with timestamp suffixes like -1756667891815, remove only the timestamp
    // The pattern seems to be: baseId-timestamp where timestamp is all numbers
    if (id.match(/-[0-9]+$/)) {
      const baseId = id.replace(/-[0-9]+$/, '');
      console.log("Original ID:", id, "Base ID (timestamp removed):", baseId);
      return baseId;
    }

    // For other cases, don't modify the ID
    console.log("Original ID:", id, "Base ID (no change):", id);
    return id;
  }

  const fetchReviewsForProduct = async (productIdFromApi: string) => {
    try {
      const baseProductId = getBaseProductId(productIdFromApi)
      console.log("Product ID from API:", productIdFromApi)
      console.log("URL product ID:", productId)
      console.log("Fetching reviews for base product ID:", baseProductId)

      const reviewsResponse = await fetch(`/api/reviews/product/${baseProductId}`)
      if (reviewsResponse.ok) {
        const reviewsData = await reviewsResponse.json()
        console.log("Fetched reviews:", reviewsData.reviews?.length || 0)
        setReviews(reviewsData.reviews || [])
      } else {
        console.error("Failed to fetch reviews:", await reviewsResponse.text())
      }
    } catch (error) {
      console.error("Error fetching reviews:", error)
    }
  }

  const fetchProduct = async () => {
    try {
      const response = await fetch(`/api/products?id=${productId}`)
      if (response.ok) {
        const data = await response.json()
        console.log("Product data:", data)
        console.log("Product ID from API:", data.id)
        console.log("URL product ID:", productId)
        setProduct(data)

        // Fire-and-forget reviews fetch so the page doesn't block on reviews
        void fetchReviewsForProduct(data.id)
      }
    } catch (error) {
      console.error("Error fetching product:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="pt-28 md:pt-24 flex items-center justify-center px-4">
          <div className="text-center">
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-t-2 border-b-2 border-rose-500 mx-auto mb-4"></div>
                <p className="text-gray-600 text-sm sm:text-base">Loading products...</p>
              </>
            ) : (
              <>
                <h1 className="text-xl sm:text-2xl font-light mb-4">Product not found</h1>
                <Link href="/products">
                  <Button className="bg-black text-white hover:bg-gray-800 text-sm sm:text-base px-4 py-2">Browse All Products</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const imagesForDisplay = validImages.length ? validImages : (product.images || [])
  const mainImage = imagesForDisplay[selectedImage] || imagesForDisplay[0] || "/placeholder.svg"

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <section className="pt-28 md:pt-24 pb-20 sm:pb-16">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-8"
          >
            <div className="flex items-center space-x-2 text-sm">
              <Link
                href="/products"
                className="text-gray-600 hover:text-black transition-colors font-medium"
              >
                Collections
              </Link>
              <span className="text-gray-400">/</span>
              {product && (
                <Link
                  href={`/products/${category}`}
                  className="text-gray-600 hover:text-black transition-colors font-medium"
                >
                  {collectionDetails[category]?.titleKey ? t(collectionDetails[category].titleKey) : category}
                </Link>
              )}
              <span className="text-gray-400">/</span>
              <span className="text-gray-900 font-medium">{product?.name}</span>
            </div>
          </motion.div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
            {/* Product Images */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-4 lg:space-y-6 order-1"
            >
              <div className="relative rounded-xl overflow-hidden bg-gray-50">
                <div
                  className="w-full h-[500px] sm:h-[600px] lg:h-[750px] relative select-none"
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                  onKeyDown={handleKeyDown}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  tabIndex={0}
                  role="img"
                  aria-label="Product image gallery. Use the arrows or thumbnails to change image."
                  style={{ userSelect: "none", touchAction: "pan-y" }}
                >
                  <Image
                    src={mainImage}
                    alt={product.name}
                    fill
                    className={`object-contain transition-all duration-300 ${isHovered ? "scale-105" : "scale-100"}`}
                  />
                </div>
              </div>
            </motion.div>
            {/* Product Info & Add to Cart */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-6 lg:space-y-8 order-2"
            >
              <div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 space-y-3 sm:space-y-0">
                  <div className="flex-1">
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-light tracking-tight mb-2">
                      {product.name}
                    </h1>
                    <p className="text-sm uppercase tracking-widest text-gray-600 mb-2">{collectionDetails[category]?.titleKey ? t(collectionDetails[category].titleKey) : category}</p>
                    <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 mb-4">
                      <div className="flex items-center">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 sm:h-5 sm:w-5 ${i < Math.floor(product.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                              }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm sm:text-base text-gray-600">
                        ({product.rating}) • {product.reviews} reviews
                      </span>
                    </div>
                  </div>
                  {showPrices ? (
                    <div className="text-2xl sm:text-3xl font-light text-left">
                      {(() => {
                        if (product.isGiftPackage && product.packagePrice) {
                          const packagePrice = product.packagePrice
                          const packageOriginalPrice = product.packageOriginalPrice || 0
                          if (packageOriginalPrice > 0 && packagePrice < packageOriginalPrice) {
                            return (
                              <div className="text-left space-y-2">
                                <div className="flex flex-col items-start">
                                  <span className="text-gray-600 text-base sm:text-lg">Package Price:</span>
                                  <div className="flex items-center space-x-3">
                                    <span className="line-through text-gray-400 text-lg">
                                      {formatPrice(packageOriginalPrice)}
                                    </span>
                                    <span className="text-xl sm:text-2xl font-bold text-red-600">
                                      {formatPrice(packagePrice)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )
                          }
                          return (
                            <div className="text-left">
                              <span className="text-gray-600 text-base sm:text-lg">Package Price:</span>
                              <span className="text-xl sm:text-2xl font-bold ml-2 text-green-600">
                                {formatPrice(packagePrice)}
                              </span>
                            </div>
                          )
                        }
                        const selectedSizeObj = product.sizes[selectedSize] || product.sizes[0]
                        const selectedPrice = selectedSizeObj?.discountedPrice || selectedSizeObj?.originalPrice || 0
                        const originalPrice = selectedSizeObj?.originalPrice || 0
                        if (originalPrice > 0 && selectedPrice < originalPrice) {
                          return (
                            <div className="flex items-center space-x-3">
                              <span className="line-through text-gray-400 text-lg sm:text-2xl">
                                {formatPrice(originalPrice || 0)}
                              </span>
                              <span className="text-red-600 font-bold text-xl sm:text-2xl">
                                {formatPrice(selectedPrice)}
                              </span>
                            </div>
                          )
                        }
                        return <span className="text-xl sm:text-2xl">{formatPrice(selectedPrice)}</span>
                      })()}
                    </div>
                  ) : null}
                </div>
                {/* Description */}
                <div className="mb-6">
                  <p className={`text-gray-700 text-sm sm:text-base leading-relaxed ${showFullDescription ? "" : "line-clamp-3"}`}>
                    {product.longDescription}
                  </p>
                  {!showFullDescription && (
                    <button
                      onClick={() => setShowFullDescription(true)}
                      className="text-sm font-medium text-black mt-3 flex items-center hover:text-gray-700 transition-colors w-full sm:w-auto justify-center sm:justify-start"
                    >
                      Read more <ChevronDown className="ml-1 h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              {/* Size selection & add to cart */}
              {!product.isGiftPackage && (
                <div className="space-y-4">
                  <h3 className="text-base sm:text-lg font-medium mb-4 text-gray-900">Select Size to {isRentCategory ? "Rent" : "Buy"}</h3>
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
                    sizes={product.sizes.map((s) => ({
                      originalPrice: s.originalPrice,
                      discountedPrice: s.discountedPrice,
                      stockCount: s.stockCount,
                    }))}
                    selectedSize={
                      isCustomSizeMode
                        ? null
                        : product.sizes[selectedSize]
                          ? {
                            originalPrice: product.sizes[selectedSize].originalPrice,
                            discountedPrice: product.sizes[selectedSize].discountedPrice,
                            stockCount: product.sizes[selectedSize].stockCount,
                          }
                          : null
                    }
                    onSelectSize={(size) => {
                      const index = product.sizes.findIndex((s) => s.originalPrice === size.originalPrice)
                      if (index >= 0) {
                        setSelectedSize(index)
                        setIsCustomSizeMode(false)
                      }
                    }}
                    formatPrice={formatPrice}
                  />
                  {isCustomSizeMode && isRentCategory && (
                    <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                      <p className="mb-2 font-medium">Select your occasion date</p>
                      <Calendar mode="single" selected={occasionDate} onSelect={setOccasionDate} />
                    </div>
                  )}
                  <div className="mt-4 flex justify-center">
                    <Button
                      className="bg-black hover:bg-gray-800 text-white px-6 py-3 rounded-full flex items-center"
                      disabled={
                        product.isOutOfStock ||
                        (!isCustomSizeMode &&
                          (selectedSize < 0 ||
                            (product.sizes[selectedSize]?.stockCount !== undefined &&
                              product.sizes[selectedSize].stockCount === 0))) ||
                        (isCustomSizeMode && !isMeasurementsValid)
                      }
                      onClick={() => {
                        if (product.isOutOfStock) return
                        if (!isCustomSizeMode) {
                          if (
                            selectedSize >= 0 &&
                            product.sizes[selectedSize]?.stockCount !== undefined &&
                            product.sizes[selectedSize].stockCount === 0
                          ) {
                            alert("Selected size is out of stock")
                            return
                          }
                          handleAddToCart()
                          return
                        }
                        if (!isMeasurementsValid) {
                          alert("Please complete your custom measurements")
                          return
                        }
                        handleAddToCart()
                      }}
                    >
                      <ShoppingCart className="mr-2 h-5 w-5" />
                      {product.isOutOfStock
                        ? "Out of Stock"
                        : isRentCategory
                          ? "Rent Now"
                          : "Buy Now"}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}