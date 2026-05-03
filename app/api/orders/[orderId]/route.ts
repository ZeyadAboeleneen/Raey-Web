import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isAdminRequest } from "@/lib/erp-items"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    if (!(await isAdminRequest(request, "canUpdateOrders"))) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const { status } = await request.json()
    const { orderId } = await params

    const updatedOrder = await prisma.order.update({
      where: { orderId },
      data: { status },
    })

    const transformedOrder = {
      _id: updatedOrder.id,
      id: updatedOrder.orderId,
      userId: updatedOrder.userId,
      items: updatedOrder.items || [],
      total: updatedOrder.total || 0,
      status: updatedOrder.status || "pending",
      shippingAddress: updatedOrder.shippingAddress || {},
      paymentMethod: updatedOrder.paymentMethod || "instapay",
      paymentDetails: updatedOrder.paymentDetails,
      paymentScreenshot: updatedOrder.paymentScreenshot,
      discountCode: updatedOrder.discountCode,
      discountAmount: updatedOrder.discountAmount || 0,
      depositAmount: updatedOrder.depositAmount || 0,
      remainingAmount: updatedOrder.remainingAmount || 0,
      createdAt: updatedOrder.createdAt ? new Date(updatedOrder.createdAt) : new Date(),
      updatedAt: updatedOrder.updatedAt ? new Date(updatedOrder.updatedAt) : new Date(),
    }

    return NextResponse.json({ success: true, order: transformedOrder })
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Order not found" }, { status: 404 })
    console.error("Update order error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
