import type { Metadata } from "next"
import { Playfair_Display, Crimson_Text } from 'next/font/google'
import "./globals.css"
import { AuthProvider } from "@/lib/auth-context"
import { ProductsCacheProvider } from "@/lib/products-cache"
import { OrderProvider } from "@/lib/order-context"
import { FavoritesProvider } from "@/lib/favorites-context"
import { CartProvider } from "@/lib/cart-context"
import { LocaleProvider } from "@/lib/locale-context"
import { ScrollProvider } from "@/lib/scroll-context"
import { CartSuccessNotification } from "@/components/cart-success-notification"
import { HtmlLangWrapper } from "@/components/html-lang-wrapper"
import { Toaster } from "@/components/ui/toaster"
import { getProductsServer } from "@/lib/get-products-server"

// Configure fonts
const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-playfair-display',
  display: 'swap',
})

const crimsonText = Crimson_Text({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-crimson-text',
  display: 'swap',
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

// The layout fetches products from the DB to hydrate the client cache.
// Using revalidate to allow static optimization while keeping the cache fresh.
export const revalidate = 300 // Revalidate every 5 minutes (same as the in-memory cache)

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Fetch products on the server — they will be embedded in the HTML
  // so the client renders them instantly without any loading spinner.
  const initialProducts = await getProductsServer()

  return (
    <html lang="en" className={`${playfairDisplay.variable} ${crimsonText.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </head>
      <body className="font-sans">
        <LocaleProvider>
          <HtmlLangWrapper>
            <AuthProvider>
              <ProductsCacheProvider initialProducts={initialProducts}>
                <OrderProvider>
                  <FavoritesProvider>
                    <CartProvider>
                      <ScrollProvider>
                        {children}
                        <CartSuccessNotification />
                        <Toaster />
                      </ScrollProvider>
                    </CartProvider>
                  </FavoritesProvider>
                </OrderProvider>
              </ProductsCacheProvider>
            </AuthProvider>
          </HtmlLangWrapper>
        </LocaleProvider>
      </body>
    </html>
  )
}

