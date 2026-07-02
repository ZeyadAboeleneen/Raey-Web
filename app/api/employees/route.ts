import { type NextRequest, NextResponse } from "next/server"
import { listErpUsers, createErpUser, saveEmployeePermissions } from "@/lib/erp-users"
import { verifyAdminFromRequest } from "@/lib/auth-helpers"

export const dynamic = "force-dynamic"

// ── GET /api/employees — list all employees (from MSSQL ERP) ─────────────────
export async function GET(request: NextRequest) {
  const admin = verifyAdminFromRequest(request)
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  try {
    const employees = await listErpUsers()
    return NextResponse.json({ employees })
  } catch (error) {
    console.error("List employees error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── POST /api/employees — create employee in MSSQL ERP via dbo.sp_users ──────
export async function POST(request: NextRequest) {
  const admin = verifyAdminFromRequest(request)
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const {
      userName, password, cashId, branchId, repId, email, address, tel, notes, active,
      canAddProducts, canEditProducts, canDeleteProducts, canViewProducts,
      canViewOrders, canUpdateOrders, canDeleteOrders,
      canViewPricesInDashboard, canViewPricesOnWebsite,
      canManageDiscountCodes, canManageOffers,
    } = body

    console.log("[POST /api/employees] body:", JSON.stringify({ userName, cashId, branchId, repId, hasPassword: !!password }))

    if (!userName || !password || cashId == null || branchId == null || repId == null) {
      console.log("[POST /api/employees] validation failed:", { userName: !!userName, password: !!password, cashId, branchId, repId })
      return NextResponse.json(
        { error: "userName, password, cashId, branchId, and repId are required" },
        { status: 400 }
      )
    }

    const id = await createErpUser({
      userName,
      password,
      cashId: Number(cashId),
      branchId: Number(branchId),
      repId: Number(repId),
      email: email ?? "",
      address: address ?? "",
      tel: tel ?? "",
      notes: notes ?? "",
      active: active !== false,
    })

    if (id === -1) {
      return NextResponse.json({ error: "ERP returned no ID — check sp_users parameters" }, { status: 500 })
    }

    // Save permissions to MySQL
    await saveEmployeePermissions(String(id), {
      canAddProducts: canAddProducts ?? false,
      canEditProducts: canEditProducts ?? false,
      canDeleteProducts: canDeleteProducts ?? false,
      canViewProducts: canViewProducts ?? true,
      canViewOrders: canViewOrders ?? false,
      canUpdateOrders: canUpdateOrders ?? false,
      canDeleteOrders: canDeleteOrders ?? false,
      canViewPricesInDashboard: canViewPricesInDashboard ?? false,
      canViewPricesOnWebsite: canViewPricesOnWebsite ?? true,
      canManageDiscountCodes: canManageDiscountCodes ?? false,
      canManageOffers: canManageOffers ?? false,
    })

    return NextResponse.json({ success: true, id }, { status: 201 })
  } catch (error: any) {
    console.error("Create employee error:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
