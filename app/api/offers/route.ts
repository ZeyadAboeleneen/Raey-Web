import { type NextRequest, NextResponse } from "next/server"
import { NextResponse as NR } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

const requireAdminOrPermission = async (request: NextRequest) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: "Authorization required", status: 401 }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    if (decoded.role === "admin") return { decoded }

    if (decoded.employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: decoded.employeeId } })
      if (employee && employee.isActive && employee.canManageOffers) return { decoded, employee }
    }

    return { error: "Permission denied", status: 403 }
  } catch {
    return { error: "Invalid token", status: 401 }
  }
}

const transformOffer = (offer: any) => ({
  _id: offer.id,
  id: offer.id,
  title: offer.title,
  description: offer.description,
  image_url: offer.imageUrl,
  link_url: offer.linkUrl,
  discount_code: offer.discountCode,
  discountCode: offer.discountCode,
  is_active: offer.isActive,
  isActive: offer.isActive,
  priority: offer.priority,
  expiresAt: offer.expiresAt,
  created_at: offer.createdAt,
  updated_at: offer.updatedAt,
})

// ─── In-memory cache for offers ───
type CachedEntry = { body: string; expiresAt: number }
const OFFERS_TTL_MS = 60 * 1000 // 1 minute — short so expiry-based filtering is timely

const globalForOffers = globalThis as typeof globalThis & {
  _offersCache?: Map<string, CachedEntry>
}
const offersCache = globalForOffers._offersCache ?? new Map<string, CachedEntry>()
if (!globalForOffers._offersCache) {
  globalForOffers._offersCache = offersCache
}

function invalidateCache() {
  offersCache.clear()
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get("active") !== "false"
    const cacheKey = activeOnly ? "active" : "all"

    // Check in-memory cache first
    const cached = offersCache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) {
      return new NextResponse(cached.body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
        },
      })
    }

    const now = new Date()

    // Auto-deactivate any offers whose expiry has passed
    const expired = await prisma.offer.updateMany({
      where: { isActive: true, expiresAt: { lte: now } },
      data: { isActive: false },
    })
    if (expired.count > 0) invalidateCache()

    const where: any = activeOnly ? { isActive: true } : {}
    const offers = await prisma.offer.findMany({ where, orderBy: { priority: "asc" } })
    const body = JSON.stringify(offers.map(transformOffer))

    // Store in cache
    offersCache.set(cacheKey, { body, expiresAt: Date.now() + OFFERS_TTL_MS })

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
      },
    })
  } catch (error) {
    console.error("Get offers error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}


export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminOrPermission(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await request.json()
    const {
      title,
      description,
      image_url,
      link_url,
      discount_code,
      discountCode,
      is_active,
      isActive,
      display_order,
      priority,
      expiresAt,
      send_email_notification,
    } = body

    if (!description) return NextResponse.json({ error: "Description is required" }, { status: 400 })

    const resolvedDiscountCode = discountCode ?? discount_code ?? null
    const resolvedIsActive = (isActive ?? is_active) !== false
    const resolvedPriority = Number(priority ?? display_order) || 0
    const resolvedExpiresAt = expiresAt ? new Date(expiresAt) : null

    const offer = await prisma.offer.create({
      data: {
        title: title || null,
        description,
        imageUrl: image_url || null,
        linkUrl: link_url || null,
        discountCode: resolvedDiscountCode || null,
        isActive: resolvedIsActive,
        priority: resolvedPriority,
        expiresAt: resolvedExpiresAt,
      },
    })

    invalidateCache()

    // Send email to newsletter subscribers if requested
    if (send_email_notification) {
      try {
        const subscribers = await prisma.newsletterSubscriber.findMany({ select: { email: true } })
        const emails = subscribers.map((s: { email: string }) => s.email)
        if (emails.length > 0) {
          const discountSection = resolvedDiscountCode
            ? `<div style="background:#f3f4f6;padding:16px;border-radius:8px;text-align:center;margin:24px 0;">
                <p style="margin:0;font-size:13px;color:#6b7280;">Use discount code:</p>
                <p style="margin:8px 0 0;font-size:22px;font-weight:700;letter-spacing:2px;color:#111;">${resolvedDiscountCode}</p>
              </div>` : ""
          const buttonSection = link_url
            ? `<div style="text-align:center;margin-top:24px;">
                <a href="${link_url}" style="background:#111;color:#fff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:15px;">Shop Now</a>
              </div>` : ""
          const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f9f9f9;padding:24px;">
            <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
              <h1 style="font-size:24px;margin-bottom:16px;">${title || "New Offer from Raey"}</h1>
              <p style="font-size:16px;color:#374151;">${description}</p>
              ${discountSection}${buttonSection}
              <p style="font-size:12px;color:#9ca3af;margin-top:32px;">Raey — You received this because you subscribed to our newsletter.</p>
            </div></body></html>`

          Promise.all(emails.map((to: string) => sendEmail({ to, subject: title || "New Offer from Raey", html }))).catch(
            (err) => console.error("Error sending offer emails:", err)
          )
        }
      } catch (emailError) {
        console.error("Error fetching newsletter subscribers:", emailError)
      }
    }

    return NextResponse.json({ success: true, offer: transformOffer(offer) })
  } catch (error) {
    console.error("Create offer error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdminOrPermission(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Offer ID is required" }, { status: 400 })

    const body = await request.json()
    const {
      title,
      description,
      image_url,
      link_url,
      discount_code,
      discountCode,
      is_active,
      isActive,
      display_order,
      priority,
      expiresAt,
    } = body

    // Fetch existing offer to carry over any field not explicitly sent
    const existing = await prisma.offer.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Offer not found" }, { status: 404 })

    const resolvedIsActive =
      isActive !== undefined ? isActive : is_active !== undefined ? is_active : existing.isActive

    const updated = await prisma.offer.update({
      where: { id },
      data: {
        title: title !== undefined ? (title || null) : existing.title,
        description: description ?? existing.description,
        imageUrl: image_url !== undefined ? (image_url || null) : existing.imageUrl,
        linkUrl: link_url !== undefined ? (link_url || null) : existing.linkUrl,
        discountCode:
          discountCode !== undefined
            ? (discountCode || null)
            : discount_code !== undefined
            ? (discount_code || null)
            : existing.discountCode,
        isActive: resolvedIsActive,
        priority: priority !== undefined ? (Number(priority) || 0) : display_order !== undefined ? (Number(display_order) || 0) : existing.priority,
        expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : existing.expiresAt,
      },
    })

    invalidateCache()

    return NextResponse.json({ success: true, offer: transformOffer(updated) })
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    console.error("Update offer error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminOrPermission(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Offer ID is required" }, { status: 400 })

    await prisma.offer.delete({ where: { id } })
    invalidateCache()
    return NextResponse.json({ success: true, message: "Offer deleted successfully" })
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    console.error("Delete offer error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
