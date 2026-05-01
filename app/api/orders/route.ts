import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { getMssqlPool, sql } from "@/lib/mssql"
import { mapBranchSlugToBranchId } from "@/lib/branch-map"
import { calculateRentalPrice } from "@/lib/rental-pricing"

export const dynamic = "force-dynamic"

const transformOrder = (order: any) => ({
  _id: order.id,
  id: order.orderId,
  userId: order.userId,
  items: order.items || [],
  total: order.total || 0,
  status: order.status || "pending",
  shippingAddress: order.shippingAddress || {},
  paymentMethod: order.paymentMethod || "cod",
  paymentDetails: order.paymentDetails,
  discountCode: order.discountCode,
  discountAmount: order.discountAmount || 0,
  createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
  updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : new Date().toISOString(),
})

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 })

    let decoded: any
    try { decoded = jwt.verify(token, process.env.JWT_SECRET!) } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }) }

    let isEmployeeWithAccess = false
    let isStandardUser = false

    if (decoded.employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: decoded.employeeId } })
      if (!employee || !employee.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      
      if (employee.role === "admin" || employee.canViewOrders) {
        isEmployeeWithAccess = true
      } else {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 })
      }
    } else if (decoded.userId) {
      if (decoded.role === "admin") {
        isEmployeeWithAccess = true
      } else {
        isStandardUser = true
      }
    } else {
      return NextResponse.json({ error: "Invalid token payload" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const status = searchParams.get("status")

    const where: any = {}
    if (isStandardUser) {
      where.userId = decoded.userId
    } else if (isEmployeeWithAccess && userId) {
      where.userId = userId
    }
    if (status) where.status = status

    const orders = await prisma.order.findMany({ where, orderBy: { createdAt: "desc" } })

    return NextResponse.json({ orders: orders.map(transformOrder) })
  } catch (error) {
    console.error("Get orders error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    let userId: string | "guest" = "guest"
    let isLoggedIn = false

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
        userId = decoded.userId
        isLoggedIn = true
      } catch { }
    }

    const { items, total, shippingAddress, paymentMethod, paymentDetails, discountCode, discountAmount } =
      await request.json()

    if (!items?.length || !total || !shippingAddress) {
      return NextResponse.json({ error: "Items, total, and shipping address are required" }, { status: 400 })
    }

    // Validate stock for each item
    for (const item of items) {
      if (!item.productId || !item.size || item.quantity === undefined) continue

      const product = await prisma.product.findUnique({ where: { productId: item.productId } })
      if (!product) continue

      const sizes = product.sizes as any[]
      const sizeEntry = sizes?.find((s: any) =>
        s.size === item.size || s.volume === item.size || s.size === item.volume || s.volume === item.volume
      )

      if (sizeEntry !== undefined && sizeEntry.stockCount !== null && sizeEntry.stockCount !== undefined) {
        if (sizeEntry.stockCount < item.quantity) {
          return NextResponse.json({
            error: `Insufficient stock for ${product.name} (${item.size}). Available: ${sizeEntry.stockCount}`,
            outOfStock: true, productId: item.productId,
          }, { status: 400 })
        }
      }
    }

    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

    // Build order data
    const orderData: any = {
      orderId,
      items: items.map((item: any) => ({ ...item, reviewed: false })),
      total, shippingAddress,
      paymentMethod: paymentMethod || "cod",
      paymentDetails: paymentDetails || null,
      discountCode: discountCode || null,
      discountAmount: discountAmount || 0,
      status: "pending",
      userId: isLoggedIn ? userId : "guest",
    }

    // If logged-in user, attach relation
    let order: any
    if (isLoggedIn && userId !== "guest") {
      order = await prisma.order.create({ data: orderData })
    } else {
      // Guest orders don't have a userId relation
      order = await prisma.order.create({ data: { ...orderData, userId: null } as any })
    }

    // Update stock for each item
    for (const item of items) {
      if (!item.productId || !item.size || item.quantity === undefined) continue

      const product = await prisma.product.findUnique({ where: { productId: item.productId } })
      if (!product) continue

      const sizes = product.sizes as any[]
      const updatedSizes = sizes?.map((s: any) => {
        const matches = s.size === item.size || s.volume === item.size || s.size === item.volume || s.volume === item.volume
        if (matches && s.stockCount !== null && s.stockCount !== undefined) {
          return { ...s, stockCount: Math.max(0, s.stockCount - item.quantity) }
        }
        return s
      })

      if (updatedSizes) {
        const isOutOfStock = (updatedSizes as any[]).every((s: any) => !s.stockCount && s.stockCount !== undefined)
        await prisma.product.update({
          where: { productId: item.productId },
          data: { sizes: updatedSizes, isOutOfStock },
        })
      }
    }

    // ── Sync rental bookings to MSSQL ERP with TRANSACTIONAL PRICING ──
    // Race-condition safe: pricing read + booking insert happen inside a transaction.
    // Server-calculated price ALWAYS overrides frontend price.
    const serverCalculatedPrices: Array<{
      productId: string
      serverPrice: number
      category: string
      formula: string
    }> = []

    try {
      const pool = await getMssqlPool()

      for (const item of items) {
        if (item.type === "rent" && item.rentStart && item.rentEnd) {
          const branchId = mapBranchSlugToBranchId(item.branch) || 15
          const modelTypeId = parseInt(item.productId, 10)

          if (isNaN(modelTypeId)) continue

          // ── Validate dates ────────────────────────────────────
          const rentStartDate = new Date(item.rentStart)
          const rentEndDate = new Date(item.rentEnd)

          if (isNaN(rentStartDate.getTime()) || isNaN(rentEndDate.getTime())) {
            console.error(`Invalid rental dates for item ${item.productId}`)
            continue
          }

          if (rentEndDate <= rentStartDate) {
            console.error(`rentEnd must be after rentStart for item ${item.productId}`)
            continue
          }

          // ── BEGIN TRANSACTION: price calculation + booking insert ──
          const txn = new sql.Transaction(pool)
          await txn.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)

          try {
            // 1. Calculate server-side price (reads Item_buypric + rental count inside txn)
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

            // 2. Double-booking check inside transaction
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

            // 3. Build NoteItem with exclusive flag
            const exclusivePrefix = item.isExclusive ? '[EXCLUSIVE] ' : ''
            const noteItem = `${exclusivePrefix}Web Order: ${item.size} - Qty: ${item.quantity}`

            // 4. INSERT booking with SERVER-CALCULATED price (never trust frontend)
            await new sql.Request(txn)
              .input('invoice_code', sql.NVarChar, `WEB-${orderId.substring(orderId.length - 6)}`.substring(0, 50))
              .input('Cust_Name', sql.NVarChar, (shippingAddress.name || '').substring(0, 50))
              .input('Cust_Tel', sql.NVarChar, (shippingAddress.secondaryPhone || '').substring(0, 50))
              .input('Cust_Mobile', sql.NVarChar, (shippingAddress.phone || '').substring(0, 50))
              .input('Cust_Address', sql.NVarChar, (shippingAddress.address || '').substring(0, 50))
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
              .input('Total', sql.Decimal(18, 2), serverPrice)
              .input('Deposit', sql.Decimal(18, 2), 0)
              .input('Remaining', sql.Decimal(18, 2), serverPrice)
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

            console.log(`✅ [Pricing] Item ${item.productId}: ${pricingResult.category} = ${serverPrice} EGP (${pricingResult.formula})`)

            serverCalculatedPrices.push({
              productId: item.productId,
              serverPrice,
              category: pricingResult.category,
              formula: pricingResult.formula,
            })
          } catch (txnError: any) {
            // Rollback on any error inside the transaction
            try { await txn.rollback() } catch { /* already rolled back */ }
            console.error(`Failed to process rental booking for item ${item.productId}:`, txnError)
          }
        }
      }
    } catch (erpError) {
      console.error("Failed to sync bookings to ERP:", erpError)
      // Do not block the primary checkout success if the local order succeeded
    }

    return NextResponse.json({
      success: true,
      order: transformOrder(order),
      orderId: order.orderId,
      // Return server-calculated rental prices so frontend can display them
      ...(serverCalculatedPrices.length > 0 && { serverCalculatedPrices }),
    })
  } catch (error) {
    console.error("Create order error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
