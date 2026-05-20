"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, AlertTriangle, Eye, RefreshCw } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { toast } from "@/hooks/use-toast"

export default function PendingReviewPage() {
  const { state: authState } = useAuth()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/orders?paymentStatus=pending_review", {
        headers: {
          Authorization: `Bearer ${authState.token}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        // Ensure we only show pending_review
        const pending = data.orders?.filter((o: any) => o.paymentStatus === "pending_review") || []
        setOrders(pending)
      }
    } catch (error) {
      console.error("Failed to fetch pending review orders", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authState.isAuthenticated) {
      fetchOrders()
    }
  }, [authState.isAuthenticated])

  const handleDecision = async (orderId: string, decision: "approved" | "rejected") => {
    if (!confirm(`Are you sure you want to ${decision.toUpperCase()} this payment?`)) return
    
    setActionLoading(orderId)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/decision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authState.token}`
        },
        body: JSON.stringify({ decision, reason: `Manually ${decision} by admin` })
      })

      if (!res.ok) throw new Error("Failed to process decision")

      toast({
        title: "Success",
        description: `Order has been ${decision}.`,
      })
      
      // Remove from list
      setOrders(orders.filter(o => o.orderId !== orderId))
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      })
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payment Reviews</h1>
          <p className="text-gray-500 mt-1">
            Orders flagged by the AI Verification system that require manual approval.
          </p>
        </div>
        <Button onClick={fetchOrders} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {orders.length === 0 ? (
        <Card className="bg-gray-50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">All caught up!</h3>
            <p className="text-gray-500 mt-1">There are no payments pending manual review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {orders.map((order) => (
            <Card key={order.orderId} className="overflow-hidden border-yellow-200 shadow-sm">
              <div className="bg-yellow-50 px-4 py-3 border-b border-yellow-100 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span className="font-semibold text-yellow-800">Review Required</span>
                </div>
                <span className="text-xs font-mono text-yellow-600">{order.orderId}</span>
              </div>
              
              <CardContent className="p-0 flex flex-col md:flex-row h-auto md:h-80">
                {/* Image Section */}
                <div className="relative w-full md:w-1/2 h-64 md:h-full bg-gray-100 border-r border-gray-100 group">
                  {order.paymentScreenshot ? (
                    <>
                      <Image
                        src={order.paymentScreenshot}
                        alt="Payment Receipt"
                        fill
                        className="object-contain p-2"
                      />
                      <a href={order.paymentScreenshot} target="_blank" rel="noreferrer" className="absolute bottom-4 right-4 bg-black/70 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="h-5 w-5" />
                      </a>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      No screenshot
                    </div>
                  )}
                </div>

                {/* Details Section */}
                <div className="p-4 md:p-6 w-full md:w-1/2 flex flex-col">
                  <div className="space-y-4 flex-grow">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">AI Flag Reason</h4>
                      <p className="text-sm font-medium text-red-600 bg-red-50 p-2 rounded border border-red-100">
                        {order.paymentFraudReason || "Unknown discrepancy"}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs text-gray-500 block">Expected Deposit</span>
                        <span className="font-semibold">{order.depositAmount} EGP</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Method Selected</span>
                        <Badge variant="outline" className="capitalize mt-1">{order.paymentMethod?.replace('_', ' ')}</Badge>
                      </div>
                    </div>

                    {order.paymentAiRaw && (
                      <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono overflow-auto max-h-32 border border-gray-200">
                        <span className="text-gray-400 block mb-2 font-sans font-semibold text-[10px] uppercase">Raw AI Extraction</span>
                        <pre className="text-gray-700">{JSON.stringify(order.paymentAiRaw, null, 2)}</pre>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                    <Button 
                      className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
                      disabled={actionLoading === order.orderId}
                      onClick={() => handleDecision(order.orderId, "approved")}
                    >
                      <CheckCircle className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button 
                      variant="destructive"
                      className="flex-1 gap-2"
                      disabled={actionLoading === order.orderId}
                      onClick={() => handleDecision(order.orderId, "rejected")}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
