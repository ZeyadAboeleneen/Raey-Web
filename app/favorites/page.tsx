"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Heart, ShoppingCart, Trash2, ArrowLeft } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { useFavorites, type FavoriteItem } from "@/lib/favorites-context"
import { useCart } from "@/lib/cart-context"
import { GiftPackageSelector } from "@/components/gift-package-selector"
import { QuickAddModal } from "@/components/quick-add-modal"
import { useCurrencyFormatter } from "@/hooks/use-currency"
import { useTranslation } from "@/lib/translations"
import { useLocale } from "@/lib/locale-context"


// WhatsApp ordering removed — using cart-based checkout

export default function FavoritesPage() {
  const { state: favoritesState, removeFromFavorites, clearFavorites } = useFavorites()
  const { dispatch: cartDispatch } = useCart()
  const { formatPrice, showPrices } = useCurrencyFormatter()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<FavoriteItem | null>(null)
  const [showSizeSelector, setShowSizeSelector] = useState(false)
  const [showGiftPackageSelector, setShowGiftPackageSelector] = useState(false)


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
    const validPrices = prices.filter(price => price > 0)
    return validPrices.length > 0 ? Math.min(...validPrices) : 0
  }

  const getSmallestOriginalPrice = (sizes: any[]) => {
    if (!sizes || sizes.length === 0) return 0
    const prices = sizes.map(size => size.originalPrice || 0)
    const validPrices = prices.filter(price => price > 0)
    return validPrices.length > 0 ? Math.min(...validPrices) : 0
  }

  const openSizeSelector = (product: FavoriteItem) => {
    setSelectedProduct(product)
    setShowSizeSelector(true)
  }

  const closeSizeSelector = () => {
    setShowSizeSelector(false)
    setTimeout(() => {
      setSelectedProduct(null)
    }, 300)
  }

  useEffect(() => {
    if (showSizeSelector || showGiftPackageSelector) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [showSizeSelector, showGiftPackageSelector])

  // WhatsApp ordering removed — using cart-based checkout



  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <Navigation />

      <QuickAddModal
        product={selectedProduct as any}
        isOpen={showSizeSelector}
        onClose={closeSizeSelector}
        sizeChart={sizeChart}
      />


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
                <motion.div initial={{ width: 0 }} animate={{ width: "100px" }} transition={{ duration: 0.8, delay: 0.3 }} className="h-1 bg-gradient-to-r from-rose-400 to-pink-400 mb-4 rounded-full" />
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
              <div className="relative mx-auto mb-6 flex justify-center"><div className="w-28 h-28 bg-gradient-to-r from-pink-50 to-rose-50 rounded-full flex items-center justify-center"><Heart className="h-14 w-14 text-rose-400" /></div></div>
              <h2 className="text-2xl font-light tracking-wider mb-4 text-rose-700">{t("noFavoritesYet")}</h2>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">{t("noFavoritesDesc")}</p>
              <Link href="/soiree/products"><Button className="bg-black text-white hover:bg-gray-800 rounded-full px-8 py-6">{t("exploreCollections")}</Button></Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {favoritesState.items.map((item: FavoriteItem, index) => (
                <motion.div key={item.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: index * 0.1 }} className="relative h-full">
                  <Card className="h-full rounded-2xl border border-gray-100 bg-transparent shadow-none hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                    <CardContent className="p-0 h-full">
                      <Link href={`/products/${item.branch}/${item.id}`} className="block relative w-full h-full">
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
                              const showProductPrice = showPrices || (item.branch === "sell-dresses" && isWeddingOrSoiree)
                              const isRentBranch = item.branch !== "sell-dresses"
                              const price = item.isGiftPackage ? (item.packagePrice || 0) : (isRentBranch && item.rentalPriceA && item.rentalPriceA > 0) ? item.rentalPriceA : getSmallestPrice(item.sizes || [])
                              const originalPrice = item.isGiftPackage ? (item.packageOriginalPrice || 0) : getSmallestOriginalPrice(item.sizes || [])
                              const hasDiscount = !isRentBranch && originalPrice > 0 && price > 0 && price < originalPrice
                              const clientRentalPrice = isRentBranch && item.rentalPriceC && item.rentalPriceC > 0 ? item.rentalPriceC : null

                              return (
                                <>
                                  {(showProductPrice || clientRentalPrice) ? (
                                    <h3 className="text-xs sm:text-sm font-medium mb-1 line-clamp-2">{item.name}</h3>
                                  ) : null}
                                  <div className="mt-0.5 flex items-center justify-between gap-2">
                                    {(!showProductPrice && !clientRentalPrice) ? (
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm sm:text-base font-semibold tracking-wide leading-snug line-clamp-2">
                                          {item.name}
                                        </div>
                                      </div>
                                    ) : !showProductPrice && clientRentalPrice ? (
                                      <div className="text-[11px] sm:text-xs flex flex-col items-start">
                                        <span className="text-[9px] text-rose-300 font-medium mb-0.5">
                                          Starting from
                                        </span>
                                        <span className="text-xs sm:text-sm font-semibold">
                                          {formatPrice(clientRentalPrice)}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="text-[11px] sm:text-xs flex flex-col items-start">
                                        {isRentBranch && item.rentalPriceA && item.rentalPriceA > 0 && (
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
                                          <span className="text-xs sm:text-sm font-semibold">{formatPrice(price)}</span>
                                        )}
                                      </div>
                                    )}
                                    <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!item.isOutOfStock) openSizeSelector(item) }} className="flex items-center justify-center rounded-full px-2.5 py-2 sm:px-3 sm:py-2 bg-rose-100 text-rose-700 hover:bg-rose-200" disabled={item.isOutOfStock}><ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-500" /></Button>
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
