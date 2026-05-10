import { prisma } from "../lib/prisma"

/**
 * InvariantService: Asserts the "Laws of Truth" for the system.
 * These are not just monitoring metrics, but absolute rules of the architecture.
 */
export const InvariantService = {
  /**
   * Checks for architectural violations.
   * If any invariant fails, it logs a CRITICAL warning.
   */
  async assertSystemInvariants() {
    console.log("🛡️ [INVARIANT_CHECK] Asserting System Laws...")
    const violations: string[] = []

    // LAW 1: No event should stay in 'PROCESSING' for more than 10 minutes.
    // (Meaning a worker crashed or hung)
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000)
    const stuckEvents = await prisma.outboxEvent.count({
      where: {
        status: "PROCESSING",
        updatedAt: { lt: tenMinsAgo }
      }
    })
    if (stuckEvents > 0) {
      violations.push(`STUCK_PROCESSING: Found ${stuckEvents} events stuck in PROCESSING state for >10m.`)
    }

    // LAW 2: No event should have attempts >= 5 without being in 'FAILED' status.
    const illegalPending = await prisma.outboxEvent.count({
      where: {
        status: "PENDING",
        attempts: { gte: 5 }
      }
    })
    if (illegalPending > 0) {
      violations.push(`ILLEGAL_RETRY_STATE: Found ${illegalPending} events with max attempts but still PENDING.`)
    }

    // LAW 3: Every Audit Log must have an associated eventId (Except legacy logs).
    // (Check only logs created after the Truth Contract was signed)
    const contractDate = new Date("2026-05-09") 
    const orphanLogs = await prisma.auditLog.count({
      where: {
        eventId: null,
        createdAt: { gte: contractDate }
      }
    })
    if (orphanLogs > 0) {
      violations.push(`ORPHAN_AUDIT_LOGS: Found ${orphanLogs} audit logs missing a unique eventId.`)
    }

    // REPORTING
    if (violations.length > 0) {
      console.error("🚨 [CRITICAL_INVARIANT_VIOLATION] The system has drifted from its Truth Contract!")
      violations.forEach(v => console.error(`   👉 ${v}`))
    } else {
      console.log("✅ [INVARIANT_CHECK] All system laws are intact.")
    }

    return violations
  }
}
