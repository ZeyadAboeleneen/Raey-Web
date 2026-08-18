/**
 * POST /api/ai/stylist/index   — warm the derived attribute index
 * GET  /api/ai/stylist/index   — how many gowns are catalogued
 *
 * The stylist matches on attributes read from product photographs, because the
 * ERP carries no style metadata. Requests warm the index a few gowns at a
 * time, but a fresh catalogue is best filled here, in batches.
 *
 * Protected by CRON_SECRET (the same shared secret the other maintenance
 * endpoints use) — vision calls cost money, so this must not be open.
 *
 * Typical backfill:
 *   curl -X POST "$SITE/api/ai/stylist/index?batch=25" -H "Authorization: Bearer $CRON_SECRET"
 * repeated until "remaining" reaches 0.
 */

import { type NextRequest, NextResponse } from "next/server"
import { getProductsServer } from "@/lib/get-products-server"
import { getAttributesFor, indexStats, warmIndex } from "@/lib/ai/stylist/attribute-index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get("authorization") || ""
  return header === `Bearer ${secret}`
}

/** Active, image-bearing products — the only ones worth cataloguing. */
async function taggableProducts() {
  const raw = await getProductsServer()
  return raw
    .filter((p: any) => p?.isActive !== false && (p?.image || p?.images?.length))
    .map((p: any) => ({ id: String(p.id), image: p.image, images: p.images }))
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const products = await taggableProducts()
  const existing = await getAttributesFor(products.map((p) => p.id))
  const stats = await indexStats()

  return NextResponse.json({
    ...stats,
    taggable: products.length,
    remaining: products.length - existing.size,
  })
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const batch = Math.min(
    100,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("batch") || "20", 10) || 20)
  )

  const startedAt = Date.now()
  const products = await taggableProducts()

  const tagged = await warmIndex(products, batch)

  const existing = await getAttributesFor(products.map((p) => p.id))

  return NextResponse.json({
    tagged,
    taggable: products.length,
    indexed: existing.size,
    remaining: products.length - existing.size,
    durationMs: Date.now() - startedAt,
  })
}
