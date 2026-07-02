import { type NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { getErpUserById } from "./erp-users";
import { prisma } from "./prisma";
import { type PermissionKey, checkPermission } from "./auth-helpers";

export function clearErpProductCaches() {
  const g = globalThis as typeof globalThis & {
    _erpItemsCache?: Map<string, unknown>;
    _ssrProductsCache?: unknown;
    _ssrProductsPromise?: Promise<unknown>;
    _productDetailCache?: Map<string, unknown>;
  };

  g._erpItemsCache?.clear();
  g._productDetailCache?.clear();
  g._ssrProductsCache = undefined;
  g._ssrProductsPromise = undefined;
}

export async function isAdminRequest(request: NextRequest, permission?: PermissionKey): Promise<boolean> {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token || !process.env.JWT_SECRET) return false;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;

    // Database-backed verification (Zero-Trust) — we never trust the JWT 'role'
    // claim directly; we re-check against the source DB.

    // A) Employee tokens (ERP Users) — numeric ERP user id.
    if (decoded.employeeId) {
      const employee = await getErpUserById(decoded.employeeId);
      if (!employee || !employee.isActive) return false;
      if (employee.role === "admin") return true;
      if (permission) return checkPermission(employee, permission);
      return false;
    }

    // B) User-admin tokens (Prisma users) — userId is a UUID, NOT an ERP id, so
    //    getErpUserById would NaN and fail. Verify against the Prisma User table.
    if (decoded.userId) {
      const user = await prisma.user.findUnique({
        where: { id: String(decoded.userId) },
        select: { role: true },
      });
      return user?.role === "admin";
    }

    return false;
  } catch {
    return false;
  }
}
