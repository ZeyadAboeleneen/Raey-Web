import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 })

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    if (decoded.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 })

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
      paymentMethod: updatedOrder.paymentMethod || "cod",
      paymentDetails: updatedOrder.paymentDetails,
      discountCode: updatedOrder.discountCode,
      discountAmount: updatedOrder.discountAmount || 0,
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
