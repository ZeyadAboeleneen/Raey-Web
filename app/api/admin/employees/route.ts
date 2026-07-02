import { type NextRequest, NextResponse } from "next/server"
import { listErpUsers, createErpUser } from "@/lib/erp-users"
import { withPipeline } from "@/lib/api-pipeline"

function formatEmployeeForClient(emp: any) {
  const {
    passwordHash,
    canAddProducts,
    canEditProducts,
    canDeleteProducts,
    canViewProducts,
    canViewOrders,
    canUpdateOrders,
    canDeleteOrders,
    canViewPricesInDashboard,
    canViewPricesOnWebsite,
    fullName,
    ...rest
  } = emp

  return {
    ...rest,
    name: fullName,
    permissions: {
      canAddProducts,
      canEditProducts,
      canDeleteProducts,
      canViewProducts,
      canViewOrders,
      canUpdateOrders,
      canDeleteOrders,
      canViewPricesInDashboard,
      canViewPricesOnWebsite,
    },
  }
}

export const GET = withPipeline(async (request) => {
  const employees = await listErpUsers()
  return NextResponse.json(employees.map(formatEmployeeForClient))
}, { role: "admin" })

export const POST = withPipeline(async (request) => {
  const body = await request.json()
  const { userName, password, cashId, branchId, repId, email, address, tel, notes, active } = body

  if (!userName || !password || cashId == null || branchId == null || repId == null) {
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

  return NextResponse.json({ success: true, id }, { status: 201 })
}, { role: "admin" })
