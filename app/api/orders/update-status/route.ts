import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import jwt from "jsonwebtoken"

export async function PUT(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 })

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    if (decoded.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 })

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
