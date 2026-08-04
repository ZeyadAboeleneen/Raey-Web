import type { Metadata } from "next"
import SoireeProductsPageClient from "./SoireeProductsPageClient"

export const revalidate = 300

export const metadata: Metadata = {
  title: "All Soirée Dresses | Raey",
  description:
    "Explore the full catalog of soirée and evening dresses at Raey — filter by size and style, with real-time pricing and availability for rent or purchase.",
  alternates: { canonical: "/soiree/products" },
  openGraph: {
    title: "All Soirée Dresses | Raey",
    description:
      "Explore the full catalog of soirée and evening dresses at Raey — filter by size and style, with real-time pricing and availability for rent or purchase.",
    url: "/soiree/products",
    type: "website",
  },
}

export default function SoireeProductsPage() {
  return <SoireeProductsPageClient />
}
