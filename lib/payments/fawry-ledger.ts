import "server-only"
import { getMssqlPool, sql } from "@/lib/mssql"
import { money2, type FawryCallbackPayload, type PaymentTxnStatusValue } from "@/lib/fawry"

/**
 * The Fawry payment ledger, in the ERP (MSSQL).
 *
 * `dbo.tb_FawryPayments` is the system of record for money movement: one row
 * per payment attempt or provider event, with the raw payload kept verbatim.
 * Created by scripts/erp-fawry-payments-table.sql.
 *
 * Idempotency is a filtered unique index on EventHash. A replayed callback
 * raises error 2601/2627 on insert, which `recordEvent` reports as `duplicate`
 * rather than treating as a failure. Enforcing this in the database rather than
 * in application logic is what makes concurrent redelivery safe.
 */

/** SQL Server unique-constraint / unique-index violation. */
const isUniqueViolation = (error: any) => error?.number === 2627 || error?.number === 2601

export interface RecordEventInput {
  orderRef: string
  invoiceCode?: string | null
  status: PaymentTxnStatusValue
  fawryRefNumber?: string | null
  paymentRefNumber?: string | null
  amount: number
  expectedAmount: number
  fees?: number
  paymentMethod?: string | null
  signatureValid: boolean
  amountVerified: boolean
  eventHash: string
  rawPayload: unknown
  failureCode?: string | null
  failureReason?: string | null
  providerPaidAt?: Date | null
}

export type RecordEventResult =
  | { outcome: "recorded"; id: number }
  | { outcome: "duplicate" }

/**
 * Insert one provider event. Returns `duplicate` when this exact event has
 * already been recorded — the caller should treat that as success.
 */
export async function recordEvent(input: RecordEventInput): Promise<RecordEventResult> {
  const pool = await getMssqlPool()

  try {
    const result = await pool
      .request()
      .input("OrderRef", sql.NVarChar(100), input.orderRef)
      .input("InvoiceCode", sql.NVarChar(50), input.invoiceCode ?? null)
      .input("Status", sql.VarChar(20), input.status)
      .input("FawryRefNumber", sql.NVarChar(100), input.fawryRefNumber ?? null)
      .input("PaymentRefNumber", sql.NVarChar(100), input.paymentRefNumber ?? null)
      .input("Amount", sql.Decimal(18, 2), Number(money2(input.amount)))
      .input("ExpectedAmount", sql.Decimal(18, 2), Number(money2(input.expectedAmount)))
      .input("Fees", sql.Decimal(18, 2), Number(money2(input.fees ?? 0)))
      .input("PaymentMethod", sql.NVarChar(32), input.paymentMethod?.slice(0, 32) ?? null)
      .input("SignatureValid", sql.Bit, input.signatureValid ? 1 : 0)
      .input("AmountVerified", sql.Bit, input.amountVerified ? 1 : 0)
      .input("EventHash", sql.VarChar(64), input.eventHash)
      .input("RawPayload", sql.NVarChar(sql.MAX), JSON.stringify(input.rawPayload ?? {}))
      .input("FailureCode", sql.NVarChar(64), input.failureCode?.slice(0, 64) ?? null)
      .input("FailureReason", sql.NVarChar(sql.MAX), input.failureReason ?? null)
      .input("ProviderPaidAt", sql.DateTime, input.providerPaidAt ?? null)
      .query(`
        INSERT INTO dbo.tb_FawryPayments (
          OrderRef, InvoiceCode, Status, FawryRefNumber, PaymentRefNumber,
          Amount, ExpectedAmount, Fees, Currency, PaymentMethod,
          SignatureValid, AmountVerified, EventHash, RawPayload,
          FailureCode, FailureReason, ProviderPaidAt, CreatedAt, UpdatedAt
        )
        OUTPUT INSERTED.ID
        VALUES (
          @OrderRef, @InvoiceCode, @Status, @FawryRefNumber, @PaymentRefNumber,
          @Amount, @ExpectedAmount, @Fees, 'EGP', @PaymentMethod,
          @SignatureValid, @AmountVerified, @EventHash, @RawPayload,
          @FailureCode, @FailureReason, @ProviderPaidAt, GETDATE(), GETDATE()
        )
      `)

    return { outcome: "recorded", id: result.recordset[0].ID as number }
  } catch (error: any) {
    if (isUniqueViolation(error)) return { outcome: "duplicate" }
    throw error
  }
}

