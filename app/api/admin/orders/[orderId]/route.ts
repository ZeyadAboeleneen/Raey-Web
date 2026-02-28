import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

const requireAdmin = (request: NextRequest) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: "Authorization required", status: 401 }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    if (decoded.role !== "admin") return { error: "Admin access required", status: 403 }
    return { decoded }
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
  paymentMethod: order.paymentMethod || "cod",
  paymentDetails: order.paymentDetails,
  discountCode: order.discountCode,
  discountAmount: order.discountAmount || 0,
  createdAt: order.createdAt ? new Date(order.createdAt) : new Date(),
  updatedAt: order.updatedAt ? new Date(order.updatedAt) : new Date(),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const auth = requireAdmin(request)
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
    const auth = requireAdmin(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { orderId } = await params
    const { status } = await request.json()

    if (!status) return NextResponse.json({ error: "Status is required" }, { status: 400 })

    const currentOrder = await prisma.order.findFirst({ where: { orderId } })
    if (!currentOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    const updatedOrder = await prisma.order.update({ where: { id: currentOrder.id }, data: { status } })

    const transformed = transformOrder(updatedOrder)
    return NextResponse.json({ message: "Order status updated successfully", order: transformed })
  } catch (error) {
    console.error("Update order error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const auth = requireAdmin(request)
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { orderId } = await params
    const { status } = await request.json()

    if (!status) return NextResponse.json({ error: "Status is required" }, { status: 400 })

    const currentOrder = await prisma.order.findFirst({ where: { orderId } })
    if (!currentOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    const updatedOrder = await prisma.order.update({ where: { id: currentOrder.id }, data: { status } })
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
