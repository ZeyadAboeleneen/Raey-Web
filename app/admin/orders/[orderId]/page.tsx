"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { ArrowLeft, Package, User, MapPin, CreditCard, Calendar, Phone, Mail, Ruler, Trash2, ImageIcon, DollarSign, Wallet } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { useAuth, usePermission } from "@/lib/auth-context"

interface OrderDetails {
  _id: string
  id: string
  userId: string
  items: Array<{
    id: string
    name: string
    price: number
    size: string
    volume: string
    image: string
    branch: string
    quantity: number
    type?: string
    rentStart?: string
    rentEnd?: string
    extraDayBefore?: boolean
    extraDayAfter?: boolean
    isGiftPackage?: boolean
    customMeasurements?: {
      unit: "cm" | "inch"
      values: {
        shoulder?: string
        breast: string
        waist: string
        hips: string
        sleeve: string
        length?: string
      }
    }
    selectedProducts?: Array<{
      size: string
      volume: string
      selectedProduct: {
        productId: string
        productName: string
        productImage: string
        productDescription: string
      }
    }>
    packageDetails?: {
      totalSizes: number
      packagePrice: number
      sizes: Array<{
        size: string
        volume: string
        selectedProduct: {
          productId: string
          productName: string
          productImage: string
          productDescription: string
        }
      }>
    }
  }>
  total: number
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled"
  shippingAddress: {
    name: string
    email: string
    phone: string
    secondaryPhone: string
    address: string
    city: string
    governorate?: string
    country?: string
    countryCode?: string
    postalCode: string
  }
  paymentMethod: "instapay" | "bank_transfer" | "vodafone_cash" | "cod"
  paymentDetails?: {
    cardNumber: string
    cardName: string
  }
  paymentScreenshot?: string | null
  paymentStatus?: "pending" | "approved" | "rejected" | "pending_review"
  paymentFraudReason?: string | null
  paymentAiConfidence?: number | null
  discountCode?: string
  discountAmount?: number
  depositAmount?: number
  remainingAmount?: number
  createdAt: string
  updatedAt: string
}

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
}

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
]

