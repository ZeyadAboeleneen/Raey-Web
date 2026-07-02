import { type NextRequest, NextResponse } from "next/server"
import { getErpUserById, updateErpUser, deleteErpUser, saveEmployeePermissions } from "@/lib/erp-users"
import { verifyAdminFromRequest } from "@/lib/auth-helpers"

export const dynamic = "force-dynamic"

// ── GET /api/employees/:id ────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = verifyAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  try {
    const employee = await getErpUserById(params.id)
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    return NextResponse.json({ employee })
  } catch (error) {
    console.error("Get employee error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── PUT /api/employees/:id ────────────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = verifyAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  try {
    const body = await request.json()
    const {
      userName, password, cashId, branchId, repId, email, address, tel, notes, active,
      canAddProducts, canEditProducts, canDeleteProducts, canViewProducts,
      canViewOrders, canUpdateOrders, canDeleteOrders,
      canViewPricesInDashboard, canViewPricesOnWebsite,
      canManageDiscountCodes, canManageOffers,
    } = body

    await updateErpUser(Number(params.id), {
      ...(userName !== undefined && { userName }),
      ...(password ? { password } : {}),
      ...(cashId != null && { cashId: Number(cashId) }),
      ...(branchId != null && { branchId: Number(branchId) }),
      ...(repId != null && { repId: Number(repId) }),
      ...(email !== undefined && { email }),
      ...(address !== undefined && { address }),
      ...(tel !== undefined && { tel }),
      ...(notes !== undefined && { notes }),
      ...(active !== undefined && { active }),
    })

    // Save permissions to MySQL if any were provided
    const permFields = { canAddProducts, canEditProducts, canDeleteProducts, canViewProducts, canViewOrders, canUpdateOrders, canDeleteOrders, canViewPricesInDashboard, canViewPricesOnWebsite, canManageDiscountCodes, canManageOffers }
    const hasPerms = Object.values(permFields).some((v) => v !== undefined)
    if (hasPerms) {
      const permsToSave = Object.fromEntries(Object.entries(permFields).filter(([, v]) => v !== undefined))
      await saveEmployeePermissions(params.id, permsToSave)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Update employee error:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

// ── DELETE /api/employees/:id — soft-delete (sets Active = 0) ────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = verifyAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  try {
    await deleteErpUser(Number(params.id))
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Delete employee error:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
