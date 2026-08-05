import "server-only"
import crypto from "crypto"

/**
 * FawryPay integration — hosted checkout (Express Checkout "Checkout Link").
 *
 * Security model, in short:
 *   - The secure key never leaves the server. It is read from env here and
 *     nowhere else; no NEXT_PUBLIC_ variable may ever hold it.
 *   - The browser's return URL is presentation only. Payment state is only ever
 *     changed by the signed server-to-server callback, or by our own poll of
 *     Get Payment Status V2.
 *   - Every signature comparison is constant-time.
 *
 * Signature formulas are taken verbatim from the FawryPay docs:
 *   Charge request:  merchantCode + merchantRefNum + customerProfileId + returnUrl
 *                    + foreach(item sorted by itemId){ itemId + quantity + price(2dp) }
 *                    + secureKey
 *   Callback:        fawryRefNumber + merchantRefNum + paymentAmount(2dp)
 *                    + orderAmount(2dp) + orderStatus + paymentMethod
 *                    + paymentRefrenceNumber("" if absent) + secureKey
 *   Status query:    merchantCode + merchantRefNumber + secureKey
 */

// ── Configuration ────────────────────────────────────────────────────

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not configured. Fawry payments cannot run without it — set it in .env (server-side only).`,
    )
  }
  return value
}

export function getFawryConfig() {
  const baseUrl = (process.env.FAWRY_BASE_URL || "https://atfawry.fawrystaging.com").replace(/\/+$/, "")
  return {
    baseUrl,
    merchantCode: requiredEnv("FAWRY_MERCHANT_CODE"),
    secureKey: requiredEnv("FAWRY_SECURE_KEY"),
    /**
     * Path of the hosted-checkout init endpoint. Overridable because Fawry has
     * shipped this under more than one path across account types — confirm the
     * exact one for this merchant against the integration email before go-live.
     */
    initPath: process.env.FAWRY_INIT_PATH || "/ECommerceWeb/api/payments/init",
    statusPath: process.env.FAWRY_STATUS_PATH || "/ECommerceWeb/Fawry/payments/status/v2",
    refundPath: process.env.FAWRY_REFUND_PATH || "/ECommerceWeb/Fawry/payments/refund",
    /** Public origin used to build returnUrl / webhook URLs. */
    appUrl: (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/+$/, ""),
    currency: "EGP",
  }
}

/** Is Fawry configured at all — used to fail closed without throwing at import time. */
export function isFawryConfigured(): boolean {
  return Boolean(process.env.FAWRY_MERCHANT_CODE && process.env.FAWRY_SECURE_KEY)
}

/**
 * Attempt 2+ of a retry gets its own merchantRefNum — `${orderId}~${attempt}`
 * — so Fawry's hosted page treats it as a genuinely new transaction instead
 * of resuming state (session/3DS enrollment) tied to the first attempt's
 * reference. Attempt 1 keeps the bare orderId, unchanged.
 *
 * `~` is safe as a delimiter: order ids are generated as `ORD-<digits>-<code>`
 * (see /api/orders) and never contain it.
 */
export function buildAttemptMerchantRef(orderId: string, attemptNumber: number): string {
  return attemptNumber > 1 ? `${orderId}~${attemptNumber}` : orderId
}

/** Inverse of buildAttemptMerchantRef — recovers the real order id from
 *  whatever merchantRefNum Fawry echoes back, whether or not it carries an
 *  attempt suffix. */
export function baseOrderIdFromMerchantRef(merchantRefNum: string): string {
  const idx = merchantRefNum.indexOf("~")
  return idx === -1 ? merchantRefNum : merchantRefNum.slice(0, idx)
}

// ── Primitives ───────────────────────────────────────────────────────

const sha256 = (input: string) => crypto.createHash("sha256").update(input, "utf8").digest("hex")

/** Fawry hashes money as a fixed two-decimal string: 10 → "10.00". */
export function money2(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : Number(value ?? 0)
  if (!isFinite(n)) return "0.00"
  return n.toFixed(2)
}

/** Constant-time compare that tolerates case and length differences safely. */
export function safeCompareHex(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(String(a).trim().toLowerCase(), "utf8")
  const bufB = Buffer.from(String(b).trim().toLowerCase(), "utf8")
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// ── Charge request ───────────────────────────────────────────────────

export interface FawryChargeItem {
  itemId: string
  description: string
  price: number
  quantity: number
  imageUrl?: string
}

export interface BuildChargeRequestInput {
  merchantRefNum: string
  customerProfileId?: string | null
  customerName?: string
  customerMobile?: string
  customerEmail?: string
  items: FawryChargeItem[]
  returnUrl: string
  webhookUrl?: string
  language?: "en-gb" | "ar-eg"
  /** Epoch ms after which the payment link stops working. */
  paymentExpiry?: number
}

/**
 * Signature over the charge request.
 * Items must be sorted by itemId, and each contributes itemId + quantity + price(2dp).
 */
export function buildChargeSignature(input: {
  merchantCode: string
  merchantRefNum: string
  customerProfileId?: string | null
  returnUrl: string
  items: FawryChargeItem[]
  secureKey: string
}): string {
  const sortedItems = [...input.items].sort((a, b) => String(a.itemId).localeCompare(String(b.itemId)))
  const itemsPart = sortedItems
    .map((item) => `${item.itemId}${item.quantity}${money2(item.price)}`)
    .join("")

  const raw =
    input.merchantCode +
    input.merchantRefNum +
    (input.customerProfileId ? String(input.customerProfileId) : "") +
    input.returnUrl +
    itemsPart +
    input.secureKey

  return sha256(raw)
}

export function buildChargeRequest(input: BuildChargeRequestInput) {
  const config = getFawryConfig()

  const chargeItems = input.items.map((item) => ({
    itemId: String(item.itemId),
    description: (item.description || "Item").slice(0, 150),
    price: Number(money2(item.price)),
    quantity: Math.max(1, Math.floor(item.quantity)),
    ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
  }))

  const signature = buildChargeSignature({
    merchantCode: config.merchantCode,
    merchantRefNum: input.merchantRefNum,
    customerProfileId: input.customerProfileId,
    returnUrl: input.returnUrl,
    items: chargeItems,
    secureKey: config.secureKey,
  })

  return {
    merchantCode: config.merchantCode,
    merchantRefNum: input.merchantRefNum,
    ...(input.customerProfileId ? { customerProfileId: String(input.customerProfileId) } : {}),
    ...(input.customerName ? { customerName: input.customerName.slice(0, 100) } : {}),
    ...(input.customerMobile ? { customerMobile: input.customerMobile } : {}),
    ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
    language: input.language || "en-gb",
    chargeItems,
    returnUrl: input.returnUrl,
    ...(input.webhookUrl ? { orderWebHookUrl: input.webhookUrl } : {}),
    ...(input.paymentExpiry ? { paymentExpiry: input.paymentExpiry } : {}),
    authCaptureModePayment: false,
    signature,
  }
}

export interface FawryInitResult {
  ok: boolean
  redirectUrl?: string
  statusCode?: number
  error?: string
  raw?: unknown
}

/**
 * Create the hosted checkout session. Returns the URL to redirect the customer to.
 * Fawry replies with either a bare URL string or a JSON envelope depending on
 * account configuration, so both are handled.
 */
export async function initHostedCheckout(
  request: ReturnType<typeof buildChargeRequest>,
  timeoutMs = 20000,
): Promise<FawryInitResult> {
  const config = getFawryConfig()
  const url = `${config.baseUrl}${config.initPath}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/plain" },
      body: JSON.stringify(request),
      signal: controller.signal,
      cache: "no-store",
    })

    const text = await response.text()

    if (!response.ok) {
      return { ok: false, statusCode: response.status, error: text.slice(0, 500) }
    }

    const trimmed = text.trim()

    // Plain URL response.
    if (trimmed.startsWith("http")) {
      return { ok: true, redirectUrl: trimmed.replace(/^"|"$/g, ""), raw: trimmed }
    }

    try {
      const json = JSON.parse(trimmed)
      const redirectUrl =
        json.redirectUrl || json.nextAction?.redirectUrl || json.paymentUrl || json.data
      if (typeof redirectUrl === "string" && redirectUrl.startsWith("http")) {
        return { ok: true, redirectUrl, raw: json }
      }
      return {
        ok: false,
        statusCode: json.statusCode,
        error: json.statusDescription || json.message || "Fawry did not return a redirect URL",
        raw: json,
      }
    } catch {
      return { ok: false, error: "Unparseable response from Fawry", raw: trimmed.slice(0, 500) }
    }
  } catch (error: any) {
    if (error?.name === "AbortError") return { ok: false, error: "Fawry request timed out" }
    return { ok: false, error: error?.message || "Fawry request failed" }
  } finally {
    clearTimeout(timer)
  }
}

