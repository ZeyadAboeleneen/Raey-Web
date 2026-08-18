import type { Metadata } from "next"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import StylistExperience from "@/components/stylist/StylistExperience"

/**
 * /stylist — the RAEY AI Stylist consultation.
 *
 * The consultation itself is client-side and session-only, so this page has
 * nothing crawlable beyond its own copy. It is deliberately a single stable
 * URL: recommendations never become their own indexable pages, which keeps the
 * real product pages the canonical source of catalogue content.
 */

export const metadata: Metadata = {
  title: "RAEY AI Stylist | Find The One",
  description:
    "Tell RAEY what you're looking for and discover the dress that feels like you, from the RAEY wedding and soirée collections.",
  alternates: { canonical: "/stylist" },
  robots: { index: true, follow: true },
}

export default function StylistPage() {
  return (
    <>
      <Navigation />
      <main className="bg-white">
        <StylistExperience />
      </main>
      <Footer />
    </>
  )
}
