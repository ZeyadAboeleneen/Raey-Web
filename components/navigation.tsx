"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Menu, X, Heart, LogOut, Settings, ChevronDown, Search, ChevronRight, Facebook, Globe } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useFavorites } from "@/lib/favorites-context"
import { useScroll } from "@/lib/scroll-context"
import { OffersBanner } from "@/components/offers-banner"
import { useLocale } from "@/lib/locale-context"
import { useTranslation } from "@/lib/translations"

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [productsOpen, setProductsOpen] = useState(false)
  const [showCurrencySelector, setShowCurrencySelector] = useState(false)
  const currencySelectorRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const hasScrolledToCurrency = useRef(false)
  const { isScrolled } = useScroll()
  const { state: authState, logout } = useAuth()
  const { state: favoritesState } = useFavorites()
  const pathname = usePathname()
  const router = useRouter()
  const { settings, setSettings, selectCountry, setSelectCountry, selectLanguage, setSelectLanguage, isSaving } = useLocale()
  const t = useTranslation(settings.language)
  const [menuCollectionMode, setMenuCollectionMode] = useState<"wedding" | "soiree">(
    pathname.startsWith("/wedding") ? "wedding" : "soiree"
  )

  const splitToTwoLines = (text: string): [string, string?] => {
    const normalized = (text || "").trim()
    const idx = normalized.indexOf(" ")
    if (idx === -1) return [normalized]
    return [normalized.slice(0, idx), normalized.slice(idx + 1)]
  }

  // Check if we're on a page that should have a transparent-to-white header
  const isTransparentPage = pathname === "/" || pathname === "/wedding" || pathname === "/soiree"

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element

      // Don't close if clicking inside the mobile navigation or products dropdown
      if (target.closest('.mobile-navigation') || target.closest('.products-dropdown')) {
        return
      }

      setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener("click", handleClickOutside)
      return () => document.removeEventListener("click", handleClickOutside)
    }
  }, [isOpen])

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Auto-scroll to show currency dropdown when it opens (only once per open)
  useEffect(() => {
    if (showCurrencySelector && currencySelectorRef.current && mobileMenuRef.current && !hasScrolledToCurrency.current) {
      // Delay to allow dropdown animation to complete
      const timeoutId = setTimeout(() => {
        const selectorElement = currencySelectorRef.current
        const menuElement = mobileMenuRef.current

        if (selectorElement && menuElement) {
          // Get current scroll position and element positions
          const selectorRect = selectorElement.getBoundingClientRect()
          const menuRect = menuElement.getBoundingClientRect()

          // Estimate dropdown height (7 items * ~45px each = ~315px)
          const dropdownHeight = 315
          const selectorBottom = selectorRect.bottom
          const menuBottom = menuRect.bottom

          // Check if dropdown would extend beyond visible area
          if (selectorBottom + dropdownHeight > menuBottom) {
            // Calculate how much to scroll to show the full dropdown
            const scrollAmount = (selectorBottom + dropdownHeight) - menuBottom + 40 // Extra padding

            // Scroll smoothly without preventing manual scrolling
            menuElement.scrollBy({
              top: scrollAmount,
              behavior: 'smooth'
            })
          }

          hasScrolledToCurrency.current = true
        }
      }, 350) // Wait for dropdown animation to complete

      return () => clearTimeout(timeoutId)
    } else if (!showCurrencySelector) {
      // Reset the flag when selector closes so it can scroll again next time
      hasScrolledToCurrency.current = false
    }
  }, [showCurrencySelector])
  // Helper function to check if a link is active
  const isActiveLink = (href: string) => {
    if (href === "/") {
      return pathname === "/"
    }
    return pathname.startsWith(href)
  }

  // Determine header styling based on page and scroll position
  const getHeaderStyling = () => {
    // Solid white on other pages
    if (!isTransparentPage) {
      return 'bg-white/95 backdrop-blur-sm border-b border-gray-200'
    }
    // Transparent when not scrolled, background when scrolled - Now for selected pages
    return isScrolled ? 'bg-white/95 backdrop-blur-sm border-b border-gray-200' : 'bg-transparent'
  }

  // Determine logo based on page and scroll position
  const getLogo = () => {
    // Black logo on other pages
    if (!isTransparentPage) {
      return "/raey-logo-black.png"
    }
    // White logo when not scrolled, black when scrolled - Now for selected pages
    return isScrolled ? "/raey-logo-black.png" : "/raey-logo-white.PNG"
  }

  // Determine text colors based on page and scroll position
  const getTextColors = (isActive: boolean = false) => {
    // Dark colors on other pages
    if (!isTransparentPage) {
      return isActive ? 'text-rose-600' : 'text-gray-700 hover:text-black'
    }
    // White text when not scrolled, dark text when scrolled - Now for selected pages
    if (isScrolled) {
      return isActive ? 'text-rose-600' : 'text-gray-700 hover:text-black'
    } else {
      return isActive ? 'text-white' : 'text-white/90 hover:text-white'
    }
  }

  // Determine logo text colors
  const getLogoTextColors = () => {
    if (!isTransparentPage || isScrolled) {
      return {
        main: 'text-gray-900 group-hover:text-black',
        sub: 'text-gray-600'
      }
    } else {
      return {
        main: 'text-white group-hover:text-gray-200',
        sub: 'text-gray-300'
      }
    }
  }

  // Determine active indicator color
  const getActiveIndicatorColor = () => {
    if (!isTransparentPage || isScrolled) {
      return 'bg-gradient-to-r from-rose-400 to-pink-400'
    }
    return 'bg-white'
  }

  // Determine icon colors
  const getIconColors = (isActive: boolean = false) => {
    if (!isTransparentPage || isScrolled) {
      return isActive ? 'text-rose-600' : 'text-gray-700 hover:text-black'
    } else {
      return isActive ? 'text-white' : 'text-white/90 hover:text-white'
    }
  }

  // Determine button styling
  const getButtonStyling = () => {
    if (!isTransparentPage || isScrolled) {
      return {
        signIn: 'text-gray-700 hover:text-black hover:bg-gray-100',
        signUp: 'bg-black text-white hover:bg-gray-800'
      }
    } else {
      return {
        signIn: 'text-white/90 hover:text-white hover:bg-white/10',
        signUp: 'bg-white text-black hover:bg-gray-100'
      }
    }
  }

  // Determine mobile menu styling - Always use consistent white background
  const getMobileMenuStyling = () => {
    return 'bg-white'
  }

  // Mobile menu text colors - Always use consistent dark colors
  const getMobileTextColors = (isActive: boolean = false) => {
    return isActive ? 'text-rose-600 font-medium' : 'text-gray-700 hover:text-black'
  }

  const getCollectionsLink = () => {
    return menuCollectionMode === "wedding" ? "/wedding/products" : "/soiree/products"
  };

  const getCollectionLink = (collectionSlug: string) => {
    return menuCollectionMode === "wedding" ? `/wedding/${collectionSlug}` : `/soiree/${collectionSlug}`
  };

  useEffect(() => {
    if (pathname.startsWith("/wedding")) {
      setMenuCollectionMode("wedding")
      return
    }
    if (pathname.startsWith("/soiree")) {
      setMenuCollectionMode("soiree")
    }
  }, [pathname])

  // Show loading state while auth is initializing
  if (authState.isLoading) {
    return (
      <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${getHeaderStyling()}`}>
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Simplified loading navigation */}
            <div className={`h-8 w-8 rounded animate-pulse ${!isTransparentPage || isScrolled ? 'bg-gray-200' : 'bg-white/20'
              }`}></div>
            <div className="flex items-center space-x-4">
              <div className={`h-5 w-5 rounded animate-pulse ${!isTransparentPage || isScrolled ? 'bg-gray-200' : 'bg-white/20'
                }`}></div>
              <div className={`h-5 w-5 rounded animate-pulse ${!isTransparentPage || isScrolled ? 'bg-gray-200' : 'bg-white/20'
                }`}></div>
            </div>
          </div>
        </div>
      </nav>
    )
  }

  const toggleLanguage = async () => {
    const newLang = settings.language === "en" ? "ar" : "en"
    await setSettings(settings.countryCode, newLang)
  }

  const logoColors = getLogoTextColors()
  const buttonStyling = getButtonStyling()

  return (
    <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${getHeaderStyling()}`}>
      {/* Promotional Banner - Now shows offers */}
      <div>
        <OffersBanner />
      </div>

      <div className="container mx-auto px-6 relative">
        <div className="flex items-center justify-between h-16 relative">
          {/* Left side */}
          <div className="flex justify-start items-center md:space-x-2">
            {/* Mobile Menu Button - Now shown for all pages on all screen sizes to match home page */}
            <div className="block">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsOpen(!isOpen)
                }}
                className={`p-2 transition-colors ${getIconColors()}`}
              >
                {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>

            {/* Desktop Navigation - Left - Now hidden on all pages to match home page header */}
          </div>

          {/* Centered Logo - Always show in header */}
          <motion.div
            className="absolute left-1/2 transform -translate-x-1/2 pt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Link href="/" className="block">
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.3 }}
                className="flex items-center justify-center"
              >
                <Image
                  src={getLogo()}
                  alt="Raey"
                  width={864}
                  height={288}
                  className="h-24 w-auto mx-auto transition-colors duration-300"
                  style={{ objectFit: 'contain', maxWidth: 'none' }}
                  priority
                />
              </motion.div>
            </Link>
          </motion.div>

          {/* Right Side Icons */}
          <div className="flex justify-end items-center space-x-2 md:space-x-4">
            {/* Language Switcher */}
            <button
              onClick={toggleLanguage}
              className={`p-2 transition-colors flex items-center space-x-1 ${getIconColors()}`}
              title={settings.language === "en" ? "Switch to Arabic" : "Switch to English"}
            >
              <Globe className="h-4 w-4 md:h-5 md:w-5" />
              <span className="text-xs md:text-sm font-medium">
                {settings.language === "en" ? "AR" : "EN"}
              </span>
            </button>

            {/* Favorites */}
            <Link
              href="/favorites"
              className={`relative p-2 transition-colors ${getIconColors(isActiveLink("/favorites"))}`}
            >
              <Heart className="h-4 w-4 md:h-5 md:w-5" />
              {favoritesState.count > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-xs">
                  {favoritesState.count}
                </Badge>
              )}
              {isActiveLink("/favorites") && (
                <div className={`absolute inset-0 rounded-xl ${!isTransparentPage || isScrolled ? 'bg-black/3' : 'bg-white/20'
                  }`} />
              )}
            </Link>

          </div>
        </div>

        {/* Mobile Navigation */}
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-md"
                onClick={() => setIsOpen(false)}
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 }}
              />

              {/* Mobile Menu - Side Panel on Desktop, Full on Mobile */}
              <motion.div
                ref={mobileMenuRef}
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="mobile-navigation fixed left-0 top-0 bottom-0 bg-white overflow-y-auto w-full md:w-1/2 md:max-w-[50vw] md:shadow-2xl"
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  height: '100vh',
                  zIndex: 9999
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* Static Header at Top */}
                <div className="sticky top-0 bg-white z-10 border-b border-gray-200 px-6 py-4">
                  <div className="flex items-center justify-between">
                    {/* Close Button */}
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-2 -ml-2"
                    >
                      <X className="h-6 w-6 text-black" />
                    </button>

                    {/* Brand Name - Centered */}
                    <Link href="/" onClick={() => setIsOpen(false)} className="flex-1 flex justify-center">
                      <Image
                        src="/raey-logo-black.png"
                        alt="Raey"
                        width={864}
                        height={288}
                        className="h-24 w-auto"
                        style={{ objectFit: 'contain' }}
                      />
                    </Link>

                    {/* Right Icons */}
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={toggleLanguage}
                        className="p-2 transition-colors flex items-center space-x-1 text-black"
                      >
                        <Globe className="h-5 w-5" />
                        <span className="text-sm font-medium">
                          {settings.language === "en" ? "AR" : "EN"}
                        </span>
                      </button>
                      <Link href="/favorites" onClick={() => setIsOpen(false)} className="relative p-1">
                        <Heart className="h-5 w-5 text-black" />
                        {favoritesState.count > 0 && (
                          <span className="absolute -top-2 -right-2 h-4 w-4 bg-black text-white text-xs rounded-full flex items-center justify-center">
                            {favoritesState.count}
                          </span>
                        )}
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Menu Content */}
                <div className="px-6 py-6 pb-24 space-y-0">
                  {/* Quick Switches */}
                  <div className="py-4 border-b border-gray-200">
                    {/* Mobile: segmented selector */}
                    <div>
                      <div className="rounded-2xl bg-gray-50 p-3">
                        <div className="flex w-full items-center gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-sm">
                          <button
                            type="button"
                            onClick={() => {
                              setMenuCollectionMode("wedding")
                              setIsOpen(false)
                              router.push("/wedding")
                            }}
                            className={`flex-1 px-4 py-2 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-all ${menuCollectionMode === "wedding" ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm" : "text-gray-700 hover:bg-gray-50"}`}
                            style={{ letterSpacing: '0.08em' }}
                          >
                            {t("weddingCollectionsTitle")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuCollectionMode("soiree")
                              setIsOpen(false)
                              router.push("/soiree")
                            }}
                            className={`flex-1 px-4 py-2 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-all ${menuCollectionMode === "soiree" ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm" : "text-gray-700 hover:bg-gray-50"}`}
                            style={{ letterSpacing: '0.08em' }}
                          >
                            <span className="hidden md:inline">{t("soireeCollectionsTitle")}</span>
                            <span className="md:hidden">
                              {(() => {
                                const [l1, l2] = splitToTwoLines(t("soireeCollectionsTitle"))
                                return (
                                  <span className="flex flex-col items-center leading-tight">
                                    <span>{l1}</span>
                                    {l2 ? <span>{l2}</span> : null}
                                  </span>
                                )
                              })()}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Main Navigation */}

                  {/* Collection Items with Arrows */}
                  <Link
                    href={getCollectionLink("mona-saleh")}
                    className="flex items-center justify-between py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="text-sm font-light tracking-wide text-black uppercase" style={{ letterSpacing: '0.1em' }}>
                      {t("monaSalehCollection").toUpperCase()}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                  <Link
                    href={getCollectionLink("el-raey-1")}
                    className="flex items-center justify-between py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="text-sm font-light tracking-wide text-black uppercase" style={{ letterSpacing: '0.1em' }}>
                      {t("elRaey1Collection").toUpperCase()}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                  <Link
                    href={getCollectionLink("el-raey-2")}
                    className="flex items-center justify-between py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="text-sm font-light tracking-wide text-black uppercase" style={{ letterSpacing: '0.1em' }}>
                      {t("elRaey2Collection").toUpperCase()}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                  <Link
                    href={getCollectionLink("el-raey-the-yard")}
                    className="flex items-center justify-between py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="text-sm font-light tracking-wide text-black uppercase" style={{ letterSpacing: '0.1em' }}>
                      {t("elRaeyTheYardCollection").toUpperCase()}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                  <Link
                    href={getCollectionLink("sell-dresses")}
                    className="flex items-center justify-between py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="text-sm font-light tracking-wide text-black uppercase" style={{ letterSpacing: '0.1em' }}>
                      {t("sellDressesCollection").toUpperCase()}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>

                  <Link
                    href={getCollectionsLink()}
                    className="flex items-center justify-between py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="text-sm font-light tracking-wide text-black uppercase" style={{ letterSpacing: '0.1em' }}>
                      {t("collections").toUpperCase()}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>

                  <Link
                    href="/about"
                    className="flex items-center justify-between py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="text-sm font-light tracking-wide text-black uppercase" style={{ letterSpacing: '0.1em' }}>
                      {t("about").toUpperCase()}
                    </span>
                  </Link>

                  <Link
                    href="/contact"
                    className="flex items-center justify-between py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="text-sm font-light tracking-wide text-black uppercase" style={{ letterSpacing: '0.1em' }}>
                      {t("contact").toUpperCase()}
                    </span>
                  </Link>

                  {/* Currency/Locale Selector */}

                  {/* Social Media Links */}
                  <div className="flex items-center space-x-4 pt-2 border-t border-gray-200">
                    <a
                      href="https://www.instagram.com/raeygroup?igsh=MTU2d2Jrcm1qczhhZQ%3D%3D"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-black hover:opacity-70 transition-opacity"
                    >
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                      </svg>
                    </a>
                    <a
                      href="https://www.facebook.com/raey4dress/?ref=NONE_xav_ig_profile_page_web#"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-black hover:opacity-70 transition-opacity"
                    >
                      <Facebook className="h-5 w-5" />
                    </a>
                    <a
                      href="https://www.tiktok.com/@monasalehhautecouture?is_from_webapp=1&sender_device=pc"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-black hover:opacity-70 transition-opacity"
                    >
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                      </svg>
                    </a>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </nav>
  )
}
