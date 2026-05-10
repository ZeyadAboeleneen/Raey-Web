export const AuditService = {
  /**
   * Translates an outbox event payload into a persistent Audit Log record.
   * Linked to eventId for idempotency.
   */
  async handleEvent(eventId: string, payload: any) {
    try {
      return await prisma.auditLog.create({
        data: {
          eventId,
          action: payload.action,
          actorId: payload.actorId,
          actorType: payload.actorType || "employee",
          entity: payload.entity,
          entityId: payload.entityId,
          before: payload.before,
          after: payload.after,
          metadata: payload.metadata,
        }
      })
    } catch (error: any) {
      if (error.code === "P2002") {
        console.log(`[AUDIT_SERVICE] Event ${eventId} already processed. Skipping.`)
        return null
      }
      throw error
    }
  }
}
