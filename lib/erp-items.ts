import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export function clearErpProductCaches() {
  const g = globalThis as typeof globalThis & {
    _erpItemsCache?: Map<string, unknown>;
    _ssrProductsCache?: unknown;
    _ssrProductsPromise?: Promise<unknown>;
  };

  g._erpItemsCache?.clear();
  g._ssrProductsCache = undefined;
  g._ssrProductsPromise = undefined;
}

export function isAdminRequest(request: NextRequest): boolean {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token || !process.env.JWT_SECRET) return false;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as { role?: string };
    return decoded.role === "admin";
  } catch {
    return false;
  }
}
