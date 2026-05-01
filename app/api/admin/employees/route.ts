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
    name: fullName, // Frontend expects "name"
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

export async function GET(request: NextRequest) {
  try {
    // Auth check
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

    // Only admin can list employees
    if (decoded.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const employees = await prisma.employee.findMany({
      orderBy: { createdAt: "desc" },
    })

    // Format for frontend (nest permissions, rename fullName → name, remove passwordHash)
    const safeEmployees = employees.map(formatEmployeeForClient)

    return NextResponse.json(safeEmployees)
  } catch (error: any) {
    console.error("Error fetching employees:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { name, email, password, phone, role, isActive, permissions } = body

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email and password are required" },
        { status: 400 }
      )
    }

    // Check if email already exists in employees
    const existingEmployee = await prisma.employee.findUnique({
      where: { email },
    })

    if (existingEmployee) {
      return NextResponse.json(
        { error: "Employee with this email already exists" },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const newEmployee = await prisma.employee.create({
      data: {
        fullName: name,
        email,
        username: email.split("@")[0],
        passwordHash,
        phone: phone || null,
        role: role || "staff",
        isActive: isActive !== undefined ? isActive : true,

        // Permission booleans (flat fields)
        canAddProducts: permissions?.canAddProducts || false,
        canEditProducts: permissions?.canEditProducts || false,
        canDeleteProducts: permissions?.canDeleteProducts || false,
        canViewProducts: permissions?.canViewProducts || false,
        canViewOrders: permissions?.canViewOrders || false,
        canUpdateOrders: permissions?.canUpdateOrders || false,
        canDeleteOrders: permissions?.canDeleteOrders || false,
        canViewPricesInDashboard:
          permissions?.canViewPricesInDashboard || false,
        canViewPricesOnWebsite: permissions?.canViewPricesOnWebsite || false,
      },
    })

    return NextResponse.json(formatEmployeeForClient(newEmployee), {
      status: 201,
    })
  } catch (error: any) {
    console.error("Error creating employee:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
