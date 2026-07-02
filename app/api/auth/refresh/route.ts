import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getErpUserById } from "@/lib/erp-users"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const oldToken = authHeader.substring(7)

    // Decode old token — allow expired tokens so refresh still works
    let decoded: any
    try {
      decoded = jwt.verify(oldToken, JWT_SECRET, { ignoreExpiration: true }) as any
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // ── Employee tokens (MSSQL ERP) ──────────────────────────────────────
    if (decoded.employeeId) {
      const employee = await getErpUserById(decoded.employeeId)
      if (!employee || !employee.isActive) {
        return NextResponse.json({ error: "Employee not found" }, { status: 404 })
      }

      const newToken = jwt.sign(
        {
          employeeId: employee.id,
          employeeName: employee.username,
          role: employee.role,
          type: "employee",
          repId: employee.repId,
          branchId: employee.branchId,
          cashId: employee.cashId,
          cashName: employee.cashName,
        },
        JWT_SECRET,
        { expiresIn: "30d" }
      )

      return NextResponse.json({
        user: {
          id: employee.id,
          email: employee.email,
          name: employee.fullName,
          role: employee.role,
          isEmployee: true,
          repId: employee.repId,
          branchId: employee.branchId,
          cashId: employee.cashId,
          cashName: employee.cashName,
        },
        token: newToken,
      })
    }

    // Find user in MySQL
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Create new token
    const newToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    )

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token: newToken,
    })
  } catch (error) {
    console.error("Token refresh error:", error)
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }
}
