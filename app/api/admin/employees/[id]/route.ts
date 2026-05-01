import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

/**
 * Helper: extract permission booleans from an Employee record
 * and return them as a nested "permissions" object matching the frontend shape.
 */
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.split(" ")[1]
    let decoded: any
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!)
    } catch (e) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    if (decoded.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const employeeId = params.id
    const body = await request.json()
    const { name, email, password, phone, role, isActive, permissions } = body

    const existingEmployee = await prisma.employee.findUnique({
      where: { id: employeeId },
    })

    if (!existingEmployee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      )
    }

    // Build update payload — only set fields that are provided
    const updateData: any = {}

    if (name !== undefined) updateData.fullName = name
    if (email !== undefined) updateData.email = email
    if (phone !== undefined) updateData.phone = phone || null
    if (role !== undefined) updateData.role = role
    if (isActive !== undefined) updateData.isActive = isActive

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10)
    }

    // Flatten permissions into direct boolean fields
    if (permissions) {
      if (permissions.canAddProducts !== undefined)
        updateData.canAddProducts = permissions.canAddProducts
      if (permissions.canEditProducts !== undefined)
        updateData.canEditProducts = permissions.canEditProducts
      if (permissions.canDeleteProducts !== undefined)
        updateData.canDeleteProducts = permissions.canDeleteProducts
      if (permissions.canViewProducts !== undefined)
        updateData.canViewProducts = permissions.canViewProducts
      if (permissions.canViewOrders !== undefined)
        updateData.canViewOrders = permissions.canViewOrders
      if (permissions.canUpdateOrders !== undefined)
        updateData.canUpdateOrders = permissions.canUpdateOrders
      if (permissions.canDeleteOrders !== undefined)
        updateData.canDeleteOrders = permissions.canDeleteOrders
      if (permissions.canViewPricesInDashboard !== undefined)
        updateData.canViewPricesInDashboard =
          permissions.canViewPricesInDashboard
      if (permissions.canViewPricesOnWebsite !== undefined)
        updateData.canViewPricesOnWebsite = permissions.canViewPricesOnWebsite
    }

    const updatedEmployee = await prisma.employee.update({
      where: { id: employeeId },
      data: updateData,
    })

    return NextResponse.json(formatEmployeeForClient(updatedEmployee))
  } catch (error: any) {
    console.error("Error updating employee:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.split(" ")[1]
    let decoded: any
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!)
    } catch (e) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    if (decoded.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const employeeId = params.id

    // Prevent deleting oneself
    if (decoded.userId === employeeId) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      )
    }

    // Verify employee exists
    const existing = await prisma.employee.findUnique({
      where: { id: employeeId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      )
    }

    await prisma.employee.delete({
      where: { id: employeeId },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting employee:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
