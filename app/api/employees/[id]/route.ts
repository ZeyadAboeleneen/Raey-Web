import { type NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { verifyAdminFromRequest, decodeEmployeeJWT } from "@/lib/auth-helpers"

export const dynamic = "force-dynamic"

const SAFE_SELECT = {
  id: true,
  fullName: true,
  email: true,
  username: true,
  phone: true,
  role: true,
  isActive: true,
  canAddProducts: true,
  canEditProducts: true,
  canDeleteProducts: true,
  canViewProducts: true,
  canViewOrders: true,
  canUpdateOrders: true,
  canDeleteOrders: true,
  canViewPricesInDashboard: true,
  canViewPricesOnWebsite: true,
  canManageDiscountCodes: true,
  canManageOffers: true,
  createdAt: true,
  updatedAt: true,
} as const

// ── GET /api/employees/:id ────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = verifyAdminFromRequest(request)
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: params.id },
      select: SAFE_SELECT,
    })

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    }

    return NextResponse.json({ employee })
  } catch (error) {
    console.error("Get employee error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── PUT /api/employees/:id — update employee + permissions ───────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = verifyAdminFromRequest(request)
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const {
      fullName,
      email,
      username,
      password, // optional — if blank, keep existing
      phone,
      role,
      isActive,
      canAddProducts,
      canEditProducts,
      canDeleteProducts,
      canViewProducts,
      canViewOrders,
      canUpdateOrders,
      canDeleteOrders,
      canViewPricesInDashboard,
      canViewPricesOnWebsite,
      canManageDiscountCodes,
      canManageOffers,
    } = body

    // Build update data (only include defined fields)
    const updateData: Record<string, any> = {}
    if (fullName !== undefined) updateData.fullName = fullName
    if (email !== undefined) updateData.email = email
    if (username !== undefined) updateData.username = username
    if (phone !== undefined) updateData.phone = phone || null
    if (role !== undefined) updateData.role = role
    if (isActive !== undefined) updateData.isActive = isActive
    if (canAddProducts !== undefined) updateData.canAddProducts = canAddProducts
    if (canEditProducts !== undefined) updateData.canEditProducts = canEditProducts
    if (canDeleteProducts !== undefined) updateData.canDeleteProducts = canDeleteProducts
    if (canViewProducts !== undefined) updateData.canViewProducts = canViewProducts
    if (canViewOrders !== undefined) updateData.canViewOrders = canViewOrders
    if (canUpdateOrders !== undefined) updateData.canUpdateOrders = canUpdateOrders
    if (canDeleteOrders !== undefined) updateData.canDeleteOrders = canDeleteOrders
    if (canViewPricesInDashboard !== undefined) updateData.canViewPricesInDashboard = canViewPricesInDashboard
    if (canViewPricesOnWebsite !== undefined) updateData.canViewPricesOnWebsite = canViewPricesOnWebsite
    if (canManageDiscountCodes !== undefined) updateData.canManageDiscountCodes = canManageDiscountCodes
    if (canManageOffers !== undefined) updateData.canManageOffers = canManageOffers

    // Hash new password if provided
    if (password && password.trim().length > 0) {
      updateData.passwordHash = await bcrypt.hash(password, 12)
    }

    const employee = await prisma.employee.update({
      where: { id: params.id },
      data: updateData,
      select: SAFE_SELECT,
    })

    return NextResponse.json({ employee })
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    }
    console.error("Update employee error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── DELETE /api/employees/:id ────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = verifyAdminFromRequest(request)
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  // 🚨 Guard: Prevent employee from deleting themselves
  const callerDecoded = decodeEmployeeJWT(request)
  if (callerDecoded && callerDecoded.employeeId === params.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 }
    )
  }

  try {
    const target = await prisma.employee.findUnique({ where: { id: params.id } })
    if (!target) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    }

    // 🚨 Guard: Prevent deleting the last admin
    if (target.role === "admin") {
      const adminCount = await prisma.employee.count({
        where: { role: "admin", isActive: true },
      })
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot delete the last admin account" },
          { status: 400 }
        )
      }
    }

    await prisma.employee.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    }
    console.error("Delete employee error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
