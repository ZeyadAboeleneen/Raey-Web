import type { Metadata } from "next"
import WeddingPageClient from "./WeddingPageClient"

export const revalidate = 300

export const metadata: Metadata = {
  title: "Wedding Dress Collection | Raey",
  description:
    "Browse our wedding dress collection — bridal gowns available to rent or buy, with sizes, pricing and availability updated daily.",
  alternates: { canonical: "/wedding" },
  openGraph: {
    title: "Wedding Dress Collection | Raey",
    description:
      "Browse our wedding dress collection — bridal gowns available to rent or buy, with sizes, pricing and availability updated daily.",
    url: "/wedding",
    type: "website",
  },
}

export default function WeddingPage() {
  return <WeddingPageClient />
}
