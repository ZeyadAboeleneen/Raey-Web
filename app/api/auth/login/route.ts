import { type NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { authenticateErpUser } from "@/lib/erp-users"
import { generateCsrfToken } from "@/lib/csrf"
import { logAudit, getRequestMetadata } from "@/lib/audit"

export async function POST(request: NextRequest) {
  console.log("📥 [LOGIN_API] Received POST request");
  try {
    const body = await request.json()
    const { email, password, type } = body

    const identifier = email // field is named 'email' but may hold a username
    if (!identifier || !password) {
      return NextResponse.json({ error: "Email/username and password are required" }, { status: 400 })
    }

    // ── Employee login path (MSSQL ERP `Users` table) ────────────────────
    // Triggered when: type === "employee" OR no customer account found (auto-detect)
    // `email` carries the username typed into the login form.
    const tryEmployeeLogin = async () => {
      console.log(`[LOGIN/ERP] Attempting auth for username="${email}" passphrase="${process.env.MSSQL_USER_PASSWORD_PASSPHRASE?.substring(0, 6)}..."`)
      let employee
      try {
        employee = await authenticateErpUser(email, password)
      } catch (err) {
        console.error("[LOGIN/ERP] authenticateErpUser threw:", err)
        return null
      }
      console.log(`[LOGIN/ERP] Result: ${employee ? `found ID=${employee.id}` : "null (no match)"}`)
      if (!employee) return null

      const token = jwt.sign(
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
        process.env.JWT_SECRET!,
        { expiresIn: "30d" }
      )

      const csrfToken = generateCsrfToken()
      const response = NextResponse.json({
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
    console.log(`[LOGIN] Attempting login for ${identifier}`);
    if (type !== "customer") {
      const employeeResult = await tryEmployeeLogin()
      if (employeeResult) {
        console.log(`[LOGIN] Success: Employee login for ${identifier}`);
        return employeeResult
      }
      console.log(`[LOGIN] Employee login failed for ${identifier}, falling back to customer`);
    }

    // ── Customer login path (fallback) — match by email OR name (username) ─
    const isEmail = identifier.includes("@")
    const user = isEmail
      ? await prisma.user.findUnique({ where: { email: identifier } })
      : await prisma.user.findFirst({ where: { name: identifier } })

    if (user) {
      console.log(`[LOGIN] Found customer account for ${identifier}`);
      const isPasswordValid = await bcrypt.compare(password, user.password)
      if (!isPasswordValid) {
        console.log(`[LOGIN] Invalid customer password for ${identifier}`);
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
      }

      console.log(`[LOGIN] Success: Customer login for ${identifier} with role ${user.role}`);

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

    logAudit({ action: "LOGIN_FAIL_NOT_FOUND", metadata: { identifier, ...getRequestMetadata(request) } })
    // Neither found or password mismatch
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })

  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
