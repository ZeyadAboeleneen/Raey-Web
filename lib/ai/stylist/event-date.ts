/**
 * lib/ai/stylist/event-date.ts
 *
 * Reads the day she needs the dress out of her own words.
 *
 * The conversation model is asked for this too, and reliably doesn't give it:
 * under the full system prompt it returns nothing for "my wedding is on 12
 * June 2027" even though the same model fills the field correctly against a
 * small schema. That is the same structured-field unreliability that has cost
 * this stylist a colour filter, its quick replies and its photo attributes —
 * so, as everywhere else here, the fact is derived deterministically and the
 * model's answer is kept only as a fallback.
 *
 * Handles what RAEY's customers actually type: English and Arabic month
 * names, Arabic-Indic digits, and plain numeric dates in day-first order (the
 * Egyptian convention).
 */

/** ٠١٢٣٤٥٦٧٨٩ and ۰۱۲۳۴۵۶۷۸۹ → 0123456789 */
function toWesternDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0)
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660
    return String(code - base)
  })
}

/** month name (any spelling we accept) → 1-12 */
const MONTHS: Record<string, number> = {}
const MONTH_NAMES: string[][] = [
  ["january", "jan", "يناير", "كانون الثاني"],
  ["february", "feb", "فبراير", "شباط"],
  ["march", "mar", "مارس", "آذار", "اذار"],
  ["april", "apr", "أبريل", "ابريل", "نيسان"],
  ["may", "مايو", "أيار", "ايار"],
  ["june", "jun", "يونيو", "يونيه", "حزيران"],
  ["july", "jul", "يوليو", "يوليه", "تموز"],
  ["august", "aug", "أغسطس", "اغسطس", "آب"],
  ["september", "sep", "sept", "سبتمبر", "أيلول", "ايلول"],
  ["october", "oct", "أكتوبر", "اكتوبر", "تشرين الأول"],
  ["november", "nov", "نوفمبر", "تشرين الثاني"],
  ["december", "dec", "ديسمبر", "كانون الأول"],
]
MONTH_NAMES.forEach((names, i) => names.forEach((n) => (MONTHS[n] = i + 1)))

const MONTH_PATTERN = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|")

/**
 * Unicode-aware word boundaries.
 *
 * JavaScript's `\b` is defined against ASCII \w, so it never fires next to
 * Arabic script — `\b(يونيو)\b` matches nothing at all. Every Arabic date
 * silently failed to parse until these replaced it, which for this shop is
 * most of them.
 */
const B0 = "(?<![\\p{L}\\p{N}])"
const B1 = "(?![\\p{L}\\p{N}])"

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  // Rejects the 31st of a 30-day month rather than silently rolling forward.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/**
 * When she names a day and month but no year, she means the next one coming.
 * "June 12" said in September means next June, not three months ago.
 */
function resolveYear(month: number, day: number, today: Date): number {
  const year = today.getUTCFullYear()
  const thisYear = Date.UTC(year, month - 1, day)
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return thisYear >= todayUtc ? year : year + 1
}

/**
 * Extracts an event date from a shopper's message, or null when she hasn't
 * given one. Never guesses: a bare month ("sometime in June") is not a date,
 * and a date already past is treated as a misread rather than honoured.
 */
export function parseEventDate(message: string, now: Date = new Date()): string | null {
  const text = toWesternDigits(String(message || "")).toLowerCase()
  if (!text) return null

  const candidates: string[] = []

  // 2027-06-12
  for (const m of text.matchAll(new RegExp(`${B0}(\\d{4})-(\\d{1,2})-(\\d{1,2})${B1}`, "gu"))) {
    const value = iso(Number(m[1]), Number(m[2]), Number(m[3]))
    if (value) candidates.push(value)
  }

  // 12 June 2027 / ٢٠ يونيو
  const dayFirst = new RegExp(
    `${B0}(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_PATTERN})${B1}(?:\\s*,?\\s*(\\d{4}))?`,
    "giu"
  )
  for (const m of text.matchAll(dayFirst)) {
    const day = Number(m[1])
    const month = MONTHS[m[2].toLowerCase()]
    const year = m[3] ? Number(m[3]) : resolveYear(month, day, now)
    const value = iso(year, month, day)
    if (value) candidates.push(value)
  }

  // June 12 / June 12th, 2027 / يونيو ١٢
  const monthFirst = new RegExp(
    `${B0}(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?${B1}(?:\\s*,?\\s*(\\d{4}))?`,
    "giu"
  )
  for (const m of text.matchAll(monthFirst)) {
    const month = MONTHS[m[1].toLowerCase()]
    const day = Number(m[2])
    const year = m[3] ? Number(m[3]) : resolveYear(month, day, now)
    const value = iso(year, month, day)
    if (value) candidates.push(value)
  }

  // 12/6/2027 — day first, the Egyptian convention. A bare 12/6 is skipped:
  // too ambiguous to act on when getting it wrong hides gowns she could have.
  for (const m of text.matchAll(
    new RegExp(`${B0}(\\d{1,2})[\\/.-](\\d{1,2})[\\/.-](\\d{4})${B1}`, "gu")
  )) {
    const value = iso(Number(m[3]), Number(m[2]), Number(m[1]))
    if (value) candidates.push(value)
  }

  // A date in the past is a misparse, not a wedding — never filter on it.
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const future = candidates.filter((c) => Date.parse(`${c}T00:00:00Z`) >= todayUtc)

  return future.length > 0 ? future[0] : null
}
