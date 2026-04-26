import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { getMssqlPool, sql } from "@/lib/mssql"
import { mapBranchSlugToBranchId } from "@/lib/branch-map"

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

    const isAdmin = decoded.role === "admin"
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const status = searchParams.get("status")

    const where: any = {}
    if (!isAdmin) {
      where.userId = decoded.userId
    } else if (userId) {
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
      order = await prisma.order.create({ data: { ...orderData, userId: undefined } as any })
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

    // Sync rental bookings to MSSQL ERP
    try {
      const pool = await getMssqlPool()
      for (const item of items) {
        if (item.type === "rent" && item.rentStart && item.rentEnd) {
          const branchId = mapBranchSlugToBranchId(item.branch) || 15 // Fallback to 15 if unknown
          const modelTypeId = parseInt(item.productId, 10)
          
          if (!isNaN(modelTypeId)) {
            await pool.request()
              .input('invoice_code', sql.NVarChar, `WEB-${orderId.substring(orderId.length - 6)}`)
              .input('Cust_Name', sql.NVarChar, `${shippingAddress.firstName} ${shippingAddress.lastName}`.trim())
              .input('Cust_Tel', sql.NVarChar, shippingAddress.phone || '')
              .input('Cust_Mobile', sql.NVarChar, shippingAddress.altPhone || shippingAddress.phone || '')
              .input('Cust_Address', sql.NVarChar, `${shippingAddress.address || ''}, ${shippingAddress.city || ''}`)
              .input('DeviceTypeID', sql.Int, 0)
              .input('ModelTypeID', sql.Int, modelTypeId)
              .input('Scarves', sql.Bit, 0)
              .input('CashMayo', sql.Bit, 0)
              .input('Other', sql.Bit, 0)
              .input('OtheNote', sql.NVarChar, '')
              .input('BookingDate', sql.DateTime, new Date())
              .input('ReceivedDate', sql.DateTime, new Date(item.rentStart))
              .input('ReturnDate', sql.DateTime, new Date(item.rentEnd))
              .input('Emp_ID', sql.Int, 1) // Using 1 for system/web user
              .input('CurrencyID', sql.Int, 1)
              .input('ExRate', sql.Decimal(18, 2), 1.0)
              .input('Total', sql.Decimal(18, 2), item.price * item.quantity)
              .input('Deposit', sql.Decimal(18, 2), 0)
              .input('Remaining', sql.Decimal(18, 2), item.price * item.quantity)
              .input('NoteItem', sql.NVarChar, `Web Order: ${item.size} - Qty: ${item.quantity}`)
              .input('BreastSize', sql.NVarChar, item.customMeasurements?.values?.bust ? String(item.customMeasurements.values.bust) : '')
              .input('WaistSize', sql.NVarChar, item.customMeasurements?.values?.waist ? String(item.customMeasurements.values.waist) : '')
              .input('ButtocksSize', sql.NVarChar, item.customMeasurements?.values?.hips ? String(item.customMeasurements.values.hips) : '')
              .input('SleeveSize', sql.NVarChar, item.customMeasurements?.values?.sleeve ? String(item.customMeasurements.values.sleeve) : '')
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
              .input('OccasionDate', sql.DateTime, new Date(new Date(item.rentStart).getTime() + 24 * 60 * 60 * 1000))
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
          }
        }
      }
    } catch (erpError) {
      console.error("Failed to sync bookings to ERP:", erpError)
      // Do not block the primary checkout success if the local order succeeded
    }

    return NextResponse.json({ success: true, order: transformOrder(order), orderId: order.orderId })
  } catch (error) {
    console.error("Create order error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
