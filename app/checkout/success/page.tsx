"use client"

import { useEffect, useState, Suspense } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, Package, Mail, Instagram, Phone, AlertCircle, Loader2 } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { useLocale } from "@/lib/locale-context"
import { useTranslation, TranslationKey } from "@/lib/translations"
import { useCart } from "@/lib/cart-context"

function CheckoutSuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams?.get("orderId")
  const { dispatch: cartDispatch } = useCart()
  const [orderDetails, setOrderDetails] = useState<any>(null)
  const [retryingPayment, setRetryingPayment] = useState(false)
  const [pollExhausted, setPollExhausted] = useState(false)

  // Fawry appends its result to the return URL. These params are UNSIGNED and a
  // customer can edit them, so they are used for one thing only: showing a
  // *more pessimistic* screen sooner. They can never mark an order paid — that
  // comes exclusively from our own record, set by the signed callback.
  // Fawry uses 200 for success; anything else (e.g. 9949) is a failure.
  const returnStatusCode = searchParams?.get("statusCode")
  const returnSaysFailed = Boolean(returnStatusCode && returnStatusCode !== "200")
  const { settings } = useLocale()
  const t = useTranslation(settings.language)

  useEffect(() => {
    if (orderId) {
      // Fetch actual order details from the public API
      fetch(`/api/orders/public/${orderId}`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setOrderDetails(data)
            // The cart only clears once the order is confirmed to exist, so an
            // abandoned Fawry payment leaves the customer's cart intact.
            cartDispatch({ type: "CLEAR_CART" })
          } else {
            // Fallback for demo or if fetch fails
            setOrderDetails({
              id: orderId,
              estimatedDelivery: "15 to 20 days",
              items: [],
            })
          }
        })
        .catch(e => {
          console.error("Failed to fetch order:", e)
          setOrderDetails({
            id: orderId,
            estimatedDelivery: "15 to 20 days",
          })
        })

      // Background sync Cloudinary and ERP
      const storedScreenshot = localStorage.getItem(`pending_screenshot_${orderId}`)
      
      fetch("/api/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          orderId, 
          paymentScreenshot: storedScreenshot || undefined 
        }),
      })
      .then(() => {
        if (storedScreenshot) localStorage.removeItem(`pending_screenshot_${orderId}`)
      })
      .catch(e => console.error("Background sync failed:", e))
    }
  }, [orderId])

  // Fawry's callback usually lands within a few seconds of the customer being
  // redirected back, but the redirect can beat it. Poll our own record — never
  // the URL parameters — until it settles.
  const paymentStatus = orderDetails?.paymentStatus
  const isFawryPending = orderDetails?.paymentMethod === "fawry" && paymentStatus === "pending"

  // The customer is back in front of us on a still-unpaid Fawry order. Don't
  // wait for a callback that may never come (3DS errored, tab closed, back
  // button) — ask Fawry now and settle the order either way.
  useEffect(() => {
    if (!orderId || !isFawryPending) return
    let cancelled = false

    fetch("/api/payments/fawry/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    })
      .then(res => res.json())
      .then(data => {
        if (cancelled || !data?.changed) return
        // Re-read the order so the screen reflects the settled state.
        return fetch(`/api/orders/public/${orderId}`, { cache: "no-store" })
          .then(r => r.json())
          .then(fresh => { if (!cancelled && fresh && !fresh.error) setOrderDetails(fresh) })
      })
      .catch(e => console.error("Fawry sync failed:", e))

    return () => { cancelled = true }
  }, [orderId, isFawryPending])

  useEffect(() => {
    if (!orderId || !isFawryPending) return

    setPollExhausted(false)
    let attempts = 0
    const timer = setInterval(async () => {
      attempts += 1
      if (attempts > 10) {
        clearInterval(timer)
        // Stop claiming "confirming" forever. A payment that never confirms is
        // an unresolved payment, and the page has to say so.
        setPollExhausted(true)
        return
      }
      try {
        const res = await fetch(`/api/orders/public/${orderId}`, { cache: "no-store" })
        const data = await res.json()
        if (data && !data.error) {
          setOrderDetails(data)
          if (data.paymentStatus !== "pending") clearInterval(timer)
        }
      } catch {
        /* keep polling */
      }
    }, 3000)

    return () => clearInterval(timer)
  }, [orderId, isFawryPending])

  const retryPayment = async () => {
    if (!orderId) return
    setRetryingPayment(true)
    try {
      const res = await fetch("/api/payments/fawry/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (res.ok && data.redirectUrl) {
        window.location.href = data.redirectUrl
        return
      }
    } catch (e) {
      console.error("Retry payment failed:", e)
    }
    setRetryingPayment(false)
  }

  const isSaleOnly = orderDetails?.items?.every((item: any) => 
    item.branch === "sell-dresses" || item.type === "buy"
  )

  const hasRental = orderDetails?.items?.some((item: any) =>
    item.type === "rent" || (item.branch && item.branch !== "sell-dresses")
  )

  const isArabic = settings.language === "ar"

  // Precedence matters. Our own record always wins; the URL can only make the
  // screen more cautious, never more optimistic.
  //   approved            → confirmed
  //   rejected / expired  → failed
  //   pending + failure hint from Fawry's return URL → failed
  //   pending + polling gave up → unresolved (never a green tick)
  //   pending, still polling → "confirming"
  // Until the order has loaded we know nothing, and "nothing" must never render
  // as a green tick — that produced a real flash of "Order Confirmed!" before
  // the failure state appeared.
  const orderLoaded = Boolean(orderDetails)
  const isFawryOrder = orderDetails?.paymentMethod === "fawry"
  const isPaymentApproved = orderLoaded && orderDetails?.paymentStatus === "approved"
  const isPaymentFailed =
    !isPaymentApproved &&
    // Fawry told the browser it failed — trust that immediately, even before
    // the order loads. It can only ever make the screen more pessimistic.
    (returnSaysFailed ||
      (isFawryOrder && ["rejected", "expired"].includes(orderDetails?.paymentStatus)))
  const isPaymentUnresolved =
    isFawryOrder && !isPaymentApproved && !isPaymentFailed && isFawryPending && pollExhausted
  const isPaymentPending =
    !isPaymentApproved && !isPaymentFailed && orderLoaded && isFawryPending && !pollExhausted
  // Neutral state while the order is still being fetched — no verdict either way.
  const isLoadingOrder = !orderLoaded && !isPaymentFailed

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      <section className="pt-28 md:pt-24 pb-16">
        <div className="container mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8 }}
              className="mb-8"
            >
              {/* A green tick is shown only when OUR record says approved, which
                  only the signed Fawry callback can set. The redirect's status
                  params can bring the failure screen forward, never a success. */}
              {isLoadingOrder ? (
                <>
                  <Loader2 className="h-16 w-16 text-gray-300 mx-auto mb-6 animate-spin" />
                  <h1 className="text-3xl font-light tracking-wider mb-4">
                    {isArabic ? "جارٍ تحميل طلبك" : "Loading your order"}
                  </h1>
                </>
              ) : isPaymentFailed ? (
                <>
                  <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-6" />
                  <h1 className="text-3xl font-light tracking-wider mb-4">
                    {isArabic ? "لم تكتمل عملية الدفع" : "Payment not completed"}
                  </h1>
                  <p className="text-gray-600 text-lg mb-4">
                    {isArabic
                      ? "تم حفظ طلبك ولكن لم يتم استلام الدفع. يمكنك المحاولة مرة أخرى."
                      : "Your order is saved, but we haven't received the payment. You can try again."}
                  </p>
                  <Button
                    onClick={retryPayment}
                    disabled={retryingPayment}
                    className="bg-black text-white hover:bg-gray-800 rounded-full px-8"
                  >
                    {retryingPayment
                      ? (isArabic ? "جارٍ التحويل..." : "Redirecting…")
                      : (isArabic ? "إعادة محاولة الدفع" : "Retry payment")}
                  </Button>
                </>
              ) : isPaymentUnresolved ? (
                <>
                  <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-6" />
                  <h1 className="text-3xl font-light tracking-wider mb-4">
                    {isArabic ? "لم يتم تأكيد الدفع بعد" : "Payment not confirmed"}
                  </h1>
                  <p className="text-gray-600 text-lg mb-4">
                    {isArabic
                      ? "لم نستلم تأكيداً من فوري لهذا الطلب. إذا تم خصم المبلغ فسيتم تأكيد طلبك تلقائياً، وإلا يمكنك إعادة المحاولة أو التواصل معنا."
                      : "We haven't received confirmation from Fawry for this order. If you were charged, it will be confirmed automatically — otherwise you can try again or contact us."}
                  </p>
                  <Button
                    onClick={retryPayment}
                    disabled={retryingPayment}
                    className="bg-black text-white hover:bg-gray-800 rounded-full px-8"
                  >
                    {retryingPayment
                      ? (isArabic ? "جارٍ التحويل..." : "Redirecting…")
                      : (isArabic ? "إعادة محاولة الدفع" : "Retry payment")}
                  </Button>
                </>
              ) : isPaymentPending ? (
                <>
                  <Loader2 className="h-16 w-16 text-rose-400 mx-auto mb-6 animate-spin" />
                  <h1 className="text-3xl font-light tracking-wider mb-4">
                    {isArabic ? "جارٍ تأكيد الدفع" : "Confirming your payment"}
                  </h1>
                  <p className="text-gray-600 text-lg mb-4">
                    {isArabic
                      ? "تم استلام طلبك. ننتظر تأكيد فوري لعملية الدفع — قد يستغرق ذلك لحظات."
                      : "We've received your order and are waiting for Fawry to confirm the payment. This usually takes a few moments."}
                  </p>
                </>
              ) : (
                <>
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
                  <h1 className="text-3xl font-light tracking-wider mb-4">{t("orderConfirmed" as TranslationKey)}</h1>
                  <p className="text-gray-600 text-lg mb-4">
                    {t("thankYouPurchase" as TranslationKey)}
                  </p>
                </>
              )}
            </motion.div>

            {orderDetails && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                <Card className="border-0 shadow-lg mb-8">
                  <CardHeader>
                    <CardTitle>{t("orderSummary" as TranslationKey)}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4 text-left">
                      <div>
                        <p className="text-sm text-gray-600">{t("orderId" as TranslationKey, { id: "" }).replace("#", "").trim()}</p>
                        <p className="font-medium">{orderDetails.id}</p>
                      </div>
                      
                      {hasRental && (
                        <div className="space-y-4 col-span-full border-t pt-4 mt-2">
                          <h4 className="font-medium flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            {t("rentalDetails" as TranslationKey)}
                          </h4>
                          {orderDetails.items?.filter((item: any) => item.type === "rent" || (item.branch && item.branch !== "sell-dresses")).map((item: any, idx: number) => (
                            <div key={idx} className="bg-gray-50 p-3 rounded-lg flex flex-col gap-1">
                              <div className="flex justify-between items-start">
                                <p className="font-medium text-sm">{item.name}</p>
                                {item.isExclusive && (
                                  <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider border border-amber-200">
                                    {t("exclusiveHold" as TranslationKey)}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-4 mt-1">
                                <div>
                                  <p className="text-xs text-gray-500 uppercase tracking-wider">{t("receiveDate" as TranslationKey)}</p>
                                  <p className="text-sm font-semibold text-rose-600">
                                    {item.rentStart ? new Date(item.rentStart).toLocaleDateString(settings.language === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '---'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 uppercase tracking-wider">{t("returnDate" as TranslationKey)}</p>
                                  <p className="text-sm font-semibold text-rose-600">
                                    {item.rentEnd ? new Date(item.rentEnd).toLocaleDateString(settings.language === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '---'}
                                  </p>
                                </div>
                              </div>
                              {item.branch && (
                                <p className="text-xs text-gray-500 mt-2 italic">
                                  Pickup from: {item.branch}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            <div className="mb-8" />

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  variant="outline"
                  className="border-black text-black hover:bg-black hover:text-white bg-transparent"
                  onClick={() => router.push("/account")}
                >
                  {t("trackYourOrder" as TranslationKey)}
                </Button>
                <Button
                  className="bg-black text-white hover:bg-gray-800"
                  onClick={() => router.push("/soiree/products")}
                >
                  {t("continueShopping" as TranslationKey)}
                </Button>
              </div>

              <div className="text-sm text-gray-600 space-y-4 pt-4 border-t border-gray-200">
                <p>
                  {t("needHelpContactUs" as TranslationKey, {
                    email: t("contactEmail" as TranslationKey),
                    whatsapp: t("phoneWhatsAppDisplay" as TranslationKey)
                  })}
                </p>

                <div className="flex justify-center space-x-4">
                  <a
                    href={`mailto:${t("contactEmail" as TranslationKey)}`}
                    className="group"
                  >
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg">
                      <Mail className="h-4 w-4 text-gray-700" />
                    </div>
                  </a>
                  <a
                    href={`https://wa.me/${t("phoneWhatsApp" as TranslationKey)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg">
                      <Phone className="h-4 w-4 text-white" />
                    </div>
                  </a>
                  <a
                    href={t("instagramLink" as TranslationKey)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg">
                      <Instagram className="h-4 w-4 text-white" />
                    </div>
                  </a>
                  <a
                    href={t("tiktokLink" as TranslationKey)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg">
                      <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                      </svg>
                    </div>
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
      </div>
    }>
      <CheckoutSuccessContent />
    </Suspense>
  )
}
