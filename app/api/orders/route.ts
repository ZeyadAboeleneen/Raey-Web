import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { getMssqlPool, sql } from "@/lib/mssql"
import { mapBranchSlugToBranchId } from "@/lib/branch-map"
import { calculateRentalPrice } from "@/lib/rental-pricing"
import { uploadDataUrlToCloudinary } from "@/lib/cloudinary"
import { clearErpProductCaches } from "@/lib/erp-items"
import { getStoredResponse, storeResponse } from "@/lib/idempotency"
import { priceCart, PricingError } from "@/lib/pricing/server-pricing"
import { OutboxService } from "@/services/outbox.service"
import { rateLimit, generateCheckoutRateLimitKey } from "@/lib/rate-limit"
import { getErpUserById } from "@/lib/erp-users"
import { syncEmployeeOrderToErp, syncOrderToErp } from "@/lib/erp-sync"

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
      const employee = await getErpUserById(decoded.employeeId)
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
    const includeUnpaid = searchParams.get("includeUnpaid") === "true"

    const where: any = {}
    if (isStandardUser) {
      where.userId = decoded.userId
    } else if (isEmployeeWithAccess && userId) {
      where.userId = userId
    }
    if (status) where.status = status
    if (paymentStatus) where.paymentStatus = paymentStatus

    // A Fawry order row is created *before* the customer pays, so every
    // abandoned or declined card attempt leaves one behind. Those aren't real
    // orders and shouldn't clutter the dashboard.
    //
    // Hidden, not deleted: pass ?includeUnpaid=true to see them (support and
    // finance need to, e.g. when a customer says they were charged), and an
    // explicit ?paymentStatus= filter always wins so the pending-review queues
    // keep working. Manual-transfer orders awaiting screenshot review are
    // untouched — only Fawry attempts that never got paid are filtered.
    if (!includeUnpaid && !paymentStatus) {
      where.NOT = {
        paymentMethod: "fawry",
        paymentStatus: { in: ["pending", "rejected", "expired"] },
      }
    }

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
    let employeeIdFromToken: string | null = null
    let isAdminOrder = false

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
        console.log(`[Orders/POST] token decoded: employeeId=${decoded.employeeId} userId=${decoded.userId} role=${decoded.role} type=${decoded.type}`)
        if (decoded.employeeId) {
          employeeIdFromToken = decoded.employeeId
        } else if (decoded.userId) {
          userId = decoded.userId
          isLoggedIn = true
          if (decoded.role === "admin") {
            isAdminOrder = true
          }
        }
      } catch (jwtErr: any) {
        console.log(`[Orders/POST] JWT verify failed: ${jwtErr?.message}`)
      }
    } else {
      console.log(`[Orders/POST] no token — guest order`)
    }

    // ── Employee context (orders placed from the dashboard) ───────────────
    let employee = null
    let erpLookupFailed = false
    if (employeeIdFromToken) {
      try {
        employee = await getErpUserById(employeeIdFromToken)
        if (!employee || !employee.isActive) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
      } catch (erpLookupErr) {
        // MSSQL is down — still allow the order to be saved; ERP sync will be skipped.
        console.error("[Orders] MSSQL employee lookup failed, proceeding without ERP context:", erpLookupErr)
        erpLookupFailed = true
      }
    }
    const isEmployeeOrder = !!employee || isAdminOrder || (!!employeeIdFromToken && erpLookupFailed)

    // ── Rate Limiting (skip for trusted employee orders) ──────────────────
    if (!isEmployeeOrder) {
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
    }

    const body = await request.json()
    const { items, shippingAddress, paymentMethod, paymentDetails, paymentScreenshot, discountCode } = body

    if (!items?.length || !shippingAddress) {
      return NextResponse.json({ error: "Items and shipping address are required" }, { status: 400 })
    }

    // ── Authoritative pricing ─────────────────────────────────────────────
    // Every money figure below is recomputed on the server. `total`,
    // `discountAmount`, `depositAmount` and `remainingAmount` from the request
    // body are read only to log a mismatch — they never reach the database for
    // a customer order.
    //
    // Staff price overrides are still honoured, but only once `isEmployeeOrder`
    // has been established above from a verified JWT plus an ERP employee
    // lookup. A customer sending the same fields gets them ignored.
    const staffOverrides = isEmployeeOrder
      ? Object.fromEntries(
          (items as any[]).map((item) => [
            String(item.id ?? item.productId ?? ""),
            {
              lineTotal:
                typeof item.price === "number"
                  ? item.price * Math.max(1, Number(item.quantity) || 1)
                  : undefined,
              deposit: typeof item.employeeDeposit === "number" ? item.employeeDeposit : undefined,
            },
          ]),
        )
      : undefined

    let priced
    try {
      priced = await priceCart({
        items: items as any[],
        discountCode: discountCode || null,
        userId: isLoggedIn ? userId : "guest",
        email: shippingAddress?.email,
        staffOverrides,
      })
    } catch (pricingError: any) {
      if (pricingError instanceof PricingError) {
        console.warn(`[Orders] Pricing rejected: ${pricingError.message} (item ${pricingError.itemId ?? "?"})`)
        return NextResponse.json({ error: pricingError.message, pricingFailed: true }, { status: 400 })
      }
      console.error("[Orders] Pricing failed:", pricingError)
      return NextResponse.json(
        { error: "We couldn't confirm current prices. Please try again." },
        { status: 503 },
      )
    }

    // A code that no longer applies must surface, not silently vanish from a
    // total the customer already saw.
    if (discountCode && priced.discountError) {
      return NextResponse.json(
        { error: priced.discountError.message, discountRejected: true, ...(priced.discountError.details || {}) },
        { status: 400 },
      )
    }

    // Fraud signal: a customer whose submitted total disagrees with ours.
    if (!isEmployeeOrder && typeof body.total === "number" && Math.abs(body.total - priced.total) > 1) {
      console.warn(
        `[Orders][PRICE-MISMATCH] client=${body.total} server=${priced.total} user=${userId} ` +
        `ip=${request.headers.get("x-forwarded-for") || "?"} — server price enforced`,
      )
    }

    const total = priced.total
    const discountAmount = priced.discountAmount
    const depositAmount = priced.depositAmount
    const remainingAmount = priced.remainingAmount

    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
    
    let finalPaymentScreenshot = paymentScreenshot || null
    let initialPaymentStatus = "pending"

    // A staff member can choose to collect payment through Fawry instead of
    // taking it in person. Such an order must follow the customer payment
    // lifecycle — no auto-approval, no booking until Fawry confirms — otherwise
    // staff could mark an order paid without any money moving.
    const isStaffFawryOrder = isEmployeeOrder && paymentMethod === "fawry"

    // Employee orders need no payment or proof — auto-approve and never require
    // a screenshot. The Fawry case above is the one exception.
    if (isEmployeeOrder && !isStaffFawryOrder) {
      finalPaymentScreenshot = null
      initialPaymentStatus = "approved"
    }

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
      for (const item of priced.items) {
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
        // Server-priced items. `price` here is the authoritative unit price, so
        // the stored order and every downstream consumer (emails, ERP sync,
        // admin dashboard) reflect what was actually charged.
        items: priced.items.map((item) => ({
          ...item,
          price: item.unitPrice,
          reviewed: false,
          pricing: { source: item.priceSource, formula: item.priceFormula, lineTotal: item.lineTotal },
        })),
        total, shippingAddress,
        // Staff-Fawry orders are stored as "fawry" so the callback, the
        // reconciliation cron and the success page all treat them like any
        // other online payment. Who placed it is kept in paymentDetails.
        paymentMethod: isStaffFawryOrder
          ? "fawry"
          : isEmployeeOrder
            ? "employee"
            : (paymentMethod || "instapay"),
        paymentDetails: isEmployeeOrder
          ? {
              ...(paymentDetails || {}),
              placedByEmployee: employee
                ? {
                    id: employee.id,
                    name: employee.username,
                    repId: employee.repId,
                    branchId: employee.branchId,
                    cashId: employee.cashId,
                    cashName: employee.cashName,
                  }
                : employeeIdFromToken
                  ? { employeeId: employeeIdFromToken, erpLookupFailed: true }
                  : { role: "admin", userId },
            }
          : (paymentDetails || null),
        paymentScreenshot: finalPaymentScreenshot,
        discountCode: priced.discountCode,
        discountAmount: discountAmount || 0,
        depositAmount: depositAmount || 0,
        remainingAmount: remainingAmount || 0,
        status: "pending",
        paymentStatus: initialPaymentStatus,
        paymentTransactionId: orderId, // Temporarily use orderId as transId until AI extracts real one, to ensure idempotency uniqueness works
        userId: isLoggedIn ? userId : null,
      }

      const order = await tx.order.create({ data: orderData })

      // Only a code the server actually applied counts against its usage limit.
      if (priced.discountCode) {
        await tx.discountCode.updateMany({
          where: { code: priced.discountCode },
          data: { usageCount: { increment: 1 } },
        })
      }

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
        for (const item of priced.items) {
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

    // 5. Staff orders (employee- or admin-placed) are auto-approved and sync to
    //    the ERP Booking table immediately at placement. Customer orders sync
    //    later, after payment verification, via the outbox worker.
    //    - Resolved employee → full employee sync (booking + deposit journal to CashID).
    //    - Admin (no employee record) → standard booking sync (no cash journal).
    //
    //    A staff order being paid through Fawry is excluded from both: no money
    //    has moved yet, so the booking (and its journal entry) waits for the
    //    Fawry callback, exactly like a customer order.
    if (isStaffFawryOrder) {
      console.log(`[Orders] ${result.orderId} is a staff order paid via Fawry — ERP sync deferred until payment confirms`)
    } else if (isEmployeeOrder && employee) {
      const erpResult = await syncEmployeeOrderToErp(result.orderId, {
        id: employee.id,
        repId: employee.repId,
        branchId: employee.branchId,
        cashId: employee.cashId,
      })
      if (!erpResult.success) {
        // Keep the local order — ERP sync can be retried manually. Don't roll back.
        console.error(`[Orders] Employee ERP sync failed for ${result.orderId} (order kept):`, erpResult.error)
      } else {
        console.log(`[Orders] Employee ERP sync succeeded for ${result.orderId}: ${erpResult.message || "ok"}`)
      }
    } else if (isAdminOrder) {
      // Admin-placed orders have no employee cash drawer; sync as a standard
      // approved booking so the dress is reserved in the ERP right away.
      try {
        const erpResult = await syncOrderToErp(result.orderId)
        if (!erpResult.success) {
          console.error(`[Orders] Admin ERP sync failed for ${result.orderId} (order kept):`, erpResult.error)
        } else {
          console.log(`[Orders] Admin ERP sync succeeded for ${result.orderId}: ${erpResult.message || "ok"}`)
        }
      } catch (erpError) {
        console.error(`[Orders] Admin ERP sync threw for ${result.orderId} (order kept):`, erpError)
      }
    }

    const responseData = {
      success: true,
      order: transformOrder(result),
      orderId: result.orderId,
      erpSyncStatus: isStaffFawryOrder
        ? "deferred-until-payment"
        : (isEmployeeOrder && employee) ? "attempted" : "skipped",
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
