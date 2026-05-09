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
import { ArrowLeft, Star, Heart, ShoppingCart, Truck, Shield, RotateCcw, ChevronDown, X, Package, Instagram, Facebook, ChevronLeft, ChevronRight, AlertCircle, MessageCircle, Maximize2 } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { useCart } from "@/lib/cart-context"
import { useFavorites } from "@/lib/favorites-context"
import { useAuth } from "@/lib/auth-context"
import { useCurrencyFormatter } from "@/hooks/use-currency"
import { useCustomSize } from "@/hooks/use-custom-size"
import { toast } from "@/hooks/use-toast"
import { useTranslation, TranslationKey } from "@/lib/translations"
import { useLocale } from "@/lib/locale-context"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import type { SizeChartRow } from "@/components/custom-size-form"
import { useProductsCache } from "@/lib/products-cache"
import { useDateContext } from "@/lib/date-context"
import { calculateRentalPrice } from "@/lib/rental-pricing-calc"

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
    size: string;
    volume: string;
    originalPrice?: number;
    discountedPrice?: number;
    stockCount?: number;
  }[]
  images: string[]
  rating: number
  reviews: number
  notes: { top: string[]; middle: string[]; base: string[] }
  branch: string
  collection?: string
  isNew?: boolean
  isBestseller?: boolean
  isOutOfStock?: boolean
  isActive?: boolean
  isGiftPackage?: boolean
  packagePrice?: number
  packageOriginalPrice?: number
  giftPackageSizes?: any[]
  hasBeenRented?: boolean
  rentalPriceA?: number
  rentalPriceC?: number
  cost?: number
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

