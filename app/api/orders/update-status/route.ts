import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isAdminRequest } from "@/lib/erp-items"

export async function PUT(request: NextRequest) {
  try {
    if (!(await isAdminRequest(request, "canUpdateOrders"))) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const { orderId, status } = await request.json()
    if (!orderId || !status) return NextResponse.json({ error: "Order ID and status are required" }, { status: 400 })

    const order = await prisma.order.findFirst({ where: { orderId } })
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    const updatedOrder = await prisma.order.update({ where: { id: order.id }, data: { status } })

    const transformedOrder = {
      _id: updatedOrder.id,
      id: updatedOrder.orderId,
      userId: updatedOrder.userId,
      items: updatedOrder.items || [],
      total: updatedOrder.total || 0,
      status: updatedOrder.status || "pending",
      shippingAddress: updatedOrder.shippingAddress || {},
      paymentMethod: updatedOrder.paymentMethod || "cod",
      paymentDetails: updatedOrder.paymentDetails,
      discountCode: updatedOrder.discountCode,
      discountAmount: updatedOrder.discountAmount || 0,
      createdAt: updatedOrder.createdAt ? new Date(updatedOrder.createdAt) : new Date(),
      updatedAt: updatedOrder.updatedAt ? new Date(updatedOrder.updatedAt) : new Date(),
    }

    return NextResponse.json({ message: "Order status updated successfully", order: transformedOrder })
  } catch (error) {
    console.error("Update order error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
