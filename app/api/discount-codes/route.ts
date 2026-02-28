import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// ── Helper ──────────────────────────────────────────────────────────────────
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

const transformCode = (code: any) => ({
  _id: code.id,
  id: code.id,
  code: code.code,
  description: code.description,
  discount_type: code.discountType,
  discount_value: code.discountValue,
  min_purchase: code.minPurchase,
  max_discount: code.maxDiscount,
  valid_from: code.validFrom,
  valid_until: code.validUntil,
  usage_limit: code.usageLimit,
  usage_count: code.usageCount,
  is_active: code.isActive,
  original_type: code.originalType,
  buy_x: code.buyX,
  get_x: code.getX,
  discount_percentage: code.discountPercentage,
  created_at: code.createdAt,
  updated_at: code.updatedAt,
})

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = requireAdmin(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const codes = await prisma.discountCode.findMany({ orderBy: { createdAt: "desc" } })
    return NextResponse.json(codes.map(transformCode))
  } catch (error) {
    console.error("Get discount codes error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = requireAdmin(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await request.json()
    const { code, description, discount_type, discount_value, min_purchase, max_discount,
      valid_from, valid_until, usage_limit, is_active, original_type, buy_x, get_x, discount_percentage } = body

    if (!code || !discount_type) {
      return NextResponse.json({ error: "Code and discount type are required" }, { status: 400 })
    }

    const created = await prisma.discountCode.create({
      data: {
        code: code.trim().toUpperCase(),
        description: description || null,
        discountType: discount_type,
        discountValue: Number(discount_value) || 0,
        minPurchase: min_purchase ? Number(min_purchase) : null,
        maxDiscount: max_discount ? Number(max_discount) : null,
        validFrom: valid_from ? new Date(valid_from) : null,
        validUntil: valid_until ? new Date(valid_until) : null,
        usageLimit: usage_limit ? Number(usage_limit) : null,
        isActive: is_active !== false,
        originalType: original_type || null,
        buyX: buy_x ? Number(buy_x) : null,
        getX: get_x ? Number(get_x) : null,
        discountPercentage: discount_percentage ? Number(discount_percentage) : null,
      },
    })

    return NextResponse.json({ success: true, discountCode: transformCode(created) })
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Discount code already exists" }, { status: 409 })
    console.error("Create discount code error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── PUT ──────────────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const auth = requireAdmin(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Discount code ID is required" }, { status: 400 })

    const body = await request.json()
    const { code, description, discount_type, discount_value, min_purchase, max_discount,
      valid_from, valid_until, usage_limit, is_active, original_type, buy_x, get_x, discount_percentage } = body

    const updated = await prisma.discountCode.update({
      where: { id },
      data: {
        code: code?.trim().toUpperCase(),
        description: description || null,
        discountType: discount_type,
        discountValue: Number(discount_value) || 0,
        minPurchase: min_purchase ? Number(min_purchase) : null,
        maxDiscount: max_discount ? Number(max_discount) : null,
        validFrom: valid_from ? new Date(valid_from) : null,
        validUntil: valid_until ? new Date(valid_until) : null,
        usageLimit: usage_limit ? Number(usage_limit) : null,
        isActive: is_active !== false,
        originalType: original_type || null,
        buyX: buy_x ? Number(buy_x) : null,
        getX: get_x ? Number(get_x) : null,
        discountPercentage: discount_percentage ? Number(discount_percentage) : null,
      },
    })

    return NextResponse.json({ success: true, discountCode: transformCode(updated) })
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Discount code not found" }, { status: 404 })
    console.error("Update discount code error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = requireAdmin(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Discount code ID is required" }, { status: 400 })

    await prisma.discountCode.delete({ where: { id } })
    return NextResponse.json({ success: true, message: "Discount code deleted successfully" })
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Discount code not found" }, { status: 404 })
    console.error("Delete discount code error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
