import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncOrderToErp } from "@/lib/erp-sync"

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify Admin/Staff role
    // const user = await getUserFromToken(authHeader) 
    // Assuming simple authorization for now:
    const token = authHeader.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { decision, reason } = await request.json()
    if (!["approved", "rejected"].includes(decision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 })
    }

    const orderId = params.orderId
    const order = await prisma.order.findUnique({ where: { orderId } })
    
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const previousStatus = (order as any).paymentStatus

    if (decision === "approved" && previousStatus === "approved") {
      return NextResponse.json({ error: "Order payment has already been approved." }, { status: 400 })
    }

    // Process Decision
    await prisma.$transaction(async (tx: any) => {
      // 1. Update Order
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: decision,
          paymentFraudReason: reason || (order as any).paymentFraudReason,
          paymentReviewedBy: "admin", // Ideally get admin username from token
          paymentReviewedAt: new Date(),
        } as any
      })

      // 2. Manage Stock based on transition
      if (decision === "approved" && previousStatus !== "approved") {
        // Reserve Stock if approved (and wasn't approved before)
        const items = order.items as any[]
        for (const item of items) {
          if (!item.productId || !item.size || item.quantity === undefined) continue

          const product = await tx.product.findUnique({ where: { productId: item.productId } })
          if (!product) continue

          const isSellDress = (product as any)?.branch === "sell-dresses" || item.branch === "sell-dresses"
          if (isSellDress) {
            await tx.product.update({
              where: { productId: item.productId },
              data: { isOutOfStock: true }
            })
            continue
          }

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
              data: { sizes: updatedSizes, isOutOfStock }
            })
          }
        }
      } else if (decision === "rejected" && previousStatus === "approved") {
        // Restore Stock if rejected (and was previously approved)
        const items = order.items as any[]
        for (const item of items) {
          if (!item.productId || !item.size || item.quantity === undefined) continue

          const product = await tx.product.findUnique({ where: { productId: item.productId } })
          if (!product) continue

          const isSellDress = (product as any)?.branch === "sell-dresses" || item.branch === "sell-dresses"
          if (isSellDress) {
            await tx.product.update({
              where: { productId: item.productId },
              data: { isOutOfStock: false }
            })
            continue
          }

          const sizes = product.sizes as any[]
          const updatedSizes = sizes?.map((s: any) => {
            const matches = s.size === item.size || s.volume === item.size || s.size === item.volume || s.volume === item.volume
            if (matches && s.stockCount !== null && s.stockCount !== undefined) {
              return { ...s, stockCount: s.stockCount + item.quantity } // Reclaim stock
            }
            return s
          })

          if (updatedSizes) {
            const isOutOfStock = (updatedSizes as any[]).every((s: any) => !s.stockCount && s.stockCount !== undefined)
            await tx.product.update({
              where: { productId: item.productId },
              data: { sizes: updatedSizes, isOutOfStock }
            })
          }
        }
      }
    })

    // 3. Sync ERP
    if (decision === "approved" && previousStatus !== "approved") {
      console.log(`[Admin/Decision] Order ${orderId} approved by admin, syncing to ERP...`)
      const syncResult = await syncOrderToErp(orderId)
      if (!syncResult.success) {
        console.error(`[Admin/Decision] ERP Sync failed for order ${orderId}:`, syncResult.error)
      }
    } else if (decision === "rejected" && previousStatus === "approved") {
      console.log(`[Admin/Decision] Order ${orderId} rejected by admin. Deleting from MSSQL ERP...`)
      const { deleteOrderFromErp } = await import("@/lib/erp-sync")
      const deleteResult = await deleteOrderFromErp(orderId)
      if (!deleteResult.success) {
        console.error(`[Admin/Decision] ERP Deletion failed for order ${orderId}:`, deleteResult.error)
      }
    }

    return NextResponse.json({ success: true, message: `Order ${decision} successfully` })

  } catch (error: any) {
    console.error("Decision API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
