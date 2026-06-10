import { prisma } from "@/lib/prisma"
import { getMssqlPool, sql } from "@/lib/mssql"
import { calculateRentalPrice } from "@/lib/rental-pricing"
import { getImageUploadService } from "@/lib/image-upload-service"

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

    for (const item of items) {
      if (item.type === "rent" && item.rentStart && item.rentEnd) {
        const branchId = 10 // All web orders go to BranchID 10
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

          let itemDeposit = 1000 // Default to Soiree
          if (item.isExclusive) {
            itemDeposit = Math.round(finalPrice * 0.5)
          } else {
            const col = (item.collection || "").toLowerCase()
            if (col === "wedding") {
              itemDeposit = 5000
            }
          }
          
          itemDeposit = Math.min(itemDeposit, finalPrice)
          const itemRemaining = Math.max(0, finalPrice - itemDeposit)

          await new sql.Request(txn)
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
              ) VALUES (
                @invoice_code, @Cust_Name, @Cust_Tel, @Cust_Mobile, @Cust_Address,
                @DeviceTypeID, @ModelTypeID, @Scarves, @CashMayo, @Other, @OtheNote,
                @BookingDate, @ReceivedDate, @ReturnDate, @Emp_ID, @CurrencyID,
                @ExRate, @Total, @Deposit, @Remaining, @NoteItem,
                @BreastSize, @WaistSize, @ButtocksSize, @SleeveSize,
                @ApprovedID, @Desc_Customer, @BranchID, @UserID, @CariedOver,
                @LastUpdate, @Transfer, @Paid, @PersonalityinvestigationId,
                @GuaranteeAmount, @GuaranteeNote, @ReturnNote, @AdditionalCost,
                @First, @OccasionDate
              )
            `)

          await txn.commit()
          console.log(`✅ [ERP/Sync] Item ${item.productId}: Price = ${finalPrice} EGP`)
        } catch (txnError: any) {
          try { await txn.rollback() } catch { /* already rolled back */ }
          console.error(`Failed to process rental booking for item ${item.productId}:`, txnError)
          return { success: false, error: txnError.message }
        }
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error("[ERP/Sync] General error:", error)
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
