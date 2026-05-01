import { type NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, type } = body

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    // ── Employee login path ──────────────────────────────────────────────
    // Triggered when: type === "employee" OR no customer account found (auto-detect)
    const tryEmployeeLogin = async () => {
      const employee = await prisma.employee.findFirst({
        where: { OR: [{ email }, { username: email }] }
      })
      if (!employee) return null

      if (!employee.isActive) {
        return NextResponse.json({ error: "Account deactivated" }, { status: 403 })
      }

      const isValid = await bcrypt.compare(password, employee.passwordHash)
      if (!isValid) return null // Return null so caller can decide to show generic error

      const token = jwt.sign(
        { employeeId: employee.id, role: employee.role, type: "employee" },
        process.env.JWT_SECRET!,
        { expiresIn: "12h" }
      )

      return NextResponse.json({
        user: {
          id: employee.id,
          email: employee.email,
          name: employee.fullName,
          role: employee.role,   // "admin" or "staff" — the real role from DB
          isEmployee: true,
        },
        token,
      })
    }

    // If caller explicitly wants employee login, don't even try customer table
    if (type === "employee") {
      const result = await tryEmployeeLogin()
      if (!result) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
      return result
    }

    // ── Auto-detect: try employee table first ──────────────
    console.log(`[LOGIN] Attempting login for ${email}`);
    if (type !== "customer") {
      const employeeResult = await tryEmployeeLogin()
      if (employeeResult) {
        console.log(`[LOGIN] Success: Employee login for ${email}`);
        return employeeResult
      }
      console.log(`[LOGIN] Employee login failed (not found or wrong password) for ${email}, falling back to customer`);
    }

    // ── Customer login path (fallback) ───────────────────────────────────
    const user = await prisma.user.findUnique({ where: { email } })

    if (user) {
      console.log(`[LOGIN] Found customer account for ${email}`);
      // Found a customer account — verify password
      const isPasswordValid = await bcrypt.compare(password, user.password)
      if (!isPasswordValid) {
        console.log(`[LOGIN] Invalid customer password for ${email}`);
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
      }

      console.log(`[LOGIN] Success: Customer login for ${email} with role ${user.role}`);

      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role, type: "customer" },
        process.env.JWT_SECRET!,
        { expiresIn: "7d" }
      )

      return NextResponse.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role, isEmployee: false },
        token,
      })
    }

    // Neither found or password mismatch
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })

  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
