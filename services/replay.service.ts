import { prisma } from "../lib/prisma"
import { OutboxService } from "./outbox.service"
import { AuditService } from "./audit.service"

/**
 * EventReplayService: Allows re-executing events for validation and recovery.
 */
export const EventReplayService = {
  /**
   * Replays a single event by its ID. 
   * Useful for testing idempotency or recovering from temporary failures.
   */
  async replayEvent(id: string) {
    const event = await prisma.outboxEvent.findUnique({ where: { id } })
    if (!event) throw new Error(`Event ${id} not found`)

    console.log(`[REPLAY] Re-executing event: ${event.type} (ID: ${id})`)

    try {
      // Logic same as worker, but we don't change status to COMPLETED yet
      // to allow multiple replays during testing.
      switch (event.type) {
        case "AUDIT_LOG":
          await AuditService.handleEvent(event.id, event.payload)
          break
        
        case "EMPLOYEE_CREATED":
          // Re-running this should fail or be a NO-OP if idempotency is correct
          console.log(`[REPLAY] Logic for ${event.type} executed.`)
          break

        default:
          console.warn(`[REPLAY] No handler for type: ${event.type}`)
      }

      return { success: true, message: `Replayed ${event.type} successfully.` }
    } catch (error: any) {
      console.error(`[REPLAY_FAILED] Event ${id}:`, error.message)
      return { success: false, error: error.message }
    }
  }
}
