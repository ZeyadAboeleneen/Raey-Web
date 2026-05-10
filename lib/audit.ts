import { prisma } from "./prisma"

export interface AuditEvent {
  actorId?: string
  actorType?: "employee" | "user" | "system"
  action: string
  entity?: string
  entityId?: string
  before?: any
  after?: any
  metadata?: any
}

/**
 * Log an event to the AuditLog table.
 * This is asynchronous and designed to be "fire and forget" 
 * to avoid blocking the main request thread.
 */
export function logAudit(event: AuditEvent) {
  // We don't await this to keep it async and non-blocking for the user
  prisma.auditLog.create({
    data: {
      actorId: event.actorId,
      actorType: event.actorType || "employee",
      action: event.action,
      entity: event.entity,
      entityId: event.entityId,
      before: event.before || undefined,
      after: event.after || undefined,
      metadata: event.metadata || undefined,
    }
  }).catch(err => {
    console.error("[AUDIT_LOG_ERROR]", err)
  })
}

/**
 * Utility to extract IP and User Agent from a request
 */
export function getRequestMetadata(request: Request) {
  return {
    ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
  }
}
