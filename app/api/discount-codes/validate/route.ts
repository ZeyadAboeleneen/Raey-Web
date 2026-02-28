import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import type { OrderItem } from "@/lib/models/types"

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    let userId = "guest"

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
        userId = decoded.userId
      } catch { }
    }

    const { code, orderAmount, items, email }: { code: string; orderAmount: number; items: OrderItem[]; email?: string } =
      await request.json()

    if (!code) return NextResponse.json({ error: "Discount code is required" }, { status: 400 })
    if (items && !Array.isArray(items)) return NextResponse.json({ error: "Items must be an array" }, { status: 400 })

    const normalizedCode = code.trim().toUpperCase()

    const discountCode = await prisma.discountCode.findFirst({
      where: { isActive: true, code: { equals: normalizedCode } },
    })

    if (!discountCode) return NextResponse.json({ error: "Invalid discount code" }, { status: 400 })

    // Date checks
    if (discountCode.validFrom && new Date() < new Date(discountCode.validFrom)) {
      return NextResponse.json({ error: "Discount code is not yet valid" }, { status: 400 })
    }
    if (discountCode.validUntil && new Date() > new Date(discountCode.validUntil)) {
      return NextResponse.json({ error: "Discount code has expired" }, { status: 400 })
    }

    // Usage limits
    if (discountCode.usageLimit) {
      if (userId !== "guest") {
        const userUsageCount = await prisma.order.count({
          where: { userId, discountCode: discountCode.code },
        })
        if (userUsageCount >= discountCode.usageLimit) {
          return NextResponse.json(
            { error: `You have already used this discount code ${discountCode.usageLimit} times.` },
            { status: 400 }
          )
        }
      } else if (email) {
        // Guest: count by email in shippingAddress JSON
        // MySQL doesn't support JSON contains natively in Prisma, use raw query
        const result = await prisma.$queryRaw<[{ cnt: number }]>`
          SELECT COUNT(*) as cnt FROM orders
          WHERE JSON_EXTRACT(shipping_address, '$.email') = ${email}
          AND discount_code = ${discountCode.code}
        `
        const guestUsageCount = Number(result[0]?.cnt ?? 0)
        if (guestUsageCount >= discountCode.usageLimit) {
          return NextResponse.json(
            { error: `This email has already used this discount code ${discountCode.usageLimit} times.` },
            { status: 400 }
          )
        }
      }
    }

    // Minimum order
    if (discountCode.minPurchase && orderAmount < discountCode.minPurchase) {
      return NextResponse.json({
        error: "MIN_ORDER_AMOUNT",
        minOrderAmount: discountCode.minPurchase,
        minOrderRemaining: discountCode.minPurchase - orderAmount,
      }, { status: 400 })
    }

    const actualType = discountCode.originalType || discountCode.discountType
    let discountAmount = 0
    let discountDetails: any = {}

    if (actualType === "percentage") {
      discountAmount = (orderAmount * discountCode.discountValue) / 100
      if (discountCode.maxDiscount) discountAmount = Math.min(discountAmount, discountCode.maxDiscount)
      discountDetails = { percentage: discountCode.discountValue }
    } else if (actualType === "fixed") {
      discountAmount = Math.min(discountCode.discountValue, orderAmount)
      discountDetails = { fixedAmount: discountCode.discountValue }
    } else if (actualType === "buyXgetX") {
      if (!items?.length) return NextResponse.json({ error: "Add items to your cart to apply this discount" }, { status: 400 })
      const buyX = discountCode.buyX || 0
      const getX = discountCode.getX || 0
      if (!buyX || !getX) return NextResponse.json({ error: "Invalid discount code configuration" }, { status: 400 })
      const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0)
      const minimumRequired = buyX + getX
      if (totalQuantity < minimumRequired) {
        const needed = minimumRequired - totalQuantity
        return NextResponse.json({
          error: `Add ${needed} more item${needed > 1 ? "s" : ""} to your cart (Buy ${buyX} Get ${getX} Free — minimum ${minimumRequired} items required)`,
          neededItems: needed, buyX, getX, minimumRequired,
        }, { status: 400 })
      }
      const setsOfBuyX = Math.floor(totalQuantity / (buyX + getX))
      const freeItemsCount = setsOfBuyX * getX
      const sortedItems = [...items]
        .flatMap((item) => Array(item.quantity || 1).fill(null).map(() => ({ price: item.price || 0, name: item.name || "", id: (item as any).id || "" })))
        .sort((a, b) => a.price - b.price)
      discountAmount = sortedItems.slice(0, freeItemsCount).reduce((sum, item) => sum + item.price, 0)
      discountDetails = { buyX, getX, freeItemsCount, type: "buyXgetX" }
    } else if (actualType === "buyXgetYpercent") {
      if (!items?.length) return NextResponse.json({ error: "Add items to your cart to apply this discount" }, { status: 400 })
      const buyX = discountCode.buyX || 0
      const discountPercentage = discountCode.discountPercentage || 0
      if (!buyX || !discountPercentage) return NextResponse.json({ error: "Invalid discount code configuration" }, { status: 400 })
      const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0)
      if (totalQuantity < buyX) {
        const needed = buyX - totalQuantity
        return NextResponse.json({
          error: `Add ${needed} more item${needed > 1 ? "s" : ""} to get ${discountPercentage}% off on the next item`,
          neededItems: needed, buyX, discountPercentage,
        }, { status: 400 })
      }
      const sortedItems = [...items]
        .flatMap((item) => Array(item.quantity || 1).fill(null).map(() => ({ price: item.price || 0 })))
        .sort((a, b) => a.price - b.price)
      if (sortedItems.length > 0) discountAmount = (sortedItems[0].price * discountPercentage) / 100
      discountDetails = { buyX, discountPercentage, type: "buyXgetYpercent" }
    }

    if (discountAmount === 0 && actualType !== "buyXgetX" && actualType !== "buyXgetYpercent") {
      return NextResponse.json({ error: "This discount code type is not supported" }, { status: 400 })
    }

    return NextResponse.json({
      valid: true, discountAmount,
      code: discountCode.code,
      type: actualType,
      value: discountCode.discountValue,
      discountDetails,
    })
  } catch (error) {
    console.error("Discount validation error:", error)
    return NextResponse.json({ error: "An error occurred while validating discount code" }, { status: 500 })
  }
}
