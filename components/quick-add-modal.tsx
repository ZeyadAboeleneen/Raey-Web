"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { Star, Heart, ShoppingCart, X, AlertCircle, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import dynamic from "next/dynamic"
import { useCart } from "@/lib/cart-context"
import { useFavorites } from "@/lib/favorites-context"
import { useCurrencyFormatter } from "@/hooks/use-currency"
import { useCustomSize } from "@/hooks/use-custom-size"
import { useTranslation, TranslationKey } from "@/lib/translations"
import { useLocale } from "@/lib/locale-context"
import { toast } from "@/hooks/use-toast"
import type { SizeChartRow } from "@/components/custom-size-form"
import type { CachedProduct as Product, ProductSize } from "@/lib/products-cache"
import { useRouter } from "next/navigation"

const CustomSizeForm = dynamic(
  () => import("@/components/custom-size-form").then((m) => m.CustomSizeForm),
  { ssr: false }
)

const GiftPackageSelector = dynamic(
  () => import("@/components/gift-package-selector").then((m) => m.GiftPackageSelector),
  { ssr: false }
)

interface QuickAddModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
  sizeChart: SizeChartRow[]
}

export function QuickAddModal({ product, isOpen, onClose, sizeChart }: QuickAddModalProps) {
  const router = useRouter()
  const { dispatch: cartDispatch } = useCart()
  const { isFavorite, addToFavorites, removeFromFavorites } = useFavorites()
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

  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [rentEventDate, setRentEventDate] = useState<Date | undefined>(undefined)
  const [bookedRanges, setBookedRanges] = useState<{ from: Date, to: Date }[]>([])
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [isExclusive, setIsExclusive] = useState(false)
  const [extraDayBefore, setExtraDayBefore] = useState(false)
  const [extraDayAfter, setExtraDayAfter] = useState(false)
  const [rentalPrice, setRentalPrice] = useState<{ total: number; category: string } | null>(null)
  const [rentalPriceLoading, setRentalPriceLoading] = useState(false)
  const [showCustomSizeConfirmation, setShowCustomSizeConfirmation] = useState(false)
  const [hasBeenRentedDb, setHasBeenRentedDb] = useState<boolean | null>(null)

  const isRentBranch = product?.branch !== "sell-dresses"

  // Reset state when product changes or modal opens
  useEffect(() => {
    if (isOpen && product) {
      setSelectedSize(null)
      setQuantity(1)
      setRentEventDate(undefined)
      setIsExclusive(false)
      setExtraDayBefore(false)
      setExtraDayAfter(false)
      setRentalPrice(null)
      setIsCustomSizeMode(true)
      resetMeasurements()
      
      if (isRentBranch) {
        fetchBookings()
      }
    }
  }, [isOpen, product?.id])

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
    if (!isRentBranch || !product || !rentEventDate) {
      setRentalPrice(null)
      return
    }

    const controller = new AbortController()
    const fetchPrice = async () => {
      setRentalPriceLoading(true)
      try {
        const start = new Date(rentEventDate)
        start.setDate(start.getDate() - 1)
        const end = new Date(rentEventDate)
        end.setDate(end.getDate() + 1)

        const res = await fetch('/api/rental/pricing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: product.id,
            rentStart: start.toISOString(),
            rentEnd: end.toISOString(),
            isExclusive,
          }),
          signal: controller.signal,
        })
        if (res.ok) {
          const data = await res.json()
          const extraDaysFee = ((extraDayBefore ? 1 : 0) + (extraDayAfter ? 1 : 0)) * 200
          setRentalPrice({ total: data.total + extraDaysFee, category: data.category })
        } else {
          setRentalPrice(null)
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Failed to fetch rental price:', err)
          setRentalPrice(null)
        }
      } finally {
        setRentalPriceLoading(false)
      }
    }

    fetchPrice()
    return () => controller.abort()
  }, [isRentBranch, product?.id, rentEventDate, isExclusive, extraDayBefore, extraDayAfter])

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

  const getSmallestPrice = (sizes: ProductSize[]) => {
    if (!sizes || sizes.length === 0) return 0
    const prices = sizes.map(size => size.discountedPrice || size.originalPrice || 0)
    return Math.min(...prices.filter(price => price > 0))
  }

  const handleAddToCart = async () => {
    if (!product) return
    if (isCustomSizeMode && !isMeasurementsValid) return
    if (!isCustomSizeMode && !selectedSize) return

    // Real-time stock check for sell-dresses (unique one-of-a-kind pieces)
    if (product.branch === "sell-dresses") {
      try {
        const res = await fetch(`/api/products/${product.branch}/${product.id}`)
        if (res.ok) {
          const freshProduct = await res.json()
          if (freshProduct.isOutOfStock) {
            toast({
              variant: "destructive",
              title: "Sold Out",
              description: "This dress has already been sold and is no longer available.",
            })
            onClose()
            return
          }
        }
      } catch {
        // If check fails, let the order API handle it as a fallback
      }
    }

    if (isRentBranch) {
      if (!rentEventDate) {
        toast({ variant: "destructive", title: "Select rental date", description: "Please select an event date for your rental." })
        return
      }
      
      const formatLocalDate = (d: Date) => {
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      const start = new Date(rentEventDate)
      start.setDate(start.getDate() - 1 - (extraDayBefore ? 1 : 0))
      start.setHours(0, 0, 0, 0)
      const rentStartStr = formatLocalDate(start)

      const end = new Date(rentEventDate)
      end.setDate(end.getDate() + 1 + (extraDayAfter ? 1 : 0))
      end.setHours(23, 59, 59, 999)
      const rentEndStr = formatLocalDate(end)

      // Double-booking check
      let hasOverlap = false
      for (const booking of bookedRanges) {
        const bStart = new Date(booking.from)
        bStart.setHours(0, 0, 0, 0)
        const bEnd = new Date(booking.to)
        bEnd.setHours(23, 59, 59, 999)
        if (start < bEnd && end >= bStart) {
          hasOverlap = true
          break
        }
      }

      if (hasOverlap) {
        toast({ variant: "destructive", title: "Date Conflict", description: "This dress is already rented during your required reservation window." })
        return
      }

      cartDispatch({
        type: "ADD_ITEM",
        payload: {
          id: `${product.id}-${isCustomSizeMode ? "custom" : selectedSize?.size}-rent-${rentStartStr}-${rentEndStr}`,
          productId: product.id,
          name: product.name,
          price: rentalPrice?.total || 0,
          size: isCustomSizeMode ? "custom" : selectedSize?.size || "one-size",
          volume: isCustomSizeMode ? measurementUnit : undefined,
          image: (product.images && product.images[0]) || (product as any).image || "/placeholder.svg",
          branch: product.branch,
          quantity: 1,
          type: "rent",
          collection: product.collection || "",
          rentStart: rentStartStr,
          rentEnd: rentEndStr,
          isExclusive,
          extraDayBefore,
          extraDayAfter,
          customMeasurements: isCustomSizeMode ? { unit: measurementUnit, values: measurements } : undefined,
        }
      })
    } else {
      // Buy logic
      const baseSize = selectedSize || product.sizes[0]
      cartDispatch({
        type: "ADD_ITEM",
        payload: {
          id: `${product.id}-${isCustomSizeMode ? "custom" : baseSize?.size}`,
          productId: product.id,
          name: product.name,
          price: baseSize?.discountedPrice || baseSize?.originalPrice || 0,
          originalPrice: baseSize?.originalPrice,
          size: isCustomSizeMode ? "custom" : baseSize?.size,
          volume: isCustomSizeMode ? measurementUnit : baseSize?.volume,
          image: (product.images && product.images[0]) || (product as any).image || "/placeholder.svg",
          branch: product.branch,
          quantity,
          type: "buy",
          collection: product.collection || "",
          customMeasurements: isCustomSizeMode ? { unit: measurementUnit, values: measurements } : undefined,
        }
      })
    }

    onClose()
    router.push("/checkout")
  }

  const handleToggleFavorite = async (e?: React.MouseEvent | any) => {
    if (e && typeof e === 'object' && 'stopPropagation' in e) {
      e.stopPropagation()
    }
    
    if (!product) return
    
    if (isFavorite(product.id)) {
      await removeFromFavorites(product.id)
    } else {
      const price = product.isGiftPackage && product.packagePrice
        ? product.packagePrice
        : (product.branch !== "sell-dresses" && product.rentalPriceA && product.rentalPriceA > 0)
          ? product.rentalPriceA
          : (product.sizes?.[0]?.discountedPrice || product.sizes?.[0]?.originalPrice || 0)

      await addToFavorites({
        id: product.id,
        name: product.name,
        price,
        image: (product.images && product.images[0]) || (product as any).image || "/placeholder.svg",
        branch: product.branch,
        collection: product.collection,
        rating: product.rating,
        sizes: product.sizes,
        isGiftPackage: product.isGiftPackage,
        packagePrice: product.packagePrice,
        rentalPriceA: product.rentalPriceA ?? undefined,
        rentalPriceC: (product as any).rentalPriceC ?? undefined,
      })
    }
  }

  if (!isOpen || !product) return null

  if (product.isGiftPackage) {
    return (
      <GiftPackageSelector
        product={product}
        isOpen={isOpen}
        onClose={onClose}
        onToggleFavorite={() => handleToggleFavorite()}
        isFavorite={isFavorite}
      />
    )
  }

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-medium">{product.name}</h3>
                  <p className="text-gray-600 text-sm">Select your options to {isRentBranch ? "rent" : "buy"}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleToggleFavorite}
                    className="p-1.5 bg-white/80 backdrop-blur-sm rounded-full shadow-md hover:bg-gray-100 transition-colors border border-gray-100"
                  >
                    <Heart className={`h-5 w-5 ${isFavorite(product.id) ? "text-red-500 fill-red-500" : "text-gray-700"}`} />
                  </button>
                  <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center mb-6">
                <div className="relative w-20 h-20 mr-4 flex-shrink-0">
                  <Image
                    src={(product.images && product.images[0]) || (product as any).image || "/placeholder.svg"}
                    alt={product.name}
                    fill
                    sizes="80px"
                    className="rounded-lg object-cover"
                  />
                </div>
                <div>
                  <p className="text-gray-600 text-xs sm:text-sm line-clamp-2">{product.description}</p>
                </div>
              </div>

              <div className="space-y-6">
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
                  sizes={product.sizes}
                  selectedSize={selectedSize}
                  onSelectSize={(size) => {
                    setIsCustomSizeMode(false)
                    setSelectedSize(size as ProductSize)
                  }}
                  formatPrice={formatPrice}
                />

                {isRentBranch && (
                  <div className="space-y-4 pt-4 border-t border-gray-100">
                    <p className="font-medium text-gray-900 text-sm">{t("selectOccasionDate" as TranslationKey)}</p>
                    <div className="flex justify-center border rounded-xl p-2 bg-gray-50">
                      <Calendar
                        mode="single"
                        selected={rentEventDate}
                        onSelect={(date) => setRentEventDate(date ?? undefined)}
                        disabled={(date) => {
                          const today = new Date()
                          today.setHours(0, 0, 0, 0)
                          if (date < today) return true
                          for (const booking of bookedRanges) {
                            const bStart = new Date(booking.from)
                            bStart.setHours(0, 0, 0, 0)
                            const bEnd = new Date(booking.to)
                            bEnd.setHours(23, 59, 59, 999)
                            if (date >= bStart && date <= bEnd) return true
                          }
                          return false
                        }}
                        className="text-xs"
                      />
                    </div>
                    
                    {checkingAvailability && (
                      <div className="text-xs text-blue-600 flex items-center gap-1.5">
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-500 border-t-transparent" />
                        Checking availability...
                      </div>
                    )}

                    {/* Exclusive Hold: show if dress has never been rented, OR if the user's
                        selected date is before the earliest existing booking (dress unworn at that point) */}
                    {(() => {
                      if (!isRentBranch) return false
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
                    })() && (
                      <div 
                        className={`border rounded-lg p-3 cursor-pointer transition-all ${isExclusive ? 'border-black bg-gray-50' : 'border-gray-200'}`}
                        onClick={() => setIsExclusive(!isExclusive)}
                      >
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={isExclusive} readOnly className="h-4 w-4 accent-black" />
                          <span className="text-sm font-medium">Exclusive Hold</span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1 ml-6">Reserve this dress exclusively for your event.</p>
                      </div>
                    )}

                    {/* Extra Days Options — show after user selects a date */}
                    {rentEventDate && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-900">{t("extraDays" as TranslationKey)} <span className="text-xs text-gray-500 font-normal">(200 EGP / day)</span></p>
                        <div className="grid grid-cols-2 gap-2">
                          <div
                            className={`border rounded-lg p-2.5 transition-all ${
                              !canAddExtraDayBefore
                                ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                                : extraDayBefore
                                  ? 'border-black bg-gray-50 cursor-pointer'
                                  : 'border-gray-200 cursor-pointer'
                            }`}
                            onClick={() => canAddExtraDayBefore && setExtraDayBefore(!extraDayBefore)}
                          >
                            <label className={`flex items-center gap-2 ${canAddExtraDayBefore ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                              <input type="checkbox" checked={extraDayBefore} disabled={!canAddExtraDayBefore} readOnly className="h-3.5 w-3.5 accent-black" />
                              <div>
                                <p className="text-xs font-medium">{t("extraDayBeforeTitle" as TranslationKey)}</p>
                                <p className="text-[10px] text-gray-500">
                                  {canAddExtraDayBefore ? t("receive1DayEarlier" as TranslationKey) : t("unavailable" as TranslationKey)}
                                </p>
                              </div>
                            </label>
                          </div>
                          <div
                            className={`border rounded-lg p-2.5 transition-all ${
                              !canAddExtraDayAfter
                                ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                                : extraDayAfter
                                  ? 'border-black bg-gray-50 cursor-pointer'
                                  : 'border-gray-200 cursor-pointer'
                            }`}
                            onClick={() => canAddExtraDayAfter && setExtraDayAfter(!extraDayAfter)}
                          >
                            <label className={`flex items-center gap-2 ${canAddExtraDayAfter ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                              <input type="checkbox" checked={extraDayAfter} disabled={!canAddExtraDayAfter} readOnly className="h-3.5 w-3.5 accent-black" />
                              <div>
                                <p className="text-xs font-medium">{t("extraDayAfterTitle" as TranslationKey)}</p>
                                <p className="text-[10px] text-gray-500">
                                  {canAddExtraDayAfter ? t("return1DayLater" as TranslationKey) : t("unavailable" as TranslationKey)}
                                </p>
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center py-4 border-t border-gray-100">
                  <div className="flex flex-col">
                    {isRentBranch ? (
                      rentEventDate ? (
                        rentalPriceLoading ? (
                          <span className="text-sm text-gray-400">Calculating...</span>
                        ) : rentalPrice ? (
                          <>
                            <span className="text-xs text-gray-500 uppercase tracking-wider">{t("rentalTotal" as TranslationKey)}</span>
                            <span className="text-xl font-bold text-black">{formatPrice(rentalPrice.total)}</span>
                            <span className="text-[10px] text-rose-600 font-medium">Category {rentalPrice.category}</span>
                          </>
                        ) : (
                          <div className="flex flex-col">
                            {!showPrices && (product as any).rentalPriceC && (product as any).rentalPriceC > 0 ? (
                              <>
                                <span className="text-[10px] text-rose-600 font-medium">Starting from</span>
                                <span className="text-xl font-bold text-black">
                                  {formatPrice((product as any).rentalPriceC)}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-[10px] text-rose-600 font-medium">Starting at (Cat A)</span>
                                <span className="text-xl font-bold text-black">
                                  {product.rentalPriceA && product.rentalPriceA > 0 
                                    ? formatPrice(product.rentalPriceA) 
                                    : formatPrice(getSmallestPrice(product.sizes))}
                                </span>
                              </>
                            )}
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-500 italic">Select a date to view pricing</span>
                        </div>
                      )
                    ) : (
                      (() => {
                        const referenceSize = selectedSize || product.sizes[0]
                        const price = referenceSize?.discountedPrice || referenceSize?.originalPrice || 0
                        return <span className="text-xl font-bold">{formatPrice(price * quantity)}</span>
                      })()
                    )}
                  </div>

                  <Button
                    onClick={() => {
                      if (isCustomSizeMode && isMeasurementsValid) {
                        setShowCustomSizeConfirmation(true)
                      } else {
                        handleAddToCart()
                      }
                    }}
                    className={`rounded-full px-6 ${product.isOutOfStock ? 'bg-gray-400' : 'bg-black hover:bg-gray-800'}`}
                    disabled={product.isOutOfStock || (isRentBranch && !rentEventDate)}
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    {isRentBranch ? (rentEventDate ? t("rentNowLabel" as TranslationKey) : t("selectDateLabel" as TranslationKey)) : t("buyNowLabel" as TranslationKey)}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <AlertDialog open={showCustomSizeConfirmation} onOpenChange={setShowCustomSizeConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Custom Size</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="bg-gray-50 p-4 rounded-lg space-y-1 text-sm mt-2">
                <div className="grid grid-cols-2 gap-2">
                  <span><strong>Shoulder:</strong> {measurements.shoulder} {measurementUnit}</span>
                  <span><strong>Bust:</strong> {measurements.bust} {measurementUnit}</span>
                  <span><strong>Waist:</strong> {measurements.waist} {measurementUnit}</span>
                  <span><strong>Hips:</strong> {measurements.hips} {measurementUnit}</span>
                  <span><strong>Sleeve:</strong> {measurements.sleeve} {measurementUnit}</span>
                  <span><strong>Length:</strong> {measurements.length} {measurementUnit}</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Edit</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddToCart}>Confirm & Add</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
