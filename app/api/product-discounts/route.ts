import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { getErpUserById } from "@/lib/erp-users"
import { invalidateProductsServerCache } from "@/lib/get-products-server"
import { invalidateItemsCache } from "@/lib/items-cache"

export const dynamic = "force-dynamic"

/** Every cache layer between the DB and the browser that bakes in discount
 *  pricing — cleared together so a price change is visible on the very next
 *  request instead of waiting out independent TTLs (which used to race each
 *  other: SSR could refresh while /api/items still served an older cached
 *  body, producing a "correct price flashes then reverts" glitch). */
function invalidateAllProductCaches() {
  invalidateProductsServerCache()
  invalidateItemsCache()
}

// ── Helper ──────────────────────────────────────────────────────────────────
const requireAdminOrPermission = async (request: NextRequest) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: "Authorization required", status: 401 }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    if (decoded.role === "admin") return { decoded }

    if (decoded.employeeId) {
      const employee = await getErpUserById(decoded.employeeId)
      if (employee && employee.isActive && employee.canManageDiscountCodes) return { decoded, employee }
    }

    return { error: "Permission denied", status: 403 }
  } catch {
    return { error: "Invalid token", status: 401 }
  }
}

const transform = (row: any) => ({
  id: row.id,
  name: row.name,
  discountType: row.discountType,
  discountValue: row.discountValue,
  maxDiscountAmount: row.maxDiscountAmount ?? null,
  appliesTo: row.appliesTo === "rent" || row.appliesTo === "both" ? row.appliesTo : "buy",
  branches: Array.isArray(row.branches) ? row.branches : [],
  productIds: Array.isArray(row.productIds) ? row.productIds : [],
  isActive: row.isActive,
  validFrom: row.validFrom,
  validUntil: row.validUntil,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminOrPermission(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const rows = await prisma.productDiscount.findMany({ orderBy: { createdAt: "desc" } })
    return NextResponse.json(rows.map(transform))
  } catch (error) {
    console.error("Get product discounts error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminOrPermission(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await request.json()
    const { name, discount_type, discount_value, max_discount_amount, applies_to, branches, product_ids, is_active, valid_from, valid_until } = body

    if (!name || !discount_type || discount_value == null) {
      return NextResponse.json({ error: "Name, discount type and value are required" }, { status: 400 })
    }
    if (discount_type !== "fixed" && discount_type !== "percentage") {
      return NextResponse.json({ error: "discount_type must be 'fixed' or 'percentage'" }, { status: 400 })
    }
    if (applies_to !== undefined && applies_to !== "buy" && applies_to !== "rent" && applies_to !== "both") {
      return NextResponse.json({ error: "applies_to must be 'buy', 'rent', or 'both'" }, { status: 400 })
    }
    if (max_discount_amount != null && (isNaN(Number(max_discount_amount)) || Number(max_discount_amount) < 0)) {
      return NextResponse.json({ error: "max_discount_amount must be a non-negative number" }, { status: 400 })
    }

    const created = await prisma.productDiscount.create({
      data: {
        name,
        discountType: discount_type,
        discountValue: Number(discount_value) || 0,
        // Cap only makes sense for percentage discounts — ignore it for fixed ones
        // rather than silently persisting a meaningless value.
        maxDiscountAmount: discount_type === "percentage" && max_discount_amount != null ? Number(max_discount_amount) : null,
        appliesTo: applies_to || "buy",
        branches: Array.isArray(branches) ? branches.map(String) : [],
        productIds: Array.isArray(product_ids) ? product_ids.map(String) : [],
        isActive: is_active !== false,
        validFrom: valid_from ? new Date(valid_from) : null,
        validUntil: valid_until ? new Date(valid_until) : null,
      },
    })

    invalidateAllProductCaches()
    return NextResponse.json({ success: true, discount: transform(created) })
  } catch (error) {
    console.error("Create product discount error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── PUT ──────────────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdminOrPermission(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Discount ID is required" }, { status: 400 })

    const body = await request.json()
    const { name, discount_type, discount_value, max_discount_amount, applies_to, branches, product_ids, is_active, valid_from, valid_until } = body

    if (max_discount_amount != null && (isNaN(Number(max_discount_amount)) || Number(max_discount_amount) < 0)) {
      return NextResponse.json({ error: "max_discount_amount must be a non-negative number" }, { status: 400 })
    }

    // The effective type after this update — needed to decide whether an
    // incoming max_discount_amount should actually be persisted.
    const existingForType = discount_type === undefined
      ? await prisma.productDiscount.findUnique({ where: { id }, select: { discountType: true } })
      : null
    const effectiveType = discount_type ?? existingForType?.discountType

    const updated = await prisma.productDiscount.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(discount_type !== undefined ? { discountType: discount_type } : {}),
        ...(discount_value !== undefined ? { discountValue: Number(discount_value) || 0 } : {}),
        ...(max_discount_amount !== undefined
          ? { maxDiscountAmount: effectiveType === "percentage" && max_discount_amount != null ? Number(max_discount_amount) : null }
          : {}),
        ...(applies_to !== undefined ? { appliesTo: applies_to } : {}),
        ...(branches !== undefined ? { branches: Array.isArray(branches) ? branches.map(String) : [] } : {}),
        ...(product_ids !== undefined ? { productIds: Array.isArray(product_ids) ? product_ids.map(String) : [] } : {}),
        ...(is_active !== undefined ? { isActive: is_active !== false } : {}),
        ...(valid_from !== undefined ? { validFrom: valid_from ? new Date(valid_from) : null } : {}),
        ...(valid_until !== undefined ? { validUntil: valid_until ? new Date(valid_until) : null } : {}),
      },
    })

    invalidateAllProductCaches()
    return NextResponse.json({ success: true, discount: transform(updated) })
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Discount not found" }, { status: 404 })
    console.error("Update product discount error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── PATCH (toggle active, or end the discount for specific products only) ────
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminOrPermission(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Discount ID is required" }, { status: 400 })

    const body = await request.json()

    // Ending the discount for a subset of its targeted products/branches —
    // the rule stays active for everything else.
    if (Array.isArray(body.remove_product_ids) || Array.isArray(body.remove_branches)) {
      const existing = await prisma.productDiscount.findUnique({ where: { id } })
      if (!existing) return NextResponse.json({ error: "Discount not found" }, { status: 404 })

      const removeProductIds = new Set((body.remove_product_ids || []).map(String))
      const removeBranches = new Set((body.remove_branches || []).map(String))
      const currentProductIds = Array.isArray(existing.productIds) ? (existing.productIds as unknown[]).map(String) : []
      const currentBranches = Array.isArray(existing.branches) ? (existing.branches as unknown[]).map(String) : []

      const updated = await prisma.productDiscount.update({
        where: { id },
        data: {
          productIds: currentProductIds.filter((pid) => !removeProductIds.has(pid)),
          branches: currentBranches.filter((b) => !removeBranches.has(b)),
        },
      })
      invalidateAllProductCaches()
      return NextResponse.json({ success: true, discount: transform(updated) })
    }

    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "is_active (boolean), remove_product_ids, or remove_branches is required" }, { status: 400 })
    }

    const updated = await prisma.productDiscount.update({
      where: { id },
      data: { isActive: body.is_active },
    })

    invalidateAllProductCaches()
    return NextResponse.json({ success: true, discount: transform(updated) })
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Discount not found" }, { status: 404 })
    console.error("Toggle product discount error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminOrPermission(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Discount ID is required" }, { status: 400 })

    await prisma.productDiscount.delete({ where: { id } })
    invalidateAllProductCaches()
    return NextResponse.json({ success: true, message: "Discount deleted successfully" })
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Discount not found" }, { status: 404 })
    console.error("Delete product discount error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
