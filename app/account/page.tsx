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
import { Package, ShoppingCart, User, MapPin, ArrowLeft, Eye, Edit, Star, RefreshCw, X } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { useAuth } from "@/lib/auth-context"
import { useCurrencyFormatter } from "@/hooks/use-currency"

// Add this helper function to get the auth token
const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  
  const authData = localStorage.getItem("sense_auth");
  if (!authData) return null;
  
  try {
    const parsedData = JSON.parse(authData);
    return parsedData.token || null;
  } catch (error) {
    console.error("Error parsing auth data:", error);
    return null;
  }
};

export default function MyAccountPage() {
  const router = useRouter()

  // Page disabled: immediately redirect to home
  useEffect(() => {
    router.replace("/")
  }, [router])

  return null

  const { state: authState } = useAuth()
  const [userOrders, setUserOrders] = useState<any[]>([])
  const [userReviews, setUserReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [currentOrder, setCurrentOrder] = useState<any>(null)
  const [currentItem, setCurrentItem] = useState<any>(null)
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'orders' | 'reviews'>('orders')
  const { formatPrice } = useCurrencyFormatter()

  useEffect(() => {
    // Wait for auth state to be fully loaded before making decisions
    if (authState.isLoading) {
      return
    }

    if (!authState.isAuthenticated) {
      router.push("/auth/login")
      return
    }

    if (authState.user?.role === "admin") {
      router.push("/admin/dashboard")
      return
    }

    // Use the helper function to get the token
    const token = getAuthToken();
    if (token) {
      fetchOrders(token)
      fetchUserReviews(token)
      const interval = setInterval(() => {
        fetchOrders(token, true)
        fetchUserReviews(token, true)
      }, 30000)
      return () => clearInterval(interval)
    }
  }, [authState.isLoading, authState.isAuthenticated, authState.user?.role, router])

  const fetchOrders = async (token: string, silent = false) => {
    if (!silent) setRefreshing(true)

    try {
      const response = await fetch("/api/orders", {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        const orders = await response.json()
        setUserOrders(orders)
      } else if (response.status === 401) {
        // Token might be expired, redirect to login
        console.error("Authentication failed, redirecting to login")
        router.push("/auth/login")
      }
    } catch (error) {
      console.error("Error fetching orders:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchUserReviews = async (token: string, silent = false) => {
    if (!silent) setRefreshing(true)

    try {
      const response = await fetch(`/api/reviews?userId=${authState.user?.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      
      if (response.ok) {
        const data = await response.json()
        setUserReviews(data || [])
      } else if (response.status === 401) {
        // Token might be expired, redirect to login
        console.error("Authentication failed, redirecting to login")
        router.push("/auth/login")
      }
    } catch (error) {
      console.error("Error fetching reviews:", error)
    }
  }

  const handleRefresh = () => {
    const token = getAuthToken();
    if (token) {
      fetchOrders(token)
      fetchUserReviews(token)
    }
  }

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

  const handleReviewClick = (order: any, item: any) => {
    setCurrentOrder(order)
    setCurrentItem(item)
    setReviewModalOpen(true)
    setRating(item.review?.rating || 0)
    setReviewText(item.review?.comment || "")
    setSubmitError(null)
  }

  const handleViewDetails = (order: any) => {
    setSelectedOrder(order)
    setOrderDetailsOpen(true)
  }

  const submitReview = async () => {

    if (!currentOrder || !currentItem) {
      setSubmitError("Missing required data for review")
      return
    }

    const token = getAuthToken();
    if (!token) {
      setSubmitError("Authentication token not found")
      return
    }

    const productId = currentItem.productId || currentItem.id || currentItem.product_id

    if (!productId) {
      setSubmitError("Product information is incomplete")
      return
    }

    const orderId = currentOrder.id || currentOrder._id

    if (!orderId) {
      setSubmitError("Order information is incomplete")
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    
    try {
      const response = await fetch("/api/reviews/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: productId,
          orderId: orderId,
          rating: rating,
          comment: reviewText,
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.message || "Failed to submit review")
      }

      // Update local state
      const updatedOrders = userOrders.map(order => {
        const currentOrderId = order.id || order._id
        if (currentOrderId === orderId) {
          const updatedItems = order.items.map((item: any) => {
            const itemProductId = item.productId || item.id || item.product_id
            if (itemProductId === productId) {
              return {
                ...item,
                reviewed: true,

                review: { 
                  rating: rating, 
                  comment: reviewText,
                  userName: authState.user?.name || authState.user?.email 
                }
              }
            }
            return item
          })
          return { ...order, items: updatedItems }
        }
        return order
      })
      
      setUserOrders(updatedOrders)
      setReviewModalOpen(false)
      fetchUserReviews(token) // Refresh reviews after submission
      
    } catch (error: any) {
      console.error("Review submission error:", error)
      setSubmitError(error.message || "An error occurred while submitting your review")
    } finally {
      setSubmitting(false)
    }
  }

  // Show loading state while auth is being initialized
  if (authState.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <section className="pt-32 pb-16">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="text-center py-12 sm:py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div>
              <p className="text-gray-600">Loading account...</p>
            </div>
          </div>
        </section>
      </div>
    )
  }

  if (!authState.isAuthenticated || authState.user?.role === "admin") {
    return null
  }

  const totalSpent = userOrders.reduce((sum, order) => sum + (order.total || 0), 0)
  const totalOrders = userOrders.length
  const activeOrders = userOrders.filter((order) => 
    ["pending", "processing", "shipped"].includes(order.status)
  ).length

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <section className="pt-32 pb-16">
        <div className="container mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-6 sm:mb-8"
          >
            <Link href="/" className="inline-flex items-center text-gray-600 hover:text-black transition-colors mb-4 sm:mb-6">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-light tracking-wider mb-2">My Account</h1>
                <p className="text-gray-600">Welcome back, {authState.user?.name}</p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Button
                  onClick={handleRefresh}
                  variant="outline"
                  size="sm"
                  disabled={refreshing}
                  className="bg-transparent order-2 sm:order-1"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? "Updating..." : "Refresh"}
                </Button>
                <Link href="/soiree/products" className="order-1 sm:order-2">
                  <Button className="bg-black text-white hover:bg-gray-800 w-full sm:w-auto">
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    Continue Shopping
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              <Card className="h-full">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">Total Orders</p>
                      <p className="text-xl sm:text-2xl font-light">{totalOrders}</p>
                    </div>
                    <Package className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <Card className="h-full">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">Active Orders</p>
                      <p className="text-xl sm:text-2xl font-light">{activeOrders}</p>
                    </div>
                    <ShoppingCart className="h-6 w-6 sm:h-8 sm:w-8 text-orange-600" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="sm:col-span-2 lg:col-span-1"
            >
              <Card className="h-full">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">Total Spent</p>
                      <p className="text-xl sm:text-2xl font-light">{formatPrice(totalSpent)}</p>
                    </div>
                    <User className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="lg:order-1 order-2"
            >
              <Card className="h-full">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center text-lg">
                    <User className="mr-2 h-5 w-5" />
                    Profile Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600">Name</p>
                    <p className="font-medium break-words">{authState.user?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-medium break-words text-sm">{authState.user?.email}</p>
                  </div>
                  <Separator />
                  <Link href="/account/edit">
                    <Button variant="outline" className="w-full bg-transparent">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Profile
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="lg:col-span-2 lg:order-2 order-1"
            >
              <Card className="h-full">
                <CardHeader className="pb-2 sm:pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <CardTitle className="flex items-center text-lg">
                      <Package className="mr-2 h-5 w-5" />
                      My Activity
                    </CardTitle>
                    {userOrders.length > 0 && (
                      <div className="text-xs sm:text-sm text-gray-500">Last updated: {new Date().toLocaleTimeString()}</div>
                    )}
                  </div>
                  <div className="flex border-b mt-3 sm:mt-4 -mx-1" role="tablist" aria-label="Account activity tabs">
                    <button
                      role="tab"
                      aria-selected={activeTab === 'orders'}
                      aria-controls="orders-panel"
                      className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-3 font-medium text-center transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-inset ${
                        activeTab === 'orders' 
                          ? 'text-black border-b-2 border-black' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      onClick={() => setActiveTab('orders')}
                    >
                      Orders
                    </button>
                    <button
                      role="tab"
                      aria-selected={activeTab === 'reviews'}
                      aria-controls="reviews-panel"
                      className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-3 font-medium text-center transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-inset ${
                        activeTab === 'reviews' 
                          ? 'text-black border-b-2 border-black' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      onClick={() => setActiveTab('reviews')}
                    >
                      Reviews
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8" aria-live="polite">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div>
                      <p className="text-gray-600">Loading...</p>
                    </div>
                  ) : activeTab === 'orders' ? (
                    <div id="orders-panel" role="tabpanel" aria-labelledby="orders-tab">
                      {userOrders.length === 0 ? (
                        <div className="text-center py-8">
                          <Package className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                          <p className="text-gray-600 mb-4">No orders yet</p>
                          <Link href="/soiree/products">
                            <Button className="bg-black text-white hover:bg-gray-800">Start Shopping</Button>
                          </Link>
                        </div>
                      ) : (
                        <div className="space-y-3 sm:space-y-4">
                          {userOrders.map((order) => (
                            <div key={order.id} className="border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 sm:mb-4">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm sm:text-base truncate">Order #{order.id}</p>
                                  <p className="text-xs sm:text-sm text-gray-600">{new Date(order.createdAt).toLocaleDateString()}</p>
                                </div>
                                <div className="flex flex-row sm:flex-col items-start sm:items-end justify-between sm:justify-start gap-2 sm:gap-1">
                                  <Badge className={`text-xs ${getStatusColor(order.status)}`}>
                                    {getStatusText(order.status)}
                                  </Badge>
                                  <p className="text-sm font-medium">{formatPrice(order.total || 0)}</p>
                                </div>
                              </div>

                              <div className="space-y-3">
                                {order.items?.map((item: any, index: number) => (
                                  <div key={index} className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                                    <div className="flex items-start space-x-3 min-w-0 flex-1">
                                      <Image
                                        src={item.image || "/placeholder.svg"}
                                        alt={item.name}
                                        width={40}
                                        height={40}
                                        className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded flex-shrink-0"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate">{item.name}</p>
                                        <p className="text-xs text-gray-600">
                                          {item.size} ({item.volume}) × {item.quantity}
                                        </p>
                                        {order.status === "delivered" && !item.review && (
                                          <p className="mt-1 text-xs text-green-600">
                                            Delivered  you can now rate this product
                                          </p>
                                        )}
                                        {item.review && (
                                          <div className="flex items-center mt-1">
                                            {[...Array(5)].map((_, i) => (
                                              <Star
                                                key={i}
                                                className={`h-3 w-3 ${i < item.review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                                              />
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:flex-shrink-0">
                                      <p className="text-sm font-medium">{formatPrice((item.price || 0) * (item.quantity || 1))}</p>
                                      {order.status === "delivered" && (
                                        item.review ? (
                                          <div className="flex items-center text-xs text-gray-500 bg-gray-100 px-3 py-2 rounded border border-gray-200 transition-all duration-200">
                                            <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
                                            Already Reviewed ({item.review.rating}/5)
                                          </div>
                                        ) : (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-yellow-600 border-yellow-600 hover:bg-yellow-50 bg-transparent text-xs px-3 py-2 min-h-[36px] touch-manipulation"
                                            onClick={() => handleReviewClick(order, item)}
                                          >
                                            <Star className="h-3 w-3 mr-1" />
                                            Rate
                                          </Button>
                                        )
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <Separator className="my-3" />

                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="flex items-center text-xs sm:text-sm text-gray-600 min-w-0">
                                  <MapPin className="h-3 w-3 sm:h-4 sm:w-4 mr-1 flex-shrink-0" />
                                  <span className="truncate">
                                    {order.shippingAddress?.city || 'N/A'}, {order.shippingAddress?.country || order.shippingAddress?.governorate || 'N/A'}
                                  </span>
                                </div>
                                <div className="flex-shrink-0">
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="bg-transparent w-full sm:w-auto min-h-[36px] touch-manipulation"
                                    onClick={() => handleViewDetails(order)}
                                  >
                                    <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                    View Details
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div id="reviews-panel" role="tabpanel" aria-labelledby="reviews-tab">
                      <div className="space-y-4">
                        {userReviews.length === 0 ? (
                          <div className="text-center py-8">
                            <Star className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                            <p className="text-gray-600 mb-4">No reviews yet</p>
                            <p className="text-sm text-gray-500">Your product reviews will appear here</p>
                          </div>
                        ) : (
                          userReviews.map((review) => (
                            <div key={review._id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                              <div className="flex items-start">
                                <div className="flex-1">
                                  <div className="flex items-center mb-2">
                                    {[...Array(5)].map((_, i) => (
                                      <Star
                                        key={i}
                                        className={`h-5 w-5 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                                      />
                                    ))}
                                    <span className="ml-2 text-sm text-gray-500">
                                      {new Date(review.createdAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                  {review.comment && (
                                    <p className="text-gray-700 mb-3">{review.comment}</p>
                                  )}
                                  {review.productId && (
                                    <div className="flex items-center">
                                      <div className="text-sm text-gray-600">
                                        Reviewed product: {review.productName || 'Product #' + review.productId}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {reviewModalOpen && currentOrder && currentItem && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 100 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="bg-white rounded-t-lg sm:rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
          >
            <div className="p-4 sm:p-6">
              {/* Mobile handle bar */}
              <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden"></div>
              
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-semibold">Rate Product</h3>
                <button 
                  onClick={() => setReviewModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700 p-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="flex items-center mb-4 sm:mb-6">
                <Image
                  src={currentItem.image || "/placeholder.svg"}
                  alt={currentItem.name}
                  width={60}
                  height={60}
                  className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded mr-3 sm:mr-4"
                />
                <div className="min-w-0">
                  <p className="font-medium text-sm sm:text-base truncate">{currentItem.name}</p>
                  <p className="text-xs sm:text-sm text-gray-600">
                    {currentItem.size} ({currentItem.volume})
                  </p>
                  <p className="text-xs sm:text-sm">Order #{currentOrder.id}</p>
                </div>
              </div>
              
              <div className="mb-4 sm:mb-6">
                <p className="mb-3 font-medium text-sm sm:text-base">Your Rating</p>
                <div className="flex justify-center space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className="text-2xl focus:outline-none p-2 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      <Star
                        className={`h-7 w-7 sm:h-8 sm:w-8 ${
                          star <= rating
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mb-4 sm:mb-6">
                <p className="mb-3 font-medium text-sm sm:text-base">Your Review (Optional)</p>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Share your experience with this product..."
                  className="w-full h-24 sm:h-32 p-3 border rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm resize-none"
                />
              </div>

              {submitError && (
                <p className="text-red-500 text-sm mb-4">{submitError}</p>
              )}
              
              <Button
                onClick={submitReview}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-white h-12 text-base font-medium"
                disabled={submitting || rating === 0}
              >
                {submitting 
                  ? "Submitting..." 
                  : rating === 0 
                    ? "Select Rating" 
                    : "Submit Review"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {orderDetailsOpen && selectedOrder && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 100 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="bg-white rounded-t-lg sm:rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="p-4 sm:p-6">
              {/* Mobile handle bar */}
              <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden"></div>
              
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-semibold truncate mr-4">Order Details #{selectedOrder.id}</h3>
                <button 
                  onClick={() => setOrderDetailsOpen(false)}
                  className="text-gray-500 hover:text-gray-700 p-1 flex-shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                <div>
                  <h4 className="font-medium mb-2">Shipping Information</h4>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-gray-600">Name:</span> {selectedOrder.shippingAddress?.name || 'N/A'}</p>
                    <p><span className="text-gray-600">Phone:</span> {selectedOrder.shippingAddress?.phone || 'N/A'}</p>
                    <p><span className="text-gray-600">Address:</span> {selectedOrder.shippingAddress?.street || 'N/A'}</p>
                    <p><span className="text-gray-600">City:</span> {selectedOrder.shippingAddress?.city || 'N/A'}</p>
                    <p><span className="text-gray-600">Governorate:</span> {selectedOrder.shippingAddress?.governorate || 'N/A'}</p>
                    <p><span className="text-gray-600">Postal Code:</span> {selectedOrder.shippingAddress?.postalCode || 'N/A'}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Order Summary</h4>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-gray-600">Order Date:</span> {new Date(selectedOrder.createdAt).toLocaleString()}</p>
                    <p><span className="text-gray-600">Status:</span> 
                      <Badge className={`ml-2 ${getStatusColor(selectedOrder.status)}`}>
                        {getStatusText(selectedOrder.status)}
                      </Badge>
                    </p>
                    <p><span className="text-gray-600">Payment Method:</span> {selectedOrder.paymentMethod || 'N/A'}</p>
                    <p><span className="text-gray-600">Shipping Method:</span> Standard Delivery</p>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg">
                <div className="p-4 bg-gray-50 border-b">
                  <h4 className="font-medium">Order Items</h4>
                </div>
                <div className="divide-y">
                  {selectedOrder.items?.map((item: any, index: number) => (
                    <div key={index} className="p-4 flex items-start">
                      <Image
                        src={item.image || "/placeholder.svg"}
                        alt={item.name}
                        width={60}
                        height={60}
                        className="w-16 h-16 object-cover rounded mr-4"
                      />
                      <div className="flex-1">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-gray-600">
                          {item.size} ({item.volume}) × {item.quantity}
                        </p>
                        
                        {/* Gift Package Details */}
                        {item.isGiftPackage && item.packageDetails && (
                          <div className="mt-2 p-2 bg-gray-50 rounded border">
                            <div className="flex items-center space-x-2 mb-1">
                              <Package className="h-3 w-3 text-gray-600" />
                              <span className="text-xs font-medium text-gray-700">Package Contents:</span>
                            </div>
                            <div className="space-y-1">
                              {item.packageDetails.sizes.map((sizeInfo: any, sizeIndex: number) => (
                                <div key={sizeIndex} className="flex items-center space-x-2 text-xs">
                                  <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                  <span className="text-gray-600">{sizeInfo.size} ({sizeInfo.volume}):</span>
                                  <span className="font-medium text-gray-800">{sizeInfo.selectedProduct.productName}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {item.review && (
                          <div className="flex items-center mt-1">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`h-3 w-3 ${i < item.review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatPrice((item.price || 0) * (item.quantity || 1))}</p>
                        <p className="text-sm text-gray-600">{formatPrice(item.price || 0)} each</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Subtotal:</span>
                  <span>{formatPrice(selectedOrder.items?.reduce((sum: number, item: any) => sum + (item.price || 0) * (item.quantity || 1), 0) || 0)}</span>
                </div>
                {selectedOrder.discountAmount > 0 && (
                  <div className="flex justify-between text-green-600 mb-2">
                    <span>Discount</span>
                    <span>-{formatPrice(selectedOrder.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium text-lg">
                  <span>Total:</span>
                  <span>{formatPrice(selectedOrder.total || 0)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  All prices include shipping.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}