import { type NextRequest, NextResponse } from "next/server"
import { getMssqlPool, sql } from "@/lib/mssql"
import { calculateRentalPrice } from "@/lib/rental-pricing"

export const maxDuration = 60
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productIds, occasionDate } = body

    if (!productIds || !Array.isArray(productIds)) {
      return NextResponse.json({ error: "productIds must be an array" }, { status: 400 })
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
    const ids = productIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
    if (ids.length === 0) return NextResponse.json({ success: true, prices: {} })

    // 2. Optimized SQL to calculate dynamic parameters for all items
    // d is constant for the whole request since occasionDate is the same
    const msPerDay = 1000 * 60 * 60 * 24
    const startDay = new Date(rentStart)
    startDay.setHours(0,0,0,0)
    const bookDay = new Date(bookingDate)
    bookDay.setHours(0,0,0,0)
    const d = Math.max(1, Math.round((startDay.getTime() - bookDay.getTime()) / msPerDay))

    const query = `
      WITH TargetItems AS (
        SELECT ID, Item_buypric as cost 
        FROM Items 
        WHERE ID IN (${ids.join(',')})
      ),
      RentalHistory AS (
        SELECT 
          b.ModelTypeID,
          b.Total,
          b.ReturnDate,
          ROW_NUMBER() OVER (PARTITION BY b.ModelTypeID ORDER BY b.ReturnDate ASC) as rn
        FROM Booking b
        WHERE b.ReturnDate IS NOT NULL 
          AND CAST(b.ReturnDate AS DATE) <= CAST(@RentStart AS DATE)
          AND b.ModelTypeID IN (${ids.join(',')})
      ),
      Stats AS (
        SELECT 
          ModelTypeID,
          COUNT(*) as n
        FROM RentalHistory
        GROUP BY ModelTypeID
      ),
      First4Min AS (
        SELECT ModelTypeID, MIN(Total) as pMin
        FROM RentalHistory
        WHERE rn <= 4 AND Total > 0
        GROUP BY ModelTypeID
      )
      SELECT 
        ti.ID,
        ti.cost,
        ISNULL(s.n, 0) as n,
        ISNULL(f4.pMin, 0) as pMin
      FROM TargetItems ti
      LEFT JOIN Stats s ON s.ModelTypeID = ti.ID
      LEFT JOIN First4Min f4 ON f4.ModelTypeID = ti.ID
    `

    const result = await req.query(query)
    const rows = result.recordset

    // 3. Apply the shared pricing logic in JS (lightweight)
    const prices: Record<string, number> = {}
    const { calculateRentalPrice: calcPrice, MIN_RENTAL_PRICE } = await import("@/lib/rental-pricing-calc")

    for (const row of rows) {
      const res = calcPrice(
        row.cost,
        d,
        row.n,
        false, // isExclusive
        row.pMin > 0 ? [row.pMin] : [] // if pMin exists, pass it as the reference price
      )
      prices[String(row.ID)] = res.total
    }

    return NextResponse.json({ success: true, prices })
  } catch (error: any) {
    console.error("❌ [Bulk Pricing] Error:", error?.message || error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
