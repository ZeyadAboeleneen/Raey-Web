import { z } from "zod"

/**
 * Event Schema Registry: The "Executable Contract" for all Outbox events.
 */

export const AuditEventSchema = z.object({
  action: z.string(),
  actorId: z.string().optional(),
  actorType: z.enum(["employee", "user", "system"]).default("employee"),
  entity: z.string().optional(),
  entityId: z.string().optional(),
  before: z.any().optional(),
  after: z.any().optional(),
  metadata: z.record(z.any()).optional()
})

export const ErpSyncEventSchema = z.object({
  erpAction: z.enum(["CREATE_ITEM", "UPDATE_PRICE", "SYNC_STOCK"]),
  sourceId: z.string(),
  data: z.record(z.any())
})

// Unified Event Registry
export const EventRegistry = {
  AUDIT_LOG: AuditEventSchema,
  ERP_SYNC: ErpSyncEventSchema,
  EMPLOYEE_CREATED: z.object({ id: z.string(), email: z.string() }),
  PRODUCT_UPDATED: z.object({ id: z.string(), priceChanged: z.boolean() })
}

export type EventType = keyof typeof EventRegistry