export default function AdminOrderDetailsPage() {
  const { orderId } = useParams() as { orderId: string }
  const { state: authState } = useAuth()
  const canViewOrders = usePermission("canViewOrders")
  const canUpdateOrders = usePermission("canUpdateOrders")
  const canDeleteOrders = usePermission("canDeleteOrders")
  const router = useRouter()
  const [order, setOrder] = useState<OrderDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [depositDialog, setDepositDialog] = useState<{ open: boolean; mode: "cancel" | "delete"; pendingStatus?: string }>({
    open: false,
    mode: "cancel",
  })

  const handleAdminDecision = async (decision: "approved" | "rejected") => {
    setUpdating(true)
    setError("")
    setSuccess("")
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/decision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authState.token}`,
        },
        body: JSON.stringify({
          decision,
          reason: `Manually reviewed and ${decision} by Admin.`
        }),
      })

      if (response.ok) {
        if (decision === "approved") {
          setSuccess("Payment successfully approved! The order has been synchronized to the MSSQL ERP Booking database.")
        } else {
          setSuccess("Payment successfully rejected! The booking reservation has been successfully removed from the MSSQL ERP database.")
        }
        // Refetch order details to show the updated status
        await fetchOrderDetails()
      } else {
        const errData = await response.json()
        setError(errData.error || `Failed to submit decision: ${decision}`)
      }
    } catch (err: any) {
      console.error("Decision error:", err)
      setError("An error occurred while submitting payment decision")
    } finally {
      setUpdating(false)
    }
  }

  const handleAiVerification = async () => {
    setUpdating(true)
    setError("")
    setSuccess("")
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/verify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authState.token}`,
        },
      })

      if (response.ok) {
        setSuccess("AI payment verification completed successfully!")
        await fetchOrderDetails()
      } else {
        const errData = await response.json()
        setError(errData.error || "Failed to trigger AI payment verification")
      }
    } catch (err: any) {
      console.error("AI verify error:", err)
      setError("An error occurred during AI verification")
    } finally {
      setUpdating(false)
    }
  }

  useEffect(() => {
    if (!authState.isLoading && (!authState.isAuthenticated || !canViewOrders)) {
      router.push("/admin/dashboard")
      return
    }
    if (authState.isAuthenticated && canViewOrders) {
      fetchOrderDetails()
    }
  }, [authState, orderId, router, canViewOrders])

  const fetchOrderDetails = async () => {
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${authState.token}` },
      })
      if (response.ok) {
        const data = await response.json()
        setOrder(data)
      } else setError("Failed to fetch order details")
    } catch (error) {
      console.error("Error fetching order:", error)
      setError("An error occurred while fetching order details")
    } finally {
      setLoading(false)
    }
  }

  const updateOrderStatus = async (newStatus: string, refundDeposit?: boolean) => {
    setUpdating(true)
    setError("")
    setSuccess("")
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authState.token}`,
        },
        body: JSON.stringify({ status: newStatus, refundDeposit }),
      })
      if (response.ok) {
        setOrder((prev) => (prev ? { ...prev, status: newStatus as any } : null))
        setSuccess("Order status updated successfully")
        setTimeout(() => setSuccess(""), 3000)
      } else {
        const errorData = await response.json()
        setError(errorData.error || "Failed to update order status")
      }
    } catch (error) {
      console.error("Error updating order:", error)
      setError("An error occurred while updating order status")
    } finally {
      setUpdating(false)
    }
  }

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "cancelled" && order?.status !== "cancelled") {
      if (!confirm("Cancel this order? This will release any reserved dates for these items.")) return
      if ((order?.depositAmount || 0) > 0) {
        setDepositDialog({ open: true, mode: "cancel", pendingStatus: newStatus })
        return
      }
      updateOrderStatus(newStatus, false)
      return
    }
    updateOrderStatus(newStatus)
  }

  const handleDeleteOrder = () => {
    if (!confirm("Are you sure you want to delete this order? This action cannot be undone and will release any reserved dates for these items.")) {
      return
    }
    if ((order?.depositAmount || 0) > 0) {
      setDepositDialog({ open: true, mode: "delete" })
      return
    }
    void deleteOrder(false)
  }

  const deleteOrder = async (refundDeposit: boolean) => {
    setUpdating(true)
    setError("")

    try {
      const response = await fetch(`/api/admin/orders/${orderId}?refundDeposit=${refundDeposit}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authState.token}`,
        },
      })

      if (response.ok) {
        router.push("/admin/dashboard")
      } else {
        const errorData = await response.json()
        setError(errorData.error || "Failed to delete order")
      }
    } catch (error) {
      console.error("Error deleting order:", error)
      setError("An error occurred while deleting order")
    } finally {
      setUpdating(false)
    }
  }

  const resolveDepositDialog = (refundDeposit: boolean) => {
    const { mode, pendingStatus } = depositDialog
    setDepositDialog({ open: false, mode: "cancel" })
    if (mode === "cancel" && pendingStatus) {
      updateOrderStatus(pendingStatus, refundDeposit)
    } else if (mode === "delete") {
      void deleteOrder(refundDeposit)
    }
  }

  if (authState.isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        
        <div className="pt-20 flex justify-center">
          <div>
            <div className="animate-spin h-12 w-12 border-b-2 border-black rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading order details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!authState.isAuthenticated || !canViewOrders) return null

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50">
        
        <div className="pt-20 flex justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-light mb-4">Order not found</h1>
            <Link href="/admin/dashboard">
              <Button className="bg-black text-white">Back to Dashboard</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Format price in EGP (dashboard always shows EGP)
  const formatPriceEGP = (price: number) => {
    return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(price)
  }

  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const discount = order.discountAmount || 0
  const total = order.total

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="pt-10 pb-16">
        <div className="container mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="mb-8">
            <Link href="/admin/dashboard" className="inline-flex items-center text-gray-600 hover:text-black mb-6">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Link>
            <div className="flex justify-between items-center">
              {/* Header hidden as requested */}
              <div className="flex items-center gap-4">
                <Badge className={`px-3 py-1 text-sm font-medium ${statusColors[order.status]}`}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </Badge>
                {canDeleteOrders && (
                  <Button variant="destructive" size="sm" onClick={handleDeleteOrder} disabled={updating}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Order
                  </Button>
                )}
              </div>
            </div>
          </motion.div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-600">{error}</AlertDescription>
              </Alert>
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <Alert className="border-green-200 bg-green-50">
                <AlertDescription className="text-green-600">{success}</AlertDescription>
              </Alert>
            </motion.div>
          )}

          {order.paymentStatus === "pending_review" && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <Alert className="border-amber-300 bg-amber-50">
                <AlertDescription className="text-amber-800 flex items-center gap-2">
                  <span className="text-lg">⚠️</span>
                  <span>
                    <strong>Awaiting Manual Review:</strong> The AI flagged this payment for manual verification.
                    {order.paymentFraudReason && ` Reason: ${order.paymentFraudReason}`}
                  </span>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
          {order.paymentStatus === "rejected" && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <Alert className="border-red-300 bg-red-50">
                <AlertDescription className="text-red-800 flex items-center gap-2">
                  <span className="text-lg">❌</span>
                  <span>
                    <strong>AI Flagged/Rejected:</strong> This payment screenshot was rejected as invalid.
                    {order.paymentFraudReason && ` Reason: ${order.paymentFraudReason}`}
                  </span>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
          {order.paymentStatus === "approved" && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <Alert className="border-green-300 bg-green-50">
                <AlertDescription className="text-green-800 flex items-center gap-2">
                  <span className="text-lg">✅</span>
                  <span>
                    <strong>Payment Approved:</strong> Successfully verified and synced to the MSSQL ERP Booking database.
                  </span>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Package className="mr-2 h-5 w-5" />
                    Order Items ({order.items.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {order.items.map((item, index) => (
                      <div key={index} className="flex space-x-4 p-4 border rounded-lg">
                        <Image src={item.image || "/placeholder.svg"} alt={item.name} width={80} height={80} className="rounded-lg object-cover" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-lg">{item.name}</h3>
                            {(item as any).isExclusive && (
                              <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider border border-amber-200">
                                First Rental
                              </span>
                            )}
                          </div>
                          <p className="text-gray-600">
                            <span className="font-semibold text-amber-600 mr-1 capitalize">
                              {(item as any).collection || (item.type === "rent" || (item.branch && item.branch !== "sell-dresses") || !item.branch ? "Rent" : "Buy")}:
                            </span>
                            {item.size === "custom" ? "Custom Size" : item.size} ({item.volume}) • Quantity: {item.quantity}
                          </p>
                          {(item.type === "rent" || (item.branch && item.branch !== "sell-dresses") || !item.branch) && (
                            <p className="text-sm text-gray-500 mt-1">
                              Duration: {item.rentStart && item.rentEnd ? `${new Date(item.rentStart).toLocaleDateString()} - ${new Date(item.rentEnd).toLocaleDateString()}` : "Not Selected/Legacy Order"}
                            </p>
                          )}
                          {(item.extraDayBefore || item.extraDayAfter) && (
                            <p className="text-sm font-medium text-rose-600 mt-1">
                              Extra Days: {[item.extraDayBefore && "+1 Day Before", item.extraDayAfter && "+1 Day After"].filter(Boolean).join(", ")}
                            </p>
                          )}
                          {item.customMeasurements && (
                            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                              <div className="flex items-center space-x-2 mb-2">
                                <Ruler className="h-4 w-4 text-blue-600" />
                                <span className="text-sm font-medium text-blue-800">Custom Measurements</span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {item.customMeasurements.unit.toUpperCase()}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex items-center space-x-2 p-2 bg-white rounded border border-gray-100">
                                  <div className="p-1 bg-blue-50 rounded">
                                    <Ruler className="h-3 w-3 text-blue-500" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">Shoulder</p>
                                    <p className="text-sm font-medium">{item.customMeasurements.values.shoulder || "Not specified"}</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2 p-2 bg-white rounded border border-gray-100">
                                  <div className="p-1 bg-blue-50 rounded">
                                    <Ruler className="h-3 w-3 text-blue-500" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">Breast</p>
                                    <p className="text-sm font-medium">{item.customMeasurements.values.breast}</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2 p-2 bg-white rounded border border-gray-100">
                                  <div className="p-1 bg-blue-50 rounded">
                                    <Ruler className="h-3 w-3 text-blue-500" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">Waist</p>
                                    <p className="text-sm font-medium">{item.customMeasurements.values.waist}</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2 p-2 bg-white rounded border border-gray-100">
                                  <div className="p-1 bg-blue-50 rounded">
                                    <Ruler className="h-3 w-3 text-blue-500" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">Hips</p>
                                    <p className="text-sm font-medium">{item.customMeasurements.values.hips}</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2 p-2 bg-white rounded border border-gray-100">
                                  <div className="p-1 bg-blue-50 rounded">
                                    <Ruler className="h-3 w-3 text-blue-500" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">Sleeve</p>
                                    <p className="text-sm font-medium">{item.customMeasurements.values.sleeve || "Not specified"}</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2 p-2 bg-white rounded border border-gray-100">
                                  <div className="p-1 bg-blue-50 rounded">
                                    <Ruler className="h-3 w-3 text-blue-500" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">Length</p>
                                    <p className="text-sm font-medium">{item.customMeasurements.values.length || "Not specified"}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          <p className="text-sm text-gray-500">branch: {item.branch}</p>

                          {/* Gift Package Details */}
                          {item.isGiftPackage && item.packageDetails && (
                            <div className="mt-3 p-3 bg-gray-50 rounded-lg border">
                              <div className="flex items-center space-x-2 mb-2">
                                <Package className="h-4 w-4 text-gray-600" />
                                <span className="text-sm font-medium text-gray-700">Gift Package Contents:</span>
                              </div>
                              <div className="space-y-2">
                                {item.packageDetails.sizes.map((sizeInfo, sizeIndex) => (
                                  <div key={sizeIndex} className="flex items-center space-x-2 text-sm">
                                    <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                                    <span className="text-gray-600">{sizeInfo.size} ({sizeInfo.volume}):</span>
                                    <span className="font-medium">{sizeInfo.selectedProduct.productName}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Separator className="my-6" />

                  <div className="space-y-2">
                    <div className="flex justify-between"><span>Subtotal</span><span>{formatPriceEGP(subtotal)}</span></div>
                    {order.discountCode && <div className="flex justify-between text-green-600"><span>Discount ({order.discountCode})</span><span>-{formatPriceEGP(discount)}</span></div>}
                    <Separator />
                    <div className="flex justify-between text-lg font-medium"><span>Total</span><span>{formatPriceEGP(total)}</span></div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Side Info Cards */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Update Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={order.status} onValueChange={handleStatusChange} disabled={updating || !canUpdateOrders}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {updating && <p className="text-sm text-gray-600 mt-2">Updating status...</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <User className="mr-2 h-5 w-5" />
                    Customer Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">{order.shippingAddress.name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Mail className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">{order.shippingAddress.email}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">{order.shippingAddress.phone}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">{order.shippingAddress.secondaryPhone}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <MapPin className="mr-2 h-5 w-5" />
                    Shipping Address
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm space-y-1">
                    <p>{order.shippingAddress.address}</p>
                    <p>
                      {order.shippingAddress.city}
                      {order.shippingAddress.country
                        ? `, ${order.shippingAddress.country}`
                        : order.shippingAddress.governorate
                          ? `, ${order.shippingAddress.governorate}`
                          : ""}
                    </p>
                    {order.shippingAddress.postalCode && <p>Postal Code: {order.shippingAddress.postalCode}</p>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <CreditCard className="mr-2 h-5 w-5" />
                    Payment Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Method</span>
                      <span className="text-sm font-medium">
                        {order.paymentMethod === "instapay" ? "Instapay" :
                         order.paymentMethod === "bank_transfer" ? "Bank Transfer" :
                         order.paymentMethod === "vodafone_cash" ? "Vodafone Cash" :
                         order.paymentMethod === "cod" ? "Cash on Delivery" :
                         order.paymentMethod}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Deposit</span>
                      <span className="text-sm font-medium text-amber-700">{formatPriceEGP(order.depositAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Remaining</span>
                      <span className="text-sm font-medium text-red-600">{formatPriceEGP(order.remainingAmount || 0)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Proof Screenshot */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <ImageIcon className="mr-2 h-5 w-5" />
                    Payment Proof
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {order.paymentScreenshot ? (
                    <div className="space-y-4">
                      {/* AI Verification Details */}
                      <div className="p-3 bg-gray-50 rounded-lg border text-sm space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">AI Confidence:</span>
                          <span className="font-semibold text-gray-800">
                            {order.paymentAiConfidence !== null && order.paymentAiConfidence !== undefined
                              ? `${Math.round(order.paymentAiConfidence * 100)}%`
                              : "Pending verification / Not processed"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">Verification Status:</span>
                          <span className={`font-semibold capitalize ${
                            order.paymentStatus === 'approved' ? 'text-green-600' :
                            order.paymentStatus === 'rejected' ? 'text-red-600' :
                            order.paymentStatus === 'pending_review' ? 'text-amber-600' :
                            'text-gray-600'
                          }`}>
                            {order.paymentStatus === 'pending_review' ? 'Awaiting Review' : order.paymentStatus}
                          </span>
                        </div>
                        {order.paymentFraudReason && (
                          <div className="pt-2 border-t text-xs text-gray-600">
                            <strong className="text-red-600">AI Flag Reason:</strong> {order.paymentFraudReason}
                          </div>
                        )}
                        {(order.paymentAiConfidence === null || order.paymentAiConfidence === undefined) && (
                          <div className="pt-2 border-t mt-2">
                            <button
                              onClick={handleAiVerification}
                              disabled={updating}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-3 rounded-md text-xs transition duration-200 flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"
                            >
                              {updating ? "Processing AI..." : "🔍 Run AI Verification Now"}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="relative w-full rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                        <a href={order.paymentScreenshot} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={order.paymentScreenshot}
                            alt="Payment proof screenshot"
                            className="w-full h-auto object-contain cursor-pointer hover:opacity-90 transition-opacity max-h-[400px]"
                          />
                        </a>
                      </div>
                      <p className="text-xs text-gray-500 text-center">Click image to view full size</p>

                      {/* Admin Quick Action Decision Buttons */}
                      {order.paymentStatus !== "approved" ? (
                        <div className="grid grid-cols-2 gap-2 pt-3 border-t">
                          <Button
                            variant="default"
                            className="bg-green-600 hover:bg-green-700 text-white font-medium w-full"
                            onClick={() => handleAdminDecision("approved")}
                            disabled={updating}
                          >
                            Approve & Book ERP
                          </Button>
                          <Button
                            variant="destructive"
                            className="bg-red-600 hover:bg-red-700 text-white font-medium w-full"
                            onClick={() => handleAdminDecision("rejected")}
                            disabled={updating}
                          >
                            Reject & Block
                          </Button>
                        </div>
                      ) : (
                        <div className="pt-3 border-t">
                          <Button
                            variant="destructive"
                            className="bg-red-600 hover:bg-red-700 text-white font-medium w-full flex items-center justify-center gap-1"
                            onClick={() => handleAdminDecision("rejected")}
                            disabled={updating}
                          >
                            ❌ Reject & Remove Booking from ERP
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <ImageIcon className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                      <p className="text-sm text-gray-500">No payment screenshot uploaded</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Calendar className="mr-2 h-5 w-5" />
                    Order Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Created</span>
                      <span className="text-sm">{new Date(order.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Last Updated</span>
                      <span className="text-sm">{new Date(order.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={depositDialog.open} onOpenChange={(open) => !open && setDepositDialog({ open: false, mode: "cancel" })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 mb-2">
              <Wallet className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-center">Return the deposit?</DialogTitle>
            <DialogDescription className="text-center">
              This order has a deposit of{" "}
              <span className="font-semibold text-gray-900">{formatPriceEGP(order?.depositAmount || 0)}</span>{" "}
              recorded in the cash drawer (خزنة).
              <br />
              Choose whether to return it to the customer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-col gap-2 mt-2">
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => resolveDepositDialog(true)}
            >
              Return Deposit
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => resolveDepositDialog(false)}
            >
              Don't Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
