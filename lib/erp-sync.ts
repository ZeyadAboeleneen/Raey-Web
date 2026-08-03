import { prisma } from "@/lib/prisma"
import { getMssqlPool, sql } from "@/lib/mssql"
import { calculateRentalPrice } from "@/lib/rental-pricing"
import { getImageUploadService } from "@/lib/image-upload-service"
import type { ErpEmployee } from "@/lib/erp-users"
import { mapBranchSlugToBranchId } from "@/lib/branch-map"

/** Main branch (Co-Branches ID 1) — used when an item's branch slug can't be mapped. */
const ERP_FALLBACK_BRANCH_ID = 1

// GL accounts used by the ERP when it records a reservation deposit
// ("عربون اذن حجز"): debit the cash drawer's GL account, credit the
// deposit-liability account. Mirrors the entries the ERP itself creates
// (JSourceID = 29).
const ACCOUNT_DEPOSIT_LIABILITY = 173
const JSOURCE_RESERVATION = 29

// CashID → cash drawer debit GL account (from the ERP AccountTree). The debit
// (cash) account differs per cash drawer, so it cannot be hardcoded to a single
// value. A deposit for a CashID not listed here is rejected rather than posted
// to the wrong account.
const CASH_GL_ACCOUNTS: Record<number, number> = {
  1: 305,  // Main
  3: 305,  // خزينة المشاية
  5: 307,  // خزينة تسليمات
  6: 308,  // خزينة الرحاب
  10: 390, // خزينة حى الجامعة
  11: 569, // CRO
  12: 584, // WEB
}

/**
 * Synchronizes an order to the MSSQL ERP Booking database.
 * Gated by transaction checks and duplicate booking checks.
 */
