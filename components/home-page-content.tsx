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

// Lazy load heavy components
const Navigation = dynamic(() => import("@/components/navigation").then(mod => ({ default: mod.Navigation })), {
  ssr: true,
})

const Footer = dynamic(() => import("@/components/footer").then(mod => ({ default: mod.Footer })), {
  ssr: true,
})
import { Badge } from "@/components/ui/badge"
import { useFavorites } from "@/lib/favorites-context"
import { useCart } from "@/lib/cart-context"
import { useCurrencyFormatter } from "@/hooks/use-currency"
import { useLocale } from "@/lib/locale-context"
import { useTranslation } from "@/lib/translations"
import { QuickAddModal } from "@/components/quick-add-modal"
import { useToast } from "@/hooks/use-toast"
import { useProductsCache } from "@/lib/products-cache"

const GiftPackageSelector = dynamic(
    () => import("@/components/gift-package-selector").then((m) => m.GiftPackageSelector),
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
    branch: string
    collection?: string
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

interface SizeChartRow {
    label: string
    shoulderIn: string
    waistIn: string
    bustIn: string
    hipsIn: string
    sleeveIn: string
    shoulderCm: string
    waistCm: string
    bustCm: string
    hipsCm: string
    sleeveCm: string
}

// WhatsApp ordering removed — using cart-based checkout

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
    const moodWords = ["GLAM", "ROMANTIC", "ICONIC"]
    const [moodIndex, setMoodIndex] = useState(0)
    const currentMood = moodWords[moodIndex]

    const [newsletterEmail, setNewsletterEmail] = useState("")
    const [isSubscribing, setIsSubscribing] = useState(false)

    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [showSizeSelector, setShowSizeSelector] = useState(false)
    const [showCustomSizeConfirmation, setShowCustomSizeConfirmation] = useState(false)
    const [showGiftPackageSelector, setShowGiftPackageSelector] = useState(false)

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

    const isRentBranch = (branch: string) => branch !== "sell-dresses"

    const openSizeSelector = (product: Product) => {
        setSelectedProduct(product)
        setShowSizeSelector(true)
    }

    const closeSizeSelector = () => {
        setShowSizeSelector(false)
        setTimeout(() => {
            setSelectedProduct(null)
        }, 300)
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

    const bestSellersRent = useMemo(() => bestSellers.filter((p) => p.branch !== "sell-dresses"), [bestSellers])
    const bestSellersSell = useMemo(() => bestSellers.filter((p) => p.branch === "sell-dresses"), [bestSellers])

    const handleFavoriteClick = (e: React.MouseEvent, product: Product) => {
        e.preventDefault()
        e.stopPropagation()
        if (isFavorite(product.id)) {
            removeFromFavorites(product.id)
        } else {
            if (product.isGiftPackage) {
                addToFavorites({
                    id: product.id, name: product.name, price: product.packagePrice || 0,
                    image: product.images[0], branch: product.branch, collection: product.collection, rating: product.rating,
                    isNew: product.isNew, isBestseller: product.isBestseller,
                    sizes: product.giftPackageSizes || [], isGiftPackage: true,
                    packagePrice: product.packagePrice, packageOriginalPrice: product.packageOriginalPrice,
                    giftPackageSizes: product.giftPackageSizes,
                    rentalPriceA: (product as any).rentalPriceA ?? undefined,
                    rentalPriceC: (product as any).rentalPriceC ?? undefined,
                })
            } else {
                const isRent = product.branch !== "sell-dresses"
                const minPrice = (isRent && (product as any).rentalPriceA > 0) ? (product as any).rentalPriceA : getMinPrice(product)
                addToFavorites({
                    id: product.id, name: product.name, price: minPrice,
                    image: product.images[0], branch: product.branch, collection: product.collection, rating: product.rating,
                    isNew: product.isNew, isBestseller: product.isBestseller, sizes: product.sizes,
                    rentalPriceA: (product as any).rentalPriceA ?? undefined,
                    rentalPriceC: (product as any).rentalPriceC ?? undefined,
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
                                            image: product.images[0], branch: product.branch, collection: product.collection, rating: product.rating,
                                            isNew: product.isNew, isBestseller: product.isBestseller,
                                            sizes: product.giftPackageSizes || [], isGiftPackage: true,
                                            packagePrice: product.packagePrice, packageOriginalPrice: product.packageOriginalPrice,
                                            giftPackageSizes: product.giftPackageSizes,
                                            rentalPriceA: (product as any).rentalPriceA ?? undefined,
                                            rentalPriceC: (product as any).rentalPriceC ?? undefined,
                                        })
                                }
                            }}
                            isFavorite={isFavorite}
                        />
                    ) : (
                        <QuickAddModal
                            product={selectedProduct as any}
                            isOpen={showSizeSelector}
                            onClose={closeSizeSelector}
                            sizeChart={sizeChart}
                        />
                    )}
                </>
            )}

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
                    <Image src="/elraey-bg.PNG" alt="Raey background" fill priority sizes="100vw" className="object-cover" />
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
                                const price = isGift ? product.packagePrice || 0 : (isRentBranch(product.branch) && product.rentalPriceA && product.rentalPriceA > 0) ? product.rentalPriceA : getMinPrice(product)
                                const originalPrice = isGift ? product.packageOriginalPrice || 0 : getSmallestOriginalPrice(product.sizes)
                                const hasDiscount = !isRentBranch(product.branch) && originalPrice > 0 && price > 0 && price < originalPrice
                                return (
                                    <motion.div key={product._id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.05 }} viewport={{ once: true }}>
                                        <Card className="h-full rounded-2xl border border-gray-100 bg-transparent shadow-none hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                                            <CardContent className="p-0 h-full">
                                                <Link href={`/products/${product.branch}/${product.id}`} className="block relative w-full h-full">
                                                    <div className="relative w-full aspect-[4/7] sm:aspect-[3/5] overflow-hidden rounded-2xl bg-gray-50">
                                                        <Image src={product.images[0] || "/placeholder.svg"} alt={product.name} fill sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
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
                                                            {(() => {
                                                                const isWeddingOrSoiree = product.collection?.toLowerCase().includes("wedding") || product.collection?.toLowerCase().includes("soiree")
                                                                const showProductPrice = showPrices || (product.branch === "sell-dresses" && isWeddingOrSoiree)
                                                                const clientRentalPrice = isRentBranch(product.branch) && product.rentalPriceC && product.rentalPriceC > 0 ? product.rentalPriceC : null
                                                                return (
                                                                    <>
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
                                                                                        Starting from
                                                                                    </span>
                                                                                    <span className="text-xs sm:text-sm font-semibold">
                                                                                        {formatPrice(clientRentalPrice)}
                                                                                    </span>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="text-[11px] sm:text-xs flex flex-col items-start">
                                                                                    {isRentBranch(product.branch) && product.rentalPriceA && product.rentalPriceA > 0 && (
                                                                                        <span className="text-[9px] text-purple-300 font-medium mb-0.5">
                                                                                            Starting at (Cat A)
                                                                                        </span>
                                                                                    )}
                                                                                    {hasDiscount ? (<><span className="line-through text-gray-300 text-[10px] sm:text-xs block">{formatPrice(originalPrice)}</span><span className="text-xs sm:text-sm font-semibold">{formatPrice(price)}</span></>) : (<span className="text-xs sm:text-sm font-semibold">{formatPrice(price)}</span>)}
                                                                                </div>
                                                                            )}
                                                                            <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!product.isOutOfStock) openSizeSelector(product) }} className={`flex items-center justify-center rounded-full px-2.5 py-2 sm:px-3 sm:py-2 shadow-[0_4px_10px_rgba(0,0,0,0.85)] ${product.isOutOfStock ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-rose-100 text-rose-700 hover:bg-rose-200"}`} disabled={product.isOutOfStock} aria-label={product.isOutOfStock ? t("outOfStock") : product.branch === "sell-dresses" ? "Buy Now" : "Rent Now"}>
                                                                                <ShoppingCart className="h-4 w-4 text-rose-500" />
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
                                                <Link href={`/products/${product.branch}/${product.id}`} className="block relative w-full h-full">
                                                    <div className="relative w-full aspect-[4/7] sm:aspect-[3/5] overflow-hidden rounded-2xl bg-gray-50">
                                                        <Image src={product.images[0] || "/placeholder.svg"} alt={product.name} fill sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
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
                                                            {/* Show prices if global showPrices is true OR if it's a sell dress in wedding/soiree */}
                                                            {(() => {
                                                                const isWeddingOrSoiree = product.collection?.toLowerCase().includes("wedding") || product.collection?.toLowerCase().includes("soiree")
                                                                const showProductPrice = showPrices || (product.branch === "sell-dresses" && isWeddingOrSoiree)
                                                                return (
                                                                    <>
                                                                        {showProductPrice ? (
                                                                            <h3 className="text-xs sm:text-sm font-medium mb-1 line-clamp-2">{product.name}</h3>
                                                                        ) : null}
                                                                        <div className="mt-0.5 flex items-center justify-between gap-2">
                                                                            {!showProductPrice ? (
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
                                                                            <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!product.isOutOfStock) openSizeSelector(product) }} className={`flex items-center justify-center rounded-full px-2.5 py-2 sm:px-3 sm:py-2 shadow-[0_4px_10px_rgba(0,0,0,0.85)] ${product.isOutOfStock ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-rose-100 text-rose-700 hover:bg-rose-200"}`} disabled={product.isOutOfStock} aria-label={product.isOutOfStock ? t("outOfStock") : product.branch === "sell-dresses" ? "Buy Now" : "Rent Now"}>
                                                                                <ShoppingCart className="h-4 w-4 text-rose-500" />
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
                                <Image src="/elraey-bg.PNG" alt="Raey Background" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover rounded-lg" priority />
                            </div>
                        </motion.div>
                    </div>
                </div>
            </motion.section>

            <Footer />
        </div>
    )
}
