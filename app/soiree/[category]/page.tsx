"use client"

import { useState, useEffect, useMemo, useRef } from "react"
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
import { useToast } from "@/hooks/use-toast"

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

const PAGE_SIZE = 12
const WHATSAPP_NUMBER = "201094448044"

const CATEGORY_LABELS: Record<string, string> = {
  "mona-saleh": "Mona Saleh",
  "el-raey-1": "El Raey 1",
  "el-raey-2": "El Raey 2",
  "el-raey-the-yard": "El Raey The Yard",
  "sell-dresses": "Sell Dresses",
}

export default function SoireeCategoryPage() {
  const params = useParams()
  const category = params.category as string
  const categoryLabel = CATEGORY_LABELS[category] || category

  const { products: cachedProducts, loading: cacheLoading, getByCollection } = useProductsCache()
  const allProducts = useMemo(
    () => getByCollection("soiree").filter(p => p.category === category),
    [getByCollection, category]
  )

  const allProductsRef = useRef<HTMLElement>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(1)

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [showSizeSelector, setShowSizeSelector] = useState(false)
  const [showGiftPackageSelector, setShowGiftPackageSelector] = useState(false)
  const [showCustomSizeConfirmation, setShowCustomSizeConfirmation] = useState(false)
  const [occasionDate, setOccasionDate] = useState<Date | undefined>(undefined)

  const {
    isCustomSizeMode, setIsCustomSizeMode,
    measurementUnit, setMeasurementUnit,
    measurements, handleMeasurementChange,
    confirmMeasurements, setConfirmMeasurements,
    resetMeasurements, isMeasurementsValid,
  } = useCustomSize()

  const { dispatch: cartDispatch } = useCart()
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites()
  const { formatPrice } = useCurrencyFormatter()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)
  const { toast } = useToast()

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
  const isRentCategory = (cat: string) => cat !== "sell-dresses"

  useEffect(() => { const h = setTimeout(() => setDebouncedQuery(searchQuery), 250); return () => clearTimeout(h) }, [searchQuery])
  useEffect(() => { setPage(1) }, [debouncedQuery])
  useEffect(() => {
    if (showSizeSelector || showGiftPackageSelector || showCustomSizeConfirmation) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [showSizeSelector, showGiftPackageSelector, showCustomSizeConfirmation])
  useEffect(() => {
    if (!selectedProduct) return
    if (isCustomSizeMode) { setSelectedSize(null) } else if (!selectedSize && selectedProduct.sizes.length > 0) { setSelectedSize(selectedProduct.sizes[0]) }
  }, [isCustomSizeMode, selectedProduct, selectedSize])

  const filteredProducts = useMemo(() => {
    let result = allProducts
    if (debouncedQuery.trim()) {
      const normalize = (v: string) => (v || "").toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const q = normalize(debouncedQuery.trim()); const terms = q.split(/\s+/).filter(Boolean)
      const score = (p: Product) => { const n = normalize(p.name); const d = normalize(p.description); let s = 0; if (n === q) s += 8; if (n.startsWith(q)) s += 5; if (n.includes(q)) s += 3; if (d.includes(q)) s += 2; for (const t of terms) { if (n.includes(t)) s += 2; if (d.includes(t)) s += 1 }; return s }
      const scored = result.map(p => ({ p, s: score(p) })); result = scored.filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.p)
    }
    return result
  }, [allProducts, debouncedQuery])

  const totalPages = Math.max(Math.ceil(filteredProducts.length / PAGE_SIZE), 1)
  const paginatedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openSizeSelector = (product: Product) => {
    if (product.isGiftPackage) { setSelectedProduct(product); setShowGiftPackageSelector(true) } else { setSelectedProduct(product); setSelectedSize(null); setQuantity(1); setShowSizeSelector(true); setIsCustomSizeMode(true); resetMeasurements() }
  }
  const closeSizeSelector = () => { setShowSizeSelector(false); setTimeout(() => { setSelectedProduct(null); setSelectedSize(null); resetMeasurements(); setIsCustomSizeMode(true); setMeasurementUnit("cm"); setConfirmMeasurements(false) }, 300) }

  const openWhatsAppOrder = () => {
    if (!selectedProduct) return
    const isRent = isRentCategory(selectedProduct.category); const actionVerb = isRent ? "rent" : "buy"
    let message = `Hello, I'd like to ${actionVerb} this dress.\n\nName: ${selectedProduct.name}\nDress Code: ${selectedProduct.id}\nCategory: ${selectedProduct.category}\n\n`
    if (isCustomSizeMode) { message += `Size Mode: Custom (${measurementUnit})\nMeasurements:\n`; Object.entries(measurements || {}).forEach(([key, value]) => { if (value == null || value === "") return; message += `- ${key}: ${value} ${measurementUnit}\n` }); message += `\n` }
    else if (selectedSize) { message += `Selected Size:\n`; if (selectedSize.size) message += `- Size: ${selectedSize.size}\n`; if (selectedSize.volume) message += `- Volume: ${selectedSize.volume}\n`; message += `\n` }
    if (occasionDate) { try { message += `Occasion Date: ${occasionDate.toLocaleDateString()}\n` } catch {} }
    message += `Quantity: ${quantity}\nRequest Date: ${new Date().toLocaleString()}\n`
    if (typeof window !== "undefined") window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank")
  }

  const addToCart = () => {
    if (!selectedProduct) return; if (!isCustomSizeMode && !selectedSize) return; if (isCustomSizeMode && !isMeasurementsValid) return
    if (!isCustomSizeMode && selectedSize) { if (selectedSize.stockCount !== undefined && selectedSize.stockCount < quantity) { alert(`Insufficient stock`); return }; if (selectedSize.stockCount !== undefined && selectedSize.stockCount === 0) { alert(`Out of stock`); return } }
    const firstSize = selectedProduct.sizes?.[0] || null; const fallbackSize: ProductSize = { size: "custom", volume: measurementUnit, discountedPrice: selectedProduct.packagePrice || (firstSize?.discountedPrice ?? 0), originalPrice: firstSize?.originalPrice ?? 0 }
    const baseSize = selectedSize || firstSize || fallbackSize; const computedPrice = baseSize.discountedPrice || baseSize.originalPrice || selectedProduct.packagePrice || 0
    cartDispatch({ type: "ADD_ITEM", payload: { id: `${selectedProduct.id}-${isCustomSizeMode ? "custom" : baseSize.size}`, productId: selectedProduct.id, name: selectedProduct.name, price: computedPrice, originalPrice: baseSize.originalPrice, size: isCustomSizeMode ? "custom" : baseSize.size, volume: isCustomSizeMode ? measurementUnit : baseSize.volume, image: selectedProduct.images[0], category: selectedProduct.category, quantity, stockCount: isCustomSizeMode ? undefined : baseSize.stockCount, customMeasurements: isCustomSizeMode ? { unit: measurementUnit, values: measurements } : undefined } })
    openWhatsAppOrder(); closeSizeSelector()
  }

  const handlePageChange = (newPage: number) => { setPage(newPage); setTimeout(() => { allProductsRef.current?.scrollIntoView({ top: 0, behavior: "smooth" } as any) }, 100) }

  const handleFavoriteClick = (e: React.MouseEvent, product: Product) => {
    e.preventDefault(); e.stopPropagation()
    if (isFavorite(product.id)) { removeFromFavorites(product.id) } else {
      const price = product.isGiftPackage ? (product.packagePrice || 0) : getSmallestPrice(product.sizes)
      addToFavorites({ id: product.id, name: product.name, price, image: product.images[0], category: product.category, rating: product.rating, isNew: product.isNew, isBestseller: product.isBestseller, sizes: product.sizes, isGiftPackage: product.isGiftPackage, packagePrice: product.packagePrice, packageOriginalPrice: product.packageOriginalPrice, giftPackageSizes: product.giftPackageSizes })
    }
  }

  const renderProductCard = (product: Product, index: number) => {
    const isGift = product.isGiftPackage; const price = isGift ? product.packagePrice || 0 : getSmallestPrice(product.sizes)
    const originalPrice = isGift ? product.packageOriginalPrice || 0 : getSmallestOriginalPrice(product.sizes); const hasDiscount = originalPrice > 0 && price > 0 && price < originalPrice
    return (
      <motion.div key={product._id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.05 }} viewport={{ once: true }}>
        <Card className="h-full rounded-2xl border border-gray-100 bg-transparent shadow-none hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <CardContent className="p-0 h-full">
            <Link href={`/products/${product.category}/${product.id}`} className="block relative w-full h-full">
              <div className="relative w-full aspect-[4/7] sm:aspect-[3/5] overflow-hidden rounded-2xl bg-gray-50">
                <Image src={product.images[0] || "/placeholder.svg"} alt={product.name} fill className="object-cover transition-transform duration-300 group-hover:scale-105" />
                <button onClick={(e) => handleFavoriteClick(e, product)} className="absolute top-2 right-2 z-20 p-1.5 bg-white/95 rounded-full shadow-sm hover:bg-gray-100 transition-colors border border-gray-200"><Heart className={`h-4 w-4 ${isFavorite(product.id) ? "text-gray-900 fill-gray-900" : "text-gray-400"}`} /></button>
                <div className="absolute top-2 left-2 z-20 space-y-1">
                  {product.isNew && <Badge className="bg-white/90 text-gray-900 text-[10px] px-2 py-0.5 rounded-full">New</Badge>}
                  {product.isBestseller && <Badge className="bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] px-2 py-0.5 rounded-full">Best Seller</Badge>}
                  {product.isOutOfStock && <Badge className="bg-gray-900 text-white text-[10px] px-2 py-0.5 rounded-full">Out of Stock</Badge>}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute inset-x-2 bottom-2 text-white drop-shadow-[0_6px_12px_rgba(0,0,0,0.9)]">
                  <h3 className="text-xs sm:text-sm font-medium mb-1 line-clamp-2">{product.name}</h3>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <div className="text-[11px] sm:text-xs">
                      {hasDiscount ? (<><span className="line-through text-gray-300 text-[10px] sm:text-xs block">{formatPrice(originalPrice)}</span><span className="text-xs sm:text-sm font-semibold">{formatPrice(price)}</span></>) : (<span className="text-xs sm:text-sm font-semibold">{formatPrice(price)}</span>)}
                    </div>
                    <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!product.isOutOfStock) openSizeSelector(product) }} className={`flex items-center justify-center rounded-full px-2.5 py-2 sm:px-3 sm:py-2 shadow-[0_4px_10px_rgba(0,0,0,0.85)] ${product.isOutOfStock ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-rose-100 text-rose-700 hover:bg-rose-200"}`} disabled={product.isOutOfStock}>
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

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      {showSizeSelector && selectedProduct && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeSizeSelector}>
          <motion.div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} style={{ touchAction: 'pan-y' }}>
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div><h3 className="text-xl font-medium">{selectedProduct.name}</h3><p className="text-gray-600 text-sm">Select your size to {isRentCategory(selectedProduct.category) ? "rent" : "buy"}</p></div>
                <div className="flex">
                  <button onClick={(e) => { e.stopPropagation(); handleFavoriteClick(e, selectedProduct) }} className="mr-2 p-1.5 bg-white/80 backdrop-blur-sm rounded-full shadow-md hover:bg-gray-100 transition-colors"><Heart className={`h-5 w-5 ${isFavorite(selectedProduct.id) ? "text-red-500 fill-red-500" : "text-gray-700"}`} /></button>
                  <button onClick={closeSizeSelector} className="text-gray-500 hover:text-gray-700 transition-colors"><X className="h-5 w-5" /></button>
                </div>
              </div>
              <div className="flex items-center mb-6">
                <div className="relative w-20 h-20 mr-4"><Image src={selectedProduct.images[0] || "/placeholder.svg"} alt={selectedProduct.name} fill className="rounded-lg object-cover" /></div>
                <div>
                  <p className="text-gray-600 text-sm line-clamp-2">{selectedProduct.description}</p>
                  <div className="flex items-center mt-1">{[...Array(5)].map((_, i) => (<Star key={i} className={`h-4 w-4 ${i < Math.floor(selectedProduct.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />))}<span className="text-xs text-gray-600 ml-2">({selectedProduct.rating.toFixed(1)})</span></div>
                </div>
              </div>
              <div className="mb-6">
                <CustomSizeForm controller={{ isCustomSizeMode, setIsCustomSizeMode, measurementUnit, setMeasurementUnit, measurements, onMeasurementChange: handleMeasurementChange, confirmMeasurements, setConfirmMeasurements, isMeasurementsValid }} sizeChart={sizeChart} sizes={selectedProduct.sizes} selectedSize={selectedSize} onSelectSize={(size) => { setIsCustomSizeMode(false); setSelectedSize(size as any) }} formatPrice={formatPrice} />
                {isCustomSizeMode && isRentCategory(selectedProduct.category) && (<div className="mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg"><p className="mb-2 font-medium">Select your occasion date</p><Calendar mode="single" selected={occasionDate} onSelect={setOccasionDate} /></div>)}
              </div>
              <div className="flex justify-between items-center py-4 border-t border-gray-100">
                <div><span className="text-gray-600">Total:</span><div className="text-xl font-medium ml-2">
                  {(() => { const qty = quantity; if (selectedSize) { const uo = selectedSize.originalPrice || 0; const ud = selectedSize.discountedPrice || 0; const hd = uo > 0 && selectedSize.discountedPrice !== undefined && ud < uo; const to = uo * qty; const tp = (hd ? ud : uo || ud) * qty; if (hd) return (<><span className="line-through text-gray-400 mr-2 text-lg">{formatPrice(to)}</span><span className="text-red-600 font-bold">{formatPrice(tp)}</span></>); return <>{formatPrice(tp)}</> }; if (isCustomSizeMode && selectedProduct.sizes?.length > 0) { const fs = selectedProduct.sizes[0]; return <>{formatPrice((fs.discountedPrice || fs.originalPrice || 0) * qty)}</> }; return <>{formatPrice(getSmallestPrice(selectedProduct.sizes) * qty)}</> })()}
                </div></div>
                <Button onClick={() => { if (!selectedProduct || selectedProduct.isOutOfStock) return; if (!isCustomSizeMode) { addToCart(); return }; if (!isMeasurementsValid) { alert("Please complete your custom measurements"); return }; setShowCustomSizeConfirmation(true) }} className={`flex items-center rounded-full px-6 py-5 ${selectedProduct?.isOutOfStock ? 'bg-gray-400 cursor-not-allowed opacity-60' : 'bg-black hover:bg-gray-800'}`} disabled={selectedProduct?.isOutOfStock || (isCustomSizeMode ? !isMeasurementsValid : !selectedSize)}>
                  <ShoppingCart className="h-4 w-4" />{selectedProduct?.isOutOfStock ? "Out of Stock" : isRentCategory(selectedProduct.category) ? "Rent Now" : "Buy Now"}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      <AlertDialog open={showCustomSizeConfirmation} onOpenChange={setShowCustomSizeConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5 text-amber-500" />Confirm Your Custom Size</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-2"><p>Please review your measurements:</p><div className="bg-gray-50 p-4 rounded-lg space-y-1 text-sm"><div className="grid grid-cols-2 gap-2"><span><strong>Shoulder:</strong> {measurements.shoulder} {measurementUnit}</span><span><strong>Bust:</strong> {measurements.bust} {measurementUnit}</span><span><strong>Waist:</strong> {measurements.waist} {measurementUnit}</span><span><strong>Hips:</strong> {measurements.hips} {measurementUnit}</span><span><strong>Sleeve:</strong> {measurements.sleeve} {measurementUnit}</span><span><strong>Length:</strong> {measurements.length} {measurementUnit}</span></div></div><p className="text-amber-600 font-medium">If incorrect, choose &quot;Review Again&quot; to adjust.</p></AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel onClick={() => setShowCustomSizeConfirmation(false)}>Review Again</AlertDialogCancel><AlertDialogAction onClick={() => { addToCart(); setShowCustomSizeConfirmation(false) }} className="bg-black hover:bg-gray-800">Confirm & Send on WhatsApp</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showGiftPackageSelector && selectedProduct && (
        <GiftPackageSelector product={selectedProduct} isOpen={showGiftPackageSelector} onClose={() => setShowGiftPackageSelector(false)}
          onToggleFavorite={(product) => { if (isFavorite(product.id)) { removeFromFavorites(product.id) } else { addToFavorites({ id: product.id, name: product.name, price: product.packagePrice || 0, image: product.images[0], category: product.category, rating: product.rating, isNew: product.isNew || false, isBestseller: product.isBestseller || false, sizes: product.giftPackageSizes || [], isGiftPackage: product.isGiftPackage, packagePrice: product.packagePrice, packageOriginalPrice: product.packageOriginalPrice, giftPackageSizes: product.giftPackageSizes }) } }}
          isFavorite={isFavorite} />
      )}

      {/* ─── Hero ─── */}
      <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="relative h-[40vh] md:h-[50vh] flex items-center justify-center overflow-hidden">
        <motion.div className="absolute inset-0 z-0" animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 15, ease: "easeInOut", repeat: Infinity }}>
          <Image src="/elraey-bg.PNG" alt="Soiree background" fill priority className="object-cover" />
          <div className="absolute inset-0 bg-black/50" />
        </motion.div>
        <motion.div className="relative z-10 max-w-3xl mx-auto px-4 text-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Link href="/soiree" className="inline-flex items-center text-white/80 hover:text-white mb-4 text-sm transition-colors">
            <ArrowLeft className="mr-2 h-4 w-4" />Back to Soiree Collection
          </Link>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-rose-200 to-white mb-4 leading-[1.2] pb-2">{categoryLabel}</h1>
          <p className="text-sm sm:text-base text-gray-200 max-w-2xl mx-auto">Soiree Collection — {categoryLabel}</p>
        </motion.div>
      </motion.section>

      {/* ─── Products Grid ─── */}
      <section ref={allProductsRef} className="pt-8 pb-16 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mb-8 space-y-4">
            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-gray-400"><Search className="h-4 w-4" /></div>
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search products..." className="w-full rounded-full border border-gray-200 bg-white/90 py-3 pl-11 pr-5 text-sm tracking-wide focus-visible:ring-0 focus-visible:border-black placeholder:text-gray-400 transition-colors" />
              </div>
            </div>
            <div className="text-center text-sm text-gray-500">
              {debouncedQuery ? `Showing ${filteredProducts.length} of ${allProducts.length} products` : `Showing all ${allProducts.length} products`}
            </div>
          </div>

          {cacheLoading ? (<div className="flex justify-center py-16 text-gray-500 text-sm">Loading products...</div>) : filteredProducts.length === 0 ? (
            <div className="text-center py-16"><p className="text-gray-600 text-lg">No products found in this category.</p><Link href="/soiree"><Button className="mt-4 bg-black text-white hover:bg-gray-800 rounded-full">Back to Soiree</Button></Link></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 md:gap-6">{paginatedProducts.map((product, index) => renderProductCard(product as Product, index))}</div>
              {filteredProducts.length > PAGE_SIZE && (
                <div className="flex flex-col items-center gap-4 mt-12 border-t border-gray-100 pt-8">
                  <div className="flex items-center justify-center gap-2">
                    <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => handlePageChange(page - 1)} className="rounded-full px-4 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30">Previous</Button>
                    <div className="flex flex-wrap items-center justify-center gap-1 max-w-[210px] sm:max-w-none">{Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (<Button key={p} variant={page === p ? "default" : "ghost"} size="sm" onClick={() => handlePageChange(p)} className={`w-9 h-9 rounded-full p-0 transition-all duration-200 ${page === p ? "bg-black text-white shadow-md scale-110" : "hover:bg-rose-50 hover:text-rose-600 text-gray-500"}`}>{p}</Button>))}</div>
                    <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)} className="rounded-full px-4 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30">Next</Button>
                  </div>
                  <span className="text-xs text-gray-400 uppercase tracking-widest">Page {page} of {totalPages} — {filteredProducts.length} total products</span>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