export async function syncOrderToErp(
  orderId: string,
  paymentScreenshot?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) {
      return { success: false, error: "Order not found" }
    }

    const invoiceCode = `WEB-${orderId.substring(orderId.length - 6)}`.substring(0, 50)
    const pool = await getMssqlPool()

    // 1. Check if already synced to avoid duplicates and double-booking logs
    const existingCheck = await pool.request()
      .input("invoice_code", sql.NVarChar, invoiceCode)
      .query("SELECT COUNT(*) AS cnt FROM Booking WHERE invoice_code = @invoice_code")

    if (existingCheck.recordset[0].cnt > 0) {
      console.log(`[ERP/Sync] Order ${orderId} already synced to ERP. Skipping duplicate.`)
      return { success: true, message: "Already synced" }
    }

    // 2. Upload payment screenshot to local storage if it is still a raw base64 data URL
    let finalScreenshot = paymentScreenshot || order.paymentScreenshot
    const isBase64Screenshot = finalScreenshot && finalScreenshot.startsWith("data:image/")

    if (isBase64Screenshot && finalScreenshot) {
      try {
        console.log("📸 [ERP/Sync] Uploading payment screenshot to local storage...")
        const result = await getImageUploadService().uploadFromDataUrl(finalScreenshot, "payments")
        console.log("✅ [ERP/Sync] Payment screenshot saved:", result.url)

        await prisma.order.update({
          where: { id: order.id },
          data: { paymentScreenshot: result.url },
        })
        finalScreenshot = result.url
      } catch (uploadError) {
        console.error("❌ [ERP/Sync] Failed to save payment screenshot:", uploadError)
      }
    }

    // 3. Sync ERP
    const items = order.items as any[]
    const shippingAddress = order.shippingAddress as any
    
    if (!items || !items.length) {
      return { success: true, message: "No items to sync" }
    }

    // Track the ERP Booking row IDs we create so the order can be reliably deleted
    // later by ID — the ERP may reassign invoice_code on insert, so it can't be
    // trusted as the delete key.
    const createdBookingIds: number[] = []

    for (const item of items) {
      if (item.type === "rent" && item.rentStart && item.rentEnd) {
        // BranchID must be a real Co-Branches row — the Booking table has an FK
        // (FK_Booking_Co-Branches) on it. Valid ids are 1, 3, 5, 7, 8, 9; there
        // is no branch 10, so the previous hardcoded value made every customer
        // booking insert fail. Derive it from the item's branch instead, and
        // fall back to the main branch when the slug can't be mapped.
        const branchId = mapBranchSlugToBranchId(item.branch) ?? ERP_FALLBACK_BRANCH_ID
        const modelTypeId = parseInt(item.productId, 10)

        if (isNaN(modelTypeId)) continue

        const rentStartDate = new Date(item.rentStart)
        const rentEndDate = new Date(item.rentEnd)

        if (isNaN(rentStartDate.getTime()) || isNaN(rentEndDate.getTime())) continue
        if (rentEndDate <= rentStartDate) continue

        const txn = new sql.Transaction(pool)
        await txn.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)

        try {
          let finalPrice: number
          if (item.price && item.price > 0) {
            finalPrice = item.price
          } else {
            const pricingResult = await calculateRentalPrice(
              {
                productId: item.productId,
                rentStart: rentStartDate,
                rentEnd: rentEndDate,
                isExclusive: Boolean(item.isExclusive),
              },
              txn,
            )
            const serverPrice = pricingResult.total
            const extraDaysFee = ((item.extraDayBefore ? 1 : 0) + (item.extraDayAfter ? 1 : 0)) * 200
            finalPrice = serverPrice + extraDaysFee
          }

          const overlapCheck = await new sql.Request(txn)
            .input('ModelTypeID', sql.Int, modelTypeId)
            .input('requestedStart', sql.DateTime, rentStartDate)
            .input('requestedEnd', sql.DateTime, rentEndDate)
            .query(`
              SELECT COUNT(*) AS cnt
              FROM Booking
              WHERE ModelTypeID = @ModelTypeID
                AND @requestedStart < ReturnDate
                AND @requestedEnd >= ReceivedDate
            `)

          if (overlapCheck.recordset[0].cnt > 0) {
            await txn.rollback()
            console.error(`[ERP/Sync] Double-booking detected for item ${item.productId}`)
            return { success: false, error: `Double-booking detected for item ${item.productId}` }
          }

          const exclusivePrefix = item.isExclusive ? '[EXCLUSIVE] ' : ''
          const extraDayLabels = []
          if (item.extraDayBefore) extraDayLabels.push('+1 day before')
          if (item.extraDayAfter) extraDayLabels.push('+1 day after')
          const extraDaySuffix = extraDayLabels.length > 0 ? ` [${extraDayLabels.join(', ')}]` : ''
          const noteItem = `${exclusivePrefix}Web Order: ${item.size} - Qty: ${item.quantity}${extraDaySuffix}`

          // Prefer the deposit explicitly entered by staff (employee/admin) on the
          // cart item. Only fall back to the default per-collection deposit for
          // normal customer orders, which don't carry an entered deposit.
          const enteredDeposit = Number(item.employeeDeposit)
          let itemDeposit: number
          if (!isNaN(enteredDeposit) && enteredDeposit > 0) {
            itemDeposit = enteredDeposit
          } else {
            itemDeposit = 1000 // Default to Soiree
            if (item.isExclusive) {
              itemDeposit = Math.round(finalPrice * 0.5)
            } else {
              const col = (item.collection || "").toLowerCase()
              if (col === "wedding") {
                itemDeposit = 5000
              }
            }
          }

          itemDeposit = Math.min(itemDeposit, finalPrice)
          const itemRemaining = Math.max(0, finalPrice - itemDeposit)

          const bookingInsert = await new sql.Request(txn)
            .input('invoice_code', sql.NVarChar, invoiceCode)
            .input('Cust_Name', sql.NVarChar, (shippingAddress?.name || '').substring(0, 50))
            .input('Cust_Tel', sql.NVarChar, (shippingAddress?.secondaryPhone || '').substring(0, 50))
            .input('Cust_Mobile', sql.NVarChar, (shippingAddress?.phone || '').substring(0, 50))
            .input('Cust_Address', sql.NVarChar, (shippingAddress?.address || '').substring(0, 50))
            .input('DeviceTypeID', sql.Int, 0)
            .input('ModelTypeID', sql.Int, modelTypeId)
            .input('Scarves', sql.Bit, 0)
            .input('CashMayo', sql.Bit, 0)
            .input('Other', sql.Bit, 0)
            .input('OtheNote', sql.NVarChar, '')
            .input('BookingDate', sql.DateTime, new Date())
            .input('ReceivedDate', sql.DateTime, rentStartDate)
            .input('ReturnDate', sql.DateTime, rentEndDate)
            .input('Emp_ID', sql.Int, 1)
            .input('CurrencyID', sql.Int, 1)
            .input('ExRate', sql.Decimal(18, 2), 1.0)
            .input('Total', sql.Decimal(18, 2), finalPrice)
            .input('Deposit', sql.Decimal(18, 2), itemDeposit)
            .input('Remaining', sql.Decimal(18, 2), itemRemaining)
            .input('NoteItem', sql.NVarChar, noteItem.substring(0, 200))
            .input('BreastSize', sql.NVarChar, item.customMeasurements?.values?.breast ? String(item.customMeasurements.values.breast).substring(0, 20) : '')
            .input('WaistSize', sql.NVarChar, item.customMeasurements?.values?.waist ? String(item.customMeasurements.values.waist).substring(0, 20) : '')
            .input('ButtocksSize', sql.NVarChar, item.customMeasurements?.values?.hips ? String(item.customMeasurements.values.hips).substring(0, 20) : '')
            .input('SleeveSize', sql.NVarChar, item.customMeasurements?.values?.sleeve ? String(item.customMeasurements.values.sleeve).substring(0, 20) : '')
            .input('ApprovedID', sql.Int, 1)
            .input('Desc_Customer', sql.NVarChar, '')
            .input('BranchID', sql.Int, branchId)
            .input('UserID', sql.Int, 1)
            .input('CariedOver', sql.Bit, 0)
            .input('LastUpdate', sql.DateTime, new Date())
            .input('Transfer', sql.Bit, 0)
            .input('Paid', sql.Decimal(18, 2), 0)
            .input('PersonalityinvestigationId', sql.Int, 0)
            .input('GuaranteeAmount', sql.Decimal(18, 2), 0)
            .input('GuaranteeNote', sql.NVarChar, '')
            .input('ReturnNote', sql.NVarChar, '')
            .input('AdditionalCost', sql.Decimal(18, 2), 0)
            .input('First', sql.Bit, 1)
            .input('OccasionDate', sql.DateTime, new Date(rentStartDate.getTime() + 24 * 60 * 60 * 1000))
            .query(`
              DECLARE @bookingOut TABLE (ID INT);
              INSERT INTO Booking (
                invoice_code, Cust_Name, Cust_Tel, Cust_Mobile, Cust_Address,
                DeviceTypeID, ModelTypeID, Scarves, CashMayo, Other, OtheNote,
                BookingDate, ReceivedDate, ReturnDate, Emp_ID, CurrencyID,
                ExRate, Total, Deposit, Remaining, NoteItem,
                BreastSize, WaistSize, ButtocksSize, SleeveSize,
                ApprovedID, Desc_Customer, BranchID, UserID, CariedOver,
                LastUpdate, Transfer, Paid, PersonalityinvestigationId,
                GuaranteeAmount, GuaranteeNote, ReturnNote, AdditionalCost,
                First, OccasionDate
              )
              OUTPUT INSERTED.ID INTO @bookingOut
              VALUES (
                @invoice_code, @Cust_Name, @Cust_Tel, @Cust_Mobile, @Cust_Address,
                @DeviceTypeID, @ModelTypeID, @Scarves, @CashMayo, @Other, @OtheNote,
                @BookingDate, @ReceivedDate, @ReturnDate, @Emp_ID, @CurrencyID,
                @ExRate, @Total, @Deposit, @Remaining, @NoteItem,
                @BreastSize, @WaistSize, @ButtocksSize, @SleeveSize,
                @ApprovedID, @Desc_Customer, @BranchID, @UserID, @CariedOver,
                @LastUpdate, @Transfer, @Paid, @PersonalityinvestigationId,
                @GuaranteeAmount, @GuaranteeNote, @ReturnNote, @AdditionalCost,
                @First, @OccasionDate
              );
              SELECT ID FROM @bookingOut;
            `)

          const newBookingId = bookingInsert.recordset?.[0]?.ID as number | undefined
          if (newBookingId) createdBookingIds.push(newBookingId)

          await txn.commit()
          console.log(`✅ [ERP/Sync] Item ${item.productId}: Price = ${finalPrice} EGP (Booking ID ${newBookingId ?? "?"})`)
        } catch (txnError: any) {
          try { await txn.rollback() } catch { /* already rolled back */ }
          console.error(`Failed to process rental booking for item ${item.productId}:`, txnError)
          return { success: false, error: txnError.message }
        }
      }
    }

    // Persist the created Booking IDs on the order so deletion can target them
    // directly, regardless of how the ERP rewrote invoice_code.
    if (createdBookingIds.length > 0) {
      try {
        const latest = await prisma.order.findUnique({ where: { id: order.id } })
        const pd = (latest?.paymentDetails as any) || {}
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentDetails: { ...pd, erpBookingIds: createdBookingIds } },
        })
      } catch (persistErr) {
        console.error(`[ERP/Sync] Failed to persist erpBookingIds for ${orderId}:`, persistErr)
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error("[ERP/Sync] General error:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Synchronizes an EMPLOYEE-placed order to the ERP.
 *
 * Unlike the customer flow, this:
 *  - stamps the booking with the logged-in employee's UserID / BranchID / CashID
 *    and RepID (Emp_ID),
 *  - uses the employee-entered dress price (Total) and deposit (per item),
 *  - records the deposit in the accounting journal (tb_Journal + tb_JournalDet)
 *    against the employee's CashID — exactly the "اذن حجز" entry the ERP makes.
 *
 * Each editable amount lives on the cart item: `item.price` (dress price) and
 * `item.employeeDeposit` (deposit). Remaining = price − deposit.
 */
export async function syncEmployeeOrderToErp(
  orderId: string,
  employee: Pick<ErpEmployee, "id" | "repId" | "branchId" | "cashId">
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) return { success: false, error: "Order not found" }

    const invoiceCode = `WEB-${orderId.substring(orderId.length - 6)}`.substring(0, 50)
    const pool = await getMssqlPool()

    // Skip if already synced (idempotent)
    const existingCheck = await pool.request()
      .input("invoice_code", sql.NVarChar, invoiceCode)
      .query("SELECT COUNT(*) AS cnt FROM Booking WHERE invoice_code = @invoice_code")
    if (existingCheck.recordset[0].cnt > 0) {
      return { success: true, message: "Already synced" }
    }

    const items = (order.items as any[]) || []
    const shippingAddress = (order.shippingAddress as any) || {}
    if (!items.length) return { success: true, message: "No items to sync" }

    // MSSQL Users.ID — must be numeric, not Prisma's internal ID
    const userId = Number(employee.id)
    const branchId = employee.branchId ?? 0
    const cashId = employee.cashId ?? 0
    const empId = employee.repId ?? 0

    // Resolve the cash drawer's GL account. If unmapped, Booking rows are still
    // created but the deposit journal entry is skipped (logged as a warning).
    const cashAccount = CASH_GL_ACCOUNTS[cashId]
    if (cashAccount === undefined) {
      console.warn(`[ERP/EmpSync] CashID ${cashId} not in CASH_GL_ACCOUNTS — bookings will be created but deposit journal entries skipped.`)
    }

    // Use order-level totals as the authoritative source for price and deposit.
    // Per-item fields (item.price, item.employeeDeposit) can be stale if the
    // employee edited the values and the React state didn't flush before submit.
    const rentalItems = items.filter(
      (it: any) => it.type === "rent" && it.rentStart && it.rentEnd
    )
    const orderTotal = Number(order.total) || 0
    const orderDeposit = Number(order.depositAmount) || 0
    const orderRemainingRaw = Number(order.remainingAmount)
    const orderRemaining = isNaN(orderRemainingRaw) ? Math.max(0, orderTotal - orderDeposit) : orderRemainingRaw

    console.log(`[ERP/EmpSync] order=${orderId} total=${orderTotal} deposit=${orderDeposit} remaining=${orderRemaining} rentalItems=${rentalItems.length}`)

    // Track created Booking IDs so the order can be deleted reliably by ID later.
    const createdBookingIds: number[] = []

    for (const item of items) {
      // Only rental items map to Booking rows (same rule as the customer sync).
      if (!(item.type === "rent" && item.rentStart && item.rentEnd)) continue

      const modelTypeId = parseInt(item.productId, 10)
      if (isNaN(modelTypeId)) continue

      const rentStartDate = new Date(item.rentStart)
      const rentEndDate = new Date(item.rentEnd)
      if (isNaN(rentStartDate.getTime()) || isNaN(rentEndDate.getTime())) continue
      if (rentEndDate <= rentStartDate) continue

      const quantity = item.quantity || 1

      // For single-rental orders use the order-level values directly (most accurate).
      // For multi-rental orders split proportionally by item price ratio.
      let finalPrice: number
      let deposit: number
      let remaining: number

      if (rentalItems.length === 1) {
        finalPrice = orderTotal
        deposit = orderDeposit
        remaining = orderRemaining
      } else {
        const itemTotal = (Number(item.price) || 0) * quantity
        const ratio = orderTotal > 0 ? itemTotal / orderTotal : 1 / rentalItems.length
        finalPrice = itemTotal
        deposit = Math.round(orderDeposit * ratio)
        remaining = Math.max(0, finalPrice - deposit)
      }

      console.log(`[ERP/EmpSync] item=${item.productId} finalPrice=${finalPrice} deposit=${deposit} remaining=${remaining} userId=${userId} branchId=${branchId} cashId=${cashId}`)

      const txn = new sql.Transaction(pool)
      await txn.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
      try {
        // Guard against double-booking the same dress over the same dates.
        const overlapCheck = await new sql.Request(txn)
          .input("ModelTypeID", sql.Int, modelTypeId)
          .input("requestedStart", sql.DateTime, rentStartDate)
          .input("requestedEnd", sql.DateTime, rentEndDate)
          .query(`
            SELECT COUNT(*) AS cnt FROM Booking
            WHERE ModelTypeID = @ModelTypeID
              AND @requestedStart < ReturnDate
              AND @requestedEnd >= ReceivedDate
          `)
        if (overlapCheck.recordset[0].cnt > 0) {
          await txn.rollback()
          return { success: false, error: `Double-booking detected for item ${item.productId}` }
        }

        const noteItem = `Web Employee Order: ${item.size || ""} - Qty: ${quantity}`.substring(0, 200)
        const now = new Date()

        // 1. Insert the Booking row, capturing its new identity ID.
        const bookingInsert = await new sql.Request(txn)
          .input("invoice_code", sql.NVarChar, invoiceCode)
          .input("Cust_Name", sql.NVarChar, (shippingAddress?.name || "").substring(0, 50))
          .input("Cust_Tel", sql.NVarChar, (shippingAddress?.secondaryPhone || "").substring(0, 50))
          .input("Cust_Mobile", sql.NVarChar, (shippingAddress?.phone || "").substring(0, 50))
          .input("Cust_Address", sql.NVarChar, (shippingAddress?.address || "").substring(0, 50))
          .input("DeviceTypeID", sql.Int, 0)
          .input("ModelTypeID", sql.Int, modelTypeId)
          .input("Scarves", sql.Bit, 0)
          .input("CashMayo", sql.Bit, 0)
          .input("Other", sql.Bit, 0)
          .input("OtheNote", sql.NVarChar, "")
          .input("BookingDate", sql.DateTime, now)
          .input("ReceivedDate", sql.DateTime, rentStartDate)
          .input("ReturnDate", sql.DateTime, rentEndDate)
          .input("Emp_ID", sql.Int, empId)
          .input("CurrencyID", sql.Int, 1)
          .input("ExRate", sql.Decimal(18, 2), 1.0)
          .input("Total", sql.Decimal(18, 2), finalPrice)
          .input("Deposit", sql.Decimal(18, 2), deposit)
          .input("Remaining", sql.Decimal(18, 2), remaining)
          .input("NoteItem", sql.NVarChar, noteItem)
          .input("BreastSize", sql.NVarChar, "")
          .input("WaistSize", sql.NVarChar, "")
          .input("ButtocksSize", sql.NVarChar, "")
          .input("SleeveSize", sql.NVarChar, "")
          .input("ApprovedID", sql.Int, 1)
          .input("Desc_Customer", sql.NVarChar, "")
          .input("BranchID", sql.Int, branchId)
          .input("UserID", sql.Int, userId)
          .input("CashID", sql.Int, cashId)
          .input("CariedOver", sql.Bit, 0)
          .input("LastUpdate", sql.DateTime, now)
          .input("Transfer", sql.Bit, 0)
          .input("Paid", sql.Decimal(18, 2), 0)
          .input("PersonalityinvestigationId", sql.Int, 0)
          .input("GuaranteeAmount", sql.Decimal(18, 2), 0)
          .input("GuaranteeNote", sql.NVarChar, "")
          .input("ReturnNote", sql.NVarChar, "")
          .input("AdditionalCost", sql.Decimal(18, 2), 0)
          .input("First", sql.Bit, 1)
          .input("OccasionDate", sql.DateTime, new Date(rentStartDate.getTime() + 24 * 60 * 60 * 1000))
          .query(`
            DECLARE @bookingOut TABLE (ID INT);
            INSERT INTO Booking (
              invoice_code, Cust_Name, Cust_Tel, Cust_Mobile, Cust_Address,
              DeviceTypeID, ModelTypeID, Scarves, CashMayo, Other, OtheNote,
              BookingDate, ReceivedDate, ReturnDate, Emp_ID, CurrencyID,
              ExRate, Total, Deposit, Remaining, NoteItem,
              BreastSize, WaistSize, ButtocksSize, SleeveSize,
              ApprovedID, Desc_Customer, BranchID, UserID, CashID, CariedOver,
              LastUpdate, Transfer, Paid, PersonalityinvestigationId,
              GuaranteeAmount, GuaranteeNote, ReturnNote, AdditionalCost,
              First, OccasionDate
            )
            OUTPUT INSERTED.ID INTO @bookingOut
            VALUES (
              @invoice_code, @Cust_Name, @Cust_Tel, @Cust_Mobile, @Cust_Address,
              @DeviceTypeID, @ModelTypeID, @Scarves, @CashMayo, @Other, @OtheNote,
              @BookingDate, @ReceivedDate, @ReturnDate, @Emp_ID, @CurrencyID,
              @ExRate, @Total, @Deposit, @Remaining, @NoteItem,
              @BreastSize, @WaistSize, @ButtocksSize, @SleeveSize,
              @ApprovedID, @Desc_Customer, @BranchID, @UserID, @CashID, @CariedOver,
              @LastUpdate, @Transfer, @Paid, @PersonalityinvestigationId,
              @GuaranteeAmount, @GuaranteeNote, @ReturnNote, @AdditionalCost,
              @First, @OccasionDate
            );
            SELECT ID FROM @bookingOut;
          `)

        const bookingId = bookingInsert.recordset?.[0]?.ID as number
        if (bookingId) createdBookingIds.push(bookingId)

        // 2. Record the deposit in the accounting journal (against the
        //    employee's CashID) — mirrors the ERP's "اذن حجز" entry.
        //    Skipped when cashAccount is not configured — booking is still created.
        if (deposit > 0 && bookingId && cashAccount !== undefined) {
          const journalInsert = await new sql.Request(txn)
            .input("JDate", sql.DateTime, now)
            .input("JBookNo", sql.Int, 0)
            .input("JTotalDeptor", sql.Decimal(18, 2), deposit)
            .input("JTotalCredator", sql.Decimal(18, 2), deposit)
            .input("JSourceID", sql.Int, JSOURCE_RESERVATION)
            .input("CarryOvered", sql.Bit, 0)
            .input("Notes", sql.NVarChar, `اذن حجز رقم ${invoiceCode}`)
            .input("RecID", sql.Int, bookingId)
            .input("Deleted", sql.Bit, 0)
            .input("BranchID", sql.Int, branchId)
            .input("CashID", sql.Int, cashId)
            .input("User_ID", sql.Int, userId)
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

          if (journalId) {
            // Debit cash, credit deposit-liability (two balanced lines).
            await new sql.Request(txn)
              .input("J_ID", sql.Int, journalId)
              .input("Deptor", sql.Decimal(18, 2), deposit)
              .input("AccountCash", sql.Int, cashAccount)
              .input("AccountDep", sql.Int, ACCOUNT_DEPOSIT_LIABILITY)
              .input("DescCash", sql.NVarChar, `عربون اذن حجز رقم ${invoiceCode}`)
              .input("DescDep", sql.NVarChar, `عربون اذن حجز رقم ${invoiceCode}`)
              .input("JCDate", sql.DateTime, now)
              .input("User_ID", sql.Int, userId)
              .query(`
                INSERT INTO tb_JournalDet
                  (J_ID, Deptor, Creditor, AccountID, Description, CostCenterID, CurrencyID, ExRate, isbill, JCDate, User_ID)
                VALUES
                  (@J_ID, @Deptor, 0, @AccountCash, @DescCash, 0, 1, 1, 0, @JCDate, @User_ID),
                  (@J_ID, 0, @Deptor, @AccountDep, @DescDep, 0, 1, 1, 0, @JCDate, @User_ID)
              `)
          }
        }

        await txn.commit()
        console.log(`✅ [ERP/EmpSync] Booking ${bookingId} (item ${item.productId}): Total=${finalPrice} Deposit=${deposit} CashID=${cashId}`)
      } catch (txnError: any) {
        try { await txn.rollback() } catch { /* already rolled back */ }
        console.error(`[ERP/EmpSync] Failed booking for item ${item.productId}:`, txnError)
        return { success: false, error: txnError.message }
      }
    }

    // Persist created Booking IDs so deletion can target them directly.
    if (createdBookingIds.length > 0) {
      try {
        const latest = await prisma.order.findUnique({ where: { id: order.id } })
        const pd = (latest?.paymentDetails as any) || {}
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentDetails: { ...pd, erpBookingIds: createdBookingIds } },
        })
      } catch (persistErr) {
        console.error(`[ERP/EmpSync] Failed to persist erpBookingIds for ${orderId}:`, persistErr)
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error("[ERP/EmpSync] General error:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Posts the remaining balance to the ERP when a dress is returned and the
 * remaining payment is collected. Creates a new journal entry (same pattern
 * as the deposit journal) with the remaining amount.
 *
 * Should be called when order status changes to "returned".
 */
export async function syncRemainingPaymentToErp(
  orderId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) return { success: false, error: "Order not found" }

    const remaining = Number(order.remainingAmount) || 0
    if (remaining <= 0) return { success: true, message: "No remaining balance to post" }

    // Only employee orders have CashID info stored in paymentDetails
    const paymentDetails = (order.paymentDetails as any) || {}
    const placedBy = paymentDetails.placedByEmployee
    if (!placedBy?.cashId) {
      return { success: false, error: "No employee CashID found on order — cannot post remaining journal" }
    }

    const cashId = Number(placedBy.cashId)
    const userId = Number(placedBy.id) || 0
    const branchId = Number(placedBy.branchId) || 0
    const cashAccount = CASH_GL_ACCOUNTS[cashId]

    if (cashAccount === undefined) {
      return { success: false, error: `CashID ${cashId} not mapped in CASH_GL_ACCOUNTS` }
    }

    const invoiceCode = `WEB-${orderId.substring(orderId.length - 6)}`.substring(0, 50)
    const pool = await getMssqlPool()

    // Look up the Booking row created at order time
    const bookingRow = await pool.request()
      .input("invoice_code", sql.NVarChar, invoiceCode)
      .query("SELECT TOP 1 ID FROM Booking WHERE invoice_code = @invoice_code")
    const bookingId = bookingRow.recordset?.[0]?.ID as number | undefined

    // Check if remaining journal already posted (avoid duplicates)
    const dupCheck = await pool.request()
      .input("invoice_code", sql.NVarChar, invoiceCode)
      .input("amount", sql.Decimal(18, 2), remaining)
      .query(`
        SELECT COUNT(*) AS cnt FROM tb_Journal
        WHERE Notes = N'باقي سداد ' + @invoice_code
          AND JTotalDeptor = @amount
      `)
    if (dupCheck.recordset[0].cnt > 0) {
      return { success: true, message: "Remaining journal already posted" }
    }

    const now = new Date()
    const txn = new sql.Transaction(pool)
    await txn.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    try {
      const journalInsert = await new sql.Request(txn)
        .input("JDate", sql.DateTime, now)
        .input("JBookNo", sql.Int, 0)
        .input("JTotalDeptor", sql.Decimal(18, 2), remaining)
        .input("JTotalCredator", sql.Decimal(18, 2), remaining)
        .input("JSourceID", sql.Int, JSOURCE_RESERVATION)
        .input("CarryOvered", sql.Bit, 0)
        .input("Notes", sql.NVarChar, `باقي سداد ${invoiceCode}`)
        .input("RecID", sql.Int, bookingId ?? 0)
        .input("Deleted", sql.Bit, 0)
        .input("BranchID", sql.Int, branchId)
        .input("CashID", sql.Int, cashId)
        .input("User_ID", sql.Int, userId)
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
      if (journalId) {
        await new sql.Request(txn)
          .input("J_ID", sql.Int, journalId)
          .input("Amount", sql.Decimal(18, 2), remaining)
          .input("AccountCash", sql.Int, cashAccount)
          .input("AccountDep", sql.Int, ACCOUNT_DEPOSIT_LIABILITY)
          .input("Desc", sql.NVarChar, `باقي سداد ${invoiceCode}`)
          .input("JCDate", sql.DateTime, now)
          .input("User_ID", sql.Int, userId)
          .query(`
            INSERT INTO tb_JournalDet
              (J_ID, Deptor, Creditor, AccountID, Description, CostCenterID, CurrencyID, ExRate, isbill, JCDate, User_ID)
            VALUES
              (@J_ID, @Amount, 0, @AccountCash, @Desc, 0, 1, 1, 0, @JCDate, @User_ID),
              (@J_ID, 0, @Amount, @AccountDep, @Desc, 0, 1, 1, 0, @JCDate, @User_ID)
          `)

        // Also update Booking.Remaining = 0 and Paid = total to mark as fully settled
        await new sql.Request(txn)
          .input("invoice_code", sql.NVarChar, invoiceCode)
          .input("remaining", sql.Decimal(18, 2), remaining)
          .query(`
            UPDATE Booking
            SET Remaining = 0, Paid = Paid + @remaining, LastUpdate = GETDATE()
            WHERE invoice_code = @invoice_code
          `)
      }

      await txn.commit()
      console.log(`✅ [ERP/Remaining] Journal ${journalId} posted: remaining=${remaining} CashID=${cashId} invoice=${invoiceCode}`)
      return { success: true, message: `Remaining ${remaining} posted to journal ${journalId}` }
    } catch (txnError: any) {
      try { await txn.rollback() } catch { /* */ }
      console.error(`[ERP/Remaining] Failed:`, txnError)
      return { success: false, error: txnError.message }
    }
  } catch (error: any) {
    console.error("[ERP/Remaining] General error:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Reverses the deposit journal entry when an order is cancelled/deleted and
 * the deposit is being refunded to the customer. Posts the opposite entry
 * (debit deposit-liability, credit cash) so the deposit amount is removed
 * from the employee's cash drawer (خزنة) balance.
 *
 * If the deposit is NOT being refunded, call nothing — the money simply
 * stays recorded in the cash drawer as-is.
 */
export async function reverseDepositInErp(
  orderId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) return { success: false, error: "Order not found" }

    const deposit = Number(order.depositAmount) || 0
    if (deposit <= 0) return { success: true, message: "No deposit to reverse" }

    const paymentDetails = (order.paymentDetails as any) || {}
    const placedBy = paymentDetails.placedByEmployee
    if (!placedBy?.cashId) {
      return { success: true, message: "Order has no employee CashID — nothing was posted to a cash drawer" }
    }

    const cashId = Number(placedBy.cashId)
    const userId = Number(placedBy.id) || 0
    const branchId = Number(placedBy.branchId) || 0
    const cashAccount = CASH_GL_ACCOUNTS[cashId]
    if (cashAccount === undefined) {
      return { success: false, error: `CashID ${cashId} not mapped in CASH_GL_ACCOUNTS` }
    }

    const invoiceCode = `WEB-${orderId.substring(orderId.length - 6)}`.substring(0, 50)
    const pool = await getMssqlPool()

    // Avoid double-reversal
    const dupCheck = await pool.request()
      .input("notes", sql.NVarChar, `استرجاع عربون ${invoiceCode}`)
      .query("SELECT COUNT(*) AS cnt FROM tb_Journal WHERE Notes = @notes")
    if (dupCheck.recordset[0].cnt > 0) {
      return { success: true, message: "Deposit already reversed" }
    }

    const bookingRow = await pool.request()
      .input("invoice_code", sql.NVarChar, invoiceCode)
      .query("SELECT TOP 1 ID FROM Booking WHERE invoice_code = @invoice_code")
    const bookingId = bookingRow.recordset?.[0]?.ID as number | undefined

    const now = new Date()
    const txn = new sql.Transaction(pool)
    await txn.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    try {
      const journalInsert = await new sql.Request(txn)
        .input("JDate", sql.DateTime, now)
        .input("JBookNo", sql.Int, 0)
        .input("JTotalDeptor", sql.Decimal(18, 2), deposit)
        .input("JTotalCredator", sql.Decimal(18, 2), deposit)
        .input("JSourceID", sql.Int, JSOURCE_RESERVATION)
        .input("CarryOvered", sql.Bit, 0)
        .input("Notes", sql.NVarChar, `استرجاع عربون ${invoiceCode}`)
        .input("RecID", sql.Int, bookingId ?? 0)
        .input("Deleted", sql.Bit, 0)
        .input("BranchID", sql.Int, branchId)
        .input("CashID", sql.Int, cashId)
        .input("User_ID", sql.Int, userId)
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
      if (journalId) {
        // Opposite of the original deposit entry: debit liability, credit cash —
        // removes the deposit amount from the cash drawer balance.
        await new sql.Request(txn)
          .input("J_ID", sql.Int, journalId)
          .input("Amount", sql.Decimal(18, 2), deposit)
          .input("AccountCash", sql.Int, cashAccount)
          .input("AccountDep", sql.Int, ACCOUNT_DEPOSIT_LIABILITY)
          .input("Desc", sql.NVarChar, `استرجاع عربون ${invoiceCode}`)
          .input("JCDate", sql.DateTime, now)
          .input("User_ID", sql.Int, userId)
          .query(`
            INSERT INTO tb_JournalDet
              (J_ID, Deptor, Creditor, AccountID, Description, CostCenterID, CurrencyID, ExRate, isbill, JCDate, User_ID)
            VALUES
              (@J_ID, 0, @Amount, @AccountCash, @Desc, 0, 1, 1, 0, @JCDate, @User_ID),
              (@J_ID, @Amount, 0, @AccountDep, @Desc, 0, 1, 1, 0, @JCDate, @User_ID)
          `)
      }

      await txn.commit()
      console.log(`✅ [ERP/Refund] Deposit reversal posted: journal=${journalId} amount=${deposit} CashID=${cashId} invoice=${invoiceCode}`)
      return { success: true, message: `Deposit ${deposit} reversed (journal ${journalId})` }
    } catch (txnError: any) {
      try { await txn.rollback() } catch { /* */ }
      console.error(`[ERP/Refund] Failed:`, txnError)
      return { success: false, error: txnError.message }
    }
  } catch (error: any) {
    console.error("[ERP/Refund] General error:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Re-adds the deposit to the cash drawer after an order is un-cancelled
 * (e.g. moved from "cancelled" back to "pending"), reversing a prior
 * reverseDepositInErp() call. Posts the same entry direction as the
 * original deposit (debit cash, credit liability).
 */
export async function reAddDepositInErp(
  orderId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) return { success: false, error: "Order not found" }

    const deposit = Number(order.depositAmount) || 0
    if (deposit <= 0) return { success: true, message: "No deposit to re-add" }

    const paymentDetails = (order.paymentDetails as any) || {}
    const placedBy = paymentDetails.placedByEmployee
    if (!placedBy?.cashId) {
      return { success: true, message: "Order has no employee CashID — nothing to re-add" }
    }

    const cashId = Number(placedBy.cashId)
    const userId = Number(placedBy.id) || 0
    const branchId = Number(placedBy.branchId) || 0
    const cashAccount = CASH_GL_ACCOUNTS[cashId]
    if (cashAccount === undefined) {
      return { success: false, error: `CashID ${cashId} not mapped in CASH_GL_ACCOUNTS` }
    }

    const invoiceCode = `WEB-${orderId.substring(orderId.length - 6)}`.substring(0, 50)
    const pool = await getMssqlPool()

    const dupCheck = await pool.request()
      .input("notes", sql.NVarChar, `استرجاع عربون رفض ${invoiceCode}`)
      .query("SELECT COUNT(*) AS cnt FROM tb_Journal WHERE Notes = @notes")
    if (dupCheck.recordset[0].cnt > 0) {
      return { success: true, message: "Deposit already re-added" }
    }

    const bookingRow = await pool.request()
      .input("invoice_code", sql.NVarChar, invoiceCode)
      .query("SELECT TOP 1 ID FROM Booking WHERE invoice_code = @invoice_code")
    const bookingId = bookingRow.recordset?.[0]?.ID as number | undefined

    const now = new Date()
    const txn = new sql.Transaction(pool)
    await txn.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    try {
      const journalInsert = await new sql.Request(txn)
        .input("JDate", sql.DateTime, now)
        .input("JBookNo", sql.Int, 0)
        .input("JTotalDeptor", sql.Decimal(18, 2), deposit)
        .input("JTotalCredator", sql.Decimal(18, 2), deposit)
        .input("JSourceID", sql.Int, JSOURCE_RESERVATION)
        .input("CarryOvered", sql.Bit, 0)
        .input("Notes", sql.NVarChar, `استرجاع عربون رفض ${invoiceCode}`)
        .input("RecID", sql.Int, bookingId ?? 0)
        .input("Deleted", sql.Bit, 0)
        .input("BranchID", sql.Int, branchId)
        .input("CashID", sql.Int, cashId)
        .input("User_ID", sql.Int, userId)
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
      if (journalId) {
        // Same direction as the original deposit entry: debit cash, credit liability.
        await new sql.Request(txn)
          .input("J_ID", sql.Int, journalId)
          .input("Amount", sql.Decimal(18, 2), deposit)
          .input("AccountCash", sql.Int, cashAccount)
          .input("AccountDep", sql.Int, ACCOUNT_DEPOSIT_LIABILITY)
          .input("Desc", sql.NVarChar, `استرجاع عربون رفض ${invoiceCode}`)
          .input("JCDate", sql.DateTime, now)
          .input("User_ID", sql.Int, userId)
          .query(`
            INSERT INTO tb_JournalDet
              (J_ID, Deptor, Creditor, AccountID, Description, CostCenterID, CurrencyID, ExRate, isbill, JCDate, User_ID)
            VALUES
              (@J_ID, @Amount, 0, @AccountCash, @Desc, 0, 1, 1, 0, @JCDate, @User_ID),
              (@J_ID, 0, @Amount, @AccountDep, @Desc, 0, 1, 1, 0, @JCDate, @User_ID)
          `)
      }

      await txn.commit()
      console.log(`✅ [ERP/Refund] Deposit re-added: journal=${journalId} amount=${deposit} CashID=${cashId} invoice=${invoiceCode}`)
      return { success: true, message: `Deposit ${deposit} re-added (journal ${journalId})` }
    } catch (txnError: any) {
      try { await txn.rollback() } catch { /* */ }
      console.error(`[ERP/Refund] Failed to re-add:`, txnError)
      return { success: false, error: txnError.message }
    }
  } catch (error: any) {
    console.error("[ERP/Refund] General error:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Removes an order from the MSSQL ERP Booking database by its invoice_code.
 */
export async function deleteOrderFromErp(
  orderId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const invoiceCode = `WEB-${orderId.substring(orderId.length - 6)}`.substring(0, 50)
    const pool = await getMssqlPool()

    console.log(`[ERP/Delete] Deleting invoice_code ${invoiceCode} from MSSQL ERP Booking table...`)
    
    const result = await pool.request()
      .input("invoice_code", sql.NVarChar, invoiceCode)
      .query("DELETE FROM Booking WHERE invoice_code = @invoice_code")

    console.log(`✅ [ERP/Delete] MSSQL deletion complete for invoice_code ${invoiceCode}. Rows affected:`, result.rowsAffected)
    return { success: true, message: `Successfully deleted booking records for ${invoiceCode}` }
  } catch (error: any) {
    console.error("❌ [ERP/Delete] Failed to delete booking from MSSQL:", error)
    return { success: false, error: error.message }
  }
}
