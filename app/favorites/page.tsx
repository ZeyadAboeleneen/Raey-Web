"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Heart, ShoppingCart, Trash2, ArrowLeft, Star, X, Sparkles, Package, AlertCircle } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { useFavorites } from "@/lib/favorites-context"
import { useCart } from "@/lib/cart-context"
import { GiftPackageSelector } from "@/components/gift-package-selector"
import { useCurrencyFormatter } from "@/hooks/use-currency"
import { useCustomSize } from "@/hooks/use-custom-size"
import { useTranslation } from "@/lib/translations"
import { useLocale } from "@/lib/locale-context"
import { CustomSizeForm } from "@/components/custom-size-form"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

interface FavoriteItem {
  id: string
  name: string
  price: number
  image: string
  category: string
  collection?: string
  rating?: number
  isNew?: boolean
  isBestseller?: boolean
  isOutOfStock?: boolean
  isGiftPackage?: boolean
  packagePrice?: number
  packageOriginalPrice?: number
  giftPackageSizes?: any[]
  sizes?: Array<{
    size: string
    volume: string
    originalPrice?: number
    discountedPrice?: number
  }>
}

const WHATSAPP_NUMBER = "201094448044"

export default function FavoritesPage() {
  const { state: favoritesState, removeFromFavorites, clearFavorites } = useFavorites()
  const { dispatch: cartDispatch } = useCart()
  const { formatPrice, showPrices } = useCurrencyFormatter()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<FavoriteItem | null>(null)
  const [showSizeSelector, setShowSizeSelector] = useState(false)
  const [selectedSize, setSelectedSize] = useState<any>(null)
  const [quantity, setQuantity] = useState(1)
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

  const sizeChart = [
    { label: "XL", shoulderIn: "16", waistIn: "32", bustIn: "40", hipsIn: "42", sleeveIn: "23", shoulderCm: "40", waistCm: "81", bustCm: "101", hipsCm: "106", sleeveCm: "58" },
    { label: "L", shoulderIn: "15", waistIn: "31", bustIn: "39", hipsIn: "40", sleeveIn: "22.5", shoulderCm: "38", waistCm: "78", bustCm: "99", hipsCm: "101", sleeveCm: "57" },
    { label: "M", shoulderIn: "14.5", waistIn: "29", bustIn: "37", hipsIn: "38", sleeveIn: "22", shoulderCm: "37", waistCm: "73", bustCm: "94", hipsCm: "96", sleeveCm: "55" },
    { label: "S", shoulderIn: "14", waistIn: "27", bustIn: "35", hipsIn: "36", sleeveIn: "21.5", shoulderCm: "35", waistCm: "68", bustCm: "90", hipsCm: "91", sleeveCm: "54" },
    { label: "XS", shoulderIn: "14", waistIn: "25", bustIn: "34", hipsIn: "35", sleeveIn: "21", shoulderCm: "34", waistCm: "63", bustCm: "86", hipsCm: "88", sleeveCm: "53" },
  ]

  const getSmallestPrice = (sizes: any[]) => {
    if (!sizes || sizes.length === 0) return 0
    const prices = sizes.map(size => size.discountedPrice || size.originalPrice || 0)
    return Math.min(...prices.filter(price => price > 0))
  }

  const openSizeSelector = (product: FavoriteItem) => {
    setSelectedProduct(product)
    setSelectedSize(null)
    setShowSizeSelector(true)
    setQuantity(1)
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

  useEffect(() => {
    if (showSizeSelector || showGiftPackageSelector || showCustomSizeConfirmation) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [showSizeSelector, showGiftPackageSelector, showCustomSizeConfirmation])

  const openWhatsAppOrder = () => {
    if (!selectedProduct) return
    const isRent = selectedProduct.category !== "sell-dresses"
    const actionVerb = isRent ? "rent" : "buy"
    let message = `Hello, I'd like to ${actionVerb} this dress.\n\nName: ${selectedProduct.name}\nDress Code: ${selectedProduct.id}\nCategory: ${selectedProduct.category}\n\n`
    if (isCustomSizeMode) {
      message += `Size Mode: Custom (${measurementUnit})\nMeasurements:\n`
      Object.entries(measurements || {}).forEach(([key, value]) => {
        if (value == null || value === "") return
        message += `- ${key}: ${value} ${measurementUnit}\n`
      })
      message += `\n`
    } else if (selectedSize) {
      message += `Selected Size:\n`
      if (selectedSize.size) message += `- Size: ${selectedSize.size}\n`
      if (selectedSize.volume) message += `- Volume: ${selectedSize.volume}\n`
      message += `\n`
    }
    message += `Quantity: ${quantity}\nRequest Date: ${new Date().toLocaleString()}\n`
    const encoded = encodeURIComponent(message)
    if (typeof window !== "undefined") window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`, "_blank")
  }

  const addToCartWithSize = () => {
    if (!selectedProduct) return
    if (!isCustomSizeMode && !selectedSize) return
    if (isCustomSizeMode && !isMeasurementsValid) return
    const firstSize = selectedProduct.sizes?.[0] || null
    const fallbackSize: any = {
      size: "custom",
      volume: measurementUnit,
      discountedPrice: selectedProduct.packagePrice || (firstSize?.discountedPrice ?? 0),
      originalPrice: firstSize?.originalPrice ?? 0
    }
    const baseSize = selectedSize || firstSize || fallbackSize
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
        image: selectedProduct.image,
        category: selectedProduct.category,
        quantity,
        customMeasurements: isCustomSizeMode ? { unit: measurementUnit, values: measurements } : undefined,
      }
    })
    openWhatsAppOrder()
    closeSizeSelector()
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <Navigation />

      {/* Size Selector Modal */}
      {showSizeSelector && selectedProduct && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeSizeSelector}>
          <motion.div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl relative" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-medium">{selectedProduct.name}</h3>
                  <p className="text-gray-600 text-sm">{t("selectSize")}</p>
                </div>
                <div className="flex">
                  <button onClick={(e) => { e.stopPropagation(); removeFromFavorites(selectedProduct.id); closeSizeSelector() }} className="mr-2 p-1.5 bg-white rounded-full shadow-md hover:bg-gray-100 transition-colors">
                    <Heart className="h-5 w-5 text-red-500 fill-red-500" />
                  </button>
                  <button onClick={closeSizeSelector} className="text-gray-500 hover:text-gray-700 transition-colors"><X className="h-5 w-5" /></button>
                </div>
              </div>
              <div className="flex items-center mb-6">
                <div className="relative w-20 h-20 mr-4"><Image src={selectedProduct.image || "/placeholder.svg"} alt={selectedProduct.name} fill sizes="80px" className="rounded-lg object-cover" /></div>
                <div>
                  <p className="text-gray-600 text-sm line-clamp-2">Choose your preferred size</p>
                  <div className="flex items-center mt-1">
                    {[...Array(5)].map((_, i) => (<Star key={i} className={`h-4 w-4 ${selectedProduct.rating && i < Math.floor(selectedProduct.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />))}
                    <span className="text-xs text-gray-600 ml-2">({selectedProduct.rating ? selectedProduct.rating.toFixed(1) : '0.0'})</span>
                  </div>
                </div>
              </div>
              <div className="mb-6">
                <CustomSizeForm 
                  controller={{ isCustomSizeMode, setIsCustomSizeMode, measurementUnit, setMeasurementUnit, measurements, onMeasurementChange: handleMeasurementChange, confirmMeasurements, setConfirmMeasurements, isMeasurementsValid }} 
                  sizeChart={sizeChart} 
                  sizes={selectedProduct.sizes || []} 
                  selectedSize={selectedSize} 
                  onSelectSize={(size) => { setIsCustomSizeMode(false); setSelectedSize(size) }} 
                  formatPrice={formatPrice} 
                />
              </div>
              <div className="flex justify-between items-center py-4 border-t border-gray-100">
                <div>
                  <span className="text-gray-600">{t("total")}:</span>
                  {(() => {
                    const isWeddingOrSoiree = selectedProduct.collection?.toLowerCase().includes("wedding") || selectedProduct.collection?.toLowerCase().includes("soiree") || selectedProduct.name?.toLowerCase().includes("wedding") || selectedProduct.name?.toLowerCase().includes("soiree")
                    const showProductPrice = showPrices || (selectedProduct.category === "sell-dresses" && isWeddingOrSoiree)
                    if (!showProductPrice) return null
                    return (
                      <div className="text-xl font-medium ml-2">
                        {(() => {
                          if (selectedSize) {
                            const uo = selectedSize.originalPrice || 0; const ud = selectedSize.discountedPrice || 0; const hd = uo > 0 && selectedSize.discountedPrice !== undefined && ud < uo; const tp = (hd ? ud : uo || ud) * quantity;
                            if (hd) return (<><span className="line-through text-gray-400 mr-2 text-lg">{formatPrice(uo * quantity)}</span><span className="text-red-600 font-bold">{formatPrice(tp)}</span></>);
                            return <>{formatPrice(tp)}</>
                          }
                          return <>{formatPrice(getSmallestPrice(selectedProduct.sizes || []) * quantity)}</>
                        })()}
                      </div>
                    )
                  })()}
                </div>
                <Button onClick={() => { if (selectedProduct.isOutOfStock) return; if (!isCustomSizeMode) { addToCartWithSize(); return }; if (!isMeasurementsValid) { alert("Please complete your measurements"); return }; setShowCustomSizeConfirmation(true) }} className={`rounded-full px-6 py-5 ${selectedProduct.isOutOfStock ? 'bg-gray-400 opacity-60' : 'bg-black hover:bg-gray-800'}`} disabled={selectedProduct.isOutOfStock || (isCustomSizeMode ? !isMeasurementsValid : !selectedSize)}>
                  <ShoppingCart className="h-4 w-4 mr-2" />{selectedProduct.isOutOfStock ? t("outOfStock") : selectedProduct.category !== "sell-dresses" ? t("rentNow") : t("buyNow")}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Custom Size Confirmation */}
      <AlertDialog open={showCustomSizeConfirmation} onOpenChange={setShowCustomSizeConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5 text-amber-500" />{t("confirmCustomSize")}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-2">
              <p>{t("confirmCustomSizeDesc")}</p>
              <div className="bg-gray-50 p-4 rounded-lg space-y-1 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span><strong>{t("shoulder")}:</strong> {measurements.shoulder} {measurementUnit}</span>
                  <span><strong>{t("bust")}:</strong> {measurements.bust} {measurementUnit}</span>
                  <span><strong>{t("waist")}:</strong> {measurements.waist} {measurementUnit}</span>
                  <span><strong>{t("hips")}:</strong> {measurements.hips} {measurementUnit}</span>
                  <span><strong>{t("sleeve")}:</strong> {measurements.sleeve} {measurementUnit}</span>
                  <span><strong>{t("length")}:</strong> {measurements.length} {measurementUnit}</span>
                </div>
              </div>
              <p className="text-amber-600 font-medium">{t("ifAnythingIncorrect")}</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCustomSizeConfirmation(false)}>{t("reviewAgain")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { addToCartWithSize(); setShowCustomSizeConfirmation(false) }} className="bg-black hover:bg-gray-800">{t("confirmAndSendWhatsApp")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showGiftPackageSelector && selectedProduct && (
        <GiftPackageSelector product={selectedProduct as any} isOpen={showGiftPackageSelector} onClose={() => setShowGiftPackageSelector(false)} onToggleFavorite={(product) => removeFromFavorites(product.id)} isFavorite={() => true} />
      )}

      <section className="pt-28 md:pt-24 pb-16">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="mb-8">
            <Link href="/" className={`inline-flex items-center text-gray-600 hover:text-black mb-6 transition-colors ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
              <ArrowLeft className={`h-4 w-4 ${settings.language === "ar" ? "ml-2 rotate-180" : "mr-2"}`} />
              {t("backToHome")}
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-light tracking-wider mb-2">{t("myFavorites")}</h1>
                <motion.div initial={{ width: 0 }} animate={{ width: "100px" }} transition={{ duration: 0.8, delay: 0.3 }} className="h-1 bg-gradient-to-r from-purple-400 to-pink-400 mb-4 rounded-full" />
                <p className="text-gray-600">{favoritesState.count === 0 ? t("noFavoritesDesc") : `${favoritesState.count} ${favoritesState.count === 1 ? t("itemLabel") : t("itemsLabel")}`}</p>
              </div>
              {favoritesState.count > 0 && (
                <div className={`flex items-center ${settings.language === "ar" ? "space-x-reverse space-x-4" : "space-x-4"}`}>
                  {!showClearConfirm ? (
                    <Button variant="outline" onClick={() => setShowClearConfirm(true)} className="text-red-600 border-red-200 hover:bg-red-50">
                      <Trash2 className="h-4 w-4 mr-2" />{t("clearAllFavorites")}
                    </Button>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">{t("areYouSure")}</span>
                      <Button size="sm" variant="outline" onClick={() => setShowClearConfirm(false)}>{t("cancel")}</Button>
                      <Button size="sm" onClick={() => { clearFavorites(); setShowClearConfirm(false) }} className="bg-red-600 hover:bg-red-700">{t("confirm")}</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>

          {favoritesState.count === 0 ? (
            <div className="text-center py-16">
              <div className="relative mx-auto mb-6 flex justify-center"><div className="w-28 h-28 bg-gradient-to-r from-pink-50 to-purple-50 rounded-full flex items-center justify-center"><Heart className="h-14 w-14 text-purple-400" /></div></div>
              <h2 className="text-2xl font-light tracking-wider mb-4 text-purple-700">{t("noFavoritesYet")}</h2>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">{t("noFavoritesDesc")}</p>
              <Link href="/soiree/products"><Button className="bg-black text-white hover:bg-gray-800 rounded-full px-8 py-6">{t("exploreCollections")}</Button></Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {favoritesState.items.map((item: FavoriteItem, index) => (
                <motion.div key={item.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: index * 0.1 }} className="relative h-full">
                  <Card className="h-full rounded-2xl border border-gray-100 bg-transparent shadow-none hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                    <CardContent className="p-0 h-full">
                      <Link href={`/products/${item.category}/${item.id}`} className="block relative w-full h-full">
                        <div className="relative w-full aspect-[4/7] sm:aspect-[3/5] overflow-hidden rounded-2xl bg-gray-50">
                          <Image src={item.image || "/placeholder.svg"} alt={item.name} fill sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeFromFavorites(item.id) }} className="absolute top-2 right-2 z-20 p-1.5 bg-white/95 rounded-full shadow-sm hover:bg-gray-100 transition-colors border border-gray-200"><Heart className="h-4 w-4 text-red-500 fill-red-500" /></button>
                          <div className="absolute top-2 left-2 z-20 space-y-1">
                            {item.isNew && <Badge className="bg-gradient-to-r from-amber-400 to-yellow-600 text-white text-[10px] px-2 py-0.5 rounded-full border-none shadow-sm">New</Badge>}
                            {item.isBestseller && <Badge className="bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] px-2 py-0.5 rounded-full border-none shadow-sm">{t("bestRental")}</Badge>}
                            {item.isOutOfStock && <Badge className="bg-gray-900 text-white text-[10px] px-2 py-0.5 rounded-full">{t("outOfStock")}</Badge>}
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                          <div className="absolute inset-x-2 bottom-2 text-white drop-shadow-[0_6px_12px_rgba(0,0,0,0.9)]">
                            {/* Show prices if global showPrices is true OR if it's a sell dress in wedding/soiree */}
                            {(() => {
                              const isWeddingOrSoiree = item.collection?.toLowerCase().includes("wedding") || item.collection?.toLowerCase().includes("soiree") || item.name?.toLowerCase().includes("wedding") || item.name?.toLowerCase().includes("soiree")
                              const showProductPrice = showPrices || (item.category === "sell-dresses" && isWeddingOrSoiree)
                              return (
                                <>
                                  {showProductPrice ? (
                                    <h3 className="text-xs sm:text-sm font-medium mb-1 line-clamp-2">{item.name}</h3>
                                  ) : null}
                                  <div className="mt-0.5 flex items-center justify-between gap-2">
                                    {!showProductPrice ? (
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm sm:text-base font-semibold tracking-wide leading-snug line-clamp-2">
                                          {item.name}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-[11px] sm:text-xs">
                                        <span className="text-xs sm:text-sm font-semibold">{formatPrice(item.price)}</span>
                                      </div>
                                    )}
                                    <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); openSizeSelector(item) }} className="flex items-center justify-center rounded-full px-2.5 py-2 sm:px-3 sm:py-2 bg-rose-100 text-rose-700 hover:bg-rose-200" disabled={item.isOutOfStock}><ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-500" /></Button>
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        </div>
                      </Link>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>
      <Footer />
    </div>
  )
}
