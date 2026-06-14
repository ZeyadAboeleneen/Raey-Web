export interface RentalPricingResult {
    total: number
    category: string
    formula: string
}
export const MIN_RENTAL_PRICE = 3000

const round100 = (val: number) => Math.round(val / 100) * 100

export function calculateRentalPrice(
    cost: number,
    d: number,           // days between booking date and rent start (min 1)
    n: number,           // number of previous completed rentals
    isExclusive: boolean,
    firstFourPrices: number[] = [],
): RentalPricingResult {
    d = Math.max(1, d)

    let total: number
    let category: string
    let formula: string

    if (isExclusive) {
        total = round100(cost * 1.1)
        category = "F"
        formula = "cost × 1.1"
    } else if (n < 4) {
        // First 4 rentals follow date-based A/B/C pricing
        const multiplier = d <= 15 ? 0.8 : (0.8 - (0.2 / 15) * (d - 15))
        category = d <= 15 ? "A" : (d <= 30 ? "B" : "C")

        if (d <= 15) {
            total = round100(cost * 0.8)
            formula = "cost × 0.8"
        } else {
            total = Math.round((cost * multiplier) / 50) * 50
            formula = `cost × ${multiplier.toFixed(4)}`
        }
    } else {
        // POST4 (5th rental onward): minimum of first 4 rental prices, dropping 500 per extra rental
        const pMin =
            firstFourPrices.length > 0
                ? Math.min(...firstFourPrices)
                : round100(cost * 0.8) // fallback if first-4 prices not provided
        total = pMin - 500 * (n - 3)
        category = "POST4"
        formula = `P_min(${pMin}) − 500 × (${n} − 3)`
    }

    const floored = total < MIN_RENTAL_PRICE
    total = Math.max(total, MIN_RENTAL_PRICE)

    return {
        total,
        category,
        formula: floored ? `${formula} → floored to ${MIN_RENTAL_PRICE}` : formula,
    }
}