// ── Callback verification ────────────────────────────────────────────

export interface FawryCallbackPayload {
  requestId?: string
  fawryRefNumber?: string
  merchantRefNumber?: string
  customerName?: string
  customerMobile?: string
  customerMail?: string
  customerMerchantId?: string
  paymentAmount?: number | string
  orderAmount?: number | string
  fawryFees?: number | string
  shippingFees?: number | string
  orderStatus?: string
  paymentMethod?: string
  paymentTime?: number | string
  authNumber?: string
  paymentRefrenceNumber?: string
  orderExpiryDate?: number | string
  orderItems?: unknown
  failureErrorCode?: string
  failureReason?: string
  messageSignature?: string
  [key: string]: unknown
}

/**
 * Recompute the callback signature.
 *
 * Note the doc's caveat: for order-creation notifications there is no payment
 * reference number and that element contributes an empty string.
 */
export function buildCallbackSignature(payload: FawryCallbackPayload, secureKey: string): string {
  const raw =
    String(payload.fawryRefNumber ?? "") +
    String(payload.merchantRefNumber ?? "") +
    money2(payload.paymentAmount) +
    money2(payload.orderAmount) +
    String(payload.orderStatus ?? "") +
    String(payload.paymentMethod ?? "") +
    String(payload.paymentRefrenceNumber ?? "") +
    secureKey

  return sha256(raw)
}

