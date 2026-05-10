import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "./prisma"
import { validateCsrf, validateOrigin } from "./csrf"
import { logAudit, getRequestMetadata } from "./audit"

export interface AuthenticatedEmployee {
  id: string
  email: string
  role: string
  isActive: boolean
  fullName: string
  [key: string]: any
}

export interface AuthOptions {
  role?: string | string[]
  permissions?: string[]
}

export async function verifyAuth(
  request: NextRequest,
  options: AuthOptions = {}
): Promise<AuthenticatedEmployee | NextResponse> {
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

    const employeeId = decoded.employeeId || decoded.userId
    if (!employeeId) {
      return NextResponse.json({ error: "Invalid token payload" }, { status: 401 })
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    })

    if (!employee || !employee.isActive) {
      logAudit({ action: "AUTH_DEACTIVATED_ACCESS", actorId: employeeId, metadata: getRequestMetadata(request) })
      return NextResponse.json({ error: "Account deactivated or not found" }, { status: 403 })
    }

    // Verify token version for immediate revocation
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== employee.tokenVersion) {
      logAudit({ action: "AUTH_SESSION_REVOKED", actorId: employeeId, metadata: getRequestMetadata(request) })
      return NextResponse.json({ error: "Session expired: Please login again" }, { status: 401 })
    }

    // Role check
    if (options.role) {
      const roles = Array.isArray(options.role) ? options.role : [options.role]
      if (!roles.includes(employee.role)) {
        return NextResponse.json({ error: "Forbidden: Insufficient role" }, { status: 403 })
      }
    }

    // Permissions check (only if not admin, or if specific permissions required)
    if (options.permissions && employee.role !== "admin") {
      for (const perm of options.permissions) {
        if (!employee[perm as keyof typeof employee]) {
          return NextResponse.json({ error: `Forbidden: Missing permission ${perm}` }, { status: 403 })
        }
      }
    }

    return employee as AuthenticatedEmployee
  } catch (error: any) {
    console.error("[AUTH_WRAPPER_ERROR]", error)
    return NextResponse.json({ error: "Internal server error during auth" }, { status: 500 })
  }
}

/**
 * Higher-Order Function to wrap API handlers with declarative authorization.
 */
export function withAuth(
  handler: (req: NextRequest, auth: AuthenticatedEmployee, context: any) => Promise<NextResponse>,
  options: AuthOptions = {}
) {
  return async (request: NextRequest, context: any) => {
    try {
      // 1. CSRF & Origin Validation (First line of defense)
      if (!validateOrigin(request)) {
        logAudit({ action: "SECURITY_INVALID_ORIGIN", metadata: getRequestMetadata(request) })
        return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
      }
      if (!validateCsrf(request)) {
        logAudit({ action: "SECURITY_CSRF_FAILURE", metadata: getRequestMetadata(request) })
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 })
      }

      const authResult = await verifyAuth(request, options)
      if (authResult instanceof NextResponse) return authResult

      return handler(request, authResult as AuthenticatedEmployee, context)
    } catch (error: any) {
      console.error("[AUTH_WRAPPER_ERROR]", error)
      return NextResponse.json({ error: "Internal server error during auth" }, { status: 500 })
    }
  }
}
