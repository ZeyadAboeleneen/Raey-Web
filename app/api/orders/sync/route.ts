import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getMssqlPool, sql } from "@/lib/mssql"
import { mapBranchSlugToBranchId } from "@/lib/branch-map"
import { calculateRentalPrice } from "@/lib/rental-pricing"
import { uploadDataUrlToCloudinary } from "@/lib/cloudinary"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { orderId, paymentScreenshot } = await request.json()
    if (!orderId) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 })
    }

    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // 1. Upload Cloudinary Image if it's base64
    const finalScreenshot = paymentScreenshot || order.paymentScreenshot
    const isBase64Screenshot = finalScreenshot && finalScreenshot.startsWith("data:image/")
    
    if (isBase64Screenshot) {
      try {
        console.log("📸 [API/Sync] Uploading payment screenshot to Cloudinary...")
        const uploadedUrl = await uploadDataUrlToCloudinary(
          finalScreenshot,
          "payments",
          `order-${orderId}`
        )
        console.log("✅ [API/Sync] Payment screenshot uploaded:", uploadedUrl)
        
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentScreenshot: uploadedUrl }
        })
      } catch (uploadError) {
        console.error("❌ [API/Sync] Failed to upload payment screenshot:", uploadError)
      }
    }

    // 2. Sync ERP
    const items = order.items as any[]
    const shippingAddress = order.shippingAddress as any
    
    if (!items || !items.length) {
      return NextResponse.json({ success: true, message: "No items to sync" })
    }

    try {
      const pool = await getMssqlPool()

      for (const item of items) {
        if (item.type === "rent" && item.rentStart && item.rentEnd) {
          const branchId = mapBranchSlugToBranchId(item.branch) || 15
          const modelTypeId = parseInt(item.productId, 10)

          if (isNaN(modelTypeId)) continue

          const rentStartDate = new Date(item.rentStart)
          const rentEndDate = new Date(item.rentEnd)

          if (isNaN(rentStartDate.getTime()) || isNaN(rentEndDate.getTime())) continue
          if (rentEndDate <= rentStartDate) continue

          const txn = new sql.Transaction(pool)
          await txn.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)

          try {
            // Use the price from the order (which may be staff-overridden) if available
            // Otherwise, calculate server-side as a fallback
            let finalPrice: number
            if (item.price && item.price > 0) {
              // Trust the price from the cart — it may have been overridden by staff
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
              console.error(`Double-booking detected for item ${item.productId}`)
              continue
            }

            const exclusivePrefix = item.isExclusive ? '[EXCLUSIVE] ' : ''
            const extraDayLabels = []
            if (item.extraDayBefore) extraDayLabels.push('+1 day before')
            if (item.extraDayAfter) extraDayLabels.push('+1 day after')
            const extraDaySuffix = extraDayLabels.length > 0 ? ` [${extraDayLabels.join(', ')}]` : ''
            const noteItem = `${exclusivePrefix}Web Order: ${item.size} - Qty: ${item.quantity}${extraDaySuffix}`

            await new sql.Request(txn)
              .input('invoice_code', sql.NVarChar, `WEB-${orderId.substring(orderId.length - 6)}`.substring(0, 50))
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
              .input('Deposit', sql.Decimal(18, 2), finalPrice * 0.5)
              .input('Remaining', sql.Decimal(18, 2), finalPrice * 0.5)
              .input('NoteItem', sql.NVarChar, noteItem.substring(0, 200))
              .input('BreastSize', sql.NVarChar, item.customMeasurements?.values?.bust ? String(item.customMeasurements.values.bust).substring(0, 20) : '')
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
            console.log(`✅ [Pricing/Sync] Item ${item.productId}: ${item.price ? 'Cart Price' : 'Server Calc'} = ${finalPrice} EGP`)
          } catch (txnError: any) {
            try { await txn.rollback() } catch { /* already rolled back */ }
            console.error(`Failed to process rental booking for item ${item.productId}:`, txnError)
          }
        }
      }
    } catch (erpError) {
      console.error("Failed to sync bookings to ERP in background:", erpError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Sync error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
