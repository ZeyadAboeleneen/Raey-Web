import { NextResponse } from "next/server";
import { getProductsServer } from "@/lib/get-products-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://raeygroup.com").replace(/\/$/, "");

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function absoluteImage(image: string): string {
  if (!image) return "";
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  return `${SITE_URL}${image.startsWith("/") ? "" : "/"}${image}`;
}

export async function GET() {
  const products = await getProductsServer();

  const items = products
    .filter((p) => p.image && p.branch)
    .map((p) => {
      const id = xmlEscape(String(p.id));
      const title = xmlEscape(p.name || `Product ${p.id}`);
      const description = xmlEscape(p.description?.trim() || p.name || `Product ${p.id}`);
      const link = xmlEscape(`${SITE_URL}/products/${p.branch}/${p.id}`);
      const imageLink = xmlEscape(absoluteImage(p.image));
      const availability = p.isActive && !p.isOutOfStock ? "in stock" : "out of stock";
      const price = `${Number(p.price || 0).toFixed(2)} EGP`;
      const condition = "new";

      return `
    <item>
      <g:id>${id}</g:id>
      <title>${title}</title>
      <description>${description}</description>
      <link>${link}</link>
      <g:image_link>${imageLink}</g:image_link>
      <g:availability>${availability}</g:availability>
      <g:price>${price}</g:price>
      <g:condition>${condition}</g:condition>
      <g:brand>Raey</g:brand>
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Raey Product Feed</title>
    <link>${SITE_URL}</link>
    <description>Raey product catalog feed for Meta/Google</description>
    ${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
