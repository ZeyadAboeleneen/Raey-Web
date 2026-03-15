"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useScroll } from "@/lib/scroll-context"
import { motion, useViewportScroll, useTransform, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { ArrowRight, Sparkles, Star, ShoppingCart, Heart, X, Instagram, Facebook, Package, AlertCircle } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { useFavorites } from "@/lib/favorites-context"
import { useCart } from "@/lib/cart-context"
import { StarRating } from "@/lib/star-rating"
import { useCurrencyFormatter } from "@/hooks/use-currency"
import { useCustomSize } from "@/hooks/use-custom-size"
import type { SizeChartRow } from "@/components/custom-size-form"
import { useLocale } from "@/lib/locale-context"
import { useTranslation } from "@/lib/translations"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { useProductsCache } from "@/lib/products-cache"

const GiftPackageSelector = dynamic(
    () => import("@/components/gift-package-selector").then((m) => m.GiftPackageSelector),
    { ssr: false }
)

const CustomSizeForm = dynamic(
    () => import("@/components/custom-size-form").then((m) => m.CustomSizeForm),
    { ssr: false }
)

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
    isGiftPackage?: boolean
    packagePrice?: number
    packageOriginalPrice?: number
    giftPackageSizes?: any[]
    longDescription?: string
    isActive?: boolean
    notes?: {
        top: string[]
        middle: string[]
        base: string[]
    }
}

const WHATSAPP_NUMBER = "201094448044"

