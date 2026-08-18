/**
 * lib/try-on-storage.ts
 *
 * Saved looks, browser-side.
 *
 * The storefront has no customer authentication — `lib/auth-context.tsx` and
 * `lib/api-auth.ts` authenticate ERP staff, not shoppers — so "SAVE LOOK"
 * persists to the shopper's own browser rather than to an account. Nothing is
 * uploaded: the generated image never leaves this device unless the shopper
 * explicitly downloads or shares it.
 *
 * When customer accounts land, this module is the seam to swap for a
 * server-backed `VirtualTryOn` record (userId, dressId, image ref, createdAt).
 */

const STORAGE_KEY = "raey_tryon_looks"

/** Generated images are large; keeping a few avoids blowing the quota. */
const MAX_SAVED_LOOKS = 4

/** Saved looks age out — a try-on is a moment, not a permanent record. */
const LOOK_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface SavedLook {
  id: string
  dressId: string
  dressName: string
  branch: string
  collection: string
  productUrl: string
  /** data: URL of the generated image. */
  image: string
  createdAt: number
  expiresAt: number
}

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function read(): SavedLook[] {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed.filter(
      (l: any): l is SavedLook =>
        l && typeof l.image === "string" && typeof l.expiresAt === "number" && l.expiresAt > now
    )
  } catch {
    return []
  }
}

function write(looks: SavedLook[]): boolean {
  if (!isBrowser()) return false
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(looks))
    return true
  } catch {
    // Quota exceeded — drop the oldest and try once more before giving up.
    if (looks.length > 1) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(looks.slice(0, 1)))
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

export function getSavedLooks(): SavedLook[] {
  return read()
}

export interface SaveLookInput {
  dressId: string
  dressName: string
  branch: string
  collection: string
  productUrl: string
  image: string
}

/** Saves a look, newest first. Returns null when storage is unavailable/full. */
export function saveLook(input: SaveLookInput): SavedLook | null {
  const now = Date.now()
  const look: SavedLook = {
    id: `${input.dressId}-${now}`,
    ...input,
    createdAt: now,
    expiresAt: now + LOOK_TTL_MS,
  }

  const next = [look, ...read().filter((l) => l.dressId !== input.dressId)].slice(0, MAX_SAVED_LOOKS)
  return write(next) ? look : null
}

export function removeLook(id: string): void {
  write(read().filter((l) => l.id !== id))
}

export function clearLooks(): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing we can do — and nothing sensitive leaks either way */
  }
}
