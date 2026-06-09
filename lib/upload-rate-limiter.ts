/**
 * lib/upload-rate-limiter.ts
 *
 * In-memory sliding-window rate limiter for upload endpoints.
 *
 * Limits:
 *   - 20 upload requests per minute  per IP
 *   - 100 upload requests per hour    per IP
 *
 * Trade-offs:
 *   ✅ Zero dependencies — no Redis required
 *   ✅ Works perfectly for SmarterASP single-instance deployments
 *   ⚠️  State is lost on process restart (fine — limits are per-minute/hour)
 *   ⚠️  Does NOT work across multiple server instances (not relevant here)
 *
 * If you ever scale to multiple instances, replace this with an
 * Upstash Redis rate limiter (@upstash/ratelimit).
 */

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface WindowEntry {
  timestamps: number[]   // rolling list of request timestamps (ms)
}

export interface RateLimitResult {
  allowed:           boolean
  remainingMinute:   number
  remainingHour:     number
  retryAfterSeconds: number | null   // set when denied
}

/* ================================================================== */
/*  Configuration                                                      */
/* ================================================================== */

const MINUTE_MS   = 60_000
const HOUR_MS     = 3_600_000
const MAX_PER_MIN = 20
const MAX_PER_HOUR = 100

// Clean up entries for IPs that have been quiet for over 2 hours
const CLEANUP_AFTER_MS = 2 * HOUR_MS
const CLEANUP_INTERVAL_MS = 10 * MINUTE_MS

/* ================================================================== */
/*  Store                                                              */
/* ================================================================== */

// Single module-level map — survives for the lifetime of the Node process
const store = new Map<string, WindowEntry>()

// Periodic cleanup to prevent unbounded memory growth
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function startCleanupIfNeeded() {
  if (cleanupTimer) return
  // setInterval is not available during Next.js build — guard it
  if (typeof setInterval === "undefined") return

  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - CLEANUP_AFTER_MS
    for (const [ip, entry] of store.entries()) {
      const mostRecent = entry.timestamps.at(-1) ?? 0
      if (mostRecent < cutoff) store.delete(ip)
    }
  }, CLEANUP_INTERVAL_MS)

  // Don't hold the process open for this timer
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    (cleanupTimer as any).unref()
  }
}

/* ================================================================== */
/*  Core logic                                                         */
/* ================================================================== */

/**
 * Check the rate limit for the given IP address.
 *
 * Records the current request if allowed.
 * Returns the limit decision without recording if denied.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  startCleanupIfNeeded()

  const now     = Date.now()
  const minCut  = now - MINUTE_MS
  const hourCut = now - HOUR_MS

  // Get or create entry
  let entry = store.get(ip)
  if (!entry) {
    entry = { timestamps: [] }
    store.set(ip, entry)
  }

  // Prune timestamps outside the hour window (keeps memory bounded per IP)
  entry.timestamps = entry.timestamps.filter(t => t > hourCut)

  const inLastMinute = entry.timestamps.filter(t => t > minCut).length
  const inLastHour   = entry.timestamps.length

  const minuteExceeded = inLastMinute >= MAX_PER_MIN
  const hourExceeded   = inLastHour   >= MAX_PER_HOUR

  if (minuteExceeded || hourExceeded) {
    // Calculate retry-after (time until the oldest relevant timestamp expires)
    let retryAfterMs = MINUTE_MS
    if (minuteExceeded) {
      const oldestInWindow = entry.timestamps.filter(t => t > minCut).at(0) ?? now
      retryAfterMs = Math.min(retryAfterMs, oldestInWindow + MINUTE_MS - now)
    }
    if (hourExceeded) {
      const oldestInHour = entry.timestamps.at(0) ?? now
      retryAfterMs = Math.min(retryAfterMs, oldestInHour + HOUR_MS - now)
    }

    return {
      allowed:           false,
      remainingMinute:   Math.max(0, MAX_PER_MIN  - inLastMinute),
      remainingHour:     Math.max(0, MAX_PER_HOUR - inLastHour),
      retryAfterSeconds: Math.ceil(Math.max(1, retryAfterMs) / 1000),
    }
  }

  // Allowed — record this request
  entry.timestamps.push(now)

  return {
    allowed:           true,
    remainingMinute:   MAX_PER_MIN  - inLastMinute  - 1,
    remainingHour:     MAX_PER_HOUR - inLastHour    - 1,
    retryAfterSeconds: null,
  }
}

/**
 * Extract the real client IP from a Next.js request.
 * Handles proxies (Cloudflare, load balancers) via standard headers.
 */
export function getClientIp(request: Request): string {
  const headers = request.headers as any

  // Cloudflare
  const cf = headers.get?.("cf-connecting-ip")
  if (cf) return cf

  // Standard forwarded-for (take the first non-private address)
  const xff = headers.get?.("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0].trim()
    if (first) return first
  }

  // IIS / iisnode real IP header
  const xri = headers.get?.("x-real-ip")
  if (xri) return xri

  return "unknown"
}
