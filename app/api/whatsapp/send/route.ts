import { type NextRequest, NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/erp-items"
import { decryptSecret } from "@/lib/whatsapp-crypto"

export const runtime = "nodejs"
export const maxDuration = 60

interface SendResult {
  phone: string
  success: boolean
  error?: string
}

// Normalize Egyptian local numbers (01xxxxxxxxx) to international format (20 1xxxxxxxxx)
function normalizeEgyptPhone(raw: string): string | null {
  const digits = String(raw).replace(/\D/g, "")
  if (!digits) return null

  if (digits.startsWith("20") && digits.length === 12) return digits
  if (digits.startsWith("0") && digits.length === 11) return "20" + digits.slice(1)
  if (digits.length === 10) return "20" + digits // e.g. 1xxxxxxxxx without leading 0
  if (digits.startsWith("20") && digits.length > 12) return digits.slice(0, 12)

  return null
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

  const { message, phones } = body as {
    message?: string
    phones?: string[]
  }

  if (!message || !message.trim()) {
    return NextResponse.json({ error: "Message text is required" }, { status: 400 })
  }
  if (!Array.isArray(phones) || phones.length === 0) {
    return NextResponse.json({ error: "No phone numbers provided" }, { status: 400 })
  }

  const encToken = request.cookies.get("wa_token")?.value
  const encPhoneId = request.cookies.get("wa_phone_id")?.value
  if (!encToken || !encPhoneId) {
    return NextResponse.json(
      { error: "لم يتم حفظ بيانات واتساب بعد. من فضلك احفظ الـ Token ورقم الهاتف أولاً." },
      { status: 400 }
    )
  }

  let token: string
  let phoneNumberId: string
  try {
    token = decryptSecret(encToken)
    phoneNumberId = decryptSecret(encPhoneId)
  } catch {
    return NextResponse.json({ error: "بيانات واتساب المحفوظة غير صالحة، من فضلك أدخلها من جديد." }, { status: 400 })
  }

  const normalized = phones
    .map((p) => ({ original: p, normalized: normalizeEgyptPhone(p) }))
    .filter((p) => p.normalized !== null) as { original: string; normalized: string }[]

  const invalid = phones.length - normalized.length

  const results: SendResult[] = []

  for (const { normalized: to } of normalized) {
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        }),
      })

      if (res.ok) {
        results.push({ phone: to, success: true })
      } else {
        const errData = await res.json().catch(() => ({}))
        results.push({
          phone: to,
          success: false,
          error: errData?.error?.message || `HTTP ${res.status}`,
        })
      }
    } catch (err: any) {
      results.push({ phone: to, success: false, error: err?.message || "Network error" })
    }
  }

  const sent = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  return NextResponse.json({
    summary: {
      total: phones.length,
      invalid,
      sent,
      failed,
    },
    results,
  })
}
