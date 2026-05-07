"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Truck, CreditCard, MapPin, Sparkles, Upload, ExternalLink, Phone, Landmark, Smartphone, CheckCircle2, X } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { useCart } from "@/lib/cart-context"
import { useAuth } from "@/lib/auth-context"
import { CheckoutProgress } from "@/components/checkout-progress"
import { OrderSummary } from "@/components/order-summary"
import { useLocale } from "@/lib/locale-context"
import { useTranslation } from "@/lib/translations"
import { useCurrencyFormatter } from "@/hooks/use-currency"

// Country name to code mapping
const COUNTRY_CODE_MAP: Record<string, string> = {
  "United States": "US",
  "Saudi Arabia": "SA",
  "United Arab Emirates": "AE",
  "Kuwait": "KW",
  "Qatar": "QA",
  "United Kingdom": "GB",
  "Egypt": "EG",
  "Oman": "OM",
  "Bahrain": "BH",
  "Iraq": "IQ",
  "Jordan": "JO",
  "Turkey": "TR",
  "Lebanon": "LB",
}

type PhoneCountryConfig = {
  dialCode: string
  minLength: number
  maxLength: number
}

const PHONE_COUNTRY_RULES: Record<string, PhoneCountryConfig> = {
  US: { dialCode: "+1", minLength: 10, maxLength: 10 },
  SA: { dialCode: "+966", minLength: 9, maxLength: 9 },
  AE: { dialCode: "+971", minLength: 9, maxLength: 9 },
  KW: { dialCode: "+965", minLength: 8, maxLength: 8 },
  QA: { dialCode: "+974", minLength: 8, maxLength: 8 },
  GB: { dialCode: "+44", minLength: 10, maxLength: 10 },
  EG: { dialCode: "+20", minLength: 10, maxLength: 11 },
  OM: { dialCode: "+968", minLength: 8, maxLength: 8 },
  BH: { dialCode: "+973", minLength: 8, maxLength: 8 },
  IQ: { dialCode: "+964", minLength: 10, maxLength: 10 },
  JO: { dialCode: "+962", minLength: 9, maxLength: 9 },
  TR: { dialCode: "+90", minLength: 10, maxLength: 10 },
  LB: { dialCode: "+961", minLength: 8, maxLength: 8 },
}

const COUNTRY_LABELS_BY_CODE: Record<string, string> = Object.entries(COUNTRY_CODE_MAP).reduce(
  (acc, [name, code]) => {
    acc[code] = name
    return acc
  },
  {} as Record<string, string>,
)

const PHONE_COUNTRY_OPTIONS = Object.entries(PHONE_COUNTRY_RULES).map(([code, config]) => ({
  code,
  label: `${COUNTRY_LABELS_BY_CODE[code] || code} (${config.dialCode})`,
  ...config,
}))

// Shipping costs by country (base currency units).
const getShippingCost = (countryCode: string): number => {
  if (!countryCode) return 0

  switch (countryCode) {
    case "EG":
      return 90
    case "SA":
    case "AE":
    case "KW":
    case "QA":
    case "OM":
    case "BH":
    case "IQ":
    case "JO":
    case "LB":
      return 130
    case "GB":
    case "US":
    case "TR":
      return 150
    default:
      return 150
  }
}

const BRANCH_ADDRESSES: Record<string, Record<string, string>> = {
  "el-raey-1": {
    en: "El Mansoura - El Mashaya - in front of El-Gezira sports club 2.",
    ar: "المنصورة - المشايه امام بوابه نادي الجزيره ٢",
  },
  "mona-saleh": {
    en: "El Mansoura – Hay El Gamea",
    ar: "المنصورة – حي الجامعة",
  },
  "el-raey-2": {
    en: "Cairo - Rehab - The yard mall.",
    ar: "القاهرة - الرحاب - The Yard Mall",
  },
  "el-raey-the-yard": {
    en: "Cairo - Rehab - The yard mall.",
    ar: "القاهرة - الرحاب - The Yard Mall",
  },
  "sell-dresses": {
    en: "El Mansoura - El Mashaya - in front of El-Gezira sports club 2.",
    ar: "المنصورة - المشايه امام بوابه نادي الجزيره ٢",
  },
}

