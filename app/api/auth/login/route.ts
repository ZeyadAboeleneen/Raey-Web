import { type NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { generateCsrfToken } from "@/lib/csrf"
import { logAudit, getRequestMetadata } from "@/lib/audit"

export async function POST(request: NextRequest) {
  console.log("📥 [LOGIN_API] Received POST request");
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
        logAudit({ action: "LOGIN_FAIL_DEACTIVATED", actorId: employee.id, metadata: getRequestMetadata(request) })
        return NextResponse.json({ error: "Account deactivated" }, { status: 403 })
      }

      const isValid = await bcrypt.compare(password, employee.passwordHash)
      if (!isValid) {
        logAudit({ action: "LOGIN_FAIL_PASSWORD", actorId: employee.id, metadata: getRequestMetadata(request) })
        return null 
      }

      const token = jwt.sign(
        { 
          employeeId: employee.id, 
          role: employee.role, 
          type: "employee",
          tokenVersion: employee.tokenVersion 
        },
        process.env.JWT_SECRET!,
        { expiresIn: "12h" }
      )

      const csrfToken = generateCsrfToken()
      const response = NextResponse.json({
        user: {
          id: employee.id,
          email: employee.email,
          name: employee.fullName,
          role: employee.role,
          isEmployee: true,
        },
        token,
        csrfToken,
      })

      response.cookies.set("csrf_token", csrfToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      })

      logAudit({ action: "LOGIN_SUCCESS", actorId: employee.id, actorType: "employee", metadata: getRequestMetadata(request) })
      return response
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
        { 
          userId: user.id, 
          email: user.email, 
          role: user.role, 
          type: "customer",
          tokenVersion: user.tokenVersion
        },
        process.env.JWT_SECRET!,
        { expiresIn: "7d" }
      )

      const csrfToken = generateCsrfToken()
      const response = NextResponse.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role, isEmployee: false },
        token,
        csrfToken,
      })

      response.cookies.set("csrf_token", csrfToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      })

      // Direct Audit (No Outbox needed for simple logins)
      logAudit({ action: "LOGIN_SUCCESS", actorId: user.id, actorType: "user", metadata: getRequestMetadata(request) })
      return response
    }

    logAudit({ action: "LOGIN_FAIL_NOT_FOUND", metadata: { email, ...getRequestMetadata(request) } })
    // Neither found or password mismatch
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })

  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
