import { type NextRequest, NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/erp-items"
import { encryptSecret } from "@/lib/whatsapp-crypto"

export const runtime = "nodejs"

const TOKEN_COOKIE = "wa_token"
const PHONE_ID_COOKIE = "wa_phone_id"

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/whatsapp",
  maxAge: 60 * 60 * 24 * 400, // ~400 days — the maximum browsers (Chrome) allow for a cookie
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { token, phoneNumberId } = body as { token?: string; phoneNumberId?: string }
  if (!token?.trim() || !phoneNumberId?.trim()) {
    return NextResponse.json({ error: "Token and phoneNumberId are required" }, { status: 400 })
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set(TOKEN_COOKIE, encryptSecret(token.trim()), cookieOpts)
  res.cookies.set(PHONE_ID_COOKIE, encryptSecret(phoneNumberId.trim()), cookieOpts)
  return res
}

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const hasToken = !!request.cookies.get(TOKEN_COOKIE)?.value
  const hasPhoneNumberId = !!request.cookies.get(PHONE_ID_COOKIE)?.value
  return NextResponse.json({ hasToken, hasPhoneNumberId })
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set(TOKEN_COOKIE, "", { ...cookieOpts, maxAge: 0 })
  res.cookies.set(PHONE_ID_COOKIE, "", { ...cookieOpts, maxAge: 0 })
  return res
}
