import { prisma } from "../lib/prisma"
import { InvariantService } from "./invariant.service"
import { classifyError } from "../lib/failure-taxonomy"

/**
 * BootstrapService: Ensures the system is healthy before it starts.
 */
export const BootstrapService = {
  /**
   * Runs critical startup checks.
   * THROWS if the system is in an unrecoverable state.
   */
  async bootstrap() {
    console.log("🚀 [BOOTSTRAP] Initiating System Guard Checks...")
    
    try {
      // 1. Basic DB Connection
      await prisma.$connect()
      console.log("✅ [BOOTSTRAP] Database connected.")

      // 2. Assert Critical Invariants
      const violations = await InvariantService.assertSystemInvariants()
      
      // If there are CRITICAL violations (like stuck processes at startup),
      // we might want to fail-fast.
      const criticals = violations.filter(v => v.includes("STUCK_PROCESSING"))
      if (criticals.length > 100) { // Tolerance threshold
        throw new Error(`CRITICAL_BACKLOG: ${criticals.length} events are stuck. System requires manual intervention before start.`)
      }

      // 3. Environment Sanity
      if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
        throw new Error("SECURITY_VIOLATION: JWT_SECRET missing in production.")
      }

      console.log("✨ [BOOTSTRAP] System validated and ready.")

    } catch (error: any) {
      const taxonomy = classifyError("STUCK_STATE_AT_STARTUP", error.message)
      console.error("🚨 [BOOTSTRAP_FAILED] CRITICAL ERROR DURING STARTUP:")
      console.error(JSON.stringify(taxonomy, null, 2))
      
      // In a real production container (e.g. Docker/K8s), we should exit(1)
      // so the orchestrator knows to restart or stop the deploy.
      if (process.env.NODE_ENV === "production") {
        console.error("⛔ [FATAL] Blocking startup to prevent corruption.")
        process.exit(1)
      }
    }
  }
}
