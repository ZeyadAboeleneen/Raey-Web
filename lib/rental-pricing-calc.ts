export interface RentalPricingResult {
    total: number
    category: string
    formula: string
}
export const MIN_RENTAL_PRICE = 3000

const round100 = (val: number) => Math.round(val / 100) * 100

export interface Post4Input {
    lastReceivedPrice?: number | null  // Total of the most recent rental received by the rent-start date
    isLatest?: boolean                 // true if no existing booking starts after this one's pickup
}

export function calculateRentalPrice(
    cost: number,
    d: number,           // days between booking date and rent start (min 1)
    n: number,           // number of rentals RECEIVED by the rent-start date
    isExclusive: boolean,
    post4: Post4Input = {},
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
        // POST4 (5th rental onward): anchor to the most recent received rental's price; drop 500
        // only when this booking extends the queue past every existing booking, otherwise match it.
        const base =
            post4.lastReceivedPrice && post4.lastReceivedPrice > 0
                ? post4.lastReceivedPrice
                : round100(cost * 0.8) // fallback if no received price available
        total = post4.isLatest ? base - 500 : base
        category = "POST4"
        formula = post4.isLatest
            ? `last received(${base}) − 500`
            : `last received(${base}) — gap-fill, no decrement`
    }

    const floored = total < MIN_RENTAL_PRICE
    total = Math.max(total, MIN_RENTAL_PRICE)

    return {
        total,
        category,
        formula: floored ? `${formula} → floored to ${MIN_RENTAL_PRICE}` : formula,
    }
}