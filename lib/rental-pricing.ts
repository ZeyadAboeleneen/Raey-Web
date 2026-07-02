import "server-only"
import { getMssqlPool, sql } from "@/lib/mssql"
import { MIN_RENTAL_PRICE } from "@/lib/rental-pricing-calc"

const round100 = (val: number) => Math.round(val / 100) * 100

export interface RentalPricingInput {
  productId: string
  rentStart: Date
  rentEnd: Date
  bookingDate?: Date
  isExclusive: boolean
}

export interface RentalPricingOutput {
  total: number
  category: string
  formula: string
  cost: number
  n: number
  d: number
}

export async function calculateRentalPrice(
  input: RentalPricingInput,
  txn?: InstanceType<typeof sql.Transaction>,
): Promise<RentalPricingOutput> {
  const { productId, rentStart, rentEnd, bookingDate, isExclusive } = input
  const modelTypeId = parseInt(productId, 10)

  if (isNaN(modelTypeId)) throw new Error(`Invalid productId: ${productId}`)

  const msPerDay = 1000 * 60 * 60 * 24
  const actualBookingDate = bookingDate || new Date()
  const startDay = new Date(rentStart)
  startDay.setHours(0, 0, 0, 0)

  const bookDay = new Date(actualBookingDate)
  bookDay.setHours(0, 0, 0, 0)

  const d = Math.max(1, Math.round((startDay.getTime() - bookDay.getTime()) / msPerDay))
  const rentStartStr = startDay.toLocaleDateString("en-CA")
  const makeRequest = () => {
    if (txn) return new sql.Request(txn)
    return getMssqlPool().then((pool) => pool.request())
  }

  // 1. Get cost (Item_buypric) from Items table
  const itemReq = await makeRequest()
  const itemResult = await itemReq
    .input("ModelTypeID", sql.Int, modelTypeId)
    .query(`SELECT Item_buypric FROM Items WHERE ID = @ModelTypeID`)

  if (!itemResult.recordset.length) throw new Error(`Item not found in MSSQL: ${modelTypeId}`)
  const cost: number = itemResult.recordset[0].Item_buypric

  if (!cost || cost <= 0) throw new Error(`Invalid Item_buypric for item ${modelTypeId}: ${cost}`)

  // 2. Count previous RECEIVED rentals as of this booking's pickup (rent-start) date (n).
  //    A rental only counts once it has been returned on/before the day this new rental starts,
  //    so a booking placed before an earlier rental is returned still sees the lower count.
  const countReq = await makeRequest()
  const rentalCountResult = await countReq
    .input("ModelTypeID", sql.Int, modelTypeId)
    .input("RentStart", sql.VarChar, rentStartStr)
    .query(`
      SELECT COUNT(*) AS n
      FROM Booking
      WHERE ModelTypeID = @ModelTypeID
        AND ReturnDate IS NOT NULL
        AND CAST(ReturnDate AS DATE) <= CAST(@RentStart AS DATE)
    `)
  const n: number = rentalCountResult.recordset[0].n

  // pricing rules
  let total: number
  let category: string
  let formula: string

  if (isExclusive) {
    total = round100(cost * 1.1)
    category = "F"
    formula = `cost(${cost}) × 1.1`
  } else if (n < 4) {
    if (d <= 15) {
      total = round100(cost * 0.8)
      category = "A"
      formula = `cost(${cost}) × 0.8`
    } else {
      const multiplier = 0.8 - (0.2 / 15) * (d - 15)
      category = d <= 30 ? "B" : "C"
      total = Math.round((cost * multiplier) / 50) * 50
      formula = `cost(${cost}) × ${multiplier.toFixed(4)}`
    }
  } else {
    // POST4 (5th rental onward): anchor to the price of the most recently RECEIVED rental as of
    // this booking's pickup date, dropping 500 only when this booking extends the queue past every
    // existing booking. A booking that slots in before an already-scheduled later rental just
    // matches the last received price (no decrement).
    const lastReq = await makeRequest()
    const lastResult = await lastReq
      .input("ModelTypeID", sql.Int, modelTypeId)
      .input("RentStart", sql.VarChar, rentStartStr)
      .query(`
        SELECT TOP 1 Total
        FROM Booking
        WHERE ModelTypeID = @ModelTypeID
          AND ReturnDate IS NOT NULL
          AND Total > 0
          AND CAST(ReturnDate AS DATE) <= CAST(@RentStart AS DATE)
        ORDER BY CAST(ReturnDate AS DATE) DESC, ID DESC
      `)
    const lastReceivedPrice: number | null = lastResult.recordset.length
      ? lastResult.recordset[0].Total
      : null

    // Is this the latest booking in the queue? (no existing booking starts after this one's pickup)
    const laterReq = await makeRequest()
    const laterResult = await laterReq
      .input("ModelTypeID", sql.Int, modelTypeId)
      .input("RentStart", sql.VarChar, rentStartStr)
      .query(`
        SELECT COUNT(*) AS c
        FROM Booking
        WHERE ModelTypeID = @ModelTypeID
          AND ReceivedDate IS NOT NULL
          AND CAST(ReceivedDate AS DATE) > CAST(@RentStart AS DATE)
      `)
    const isLatest = (laterResult.recordset[0].c ?? 0) === 0

    const base =
      lastReceivedPrice && lastReceivedPrice > 0 ? lastReceivedPrice : round100(cost * 0.8)
    total = isLatest ? base - 500 : base
    category = "POST4"
    formula = isLatest
      ? `last received(${base}) − 500`
      : `last received(${base}) — gap-fill, no decrement`
  }
  const floored = total < MIN_RENTAL_PRICE
  total = Math.max(total, MIN_RENTAL_PRICE)

  return {
    total,
    category: floored ? `${category}→FLOOR` : category,
    formula: floored ? `${formula} → floored to ${MIN_RENTAL_PRICE}` : formula,
    cost,
    n,
    d,
  }
}