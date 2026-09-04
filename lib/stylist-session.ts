/**
 * lib/stylist-session.ts
 *
 * Conversation state for the AI Stylist, kept in the browser for the current
 * session only.
 *
 * The storefront has no customer accounts (`lib/auth-context.tsx` authenticates
 * ERP staff, not shoppers), so per the brief no auth system is introduced for
 * this feature. The consultation lives in sessionStorage: it survives a reload
 * and in-site navigation, and is gone when the tab closes. Nothing about the
 * conversation is sent anywhere except the stylist endpoint.
 */

const STORAGE_KEY = "raey_stylist_session"

export interface StylistMessage {
  id: string
  role: "user" | "assistant"
  content: string
  /**
   * A small data-URL thumbnail of an inspiration photo she attached, kept only
   * so the transcript still shows what she sent. Deliberately a thumbnail and
   * not the uploaded image: sessionStorage is a few megabytes, and full-size
   * photos in a transcript would exhaust it within a handful of turns.
   */
  image?: string
  /** Products shown with this message, if any. */
  recommendations?: StylistRecommendation[]
  quickReplies?: string[]
  createdAt: number
}

export interface StylistRecommendation {
  productId: string
  name: string
  collection: string
  branch: string
  image: string
  price: number | null
  isSellable: boolean
  productUrl: string
  reason: string
}

export interface StylistSession {
  messages: StylistMessage[]
  /** Opaque to the client — validated server-side on every turn. */
  preferences: any
  language: string
  updatedAt: number
}

export function emptySession(): StylistSession {
  return { messages: [], preferences: null, language: "en", updatedAt: Date.now() }
}

function isBrowser() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
}

export function loadSession(): StylistSession {
  if (!isBrowser()) return emptySession()
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return emptySession()
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.messages)) return emptySession()
    return parsed as StylistSession
  } catch {
    return emptySession()
  }
}

export function saveSession(session: StylistSession): void {
  if (!isBrowser()) return
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...session, updatedAt: Date.now() })
    )
  } catch {
    // Quota or private mode — the conversation still works in memory.
  }
}

export function clearSession(): void {
  if (!isBrowser()) return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to recover */
  }
}

/** Arabic and Arabizi both read right-to-left as a UI; Arabizi does not. */
export function isRtlLanguage(language: string | null | undefined): boolean {
  if (!language) return false
  return /^ar(-|$)/i.test(language)
}
