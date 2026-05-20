import Redis from "ioredis"

// Initialize Redis only if URL is provided
const redisUrl = process.env.REDIS_URL || ""
export const redis = redisUrl ? new Redis(redisUrl) : null

if (!redis) {
  console.warn("⚠️ [Rate Limit] REDIS_URL not set. Rate limiting is currently bypassed. Set REDIS_URL in production.")
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  reset: number
}

/**
 * Sliding Window Rate Limiter
 * @param key The unique key to limit (e.g., IP address)
 * @param limit Maximum number of requests allowed in the window
 * @param windowInSeconds Time window in seconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowInSeconds: number
): Promise<RateLimitResult> {
  // If Redis is not configured, always allow (fallback for local dev)
  if (!redis) {
    return { success: true, remaining: limit, reset: Date.now() + windowInSeconds * 1000 }
  }

  const now = Date.now()
  const windowStart = now - windowInSeconds * 1000
  const redisKey = `ratelimit:${key}`

  try {
    // 1. Add current request timestamp to a sorted set
    // 2. Remove timestamps older than the window
    // 3. Count remaining timestamps in the window
    // 4. Set expiry on the key to automatically clean up
    const pipeline = redis.pipeline()
    pipeline.zadd(redisKey, now, now.toString())
    pipeline.zremrangebyscore(redisKey, 0, windowStart)
    pipeline.zcard(redisKey)
    pipeline.expire(redisKey, windowInSeconds)

    const results = await pipeline.exec()
    if (!results) throw new Error("Pipeline execution failed")

    // The result of zcard is the 3rd operation (index 2)
    // The structure is [ [error, result], [error, result], ... ]
    const requestCount = results[2][1] as number

    return {
      success: requestCount <= limit,
      remaining: Math.max(0, limit - requestCount),
      reset: now + windowInSeconds * 1000
    }
  } catch (error) {
    console.error(`[Rate Limit] Redis error for key ${key}:`, error)
    // Fail open if Redis crashes so we don't break the entire site
    return { success: true, remaining: 1, reset: now + windowInSeconds * 1000 }
  }
}

/**
 * Generates a composite key for checkout rate limiting
 */
export function generateCheckoutRateLimitKey(
  ip: string,
  userId?: string | null,
  sessionId?: string | null
): string {
  // Combine IP, user ID, and session ID to prevent blanket-banning NATs
  const components = [ip]
  if (userId && userId !== "guest") components.push(userId)
  if (sessionId) components.push(sessionId)
  
  // Example output: "checkout:192.168.1.1:user123:sess456"
  return `checkout:${components.join(":")}`
}
