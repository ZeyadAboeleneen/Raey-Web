import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { type NextRequest, NextResponse } from "next/server"
import type { Employee } from "@prisma/client"

export type PermissionKey =
  | "canAddProducts"
  | "canEditProducts"
  | "canDeleteProducts"
  | "canViewProducts"
  | "canViewOrders"
  | "canUpdateOrders"
  | "canDeleteOrders"
  | "canViewPricesInDashboard"
  | "canViewPricesOnWebsite"
  | "canManageDiscountCodes"
  | "canManageOffers"

// ── JWT decode ──────────────────────────────────────────────────────────────

export function decodeEmployeeJWT(
  request: NextRequest
): { employeeId: string; role: string } | null {
  try {
    const authHeader = request.headers.get("authorization") || ""
    if (!authHeader.startsWith("Bearer ")) return null
    const token = authHeader.slice(7)
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    // Employee tokens carry employeeId, customer tokens carry userId
    if (!decoded.employeeId) return null
    return { employeeId: decoded.employeeId, role: decoded.role }
  } catch {
    return null
  }
}

export function decodeUserJWT(
  request: NextRequest
): { userId: string; email: string; role: string } | null {
  try {
    const authHeader = request.headers.get("authorization") || ""
    if (!authHeader.startsWith("Bearer ")) return null
    const token = authHeader.slice(7)
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    if (!decoded.userId) return null
    return { userId: decoded.userId, email: decoded.email, role: decoded.role }
  } catch {
    return null
  }
}

// ── Fetch full employee from DB (always fresh — never rely on JWT payload) ──

export async function getEmployeeFromRequest(
  request: NextRequest
): Promise<Employee | null> {
  const decoded = decodeEmployeeJWT(request)
  if (!decoded) return null

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: decoded.employeeId },
    })
    return employee
  } catch {
    return null
  }
}

// ── Permission check (admin bypass + inactive guard) ────────────────────────

export function checkPermission(
  employee: Employee,
  permission: PermissionKey
): boolean {
  if (!employee.isActive) return false
  if (employee.role === "admin") return true // admin bypasses all toggles
  return Boolean(employee[permission])
}

// ── Reusable route guard ─────────────────────────────────────────────────────
// Usage:
//   const guard = await requirePermission(request, "canViewOrders")
//   if (guard.error) return guard.error
//   const employee = guard.employee

export async function requirePermission(
  request: NextRequest,
  permission: PermissionKey
): Promise<{ employee: Employee; error: null } | { employee: null; error: NextResponse }> {
  const decoded = decodeEmployeeJWT(request)

  if (!decoded) {
    return {
      employee: null,
      error: NextResponse.json({ error: "Authorization required" }, { status: 401 }),
    }
  }

  const employee = await prisma.employee.findUnique({
    where: { id: decoded.employeeId },
  })

  if (!employee) {
    return {
      employee: null,
      error: NextResponse.json({ error: "Employee not found" }, { status: 401 }),
    }
  }

  if (!employee.isActive) {
    return {
      employee: null,
      error: NextResponse.json({ error: "Account is disabled" }, { status: 403 }),
    }
  }

  if (!checkPermission(employee, permission)) {
    return {
      employee: null,
      error: NextResponse.json({ error: "Permission denied" }, { status: 403 }),
    }
  }

  return { employee, error: null }
}

// ── Admin-only guard (for employee management routes) ────────────────────────

export async function requireAdmin(
  request: NextRequest
): Promise<{ employee: Employee; error: null } | { employee: null; error: NextResponse }> {
  // Check if caller is a customer admin (existing User model)
  const userDecoded = decodeUserJWT(request)
  if (userDecoded && userDecoded.role === "admin") {
    // Customer admin — allowed but no Employee record; return a synthetic object
    // We use null + a special flag so callers know it's a user-admin
    return {
      employee: null as any, // caller checks userDecoded separately
      error: null,
    }
  }

  // Check employee admin
  const empDecoded = decodeEmployeeJWT(request)
  if (!empDecoded) {
    return {
      employee: null,
      error: NextResponse.json({ error: "Authorization required" }, { status: 401 }),
    }
  }

  const employee = await prisma.employee.findUnique({
    where: { id: empDecoded.employeeId },
  })

  if (!employee) {
    return {
      employee: null,
      error: NextResponse.json({ error: "Employee not found" }, { status: 401 }),
    }
  }

  if (!employee.isActive) {
    return {
      employee: null,
      error: NextResponse.json({ error: "Account is disabled" }, { status: 403 }),
    }
  }

  if (employee.role !== "admin") {
    return {
      employee: null,
      error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    }
  }

  return { employee, error: null }
}

// ── Verify any admin (user OR employee admin) from a raw JWT ─────────────────

export function verifyAdminFromRequest(
  request: NextRequest
): { role: string; id: string; type: "user" | "employee" } | null {
  try {
    const authHeader = request.headers.get("authorization") || ""
    if (!authHeader.startsWith("Bearer ")) return null
    const token = authHeader.slice(7)
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any

    if (decoded.role !== "admin") return null

    if (decoded.userId) return { role: "admin", id: decoded.userId, type: "user" }
    if (decoded.employeeId) return { role: "admin", id: decoded.employeeId, type: "employee" }
    return null
  } catch {
    return null
  }
}
