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
    // Prefer IPv4 when a hostname resolves to both A and AAAA records.
    //
    // Some environments (this dev sandbox confirmed among them — `dns.resolve4`
    // for generativelanguage.googleapis.com returns instantly, `dns.resolve6`
    // times out entirely, no real IPv6 route) have no working IPv6 path.
    // Node 18+'s default result order can still hand undici/fetch an AAAA
    // record to try, which then hangs/fails with ENOTFOUND — intermittently
    // succeeding or failing depending on which code path queried DNS and in
    // what order, which is exactly what made the Gemini-backed AI Stylist and
    // Try-On routes fail here despite the Gemini API key and network both
    // being fine. This is Node's own documented fix for that class of issue
    // and is safe everywhere IPv6 works too — it only breaks the tie when
    // both are available, never disables IPv6 outright.
    const dns = await import("dns")
    dns.setDefaultResultOrder("ipv4first")

    const { ensureStorageReady } = await import("@/lib/storage-health")
    await ensureStorageReady()
  }
}
