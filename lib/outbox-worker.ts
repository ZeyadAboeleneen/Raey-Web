import { OutboxService } from "../services/outbox.service"
import { AuditService } from "../services/audit.service"
import { classifyError } from "./failure-taxonomy"

/**
 * Real Production-Grade Worker
 */
export async function runOutboxWorker() {
  // 1. Pick a batch atomically (using SKIP LOCKED)
  const events = await OutboxService.pickBatch(10)
  
  if (events.length === 0) return

  for (const event of events) {
    try {
      // 2. Process based on type
      switch (event.type) {
        case "AUDIT_LOG":
          await AuditService.handleEvent(event.id, event.payload)
          break
        
        case "ERP_SYNC":
          // Placeholder for Phase 3
          console.log(`[WORKER] Syncing with ERP: ${event.id}`)
          break

        default:
          console.warn(`[WORKER] Unhandled event type: ${event.type}`)
      }

      // 3. Mark as complete
      await OutboxService.complete(event.id)
      console.log(`✅ [WORKER] Event ${event.id} completed.`)

    } catch (error: any) {
      // ELIMINATE SILENT FAILURE: Using Failure Taxonomy
      const errorCode = event.attempts >= 4 ? "EVENT_RETRY_EXHAUSTED" : "OUTBOX_PROCESSING_ERROR"
      const classified = classifyError(errorCode, error.message)
      
      console.error(JSON.stringify({
        ...classified,
        component: "OUTBOX_WORKER",
        eventId: event.id,
        eventType: event.type,
        stack: error.stack
      }, null, 2))
      
      // 4. Handle failure with retry/DLQ logic
      await OutboxService.fail(event.id, error.message, event.attempts + 1)
    }
  }
}
