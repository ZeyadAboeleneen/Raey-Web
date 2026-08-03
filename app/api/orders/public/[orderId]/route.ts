import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params

    let order = await prisma.order.findFirst({
      where: { orderId }
    })

    if (!order) {
      order = await prisma.order.findUnique({
        where: { id: orderId }
      })
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Return only necessary info for the success page.
    // paymentStatus comes from our own record — set only by a verified Fawry
    // event — so the success page never has to trust the redirect URL.
    const publicOrder = {
      id: order.orderId,
      items: order.items,
      total: order.total,
      status: order.status,
      shippingAddress: order.shippingAddress,
      createdAt: order.createdAt,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      depositAmount: order.depositAmount,
      remainingAmount: order.remainingAmount,
    }

    return NextResponse.json(publicOrder)
  } catch (error) {
    console.error("Public order fetch error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
