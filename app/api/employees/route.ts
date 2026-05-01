import { type NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { verifyAdminFromRequest } from "@/lib/auth-helpers"

export const dynamic = "force-dynamic"

// ── GET /api/employees — list all employees ──────────────────────────────────
export async function GET(request: NextRequest) {
  const admin = verifyAdminFromRequest(request)
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  try {
    const employees = await prisma.employee.findMany({
      orderBy: { createdAt: "desc" },
      select: {
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
        // Never return passwordHash
      },
    })

    return NextResponse.json({ employees })
  } catch (error) {
    console.error("List employees error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── POST /api/employees — create employee ─────────────────────────────────────
export async function POST(request: NextRequest) {
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
      password,
      phone,
      role = "staff",
      isActive = true,
      canAddProducts = false,
      canEditProducts = false,
      canDeleteProducts = false,
      canViewProducts = true,
      canViewOrders = false,
      canUpdateOrders = false,
      canDeleteOrders = false,
      canViewPricesInDashboard = false,
      canViewPricesOnWebsite = false,
      canManageDiscountCodes = false,
      canManageOffers = false,
    } = body

    if (!fullName || !email || !username || !password) {
      return NextResponse.json(
        { error: "fullName, email, username, and password are required" },
        { status: 400 }
      )
    }

    // Check uniqueness
    const existing = await prisma.employee.findFirst({
      where: { OR: [{ email }, { username }] },
    })
    if (existing) {
      return NextResponse.json(
        { error: "An employee with that email or username already exists" },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const employee = await prisma.employee.create({
      data: {
        fullName,
        email,
        username,
        passwordHash,
        phone: phone || null,
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
      },
      select: {
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
      },
    })

    return NextResponse.json({ employee }, { status: 201 })
  } catch (error) {
    console.error("Create employee error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
