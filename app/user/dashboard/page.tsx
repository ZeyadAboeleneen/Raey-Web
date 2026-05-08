"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Package, ShoppingCart, User, MapPin, ArrowLeft, Eye } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { useAuth } from "@/lib/auth-context"
import { useLocale } from "@/lib/locale-context"
import { useTranslation, TranslationKey } from "@/lib/translations"

export default function UserDashboard() {
  const { state: authState } = useAuth()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)
  const router = useRouter()
  const [userOrders, setUserOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authState.isLoading) {
      return
    }

    if (!authState.isAuthenticated) {
      router.push("/auth/login")
      return
    }

    if (authState.user && authState.token) {
      const fetchOrders = async () => {
        setLoading(true)
        try {
          const response = await fetch("/api/orders", {
            headers: {
              Authorization: `Bearer ${authState.token}`,
            },
          })

          if (response.ok) {
            const orders = await response.json()
            console.log("Fetched orders:", orders)
            setUserOrders(orders)
          } else {
            console.error("Failed to fetch orders:", response.status)
            setUserOrders([])
          }
        } catch (error) {
          console.error("Error fetching orders:", error)
          setUserOrders([])
        } finally {
          setLoading(false)
        }
      }

      fetchOrders()
    }
  }, [authState.isLoading, authState.isAuthenticated, authState.user?.id, authState.token, router])

  if (authState.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <section className="pt-28 md:pt-24 pb-16">
          <div className="container mx-auto px-6">
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div>
              <p className="text-gray-600">{t("loadingDashboard" as TranslationKey)}</p>
            </div>
          </div>
        </section>
      </div>
    )
  }

  if (!authState.isAuthenticated) {
    return null
  }

  const totalSpent = userOrders.reduce((sum, order) => sum + order.total, 0)
  const totalOrders = userOrders.length

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <section className="pt-28 md:pt-24 pb-16">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-light tracking-wider mb-2">{t("myDashboard" as TranslationKey)}</h1>
                <p className="text-gray-600">{t("welcomeBackName" as TranslationKey, { name: authState.user?.name || "" })}</p>
              </div>
              <Link href="/soiree/products">
                <Button className="bg-black text-white hover:bg-gray-800">
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {t("continueShopping" as TranslationKey) || "Continue Shopping"}
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Stats Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">{t("totalOrders" as TranslationKey)}</p>
                      <p className="text-2xl font-light">{totalOrders}</p>
                    </div>
                    <Package className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">{t("totalSpent" as TranslationKey)}</p>
                      <p className="text-2xl font-light">${totalSpent.toFixed(2)}</p>
                    </div>
                    <ShoppingCart className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">{t("accountStatus" as TranslationKey)}</p>
                      <p className="text-2xl font-light">{t("activeStatus" as TranslationKey)}</p>
                    </div>
                    <User className="h-8 w-8 text-rose-600" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Profile Information */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <User className="mr-2 h-5 w-5" />
                    {t("profileInformation" as TranslationKey)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600">{t("name" as TranslationKey)}</p>
                    <p className="font-medium">{authState.user?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{t("email" as TranslationKey)}</p>
                    <p className="font-medium">{authState.user?.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{t("accountType" as TranslationKey)}</p>
                    <Badge variant="secondary">{authState.user?.role}</Badge>
                  </div>
                  <Separator />
                  <Button variant="outline" className="w-full bg-transparent">
                    {t("editProfile" as TranslationKey)}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Order History */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="lg:col-span-2"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Package className="mr-2 h-5 w-5" />
                    {t("orderHistory" as TranslationKey)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
                      <p className="text-gray-600">{t("loadingOrders" as TranslationKey)}</p>
                    </div>
                  ) : userOrders.length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                      <p className="text-gray-600 mb-4">{t("noOrdersYet" as TranslationKey)}</p>
                      <Link href="/soiree/products">
                        <Button className="bg-black text-white hover:bg-gray-800">{t("startShopping" as TranslationKey)}</Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {userOrders.map((order) => (
                        <div key={order.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <p className="font-medium">{t("orderId" as TranslationKey, { id: order.id })}</p>
                              <p className="text-sm text-gray-600">{new Date(order.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                              <Badge
                                variant={
                                  order.status === "delivered"
                                    ? "default"
                                    : order.status === "shipped"
                                      ? "secondary"
                                      : order.status === "cancelled"
                                        ? "destructive"
                                        : "outline"
                                }
                              >
                                {order.status === "delivered" ? t("statusDelivered" as TranslationKey) : 
                                 order.status === "shipped" ? t("statusShipped" as TranslationKey) : 
                                 order.status === "cancelled" ? t("statusCancelled" as TranslationKey) : 
                                 t("statusPending" as TranslationKey)}
                              </Badge>
                              <p className="text-sm font-medium mt-1">${(order.total || 0).toFixed(2)}</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {(order.items || []).map((item: any, index: number) => (
                              <div key={index} className="flex items-center space-x-3">
                                <Image
                                  src={item.image || "/placeholder.svg"}
                                  alt={item.name}
                                  width={40}
                                  height={40}
                                  className="w-10 h-10 object-cover rounded"
                                />
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{item.name}</p>
                                  <p className="text-xs text-gray-600">
                                    {item.size} ({item.volume}) × {item.quantity}
                                  </p>

                                  {/* Gift Package Details */}
                                  {item.isGiftPackage && item.packageDetails && (
                                    <div className="mt-1 text-xs text-gray-500">
                                      <div className="flex items-center space-x-1 mb-1">
                                        <Package className="h-3 w-3" />
                                        <span>{t("packageContents" as TranslationKey)}</span>
                                      </div>
                                      <div className="space-y-1 ml-4">
                                        {item.packageDetails.sizes.map((sizeInfo: any, sizeIndex: number) => (
                                          <div key={sizeIndex} className="flex items-center space-x-1">
                                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                                            <span>{sizeInfo.size}: {sizeInfo.selectedProduct.productName}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Extra Days Details */}
                                  {(item.extraDayBefore || item.extraDayAfter) && (
                                    <div className="mt-2 text-xs text-rose-600 font-medium">
                                      {t("extraDays" as TranslationKey)}: {[item.extraDayBefore && t("dayBefore" as TranslationKey), item.extraDayAfter && t("dayAfter" as TranslationKey)].filter(Boolean).join(", ")}
                                    </div>
                                  )}
                                </div>
                                <p className="text-sm font-medium">${(item.price * item.quantity).toFixed(2)}</p>
                              </div>
                            ))}
                          </div>

                          <Separator className="my-3" />

                          <div className="flex items-center justify-between">
                            <div className="flex items-center text-sm text-gray-600">
                              <MapPin className="h-4 w-4 mr-1" />
                              {order.shippingAddress?.city || order.shipping_address?.city || "N/A"}, {order.shippingAddress?.country || order.shipping_address?.country || "N/A"}
                            </div>
                            <Link href={`/account/review/${order.id || order.order_id || order._id}`}>
                              <Button size="sm" variant="outline">
                                <Eye className="h-4 w-4 mr-1" />
                                {t("viewDetails" as TranslationKey)}
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  )
}
