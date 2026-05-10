import { runOutboxWorker } from "./outbox-worker"
import { BootstrapService } from "../services/bootstrap.service"

const globalWithWorker = globalThis as any

/**
 * Initializes the background worker poller.
 */
export async function initOutboxWorker() {
  if (!globalWithWorker.workerStarted) {
    globalWithWorker.workerStarted = true
    
    // FAIL-FAST BOOTSTRAP
    await BootstrapService.bootstrap()
    
    console.log("🚀 [SYSTEM] Starting Outbox Worker Poller (Hardened & Bootstrapped)...")
    
    setInterval(() => {
      runOutboxWorker().catch(error => {
        console.error("❌ [OUTBOX_WORKER_ERROR]", error)
      })
    }, 15000) 
  }
}
