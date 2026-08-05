import "server-only"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { refundPayment, money2 } from "@/lib/fawry"
import { getPaidFawryRefNumber, recordEvent } from "@/lib/payments/fawry-ledger"

/**
 * Refunds a Fawry-paid order's deposit — the API call that actually returns
 * money to the customer's card, as opposed to reverseDepositInErp() in
 * erp-sync.ts, which only reverses our own internal ERP accounting entry and
 * never touches Fawry. Call both when cancelling a Fawry order with a
 * deposit: this one for the real money, that one for the branch's books
 * (which only applies to employee-placed, cash-drawer orders anyway).
 *
 * No-ops (success, not attempted) for non-Fawry orders or orders that were
 * never actually approved — nothing to refund from Fawry's side.
 */
export async function refundFawryOrderPayment(
  orderId: string,
  reason?: string,
): Promise<{ success: boolean; attempted: boolean; message?: string; error?: string }> {
  const order = await prisma.order.findUnique({ where: { orderId } })
  if (!order) return { success: false, attempted: false, error: "Order not found" }

  if (order.paymentMethod !== "fawry" || order.paymentStatus !== "approved") {
    return { success: true, attempted: false, message: "Not a Fawry-approved order — nothing to refund via Fawry" }
  }

  const amount = Number(order.depositAmount) > 0 ? Number(order.depositAmount) : Number(order.total)
  if (!isFinite(amount) || amount <= 0) {
    return { success: true, attempted: false, message: "No payable amount to refund" }
  }

  const fawryRefNumber = await getPaidFawryRefNumber(orderId)
  if (!fawryRefNumber) {
    return {
      success: false,
      attempted: false,
      error: "No paid Fawry ledger row found for this order — cannot determine Fawry's reference number",
    }
  }

  const result = await refundPayment({ referenceNumber: fawryRefNumber, refundAmount: amount, reason })

  // Record the attempt either way — a failed refund still needs an audit
  // trail so it can be retried or handled manually with full context.
  const eventHash = crypto
    .createHash("sha256")
    .update(`refund|${orderId}|${fawryRefNumber}|${money2(amount)}`)
    .digest("hex")

  try {
    await recordEvent({
      orderRef: orderId,
      status: result.ok ? "refunded" : "failed",
      fawryRefNumber,
      amount,
      expectedAmount: amount,
      signatureValid: true, // this is our own outbound call, not a verified inbound event
      amountVerified: true,
      eventHash,
      rawPayload: { _kind: "refund", request: { fawryRefNumber, amount, reason }, response: result.raw },
      failureCode: result.statusCode ? String(result.statusCode) : null,
      failureReason: result.ok ? null : result.error ?? result.statusDescription ?? null,
    })
  } catch (ledgerError) {
    // The refund itself already happened (or failed) at Fawry — a ledger
    // write failure must not be reported as the refund having failed.
    console.error(`[Fawry/refund] Ledger write failed for ${orderId} (refund itself ${result.ok ? "succeeded" : "failed"}):`, ledgerError)
  }

  if (!result.ok) {
    console.error(`[Fawry/refund] Refund failed for ${orderId} (fawryRef=${fawryRefNumber}, amount=${amount}): ${result.error}`)
    return { success: false, attempted: true, error: result.error || "Fawry refund failed" }
  }

  console.log(`[Fawry/refund] Refunded ${amount} EGP for ${orderId} (fawryRef=${fawryRefNumber})`)
  return { success: true, attempted: true, message: `Refunded ${amount} EGP via Fawry` }
}