// WhatsApp ordering removed — using cart-based checkout

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
  const { branch, product: productId } = useParams() as { branch: string; product: string }
  const router = useRouter()
  const isRentBranch = branch !== "sell-dresses"
  const { getById, getByBranch, loading: cacheLoading } = useProductsCache()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSize, setSelectedSize] = useState<number>(0)
  const [selectedImage, setSelectedImage] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const { occasionDate, setOccasionDate, isOccasionPast45Days } = useDateContext()
  const [rentEventDate, setRentEventDate] = useState<Date | undefined>(occasionDate || undefined)
  const [bookedRanges, setBookedRanges] = useState<{ from: Date, to: Date }[]>([])
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [availabilityResult, setAvailabilityResult] = useState<{ available: boolean; message?: string } | null>(null)
  const [isExclusive, setIsExclusive] = useState(false)
  const [extraDayBefore, setExtraDayBefore] = useState(false)
  const [extraDayAfter, setExtraDayAfter] = useState(false)
  const [rentalPrice, setRentalPrice] = useState<{ total: number; category: string } | null>(null)
  const [rentalPriceLoading, setRentalPriceLoading] = useState(false)
  const [hasBeenRentedDb, setHasBeenRentedDb] = useState<boolean | null>(null)

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
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false)
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

  // Fetch all bookings for this product to disable dates on calendar
  const fetchBookings = async () => {
    if (!product) return
    setCheckingAvailability(true)
    try {
      const res = await fetch(`/api/items/${product.id}/availability`)
      const data = await res.json()
      if (data.bookings) {
        setBookedRanges(data.bookings.map((b: any) => ({
          from: new Date(b.from),
          to: new Date(b.to)
        })))
      }
      if (data.hasBeenRented !== undefined) {
        setHasBeenRentedDb(data.hasBeenRented)
      }
    } catch (err) {
      console.error('Failed to fetch bookings:', err)
    } finally {
      setCheckingAvailability(false)
    }
  }

  useEffect(() => {
    if (isRentBranch && product) {
      fetchBookings()
    }
  }, [product?.id, isRentBranch])

  const rentEventTime = rentEventDate?.getTime()
  const occasionTime = occasionDate?.getTime()

  // Sync FROM global occasion date TO local rentEventDate
  // This ensures that if a user selects a date from the global popup, the product page updates.
  useEffect(() => {
    if (occasionDate && (!rentEventDate || rentEventTime !== occasionTime)) {
      setRentEventDate(occasionDate)
    }
  }, [occasionTime])

  // Fetch rental price whenever date or exclusive option changes
  useEffect(() => {
    if (!isRentBranch || !product || !rentEventTime || !rentEventDate) {
      setRentalPrice(null)
      return
    }

    // --- SPECULATIVE PRICING (INSTANT) ---
    // Calculate d exactly as the server does
    const msPerDay = 1000 * 60 * 60 * 24
    const occasion = new Date(rentEventDate)
    const rentStart = new Date(occasion)
    rentStart.setDate(rentStart.getDate() - 1)
    
    const startDay = new Date(rentStart)
    startDay.setHours(0, 0, 0, 0)
    const bookDay = new Date()
    bookDay.setHours(0, 0, 0, 0)
    
    const d = Math.max(1, Math.round((startDay.getTime() - bookDay.getTime()) / msPerDay))

    // If date is past 45 days, pricing is not available online
    if (d > 45) {
      setRentalPrice(null)
      return
    }
    
    // Assume n=0 for speculative pricing
    const costBase = product.cost || (product.rentalPriceA ? product.rentalPriceA / 0.8 : 0)
    if (costBase > 0) {
      const res = calculateRentalPrice(costBase, d, 0, isExclusive)
      const extraDaysFee = ((extraDayBefore ? 1 : 0) + (extraDayAfter ? 1 : 0)) * 200
      setRentalPrice({ total: res.total + extraDaysFee, category: "Speculative" })
    }
    // -------------------------------------

    const controller = new AbortController()
    const fetchPrice = async () => {
      setRentalPriceLoading(true)
      try {
        const res = await fetch('/api/rental/pricing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: product.id,
            rentStart: startDay.toISOString(),
            rentEnd: new Date(new Date(rentStart).setDate(rentStart.getDate() + 2)).toISOString(),
            isExclusive,
          }),
          signal: controller.signal,
        })
        if (res.ok) {
          const data = await res.json()
          const extraDaysFee = ((extraDayBefore ? 1 : 0) + (extraDayAfter ? 1 : 0)) * 200
          setRentalPrice({ total: data.total + extraDaysFee, category: data.category })
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Failed to fetch rental price:', err)
        }
      } finally {
        setRentalPriceLoading(false)
      }
    }

    fetchPrice()
    return () => controller.abort()
  }, [isRentBranch, product?.id, rentEventTime, isExclusive, extraDayBefore, extraDayAfter])

  // Check if the selected rental date is more than 45 days away.
  // When true, pricing is not available online — user must contact branch via WhatsApp.
  // Uses BOTH: the in-page calendar (rentEventDate) AND the global popup date (isOccasionPast45Days).
  const isPast45Days = (() => {
    if (!isRentBranch || !rentEventDate) return false
    const msPerDay = 1000 * 60 * 60 * 24
    const rs = new Date(rentEventDate)
    rs.setDate(rs.getDate() - 1)
    const sd = new Date(rs); sd.setHours(0, 0, 0, 0)
    const bd = new Date(); bd.setHours(0, 0, 0, 0)
    const d = Math.max(1, Math.round((sd.getTime() - bd.getTime()) / msPerDay))
    return d > 45
  })()

  // Reset isExclusive if the user changes the date to one that doesn't allow exclusive hold
  useEffect(() => {
    if (!product || !isRentBranch || !isExclusive) return
    
    const isValid = (() => {
      const actuallyRented = hasBeenRentedDb !== null ? hasBeenRentedDb : product.hasBeenRented
      if (actuallyRented) return false
      if (bookedRanges.length === 0) return true
      if (!rentEventDate) return false
      const earliestBooking = Math.min(...bookedRanges.map(b => new Date(b.from).setHours(0,0,0,0)))
      const selectedDate = new Date(rentEventDate).setHours(0,0,0,0)
      return selectedDate < earliestBooking
    })()

    if (!isValid) {
      setIsExclusive(false)
    }
  }, [product, isRentBranch, bookedRanges, rentEventDate, isExclusive])

  // Check if extra days are available (not conflicting with bookings)
  const canAddExtraDayBefore = (() => {
    if (!rentEventDate || bookedRanges.length === 0) return true
    // Extra day before = eventDate - 2 (standard start is eventDate - 1)
    const extraDate = new Date(rentEventDate)
    extraDate.setDate(extraDate.getDate() - 2)
    extraDate.setHours(0, 0, 0, 0)
    for (const booking of bookedRanges) {
      const bStart = new Date(booking.from)
      bStart.setHours(0, 0, 0, 0)
      const bEnd = new Date(booking.to)
      bEnd.setHours(23, 59, 59, 999)
      if (extraDate >= bStart && extraDate <= bEnd) return false
    }
    return true
  })()

  const canAddExtraDayAfter = (() => {
    if (!rentEventDate || bookedRanges.length === 0) return true
    // Extra day after = eventDate + 2 (standard end is eventDate + 1)
    const extraDate = new Date(rentEventDate)
    extraDate.setDate(extraDate.getDate() + 2)
    extraDate.setHours(0, 0, 0, 0)
    for (const booking of bookedRanges) {
      const bStart = new Date(booking.from)
      bStart.setHours(0, 0, 0, 0)
      const bEnd = new Date(booking.to)
      bEnd.setHours(23, 59, 59, 999)
      if (extraDate >= bStart && extraDate <= bEnd) return false
    }
    return true
  })()

  // Reset extra day selections if they become unavailable
  useEffect(() => {
    if (extraDayBefore && !canAddExtraDayBefore) setExtraDayBefore(false)
    if (extraDayAfter && !canAddExtraDayAfter) setExtraDayAfter(false)
  }, [canAddExtraDayBefore, canAddExtraDayAfter])

  // Handle adding to cart with custom size support
  const handleAddToCart = async () => {
    if (!product || product.isOutOfStock) return

    // For rent items, validate dates and availability
    if (isRentBranch) {
      if (!rentEventDate) {
        toast({ variant: "destructive", title: "Select rental date", description: "Please select an event date for your rental." })
        return
      }
      if (checkingAvailability) {
        toast({ variant: "default", title: "Loading availability...", description: "Please wait while we fetch available dates." })
        return
      }
    }

    const imagesForCart = validImages.length ? validImages : (product.images || [])
    const cartImage = imagesForCart[0] || "/placeholder.svg"
    const itemType = isRentBranch ? "rent" : "buy"

    let rentStartStr: string | undefined = undefined
    let rentEndStr: string | undefined = undefined

    if (isRentBranch && rentEventDate) {
      const formatLocalDate = (d: Date) => {
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      const start = new Date(rentEventDate)
      start.setDate(start.getDate() - 1 - (extraDayBefore ? 1 : 0))
      start.setHours(0, 0, 0, 0)
      rentStartStr = formatLocalDate(start)

      const end = new Date(rentEventDate)
      end.setDate(end.getDate() + 1 + (extraDayAfter ? 1 : 0))
      end.setHours(23, 59, 59, 999)
      rentEndStr = formatLocalDate(end)

      // Synchronous double-booking prevention check
      let hasOverlap = false;
      for (const booking of bookedRanges) {
        const bStart = new Date(booking.from);
        bStart.setHours(0, 0, 0, 0);
        const bEnd = new Date(booking.to);
        bEnd.setHours(23, 59, 59, 999);

        // Same-day switchover allowable: start < bEnd && end >= bStart
        if (start < bEnd && end >= bStart) {
          hasOverlap = true;
          break;
        }
      }

      if (hasOverlap) {
        toast({ variant: "destructive", title: "Date Conflict", description: "This dress is already rented during one or more days of your required reservation window. Please select another date." })
        return
      }
    }

    if (isCustomSizeMode) {
      // Validate custom measurements
      if (!isMeasurementsValid) {
        return
      }

      // Get price from first available size
      const firstSize = product.sizes[0]
      const price = firstSize?.discountedPrice || firstSize?.originalPrice || 0

      const cartId = isRentBranch
        ? `${product.id}-custom-rent-${rentStartStr}-${rentEndStr}`
        : `${product.id}-custom`

      dispatch({
        type: "ADD_ITEM",
        payload: {
          id: cartId,
          productId: product.id,
          name: product.name,
          price: (isRentBranch && rentalPrice) ? rentalPrice.total : price,
          originalPrice: isRentBranch ? undefined : firstSize?.originalPrice,
          size: "custom",
          volume: measurementUnit,
          image: cartImage,
          branch: product.branch,
          quantity: isRentBranch ? 1 : quantity,
          stockCount: undefined,
          type: itemType,
          collection: product.collection || "",
          rentStart: rentStartStr,
          rentEnd: rentEndStr,
          isExclusive: isRentBranch ? isExclusive : undefined,
          extraDayBefore: isRentBranch ? extraDayBefore : undefined,
          extraDayAfter: isRentBranch ? extraDayAfter : undefined,
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

      // Check stock availability (buy only)
      if (!isRentBranch && selectedSizeObj.stockCount !== undefined && selectedSizeObj.stockCount < quantity) {
        toast({
          variant: "destructive",
          title: "Insufficient stock",
          description: `You requested ${quantity}, but only ${selectedSizeObj.stockCount} piece${selectedSizeObj.stockCount === 1 ? "" : "s"} are available.`,
        })
        return
      }

      const cartId = isRentBranch
        ? `${product.id}-rent-${rentStartStr}-${rentEndStr}`
        : `${product.id}`

      dispatch({
        type: "ADD_ITEM",
        payload: {
          id: cartId,
          productId: product.id,
          name: product.name,
          price: (isRentBranch && rentalPrice) ? rentalPrice.total : getSelectedPrice(),
          originalPrice: isRentBranch ? undefined : selectedSizeObj.originalPrice,
          size: "one-size",
          volume: undefined,
          image: cartImage,
          branch: product.branch,
          quantity: isRentBranch ? 1 : quantity,
          stockCount: selectedSizeObj.stockCount,
          type: itemType,
          collection: product.collection || "",
          rentStart: rentStartStr,
          rentEnd: rentEndStr,
          isExclusive: isRentBranch ? isExclusive : undefined,
          extraDayBefore: isRentBranch ? extraDayBefore : undefined,
          extraDayAfter: isRentBranch ? extraDayAfter : undefined,
        },
      })
    }

    toast({
      title: isRentBranch ? "Added to cart for rental" : "Added to cart",
      description: isRentBranch
        ? `${product.name} rental (Event: ${rentEventDate?.toLocaleDateString()}) added to cart.`
        : `${product.name} added to cart.`,
    })
    setShowMainProductSizeSelector(false)
    router.push("/checkout")
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
    const cached = getByBranch(branch)
    if (cached.length > 0) {
      const filtered = (cached as unknown as ProductDetail[])
        .filter((p) => p.id !== productId && p.isActive !== false)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 4)
      setRelatedProducts(filtered)
      return
    }
    try {
      // Fetch products from the same branch, excluding the current product
      const response = await fetch(`/api/items?branch=${branch}`)
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
    if (!branch || !productId) return

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
  }, [branch, productId, cacheLoading, getById])

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
      const response = await fetch(`/api/items/${productId}`)
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
                  href={`/products/${branch}`}
                  className="text-gray-600 hover:text-black transition-colors font-medium"
                >
                  {collectionDetails[branch]?.titleKey ? t(collectionDetails[branch].titleKey) : branch}
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
                  className="w-full h-[500px] sm:h-[600px] lg:h-[750px] relative select-none cursor-zoom-in"
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                  onClick={() => setIsZoomModalOpen(true)}
                  tabIndex={0}
                  role="button"
                  aria-label="Open product image preview"
                  style={{ userSelect: "none", touchAction: "pan-y" }}
                >
                  <Image
                    src={mainImage}
                    alt={product.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className={`object-contain transition-all duration-300 ${isHovered ? "scale-105" : "scale-100"}`}
                    priority
                  />
                  {/* Zoom Icon Overlay */}
                  <div
                    className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-md pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  >
                    <Maximize2 className="h-5 w-5 text-gray-700" />
                  </div>
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
                    <p className="text-sm uppercase tracking-widest text-gray-600 mb-2">{collectionDetails[branch]?.titleKey ? t(collectionDetails[branch].titleKey) : branch}</p>
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
                        ({product.rating}) • {product.reviews} {t("reviews" as TranslationKey)}
                      </span>
                    </div>
                  </div>
                  {(() => {
                    const isWeddingOrSoiree = product.collection?.toLowerCase().includes("wedding") || product.collection?.toLowerCase().includes("soiree")
                    const showProductPrice = (showPrices || (product.branch === "sell-dresses" && isWeddingOrSoiree)) && !(isRentBranch && isPast45Days)
                    const clientRentalPrice = isRentBranch && !isPast45Days && product.rentalPriceC && product.rentalPriceC > 0 ? product.rentalPriceC : null
                    if (!showProductPrice && !clientRentalPrice) return null
                    if (!showProductPrice && clientRentalPrice) {
                      const displayPrice = rentalPrice ? rentalPrice.total : clientRentalPrice
                      return (
                        <div className="text-2xl sm:text-3xl font-light text-left">
                          <div className="flex items-center space-x-2">
                            <span className="text-xl sm:text-2xl">{formatPrice(displayPrice)}</span>
                            {!rentalPrice && (
                              <span className="text-[10px] text-rose-600 font-medium bg-rose-50 px-2 py-0.5 rounded-full mt-1">
                                Starting from
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    }
                    return (
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
                          const selectedPrice = (isRentBranch && rentalPrice)
                            ? rentalPrice.total
                            : (isRentBranch && product.rentalPriceA && product.rentalPriceA > 0)
                              ? product.rentalPriceA
                              : (selectedSizeObj?.discountedPrice || selectedSizeObj?.originalPrice || 0)
                          const originalPrice = isRentBranch ? 0 : (selectedSizeObj?.originalPrice || 0)
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
                          return (
                            <div className="flex items-center space-x-2">
                              <span className="text-xl sm:text-2xl">{formatPrice(selectedPrice)}</span>
                              {isRentBranch && product.rentalPriceA && product.rentalPriceA > 0 && !rentalPrice && (
                                <span className="text-[10px] text-rose-600 font-medium bg-rose-50 px-2 py-0.5 rounded-full mt-1">
                                  Starting at (Cat A)
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })()}
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
                      {t("readMore" as TranslationKey)} <ChevronDown className="ml-1 h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              {/* Size selection & add to cart */}
              {!product.isGiftPackage && (
                <div className="space-y-4">
                  <h3 className="text-base sm:text-lg font-medium mb-4 text-gray-900">{isRentBranch ? t("selectSizeToRent" as TranslationKey) : t("selectSizeToBuy" as TranslationKey)}</h3>
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
                  {isRentBranch && (
                    <div className="mt-4 space-y-3">
                      <p className="font-medium text-gray-900">{t("selectOccasionDate" as TranslationKey)}</p>
                      <div className="w-full max-w-sm">
                        <div className="border rounded-lg overflow-hidden place-items-center p-2 bg-white flex justify-center">
                          <Calendar
                            mode="single"
                            selected={rentEventDate}
                            onSelect={(date) => {
                              const newDate = date ?? undefined;
                              setRentEventDate(newDate);
                              // Sync TO global context when user selects a date here
                              if (newDate) {
                                setOccasionDate(newDate);
                              }
                            }}
                            disabled={(date) => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              if (date < today) return true;

                              for (const booking of bookedRanges) {
                                const bStart = new Date(booking.from);
                                bStart.setHours(0, 0, 0, 0);
                                const bEnd = new Date(booking.to);
                                bEnd.setHours(23, 59, 59, 999);

                                // Strictly disable ONLY the specific calendar days the dress is physically out for the reservation.
                                if (date >= bStart && date <= bEnd) return true;
                              }
                              return false;
                            }}
                            className="text-xs"
                          />
                        </div>

                      </div>

                      {checkingAvailability && (
                        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
                          Loading available dates...
                        </div>
                      )}

                      {/* Exclusive Hold Option — show if dress never rented, or user's
                          selected date is before the earliest existing booking */}
                      {(() => {
                        const actuallyRented = hasBeenRentedDb !== null ? hasBeenRentedDb : product.hasBeenRented
                        // If dress has been physically rented in the past, no exclusive hold ever
                        if (actuallyRented) return false
                        // If no bookings at all, always show exclusive option
                        if (bookedRanges.length === 0) return true
                        // If user hasn't picked a date yet, wait for them to pick one
                        if (!rentEventDate) return false
                        // Check if user's date is strictly before the earliest booking
                        const earliestBooking = Math.min(...bookedRanges.map(b => new Date(b.from).setHours(0,0,0,0)))
                        const selectedDate = new Date(rentEventDate).setHours(0,0,0,0)
                        return selectedDate < earliestBooking
                      })() && !isPast45Days && (
                        <div
                          className={`border rounded-lg p-4 transition-all duration-200 cursor-pointer select-none ${
                            isExclusive
                              ? 'border-black bg-gray-50 shadow-sm'
                              : 'border-gray-200 hover:border-gray-400'
                          }`}
                          onClick={() => setIsExclusive(!isExclusive)}
                        >
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isExclusive}
                              onChange={(e) => setIsExclusive(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-black focus:ring-black accent-black"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-gray-900 text-sm">{t("exclusiveHold" as TranslationKey)}</p>
                                <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-amber-200">
                                  {t("firstRentalLabel" as TranslationKey)}
                                </span>
                              </div>
                              <div className="mt-1.5 space-y-1">
                                <p className="text-xs text-gray-600 flex items-center gap-1.5">
                                  <span className="text-gray-400">✦</span>
                                  {t("exclusiveHoldNote1" as TranslationKey)}
                                </p>
                                <p className="text-xs text-gray-600 flex items-center gap-1.5">
                                  <span className="text-gray-400">✦</span>
                                  {t("exclusiveHoldNote2" as TranslationKey)}
                                </p>
                              </div>
                            </div>
                          </label>
                        </div>
                      )}

                      {/* Extra Days Options — show after user selects a date */}
                      {rentEventDate && !isPast45Days && (
                        <div className="space-y-2">
                          <p className="font-medium text-gray-900 text-sm">{t("extraDays" as TranslationKey)} <span className="text-xs text-gray-500 font-normal">(200 EGP / day)</span></p>
                          <div className="grid grid-cols-2 gap-2">
                            <div
                              className={`border rounded-lg p-3 transition-all duration-200 select-none ${
                                !canAddExtraDayBefore
                                  ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                                  : extraDayBefore
                                    ? 'border-black bg-gray-50 shadow-sm cursor-pointer'
                                    : 'border-gray-200 hover:border-gray-400 cursor-pointer'
                              }`}
                              onClick={() => canAddExtraDayBefore && setExtraDayBefore(!extraDayBefore)}
                            >
                              <label className={`flex items-center gap-2 ${canAddExtraDayBefore ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                                <input
                                  type="checkbox"
                                  checked={extraDayBefore}
                                  disabled={!canAddExtraDayBefore}
                                  onChange={(e) => canAddExtraDayBefore && setExtraDayBefore(e.target.checked)}
                                  className="h-3.5 w-3.5 rounded border-gray-300 text-black focus:ring-black accent-black"
                                />
                                <div>
                                  <p className="text-xs font-medium text-gray-900">{t("extraDayBeforeTitle" as TranslationKey)}</p>
                                  <p className="text-[10px] text-gray-500">
                                    {canAddExtraDayBefore ? t("receive1DayEarlier" as TranslationKey) : t("unavailableDateBooked" as TranslationKey)}
                                  </p>
                                </div>
                              </label>
                            </div>
                            <div
                              className={`border rounded-lg p-3 transition-all duration-200 select-none ${
                                !canAddExtraDayAfter
                                  ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                                  : extraDayAfter
                                    ? 'border-black bg-gray-50 shadow-sm cursor-pointer'
                                    : 'border-gray-200 hover:border-gray-400 cursor-pointer'
                              }`}
                              onClick={() => canAddExtraDayAfter && setExtraDayAfter(!extraDayAfter)}
                            >
                              <label className={`flex items-center gap-2 ${canAddExtraDayAfter ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                                <input
                                  type="checkbox"
                                  checked={extraDayAfter}
                                  disabled={!canAddExtraDayAfter}
                                  onChange={(e) => canAddExtraDayAfter && setExtraDayAfter(e.target.checked)}
                                  className="h-3.5 w-3.5 rounded border-gray-300 text-black focus:ring-black accent-black"
                                />
                                <div>
                                  <p className="text-xs font-medium text-gray-900">{t("extraDayAfterTitle" as TranslationKey)}</p>
                                  <p className="text-[10px] text-gray-500">
                                    {canAddExtraDayAfter ? t("return1DayLater" as TranslationKey) : t("unavailableDateBooked" as TranslationKey)}
                                  </p>
                                </div>
                              </label>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Rental Price Display / Contact Branch (past 45 days) */}
                      {(rentEventDate || isPast45Days) && (
                        <div className="border rounded-lg p-4 bg-white">
                          {isPast45Days ? (
                            <div className="space-y-3">
                              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="text-sm font-medium text-amber-800">
                                    Price not available online
                                  </p>
                                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                                    The selected date is more than 45 days away. Please contact the branch directly for pricing.
                                  </p>
                                </div>
                              </div>
                              <a
                                href={`https://wa.me/201094448044?text=${encodeURIComponent(
                                  `Hello, I'm interested in renting:\n\nDress: ${product.name}\nProduct ID: ${product.id}\nBranch: ${collectionDetails[branch]?.titleKey ? t(collectionDetails[branch].titleKey) : branch}\nOccasion Date: ${(rentEventDate || occasionDate)?.toLocaleDateString('en-GB') || 'Not specified'}\n\nThe date I selected is beyond 45 days. Please provide the rental price.`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#25D366] hover:bg-[#1da851] text-white font-medium rounded-lg transition-colors duration-200"
                              >
                                <MessageCircle className="h-5 w-5" />
                                Contact Branch via WhatsApp
                              </a>
                            </div>
                          ) : rentalPriceLoading ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
                              Calculating rental price...
                            </div>
                          ) : rentalPrice ? (
                            <div>
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">{t("rentalPrice" as TranslationKey)}</p>
                                  <p className="text-2xl font-light text-gray-900">{formatPrice(rentalPrice.total)}</p>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {isExclusive && (
                                    <span className="text-xs bg-black text-white px-2 py-1 rounded-full">Exclusive</span>
                                  )}
                                  {(extraDayBefore || extraDayAfter) && (
                                    <span className="text-xs bg-gray-800 text-white px-2 py-1 rounded-full">
                                      +{((extraDayBefore ? 1 : 0) + (extraDayAfter ? 1 : 0)) * 200} EGP {t("extraDays" as TranslationKey)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                  {!isPast45Days && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      className={`px-6 py-3 rounded-full flex items-center ${isRentBranch && availabilityResult && !availabilityResult.available
                          ? "bg-red-500 hover:bg-red-600 text-white cursor-not-allowed"
                          : "bg-black hover:bg-gray-800 text-white"
                        }`}
                      disabled={
                        product.isOutOfStock ||
                        checkingAvailability ||
                        (isRentBranch && !rentEventDate) ||
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
                        ? t("outOfStockLabel" as TranslationKey)
                        : isRentBranch
                          ? (checkingAvailability
                            ? t("loadingLabel" as TranslationKey)
                            : !rentEventDate
                              ? t("selectDateLabel" as TranslationKey)
                              : t("rentNowLabel" as TranslationKey))
                          : t("buyNowLabel" as TranslationKey)}
                    </Button>
                  </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>
      <Footer />

      {/* Image Zoom Modal */}
      {isZoomModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 sm:p-8"
          onClick={() => setIsZoomModalOpen(false)}
        >
          <button
            onClick={() => setIsZoomModalOpen(false)}
            className="absolute top-6 right-6 p-2 text-white hover:text-rose-400 transition-colors z-[110]"
            aria-label="Close preview"
          >
            <X className="h-8 w-8" />
          </button>

          <div className="relative w-full h-full max-w-5xl max-h-[90vh]">
            <Image
              src={mainImage}
              alt={product.name}
              fill
              sizes="100vw"
              className="object-contain"
              quality={100}
              priority
            />
          </div>

          {/* Navigation for multiple images in zoom mode */}
          {imagesForDisplay.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  goToPrevImage()
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  goToNextImage()
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}
        </motion.div>
      )}
    </div>
  )
}