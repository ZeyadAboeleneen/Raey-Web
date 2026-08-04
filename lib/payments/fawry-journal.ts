import "server-only"
import { getMssqlPool, sql } from "@/lib/mssql"

/**
 * Posts a confirmed Fawry payment into the ERP accounting journal, mirroring
 * the "اذن حجز" entry the ERP itself creates for a reservation deposit
 * (tb_Journal header + two balanced tb_JournalDet lines, JSourceID 29).
 *
 * ── Why this is configuration, not a constant ──────────────────────────────
 * There is no online/Fawry cash account in the ERP's AccountTree, and the
 * existing CashID→GL mapping in lib/erp-sync.ts does not match what the live
 * journals actually do (see docs/FAWRY_INTEGRATION.md). Rather than guess an
 * account number and post into a live general ledger, this module refuses to
 * post unless the accounts are configured explicitly.
 *
 * Set in .env once your accountant confirms them:
 *   FAWRY_JOURNAL_ENABLED=true
 *   FAWRY_CASH_GL_ACCOUNT=<AccountTree.ID to DEBIT (where the money lands)>
 *   FAWRY_REVENUE_GL_ACCOUNT=<AccountTree.ID to CREDIT>
 *   FAWRY_CASH_ID=<Cashes.ID stamped on the journal header>
 *   FAWRY_BRANCH_ID=10        (defaults to the web branch used by erp-sync)
 *   FAWRY_USER_ID=1           (ERP user the entry is attributed to)
 *
 * Unconfigured, payments are still fully recorded in tb_FawryPayments and the
 * booking is still created — only the journal entry is skipped, with a warning.
 */

const JSOURCE_RESERVATION = 29

export interface JournalConfig {
  enabled: boolean
  cashAccount?: number
  revenueAccount?: number
  cashId: number
  branchId: number
  userId: number
}

function intFromEnv(name: string): number | undefined {
  const raw = process.env[name]
  if (!raw) return undefined
  const n = parseInt(raw, 10)
  return isNaN(n) ? undefined : n
}

export function getJournalConfig(): JournalConfig {
  return {
    enabled: process.env.FAWRY_JOURNAL_ENABLED === "true",
    cashAccount: intFromEnv("FAWRY_CASH_GL_ACCOUNT"),
    revenueAccount: intFromEnv("FAWRY_REVENUE_GL_ACCOUNT"),
    cashId: intFromEnv("FAWRY_CASH_ID") ?? 0,
    branchId: intFromEnv("FAWRY_BRANCH_ID") ?? 10,
    userId: intFromEnv("FAWRY_USER_ID") ?? 1,
  }
}

export type PostJournalResult =
  | { posted: true; journalId: number }
  | { posted: false; reason: string }

/**
 * Post the deposit entry for a paid Fawry order.
 *
 * Idempotent on (JSourceID, RecID): a journal already linked to this booking is
 * not posted twice, so a replayed callback or a reconciliation pass cannot
 * double-credit the ledger.
 */
