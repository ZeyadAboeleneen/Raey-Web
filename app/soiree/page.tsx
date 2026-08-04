import type { Metadata } from "next"
import SoireePageClient from "./SoireePageClient"

export const revalidate = 300

export const metadata: Metadata = {
  title: "Soirée & Evening Dress Collection | Raey",
  description:
    "Browse our soirée and eveningwear collection — couture-inspired gowns available to rent or buy, with sizes, pricing and availability updated daily.",
  alternates: { canonical: "/soiree" },
  openGraph: {
    title: "Soirée & Evening Dress Collection | Raey",
    description:
      "Browse our soirée and eveningwear collection — couture-inspired gowns available to rent or buy, with sizes, pricing and availability updated daily.",
    url: "/soiree",
    type: "website",
  },
}

export default function SoireePage() {
  return <SoireePageClient />
}
