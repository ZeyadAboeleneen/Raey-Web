import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

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

    return NextResponse.json({ success: true, order: transformOrder(order), orderId: order.orderId })
  } catch (error) {
    console.error("Create order error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
