import { type NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
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
    
    // 1. Direct Admin Check (from JWT role)
    if (decoded.role === "admin") return true;

    // 2. Employee Permission Check
    if (decoded.employeeId && permission) {
      const employee = await prisma.employee.findUnique({
        where: { id: decoded.employeeId },
      });
      if (employee && employee.isActive) {
        return checkPermission(employee, permission);
      }
    }

    return false;
  } catch {
    return false;
  }
}