export function verifyCallbackSignature(payload: FawryCallbackPayload): boolean {
  const { secureKey } = getFawryConfig()
  return safeCompareHex(buildCallbackSignature(payload, secureKey), String(payload.messageSignature ?? ""))
}

/**
 * A stable fingerprint of a provider event, used as the DB uniqueness key so a
 * redelivered callback collides instead of being applied twice. Built from the
 * fields that identify the event — not the whole body, whose incidental fields
 * may vary between deliveries of the same event.
 */
export function callbackEventHash(payload: FawryCallbackPayload): string {
  return sha256(
    [
      payload.fawryRefNumber ?? "",
      payload.merchantRefNumber ?? "",
      payload.orderStatus ?? "",
      money2(payload.paymentAmount),
      payload.paymentRefrenceNumber ?? "",
      payload.paymentTime ?? "",
    ].join("|"),
  )
}

// ── Status query (reconciliation) ────────────────────────────────────

export interface FawryStatusResult {
  ok: boolean
  paymentStatus?: string
  paymentAmount?: number
  orderAmount?: number
  paymentMethod?: string
  fawryRefNumber?: string
  paymentRefrenceNumber?: string
  signatureValid?: boolean
  error?: string
  raw?: any
}

/**
 * Pull the authoritative status for an order straight from Fawry.
 * Used to close the gap when a callback is never delivered.
 */
