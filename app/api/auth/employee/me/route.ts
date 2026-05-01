import { type NextRequest, NextResponse } from "next/server"
import { getEmployeeFromRequest } from "@/lib/auth-helpers"

export const dynamic = "force-dynamic"

/**
 * GET /api/auth/employee/me
 *
 * Returns the full employee record including all permission fields.
 * Always reads from DB — never caches — so permission changes are instant.
 */
export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromRequest(request)

    if (!employee) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!employee.isActive) {
      return NextResponse.json({ error: "Account is disabled" }, { status: 403 })
    }

    const isAdmin = employee.role === "admin"

    return NextResponse.json({
      id: employee.id,
      fullName: employee.fullName,
      email: employee.email,
      username: employee.username,
      phone: employee.phone,
      role: employee.role,
      isActive: employee.isActive,
      permissions: {
        canAddProducts:            isAdmin || employee.canAddProducts,
        canEditProducts:           isAdmin || employee.canEditProducts,
        canDeleteProducts:         isAdmin || employee.canDeleteProducts,
        canViewProducts:           isAdmin || employee.canViewProducts,
        canViewOrders:             isAdmin || employee.canViewOrders,
        canUpdateOrders:           isAdmin || employee.canUpdateOrders,
        canDeleteOrders:           isAdmin || employee.canDeleteOrders,
        canViewPricesInDashboard:  isAdmin || employee.canViewPricesInDashboard,
        canViewPricesOnWebsite:    isAdmin || employee.canViewPricesOnWebsite,
        canManageDiscountCodes:    isAdmin || employee.canManageDiscountCodes,
        canManageOffers:           isAdmin || employee.canManageOffers,
      },
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    })
  } catch (error) {
    console.error("Employee me error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
