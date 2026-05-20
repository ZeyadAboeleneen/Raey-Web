import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { getMssqlPool, sql } from "@/lib/mssql"
import { mapBranchSlugToBranchId } from "@/lib/branch-map"
import { calculateRentalPrice } from "@/lib/rental-pricing"
import { uploadDataUrlToCloudinary } from "@/lib/cloudinary"
import { clearErpProductCaches } from "@/lib/erp-items"
import { getStoredResponse, storeResponse } from "@/lib/idempotency"
import { OutboxService } from "@/services/outbox.service"
import { rateLimit, generateCheckoutRateLimitKey } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Allow larger body for base64 payment screenshots
export const fetchCache = 'force-no-store'

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
  paymentStatus: order.paymentStatus || "pending",
  paymentReviewedBy: order.paymentReviewedBy || null,
  paymentFraudReason: order.paymentFraudReason || null,
  paymentAiRaw: order.paymentAiRaw || null,
  createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
  updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : new Date().toISOString(),
})

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 })

    let decoded: any
    try { decoded = jwt.verify(token, process.env.JWT_SECRET!) } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }) }

    let isEmployeeWithAccess = false
    let isStandardUser = false

    if (decoded.employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: decoded.employeeId } })
      if (!employee || !employee.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      
      if (employee.role === "admin" || employee.canViewOrders) {
        isEmployeeWithAccess = true
      } else {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 })
      }
    } else if (decoded.userId) {
      if (decoded.role === "admin") {
        isEmployeeWithAccess = true
      } else {
        isStandardUser = true
      }
    } else {
      return NextResponse.json({ error: "Invalid token payload" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const status = searchParams.get("status")
    const paymentStatus = searchParams.get("paymentStatus")

    const where: any = {}
    if (isStandardUser) {
      where.userId = decoded.userId
    } else if (isEmployeeWithAccess && userId) {
      where.userId = userId
    }
    if (status) where.status = status
    if (paymentStatus) where.paymentStatus = paymentStatus

    const orders = await prisma.order.findMany({ where, orderBy: { createdAt: "desc" } })

    return NextResponse.json({ orders: orders.map(transformOrder) })
  } catch (error) {
    console.error("Get orders error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}


export async function POST(request: NextRequest) {
  try {
    // ── Idempotency Check ─────────────────────────────────────
    const idempotencyKey = request.headers.get("Idempotency-Key")
    if (idempotencyKey) {
      const stored = await getStoredResponse(idempotencyKey)
      if (stored) {
        console.log(`[IDEMPOTENCY] Returning stored response for key: ${idempotencyKey}`)
        return NextResponse.json(stored)
      }
    }

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

    // ── Rate Limiting ─────────────────────────────────────────
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1"
    const sessionId = request.cookies.get("sessionId")?.value || null
    const rateLimitKey = generateCheckoutRateLimitKey(ip, userId, sessionId)
    
    // Allow max 10 requests per 15 minutes (900 seconds)
    const { success, remaining, reset } = await rateLimit(rateLimitKey, 10, 900)
    
    if (!success) {
      console.warn(`[Rate Limit] Blocked checkout attempt for IP: ${ip}, User: ${userId}`)
      return NextResponse.json(
        { error: "Too many checkout attempts. Please try again later." },
        { 
          status: 429,
          headers: {
            "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": remaining.toString()
          }
        }
      )
    }

    const { items, total, shippingAddress, paymentMethod, paymentDetails, paymentScreenshot, discountCode, discountAmount, depositAmount, remainingAmount } =
      await request.json()

    if (!items?.length || !total || !shippingAddress) {
      return NextResponse.json({ error: "Items, total, and shipping address are required" }, { status: 400 })
    }

    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
    
    let finalPaymentScreenshot = paymentScreenshot || null
    let initialPaymentStatus = "pending"

    // If it's a base64 image, upload it securely to Cloudinary before saving the order
    if (finalPaymentScreenshot && finalPaymentScreenshot.startsWith("data:image/")) {
      try {
        console.log("📸 [API/Orders] Uploading payment screenshot to Cloudinary...")
        finalPaymentScreenshot = await uploadDataUrlToCloudinary(
          finalPaymentScreenshot,
          "payments",
          `order-${orderId}`
        )
      } catch (uploadError) {
        console.error("❌ [API/Orders] Failed to upload screenshot to Cloudinary:", uploadError)
        return NextResponse.json({ error: "Failed to upload payment receipt. Please try again." }, { status: 500 })
      }
    }

    // Auto-approve if no payment verification is needed (e.g. Cash on Delivery)
    if (!finalPaymentScreenshot && paymentMethod === "cash_on_delivery") {
      initialPaymentStatus = "approved"
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate stock for each item inside the transaction
      for (const item of items) {
        if (!item.productId || !item.size || item.quantity === undefined) continue

        const product = await tx.product.findUnique({ where: { productId: item.productId } })

        const isSellDress = (product as any)?.branch === "sell-dresses" || item.branch === "sell-dresses"
        if (isSellDress) {
          if (product?.isOutOfStock) {
            throw new Error(`"${product.name || item.name}" has already been sold.`)
          }
          continue 
        }

        if (!product) continue

        const sizes = product.sizes as any[]
        const sizeEntry = sizes?.find((s: any) =>
          s.size === item.size || s.volume === item.size || s.size === item.volume || s.volume === item.volume
        )

        if (sizeEntry !== undefined && sizeEntry.stockCount !== null && sizeEntry.stockCount !== undefined) {
          if (sizeEntry.stockCount < item.quantity) {
            throw new Error(`Insufficient stock for ${product.name} (${item.size}). Available: ${sizeEntry.stockCount}`)
          }
        }
      }

      // 2. Create the order
      const orderData: any = {
        orderId,
        items: items.map((item: any) => ({ ...item, reviewed: false })),
        total, shippingAddress,
        paymentMethod: paymentMethod || "instapay",
        paymentDetails: paymentDetails || null,
        paymentScreenshot: finalPaymentScreenshot,
        discountCode: discountCode || null,
        discountAmount: discountAmount || 0,
        depositAmount: depositAmount || 0,
        remainingAmount: remainingAmount || 0,
        status: "pending",
        paymentStatus: initialPaymentStatus,
        paymentTransactionId: orderId, // Temporarily use orderId as transId until AI extracts real one, to ensure idempotency uniqueness works
        userId: isLoggedIn ? userId : null,
      }

      const order = await tx.order.create({ data: orderData })

      // 3. Queue Verification Job if pending
      if (initialPaymentStatus === "pending" && finalPaymentScreenshot) {
        await OutboxService.enqueue(
          "VERIFY_PAYMENT",
          {
            orderId: order.orderId,
            expectedAmount: depositAmount,
            expectedProvider: paymentMethod,
            imageUrl: finalPaymentScreenshot
          },
          tx
        )
      }

      // 4. Update local stock ONLY IF APPROVED (e.g. COD). 
      // If pending, stock will be reserved later by the verification worker.
      if (initialPaymentStatus === "approved") {
        for (const item of items) {
          if (!item.productId || !item.size || item.quantity === undefined) continue

          const product = await tx.product.findUnique({ where: { productId: item.productId } })

          const isSellDress = (product as any)?.branch === "sell-dresses" || item.branch === "sell-dresses"
          if (isSellDress) {
            await tx.product.upsert({
              where: { productId: item.productId },
              update: { isOutOfStock: true },
              create: {
                productId: item.productId,
                name: item.name || "Sell Dress",
                branch: "sell-dresses",
                isOutOfStock: true,
                sizes: [],
                images: [],
                notes: "",
                giftPackageSizes: [],
              },
            })
            continue
          }

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
            await tx.product.update({
              where: { productId: item.productId },
              data: { sizes: updatedSizes, isOutOfStock },
            })
          }
        }
      }

      return order
    }, { timeout: 30000 })

    // 4. Invalidate caches after successful transaction
    clearErpProductCaches()

    const responseData = {
      success: true,
      order: transformOrder(result),
      orderId: result.orderId,
    }

    if (idempotencyKey) {
      await storeResponse(idempotencyKey, responseData)
    }

    return NextResponse.json(responseData)
  } catch (error: any) {
    console.error("Create order error:", error)
    if (error.message?.includes("sold") || error.message?.includes("stock")) {
      return NextResponse.json({ error: error.message, outOfStock: true }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
