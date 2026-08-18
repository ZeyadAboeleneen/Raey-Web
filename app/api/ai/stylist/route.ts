/**
 * POST /api/ai/stylist
 *
 * The stylist's only network surface.
 *
 *   Browser → this route → Gemini (understand) → catalogue match → Gemini
 *   (explain) → this route → Browser
 *
 * The conversation is session-only and lives in the browser; each turn posts
 * the running profile and recent history back. Everything arriving from the
 * client is re-validated here — the profile against the closed vocabulary, and
 * product ids against the real catalogue — so a tampered payload cannot steer
 * what gets recommended or leak arbitrary products.
 *
 * Nothing about the conversation is persisted or logged.
 */

import { type NextRequest, NextResponse } from "next/server"
import { rateLimit } from "@/lib/rate-limit"
import {
  STYLIST_ENABLED,
  STYLIST_MAX_MESSAGES_PER_HOUR,
  STYLIST_MAX_MESSAGES_PER_MINUTE,
  STYLIST_MAX_MESSAGE_CHARS,
} from "@/lib/ai/stylist/stylist-config"
import { sanitizePreferences } from "@/lib/ai/stylist/preferences"
import {
  StylistError,
  runStylistTurn,
  type ChatTurn,
} from "@/lib/ai/stylist/stylist-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Shopper-facing fallback copy, per the brief. Never a technical error. */
const FALLBACK = {
  ar: "عذرًا، الـRAEY Stylist مش متاحة دلوقتي 🤍 ممكن تكملي تصفحي الـcollection أو تحاولي مرة تانية.",
  en: "The RAEY Stylist isn't available right now. 🤍 Please keep exploring the collection, or try again in a moment.",
}

function fallbackFor(language: string | null | undefined) {
  return language && /^ar|arabizi|mixed/i.test(language) ? FALLBACK.ar : FALLBACK.en
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("x-real-ip") || "unknown"
}

function fail(status: number, code: string, language: string | null) {
  return NextResponse.json(
    { error: fallbackFor(language), code },
    { status, headers: { "Cache-Control": "no-store" } }
  )
}

/** Trims history to alternating text turns of bounded size. */
function sanitizeHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return []
  const out: ChatTurn[] = []
  for (const turn of raw.slice(-24)) {
    const role = turn?.role === "assistant" ? "assistant" : turn?.role === "user" ? "user" : null
    const content = typeof turn?.content === "string" ? turn.content.trim() : ""
    if (!role || !content) continue
    out.push({ role, content: content.slice(0, STYLIST_MAX_MESSAGE_CHARS) })
  }
  return out
}

export async function POST(request: NextRequest) {
  if (!STYLIST_ENABLED) return fail(503, "DISABLED", null)

  let body: any
  try {
    body = await request.json()
  } catch {
    return fail(400, "BAD_REQUEST", null)
  }

  const language = typeof body?.preferences?.language === "string" ? body.preferences.language : null

  const message = typeof body?.message === "string" ? body.message.trim() : ""
  if (!message) return fail(400, "EMPTY_MESSAGE", language)
  if (message.length > STYLIST_MAX_MESSAGE_CHARS) {
    return fail(413, "MESSAGE_TOO_LONG", language)
  }

  const ip = clientIp(request)
  const [perMinute, perHour] = await Promise.all([
    rateLimit(`stylist:m:${ip}`, STYLIST_MAX_MESSAGES_PER_MINUTE, 60),
    rateLimit(`stylist:h:${ip}`, STYLIST_MAX_MESSAGES_PER_HOUR, 3600),
  ])
  if (!perMinute.success || !perHour.success) {
    return NextResponse.json(
      { error: fallbackFor(language), code: "RATE_LIMITED" },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    )
  }

  // Product ids from the client are only ever used as ranking hints; the
  // matcher resolves them against the live catalogue and ignores unknowns.
  const similarToProductId =
    typeof body?.similarToProductId === "string" && /^\d{1,10}$/.test(body.similarToProductId)
      ? body.similarToProductId
      : null

  try {
    const result = await runStylistTurn({
      message,
      history: sanitizeHistory(body?.history),
      preferences: sanitizePreferences(body?.preferences),
      similarToProductId,
    })

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const code = error instanceof StylistError ? error.code : "UPSTREAM"
    // Metrics only — the conversation itself is never logged.
    console.error(`[AI Stylist] turn failed code=${code}`)
    const status = code === "RATE_LIMITED" ? 503 : code === "TIMEOUT" ? 504 : 503
    return fail(status, code, language)
  }
}
