import type { Metadata } from "next"
import WeddingProductsPageClient from "./WeddingProductsPageClient"

export const revalidate = 300

export const metadata: Metadata = {
  title: "All Wedding Dresses | Raey",
  description:
    "Explore the full catalog of wedding dresses at Raey — filter by size and style, with real-time pricing and availability for rent or purchase.",
  alternates: { canonical: "/wedding/products" },
  openGraph: {
    title: "All Wedding Dresses | Raey",
    description:
      "Explore the full catalog of wedding dresses at Raey — filter by size and style, with real-time pricing and availability for rent or purchase.",
    url: "/wedding/products",
    type: "website",
  },
}

export default function WeddingProductsPage() {
  return <WeddingProductsPageClient />
}