/**
 * Record (or refresh) the 'initiated' row written when a checkout session is
 * created. There is at most one per order — a customer who restarts checkout
 * updates it rather than adding rows.
 */
export async function recordInitiated(input: {
  orderRef: string
  expectedAmount: number
  requestPayload: unknown
}): Promise<void> {
  const pool = await getMssqlPool()

  await pool
    .request()
    .input("OrderRef", sql.NVarChar(100), input.orderRef)
    .input("ExpectedAmount", sql.Decimal(18, 2), Number(money2(input.expectedAmount)))
    .input("RawPayload", sql.NVarChar(sql.MAX), JSON.stringify(input.requestPayload ?? {}))
    .query(`
      UPDATE dbo.tb_FawryPayments
        SET ExpectedAmount = @ExpectedAmount,
            RawPayload     = @RawPayload,
            UpdatedAt      = GETDATE()
      WHERE OrderRef = @OrderRef AND Status = 'initiated';

      IF @@ROWCOUNT = 0
        INSERT INTO dbo.tb_FawryPayments
          (OrderRef, Status, ExpectedAmount, Currency, RawPayload, CreatedAt, UpdatedAt)
        VALUES
          (@OrderRef, 'initiated', @ExpectedAmount, 'EGP', @RawPayload, GETDATE(), GETDATE());
    `)
}

/**
 * The merchantRefNum actually sent to Fawry for the most recent charge
 * attempt on this order — read back from the 'initiated' row's stored
 * request payload, which recordInitiated() keeps current on every retry.
 * Falls back to the bare orderId (attempt 1's ref, or if no row exists yet).
 */
export async function getLatestMerchantRefNum(orderRef: string): Promise<string> {
  const pool = await getMssqlPool()
  const result = await pool
    .request()
    .input("OrderRef", sql.NVarChar(100), orderRef)
    .query(`
      SELECT TOP 1 RawPayload FROM dbo.tb_FawryPayments
      WHERE OrderRef = @OrderRef AND Status = 'initiated'
    `)

  const raw = result.recordset[0]?.RawPayload
  if (!raw) return orderRef

  try {
    const parsed = JSON.parse(raw)
    return typeof parsed?.merchantRefNum === "string" && parsed.merchantRefNum ? parsed.merchantRefNum : orderRef
  } catch {
    return orderRef
  }
}

/** Attach the posted journal entry to the payment row, for traceability. */
export async function attachJournal(paymentId: number, journalId: number): Promise<void> {
  const pool = await getMssqlPool()
  await pool
    .request()
    .input("ID", sql.BigInt, paymentId)
    .input("JournalID", sql.Int, journalId)
    .query(`UPDATE dbo.tb_FawryPayments SET JournalID = @JournalID, UpdatedAt = GETDATE() WHERE ID = @ID`)
}

export interface LedgerRow {
  ID: number
  OrderRef: string
  Status: string
  FawryRefNumber: string | null
  Amount: number
  ExpectedAmount: number
  JournalID: number | null
  CreatedAt: Date
}

/** Has this order ever been recorded as paid? Used to avoid double-posting. */
export async function hasPaidEvent(orderRef: string): Promise<boolean> {
  const pool = await getMssqlPool()
  const result = await pool
    .request()
    .input("OrderRef", sql.NVarChar(100), orderRef)
    .query(`
      SELECT COUNT(*) AS cnt FROM dbo.tb_FawryPayments
      WHERE OrderRef = @OrderRef AND Status = 'paid' AND SignatureValid = 1 AND AmountVerified = 1
    `)
  return (result.recordset[0]?.cnt ?? 0) > 0
}

/** Full history for an order, newest first — for the admin view and disputes. */
export async function getPaymentsForOrder(orderRef: string): Promise<LedgerRow[]> {
  const pool = await getMssqlPool()
  const result = await pool
    .request()
    .input("OrderRef", sql.NVarChar(100), orderRef)
    .query(`
      SELECT ID, OrderRef, Status, FawryRefNumber, Amount, ExpectedAmount, JournalID, CreatedAt
      FROM dbo.tb_FawryPayments
      WHERE OrderRef = @OrderRef
      ORDER BY ID DESC
    `)
  return result.recordset as LedgerRow[]
}

/** Build the ledger status from a Fawry payload plus our verification verdicts. */
export function describeEvent(payload: FawryCallbackPayload): string {
  return `fawryRef=${payload.fawryRefNumber ?? "?"} status=${payload.orderStatus ?? "?"} amount=${money2(payload.paymentAmount)}`
}
