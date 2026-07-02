import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { getErpUserById } from "@/lib/erp-users"
import { returnOrderItemsToStock } from "@/lib/order-stock"
import { syncRemainingPaymentToErp, reverseDepositInErp, reAddDepositInErp } from "@/lib/erp-sync"

export const dynamic = "force-dynamic"

const requireAdminOrPermission = async (request: NextRequest, permissionKey: string) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: "Authorization required", status: 401 }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    if (decoded.role === "admin") return { decoded }
    
    if (decoded.employeeId) {
      const employee = await getErpUserById(decoded.employeeId)
      if (!employee || !employee.isActive) return { error: "Unauthorized", status: 401 }
      if (employee[permissionKey as keyof typeof employee]) return { decoded, employee }
    }
    
    return { error: "Permission denied", status: 403 }
  } catch {
    return { error: "Invalid token", status: 401 }
  }
}

const transformOrder = (order: any) => ({
  _id: order.id,
  id: order.orderId,
  userId: order.userId,
  items: order.items || [],
  total: order.total || 0,
  status: order.status || "pending",
  shippingAddress: order.shippingAddress || {},
  paymentMethod: order.paymentMethod || "instapay",
  paymentDetails: order.paymentDetails,
  paymentScreenshot: order.paymentScreenshot || null,
  paymentStatus: order.paymentStatus || "pending",
  paymentFraudReason: order.paymentFraudReason || null,
  paymentAiConfidence: order.paymentAiConfidence || null,
  discountCode: order.discountCode,
  discountAmount: order.discountAmount || 0,
  depositAmount: order.depositAmount || 0,
  remainingAmount: order.remainingAmount || 0,
  depositRefunded: order.depositRefunded || false,
  createdAt: order.createdAt ? new Date(order.createdAt) : new Date(),
  updatedAt: order.updatedAt ? new Date(order.updatedAt) : new Date(),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const auth = await requireAdminOrPermission(request, "canViewOrders")
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { orderId } = await params

    console.log("🔍 [API] Looking for order with ID:", orderId)

    let order = await prisma.order.findFirst({ where: { orderId } })
    if (!order) order = await prisma.order.findFirst({ where: { id: orderId } })

    if (!order) {
      console.error("❌ [API] Order not found with ID:", orderId)
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    console.log("✅ [API] Order found:", order.orderId)
    return NextResponse.json(transformOrder(order))
  } catch (error) {
    console.error("Get admin order error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const auth = await requireAdminOrPermission(request, "canUpdateOrders")
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { orderId } = await params
    const { status, refundDeposit } = await request.json()

    if (!status) return NextResponse.json({ error: "Status is required" }, { status: 400 })

    const currentOrder = await prisma.order.findFirst({ where: { orderId } })
    if (!currentOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    let updatedOrder = await prisma.order.update({ where: { id: currentOrder.id }, data: { status } })

    // If order was cancelled, return items to stock
    if (status === "cancelled" && currentOrder.status !== "cancelled") {
      await returnOrderItemsToStock(currentOrder.items as any[] || [])

      // If refunding the deposit, remove it from the employee's cash drawer (خزنة)
      if (refundDeposit === true) {
        const refundResult = await reverseDepositInErp(currentOrder.orderId)
        if (!refundResult.success) {
          console.error(`[Orders] Deposit refund failed for ${currentOrder.orderId}:`, refundResult.error)
        } else {
          console.log(`[Orders] Deposit refund OK for ${currentOrder.orderId}: ${refundResult.message}`)
          updatedOrder = await prisma.order.update({ where: { id: currentOrder.id }, data: { depositRefunded: true } })
        }
      }
    }

    // If order is moved out of "cancelled" and the deposit had been refunded, re-add it
    if (status !== "cancelled" && currentOrder.status === "cancelled" && currentOrder.depositRefunded) {
      const reAddResult = await reAddDepositInErp(currentOrder.orderId)
      if (!reAddResult.success) {
        console.error(`[Orders] Deposit re-add failed for ${currentOrder.orderId}:`, reAddResult.error)
      } else {
        console.log(`[Orders] Deposit re-add OK for ${currentOrder.orderId}: ${reAddResult.message}`)
        updatedOrder = await prisma.order.update({ where: { id: currentOrder.id }, data: { depositRefunded: false } })
      }
    }

    // When dress is delivered (picked up), remaining balance is collected — post to ERP
    if (status === "delivered" && currentOrder.status !== "delivered") {
      const erpResult = await syncRemainingPaymentToErp(currentOrder.orderId)
      if (!erpResult.success) {
        console.error(`[Orders] Remaining ERP sync failed for ${currentOrder.orderId}:`, erpResult.error)
      } else {
        console.log(`[Orders] Remaining ERP sync OK for ${currentOrder.orderId}: ${erpResult.message}`)
      }
    }

    const transformed = transformOrder(updatedOrder)
    return NextResponse.json({ message: "Order status updated successfully", order: transformed })
  } catch (error) {
    console.error("Update order error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const auth = await requireAdminOrPermission(request, "canUpdateOrders")
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { orderId } = await params
    const { status, refundDeposit } = await request.json()

    if (!status) return NextResponse.json({ error: "Status is required" }, { status: 400 })

    const currentOrder = await prisma.order.findFirst({ where: { orderId } })
    if (!currentOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    let updatedOrder = await prisma.order.update({ where: { id: currentOrder.id }, data: { status } })

    // If order was cancelled, return items to stock
    if (status === "cancelled" && currentOrder.status !== "cancelled") {
      await returnOrderItemsToStock(currentOrder.items as any[] || [])

      // If refunding the deposit, remove it from the employee's cash drawer (خزنة)
      if (refundDeposit === true) {
        const refundResult = await reverseDepositInErp(currentOrder.orderId)
        if (!refundResult.success) {
          console.error(`[Orders] Deposit refund failed for ${currentOrder.orderId}:`, refundResult.error)
        } else {
          console.log(`[Orders] Deposit refund OK for ${currentOrder.orderId}: ${refundResult.message}`)
          updatedOrder = await prisma.order.update({ where: { id: currentOrder.id }, data: { depositRefunded: true } })
        }
      }
    }

    // If order is moved out of "cancelled" and the deposit had been refunded, re-add it
    if (status !== "cancelled" && currentOrder.status === "cancelled" && currentOrder.depositRefunded) {
      const reAddResult = await reAddDepositInErp(currentOrder.orderId)
      if (!reAddResult.success) {
        console.error(`[Orders] Deposit re-add failed for ${currentOrder.orderId}:`, reAddResult.error)
      } else {
        console.log(`[Orders] Deposit re-add OK for ${currentOrder.orderId}: ${reAddResult.message}`)
        updatedOrder = await prisma.order.update({ where: { id: currentOrder.id }, data: { depositRefunded: false } })
      }
    }

    // When dress is delivered (picked up), remaining balance is collected — post to ERP
    if (status === "delivered" && currentOrder.status !== "delivered") {
      const erpResult = await syncRemainingPaymentToErp(currentOrder.orderId)
      if (!erpResult.success) {
        console.error(`[Orders] Remaining ERP sync failed for ${currentOrder.orderId}:`, erpResult.error)
      } else {
        console.log(`[Orders] Remaining ERP sync OK for ${currentOrder.orderId}: ${erpResult.message}`)
      }
    }

    const transformed = transformOrder(updatedOrder)

    // Send review reminder emails if status is 'delivered'
    if (status === "delivered") {
      try {
        const items = (updatedOrder.items as any[]) || []
        for (const item of items) {
          const product = await prisma.product.findFirst({
            where: { productId: item.productId || item.id },
            select: { productId: true, name: true, images: true },
          })

          if (product) {
            fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "https://raey-web.vercel.app"}/api/send-review-reminder`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                order: transformed,
                product: { id: product.productId, name: product.name, images: product.images },
              }),
            }).catch((err) => console.error(`❌ Failed to send review reminder for ${product.name}:`, err))
          }
        }
      } catch (reviewEmailError) {
        console.error("❌ Error sending review reminder emails:", reviewEmailError)
      }
    }

    return NextResponse.json({ success: true, message: "Order status updated successfully", order: transformed })
  } catch (error) {
    console.error("Update admin order error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    const authResult = await requireAdminOrPermission(req as any, "canDeleteOrders")
    if (authResult.error) return NextResponse.json({ error: authResult.error }, { status: authResult.status as number })

    const { orderId } = params
    const refundDeposit = new URL((req as Request).url).searchParams.get("refundDeposit") === "true"

    // 1. Fetch order to verify existence
    let order = await prisma.order.findFirst({
      where: { orderId }
    })

    if (!order) {
      order = await prisma.order.findFirst({
        where: { id: orderId }
      })
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // 1b. If refunding the deposit, remove it from the employee's cash drawer (خزنة)
    //     before the Booking row (and its journal RecID link) is deleted.
    if (refundDeposit) {
      const refundResult = await reverseDepositInErp(order.orderId)
      if (!refundResult.success) {
        console.error(`[Orders] Deposit refund failed for ${order.orderId}:`, refundResult.error)
      } else {
        console.log(`[Orders] Deposit refund OK for ${order.orderId}: ${refundResult.message}`)
      }
    }

    // 2. Delete MSSQL Bookings associated with this order. This MUST succeed before
    //    we delete the local order — otherwise the ERP keeps an orphaned booking
    //    while the website thinks the order is gone. So on failure we abort and
    //    surface the error instead of reporting a false success.
    try {
      const { getMssqlPool, sql } = await import('@/lib/mssql')
      const pool = await getMssqlPool()
      // Build the invoice_code from the canonical order.orderId exactly as it was
      // created in syncOrderToErp — the URL param may be the internal Prisma id,
      // which would produce a wrong code and delete nothing.
      const invoiceCode = `WEB-${order.orderId.substring(order.orderId.length - 6)}`.substring(0, 50)

      // Prefer the Booking IDs we captured at sync time — the ERP may rewrite
      // invoice_code on insert, so it can't be trusted as the delete key. Fall
      // back to invoice_code only for older orders that predate ID capture.
      const storedIds = ((order.paymentDetails as any)?.erpBookingIds as number[] | undefined) || []
      let bookingIds: number[] = storedIds.filter((id) => Number.isFinite(id))

      if (bookingIds.length === 0) {
        const bookingRows = await pool.request()
          .input('invoice_code', sql.NVarChar, invoiceCode)
          .query(`SELECT ID FROM Booking WHERE invoice_code = @invoice_code`)
        bookingIds = (bookingRows.recordset as { ID: number }[]).map((r) => r.ID)
      }

      if (bookingIds.length === 0) {
        // Nothing to delete in the ERP (e.g. order never synced). Proceed to
        // remove the local order.
        console.warn(`[ERP/Delete] No booking found for order ${order.orderId} (invoice ${invoiceCode}) — nothing to delete in ERP.`)
      } else {
        const idList = bookingIds.join(',')
        // Deposit ("اذن حجز") journal entries reference the booking via RecID. Remove
        // the detail lines then the headers, or a FK constraint blocks the booking delete.
        await pool.request().query(`
          DELETE d FROM tb_JournalDet d
          INNER JOIN tb_Journal j ON d.J_ID = j.ID
          WHERE j.RecID IN (${idList})
        `)
        await pool.request().query(`DELETE FROM tb_Journal WHERE RecID IN (${idList})`)

        // Delete the booking rows by their primary key — immune to invoice_code rewrites.
        const del = await pool.request().query(`DELETE FROM Booking WHERE ID IN (${idList})`)
        const rowsDeleted = del.rowsAffected?.[0] ?? 0
        console.log(`✅ Deleted ${rowsDeleted}/${bookingIds.length} MSSQL Booking row(s) [${idList}] for order ${order.orderId}`)

        if (rowsDeleted === 0) {
          // We had IDs but deleted none — abort so the systems don't desync.
          return NextResponse.json(
            { error: `Found ${bookingIds.length} booking(s) but none were deleted. Order kept.` },
            { status: 500 },
          )
        }
      }
    } catch (mssqlError: any) {
      console.error("❌ Failed to delete from MSSQL Booking table:", mssqlError)
      return NextResponse.json(
        { error: `Failed to delete booking from ERP: ${mssqlError?.message || "unknown error"}. Order was NOT deleted — please retry.` },
        { status: 500 },
      )
    }

    // 3. Return items to stock before deletion (if not already cancelled)
    if (order.status !== "cancelled") {
      await returnOrderItemsToStock(order.items as any[] || [])
    }

    // 4. Delete local Prisma Order (Cascade will delete items)
    await prisma.order.delete({
      where: { id: order.id },
    })

    return NextResponse.json({ success: true, message: "Order and bookings deleted successfully" })
  } catch (error) {
    console.error("Delete admin order error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
