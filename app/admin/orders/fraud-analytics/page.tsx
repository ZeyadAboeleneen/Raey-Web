"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldAlert, CheckCircle, XCircle, Clock, ArrowLeft, Brain, DollarSign, Activity } from "lucide-react"
import { useAuth, usePermission } from "@/lib/auth-context"
import { useCurrencyFormatter } from "@/hooks/use-currency"

export default function FraudAnalyticsPage() {
  const router = useRouter()
  const { state: authState } = useAuth()
  const canViewOrders = usePermission("canViewOrders")
  const { formatPrice } = useCurrencyFormatter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authState.isLoading) return

    if (!authState.isAuthenticated || !canViewOrders) {
      router.push("/admin/dashboard")
      return
    }

    const fetchAnalytics = async () => {
      try {
        const response = await fetch("/api/admin/orders/fraud-analytics", {
          headers: { Authorization: `Bearer ${authState.token}` },
        })
        if (response.ok) {
          const res = await response.json()
          setData(res.data)
        }
      } catch (error) {
        console.error("Error fetching analytics:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [authState, router, canViewOrders])

  if (authState.isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading AI Intelligence...</p>
        </div>
      </div>
    )
  }

  if (!data) return <div className="text-center mt-20 text-red-500">Failed to load analytics data</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="py-10 sm:py-12">
        <div className="container mx-auto px-4 sm:px-6 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-8"
          >
            <div className="space-y-4">
              <Link href="/admin/dashboard" className="inline-flex items-center text-gray-600 hover:text-black transition-colors">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                  <ShieldAlert className="h-8 w-8 text-purple-600" />
                  Fraud Intelligence & AI Analytics
                </h1>
                <p className="text-gray-500 mt-2">Real-time monitoring of automated payment verification and risk processing.</p>
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Ratios */}
            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" /> Total Auto-Approved
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{data.ratios.totalApproved}</div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-red-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <XCircle className="h-4 w-4" /> Total Rejected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{data.ratios.totalRejected}</div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Pending Manual Review
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{data.ratios.totalPendingReview}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* AI Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-500" /> AI Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-gray-600">Total Images Processed by Gemini</span>
                    <span className="font-semibold">{data.aiPerformance.totalProcessed}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-gray-600">Average AI Confidence Score</span>
                    <span className="font-semibold text-purple-600">
                      {(data.aiPerformance.averageConfidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="pt-2 text-sm text-gray-500">
                    Confidence &gt; 90% is auto-approved. &lt; 70% is instantly rejected.
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Revenue Impact */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-500" /> Revenue Protection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-gray-600">Protected Approved Revenue</span>
                    <span className="font-bold text-green-600">
                      {formatPrice(data.revenueImpact.revenueApproved)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-gray-600">Saved from Fraud/Rejection</span>
                    <span className="font-bold text-red-600">
                      {formatPrice(data.revenueImpact.revenueRejected)}
                    </span>
                  </div>
                  <div className="pt-2 text-sm text-gray-500">
                    This represents the inventory value protected from suspicious checkouts.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Fraud Severity Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-red-500" /> Fraud Severity Breakdown (Top Reasons)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.fraudReasons.length === 0 ? (
                <div className="text-center py-6 text-gray-500">No fraud data yet. The system is clean!</div>
              ) : (
                <div className="space-y-4">
                  {data.fraudReasons.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border">
                      <span className="text-sm font-medium text-gray-800">{item.reason}</span>
                      <span className="inline-flex items-center justify-center bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full">
                        {item.count} instances
                      </span>
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
