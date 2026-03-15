"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, Package, Mail, Instagram, Phone } from "lucide-react"
import { Navigation } from "@/components/navigation"

export default function CheckoutSuccessPage() {
  const router = useRouter()

  // Page disabled: immediately redirect to home
  useEffect(() => {
    router.replace("/")
  }, [router])

  return null

  const searchParams = useSearchParams()
  const orderId = searchParams.get("orderId")
  const [orderDetails, setOrderDetails] = useState<any>(null)

  useEffect(() => {
    if (orderId) {
      // In a real app, you'd fetch order details from the API
      setOrderDetails({
        id: orderId,
        estimatedDelivery: "15 to 20 days",
        trackingNumber: `SF${Date.now()}`,
      })
    }
  }, [orderId])

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
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
              <h1 className="text-3xl font-light tracking-wider mb-4">Order Confirmed!</h1>
              <p className="text-gray-600 text-lg mb-4">
                Thank you for your purchase. Your order has been successfully placed.
              </p>
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6 max-w-2xl mx-auto">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-700">
                      Your order is expected to arrive within 15 to 20 days. Please note that custom designs outside our collection may require additional time, depending on the style and level of detail.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {orderDetails && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                <Card className="border-0 shadow-lg mb-8">
                  <CardHeader>
                    <CardTitle>Order Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4 text-left">
                      <div>
                        <p className="text-sm text-gray-600">Order Number</p>
                        <p className="font-medium">{orderDetails.id}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Estimated Delivery</p>
                        <p className="font-medium">{orderDetails.estimatedDelivery}</p>
                        <p className="text-xs text-gray-500 mt-1">Custom designs may require additional time</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="grid md:grid-cols-3 gap-6 mb-8"
            >
              <Card className="border-0 shadow-sm">
                <CardContent className="p-6 text-center">
                  <Mail className="h-8 w-8 mx-auto mb-3 text-blue-500" />
                  <h3 className="font-medium mb-2">Confirmation Email</h3>
                  <p className="text-sm text-gray-600">We've sent you an email with your order details</p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="p-6 text-center">
                  <Package className="h-8 w-8 mx-auto mb-3 text-orange-500" />
                  <h3 className="font-medium mb-2">Processing</h3>
                  <p className="text-sm text-gray-600">Your order is being prepared for shipment</p>
                </CardContent>
              </Card>


            </motion.div>

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
                  Track Your Order
                </Button>
                <Button
                  className="bg-black text-white hover:bg-gray-800"
                  onClick={() => router.push("/soiree/products")}
                >
                  Continue Shopping
                </Button>
              </div>

              <div className="text-sm text-gray-600 space-y-4 pt-4 border-t border-gray-200">
                <p>
                  Need help? Contact us at{" "}
                  <a href="mailto:Raey@gmail.com" className="text-black hover:underline">
                    Raey@gmail.com
                  </a>
                  {" or on WhatsApp at +971 50 299 6885"}
                </p>
                <div className="flex justify-center space-x-4">
                  <a
                    href="mailto:Raey@gmail.com"
                    className="group"
                  >
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg">
                      <Mail className="h-4 w-4 text-gray-700" />
                    </div>
                  </a>
                  <a
                    href="https://wa.me/971502996885"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg">
                      <Phone className="h-4 w-4 text-white" />
                    </div>
                  </a>
                  <a
                    href="https://www.instagram.com/alanodalqadi?igsh=MWVxaXBvaXhjNm50ZQ=="
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg">
                      <Instagram className="h-4 w-4 text-white" />
                    </div>
                  </a>
                  <a
                    href="https://www.tiktok.com/@alanodalqadi?_r=1&_t=ZS-92NsFxJ48xs"
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
