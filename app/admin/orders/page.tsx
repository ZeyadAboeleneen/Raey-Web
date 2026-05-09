"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Package, User, MapPin, Eye, Trash2, CreditCard, ImageIcon } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { useAuth, usePermission } from "@/lib/auth-context"
import { useCurrencyFormatter } from "@/hooks/use-currency"

export default function AdminOrdersPage() {
  const router = useRouter()
  const { state: authState } = useAuth()
  const canViewOrders = usePermission("canViewOrders")
  const canDeleteOrders = usePermission("canDeleteOrders")
  const { formatPrice } = useCurrencyFormatter()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authState.isLoading) return

    if (!authState.isAuthenticated || !canViewOrders) {
      router.push("/admin/dashboard")
      return
    }

    const fetchOrders = async () => {
      try {
        const response = await fetch("/api/orders", {
          headers: { Authorization: `Bearer ${authState.token}` },
        })
        if (response.ok) {
          const data = await response.json()
          setOrders(data.orders || [])
        }
      } catch (error) {
        console.error("Error fetching orders:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()
  }, [authState, router, canViewOrders])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "delivered": return "bg-green-100 text-green-800"
      case "shipped": return "bg-blue-100 text-blue-800"
      case "processing": return "bg-yellow-100 text-yellow-800"
      case "cancelled": return "bg-red-100 text-red-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending": return "Order Placed"
      case "processing": return "Processing"
      case "shipped": return "Shipped"
      case "delivered": return "Delivered"
      case "cancelled": return "Cancelled"
      default: return status
    }
  }

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm("Are you sure you want to delete this order? This action cannot be undone.")) {
      return
    }

    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authState.token}`,
        },
      })

      if (response.ok) {
        setOrders((prev) => prev.filter((order) => order.id !== orderId))
      } else {
        const errorData = await response.json()
        alert(errorData.error || "Failed to delete order")
      }
    } catch (error) {
      console.error("Error deleting order:", error)
      alert("An error occurred while deleting order")
    }
  }

  if (authState.isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading orders...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="py-10 sm:py-12">
        <div className="container mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-6 sm:mb-8"
          >
            <div className="space-y-4">
              <Link href="/admin/dashboard" className="inline-flex items-center text-gray-600 hover:text-black transition-colors">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Link>
              <div>
                {/* Header hidden as requested */}
              </div>
            </div>
          </motion.div>

          <Card>
            <CardHeader>
              <CardTitle>All Orders ({orders.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-600">No orders found.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order.id} className="border rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between hover:shadow-md transition-shadow bg-white">
                      <div className="space-y-1flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm sm:text-base">Order #{order.id}</span>
                          <Badge className={`text-xs pb-0.5 ${getStatusColor(order.status)}`}>
                            {getStatusText(order.status)}
                          </Badge>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-500">Date: {new Date(order.createdAt).toLocaleString()}</p>
                        
                        {/* Product Names */}
                        {order.items?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {order.items.map((item: any, idx: number) => (
                              <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-medium border border-purple-100">
                                <Package className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate max-w-[180px]">{item.name || 'Unnamed Product'}</span>
                                {item.quantity > 1 && <span className="text-purple-400">×{item.quantity}</span>}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Rental dates if any item is a rental */}
                        {order.items?.some((item: any) => item.rentStart && item.rentEnd) && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {order.items.filter((item: any) => item.rentStart && item.rentEnd).map((item: any, idx: number) => (
                              <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs border border-amber-100">
                                📅 {new Date(item.rentStart).toLocaleDateString()} → {new Date(item.rentEnd).toLocaleDateString()}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Payment method & deposit */}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
                            <CreditCard className="h-3 w-3" />
                            {order.paymentMethod === "instapay" ? "Instapay" :
                             order.paymentMethod === "bank_transfer" ? "Bank Transfer" :
                             order.paymentMethod === "vodafone_cash" ? "Vodafone Cash" :
                             order.paymentMethod === "cod" ? "COD" :
                             order.paymentMethod}
                          </span>
                          {order.depositAmount > 0 && (
                            <span className="text-xs text-amber-700 font-medium">
                              Deposit: {formatPrice(order.depositAmount)}
                            </span>
                          )}
                          {order.paymentScreenshot && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 text-xs border border-green-100">
                              <ImageIcon className="h-3 w-3" />
                              Proof ✓
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center text-xs text-gray-600">
                            <User className="h-3 w-3 mr-1" />
                            <span className="truncate max-w-[120px]">{order.shippingAddress?.name || 'Guest'}</span>
                          </div>
                          <div className="flex items-center text-xs text-gray-600">
                            <MapPin className="h-3 w-3 mr-1" />
                            <span className="truncate max-w-[120px]">
                              {order.shippingAddress?.city || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3">
                        <div className="font-medium">{formatPrice(order.total || 0)}</div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          <Link href={`/admin/orders/${order.id}`} className="flex-1 sm:flex-none">
                            <Button size="sm" variant="outline" className="w-full min-h-[36px]">
                              <Eye className="h-4 w-4 mr-1" /> View Details
                            </Button>
                          </Link>
                          {canDeleteOrders && (
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              className="min-h-[36px]"
                              onClick={(e) => {
                                e.preventDefault()
                                handleDeleteOrder(order.id)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
