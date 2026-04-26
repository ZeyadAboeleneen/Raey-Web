"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Package, User, MapPin, Eye } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { useAuth } from "@/lib/auth-context"
import { useCurrencyFormatter } from "@/hooks/use-currency"

export default function AdminOrdersPage() {
  const router = useRouter()
  const { state: authState } = useAuth()
  const { formatPrice } = useCurrencyFormatter()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authState.isLoading) return

    if (!authState.isAuthenticated || authState.user?.role !== "admin") {
      router.push("/auth/login")
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
  }, [authState, router])

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
      <Navigation />
      <section className="py-16 sm:py-24">
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
                <h1 className="text-2xl sm:text-3xl font-light tracking-wider mb-2">Order Management</h1>
                <p className="text-gray-600 text-sm sm:text-base">View and manage all customer orders.</p>
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
                        <Link href={`/admin/orders/${order.id}`}>
                          <Button size="sm" variant="outline" className="w-full sm:w-auto min-h-[36px]">
                            <Eye className="h-4 w-4 mr-1" /> View Details
                          </Button>
                        </Link>
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
