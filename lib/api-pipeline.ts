import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth, type AuthenticatedEmployee } from "./api-auth"
import { validateCsrf, validateOrigin } from "./csrf"
import { getStoredResponse, storeResponse, tryLock } from "./idempotency"

export type { AuthenticatedEmployee }

export interface PipelineOptions {
  role?: "admin" | "staff"
  idempotent?: boolean
}

/**
 * Lightweight Request Pipeline (Orchestrator)
 * Focuses ONLY on Security, Auth, and Idempotency.
 */
export function withPipeline(
  handler: (request: NextRequest, employee: AuthenticatedEmployee, context: any) => Promise<NextResponse>,
  options: PipelineOptions = {}
) {
  return async (request: NextRequest, context: any) => {
    try {
      // 1. SECURITY HANDSHAKE (CSRF & Origin)
      const originError = validateOrigin(request)
      if (originError) return originError
      
      const csrfError = await validateCsrf(request)
      if (csrfError) return csrfError

      // 2. AUTHENTICATION & RBAC
      const authResult = await verifyAuth(request, { role: options.role })
      if (authResult instanceof NextResponse) return authResult
      const employee = authResult as AuthenticatedEmployee

      // 3. IDEMPOTENCY INTERCEPTOR
      const idempotencyKey = request.headers.get("Idempotency-Key") || request.headers.get("idempotency-key")
      
      if (options.idempotent && idempotencyKey) {
        const stored = await getStoredResponse(idempotencyKey)
        if (stored) {
          if (stored.status === "PROCESSING") {
            // Simple return, polling logic is moved to the client or a dedicated helper
            return NextResponse.json({ error: "Conflict: Request in progress" }, { status: 409 })
          }
          return NextResponse.json(stored)
        }

        const lockAcquired = await tryLock(idempotencyKey)
        if (!lockAcquired) {
          return NextResponse.json({ error: "Conflict: Concurrent request" }, { status: 409 })
        }
      }

      // 4. BUSINESS LOGIC EXECUTION
      const response = await handler(request, employee, context)

      // 5. IDEMPOTENCY COMPLETION
      if (options.idempotent && idempotencyKey && response.ok) {
        const body = await response.clone().json().catch(() => null)
        if (body) await storeResponse(idempotencyKey, body)
      }

      return response

    } catch (error: any) {
      console.error("[PIPELINE_ERROR]", error)
      return NextResponse.json({ 
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined 
      }, { status: 500 })
    }
  }
}
