import type { Metadata } from "next"
import { Playfair_Display, Crimson_Text } from 'next/font/google'
import "./globals.css"
import { AuthProvider } from "@/lib/auth-context"
import { ProductProvider } from "@/lib/product-context"
import { ProductsCacheProvider } from "@/lib/products-cache"
import { OrderProvider } from "@/lib/order-context"
import { FavoritesProvider } from "@/lib/favorites-context"
import { CartProvider } from "@/lib/cart-context"
import { LocaleProvider } from "@/lib/locale-context"
import { ScrollProvider } from "@/lib/scroll-context"
import { DateProvider } from "@/lib/date-context"
import { SiteSettingsProvider, DEFAULT_SETTINGS, SiteSettings } from "@/lib/site-settings-context"
import { prisma } from "@/lib/prisma"
import { CartSuccessNotification } from "@/components/cart-success-notification"
import { HtmlLangWrapper } from "@/components/html-lang-wrapper"
import { Toaster } from "@/components/ui/toaster"
import { GlobalDateModal } from "@/components/global-date-modal"
import { warmProductsServerCache } from "@/lib/get-products-server"
import { GoogleAnalytics } from "@next/third-parties/google"

// Configure fonts with optimized loading
const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-playfair-display',
  display: 'swap',
  preload: true,
  fallback: ['serif'],
})

const crimsonText = Crimson_Text({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-crimson-text',
  display: 'swap',
  preload: true,
  fallback: ['serif'],
})

export const metadata: Metadata = {
  title: "Raey – Soirée & Couture Dresses",
  description: "Step into the world of Raey. Discover couture-inspired soirée gowns, modern bridal looks, and bespoke eveningwear crafted for unforgettable moments.",
  keywords: "Raey, soirée dresses, couture gowns, eveningwear, bridal couture, luxury fashion",
  generator: "el-raey-atelier",
  icons: {
    icon: "/raey-logo-black.png",
    shortcut: "/raey-logo-black.png",
    apple: "/raey-logo-black.png",
  },
}

async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const setting = await prisma.siteSetting.findUnique({
      where: { key: "site_settings" }
    })
    
    if (!setting || !setting.value) {
      return DEFAULT_SETTINGS
    }
    
    const value = setting.value as any
    return {
      heroImages: {
        wedding: value.heroImages?.wedding || DEFAULT_SETTINGS.heroImages.wedding,
        soiree: value.heroImages?.soiree || DEFAULT_SETTINGS.heroImages.soiree,
      }
    }
  } catch (error) {
    console.error("Failed to fetch settings:", error)
    return DEFAULT_SETTINGS
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Warm cache asynchronously without blocking render
  if (typeof window === 'undefined') {
    warmProductsServerCache()
  }

  const initialSettings = await getSiteSettings()

  return (
    <html lang="en" className={`${playfairDisplay.variable} ${crimsonText.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </head>
      <body className="font-sans">
        <GoogleAnalytics gaId="G-F487HSDE42" />
        <LocaleProvider>
          <HtmlLangWrapper>
            <AuthProvider>
              <ProductProvider>
                <ProductsCacheProvider>
                  <OrderProvider>
                    <FavoritesProvider>
                      <CartProvider>
                        <DateProvider>
                          <ScrollProvider>
                            <SiteSettingsProvider initialSettings={initialSettings}>
                              <GlobalDateModal />
                              {children}
                              <CartSuccessNotification />
                              <Toaster />
                            </SiteSettingsProvider>
                          </ScrollProvider>
                        </DateProvider>
                      </CartProvider>
                    </FavoritesProvider>
                  </OrderProvider>
                </ProductsCacheProvider>
              </ProductProvider>
            </AuthProvider>
          </HtmlLangWrapper>
        </LocaleProvider>
      </body>
    </html>
  )
}