export function HomePageContent() {
    const { scrollYProgress } = useViewportScroll()
    const [scrollY, setScrollY] = useState(0)
    const { isScrolled, isLogoVisible } = useScroll()
    const [isHeroLogoVisible, setIsHeroLogoVisible] = useState(true)

    const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites()
    const { dispatch: cartDispatch } = useCart()
    const collectionsRef = useRef<HTMLElement>(null)
    const bestSellersRef = useRef<HTMLElement>(null)
    const { formatPrice, showPrices } = useCurrencyFormatter()
    const { settings } = useLocale()
    const t = useTranslation(settings.language)
    const { toast } = useToast()
    const { getBestsellers, loading: cacheLoading } = useProductsCache()
    const bestSellers = useMemo(() => getBestsellers(), [getBestsellers])
    const bestSellersLoading = cacheLoading
    const [occasionDate, setOccasionDate] = useState<Date | undefined>(undefined)
    const moodWords = ["GLAM", "ROMANTIC", "ICONIC"]
    const [moodIndex, setMoodIndex] = useState(0)
    const currentMood = moodWords[moodIndex]

    const [newsletterEmail, setNewsletterEmail] = useState("")
    const [isSubscribing, setIsSubscribing] = useState(false)

    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null)
    const [quantity, setQuantity] = useState(1)
    const [showSizeSelector, setShowSizeSelector] = useState(false)
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

    useEffect(() => {
        const handleScroll = () => setScrollY(window.scrollY)
        window.addEventListener("scroll", handleScroll)
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    useEffect(() => {
        setIsHeroLogoVisible(true)
    }, [isLogoVisible])

    useEffect(() => {
        if (showSizeSelector || showCustomSizeConfirmation) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [showSizeSelector, showCustomSizeConfirmation])

    useEffect(() => {
        if (!selectedProduct) return
        if (isCustomSizeMode) {
            setSelectedSize(null)
        } else if (!selectedSize && selectedProduct.sizes.length > 0) {
            setSelectedSize(selectedProduct.sizes[0])
        }
    }, [isCustomSizeMode, selectedProduct, selectedSize])

    useEffect(() => {
        const id = window.setInterval(() => {
            setMoodIndex((prev) => (prev + 1) % moodWords.length)
        }, 1500)
        return () => window.clearInterval(id)
    }, [])

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
                body: JSON.stringify({ email }),
            })
            const data = await response.json().catch(() => null)
            if (!response.ok || (data && data.error)) {
                toast({ title: t("stayUpdated"), description: (data && data.error) || t("newsletterError") })
                return
            }
            setNewsletterEmail("")
            toast({
                title: t("stayUpdated"),
                description: data && data.alreadySubscribed
                    ? t("newsletterAlreadySubscribed")
                    : t("newsletterSuccess"),
            })
        } catch (error) {
            console.error("Newsletter subscribe error:", error)
            toast({ title: t("stayUpdated"), description: t("newsletterError") })
        } finally {
            setIsSubscribing(false)
        }
    }

    const collections = [
        { slug: "mona-saleh", title: t("monaSalehCollection"), description: t("monaSalehDesc"), image: "/monasaleh.jpg" },
        { slug: "el-raey-1", title: t("elRaey1Collection"), description: t("elRaey1Desc"), image: "/raey1.jpg" },
        { slug: "el-raey-2", title: t("elRaey2Collection"), description: t("elRaey2Desc"), image: "/raey2.jpg" },
        { slug: "el-raey-the-yard", title: t("elRaeyTheYardCollection"), description: t("elRaeyTheYardDesc"), image: "/yard.jpg" },
        { slug: "sell-dresses", title: t("sellDressesCollection"), description: t("sellDressesDesc"), image: "/sell.jpg" },
    ]

    const isRentCategory = (category: string) => category !== "sell-dresses"

    const openSizeSelector = (product: Product) => {
        if (product.isGiftPackage) {
            setSelectedProduct(product)
            setShowSizeSelector(true)
        } else {
            setSelectedProduct(product)
            setSelectedSize(null)
            setQuantity(1)
            setShowSizeSelector(true)
            setIsCustomSizeMode(true)
            setMeasurementUnit("cm")
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

    const addToCart = () => {
        if (!selectedProduct) return
        if (!isCustomSizeMode && !selectedSize) return
        if (isCustomSizeMode && !isMeasurementsValid) return

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
            originalPrice: firstSize ? (firstSize.originalPrice ?? 0) : 0,
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
                customMeasurements: isCustomSizeMode ? { unit: measurementUnit, values: measurements } : undefined,
            },
        })

        try {
            const isRent = isRentCategory(selectedProduct.category)
            const actionVerb = isRent ? "rent" : "buy"
            const now = new Date()
            const requestDate = now.toLocaleString()
            const baseImage = selectedProduct.images?.[0]
            const origin = typeof window !== "undefined" ? window.location.origin : ""
            const imageUrl = baseImage ? (baseImage.startsWith("http") ? baseImage : `${origin}${baseImage}`) : ""

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
            } else {
                message += `Selected Size:\n`
                if (baseSize.size) message += `- Size: ${baseSize.size}\n`
                if (baseSize.volume) message += `- Volume: ${baseSize.volume}\n`
                message += `\n`
            }

            if (occasionDate) {
                try { message += `Occasion Date: ${occasionDate.toLocaleDateString()}\n` } catch { }
            }
            message += `Quantity: ${quantity}\n`
            message += `Request Date: ${requestDate}\n`

            const encoded = encodeURIComponent(message)
            if (typeof window !== "undefined") {
                window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`, "_blank")
            }
        } catch (err) {
            console.error("Error opening WhatsApp order", err)
        }

        closeSizeSelector()
    }

    const getSmallestPrice = (sizes: ProductSize[]) => {
        if (!sizes || sizes.length === 0) return 0
        const prices = sizes.map(size => size.discountedPrice || size.originalPrice || 0)
        return Math.min(...prices.filter(price => price > 0))
    }

    const getSmallestOriginalPrice = (sizes: ProductSize[]) => {
        if (!sizes || sizes.length === 0) return 0
        const prices = sizes.map(size => size.originalPrice || 0)
        return Math.min(...prices.filter(price => price > 0))
    }

    const getMinPrice = (product: Product) => getSmallestPrice(product.sizes)

    const bestSellersRent = useMemo(() => bestSellers.filter((p) => p.category !== "sell-dresses"), [bestSellers])
    const bestSellersSell = useMemo(() => bestSellers.filter((p) => p.category === "sell-dresses"), [bestSellers])

    const handleFavoriteClick = (e: React.MouseEvent, product: Product) => {
        e.preventDefault()
        e.stopPropagation()
        if (isFavorite(product.id)) {
            removeFromFavorites(product.id)
        } else {
            if (product.isGiftPackage) {
                addToFavorites({
                    id: product.id, name: product.name, price: product.packagePrice || 0,
                    image: product.images[0], category: product.category, rating: product.rating,
                    isNew: product.isNew, isBestseller: product.isBestseller,
                    sizes: product.giftPackageSizes || [], isGiftPackage: true,
                    packagePrice: product.packagePrice, packageOriginalPrice: product.packageOriginalPrice,
                    giftPackageSizes: product.giftPackageSizes,
                })
            } else {
                const minPrice = getMinPrice(product)
                addToFavorites({
                    id: product.id, name: product.name, price: minPrice,
                    image: product.images[0], category: product.category, rating: product.rating,
                    isNew: product.isNew, isBestseller: product.isBestseller, sizes: product.sizes,
                })
            }
        }
    }

    const scrollToCollections = () => collectionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const scrollToBestSellers = () => bestSellersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    const sizeChart: SizeChartRow[] = [
        { label: "XL", shoulderIn: "16", waistIn: "32", bustIn: "40", hipsIn: "42", sleeveIn: "23", shoulderCm: "40", waistCm: "81", bustCm: "101", hipsCm: "106", sleeveCm: "58" },
        { label: "L", shoulderIn: "15", waistIn: "31", bustIn: "39", hipsIn: "40", sleeveIn: "22.5", shoulderCm: "38", waistCm: "78", bustCm: "99", hipsCm: "101", sleeveCm: "57" },
        { label: "M", shoulderIn: "14.5", waistIn: "29", bustIn: "37", hipsIn: "38", sleeveIn: "22", shoulderCm: "37", waistCm: "73", bustCm: "94", hipsCm: "96", sleeveCm: "55" },
        { label: "S", shoulderIn: "14", waistIn: "27", bustIn: "35", hipsIn: "36", sleeveIn: "21.5", shoulderCm: "35", waistCm: "68", bustCm: "90", hipsCm: "91", sleeveCm: "54" },
        { label: "XS", shoulderIn: "14", waistIn: "25", bustIn: "34", hipsIn: "35", sleeveIn: "21", shoulderCm: "34", waistCm: "63", bustCm: "86", hipsCm: "88", sleeveCm: "53" },
    ]

    return (
        <div className="min-h-screen bg-white">
            <Navigation />

            {/* Size Selector Modal */}
            {showSizeSelector && selectedProduct && (
                <>
                    {selectedProduct.isGiftPackage ? (
                        <GiftPackageSelector
                            product={selectedProduct}
                            isOpen={showSizeSelector}
                            onClose={closeSizeSelector}
                            onToggleFavorite={(product) => {
                                if (isFavorite(product.id)) {
                                    removeFromFavorites(product.id)
                                } else {
                                    addToFavorites({
                                        id: product.id, name: product.name, price: product.packagePrice || 0,
                                        image: product.images[0], category: product.category, rating: product.rating,
                                        isNew: product.isNew, isBestseller: product.isBestseller,
                                        sizes: product.giftPackageSizes || [], isGiftPackage: true,
                                        packagePrice: product.packagePrice, packageOriginalPrice: product.packageOriginalPrice,
                                        giftPackageSizes: product.giftPackageSizes,
                                    })
                                }
                            }}
                            isFavorite={isFavorite}
                        />
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                            onClick={closeSizeSelector}
                            style={{ touchAction: 'none' }}
                        >
                            <motion.div
                                className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden shadow-2xl"
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                onClick={(e) => e.stopPropagation()}
                                style={{ touchAction: 'pan-y' }}
                            >
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="text-xl font-medium">{selectedProduct.name}</h3>
                                            <p className="text-gray-600 text-sm">{t("selectSize")}</p>
                                        </div>
                                        <div className="flex">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (isFavorite(selectedProduct.id)) {
                                                        removeFromFavorites(selectedProduct.id)
                                                    } else {
                                                        addToFavorites({
                                                            id: selectedProduct.id, name: selectedProduct.name,
                                                            price: getSmallestPrice(selectedProduct.sizes),
                                                            image: selectedProduct.images[0], category: selectedProduct.category,
                                                            rating: selectedProduct.rating, isNew: selectedProduct.isNew || false,
                                                            isBestseller: selectedProduct.isBestseller || false, sizes: selectedProduct.sizes || [],
                                                        })
                                                    }
                                                }}
                                                className="mr-2 p-1.5 bg-white/80 backdrop-blur-sm rounded-full shadow-md hover:bg-gray-100 transition-colors"
                                            >
                                                <Heart className={`h-5 w-5 ${isFavorite(selectedProduct.id) ? "text-rose-400 fill-rose-400" : "text-gray-700"}`} />
                                            </button>
                                            <button onClick={closeSizeSelector} className="text-gray-500 hover:text-gray-700 transition-colors">
                                                <X className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center mb-6">
                                        <div className="relative w-20 h-20 mr-4">
                                            <Image src={selectedProduct.images[0] || "/placeholder.svg"} alt={selectedProduct.name} fill className="rounded-lg object-cover" />
                                        </div>
                                        <div>
                                            <p className="text-gray-600 text-sm line-clamp-2">{selectedProduct.description}</p>
                                            <div className="flex items-center mt-1">
                                                <StarRating rating={selectedProduct.rating || 0} />
                                                <span className="text-xs text-gray-600 ml-2">({selectedProduct.rating ? selectedProduct.rating.toFixed(1) : '0.0'})</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mb-6">
                                        <CustomSizeForm
                                            controller={{
                                                isCustomSizeMode, setIsCustomSizeMode, measurementUnit, setMeasurementUnit,
                                                measurements, onMeasurementChange: handleMeasurementChange,
                                                confirmMeasurements, setConfirmMeasurements, isMeasurementsValid,
                                            }}
                                            sizeChart={sizeChart}
                                            sizes={selectedProduct.sizes}
                                            selectedSize={selectedSize}
                                            onSelectSize={(size) => { setIsCustomSizeMode(false); setSelectedSize(size as any) }}
                                            formatPrice={formatPrice}
                                        />
                                        {isCustomSizeMode && selectedProduct && isRentCategory(selectedProduct.category) && (
                                            <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                                                <p className="mb-2 font-medium">{t("selectOccasionDate")}</p>
                                                <Calendar mode="single" selected={occasionDate} onSelect={setOccasionDate} />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between gap-3 py-4 border-t border-gray-100">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-gray-600 mb-1">{t("total")}:</div>
                                            <div className="text-lg font-light">
                                                {(() => {
                                                    const qty = quantity
                                                    if (selectedSize) {
                                                        const unitOriginal = selectedSize.originalPrice || 0
                                                        const unitDiscount = selectedSize.discountedPrice || 0
                                                        const hasDiscount = unitOriginal > 0 && selectedSize.discountedPrice !== undefined && unitDiscount < unitOriginal
                                                        const totalOriginal = unitOriginal * qty
                                                        const totalPrice = (hasDiscount ? unitDiscount : (unitOriginal || unitDiscount)) * qty
                                                        if (hasDiscount) {
                                                            return (<><span className="line-through text-gray-300 mr-2 text-base">{formatPrice(totalOriginal)}</span><span className="text-red-500 font-bold">{formatPrice(totalPrice)}</span></>)
                                                        }
                                                        return <>{formatPrice(totalPrice)}</>
                                                    }
                                                    const baseUnitPrice = getSmallestPrice(selectedProduct.sizes)
                                                    return <>{formatPrice(baseUnitPrice * qty)}</>
                                                })()}
                                            </div>
                                        </div>

                                        <Button
                                            onClick={() => {
                                                if (!selectedProduct || selectedProduct.isOutOfStock) return
                                                if (!isCustomSizeMode) { addToCart(); return }
                                                if (!isMeasurementsValid) { alert("Please complete your custom measurements"); return }
                                                setShowCustomSizeConfirmation(true)
                                            }}
                                            className={`flex items-center rounded-full px-6 py-5 flex-shrink-0 ${selectedProduct?.isOutOfStock || (!isCustomSizeMode && selectedSize && selectedSize.stockCount !== undefined && selectedSize.stockCount === 0) ? 'bg-gray-400 cursor-not-allowed opacity-60' : 'bg-black hover:bg-gray-800'}`}
                                            disabled={selectedProduct?.isOutOfStock || (!isCustomSizeMode && selectedSize && selectedSize.stockCount !== undefined && selectedSize.stockCount === 0) || (isCustomSizeMode ? !isMeasurementsValid : !selectedSize)}
                                        >
                                            <ShoppingCart className="h-4 w-4 mr-2 text-rose-400" />
                                            {selectedProduct?.isOutOfStock || (!isCustomSizeMode && selectedSize && selectedSize.stockCount !== undefined && selectedSize.stockCount === 0)
                                                ? t("outOfStock")
                                                : selectedProduct?.category === "sell-dresses" ? "Buy Now" : "Rent Now"}
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
                            {t("confirmCustomSize")}
                        </AlertDialogTitle>
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
                        <AlertDialogAction onClick={() => { addToCart(); setShowCustomSizeConfirmation(false) }} className="bg-black hover:bg-gray-800">
                            {t("confirmAndSendWhatsApp")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Hero Section */}
            <motion.section
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="relative h-screen flex items-center justify-center overflow-hidden"
            >
                <motion.div
                    className="absolute inset-0 z-0"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 15, ease: "easeInOut", repeat: Infinity }}
                >
                    <Image src="/elraey-bg.PNG" alt="Raey background" fill priority className="object-cover" />
                    <div className="absolute inset-0 bg-black/45" />
                </motion.div>

                {isHeroLogoVisible && (
                    <motion.div
                        className="relative z-10 max-w-3xl mx-auto px-4 text-center"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5 }}
                    >
                        <p className="text-xs sm:text-sm tracking-[0.35em] uppercase text-rose-200 mb-4">{t("heroSubtitle")}</p>
                        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white mb-4 leading-tight">
                            {t("heroTitle")}
                        </h1>
                        <p className="text-sm sm:text-base text-gray-200 max-w-2xl mx-auto mb-6">
                            {t("heroDescription")}
                        </p>
                        <Button onClick={scrollToCollections} className="bg-rose-400 text-white hover:bg-rose-500 rounded-full px-6 py-3 text-sm sm:text-base inline-flex items-center justify-center">
                            <span>{t("browseCollections")}</span>
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                        <div className="mt-4 flex justify-center">
                            <Button variant="outline" onClick={scrollToBestSellers} className="border-black text-black hover:bg-black hover:text-white bg-white rounded-full px-6 py-3 sm:py-4 text-xs sm:text-sm group relative overflow-hidden inline-flex items-center justify-center">
                                <span className="relative z-10">{t("viewBestRental")}</span>
                                <ArrowRight className="ml-2 h-4 w-4 relative z-10 text-rose-400" />
                                <motion.span className="absolute inset-0 bg-black opacity-0 group-hover:opacity-100" initial={{ x: "-100%" }} whileHover={{ x: 0 }} transition={{ duration: 0.2 }} />
                            </Button>
                        </div>
                    </motion.div>
                )}
            </motion.section>

            {/* Mood Section */}
            <motion.section initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.6 }} viewport={{ once: true, amount: 0.3 }} className="py-10 sm:py-12 bg-rose-50 overflow-hidden">
                <div className="container mx-auto px-4 sm:px-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} viewport={{ once: true }} className="max-w-2xl mx-auto text-center space-y-4">
                        <p className="text-[10px] sm:text-xs tracking-[0.35em] uppercase text-rose-600">{t("raeyEvenings")}</p>
                        <div className="flex flex-col items-center gap-3">
                            <div className="relative inline-flex h-9 sm:h-11 overflow-hidden">
                                <AnimatePresence mode="wait">
                                    <motion.span key={currentMood} initial={{ y: "100%", opacity: 0 }} animate={{ y: "0%", opacity: 1 }} exit={{ y: "-100%", opacity: 0 }} transition={{ duration: 0.5, ease: "easeInOut" }} className="px-3 sm:px-4 text-lg sm:text-2xl md:text-3xl font-semibold bg-gradient-to-r from-rose-500 via-rose-400 to-pink-500 bg-clip-text text-transparent uppercase tracking-[0.35em]">
                                        {currentMood}
                                    </motion.span>
                                </AnimatePresence>
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[11px] sm:text-xs">
                                {moodWords.map((mood, index) => {
                                    const isActive = index === moodIndex
                                    return (
                                        <button key={mood} onClick={() => setMoodIndex(index)} className={`px-3 py-1 rounded-full border transition-all duration-200 ${isActive ? "border-rose-600 bg-white text-rose-700 shadow-sm" : "border-rose-100 text-rose-700/80 hover:border-rose-300 hover:bg-white/70"}`} type="button">
                                            {mood}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                        <motion.p className="text-xs sm:text-sm text-rose-900/90 max-w-xl mx-auto" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.25 }} viewport={{ once: true }}>
                            {t("moodDescription")}
                        </motion.p>
                        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.35 }} viewport={{ once: true }} className="pt-1 flex justify-center">
                            <Button onClick={scrollToCollections} className="bg-white text-rose-600 hover:bg-rose-100 rounded-full px-6 py-3 text-sm sm:text-base inline-flex items-center justify-center relative overflow-hidden group border border-rose-200">
                                <span className="relative z-10">{t("findMyDress")}</span>
                                <ArrowRight className="ml-2 h-5 w-5 relative z-10 text-rose-500" />
                                <motion.span className="absolute inset-0 bg-gradient-to-r from-rose-100 via-rose-200 to-rose-100 opacity-0 group-hover:opacity-100" initial={{ x: "-100%" }} whileHover={{ x: 0 }} transition={{ duration: 0.2 }} />
                            </Button>
                        </motion.div>
                    </motion.div>
                </div>
            </motion.section>

            {/* Best Rental */}
            <motion.section ref={bestSellersRef} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.6 }} viewport={{ once: true, amount: 0.3 }} className="py-16 bg-white overflow-hidden">
                <div className="container mx-auto px-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} viewport={{ once: true }} className="text-center mb-10">
                        <h2 className="text-2xl md:text-3xl font-semibold tracking-[0.35em] uppercase bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 bg-clip-text text-transparent mb-4 font-serif">{t("bestRental")}</h2>
                        <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base">{t("bestRentalDesc")}</p>
                    </motion.div>
                    {bestSellersLoading ? (
                        <div className="flex justify-center py-10 text-gray-500 text-sm">{t("loadingBestRentals")}</div>
                    ) : bestSellersRent.length === 0 ? (
                        <div className="flex justify-center py-10 text-gray-500 text-sm">{t("noBestRentals")}</div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5">
                            {bestSellersRent.slice(0, 8).map((product, index) => {
                                const isGift = product.isGiftPackage
                                const price = isGift ? product.packagePrice || 0 : getMinPrice(product)
                                const originalPrice = isGift ? product.packageOriginalPrice || 0 : getSmallestOriginalPrice(product.sizes)
                                const hasDiscount = originalPrice > 0 && price > 0 && price < originalPrice
                                return (
                                    <motion.div key={product._id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.05 }} viewport={{ once: true }}>
                                        <Card className="h-full rounded-2xl border border-gray-100 bg-transparent shadow-none hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                                            <CardContent className="p-0 h-full">
                                                <Link href={`/products/${product.category}/${product.id}`} className="block relative w-full h-full">
                                                    <div className="relative w-full aspect-[4/7] sm:aspect-[3/5] overflow-hidden rounded-2xl bg-gray-50">
                                                        <Image src={product.images[0] || "/placeholder.svg"} alt={product.name} fill className="object-cover transition-transform duration-300 group-hover:scale-105" />
                                                        <button onClick={(e) => handleFavoriteClick(e as any, product)} className="absolute top-2 right-2 z-20 p-1.5 bg-white/95 rounded-full shadow-sm hover:bg-gray-100 transition-colors border border-gray-200" aria-label={isFavorite(product.id) ? "Remove from favorites" : "Add to favorites"}>
                                                            <Heart className={`h-4 w-4 ${isFavorite(product.id) ? "text-gray-900 fill-gray-900" : "text-gray-400"}`} />
                                                        </button>
                                                        <div className="absolute top-2 left-2 z-20 space-y-1">
                                                            {product.isNew && <Badge className="bg-gradient-to-r from-amber-400 to-yellow-600 text-white text-[10px] px-2 py-0.5 rounded-full border-none shadow-sm">New</Badge>}
                                                            {product.isBestseller && <Badge className="bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] px-2 py-0.5 rounded-full border-none shadow-sm">Best Rental</Badge>}
                                                            {product.isOutOfStock && <Badge className="bg-gray-900 text-white text-[10px] px-2 py-0.5 rounded-full">Out of Stock</Badge>}
                                                        </div>
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                                                        <div className="absolute inset-x-2 bottom-2 text-white drop-shadow-[0_6px_12px_rgba(0,0,0,0.9)]">
                                                            {showPrices ? (
                                                                <h3 className="text-xs sm:text-sm font-medium mb-1 line-clamp-2">{product.name}</h3>
                                                            ) : null}
                                                            <div className="mt-0.5 flex items-center justify-between gap-2">
                                                                {!showPrices ? (
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-sm sm:text-base font-semibold tracking-wide leading-snug line-clamp-2">
                                                                            {product.name}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-[11px] sm:text-xs">
                                                                        {hasDiscount ? (<><span className="line-through text-gray-300 text-[10px] sm:text-xs block">{formatPrice(originalPrice)}</span><span className="text-xs sm:text-sm font-semibold">{formatPrice(price)}</span></>) : (<span className="text-xs sm:text-sm font-semibold">{formatPrice(price)}</span>)}
                                                                    </div>
                                                                )}
                                                                <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!product.isOutOfStock) openSizeSelector(product) }} className={`flex items-center justify-center rounded-full px-2.5 py-2 sm:px-3 sm:py-2 shadow-[0_4px_10px_rgba(0,0,0,0.85)] ${product.isOutOfStock ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-rose-100 text-rose-700 hover:bg-rose-200"}`} disabled={product.isOutOfStock} aria-label={product.isOutOfStock ? t("outOfStock") : product.category === "sell-dresses" ? "Buy Now" : "Rent Now"}>
                                                                    <ShoppingCart className="h-4 w-4 text-rose-500" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Link>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </motion.section>

            {/* Best Rental (Sell) */}
            <motion.section initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.6 }} viewport={{ once: true, amount: 0.3 }} className="py-16 bg-rose-50 overflow-hidden">
                <div className="container mx-auto px-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} viewport={{ once: true }} className="text-center mb-10">
                        <h2 className="text-2xl md:text-3xl font-semibold tracking-[0.35em] uppercase bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 bg-clip-text text-transparent mb-4 font-serif">{t("bestRental")}</h2>
                        <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base">{t("bestRentalSellDesc")}</p>
                    </motion.div>
                    {bestSellersLoading ? (
                        <div className="flex justify-center py-10 text-gray-500 text-sm">{t("loadingBestRentals")}</div>
                    ) : bestSellersSell.length === 0 ? (
                        <div className="flex justify-center py-10 text-gray-500 text-sm">{t("noBestRentals")}</div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5">
                            {bestSellersSell.slice(0, 8).map((product, index) => {
                                const isGift = product.isGiftPackage
                                const price = isGift ? product.packagePrice || 0 : getMinPrice(product)
                                const originalPrice = isGift ? product.packageOriginalPrice || 0 : getSmallestOriginalPrice(product.sizes)
                                const hasDiscount = originalPrice > 0 && price > 0 && price < originalPrice
                                return (
                                    <motion.div key={product._id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.05 }} viewport={{ once: true }}>
                                        <Card className="h-full rounded-2xl border border-gray-100 bg-transparent shadow-none hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                                            <CardContent className="p-0 h-full">
                                                <Link href={`/products/${product.category}/${product.id}`} className="block relative w-full h-full">
                                                    <div className="relative w-full aspect-[4/7] sm:aspect-[3/5] overflow-hidden rounded-2xl bg-gray-50">
                                                        <Image src={product.images[0] || "/placeholder.svg"} alt={product.name} fill className="object-cover transition-transform duration-300 group-hover:scale-105" />
                                                        <button onClick={(e) => handleFavoriteClick(e as any, product)} className="absolute top-2 right-2 z-20 p-1.5 bg-white/95 rounded-full shadow-sm hover:bg-gray-100 transition-colors border border-gray-200" aria-label={isFavorite(product.id) ? "Remove from favorites" : "Add to favorites"}>
                                                            <Heart className={`h-4 w-4 ${isFavorite(product.id) ? "text-gray-900 fill-gray-900" : "text-gray-400"}`} />
                                                        </button>
                                                        <div className="absolute top-2 left-2 z-20 space-y-1">
                                                            {product.isNew && <Badge className="bg-gradient-to-r from-amber-400 to-yellow-600 text-white text-[10px] px-2 py-0.5 rounded-full border-none shadow-sm">New</Badge>}
                                                            {product.isBestseller && <Badge className="bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] px-2 py-0.5 rounded-full border-none shadow-sm">Best Rental</Badge>}
                                                            {product.isOutOfStock && <Badge className="bg-gray-900 text-white text-[10px] px-2 py-0.5 rounded-full">Out of Stock</Badge>}
                                                        </div>
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                                                        <div className="absolute inset-x-2 bottom-2 text-white drop-shadow-[0_6px_12px_rgba(0,0,0,0.9)]">
                                                            {showPrices ? (
                                                                <h3 className="text-xs sm:text-sm font-medium mb-1 line-clamp-2">{product.name}</h3>
                                                            ) : null}
                                                            <div className="mt-0.5 flex items-center justify-between gap-2">
                                                                {!showPrices ? (
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-sm sm:text-base font-semibold tracking-wide leading-snug line-clamp-2">
                                                                            {product.name}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-[11px] sm:text-xs">
                                                                        {hasDiscount ? (<><span className="line-through text-gray-300 text-[10px] sm:text-xs block">{formatPrice(originalPrice)}</span><span className="text-xs sm:text-sm font-semibold">{formatPrice(price)}</span></>) : (<span className="text-xs sm:text-sm font-semibold">{formatPrice(price)}</span>)}
                                                                    </div>
                                                                )}
                                                                <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!product.isOutOfStock) openSizeSelector(product) }} className={`flex items-center justify-center rounded-full px-2.5 py-2 sm:px-3 sm:py-2 shadow-[0_4px_10px_rgba(0,0,0,0.85)] ${product.isOutOfStock ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-rose-100 text-rose-700 hover:bg-rose-200"}`} disabled={product.isOutOfStock} aria-label={product.isOutOfStock ? t("outOfStock") : product.category === "sell-dresses" ? "Buy Now" : "Rent Now"}>
                                                                    <ShoppingCart className="h-4 w-4 text-rose-500" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Link>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </motion.section>

            {/* Collections Section */}
            <motion.section ref={collectionsRef} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.6 }} viewport={{ once: true, amount: 0.3 }} className="py-20 bg-white overflow-hidden">
                <div className="container mx-auto px-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }} viewport={{ once: true }} className="text-center mb-16">
                        <h2 className="text-2xl md:text-3xl font-semibold tracking-[0.35em] uppercase bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 bg-clip-text text-transparent mb-4 font-serif">{t("collectionsTitle")}</h2>
                        <motion.div initial={{ width: 0 }} whileInView={{ width: "100px" }} transition={{ duration: 0.3, delay: 0.2 }} viewport={{ once: true }} className="h-1 bg-gradient-to-r from-rose-400 to-pink-400 mx-auto my-6 rounded-full" />
                        <p className="text-gray-600 max-w-2xl mx-auto">{t("soireeCollectionsDesc")}</p>
                    </motion.div>
                    <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                        {collections.map((collection) => (
                            <Link key={collection.slug} href={`/products/${collection.slug}`} className="group">
                                <Card className="h-full border border-gray-100/80 bg-white/80 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden rounded-3xl group-hover:-translate-y-1">
                                    <CardContent className="p-0 flex flex-col h-full">
                                        <div className="relative h-52 sm:h-56 w-full overflow-hidden">
                                            <Image src={collection.image} alt={collection.title} fill className="object-cover object-top transition-transform duration-700" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 20vw" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
                                            <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-4">
                                                <div>
                                                    <h3 className="text-lg md:text-xl font-light tracking-[0.18em] text-white font-serif mb-1 uppercase">{collection.title}</h3>
                                                    <p className="text-[11px] md:text-xs text-gray-100/90 line-clamp-2 leading-relaxed">{collection.description}</p>
                                                </div>
                                                <div className="flex items-center text-[11px] md:text-xs font-medium text-white/90">
                                                    <span className="hidden sm:inline-block mr-1 tracking-wide">{t("viewAll")}</span>
                                                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1.5 transition-transform duration-200" />
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* Newsletter */}
            <section className="py-10 md:py-16 bg-rose-50">
                <div className="container mx-auto px-4 sm:px-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} viewport={{ once: true }} className="max-w-md mx-auto text-center px-2">
                        <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold text-gray-900 mb-2 sm:mb-3">{t("stayUpdated")}</h2>
                        <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-8 max-w-md mx-auto">{t("subscribeForOffers")}</p>
                        <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full max-w-xs sm:max-w-md mx-auto">
                            <input type="email" placeholder={t("yourEmail")} className="flex-1 px-4 py-2 sm:py-3 text-sm sm:text-base rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent" value={newsletterEmail} onChange={(event) => setNewsletterEmail(event.target.value)} disabled={isSubscribing} required />
                            <button type="submit" className="bg-rose-400 text-white text-sm sm:text-base px-4 sm:px-6 py-2 sm:py-3 rounded-full hover:bg-rose-500 transition-colors whitespace-nowrap disabled:opacity-70 disabled:cursor-not-allowed" disabled={isSubscribing}>
                                {isSubscribing ? t("saving") : t("subscribe")}
                            </button>
                        </form>
                        <p className="text-xs text-gray-500 mt-2 sm:mt-3 px-2">{t("subscribeDisclaimer")}</p>
                    </motion.div>
                </div>
            </section>

            {/* About Preview */}
            <motion.section initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.6 }} viewport={{ once: true, amount: 0.3 }} className="py-20 bg-white overflow-hidden">
                <div className="container mx-auto px-6">
                    <div className="grid md:grid-cols-2 gap-12 items-center">
                        <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }} viewport={{ once: true }} className="order-1 md:order-2">
                            <h2 className="text-3xl md:text-4xl font-light tracking-wider mb-6">{t("whyChooseRaey")}</h2>
                            <motion.p className="text-gray-600 mb-6 leading-relaxed" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.15 }} viewport={{ once: true }}>
                                {t("whyChooseRaeyDesc")}
                            </motion.p>
                            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
                                <div className="flex items-start space-x-3">
                                    <div className="mt-1 rounded-full bg-rose-100 text-rose-600 p-2"><Sparkles className="h-4 w-4" /></div>
                                    <div><h3 className="text-sm font-semibold tracking-wide uppercase">{t("signatureDesigns")}</h3><p className="text-sm text-gray-600">{t("signatureDesignsDesc")}</p></div>
                                </div>
                                <div className="flex items-start space-x-3">
                                    <div className="mt-1 rounded-full bg-rose-100 text-rose-600 p-2"><Star className="h-4 w-4" /></div>
                                    <div><h3 className="text-sm font-semibold tracking-wide uppercase">{t("premiumQuality")}</h3><p className="text-sm text-gray-600">{t("premiumQualityDesc")}</p></div>
                                </div>
                                <div className="flex items-start space-x-3">
                                    <div className="mt-1 rounded-full bg-rose-100 text-rose-600 p-2"><Package className="h-4 w-4" /></div>
                                    <div><h3 className="text-sm font-semibold tracking-wide uppercase">{t("flexibleChoices")}</h3><p className="text-sm text-gray-600">{t("flexibleChoicesDesc")}</p></div>
                                </div>
                            </div>
                            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.35 }} viewport={{ once: true }}>
                                <Link href="/about">
                                    <Button variant="outline" className="border-black text-black hover:bg-black hover:text-white bg-transparent rounded-full px-6 py-5 group relative overflow-hidden">
                                        <span className="relative z-10">{t("learnMoreAboutUs")}</span>
                                        <ArrowRight className="ml-2 h-4 w-4 relative z-10 text-rose-400" />
                                        <motion.span className="absolute inset-0 bg-black opacity-0 group-hover:opacity-100" initial={{ x: "-100%" }} whileHover={{ x: 0 }} transition={{ duration: 0.2 }} />
                                    </Button>
                                </Link>
                            </motion.div>
                        </motion.div>
                        <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }} viewport={{ once: true }} className="order-2 md:order-1">
                            <div className="w-full h-64 md:h-96 relative">
                                <Image src="/elraey-bg.PNG" alt="Raey Background" fill className="object-cover rounded-lg" priority />
                            </div>
                        </motion.div>
                    </div>
                </div>
            </motion.section>

            <Footer />
        </div>
    )
}
