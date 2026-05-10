import { prisma } from "../lib/prisma"
import { EventRegistry, type EventType } from "../lib/schemas/events.schema"

export type { EventType }

export const OutboxService = {
  /**
   * Enqueues an event with strict schema validation.
   */
  async enqueue(type: EventType, payload: any, tx?: any) {
    // 1. RUNTIME CONTRACT ENFORCEMENT
    const schema = EventRegistry[type]
    if (!schema) {
      throw new Error(`[ENFORCEMENT_LAYER] Unknown event type: ${type}`)
    }
    
    // Validate payload (Throws ZodError if invalid)
    const validPayload = schema.parse(payload)

    const db = tx || prisma
    return await db.outboxEvent.create({
      data: {
        type,
        payload: validPayload,
        status: "PENDING",
        attempts: 0
      }
    })
  },

  /**
   * Picks a batch of events using "SKIP LOCKED" to avoid worker collisions.
   * Note: Raw SQL is needed for SKIP LOCKED in most DBs with Prisma.
   */
  async pickBatch(limit: number = 10) {
    // MySQL 8+ / PostgreSQL syntax for atomic queue picking
    return await prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM outbox_events 
      WHERE status = 'PENDING' AND attempts < 5
      ORDER BY created_at ASC 
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `)
  },

  /**
   * Processes a specific event and handles success/failure with retry logic.
   */
  async complete(id: string, result?: any) {
    return await prisma.outboxEvent.update({
      where: { id },
      data: {
        status: "COMPLETED",
        processedAt: new Date()
      }
    })
  },

  async fail(id: string, error: string, currentAttempts: number) {
    const isPermanent = currentAttempts >= 5
    return await prisma.outboxEvent.update({
      where: { id },
      data: {
        status: isPermanent ? "FAILED" : "PENDING", // Move to FAILED (DLQ) if max attempts reached
        lastError: error,
        attempts: currentAttempts
      }
    })
  }
}
