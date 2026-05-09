import "server-only"
import { getMssqlPool, sql } from "@/lib/mssql"
import { MIN_RENTAL_PRICE } from "@/lib/rental-pricing-calc"

const round100 = (val: number) => Math.round(val / 100) * 100

export interface RentalPricingInput {
  productId: string
  /** Start of rental period (ReceivedDate) */
  rentStart: Date
  /** End of rental period (ReturnDate) */
  rentEnd: Date
  /** Date the booking is made (BookingDate). Defaults to today if not provided. */
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

/**
 * Calculate rental price server-side using MSSQL data.
 *
 * CRITICAL: This function supports running inside an existing MSSQL transaction
 * to prevent race conditions. When `txn` is provided, all queries run inside
 * that transaction — ensuring `n` is read and the booking is inserted atomically.
 *
 * @param input  Pricing parameters (productId, rentStart, rentEnd, isExclusive)
 * @param txn    Optional MSSQL Transaction — pass this from the order handler
 */
export async function calculateRentalPrice(
  input: RentalPricingInput,
  txn?: InstanceType<typeof sql.Transaction>,
): Promise<RentalPricingOutput> {
  const { productId, rentStart, rentEnd, bookingDate, isExclusive } = input
  const modelTypeId = parseInt(productId, 10)

  if (isNaN(modelTypeId)) throw new Error(`Invalid productId: ${productId}`)

  // d = days between BookingDate and ReceivedDate (rentStart)
  const msPerDay = 1000 * 60 * 60 * 24
  const actualBookingDate = bookingDate || new Date()

  // Normalize dates to midnight to calculate exact calendar days difference
  const startDay = new Date(rentStart)
  startDay.setHours(0, 0, 0, 0)

  const bookDay = new Date(actualBookingDate)
  bookDay.setHours(0, 0, 0, 0)

  const d = Math.max(1, Math.round((startDay.getTime() - bookDay.getTime()) / msPerDay))

  // Format rentStart as YYYY-MM-DD string to prevent UTC timezone shifts in MSSQL
  const rentStartStr = startDay.toLocaleDateString("en-CA") // "YYYY-MM-DD"

  // Use transaction request if available, otherwise pool request
  const makeRequest = () => {
    if (txn) return new sql.Request(txn)
    // Fallback: not inside a transaction (e.g., pricing preview API)
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

  // 2. Count previous completed rentals for this dress (n)
  //    NOTE: Inside a transaction, this read is serialized — preventing race conditions
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

  // 3. Apply pricing rules
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
      // Sliding scale: days 16–45
      const multiplier = 0.8 - (0.2 / 15) * (d - 15)
      category = d <= 30 ? "B" : "C"
      total = Math.round((cost * multiplier) / 50) * 50
      formula = `cost(${cost}) × ${multiplier.toFixed(4)}`
    }
  } else {
    // n >= 4: POST4 pricing — P_min dynamically from ACTUAL totals of first 4 bookings
    const pMinReq = await makeRequest()
    const pMinResult = await pMinReq
      .input("ModelTypeID", sql.Int, modelTypeId)
      .input("RentStart", sql.VarChar, rentStartStr)
      .query(`
        WITH First4 AS (
          SELECT TOP 4 BookingDate, ReceivedDate, Total
          FROM Booking
          WHERE ModelTypeID = @ModelTypeID
            AND ReturnDate IS NOT NULL
            AND CAST(ReturnDate AS DATE) <= CAST(@RentStart AS DATE)
          ORDER BY ReturnDate ASC
        )
        SELECT Total FROM First4
      `)

    let pMin = round100(cost * 0.8) // fallback to Cat A
    if (pMinResult.recordset.length > 0) {
      // Use the actual lowest Total it was previously rented for
      const actualPrices = pMinResult.recordset.map((row: any) => row.Total).filter(t => t > 0);
      if (actualPrices.length > 0) {
        pMin = Math.min(...actualPrices);
      }
    }

    total = pMin - 500 * (n - 3)
    category = "POST4"
    formula = `P_min(${pMin}) − 500 × (${n} − 3)`
  }

  // 4. Apply minimum floor — price must NEVER go below 3,000 EGP
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