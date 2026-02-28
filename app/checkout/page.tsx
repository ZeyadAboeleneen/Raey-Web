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
import { ArrowLeft, Truck, CreditCard, MapPin, Sparkles } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { useCart } from "@/lib/cart-context"
import { useAuth } from "@/lib/auth-context"
import { CheckoutProgress } from "@/components/checkout-progress"
import { OrderSummary } from "@/components/order-summary"
import { useLocale } from "@/lib/locale-context"
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

export default function CheckoutPage() {
  const router = useRouter()

  // Page disabled: immediately redirect to home
  useEffect(() => {
    router.replace("/")
  }, [router])

  return null

  const { state: cartState, dispatch: cartDispatch } = useCart()
  const { state: authState } = useAuth()
  const { settings } = useLocale()
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
    paymentMethod: "cod",
  })

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
  const discountAmount = appliedDiscount?.discountAmount || 0
  const total = subtotal - discountAmount


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
        },
        paymentMethod: formData.paymentMethod,
        discountCode: appliedDiscount?.code,
        discountAmount: appliedDiscount?.discountAmount,
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
                  Your cart is empty
                </h1>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100px" }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                  className="h-1 bg-gradient-to-r from-purple-400 to-pink-400 mx-auto my-6 rounded-full"
                />
                <p className="text-gray-600 mb-8">
                  Add some products to your cart before checkout.
                </p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
              >
                <Link href="/products">
                  <Button className="bg-black text-white hover:bg-gray-800 rounded-full px-8 py-6 relative overflow-hidden group">
                    <span className="relative z-10">Continue Shopping</span>
                    <motion.span
                      className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 opacity-0 group-hover:opacity-100"
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
              className="inline-flex items-center text-gray-600 hover:text-black mb-6 transition-colors text-sm sm:text-base"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Cart
            </Link>
            <h1 className="text-2xl sm:text-3xl font-light tracking-wider mb-2">Checkout</h1>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100px" }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="h-1 bg-gradient-to-r from-purple-400 to-pink-400 mb-4 rounded-full"
            />
            <p className="text-gray-600 text-sm sm:text-base">Complete your order details below</p>
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
                      className="absolute -inset-4 bg-gradient-to-r from-purple-400/20 to-pink-400/20 rounded-lg -z-10"
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
                      className="absolute -inset-2 bg-gradient-to-r from-purple-300/30 to-pink-300/30 rounded-lg -z-10"
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
                      <CardTitle className="flex items-center text-lg sm:text-xl">
                        <MapPin className="mr-2 h-5 w-5 text-purple-600" />
                        Shipping Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="firstName" className="text-sm font-medium">
                            First Name *
                          </Label>
                          <Input
                            id="firstName"
                            value={formData.firstName}
                            onChange={(e) => handleInputChange("firstName", e.target.value)}
                            required
                            className="mt-1 border-gray-200 focus:border-purple-500 focus:ring-purple-500"
                          />
                        </div>
                        <div>
                          <Label htmlFor="lastName" className="text-sm font-medium">
                            Last Name *
                          </Label>
                          <Input
                            id="lastName"
                            value={formData.lastName}
                            onChange={(e) => handleInputChange("lastName", e.target.value)}
                            required
                            className="mt-1 border-gray-200 focus:border-purple-500 focus:ring-purple-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="email" className="text-sm font-medium">
                            Email Address *
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => handleInputChange("email", e.target.value)}
                            required
                            className="mt-1 border-gray-200 focus:border-purple-500 focus:ring-purple-500"
                          />
                        </div>
                        <div>
                          <Label htmlFor="phone" className="text-sm font-medium">
                            Phone Number *
                          </Label>
                          <div className="mt-1 flex gap-2">
                            <select
                              value={phoneCountry}
                              onChange={(e) => {
                                setPhoneCountry(e.target.value)
                                setPhoneCountrySynced(false)
                              }}
                              className="flex h-10 w-32 rounded-md border border-gray-200 bg-background px-2 py-2 text-xs sm:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                              className="flex-1 border-gray-200 focus:border-purple-500 focus:ring-purple-500 placeholder:text-xs sm:placeholder:text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="altPhone" className="text-sm font-medium">
                            Secondary Phone *
                          </Label>
                          <div className="mt-1 flex gap-2">
                            <select
                              value={altPhoneCountry}
                              onChange={(e) => {
                                setAltPhoneCountry(e.target.value)
                                setAltPhoneCountrySynced(false)
                              }}
                              className="flex h-10 w-32 rounded-md border border-gray-200 bg-background px-2 py-2 text-xs sm:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                              className="flex-1 border-gray-200 focus:border-purple-500 focus:ring-purple-500 placeholder:text-xs sm:placeholder:text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="address" className="text-sm font-medium">
                          Street Address *
                        </Label>
                        <Input
                          id="address"
                          value={formData.address}
                          onChange={(e) => handleInputChange("address", e.target.value)}
                          required
                          className="mt-1 border-gray-200 focus:border-purple-500 focus:ring-purple-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="city" className="text-sm font-medium">
                            City *
                          </Label>
                          <Input
                            id="city"
                            value={formData.city}
                            onChange={(e) => handleInputChange("city", e.target.value)}
                            required
                            className="mt-1 border-gray-200 focus:border-purple-500 focus:ring-purple-500"
                          />
                        </div>
                        <div>
                          <Label htmlFor="country" className="text-sm font-medium">
                            Country *
                          </Label>
                          <select
                            id="country"
                            value={formData.country}
                            onChange={(e) => handleInputChange("country", e.target.value)}
                            required
                            className="mt-1 flex h-10 w-full rounded-md border border-gray-200 bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                            Postal Code
                          </Label>
                          <Input
                            id="postalCode"
                            value={formData.postalCode}
                            onChange={(e) => handleInputChange("postalCode", e.target.value)}
                            className="mt-1 border-gray-200 focus:border-purple-500 focus:ring-purple-500"
                          />
                        </div>
                      </div>
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
                      className="absolute -inset-4 bg-gradient-to-r from-purple-400/20 to-pink-400/20 rounded-lg -z-10"
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
                      className="absolute -inset-2 bg-gradient-to-r from-purple-300/30 to-pink-300/30 rounded-lg -z-10"
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
                      <CardTitle className="flex items-center text-lg sm:text-xl">
                        <CreditCard className="mr-2 h-5 w-5 text-purple-600" />
                        Payment Method
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <RadioGroup
                        value={formData.paymentMethod}
                        onValueChange={(value) => handleInputChange("paymentMethod", value)}
                      >
                        <div className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-purple-300 transition-all duration-300">
                          <RadioGroupItem value="cod" id="cod" className="text-purple-600" />
                          <Label htmlFor="cod" className="flex-1 cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-sm sm:text-base">Cash on Delivery</p>
                                <p className="text-xs sm:text-sm text-gray-600">Pay when you receive your order</p>
                              </div>
                              <Truck className="h-5 w-5 text-purple-400" />
                            </div>
                          </Label>
                        </div>
                      </RadioGroup>
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
        <Sparkles className="h-6 w-6 text-purple-400" />
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