export async function getPaymentStatus(merchantRefNumber: string, timeoutMs = 15000): Promise<FawryStatusResult> {
  const config = getFawryConfig()
  const signature = sha256(config.merchantCode + merchantRefNumber + config.secureKey)

  const url = new URL(`${config.baseUrl}${config.statusPath}`)
  url.searchParams.set("merchantCode", config.merchantCode)
  url.searchParams.set("merchantRefNumber", merchantRefNumber)
  url.searchParams.set("signature", signature)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    })

    const text = await response.text()
    if (!response.ok) return { ok: false, error: text.slice(0, 500) }

    const json = JSON.parse(text)

    // The status response carries its own messageSignature, verified with the
    // same formula as the push callback.
    const signatureValid = json.messageSignature
      ? safeCompareHex(buildCallbackSignature(json, config.secureKey), String(json.messageSignature))
      : false

    return {
      ok: true,
      paymentStatus: json.paymentStatus || json.orderStatus,
      paymentAmount: json.paymentAmount != null ? Number(json.paymentAmount) : undefined,
      orderAmount: json.orderAmount != null ? Number(json.orderAmount) : undefined,
      paymentMethod: json.paymentMethod,
      fawryRefNumber: json.fawryRefNumber,
      paymentRefrenceNumber: json.paymentRefrenceNumber,
      signatureValid,
      raw: json,
    }
  } catch (error: any) {
    if (error?.name === "AbortError") return { ok: false, error: "Fawry status request timed out" }
    return { ok: false, error: error?.message || "Fawry status request failed" }
  } finally {
    clearTimeout(timer)
  }
}

// ── Refund ──────────────────────────────────────────────────────────

export interface FawryRefundResult {
  ok: boolean
  statusCode?: number
  statusDescription?: string
  error?: string
  raw?: any
}

/**
 * Refunds a previously paid Fawry transaction — this is the API call that
 * actually returns money to the customer's card. Distinct from any internal
 * ERP accounting reversal, which only affects our own bookkeeping and never
 * touches the customer's money.
 *
 * `referenceNumber` is Fawry's own reference for the paid transaction (the
 * `fawryRefNumber` recorded on the 'paid' ledger row), not our merchantRefNum.
 */
export async function refundPayment(input: {
  referenceNumber: string
  refundAmount: number
  reason?: string
  timeoutMs?: number
}): Promise<FawryRefundResult> {
  const config = getFawryConfig()
  const amount = money2(input.refundAmount)
  const reason = input.reason || ""

  const signature = sha256(
    config.merchantCode + input.referenceNumber + amount + reason + config.secureKey,
  )

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 15000)

  try {
    const response = await fetch(`${config.baseUrl}${config.refundPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
      body: JSON.stringify({
        merchantCode: config.merchantCode,
        referenceNumber: input.referenceNumber,
        refundAmount: Number(amount),
        ...(reason ? { reason } : {}),
        signature,
      }),
    })

    const text = await response.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      /* non-JSON error body, handled below */
    }

    if (!response.ok) {
      return { ok: false, statusCode: response.status, error: (json?.statusDescription || text).slice(0, 500), raw: json }
    }

    // Fawry signals refund failure via statusCode inside a 200 response too.
    const statusCode = json?.statusCode
    const ok = statusCode === undefined || statusCode === 200
    return {
      ok,
      statusCode,
      statusDescription: json?.statusDescription,
      error: ok ? undefined : json?.statusDescription,
      raw: json,
    }
  } catch (error: any) {
    if (error?.name === "AbortError") return { ok: false, error: "Fawry refund request timed out" }
    return { ok: false, error: error?.message || "Fawry refund request failed" }
  } finally {
    clearTimeout(timer)
  }
}

// ── Status mapping ───────────────────────────────────────────────────

export type PaymentTxnStatusValue =
  | "initiated" | "unpaid" | "paid" | "canceled" | "refunded" | "expired" | "failed"

/** Map Fawry's orderStatus onto our ledger enum. Unknown values fail closed. */
export function mapFawryStatus(orderStatus: string | undefined | null): PaymentTxnStatusValue {
  switch (String(orderStatus || "").toUpperCase()) {
    case "PAID":
      return "paid"
    case "UNPAID":
    case "NEW":
      return "unpaid"
    case "CANCELED":
    case "CANCELLED":
      return "canceled"
    case "REFUNDED":
    case "PARTIAL_REFUNDED":
      return "refunded"
    case "EXPIRED":
      return "expired"
    case "FAILED":
    case "DECLINED":
      return "failed"
    default:
      return "failed"
  }
}
