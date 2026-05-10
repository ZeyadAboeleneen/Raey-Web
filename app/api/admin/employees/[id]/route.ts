import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
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

export const PUT = withPipeline(async (request, auth, { params }) => {
  const employeeId = params.id
  const body = await request.json()
  const { name, email, password, phone, role, isActive, permissions } = body

  const existingEmployee = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!existingEmployee) return NextResponse.json({ error: "Employee not found" }, { status: 404 })

  const updateData: any = {}
  if (name !== undefined) updateData.fullName = name
  if (email !== undefined) updateData.email = email
  if (phone !== undefined) updateData.phone = phone || null
  if (role !== undefined) updateData.role = role
  if (isActive !== undefined) updateData.isActive = isActive
  if (password) updateData.passwordHash = await bcrypt.hash(password, 10)

  if (permissions) {
    if (permissions.canAddProducts !== undefined) updateData.canAddProducts = permissions.canAddProducts
    if (permissions.canEditProducts !== undefined) updateData.canEditProducts = permissions.canEditProducts
    if (permissions.canDeleteProducts !== undefined) updateData.canDeleteProducts = permissions.canDeleteProducts
    if (permissions.canViewProducts !== undefined) updateData.canViewProducts = permissions.canViewProducts
    if (permissions.canViewOrders !== undefined) updateData.canViewOrders = permissions.canViewOrders
    if (permissions.canUpdateOrders !== undefined) updateData.canUpdateOrders = permissions.canUpdateOrders
    if (permissions.canDeleteOrders !== undefined) updateData.canDeleteOrders = permissions.canDeleteOrders
    if (permissions.canViewPricesInDashboard !== undefined) updateData.canViewPricesInDashboard = permissions.canViewPricesInDashboard
    if (permissions.canViewPricesOnWebsite !== undefined) updateData.canViewPricesOnWebsite = permissions.canViewPricesOnWebsite
  }

  const updatedEmployee = await prisma.employee.update({ where: { id: employeeId }, data: updateData })
  return NextResponse.json(formatEmployeeForClient(updatedEmployee))
}, { role: "admin", auditAction: "EMPLOYEE_UPDATE", auditEntity: "Employee" })

export const DELETE = withPipeline(async (request, auth, { params }) => {
  const employeeId = params.id
  if (auth.id === employeeId) return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 })

  const existing = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!existing) return NextResponse.json({ error: "Employee not found" }, { status: 404 })

  await prisma.employee.delete({ where: { id: employeeId } })
  return NextResponse.json({ success: true })
}, { role: "admin", auditAction: "EMPLOYEE_DELETE", auditEntity: "Employee" })