export async function postFawryPaymentJournal(input: {
  invoiceCode: string
  bookingId: number | null
  amount: number
  orderRef: string
}): Promise<PostJournalResult> {
  const config = getJournalConfig()

  if (!config.enabled) {
    return { posted: false, reason: "FAWRY_JOURNAL_ENABLED is not true" }
  }
  if (config.cashAccount === undefined || config.revenueAccount === undefined) {
    return {
      posted: false,
      reason: "FAWRY_CASH_GL_ACCOUNT / FAWRY_REVENUE_GL_ACCOUNT are not configured",
    }
  }
  if (!(input.amount > 0)) {
    return { posted: false, reason: "amount is not positive" }
  }
  if (!input.bookingId) {
    // RecID links the journal to its booking and is what makes the entry
    // traceable (and our duplicate check possible). Without it, don't post.
    return { posted: false, reason: "no booking id to attach the entry to" }
  }

  const pool = await getMssqlPool()
  const now = new Date()

  const txn = new sql.Transaction(pool)
  await txn.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)

  try {
    // Idempotency: has an entry for this booking already been posted?
    const existing = await new sql.Request(txn)
      .input("RecID", sql.Int, input.bookingId)
      .input("JSourceID", sql.Int, JSOURCE_RESERVATION)
      .query(`
        SELECT TOP 1 ID FROM tb_Journal
        WHERE RecID = @RecID AND JSourceID = @JSourceID AND Deleted = 0
      `)

    if (existing.recordset.length > 0) {
      await txn.commit()
      return { posted: false, reason: `journal already exists (ID ${existing.recordset[0].ID})` }
    }

    const journalInsert = await new sql.Request(txn)
      .input("JDate", sql.DateTime, now)
      .input("JBookNo", sql.Int, 0)
      .input("JTotalDeptor", sql.Decimal(18, 2), input.amount)
      .input("JTotalCredator", sql.Decimal(18, 2), input.amount)
      .input("JSourceID", sql.Int, JSOURCE_RESERVATION)
      .input("CarryOvered", sql.Bit, 0)
      .input("Notes", sql.NVarChar, `اذن حجز رقم ${input.invoiceCode} - دفع اونلاين فوري`)
      .input("RecID", sql.Int, input.bookingId)
      .input("Deleted", sql.Bit, 0)
      .input("BranchID", sql.Int, config.branchId)
      .input("CashID", sql.Int, config.cashId)
      .input("User_ID", sql.Int, config.userId)
      .input("EnableCarryOver", sql.Int, 0)
      .input("LastUpdate", sql.DateTime, now)
      .input("Transfer", sql.Bit, 0)
      .input("PRD", sql.Int, 0)
      .input("No", sql.Int, 0)
      .input("JType", sql.Int, 1)
      .input("PRG", sql.Int, 0)
      .input("PrevPRD", sql.Int, 0)
      .input("AddedDate", sql.DateTime, now)
      .query(`
        DECLARE @journalOut TABLE (ID INT);
        INSERT INTO tb_Journal (
          JDate, JBookNo, JTotalDeptor, JTotalCredator, JSourceID,
          CarryOvered, Notes, RecID, Deleted, BranchID, CashID, User_ID,
          EnableCarryOver, LastUpdate, Transfer, PRD, No, JType, PRG,
          PrevPRD, AddedDate
        )
        OUTPUT INSERTED.ID INTO @journalOut
        VALUES (
          @JDate, @JBookNo, @JTotalDeptor, @JTotalCredator, @JSourceID,
          @CarryOvered, @Notes, @RecID, @Deleted, @BranchID, @CashID, @User_ID,
          @EnableCarryOver, @LastUpdate, @Transfer, @PRD, @No, @JType, @PRG,
          @PrevPRD, @AddedDate
        );
        SELECT ID FROM @journalOut;
      `)

    const journalId = journalInsert.recordset?.[0]?.ID as number
    if (!journalId) {
      await txn.rollback()
      return { posted: false, reason: "journal header insert returned no id" }
    }

    // Two balanced lines: debit the cash/collection account the Fawry money
    // lands in, credit the revenue account.
    const description = `عربون اذن حجز رقم ${input.invoiceCode} - فوري`
    await new sql.Request(txn)
      .input("J_ID", sql.Int, journalId)
      .input("Amount", sql.Decimal(18, 2), input.amount)
      .input("AccountCash", sql.Int, config.cashAccount)
      .input("AccountRevenue", sql.Int, config.revenueAccount)
      .input("Description", sql.NVarChar, description)
      .input("JCDate", sql.DateTime, now)
      .input("User_ID", sql.Int, config.userId)
      .query(`
        INSERT INTO tb_JournalDet
          (J_ID, Deptor, Creditor, AccountID, Description, CostCenterID, CurrencyID, ExRate, isbill, JCDate, User_ID)
        VALUES
          (@J_ID, @Amount, 0, @AccountCash, @Description, 0, 1, 1, 0, @JCDate, @User_ID),
          (@J_ID, 0, @Amount, @AccountRevenue, @Description, 0, 1, 1, 0, @JCDate, @User_ID)
      `)

    await txn.commit()
    console.log(
      `[Fawry/Journal] Posted journal ${journalId} for ${input.orderRef} ` +
      `(${input.amount} EGP, debit ${config.cashAccount} / credit ${config.revenueAccount})`,
    )
    return { posted: true, journalId }
  } catch (error: any) {
    try { await txn.rollback() } catch { /* already rolled back */ }
    console.error(`[Fawry/Journal] Failed to post journal for ${input.orderRef}:`, error?.message || error)
    return { posted: false, reason: error?.message || "journal insert failed" }
  }
}

/**
 * Booking.ID for an order's invoice code, needed as the journal's RecID.
 * Each dress in a multi-dress order has its own invoice_code (this prefix +
 * "-" + dressId — see erp-sync.ts's invoiceCodeForItem), so match by prefix;
 * an exact match would find nothing once an order has more than one dress.
 * Picks the most recently created booking as the representative one to
 * attach the (order-level) payment journal entry to.
 */
export async function findBookingIdByInvoice(invoiceCode: string): Promise<number | null> {
  const pool = await getMssqlPool()
  const result = await pool
    .request()
    .input("invoice_code_prefix", sql.NVarChar, `${invoiceCode}%`)
    .query(`SELECT TOP 1 ID FROM Booking WHERE invoice_code LIKE @invoice_code_prefix ORDER BY ID DESC`)
  return result.recordset.length ? (result.recordset[0].ID as number) : null
}
