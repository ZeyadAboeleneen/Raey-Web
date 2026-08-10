import { type NextRequest, NextResponse } from "next/server"
import { getMssqlPool, sql } from "@/lib/mssql"
import { calculateRentalPrice } from "@/lib/rental-pricing"
import { getActiveProductDiscounts, findDiscountForProduct, applyProductDiscount } from "@/lib/product-discounts"
import { getProductsServer } from "@/lib/get-products-server"

export const maxDuration = 60
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productIds, items: rawItems, occasionDate } = body

    // Accept either the legacy `productIds: string[]` or `items: {id, branch}[]`
    // (branch is needed to match branch-wide rent discount rules).
    const items: { id: string; branch: string | null }[] = Array.isArray(rawItems)
      ? rawItems.map((it: any) => ({ id: String(it.id), branch: it.branch ?? null }))
      : Array.isArray(productIds)
        ? productIds.map((id: any) => ({ id: String(id), branch: null }))
        : []

    if (!items.length) {
      return NextResponse.json({ error: "productIds or items must be a non-empty array" }, { status: 400 })
    }

    // Branch decides which branch-scoped rent discounts apply, so it must never be
    // left to the caller: a client that omits it (or sends "") would silently price
    // the item at full rate and wipe out a legitimate discount. Resolve anything
    // missing from the server's own product cache instead of trusting the request.
    const branchById = new Map<string, string | null>(
      items.map((it) => [it.id, it.branch && it.branch.trim() ? it.branch : null]),
    )
    if ([...branchById.values()].some((b) => b === null)) {
      try {
        const catalog = await getProductsServer()
        for (const p of catalog) {
          const id = String(p.id)
          if (branchById.has(id) && branchById.get(id) === null) {
            branchById.set(id, p.branch ?? null)
          }
        }
      } catch (err) {
        console.error("[Bulk Pricing] branch resolution fallback failed:", err)
      }
    }

    if (!occasionDate) {
      return NextResponse.json({ error: "occasionDate is required" }, { status: 400 })
    }

    // Mirror the same rental window used by the product detail page & quick-add modal:
    // ReceivedDate = occasionDate − 1 day, ReturnDate = occasionDate + 1 day
    const occasion = new Date(occasionDate)
    const rentStart = new Date(occasion)
    rentStart.setDate(rentStart.getDate() - 1)
    const rentEnd = new Date(occasion)
    rentEnd.setDate(rentEnd.getDate() + 1)
    const bookingDate = new Date()

    if (isNaN(rentStart.getTime())) {
      return NextResponse.json({ error: "Invalid occasionDate" }, { status: 400 })
    }

    const pool = await getMssqlPool()
    const req = pool.request()

    // 1. Prepare inputs
    req.input("RentStart", sql.VarChar, rentStart.toLocaleDateString("en-CA"))
    
    // We use a table variable or a long IN clause. For simplicity and performance with ~100-200 IDs, IN is fine.
    const ids = items.map(it => parseInt(it.id, 10)).filter(id => !isNaN(id))
    if (ids.length === 0) return NextResponse.json({ success: true, prices: {} })

    // 2. Optimized SQL to calculate dynamic parameters for all items
    // d is constant for the whole request since occasionDate is the same
    const msPerDay = 1000 * 60 * 60 * 24
    const startDay = new Date(rentStart)
    startDay.setHours(0,0,0,0)
    const bookDay = new Date(bookingDate)
    bookDay.setHours(0,0,0,0)
    const d = Math.max(1, Math.round((startDay.getTime() - bookDay.getTime()) / msPerDay))

    // Fetch cost plus, per item, keyed to the rent-start date (@RentStart):
    //  - n          = rentals RECEIVED by the rent-start date (drives POST4 threshold)
    //  - laterCount = existing bookings that start AFTER the rent-start date (frontier check)
    // so POST4 dresses (5th rental onward) are priced correctly in listings.
    const query = `
      SELECT
        i.ID,
        i.Item_buypric AS cost,
        (SELECT COUNT(*) FROM Booking bk
           WHERE bk.ModelTypeID = i.ID
             AND bk.ReturnDate IS NOT NULL
             AND CAST(bk.ReturnDate AS DATE) <= CAST(@RentStart AS DATE)) AS n,
        (SELECT COUNT(*) FROM Booking bk
           WHERE bk.ModelTypeID = i.ID
             AND bk.ReceivedDate IS NOT NULL
             AND CAST(bk.ReceivedDate AS DATE) > CAST(@RentStart AS DATE)) AS laterCount
      FROM Items i
      WHERE i.ID IN (${ids.join(',')})
    `

    const result = await req.query(query)
    const rows = result.recordset

    // For POST4 items we need the price of the most recently received rental as of the rent-start
    // date. Fetch one row (latest ReturnDate) per item in a single query.
    const post4Ids = rows.filter((r: any) => (r.n ?? 0) >= 4).map((r: any) => r.ID)
    const lastReceivedByItem: Record<number, number> = {}
    if (post4Ids.length > 0) {
      const lrReq = pool.request()
      lrReq.input("RentStart", sql.VarChar, rentStart.toLocaleDateString("en-CA"))
      const lrResult = await lrReq.query(`
        SELECT ModelTypeID, Total
        FROM (
          SELECT ModelTypeID, Total,
                 ROW_NUMBER() OVER (PARTITION BY ModelTypeID
                   ORDER BY CAST(ReturnDate AS DATE) DESC, ID DESC) AS rn
          FROM Booking
          WHERE ModelTypeID IN (${post4Ids.join(',')})
            AND ReturnDate IS NOT NULL
            AND Total > 0
            AND CAST(ReturnDate AS DATE) <= CAST(@RentStart AS DATE)
        ) t
        WHERE t.rn = 1
      `)
      for (const r of lrResult.recordset as { ModelTypeID: number; Total: number }[]) {
        lastReceivedByItem[r.ModelTypeID] = r.Total
      }
    }

    // 3. Apply the shared pricing logic in JS (lightweight)
    const prices: Record<string, number> = {}
    const originalPrices: Record<string, number> = {}
    const { calculateRentalPrice: calcPrice } = await import("@/lib/rental-pricing-calc")
    const activeDiscounts = await getActiveProductDiscounts()

    for (const row of rows) {
      const res = calcPrice(
        row.cost,
        d,
        row.n ?? 0,
        false, // isExclusive
        {
          lastReceivedPrice: lastReceivedByItem[row.ID] ?? null,
          isLatest: (row.laterCount ?? 0) === 0,
        }
      )
      const id = String(row.ID)
      const discount = findDiscountForProduct(id, branchById.get(id) ?? null, activeDiscounts, "rent")
      if (discount) {
        prices[id] = applyProductDiscount(res.total, discount)
        originalPrices[id] = res.total
      } else {
        prices[id] = res.total
      }
    }

    return NextResponse.json({ success: true, prices, originalPrices })
  } catch (error: any) {
    console.error("❌ [Bulk Pricing] Error:", error?.message || error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
