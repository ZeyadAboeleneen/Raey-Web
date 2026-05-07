import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { returnOrderItemsToStock } from "@/lib/order-stock"

export const dynamic = "force-dynamic"

const requireAdminOrPermission = async (request: NextRequest, permissionKey: string) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: "Authorization required", status: 401 }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    if (decoded.role === "admin") return { decoded }
    
    if (decoded.employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: decoded.employeeId } })
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
  discountCode: order.discountCode,
  discountAmount: order.discountAmount || 0,
  depositAmount: order.depositAmount || 0,
  remainingAmount: order.remainingAmount || 0,
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
    const { status } = await request.json()

    if (!status) return NextResponse.json({ error: "Status is required" }, { status: 400 })

    const currentOrder = await prisma.order.findFirst({ where: { orderId } })
    if (!currentOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    const updatedOrder = await prisma.order.update({ where: { id: currentOrder.id }, data: { status } })

    // If order was cancelled, return items to stock
    if (status === "cancelled" && currentOrder.status !== "cancelled") {
      await returnOrderItemsToStock(currentOrder.items as any[] || [])
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
    const { status } = await request.json()

    if (!status) return NextResponse.json({ error: "Status is required" }, { status: 400 })

    const currentOrder = await prisma.order.findFirst({ where: { orderId } })
    if (!currentOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    const updatedOrder = await prisma.order.update({ where: { id: currentOrder.id }, data: { status } })

    // If order was cancelled, return items to stock
    if (status === "cancelled" && currentOrder.status !== "cancelled") {
      await returnOrderItemsToStock(currentOrder.items as any[] || [])
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
            fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "https://www.alanoudalqadi.com"}/api/send-review-reminder`, {
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

    // 2. Delete MSSQL Bookings associated with this order
    try {
      const { getMssqlPool, sql } = await import('@/lib/mssql')
      const pool = await getMssqlPool()
      const invoiceCode = `WEB-${orderId.substring(orderId.length - 6)}`
      
      await pool.request()
        .input('invoice_code', sql.NVarChar, invoiceCode)
        .query(`DELETE FROM Booking WHERE invoice_code = @invoice_code`)

      console.log(`✅ Deleted MSSQL Bookings for invoice_code: ${invoiceCode}`)
    } catch (mssqlError) {
      console.error("❌ Failed to delete from MSSQL Booking table:", mssqlError)
      // Continue locally even if MSSQL fails to keep systems somewhat clean or let admin retry manually
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
