import type { Metadata } from "next"
import WeddingBranchPageClient from "./WeddingBranchPageClient"

export const revalidate = 300

function branchDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export async function generateMetadata({ params }: { params: { branch: string } }): Promise<Metadata> {
  const name = branchDisplayName(params.branch)
  const title = `${name} Wedding Dresses | Raey`
  const description = `Wedding dresses available at our ${name} collection — rent or buy, with sizes, pricing and availability updated daily.`
  return {
    title,
    description,
    alternates: { canonical: `/wedding/${params.branch}` },
    openGraph: { title, description, url: `/wedding/${params.branch}`, type: "website" },
  }
}

export default function WeddingBranchPage() {
  return <WeddingBranchPageClient />
}
