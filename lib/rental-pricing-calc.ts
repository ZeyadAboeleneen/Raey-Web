// Pure pricing calculation — no DB, safe to import on client or server
// NOTE: Discounts effectively stop at 3,000 EGP. No rental can ever be priced below this floor.

export interface RentalPricingResult {
    total: number
    category: string
    formula: string
}

/** Minimum rental price — business rule: price must never go below 3,000 EGP */
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
    } else {
        // All non-exclusive rentals follow date-based A/B/C pricing
        const multiplier = d <= 15 ? 0.8 : (0.8 - (0.2 / 15) * (d - 15))
        category = d <= 15 ? "A" : (d <= 30 ? "B" : "C")
        
        if (d <= 15) {
            total = round100(cost * 0.8)
            formula = "cost × 0.8"
        } else {
            total = Math.round((cost * multiplier) / 50) * 50
            formula = `cost × ${multiplier.toFixed(4)}`
        }
    }

    // Apply minimum floor — price must never go below 3,000 EGP
    const floored = total < MIN_RENTAL_PRICE
    total = Math.max(total, MIN_RENTAL_PRICE)

    return {
        total,
        category,
        formula: floored ? `${formula} → floored to ${MIN_RENTAL_PRICE}` : formula,
    }
}