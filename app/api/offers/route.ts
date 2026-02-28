import { type NextRequest, NextResponse } from "next/server"
import { NextResponse as NR } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

const requireAdmin = (request: NextRequest) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: "Authorization required", status: 401 }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    if (decoded.role !== "admin") return { error: "Admin access required", status: 403 }
    return { decoded }
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
  is_active: offer.isActive,
  display_order: offer.displayOrder,
  created_at: offer.createdAt,
  updated_at: offer.updatedAt,
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get("active") !== "false"
    const where: any = activeOnly ? { isActive: true } : {}
    const offers = await prisma.offer.findMany({ where, orderBy: { displayOrder: "asc" } })
    return NextResponse.json(offers.map(transformOffer))
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
    const auth = requireAdmin(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { title, description, image_url, link_url, discount_code, is_active, display_order, send_email_notification } =
      await request.json()

    if (!description) return NextResponse.json({ error: "Description is required" }, { status: 400 })

    const offer = await prisma.offer.create({
      data: {
        title: title || null,
        description,
        imageUrl: image_url || null,
        linkUrl: link_url || null,
        discountCode: discount_code || null,
        isActive: is_active !== false,
        displayOrder: Number(display_order) || 0,
      },
    })

    // Send email to newsletter subscribers if requested
    if (send_email_notification) {
      try {
        const subscribers = await prisma.newsletterSubscriber.findMany({ select: { email: true } })
        const emails = subscribers.map((s: { email: string }) => s.email)
        if (emails.length > 0) {
          const discountSection = discount_code
            ? `<div style="background:#f3f4f6;padding:16px;border-radius:8px;text-align:center;margin:24px 0;">
                <p style="margin:0;font-size:13px;color:#6b7280;">Use discount code:</p>
                <p style="margin:8px 0 0;font-size:22px;font-weight:700;letter-spacing:2px;color:#111;">${discount_code}</p>
              </div>` : ""
          const buttonSection = link_url
            ? `<div style="text-align:center;margin-top:24px;">
                <a href="${link_url}" style="background:#111;color:#fff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:15px;">Shop Now</a>
              </div>` : ""
          const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f9f9f9;padding:24px;">
            <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
              <h1 style="font-size:24px;margin-bottom:16px;">${title || "New Offer from El Raey"}</h1>
              <p style="font-size:16px;color:#374151;">${description}</p>
              ${discountSection}${buttonSection}
              <p style="font-size:12px;color:#9ca3af;margin-top:32px;">El Raey — You received this because you subscribed to our newsletter.</p>
            </div></body></html>`

          // Send in batches — fire and forget
          Promise.all(emails.map((to: string) => sendEmail({ to, subject: title || "New Offer from El Raey", html }))).catch(
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
    const auth = requireAdmin(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Offer ID is required" }, { status: 400 })

    const { title, description, image_url, link_url, discount_code, is_active, display_order } = await request.json()

    const updated = await prisma.offer.update({
      where: { id },
      data: {
        title: title || null,
        description,
        imageUrl: image_url || null,
        linkUrl: link_url || null,
        discountCode: discount_code || null,
        isActive: is_active !== false,
        displayOrder: Number(display_order) || 0,
      },
    })

    return NextResponse.json({ success: true, offer: transformOffer(updated) })
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    console.error("Update offer error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = requireAdmin(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Offer ID is required" }, { status: 400 })

    await prisma.offer.delete({ where: { id } })
    return NextResponse.json({ success: true, message: "Offer deleted successfully" })
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    console.error("Delete offer error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
