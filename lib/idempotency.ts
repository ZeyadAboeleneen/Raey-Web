import { prisma } from "./prisma"
import { NextResponse } from "next/server"

/**
 * Checks if an idempotency key exists and returns the stored response if it does.
 * Otherwise, it stores the pending state or returns null.
 */
export async function getStoredResponse(key: string): Promise<any | null> {
  const stored = await prisma.idempotencyKey.findUnique({
    where: { key }
  })

  if (!stored) return null

  // If expired, delete and return null
  if (new Date() > stored.expiresAt) {
    await prisma.idempotencyKey.delete({ where: { key } })
    return null
  }

  return stored.response
}

/**
 * Tries to acquire an idempotency lock.
 * Returns true if lock acquired, false if already locked.
 */
export async function tryLock(key: string): Promise<boolean> {
  try {
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 5)

    await prisma.idempotencyKey.create({
      data: {
        key,
        response: { status: "PROCESSING" },
        expiresAt
      }
    })
    return true
  } catch (e: any) {
    // Only return false if it's a unique constraint violation (P2002)
    if (e.code === "P2002") {
      return false
    }
    // If it's a connection error or something else, throw it!
    console.error(`[IDEMPOTENCY_LOCK_ERROR] Key: ${key}`, e)
    throw e
  }
}

/**
 * Stores a response and releases the lock (by updating the record).
 */
export async function storeResponse(key: string, response: any, ttlHours = 24) {
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + ttlHours)

  return await prisma.idempotencyKey.update({
    where: { key },
    data: { response, expiresAt }
  })
}
