import type { Metadata } from "next"
import BranchProductsPageClient from "./BranchProductsPageClient"

export const revalidate = 300

function branchDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export async function generateMetadata({ params }: { params: { branch: string } }): Promise<Metadata> {
  const name = branchDisplayName(params.branch)
  const title = `${name} Dresses | Raey`
  const description = `Browse dresses available at our ${name} collection — rent or buy, with sizes, pricing and availability updated daily.`
  return {
    title,
    description,
    alternates: { canonical: `/products/${params.branch}` },
    openGraph: { title, description, url: `/products/${params.branch}`, type: "website" },
  }
}

export default function BranchProductsPage() {
  return <BranchProductsPageClient />
}