export default function CheckoutPage() {
  const router = useRouter()



  const { state: cartState, dispatch: cartDispatch } = useCart()
  const { state: authState } = useAuth()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)
  const { formatPrice } = useCurrencyFormatter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [discountError, setDiscountError] = useState("")
  const [discountCode, setDiscountCode] = useState("")
  const [appliedDiscount, setAppliedDiscount] = useState<{
    getX: any
    buyX: any
    code: string
    discountAmount: number
    type: string
    value: number
  } | null>(null)
  const [discountLoading, setDiscountLoading] = useState(false)

  const [phoneCountry, setPhoneCountry] = useState(settings.countryCode)
  const [altPhoneCountry, setAltPhoneCountry] = useState(settings.countryCode)
  const [phoneCountrySynced, setPhoneCountrySynced] = useState(true)
  const [altPhoneCountrySynced, setAltPhoneCountrySynced] = useState(true)

  const [formData, setFormData] = useState({
    // Shipping Information
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    altPhone: "",
    address: "",
    city: "",
    country: "",
    postalCode: "",

    // Payment Information
    paymentMethod: "instapay",
  })

  const [paymentScreenshot, setPaymentScreenshot] = useState<string | null>(null)
  const [screenshotFileName, setScreenshotFileName] = useState<string>("")

  const [deliveryMethod, setDeliveryMethod] = useState<"shipping" | "pickup">("shipping")

  const hasRental = cartState.items.some((item) => item.type === "rent" || (item.branch && item.branch !== "sell-dresses") || !item.branch)
  
  useEffect(() => {
    if (hasRental) {
      setDeliveryMethod("pickup")
    }
  }, [hasRental])

  // Initialize country with default from locale settings
  useEffect(() => {
    if (!formData.country) {
      setFormData((prev) => ({
        ...prev,
        country: settings.countryName,
      }))
    }
  }, [settings.countryName])

  // Keep phone country codes in sync with selected shipping country by default
  useEffect(() => {
    const selectedCountryCode = COUNTRY_CODE_MAP[formData.country] || settings.countryCode

    if (selectedCountryCode && phoneCountrySynced) {
      setPhoneCountry(selectedCountryCode)
    }
    if (selectedCountryCode && altPhoneCountrySynced) {
      setAltPhoneCountry(selectedCountryCode)
    }
  }, [formData.country, settings.countryCode, phoneCountrySynced, altPhoneCountrySynced])

  // Correct order of calculations:
  const subtotal = cartState.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  
  const rentSubtotal = cartState.items.reduce((sum, item) => {
    const isRent = item.type === "rent" || (item.branch && item.branch !== "sell-dresses") || !item.branch;
    return sum + (isRent ? item.price * item.quantity : 0);
  }, 0);
  
  const buySubtotal = cartState.items.reduce((sum, item) => {
    const isRent = item.type === "rent" || (item.branch && item.branch !== "sell-dresses") || !item.branch;
    return sum + (!isRent ? item.price * item.quantity : 0);
  }, 0);

  const discountAmount = appliedDiscount?.discountAmount || 0
  const total = subtotal - discountAmount
  
  const baseDeposit = (rentSubtotal * 0.5) + buySubtotal;
  const depositRatio = subtotal > 0 ? baseDeposit / subtotal : 0;
  const depositAmount = discountAmount > 0 ? total * depositRatio : baseDeposit;
  const remainingAmount = total - depositAmount;


  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const formatPhoneWithDialCode = (countryCode: string, localNumber: string) => {
    const trimmed = localNumber.trim()
    if (!trimmed) return ""

    const config = PHONE_COUNTRY_RULES[countryCode]
    const dialCode = config?.dialCode || ""

    if (!dialCode) {
      return trimmed
    }

    if (trimmed.startsWith("+")) {
      return trimmed
    }

    return `${dialCode} ${trimmed}`
  }

  const validatePhoneNumber = (value: string, countryCode: string, label: "primary" | "secondary") => {
    const digitsOnly = value.replace(/\D/g, "")
    const config = PHONE_COUNTRY_RULES[countryCode]

    if (!config) {
      if (digitsOnly.length < 7) {
        setError(
          label === "primary"
            ? "Please enter a valid phone number"
            : "Please enter a valid secondary phone number",
        )
        return false
      }
      return true
    }

    let localDigits = digitsOnly
    const dialDigits = config.dialCode.replace(/\D/g, "")

    if (value.trim().startsWith("+") && dialDigits && digitsOnly.startsWith(dialDigits)) {
      localDigits = digitsOnly.slice(dialDigits.length)
    }

    if (localDigits.length < config.minLength || localDigits.length > config.maxLength) {
      const countryName = COUNTRY_LABELS_BY_CODE[countryCode] || "selected country"
      const message =
        label === "primary"
          ? `Please enter a valid ${countryName} phone number`
          : `Please enter a valid secondary ${countryName} phone number`
      setError(message)
      return false
    }

    return true
  }

  const validateDiscountCode = async () => {
  if (!discountCode.trim()) return

  if (!authState.token && !formData.email.trim()) {
    setDiscountError("Please enter your email before applying a discount code")
    return
  }

  setDiscountLoading(true)
  setDiscountError("") // Clear previous discount errors
  try {
    const token = authState.token
    const response = await fetch("/api/discount-codes/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        code: discountCode,
        orderAmount: subtotal,
        email: formData.email,
        items: cartState.items.map(item => ({
          id: item.id,
          price: item.price,
          quantity: item.quantity
        }))
      }),
    })

    if (response.ok) {
      const result = await response.json()
      setAppliedDiscount({
        ...result,
        // Store free items info if available
        freeItems: result.freeItems || []
      })
      setDiscountError("")
    } else {
      const errorData = await response.json()
      if (
        errorData.error === "MIN_ORDER_AMOUNT" &&
        typeof errorData.minOrderAmount === "number" &&
        typeof errorData.minOrderRemaining === "number"
      ) {
        const remainingFormatted = formatPrice(errorData.minOrderRemaining)
        const minFormatted = formatPrice(errorData.minOrderAmount)
        setDiscountError(
          `Add ${remainingFormatted} more to your cart to apply this discount (minimum order: ${minFormatted})`
        )
      } else {
        setDiscountError(errorData.error)
      }
      setAppliedDiscount(null)
      // Clear the discount code input on error so user can easily retry
      setDiscountCode("")
    }
  } catch (error) {
    console.error("Discount validation error:", error)
    setDiscountError("Failed to validate discount code")
    setAppliedDiscount(null)
  } finally {
    setDiscountLoading(false)
  }
}

  const removeDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode("");
    setDiscountError("");
  };

  const validateForm = () => {
    const required = ["firstName", "lastName", "email", "phone", "altPhone", "address", "city"]

    for (const field of required) {
      if (!formData[field as keyof typeof formData]) {
        setError(`Please fill in ${field.replace(/([A-Z])/g, " $1").toLowerCase()}`)
        return false
      }
    }

    const selectedCountryCode = COUNTRY_CODE_MAP[formData.country] || settings.countryCode
    const primaryCountryCode = phoneCountry || selectedCountryCode
    const secondaryCountryCode = altPhoneCountry || selectedCountryCode

    if (!validatePhoneNumber(formData.phone, primaryCountryCode, "primary")) {
      return false
    }

    if (!validatePhoneNumber(formData.altPhone, secondaryCountryCode, "secondary")) {
      return false
    }

    const fullPrimaryPhone = formatPhoneWithDialCode(primaryCountryCode, formData.phone)
    const fullSecondaryPhone = formatPhoneWithDialCode(secondaryCountryCode, formData.altPhone)

    if (fullPrimaryPhone === fullSecondaryPhone) {
      setError("Primary and secondary phone numbers cannot be the same")
      return false
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError("Please enter a valid email address")
      return false
    }

    // Validate payment screenshot
    if (!paymentScreenshot) {
      setError("Please upload a payment screenshot as proof of payment")
      return false
    }

    return true
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    // Safely handle the event object
    if (e) {
      e.preventDefault()
    }
    setError("")

    if (!validateForm()) return

    setLoading(true)

    try {
      // Get country code from selected country
      const selectedCountryCode = COUNTRY_CODE_MAP[formData.country] || settings.countryCode

      const primaryCountryCode = phoneCountry || selectedCountryCode
      const secondaryCountryCode = altPhoneCountry || selectedCountryCode

      const orderData = {
        items: cartState.items,
        total: total,
        shippingAddress: {
          name: `${formData.firstName} ${formData.lastName}`,
          email: formData.email,
          phone: formatPhoneWithDialCode(primaryCountryCode, formData.phone),
          secondaryPhone: formatPhoneWithDialCode(secondaryCountryCode, formData.altPhone),
          address: formData.address,
          city: formData.city,
          country: formData.country || settings.countryName,
          countryCode: selectedCountryCode,
          postalCode: formData.postalCode,
          deliveryMethod: deliveryMethod,
          pickupDetails: deliveryMethod === "pickup" ? cartState.items.map(item => ({
            itemName: item.name,
            branch: item.branch,
            address: BRANCH_ADDRESSES[item.branch?.toLowerCase() || "el-raey-1"]?.[settings.language],
            pickupDate: item.rentStart
          })) : null
        },
        paymentMethod: formData.paymentMethod,
        paymentScreenshot: paymentScreenshot,
        discountCode: appliedDiscount?.code,
        discountAmount: appliedDiscount?.discountAmount,
        depositAmount,
        remainingAmount,
      }

      const token = authState.token
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(orderData),
      })

      if (response.ok) {
        const orderResponse = await response.json()
        const order = orderResponse.order || orderResponse

        // Send confirmation email with the original order data to ensure country code is preserved

        // Clear cart
        cartDispatch({ type: "CLEAR_CART" })
        // Redirect to success page
        const orderId = (order && (order.id || order._id || order.order_id || order.order?.id)) || ""
        router.push(`/checkout/success?orderId=${orderId}`)
      } else {
        const errorData = await response.json()
        setError(errorData.error || "Failed to place order")
      }
    } catch (error) {
      console.error("Checkout error:", error)
      setError("An error occurred while processing your order")
    } finally {
      setLoading(false)
    }
  }
  if (cartState.items.length === 0) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <section className="pt-32 pb-16">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="text-center py-16">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="mb-8"
              >
                <h1 className="text-2xl sm:text-3xl font-light tracking-wider mb-4">
                  {t("yourCartIsEmpty")}
                </h1>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "100px" }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                    className="h-1 bg-gradient-to-r from-rose-400 to-pink-400 mx-auto my-6 rounded-full"
                  />
                <p className="text-gray-600 mb-8">
                  {t("cartEmptyDesc")}
                </p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
              >
                <Link href="/soiree/products">
                  <Button className="bg-black text-white hover:bg-gray-800 rounded-full px-8 py-6 relative overflow-hidden group">
                    <span className="relative z-10">{t("continueShopping")}</span>
                    <motion.span
                      className="absolute inset-0 bg-gradient-to-r from-rose-600 to-pink-600 opacity-0 group-hover:opacity-100"
                      initial={{ x: "-100%" }}
                      whileHover={{ x: 0 }}
                      transition={{ duration: 0.4 }}
                    />
                  </Button>
                </Link>
              </motion.div>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <Navigation />

      <section className="pt-32 pb-16">
        <div className="container mx-auto px-4 sm:px-6">
          {/* Progress Indicator */}
          <CheckoutProgress currentStep={2} />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-8"
          >
            <Link
              href="/cart"
              className={`inline-flex items-center text-gray-600 hover:text-black mb-6 transition-colors text-sm sm:text-base ${settings.language === "ar" ? "flex-row-reverse" : ""}`}
            >
              <ArrowLeft className={`h-4 w-4 ${settings.language === "ar" ? "ml-2 rotate-180" : "mr-2"}`} />
              {t("backToCart")}
            </Link>
            <h1 className="text-2xl sm:text-3xl font-light tracking-wider mb-2">{t("checkoutTitle")}</h1>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100px" }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="h-1 bg-gradient-to-r from-rose-400 to-pink-400 mb-4 rounded-full"
            />
            <p className="text-gray-600 text-sm sm:text-base">{t("completeOrderDetails")}</p>
          </motion.div>

          <form onSubmit={handleSubmit}>
            <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
              {/* Checkout Form */}
              <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                {/* Shipping Information */}
                <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8 }}
                >
                  <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden">
                    <motion.div
                      className="absolute -inset-4 bg-gradient-to-r from-rose-400/20 to-pink-400/20 rounded-lg -z-10"
                      animate={{
                        rotate: [0, 2, 0, -2, 0],
                      }}
                      transition={{
                        duration: 8,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="absolute -inset-2 bg-gradient-to-r from-rose-300/30 to-pink-300/30 rounded-lg -z-10"
                      animate={{
                        rotate: [0, -1, 0, 1, 0],
                      }}
                      transition={{
                        duration: 6,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                    <CardHeader className="pb-4">
                      <CardTitle className={`flex items-center text-lg sm:text-xl ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
                        <MapPin className={`h-5 w-5 text-rose-600 ${settings.language === "ar" ? "ml-2" : "mr-2"}`} />
                        {t("shippingInformation")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="firstName" className="text-sm font-medium">
                            {t("firstName")}
                          </Label>
                          <Input
                            id="firstName"
                            value={formData.firstName}
                            onChange={(e) => handleInputChange("firstName", e.target.value)}
                            required
                            className="mt-1 border-gray-200 focus:border-rose-500 focus:ring-rose-500"
                          />
                        </div>
                        <div>
                          <Label htmlFor="lastName" className="text-sm font-medium">
                            {t("lastName")}
                          </Label>
                          <Input
                            id="lastName"
                            value={formData.lastName}
                            onChange={(e) => handleInputChange("lastName", e.target.value)}
                            required
                            className="mt-1 border-gray-200 focus:border-rose-500 focus:ring-rose-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="email" className="text-sm font-medium">
                            {t("emailAddress")}
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => handleInputChange("email", e.target.value)}
                            required
                            className="mt-1 border-gray-200 focus:border-rose-500 focus:ring-rose-500"
                          />
                        </div>
                        <div>
                          <Label htmlFor="phone" className="text-sm font-medium">
                            {t("phoneNumber")}
                          </Label>
                          <div className={`mt-1 flex gap-2 ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
                            <select
                              value={phoneCountry}
                              onChange={(e) => {
                                setPhoneCountry(e.target.value)
                                setPhoneCountrySynced(false)
                              }}
                              className="flex h-10 w-32 rounded-md border border-gray-200 bg-background px-2 py-2 text-xs sm:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {PHONE_COUNTRY_OPTIONS.map((option) => (
                                <option key={option.code} value={option.code}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <Input
                              id="phone"
                              value={formData.phone}
                              onChange={(e) => handleInputChange("phone", e.target.value)}
                              placeholder="Enter phone number"
                              required
                              className="flex-1 border-gray-200 focus:border-rose-500 focus:ring-rose-500 placeholder:text-xs sm:placeholder:text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="altPhone" className="text-sm font-medium">
                            {t("secondaryPhone")}
                          </Label>
                          <div className={`mt-1 flex gap-2 ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
                            <select
                              value={altPhoneCountry}
                              onChange={(e) => {
                                setAltPhoneCountry(e.target.value)
                                setAltPhoneCountrySynced(false)
                              }}
                              className="flex h-10 w-32 rounded-md border border-gray-200 bg-background px-2 py-2 text-xs sm:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {PHONE_COUNTRY_OPTIONS.map((option) => (
                                <option key={option.code} value={option.code}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <Input
                              id="altPhone"
                              value={formData.altPhone}
                              onChange={(e) => handleInputChange("altPhone", e.target.value)}
                              placeholder="Enter secondary phone number"
                              required
                              className="flex-1 border-gray-200 focus:border-rose-500 focus:ring-rose-500 placeholder:text-xs sm:placeholder:text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="address" className="text-sm font-medium">
                          {t("streetAddress")}
                        </Label>
                        <Input
                          id="address"
                          value={formData.address}
                          onChange={(e) => handleInputChange("address", e.target.value)}
                          required
                          className="mt-1 border-gray-200 focus:border-rose-500 focus:ring-rose-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="city" className="text-sm font-medium">
                            {t("city")}
                          </Label>
                          <Input
                            id="city"
                            value={formData.city}
                            onChange={(e) => handleInputChange("city", e.target.value)}
                            required
                            className="mt-1 border-gray-200 focus:border-rose-500 focus:ring-rose-500"
                          />
                        </div>
                        <div>
                          <Label htmlFor="country" className="text-sm font-medium">
                            {t("country")} *
                          </Label>
                          <select
                            id="country"
                            value={formData.country}
                            onChange={(e) => handleInputChange("country", e.target.value)}
                            required
                            className="mt-1 flex h-10 w-full rounded-md border border-gray-200 bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="">Select a country</option>
                            <option value="United States">United States</option>
                            <option value="Saudi Arabia">Saudi Arabia</option>
                            <option value="United Arab Emirates">United Arab Emirates</option>
                            <option value="Kuwait">Kuwait</option>
                            <option value="Qatar">Qatar</option>
                            <option value="United Kingdom">United Kingdom</option>
                            <option value="Egypt">Egypt</option>
                            <option value="Oman">Oman</option>
                            <option value="Bahrain">Bahrain</option>
                            <option value="Iraq">Iraq</option>
                            <option value="Jordan">Jordan</option>
                            <option value="Turkey">Turkey</option>
                            <option value="Lebanon">Lebanon</option>
                          </select>
                        </div>
                        <div>
                          <Label htmlFor="postalCode" className="text-sm font-medium">
                            {t("postalCode")}
                          </Label>
                          <Input
                            id="postalCode"
                            value={formData.postalCode}
                            onChange={(e) => handleInputChange("postalCode", e.target.value)}
                            className="mt-1 border-gray-200 focus:border-rose-500 focus:ring-rose-500"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Delivery Method */}
                <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8, delay: 0.05 }}
                >
                  <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden">
                    <CardHeader className="pb-4">
                      <CardTitle className={`flex items-center text-lg sm:text-xl ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
                        <Truck className={`h-5 w-5 text-rose-600 ${settings.language === "ar" ? "ml-2" : "mr-2"}`} />
                        {t("deliveryMethod" as any)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <RadioGroup
                        value={deliveryMethod}
                        onValueChange={(value) => setDeliveryMethod(value as any)}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                        disabled={hasRental}
                      >
                        {/* Home Shipping - Only for Sell Dresses */}
                        {!hasRental && (
                          <div className={`relative border rounded-lg transition-all duration-300 ${deliveryMethod === "shipping" ? "border-rose-400 bg-rose-50/50 shadow-md" : "border-gray-200 hover:bg-gray-50 hover:border-rose-300"}`}>
                            <div className="flex items-center space-x-3 p-4">
                              <RadioGroupItem value="shipping" id="shipping" className="text-rose-600" />
                              <Label htmlFor="shipping" className="flex-1 cursor-pointer">
                                <div className={`flex items-center justify-between ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
                                  <div>
                                    <p className="font-medium text-sm sm:text-base">{t("homeShipping" as any)}</p>
                                    <p className="text-xs text-gray-600">{t("allPricesIncludeShipping")}</p>
                                  </div>
                                  <Truck className="h-5 w-5 text-rose-400" />
                                </div>
                              </Label>
                            </div>
                          </div>
                        )}

                        {/* Pickup from Branch */}
                        <div className={`relative border rounded-lg transition-all duration-300 ${deliveryMethod === "pickup" ? "border-rose-400 bg-rose-50/50 shadow-md" : "border-gray-200 hover:bg-gray-50 hover:border-rose-300"}`}>
                          <div className="flex items-center space-x-3 p-4">
                            <RadioGroupItem value="pickup" id="pickup" className="text-rose-600" />
                            <Label htmlFor="pickup" className="flex-1 cursor-pointer">
                              <div className={`flex items-center justify-between ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
                                <div>
                                  <p className="font-medium text-sm sm:text-base">{t("pickupFromBranch" as any)}</p>
                                  <p className="text-xs text-gray-600">Free pickup from our stores</p>
                                </div>
                                <MapPin className="h-5 w-5 text-rose-400" />
                              </div>
                            </Label>
                          </div>
                        </div>
                      </RadioGroup>

                      {hasRental && (
                        <Alert className="bg-rose-50 border-rose-100">
                          <AlertDescription className="text-rose-800 text-xs sm:text-sm">
                            Rental items are only available for pickup from our branches to ensure quality check.
                          </AlertDescription>
                        </Alert>
                      )}

                      {deliveryMethod === "pickup" && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="pt-2"
                        >
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                            <p className="text-xs sm:text-sm font-semibold text-gray-900 mb-2">{t("branchAddress" as any)}:</p>
                            <div className="space-y-3">
                              {/* Display addresses for each item in the cart to be clear */}
                              {cartState.items.map((item, idx) => {
                                const branchKey = item.branch?.toLowerCase() || "el-raey-1";
                                const address = BRANCH_ADDRESSES[branchKey]?.[settings.language] || BRANCH_ADDRESSES["el-raey-1"][settings.language];
                                return (
                                  <div key={idx} className="flex items-start gap-2 pb-2 border-b border-gray-200 last:border-0 last:pb-0">
                                    <div className="h-1.5 w-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                                    <div>
                                      <p className="text-[10px] sm:text-xs font-medium text-rose-700 uppercase tracking-wider">{item.name}</p>
                                      <p className="text-[11px] sm:text-sm text-gray-600 leading-relaxed">{address}</p>
                                      {item.type === "rent" && item.rentStart && (
                                        <p className="text-[10px] sm:text-xs font-bold text-green-600 mt-1 italic">
                                          {t("pickupDate" as any)}: {new Date(item.rentStart).toLocaleDateString(settings.language === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Payment Information */}
                <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                >
                  <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden">
                    <motion.div
                      className="absolute -inset-4 bg-gradient-to-r from-rose-400/20 to-pink-400/20 rounded-lg -z-10"
                      animate={{
                        rotate: [0, -2, 0, 2, 0],
                      }}
                      transition={{
                        duration: 8,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="absolute -inset-2 bg-gradient-to-r from-rose-300/30 to-pink-300/30 rounded-lg -z-10"
                      animate={{
                        rotate: [0, 1, 0, -1, 0],
                      }}
                      transition={{
                        duration: 6,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                    <CardHeader className="pb-4">
                      <CardTitle className={`flex items-center text-lg sm:text-xl ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
                        <CreditCard className={`h-5 w-5 text-rose-600 ${settings.language === "ar" ? "ml-2" : "mr-2"}`} />
                        {t("paymentMethod")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <RadioGroup
                        value={formData.paymentMethod}
                        onValueChange={(value) => handleInputChange("paymentMethod", value)}
                        className="space-y-3"
                      >
                        {/* Instapay */}
                        <div className={`border rounded-lg transition-all duration-300 ${formData.paymentMethod === "instapay" ? "border-rose-400 bg-rose-50/50 shadow-md" : "border-gray-200 hover:bg-gray-50 hover:border-rose-300"}`}>
                          <div className="flex items-center space-x-3 p-4">
                            <RadioGroupItem value="instapay" id="instapay" className="text-rose-600" />
                            <Label htmlFor="instapay" className="flex-1 cursor-pointer">
                              <div className={`flex items-center justify-between ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
                                <div>
                                  <p className="font-medium text-sm sm:text-base">Instapay</p>
                                  <p className="text-xs sm:text-sm text-gray-600">Pay via Instapay transfer link</p>
                                </div>
                                <Smartphone className="h-5 w-5 text-rose-400" />
                              </div>
                            </Label>
                          </div>
                          {formData.paymentMethod === "instapay" && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                              className="px-4 pb-4 border-t border-rose-200"
                            >
                              <div className="pt-3 space-y-3">
                                <div className="bg-white rounded-lg p-4 border border-rose-100">
                                  <p className="text-sm text-gray-700 mb-2">Click the link below to complete your payment:</p>
                                  <a
                                    href="https://ipn.eg/S/zeyadaboeleneen/instapay/9KXW3j"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-lg hover:from-rose-700 hover:to-pink-700 transition-all duration-300 text-sm font-medium shadow-md hover:shadow-lg"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                    Open Instapay Payment Link
                                  </a>
                                  <p className="text-xs text-gray-500 mt-2">After payment, take a screenshot and upload it below.</p>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </div>

                        {/* Bank Transfer */}
                        <div className={`border rounded-lg transition-all duration-300 ${formData.paymentMethod === "bank_transfer" ? "border-rose-400 bg-rose-50/50 shadow-md" : "border-gray-200 hover:bg-gray-50 hover:border-rose-300"}`}>
                          <div className="flex items-center space-x-3 p-4">
                            <RadioGroupItem value="bank_transfer" id="bank_transfer" className="text-rose-600" />
                            <Label htmlFor="bank_transfer" className="flex-1 cursor-pointer">
                              <div className={`flex items-center justify-between ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
                                <div>
                                  <p className="font-medium text-sm sm:text-base">Bank Transfer</p>
                                  <p className="text-xs sm:text-sm text-gray-600">Transfer to our bank account</p>
                                </div>
                                <Landmark className="h-5 w-5 text-rose-400" />
                              </div>
                            </Label>
                          </div>
                          {formData.paymentMethod === "bank_transfer" && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                              className="px-4 pb-4 border-t border-rose-200"
                            >
                              <div className="pt-3 space-y-3">
                                <div className="bg-white rounded-lg p-4 border border-rose-100 space-y-2.5">
                                  <h4 className="font-semibold text-sm text-gray-800 mb-3 flex items-center gap-2">
                                    <Landmark className="h-4 w-4 text-rose-600" />
                                    Bank Account Details
                                  </h4>
                                  <div className="grid grid-cols-1 gap-2 text-sm">
                                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 py-1.5 border-b border-gray-100">
                                      <span className="text-gray-500 font-medium">Beneficiary Name</span>
                                      <span className="text-gray-800 font-medium">Zeyad Mohamed Abo Eleneen Khaled</span>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 py-1.5 border-b border-gray-100">
                                      <span className="text-gray-500 font-medium">Account Number</span>
                                      <span className="text-gray-800 font-mono text-xs sm:text-sm">1020656463735</span>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 py-1.5 border-b border-gray-100">
                                      <span className="text-gray-500 font-medium">IBAN</span>
                                      <span className="text-gray-800 font-mono text-xs">EG78 0037 0027 0818 1020 6564 63735</span>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 py-1.5 border-b border-gray-100">
                                      <span className="text-gray-500 font-medium">SWIFT Code</span>
                                      <span className="text-gray-800 font-mono text-xs sm:text-sm">QNBAEGCXXXX</span>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 py-1.5 border-b border-gray-100">
                                      <span className="text-gray-500 font-medium">Bank Name</span>
                                      <span className="text-gray-800">Qatar National Bank (QNB Al Ahli)</span>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 py-1.5">
                                      <span className="text-gray-500 font-medium">Currency</span>
                                      <span className="text-gray-800">EGP</span>
                                    </div>
                                  </div>
                                  <div className="mt-3 pt-3 border-t border-gray-100">
                                    <p className="text-xs text-gray-500">
                                      <strong>Bank Address:</strong> 213 El Gomhoria Street, in front of Dar El Thaqafa, Mansoura, Dakahlia, Egypt
                                    </p>
                                  </div>
                                </div>
                                <p className="text-xs text-gray-500">After transferring, take a screenshot and upload it below.</p>
                              </div>
                            </motion.div>
                          )}
                        </div>

                        {/* Vodafone Cash */}
                        <div className={`border rounded-lg transition-all duration-300 ${formData.paymentMethod === "vodafone_cash" ? "border-rose-400 bg-rose-50/50 shadow-md" : "border-gray-200 hover:bg-gray-50 hover:border-rose-300"}`}>
                          <div className="flex items-center space-x-3 p-4">
                            <RadioGroupItem value="vodafone_cash" id="vodafone_cash" className="text-rose-600" />
                            <Label htmlFor="vodafone_cash" className="flex-1 cursor-pointer">
                              <div className={`flex items-center justify-between ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
                                <div>
                                  <p className="font-medium text-sm sm:text-base">Vodafone Cash</p>
                                  <p className="text-xs sm:text-sm text-gray-600">Send via Vodafone Cash</p>
                                </div>
                                <Phone className="h-5 w-5 text-rose-400" />
                              </div>
                            </Label>
                          </div>
                          {formData.paymentMethod === "vodafone_cash" && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                              className="px-4 pb-4 border-t border-rose-200"
                            >
                              <div className="pt-3 space-y-3">
                                <div className="bg-white rounded-lg p-4 border border-rose-100">
                                  <p className="text-sm text-gray-700 mb-2">Send the payment to this Vodafone Cash number:</p>
                                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-red-50 to-red-100 rounded-lg border border-red-200">
                                    <Phone className="h-5 w-5 text-red-600" />
                                    <span className="text-lg font-bold text-red-700 tracking-wider">01024285771</span>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-2">After sending, take a screenshot and upload it below.</p>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      </RadioGroup>

                      {/* Payment Screenshot Upload */}
                      <div className="mt-6 pt-4 border-t border-gray-200">
                        <Label className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
                          <Upload className="h-4 w-4 text-rose-600" />
                          Upload Payment Screenshot *
                        </Label>
                        <p className="text-xs text-gray-500 mb-3">Upload a screenshot of your payment confirmation as proof.</p>
                        
                        {!paymentScreenshot ? (
                          <label
                            htmlFor="payment-screenshot"
                            className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-rose-300 rounded-xl cursor-pointer bg-rose-50/30 hover:bg-rose-50 hover:border-rose-400 transition-all duration-300 group"
                          >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              <Upload className="h-8 w-8 text-rose-400 mb-2 group-hover:scale-110 transition-transform" />
                              <p className="text-sm text-gray-600">
                                <span className="font-semibold text-rose-600">Click to upload</span> or drag & drop
                              </p>
                              <p className="text-xs text-gray-400 mt-1">PNG, JPG, JPEG (Max 5MB)</p>
                            </div>
                            <input
                              id="payment-screenshot"
                              type="file"
                              accept="image/png,image/jpeg,image/jpg,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                if (file.size > 5 * 1024 * 1024) {
                                  setError("Screenshot file size must be less than 5MB")
                                  return
                                }
                                setScreenshotFileName(file.name)
                                const reader = new FileReader()
                                reader.onloadend = () => {
                                  setPaymentScreenshot(reader.result as string)
                                }
                                reader.readAsDataURL(file)
                              }}
                            />
                          </label>
                        ) : (
                          <div className="relative border border-green-200 rounded-xl p-3 bg-green-50/50">
                            <div className="flex items-start gap-3">
                              <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                <Image
                                  src={paymentScreenshot}
                                  alt="Payment screenshot"
                                  fill
                                  className="object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                                  <span className="text-sm font-medium text-green-700">Screenshot uploaded</span>
                                </div>
                                <p className="text-xs text-gray-500 truncate">{screenshotFileName}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setPaymentScreenshot(null)
                                  setScreenshotFileName("")
                                }}
                                className="p-1.5 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              {/* Order Summary */}
              <div className="lg:col-span-1">
                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8 }}
                >
                  <div className="sticky top-24">
                    <OrderSummary
                      items={cartState.items as any}
                      subtotal={subtotal}
                      total={total}
                      depositAmount={depositAmount}
                      remainingAmount={remainingAmount}
                      discountCode={discountCode}
                      setDiscountCode={setDiscountCode}
                      appliedDiscount={appliedDiscount}
                      discountError={discountError}
                      discountLoading={discountLoading}
                      onApplyDiscount={validateDiscountCode}
                      onRemoveDiscount={removeDiscount}
                      onSubmit={handleSubmit}
                      loading={loading}
                      governorate={formData.country || settings.countryName}
                      formError={error}
                      deliveryMethod={deliveryMethod}
                      setDeliveryMethod={setDeliveryMethod}
                    />
                  </div>
                </motion.div>
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* Decorative floating elements */}
      <motion.div
        animate={{ y: [0, -15, 0], rotate: [0, 5, 0] }}
        transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        className="fixed bottom-8 left-8 z-10"
      >
        <Sparkles className="h-6 w-6 text-rose-400" />
      </motion.div>

      <motion.div
        animate={{ y: [0, 15, 0], rotate: [0, -5, 0] }}
        transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        className="fixed top-1/4 right-8 z-10"
      >
        <Sparkles className="h-4 w-4 text-pink-400" />
      </motion.div>
    </div>
  )
}
