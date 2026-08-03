import "server-only"
import { prisma } from "@/lib/prisma"
import { type FawryCallbackPayload, callbackEventHash, mapFawryStatus, money2 } from "@/lib/fawry"
import { recordEvent, attachJournal } from "@/lib/payments/fawry-ledger"
import { postFawryPaymentJournal, findBookingIdByInvoice, getJournalConfig } from "@/lib/payments/fawry-journal"
import { reserveOrderItemsStock } from "@/lib/order-stock"
import { clearErpProductCaches } from "@/lib/erp-items"
import { syncOrderToErp } from "@/lib/erp-sync"

/**
 * The single place a Fawry event is allowed to change payment state.
 *
 * Both the push callback and the reconciliation poll funnel through here, so
 * there is one implementation of "what does this event mean" and one
 * idempotency guarantee.
 *
 * ── Ordering across two databases ──────────────────────────────────────────
 * The money ledger lives in the ERP (MSSQL); order and stock state live in the
 * web DB (MySQL). They cannot share a transaction, so the order is chosen so
 * that a crash between steps is always recoverable:
 *
 *   1. MSSQL  — write the ledger row. Doubles as the idempotency barrier.
 *   2. MySQL  — update order status and reserve stock, atomically.
 *   3. MSSQL  — create the ERP booking, then post the cash journal entry.
 *
 * The money record is written first because it is the fact we most need to
 * never lose. If a later step fails, the reconciliation cron re-polls Fawry and
 * re-enters here; step 1 reports `duplicate`, and steps 2–3 still run (each is
 * separately idempotent). That is why a duplicate does NOT short-circuit.
 *
 * Invariants:
 *   1. An event whose signature did not verify never approves an order.
 *   2. An amount short of what the order expects never approves an order — it
 *      lands in pending_review for a human.
 *   3. Applying the same event twice never double-books, double-reserves stock,
 *      or double-posts to the ledger.
 */

export interface ApplyEventInput {
  payload: FawryCallbackPayload
  signatureValid: boolean
  /** "callback" | "status-poll" — recorded for audit. */
  source: string
}

export type ApplyEventResult =
  | { outcome: "order_not_found"; merchantRefNum: string }
  | { outcome: "rejected"; reason: string; orderId?: string }
  | {
      outcome: "applied" | "duplicate"
      orderId: string
      paymentStatus: string
      txnStatus: string
      journalPosted?: boolean
      journalSkippedReason?: string
    }

/** Amounts are compared in piastres to sidestep float drift. */
const toPiastres = (v: number | string | null | undefined) => Math.round(parseFloat(money2(v)) * 100)

/** Matches the invoice code lib/erp-sync.ts derives for a web order. */
const invoiceCodeFor = (orderId: string) => `WEB-${orderId.substring(orderId.length - 6)}`.substring(0, 50)

