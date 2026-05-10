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

export const GET = withPipeline(async (request) => {
  const employees = await prisma.employee.findMany({
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(employees.map(formatEmployeeForClient))
}, { role: "admin" })

import { OutboxService } from "@/services/outbox.service"
import { getRequestMetadata } from "@/lib/audit"

export const POST = withPipeline(async (request, currentEmployee) => {
  const body = await request.json()
  const { name, email, password, phone, role, isActive, permissions } = body

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 10)

  // ATOMIC TRANSACTION: Business Data + Outbox Event
  const newEmployee = await prisma.$transaction(async (tx) => {
    // 1. Check uniqueness
    const existing = await tx.employee.findUnique({ where: { email } })
    if (existing) throw new Error("Employee with this email already exists")

    // 2. Create record
    const emp = await tx.employee.create({
      data: {
        fullName: name,
        email,
        username: email.split("@")[0],
        passwordHash,
        phone: phone || null,
        role: role || "staff",
        isActive: isActive !== undefined ? isActive : true,
        canAddProducts: permissions?.canAddProducts || false,
        canEditProducts: permissions?.canEditProducts || false,
        canDeleteProducts: permissions?.canDeleteProducts || false,
        canViewProducts: permissions?.canViewProducts || false,
        canViewOrders: permissions?.canViewOrders || false,
        canUpdateOrders: permissions?.canUpdateOrders || false,
        canDeleteOrders: permissions?.canDeleteOrders || false,
        canViewPricesInDashboard: permissions?.canViewPricesInDashboard || false,
        canViewPricesOnWebsite: permissions?.canViewPricesOnWebsite || false,
        canManageDiscountCodes: permissions?.canManageDiscountCodes || false,
        canManageOffers: permissions?.canManageOffers || false,
        favorites: [],
      },
    })

    // 3. Enqueue Audit Event into Outbox (Transactional)
    await OutboxService.enqueue("AUDIT_LOG", {
      action: "EMPLOYEE_CREATE",
      actorId: currentEmployee.id,
      entity: "Employee",
      entityId: emp.id,
      after: formatEmployeeForClient(emp),
      metadata: getRequestMetadata(request)
    }, tx)

    return emp
  })

  return NextResponse.json(formatEmployeeForClient(newEmployee), { status: 201 })
}, { role: "admin", idempotent: true })
