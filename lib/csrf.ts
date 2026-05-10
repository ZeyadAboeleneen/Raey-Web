import { NextRequest, NextResponse } from "next/server"
import { crypto } from "next/dist/compiled/@edge-runtime/primitives"

/**
 * Generates a random CSRF token.
 */
export function generateCsrfToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Validates the CSRF token from headers against the one in cookies.
 * Only applies to mutating methods (POST, PUT, DELETE).
 */
export function validateCsrf(request: NextRequest): boolean {
  const method = request.method.toUpperCase()
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return true
  }

  const csrfHeader = request.headers.get("X-CSRF-Token")
  const csrfCookie = request.cookies.get("csrf_token")?.value

  if (!csrfHeader || !csrfCookie) {
    return false
  }

  return csrfHeader === csrfCookie
}

/**
 * Validates the Origin/Referer to prevent cross-site requests.
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  const referer = request.headers.get("referer")
  const host = request.headers.get("host")

  // In production, you should check against your actual domain
  // For now, we allow requests where origin matches host or is missing (non-browser)
  if (origin) {
    const originHost = new URL(origin).host
    if (originHost !== host) return false
  } else if (referer) {
    const refererHost = new URL(referer).host
    if (refererHost !== host) return false
  }

  return true
}