export async function applyFawryEvent(input: ApplyEventInput): Promise<ApplyEventResult> {
  const { payload, signatureValid, source } = input

  const merchantRefNum = String(payload.merchantRefNumber ?? "").trim()
  if (!merchantRefNum) return { outcome: "rejected", reason: "missing merchantRefNumber" }

  const order = await prisma.order.findUnique({ where: { orderId: merchantRefNum } })
  if (!order) return { outcome: "order_not_found", merchantRefNum }

  const eventHash = callbackEventHash(payload)
  const txnStatus = mapFawryStatus(payload.orderStatus)
  const invoiceCode = invoiceCodeFor(order.orderId)

  // What the customer actually owes: the deposit when there is one, else the total.
  const expectedAmount = Number(order.depositAmount) > 0 ? Number(order.depositAmount) : Number(order.total)
  const expectedPiastres = toPiastres(expectedAmount)
  const paidPiastres = toPiastres(payload.paymentAmount)

  // Underpayment never auto-approves. Overpayment passes — the customer is not
  // harmed and Finance can reconcile the excess.
  const amountVerified = paidPiastres >= expectedPiastres

  const isPaid = txnStatus === "paid"
  const approve = isPaid && signatureValid && amountVerified

  let nextPaymentStatus: "pending" | "approved" | "pending_review" | "rejected" | "expired" | "refunded"
  if (approve) {
    nextPaymentStatus = "approved"
  } else if (isPaid) {
    nextPaymentStatus = "pending_review" // paid, but something doesn't add up
  } else if (txnStatus === "refunded") {
    nextPaymentStatus = "refunded"
  } else if (txnStatus === "expired") {
    nextPaymentStatus = "expired"
  } else if (txnStatus === "failed" || txnStatus === "canceled") {
    nextPaymentStatus = "rejected"
  } else {
    nextPaymentStatus = "pending"
  }

  const fraudReason = isPaid && !approve
    ? !signatureValid
      ? "Fawry event signature did not verify"
      : `Paid ${money2(payload.paymentAmount)} but ${money2(expectedAmount)} was expected`
    : null

  // ── 1. ERP ledger (money record + idempotency barrier) ────────────────────
  const ledgerResult = await recordEvent({
    orderRef: order.orderId,
    invoiceCode,
    status: txnStatus,
    fawryRefNumber: payload.fawryRefNumber ? String(payload.fawryRefNumber) : null,
    paymentRefNumber: payload.paymentRefrenceNumber ? String(payload.paymentRefrenceNumber) : null,
    amount: Number(payload.paymentAmount ?? 0),
    expectedAmount,
    fees: Number(payload.fawryFees ?? 0),
    paymentMethod: payload.paymentMethod ? String(payload.paymentMethod) : null,
    signatureValid,
    amountVerified,
    eventHash,
    rawPayload: { ...payload, _source: source },
    failureCode: payload.failureErrorCode ? String(payload.failureErrorCode) : null,
    failureReason: payload.failureReason ? String(payload.failureReason) : fraudReason,
    providerPaidAt: payload.paymentTime ? new Date(Number(payload.paymentTime)) : null,
  })

  const isDuplicate = ledgerResult.outcome === "duplicate"

  // ── 2. Web DB: order status + stock, atomically ───────────────────────────
  // Runs even for a duplicate event, so a crash after step 1 on the first
  // delivery is repaired by the retry. Each write below is idempotent.
  const firstApproval = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { orderId: order.orderId } })
    if (!current) return false

    // Terminal states are not walked back by a later out-of-order event.
    const alreadySettled = current.paymentStatus === "approved" || current.paymentStatus === "refunded"
    const shouldUpdate =
      !alreadySettled || nextPaymentStatus === "refunded" || nextPaymentStatus === "approved"

    if (shouldUpdate) {
      await tx.order.update({
        where: { orderId: order.orderId },
        data: {
          paymentStatus: nextPaymentStatus,
          paymentMethod: "fawry",
          ...(approve
            ? {
                paymentVerifiedAt: new Date(),
                paymentTransactionId: payload.fawryRefNumber ? String(payload.fawryRefNumber) : undefined,
                paymentFraudReason: null,
              }
            : {}),
          ...(fraudReason ? { paymentFraudReason: fraudReason } : {}),
        },
      })
    }

    // Stock moves only on the transition into approved, so a redelivered
    // callback for an already-approved order cannot decrement twice.
    const isFirstApproval = approve && current.paymentStatus !== "approved"
    if (isFirstApproval) {
      await reserveOrderItemsStock(tx, current.items as any[])
    }
    return isFirstApproval
  })

  // ── 3. ERP booking, then the cash journal entry ───────────────────────────
  let journalPosted = false
  let journalSkippedReason: string | undefined

  if (firstApproval) {
    clearErpProductCaches()

    // Booking first — the journal entry attaches to it via RecID.
    // syncOrderToErp is itself idempotent (guards on invoice_code).
    try {
      const syncResult = await syncOrderToErp(order.orderId)
      if (!syncResult.success) {
        console.error(`[Fawry] ERP booking sync failed for paid order ${order.orderId}:`, syncResult.error)
      }
    } catch (syncError) {
      console.error(`[Fawry] ERP booking sync threw for paid order ${order.orderId}:`, syncError)
    }

    try {
      const bookingId = await findBookingIdByInvoice(invoiceCode)
      const journalResult = await postFawryPaymentJournal({
        invoiceCode,
        bookingId,
        amount: Number(payload.paymentAmount ?? expectedAmount),
        orderRef: order.orderId,
      })

      if (journalResult.posted) {
        journalPosted = true
        if (ledgerResult.outcome === "recorded") {
          await attachJournal(ledgerResult.id, journalResult.journalId)
        }
      } else {
        journalSkippedReason = journalResult.reason
        const config = getJournalConfig()
        // Not configured is expected until the accounts are confirmed; anything
        // else is a real failure worth shouting about.
        const level = config.enabled ? console.error : console.warn
        level(
          `[Fawry] Cash journal NOT posted for ${order.orderId} (${money2(payload.paymentAmount)} EGP): ` +
          `${journalResult.reason}. The payment is recorded in tb_FawryPayments and needs a manual journal entry.`,
        )
      }
    } catch (journalError) {
      journalSkippedReason = "journal posting threw"
      console.error(`[Fawry] Journal posting threw for ${order.orderId}:`, journalError)
    }
  }

  return {
    outcome: isDuplicate && !firstApproval ? "duplicate" : "applied",
    orderId: order.orderId,
    paymentStatus: nextPaymentStatus,
    txnStatus,
    journalPosted,
    journalSkippedReason,
  }
}
