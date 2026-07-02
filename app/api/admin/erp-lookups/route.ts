import { type NextRequest, NextResponse } from "next/server"
import { getErpLookups } from "@/lib/erp-users"
import { verifyAdminFromRequest } from "@/lib/auth-helpers"

export const dynamic = "force-dynamic"

// ── GET /api/admin/erp-lookups — read-only Cash / Rep / Branch options ───────
export async function GET(request: NextRequest) {
  const admin = verifyAdminFromRequest(request)
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  try {
    const lookups = await getErpLookups()
    return NextResponse.json(lookups)
  } catch (error) {
    console.error("ERP lookups error:", error)
    return NextResponse.json({ error: "Failed to load ERP lookups" }, { status: 500 })
  }
}
