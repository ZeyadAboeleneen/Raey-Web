/**
 * instrumentation.ts
 *
 * Next.js 14 server instrumentation — runs ONCE when the Node.js server starts.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Used here to:
 *   1. Validate the upload storage directory on startup.
 *   2. Auto-create UPLOAD_DIR if it is missing and permissions allow.
 *   3. Run a write/read/delete probe to confirm writability.
 *   4. Emit clear console warnings if UPLOAD_DIR is not configured
 *      (so the developer is reminded before deploying to production).
 *
 * This file must be at the project root (same level as package.json).
 * It is automatically picked up by Next.js — no configuration needed.
 */

export async function register() {
  // Only run in the Node.js runtime, not in the Edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureStorageReady } = await import("@/lib/storage-health")
    await ensureStorageReady()
  }
}
