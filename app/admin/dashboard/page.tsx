"use client"

import type React from "react"
import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Package,
  Plus,
  Eye,
  Edit,
  Trash2,
  ArrowLeft,
  RefreshCw,
  Percent,
  Gift,
  Upload,
  FileSpreadsheet,
  LogOut,
  X,
} from "lucide-react"
import * as XLSX from "xlsx"
import { Navigation } from "@/components/navigation"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"

interface ProductSize {
  size: string
  volume: string
  originalPrice?: number
  discountedPrice?: number
}

interface Product {
  _id: string
  id: string
  name: string
  description: string
  longDescription?: string
  images: string[]
  rating: number
  reviews: number
  category: string
  isActive: boolean
  isNew: boolean
  isBestseller: boolean
  isOutOfStock?: boolean
  createdAt: string
  sizes: ProductSize[]
  // Gift package fields
  isGiftPackage?: boolean
  packagePrice?: number
  packageOriginalPrice?: number
  giftPackageSizes?: any[]
  notes?: {
    top: string[]
    middle: string[]
    base: string[]
  }
}

type DiscountType = "percentage" | "fixed" | "buyXgetX" | "buyXgetYpercent"

interface DiscountCode {
  _id: string
  code: string
  type: DiscountType
  value: number
  minOrderAmount?: number
  maxUses?: number
  currentUses: number
  isActive: boolean
  expiresAt?: string
  createdAt: string
  buyX?: number
  getX?: number
  discountPercentage?: number
}

interface Offer {
  _id: string
  title?: string | null
  description: string
  discountCode?: string
  isActive: boolean
  priority: number
  expiresAt?: string
  createdAt: string
}

const PRODUCTS_PER_PAGE = 10

export default function AdminDashboard() {
  const router = useRouter()
  const { state: authState, logout } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [editingDiscount, setEditingDiscount] = useState<DiscountCode | null>(null)
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [productPage, setProductPage] = useState(1)
  const [productTotalPages, setProductTotalPages] = useState(1)
  const [productTotalCount, setProductTotalCount] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  const productsPageCacheRef = useRef(new Map<string, Product[]>())
  const [productSearchQuery, setProductSearchQuery] = useState("")
  const [debouncedProductSearchQuery, setDebouncedProductSearchQuery] = useState("")

  const handleSignOut = () => {
    logout()
    router.push("/auth/login")
  }

  // Discount code form
  const [discountForm, setDiscountForm] = useState({
    code: "",
    description: "",
    type: "percentage" as DiscountType,
    value: "",
    minOrderAmount: "",
    maxUses: "",
    expiresAt: "",
    buyX: "",
    getX: "",
    discountPercentage: ""
  })

  // Offer form
  const [offerForm, setOfferForm] = useState({
    title: "",
    description: "",
    discountCode: "",
    priority: "",
    expiresAt: "",
  })

  const getAuthToken = () => {
    return authState.token || localStorage.getItem("token") || ""
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const formatDateForInput = (dateString: string) => {
    const date = new Date(dateString)
    return date.toISOString().slice(0, 16)
  }

  // DASHBOARD USES EGP ONLY - NO CURRENCY CONVERSION NEEDED
  // All prices in database are stored in EGP

  useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = productSearchQuery.trim()
      if (trimmed !== debouncedProductSearchQuery) {
        setDebouncedProductSearchQuery(trimmed)
      }
    }, 400)
    return () => clearTimeout(handle)
  }, [productSearchQuery, debouncedProductSearchQuery])

  useEffect(() => {
    setProductPage(1)
    productsPageCacheRef.current.clear()
  }, [debouncedProductSearchQuery])

  const fetchProductsPage = useCallback(async (page: number) => {
    try {
      setIsSearching(true)
      const token = getAuthToken()
      const fetchOptions = {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store' as RequestCache,
      }

      const cacheKey = `${debouncedProductSearchQuery}::${page}`
      const cached = productsPageCacheRef.current.get(cacheKey)
      if (cached) {
        setProducts(cached)
        return
      }

      const searchParam = debouncedProductSearchQuery ? `&search=${encodeURIComponent(debouncedProductSearchQuery)}` : ""

      const response = await fetch(
        `/api/products?includeInactive=true&page=${page}&limit=${PRODUCTS_PER_PAGE}${searchParam}`,
        fetchOptions
      )

      if (response.ok) {
        const products = await response.json()
        const totalPagesHeader = response.headers.get("X-Total-Pages")
        const totalCountHeader = response.headers.get("X-Total-Count")

        if (totalCountHeader) setProductTotalCount(Number(totalCountHeader))
        if (totalPagesHeader) setProductTotalPages(Number(totalPagesHeader))

        productsPageCacheRef.current.set(cacheKey, products)
        setProducts(products)
      } else {
        console.error("❌ [Dashboard] Failed to fetch products:", response.status, response.statusText)
      }
    } catch (error) {
      console.error("Error fetching products:", error)
    } finally {
      setIsSearching(false)
    }
  }, [authState.token, debouncedProductSearchQuery])

  const fetchData = useCallback(async () => {
    try {
      // Always reset to first products page on full dashboard refresh
      setProductPage(1)

      productsPageCacheRef.current.clear()

      const token = getAuthToken()

      // Use cache: no-store for fresh data but optimize with parallel requests
      const fetchOptions = {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store' as RequestCache
      }

      // First load core data needed for initial dashboard render
      await fetchProductsPage(1)

      // Core data is ready, hide main loading spinner
      setLoading(false)

      // Then load secondary data in the background (does not block initial render)
      const [discountCodesRes, offersRes] = await Promise.all([
        fetch("/api/discount-codes", fetchOptions),
        fetch("/api/offers", fetchOptions),
      ])

      if (discountCodesRes.ok) {
        const codes = await discountCodesRes.json()
        setDiscountCodes(codes)
      }

      if (offersRes.ok) {
        const offers = await offersRes.json()
        setOffers(offers)
      }
    } catch (error) {
      console.error("Error fetching data:", error)
      // On error, ensure we still hide the spinner
      setLoading(false)
    } finally {
      setRefreshing(false)
    }
  }, [authState.token, fetchProductsPage])

  useEffect(() => {
    if (!authState.isLoading && authState.isAuthenticated && authState.user?.role === "admin") {
      fetchProductsPage(productPage)
    }
  }, [authState.isAuthenticated, authState.isLoading, authState.user?.role, fetchProductsPage, productPage])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchData()
  }, [fetchData])

  useEffect(() => {
    // Wait until auth state is resolved
    if (authState.isLoading) return

    // Allow only signed-in admins to stay on the dashboard
    if (authState.isAuthenticated && authState.user?.role === "admin") {
      fetchData()
      return
    }

    // For anyone else, send them to the login page so an admin can sign in
    router.push("/auth/login")
  }, [authState.isAuthenticated, authState.isLoading, authState.user?.role, fetchData, router])

  const handleCreateDiscountCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    try {
      const token = getAuthToken()

      if (!token) {
        setError("Authentication required. Please log in again.")
        return
      }

      // Validate required fields
      if (!discountForm.code || !discountForm.type) {
        setError("Code and type are required")
        return
      }

      if (discountForm.type !== "buyXgetX" && discountForm.type !== "buyXgetYpercent" && !discountForm.value) {
        setError("Value is required for this discount type")
        return
      }

      const discountData: any = {
        code: discountForm.code,
        discount_type: discountForm.type,
        discount_value: discountForm.value ? Number.parseFloat(discountForm.value) : undefined,
        min_purchase: discountForm.minOrderAmount ? Number.parseFloat(discountForm.minOrderAmount) : undefined,
        usage_limit: discountForm.maxUses ? Number.parseInt(discountForm.maxUses) : undefined,
        valid_until: discountForm.expiresAt || undefined,
        description: discountForm.description || undefined,
      }

      if (discountForm.type === "buyXgetX") {
        discountData.buyX = Number.parseInt(discountForm.buyX)
        discountData.getX = Number.parseInt(discountForm.getX)
      } else if (discountForm.type === "buyXgetYpercent") {
        discountData.buyX = Number.parseInt(discountForm.buyX)
        discountData.discountPercentage = Number.parseFloat(discountForm.discountPercentage)
      }

      console.log("Creating discount code with data:", discountData)

      const response = await fetch("/api/discount-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(discountData),
      })

      const result = await response.json()

      if (response.ok) {
        setDiscountCodes([result.discountCode, ...discountCodes])
        setDiscountForm({
          code: "",
          type: "percentage",
          value: "",
          minOrderAmount: "",
          maxUses: "",
          expiresAt: "",
          buyX: "",
          getX: "",
          discountPercentage: "",
          description: ""
        })
        setError("")
        toast.success("Discount code created successfully")
      } else {
        console.error("Failed to create discount code:", result)
        setError(result.error || "Failed to create discount code")
        toast.error(result.error || "Failed to create discount code")
      }
    } catch (error) {
      console.error("Error creating discount code:", error)
      const errorMessage = error instanceof Error ? error.message : "An error occurred while creating the discount code"
      setError(errorMessage)
      toast.error(errorMessage)
    }
  }

  const handleEditDiscount = (code: DiscountCode) => {
    setEditingDiscount(code)
    setDiscountForm({
      code: code.code,
      type: code.type,
      value: code.value?.toString() || "",
      minOrderAmount: code.minOrderAmount?.toString() || "",
      maxUses: code.maxUses?.toString() || "",
      expiresAt: code.expiresAt ? formatDateForInput(code.expiresAt.toString()) : "",
      buyX: (code as any).buyX?.toString() || "",
      getX: (code as any).getX?.toString() || "",
      discountPercentage: (code as any).discountPercentage?.toString() || "",
      description: (code as any).description || ""
    })
  }

  const handleUpdateDiscountCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!editingDiscount) {
      setError("No discount code selected for editing")
      return
    }

    try {
      const token = getAuthToken()

      if (!token) {
        setError("Authentication required. Please log in again.")
        return
      }

      // Validate required fields
      if (!discountForm.code || !discountForm.type) {
        setError("Code and type are required")
        return
      }

      if (discountForm.type !== "buyXgetX" && discountForm.type !== "buyXgetYpercent" && !discountForm.value) {
        setError("Value is required for this discount type")
        return
      }

      const discountData: any = {
        code: discountForm.code,
        discount_type: discountForm.type,
        discount_value: discountForm.value ? Number.parseFloat(discountForm.value) : undefined,
        min_purchase: discountForm.minOrderAmount ? Number.parseFloat(discountForm.minOrderAmount) : undefined,
        usage_limit: discountForm.maxUses ? Number.parseInt(discountForm.maxUses) : undefined,
        valid_until: discountForm.expiresAt || undefined,
        isActive: editingDiscount.isActive,
        description: discountForm.description || undefined,
      }

      if (discountForm.type === "buyXgetX") {
        discountData.buyX = Number.parseInt(discountForm.buyX)
        discountData.getX = Number.parseInt(discountForm.getX)
      } else if (discountForm.type === "buyXgetYpercent") {
        discountData.buyX = Number.parseInt(discountForm.buyX)
        discountData.discountPercentage = Number.parseFloat(discountForm.discountPercentage)
      }

      console.log("Updating discount code with data:", discountData)
      console.log("Discount code ID:", editingDiscount._id)

      const response = await fetch(`/api/discount-codes?id=${editingDiscount._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(discountData),
      })

      const result = await response.json()

      if (response.ok) {
        setDiscountCodes(
          discountCodes.map((code) => (code._id === editingDiscount._id ? result.discountCode : code))
        )
        setEditingDiscount(null)
        setDiscountForm({
          code: "",
          type: "percentage",
          value: "",
          minOrderAmount: "",
          maxUses: "",
          expiresAt: "",
          buyX: "",
          getX: "",
          discountPercentage: "",
          description: ""
        })
        setError("")
        toast.success("Discount code updated successfully")
      } else {
        console.error("Failed to update discount code:", result)
        setError(result.error || "Failed to update discount code")
        toast.error(result.error || "Failed to update discount code")
      }
    } catch (error) {
      console.error("Error updating discount code:", error)
      const errorMessage = error instanceof Error ? error.message : "An error occurred while updating the discount code"
      setError(errorMessage)
      toast.error(errorMessage)
    }
  }

  const handleDeleteDiscountCode = async (codeId: string) => {
    if (!confirm("Are you sure you want to delete this discount code? This action cannot be undone.")) return

    try {
      const token = getAuthToken();
      const response = await fetch(`/api/discount-codes?id=${codeId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        setDiscountCodes(discountCodes.filter((code) => code._id !== codeId))
      }
    } catch (error) {
      console.error("Error deleting discount code:", error)
    }
  }

  const handleToggleDiscountStatus = async (code: DiscountCode) => {
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/discount-codes?id=${code._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          isActive: !code.isActive,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        setDiscountCodes(
          discountCodes.map((c) => (c._id === code._id ? result.discountCode : c))
        )
      }
    } catch (error) {
      console.error("Error toggling discount status:", error)
    }
  }

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const token = getAuthToken();
      const response = await fetch("/api/offers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: offerForm.title ? offerForm.title.trim() : null,
          description: offerForm.description,
          discountCode: offerForm.discountCode || undefined,
          priority: offerForm.priority ? Number.parseInt(offerForm.priority) : 0,
          expiresAt: offerForm.expiresAt || undefined,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        setOffers([result.offer, ...offers])
        // Refresh data in background, don't block UI
        fetchData().catch(err => console.error("Error refreshing data:", err))
        setOfferForm({
          title: "",
          description: "",
          discountCode: "",
          priority: "",
          expiresAt: "",
        })
      }
    } catch (error) {
      console.error("Error creating offer:", error)
    }
  }

  const handleEditOffer = (offer: Offer) => {
    setEditingOffer(offer)
    setOfferForm({
      title: offer.title || "",
      description: offer.description,
      discountCode: offer.discountCode || "",
      priority: offer.priority.toString(),
      expiresAt: offer.expiresAt ? formatDateForInput(offer.expiresAt) : "",
    })
  }

  const handleUpdateOffer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingOffer) return

    try {
      const token = getAuthToken();
      const response = await fetch(`/api/offers?id=${editingOffer._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: offerForm.title ? offerForm.title.trim() : null,
          description: offerForm.description,
          discountCode: offerForm.discountCode || undefined,
          priority: offerForm.priority ? Number.parseInt(offerForm.priority) : 0,
          expiresAt: offerForm.expiresAt || undefined,
          isActive: editingOffer.isActive,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        setOffers(offers.map(offer => offer._id === editingOffer._id ? result.offer : offer))
        setEditingOffer(null)
        // Refresh data in background, don't block UI
        fetchData().catch(err => console.error("Error refreshing data:", err))
        setOfferForm({
          title: "",
          description: "",
          discountCode: "",
          priority: "",
          expiresAt: "",
        })
      }
    } catch (error) {
      console.error("Error updating offer:", error)
    }
  }

  const handleDeleteOffer = async (offerId: string) => {
    if (!confirm("Are you sure you want to delete this offer? This action cannot be undone.")) return

    try {
      const token = getAuthToken();
      const response = await fetch(`/api/offers?id=${offerId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        setOffers(offers.filter(offer => offer._id !== offerId))
      }
    } catch (error) {
      console.error("Error deleting offer:", error)
    }
  }

  const handleToggleOfferStatus = async (offer: Offer) => {
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/offers?id=${offer._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          isActive: !offer.isActive,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        setOffers(offers.map(o => o._id === offer._id ? result.offer : o))
      }
    } catch (error) {
      console.error("Error toggling offer status:", error)
    }
  }

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product? This action cannot be undone.")) return

    try {
      const token = getAuthToken();

      const response = await fetch(`/api/products?id=${productId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const result = await response.json()

      if (response.ok) {
        setProducts(products.filter(p => p._id !== productId))
      } else {
        setError(result.error || "Failed to delete product")
      }
    } catch (error) {
      console.error("Error deleting product:", error)
      setError("An error occurred while deleting the product")
    }
  }

  const handleUpdateProduct = async (productId: string, updatedData: Partial<Product>) => {
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatedData),
      })

      if (response.ok) {
        setProducts(products.map(product =>
          product._id === productId ? { ...product, ...updatedData } : product
        ))
      }
    } catch (error) {
      console.error("Error updating product:", error)
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        setRefreshing(true)
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: "binary" })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws)

        if (data.length === 0) {
          toast.error("The excel sheet is empty")
          setRefreshing(false)
          return
        }

        // Transform excel data to match product structure
        const productsToUpload = data.map((row: any) => ({
          name: row["Product Name"] || row.Name || row.name,
          description: row["Short Description"] || row.Description || row.description || "",
          longDescription: row["Long Description"] || row.longDescription || "",
          category: row.Category || row.category || "mona-saleh",
          isActive: true,
          isNew: row["Is New?"] === "Yes" || row.isNew === true,
          isBestseller: row["Is Bestseller?"] === "Yes" || row.isBestseller === true,
          sizes: [
            {
              size: row.Size || row.size || "Standard",
              volume: row.Volume || row.volume || "100ml",
              originalPrice: Number(row["Original Price"] || row.Price || row.price || 0),
              discountedPrice: Number(row["Discounted Price"] || row.DiscountPrice || row.discount_price || row.Price || row.price || 0)
            }
          ],
          images: row.Image || row.image ? [row.Image || row.image] : ["/placeholder.svg"]
        }))

        const token = getAuthToken()
        const response = await fetch("/api/products/bulk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ products: productsToUpload }),
        })

        if (response.ok) {
          const result = await response.json()
          toast.success(result.message || "Products uploaded successfully")
          fetchData()
        } else {
          const error = await response.json()
          toast.error(error.error || "Failed to upload products")
        }
      } catch (err) {
        console.error("Excel processing error:", err)
        toast.error("Error processing excel file")
      } finally {
        setRefreshing(false)
        if (e.target) e.target.value = ""
      }
    }
    reader.readAsBinaryString(file)
  }

  const downloadTemplate = () => {
    const templateData = [
      {
        "name": "Sample Product",
        "price": 1000,
        "collection": "summer-collection",
        "images": "sample-product.jpg, sample-product-2.jpg",
        "sale_price": 900,
        "category": "mona-saleh",
        "description": "A brief overview of the product",
        "Is New?": "Yes",
        "Is Bestseller?": "No",
        "Size": "Standard",
        "Volume": "100ml"
      }
    ]
    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Template")
    XLSX.writeFile(wb, "product_upload_template.xlsx")
  }

  // Helper functions for product pricing
  const getSmallestPrice = (sizes: ProductSize[]) => {
    if (!sizes || sizes.length === 0) return 0

    const prices = sizes.map(size => size.discountedPrice || size.originalPrice || 0)
    return Math.min(...prices)
  }

  const getSmallestOriginalPrice = (sizes: ProductSize[]) => {
    if (!sizes || sizes.length === 0) return 0

    const prices = sizes.map(size => size.originalPrice || 0)
    return Math.min(...prices)
  }

  // Memoize expensive calculations to prevent recalculation on every render
  // IMPORTANT: All hooks must be called before any conditional returns
  const dashboardStats = useMemo(() => {
    const totalProducts = productTotalCount || products.length
    const activeProducts = products.filter((p) => p.isActive).length

    return { totalProducts, activeProducts }
  }, [products, productTotalCount])

  const { totalProducts, activeProducts } = dashboardStats

  const totalProductPages = productTotalPages || 1

  if (authState.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!authState.isAuthenticated || authState.user?.role !== "admin") {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-6 sm:mb-8"
          >
            {/* Mobile-optimized header */}
            <div className="space-y-4 sm:space-y-0 sm:flex sm:items-center sm:justify-between">
              <div className="text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-light tracking-wider mb-2">Admin Dashboard</h1>
                <p className="text-gray-600 text-sm sm:text-base">Welcome back, {authState.user?.name}</p>
              </div>

              {/* Mobile-friendly button layout */}
              <div className="flex flex-wrap gap-2 sm:gap-4 justify-center sm:justify-end">
                <Button
                  onClick={handleSignOut}
                  variant="outline"
                  className="bg-transparent text-xs sm:text-sm border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  size="sm"
                >
                  <LogOut className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  Sign Out
                </Button>

                <Button
                  onClick={handleRefresh}
                  variant="outline"
                  disabled={refreshing}
                  className="bg-transparent text-xs sm:text-sm"
                  size="sm"
                >
                  <RefreshCw className={`mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>



                <Link href="/admin/products/bulk-upload">
                  <Button
                    variant="outline"
                    className="bg-transparent text-xs sm:text-sm"
                    size="sm"
                  >
                    <Upload className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                    Bulk Upload
                  </Button>
                </Link>

                <Link href="/admin/products/add" prefetch={true}>
                  <Button className="bg-black text-white hover:bg-gray-800 text-xs sm:text-sm" size="sm">
                    <Plus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                    Add Product
                  </Button>
                </Link>
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

          {/* Stats Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalProducts}</div>
                  <p className="text-xs text-muted-foreground">
                    {activeProducts} active
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Main Content with tabs */}

          {/* Main Content with mobile-optimized tabs */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <Tabs defaultValue="products" className="space-y-6">
              {/* Mobile-scrollable tabs */}
              <div className="overflow-x-auto">
                <TabsList className="inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground min-w-max">
                  <TabsTrigger value="products" className="whitespace-nowrap text-xs sm:text-sm px-3 py-1.5">Products</TabsTrigger>
                  <TabsTrigger value="discounts" className="whitespace-nowrap text-xs sm:text-sm px-3 py-1.5">Discounts</TabsTrigger>
                  <TabsTrigger value="offers" className="whitespace-nowrap text-xs sm:text-sm px-3 py-1.5">Offers</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="products">
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="text-lg sm:text-xl">Products Catalog ({productTotalCount || products.length})</CardTitle>
                      <Link href="/admin/products/add" prefetch={true} className="w-full sm:w-auto">
                        <Button size="sm" className="bg-black text-white hover:bg-gray-800 w-full sm:w-auto">
                          <Plus className="mr-2 h-4 w-4" />
                          Add Product
                        </Button>
                      </Link>
                    </div>

                    <div className="mt-4 flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Input
                          value={productSearchQuery}
                          onChange={(e) => setProductSearchQuery(e.target.value)}
                          placeholder="Search products by name..."
                          className="pr-10"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {isSearching && (
                            <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
                          )}
                          {productSearchQuery ? (
                            <button
                              type="button"
                              onClick={() => setProductSearchQuery("")}
                              className="text-gray-500 hover:text-gray-800"
                              aria-label="Clear search"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6">
                    {products.length === 0 ? (
                      <div className="text-center py-8">
                        <Package className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                        <p className="text-gray-600 mb-4">No products found</p>
                        <Link href="/admin/products/add" prefetch={true}>
                          <Button className="bg-black text-white hover:bg-gray-800">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Your First Product
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {products.map((product) => (
                          <motion.div
                            key={product._id}
                            className="p-4 sm:p-5 border rounded-xl bg-white shadow-sm hover:shadow-lg transition-all duration-200 relative overflow-hidden"
                            whileHover={{ y: -5 }}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                            viewport={{ once: true }}
                          >
                            {/* Enhanced Gift Package Background Effects */}
                            {product.isGiftPackage && (
                              <>
                                <motion.div
                                  className="absolute -inset-4 bg-gradient-to-r from-purple-400/10 to-pink-400/10 rounded-lg -z-10"
                                  animate={{
                                    rotate: [0, 0.5, 0, -0.5, 0],
                                  }}
                                  transition={{
                                    duration: 8,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                  }}
                                />
                                <motion.div
                                  className="absolute -inset-2 bg-gradient-to-r from-purple-300/15 to-pink-300/15 rounded-lg -z-10"
                                  animate={{
                                    rotate: [0, -0.3, 0, 0.3, 0],
                                  }}
                                  transition={{
                                    duration: 6,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                  }}
                                />
                              </>
                            )}
                            {/* Enhanced Mobile Layout */}
                            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-start sm:justify-between">
                              {/* Product Image and Info - Mobile Optimized */}
                              <div className="flex flex-col sm:flex-row sm:items-start space-y-3 sm:space-y-0 sm:space-x-4 flex-1">
                                {/* Product Image with Enhanced Mobile Sizing */}
                                <div
                                  className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 mx-auto sm:mx-0 cursor-pointer group"
                                  onClick={() => setSelectedImage(product.images[0] || "/placeholder.svg")}
                                >
                                  <Image
                                    src={product.images[0] || "/placeholder.svg"}
                                    alt={product.name}
                                    fill
                                    className="object-cover rounded-xl shadow-sm"
                                    loading="lazy"
                                    sizes="(max-width: 768px) 80px, 96px"
                                  />
                                  <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-10">
                                    <Eye className="text-white h-6 w-6 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300" />
                                  </div>
                                  {/* Enhanced Gift Package Indicator */}
                                  {product.isGiftPackage && (
                                    <motion.div
                                      className="absolute -top-2 -right-2 bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 text-white text-xs px-3 py-1.5 rounded-full shadow-lg border-2 border-white"
                                      initial={{ scale: 0, rotate: -180 }}
                                      whileInView={{ scale: 1, rotate: 0 }}
                                      transition={{ duration: 0.6, type: "spring" }}
                                      viewport={{ once: true }}
                                      whileHover={{ scale: 1.1, rotate: 5 }}
                                    >
                                      <Gift className="h-3.5 w-3.5" />
                                    </motion.div>
                                  )}
                                </div>

                                {/* Product Details - Mobile First Layout */}
                                <div className="flex-1 min-w-0 space-y-3 text-center sm:text-left">
                                  {/* Product Name and Category */}
                                  <div className="space-y-2">
                                    <p className="font-bold text-lg sm:text-xl text-gray-900 leading-tight">{product.name}</p>
                                    <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-3">
                                      <p className="text-sm text-gray-600 capitalize font-medium">{product.category}</p>
                                      {product.isGiftPackage && (
                                        <motion.div
                                          initial={{ scale: 0, x: -20 }}
                                          whileInView={{ scale: 1, x: 0 }}
                                          transition={{ duration: 0.5, delay: 0.2 }}
                                          viewport={{ once: true }}
                                          whileHover={{ scale: 1.05 }}
                                        >
                                          <Badge variant="secondary" className="text-xs bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 border-purple-200 font-semibold px-3 py-1">
                                            🎁 Gift Package
                                          </Badge>
                                        </motion.div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Enhanced Price Display - Mobile Optimized */}
                                  <div className="text-lg sm:text-xl">
                                    {(() => {
                                      // Handle gift packages
                                      if (product.isGiftPackage) {
                                        const packagePrice = product.packagePrice || 0;
                                        const packageOriginalPrice = product.packageOriginalPrice || 0;

                                        if (packageOriginalPrice > 0 && packagePrice < packageOriginalPrice) {
                                          return (
                                            <motion.div
                                              className="flex flex-col items-center sm:items-start space-y-1"
                                              initial={{ opacity: 0, y: 10 }}
                                              whileInView={{ opacity: 1, y: 0 }}
                                              transition={{ duration: 0.5, delay: 0.3 }}
                                              viewport={{ once: true }}
                                            >
                                              <motion.span
                                                className="text-base text-gray-400 line-through font-medium"
                                                initial={{ opacity: 0, x: -10 }}
                                                whileInView={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.4, delay: 0.4 }}
                                                viewport={{ once: true }}
                                              >
                                                EGP {packageOriginalPrice.toFixed(0)}
                                              </motion.span>
                                              <motion.span
                                                className="text-red-600 font-bold text-xl"
                                                initial={{ opacity: 0, x: -10 }}
                                                whileInView={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.4, delay: 0.5 }}
                                                viewport={{ once: true }}
                                              >
                                                EGP {packagePrice.toFixed(0)}
                                              </motion.span>
                                              <motion.span
                                                className="text-xs text-green-600 font-semibold bg-green-50 px-2 py-1 rounded-full"
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                whileInView={{ opacity: 1, scale: 1 }}
                                                transition={{ duration: 0.4, delay: 0.6 }}
                                                viewport={{ once: true }}
                                                whileHover={{ scale: 1.05 }}
                                              >
                                                Save EGP {(packageOriginalPrice - packagePrice).toFixed(0)}
                                              </motion.span>
                                            </motion.div>
                                          );
                                        } else {
                                          return (
                                            <motion.span
                                              className="text-gray-900 font-bold text-xl"
                                              initial={{ opacity: 0, y: 10 }}
                                              whileInView={{ opacity: 1, y: 0 }}
                                              transition={{ duration: 0.5, delay: 0.3 }}
                                              viewport={{ once: true }}
                                            >
                                              EGP {packagePrice.toFixed(0)}
                                            </motion.span>
                                          );
                                        }
                                      }

                                      // Handle regular products
                                      const smallestPrice = getSmallestPrice(product.sizes);
                                      const smallestOriginalPrice = getSmallestOriginalPrice(product.sizes);

                                      if (smallestOriginalPrice > 0 && smallestPrice < smallestOriginalPrice) {
                                        return (
                                          <motion.div
                                            className="flex flex-col items-center sm:items-start space-y-1"
                                            initial={{ opacity: 0, y: 10 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.5, delay: 0.3 }}
                                            viewport={{ once: true }}
                                          >
                                            <motion.span
                                              className="text-base text-gray-400 line-through font-medium"
                                              initial={{ opacity: 0, x: -10 }}
                                              whileInView={{ opacity: 1, x: 0 }}
                                              transition={{ duration: 0.4, delay: 0.4 }}
                                              viewport={{ once: true }}
                                            >
                                              EGP {smallestOriginalPrice.toFixed(0)}
                                            </motion.span>
                                            <motion.span
                                              className="text-red-600 font-bold text-xl"
                                              initial={{ opacity: 0, x: -10 }}
                                              whileInView={{ opacity: 1, x: 0 }}
                                              transition={{ duration: 0.4, delay: 0.5 }}
                                              viewport={{ once: true }}
                                            >
                                              EGP {smallestPrice.toFixed(0)}
                                            </motion.span>
                                            <motion.span
                                              className="text-xs text-green-600 font-semibold bg-green-50 px-2 py-1 rounded-full"
                                              initial={{ opacity: 0, scale: 0.8 }}
                                              whileInView={{ opacity: 1, scale: 1 }}
                                              transition={{ duration: 0.4, delay: 0.6 }}
                                              viewport={{ once: true }}
                                              whileHover={{ scale: 1.05 }}
                                            >
                                              Save EGP {(smallestOriginalPrice - smallestPrice).toFixed(0)}
                                            </motion.span>
                                          </motion.div>
                                        );
                                      } else {
                                        return (
                                          <motion.span
                                            className="text-gray-900 font-bold text-xl"
                                            initial={{ opacity: 0, y: 10 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.5, delay: 0.3 }}
                                            viewport={{ once: true }}
                                          >
                                            EGP {smallestPrice.toFixed(0)}
                                          </motion.span>
                                        );
                                      }
                                    })()}
                                  </div>

                                  {/* Enhanced Mobile Badges - Better Spacing */}
                                  <div className="flex flex-wrap justify-center sm:justify-start gap-2 sm:hidden">
                                    {product.isOutOfStock && (
                                      <Badge className="bg-gradient-to-r from-red-100 to-red-200 text-red-700 border-red-300 text-xs font-semibold px-3 py-1.5">
                                        🚫 Out of Stock
                                      </Badge>
                                    )}
                                    {product.isNew && (
                                      <Badge variant="secondary" className="text-xs bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 border-green-200 font-semibold px-3 py-1.5">
                                        ✨ New
                                      </Badge>
                                    )}
                                    {product.isBestseller && (
                                      <Badge className="bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-700 border-yellow-200 text-xs font-semibold px-3 py-1.5">
                                        🏆 Best Rental
                                      </Badge>
                                    )}
                                    <Badge
                                      variant={product.isActive ? "default" : "secondary"}
                                      className={`text-xs font-semibold px-3 py-1.5 ${product.isActive
                                        ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 border-green-200"
                                        : "bg-gradient-to-r from-gray-100 to-slate-100 text-gray-600 border-gray-200"
                                        }`}
                                    >
                                      {product.isActive ? "✅ Active" : "❌ Inactive"}
                                    </Badge>
                                  </div>
                                </div>
                              </div>

                              {/* Desktop Badges and Actions - Enhanced */}
                              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:space-x-4">
                                {/* Desktop Badges - Hidden on Mobile */}
                                <div className="hidden sm:flex items-center space-x-2">
                                  {product.isOutOfStock && <Badge className="bg-red-100 text-red-700 border-red-300">Out of Stock</Badge>}
                                  {product.isNew && <Badge variant="secondary">New</Badge>}
                                  {product.isBestseller && <Badge className="bg-black text-white">Best Rental</Badge>}
                                  <Badge variant={product.isActive ? "default" : "secondary"}>
                                    {product.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </div>

                                {/* Enhanced Action Buttons - Mobile Optimized */}
                                <div className="flex justify-center sm:justify-end space-x-3">
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.4, delay: 0.7 }}
                                    viewport={{ once: true }}
                                    whileHover={{ scale: 1.05 }}
                                  >
                                    <Link href={`/products/${product.category}/${product.id}`} prefetch={true}>
                                      <Button size="sm" variant="outline" className="h-12 w-12 p-0 sm:h-10 sm:w-10 rounded-xl border-2 hover:border-blue-300 hover:bg-blue-50 transition-all">
                                        <Eye className="h-5 w-5 sm:h-4 sm:w-4 text-blue-600" />
                                      </Button>
                                    </Link>
                                  </motion.div>
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.4, delay: 0.8 }}
                                    viewport={{ once: true }}
                                    whileHover={{ scale: 1.05 }}
                                  >
                                    <Link href={`/admin/products/edit?id=${product.id}`} prefetch={true}>
                                      <Button size="sm" variant="outline" className="h-12 w-12 p-0 sm:h-10 sm:w-10 rounded-xl border-2 hover:border-green-300 hover:bg-green-50 transition-all">
                                        <Edit className="h-5 w-5 sm:h-4 sm:w-4 text-green-600" />
                                      </Button>
                                    </Link>
                                  </motion.div>
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.4, delay: 0.9 }}
                                    viewport={{ once: true }}
                                    whileHover={{ scale: 1.05 }}
                                  >
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-12 w-12 p-0 sm:h-10 sm:w-10 rounded-xl border-2 border-red-200 hover:border-red-400 hover:bg-red-50 transition-all"
                                      onClick={() => handleDeleteProduct(product.id)}
                                    >
                                      <Trash2 className="h-5 w-5 sm:h-4 sm:w-4 text-red-600" />
                                    </Button>
                                  </motion.div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                        <nav aria-label="Page navigation example" className="flex flex-col sm:flex-row items-center justify-between sm:justify-center space-y-4 sm:space-y-0 sm:space-x-4 mt-6">
                          <ul className="flex items-center -space-x-px text-sm">
                            <li>
                              <button 
                                onClick={() => {
                                  const targetPage = Math.max(productPage - 1, 1)
                                  if (targetPage !== productPage) {
                                    setProductPage(targetPage)
                                  }
                                }}
                                disabled={productPage === 1}
                                className="flex items-center justify-center text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-900 shadow-sm font-medium leading-5 rounded-l-md text-sm px-3 h-9 focus:outline-none disabled:opacity-50 disabled:hover:bg-white"
                              >
                                Previous
                              </button>
                            </li>
                            {[...Array(totalProductPages)].map((_, i) => {
                              const page = i + 1;
                              const shouldShow = page === 1 || page === totalProductPages || (page >= productPage - 1 && page <= productPage + 1);
                              if (!shouldShow) {
                                if (page === 2 || page === totalProductPages - 1) {
                                  return <li key={`ellipsis-${page}`}><span className="flex items-center justify-center text-gray-500 bg-white border border-gray-200 shadow-sm font-medium leading-5 text-sm w-9 h-9">...</span></li>
                                }
                                return null;
                              }
                              return (
                                <li key={page}>
                                  <button
                                    onClick={() => setProductPage(page)}
                                    aria-current={productPage === page ? "page" : undefined}
                                    className={`flex items-center justify-center shadow-xs font-medium text-sm w-9 h-9 focus:outline-none ${
                                      productPage === page
                                        ? "bg-black text-white border border-black hover:bg-gray-800"
                                        : "text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-900 leading-5"
                                    }`}
                                  >
                                    {page}
                                  </button>
                                </li>
                              );
                            })}
                            <li>
                              <button 
                                onClick={() => {
                                  const targetPage = Math.min(productPage + 1, totalProductPages)
                                  if (targetPage !== productPage) {
                                    setProductPage(targetPage)
                                  }
                                }}
                                disabled={productPage >= totalProductPages}
                                className="flex items-center justify-center text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-900 shadow-sm font-medium leading-5 rounded-r-md text-sm px-3 h-9 focus:outline-none disabled:opacity-50 disabled:hover:bg-white"
                              >
                                Next
                              </button>
                            </li>
                          </ul>
                          <form 
                            className="mx-auto sm:mx-0" 
                            onSubmit={(e) => {
                              e.preventDefault();
                              const target = (e.currentTarget.elements.namedItem('visitors') as HTMLInputElement).value;
                              const pageNum = parseInt(target, 10);
                              if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalProductPages) {
                                setProductPage(pageNum);
                                (e.currentTarget.elements.namedItem('visitors') as HTMLInputElement).value = '';
                              }
                            }}
                          >
                            <div className="flex items-center space-x-2">
                                <label htmlFor="visitors" className="text-sm font-medium text-gray-700 shrink-0">Go to</label>
                                <input 
                                  type="text" 
                                  id="visitors" 
                                  name="visitors"
                                  className="bg-white w-12 border border-gray-200 text-gray-900 text-sm rounded-md focus:ring-black focus:border-black block px-2.5 py-1.5 shadow-sm placeholder:text-gray-400" 
                                  placeholder={productPage.toString()} 
                                />
                                <span className="text-sm font-medium text-gray-700">page</span>
                            </div>
                          </form>
                        </nav>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Orders tab removed */}

              <TabsContent value="discounts">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Discount Code Form */}
                  <Card>
                    <CardHeader className="p-4 sm:p-6">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center text-lg">
                          <Percent className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                          {editingDiscount ? "Edit Discount Code" : "Create Discount Code"}
                        </CardTitle>
                        {editingDiscount && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingDiscount(null)
                              setDiscountForm({
                                code: "",
                                description: "",
                                type: "percentage",
                                value: "",
                                minOrderAmount: "",
                                maxUses: "",
                                expiresAt: "",
                                buyX: "",
                                getX: "",
                                discountPercentage: ""
                              })
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6">
                      {error && (
                        <Alert className="border-red-200 bg-red-50 mb-4">
                          <AlertDescription className="text-red-600">{error}</AlertDescription>
                        </Alert>
                      )}
                      <form
                        onSubmit={editingDiscount ? handleUpdateDiscountCode : handleCreateDiscountCode}
                        className="space-y-4"
                      >
                        <div>
                          <Label htmlFor="code" className="text-sm">Discount Code *</Label>
                          <Input
                            id="code"
                            value={discountForm.code}
                            onChange={(e) => setDiscountForm({ ...discountForm, code: e.target.value })}
                            placeholder="SAVE20"
                            required
                            className="mt-1"
                          />
                          <p className="text-xs text-gray-500 mt-1">Code will be stored in uppercase</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="type" className="text-sm">Type *</Label>
                            <Select
                              value={discountForm.type}
                              onValueChange={(value: DiscountType) =>
                                setDiscountForm({ ...discountForm, type: value })
                              }
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percentage">Percentage</SelectItem>
                                <SelectItem value="fixed">Fixed Amount</SelectItem>
                                <SelectItem value="buyXgetX">Buy X Get X</SelectItem>
                                <SelectItem value="buyXgetYpercent">Buy X Get % Off Next</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {(discountForm.type === "percentage" || discountForm.type === "fixed") && (
                            <div>
                              <Label htmlFor="value" className="text-sm">
                                Value * {discountForm.type === "percentage" ? "(%)" : "(EGP)"}
                              </Label>
                              <Input
                                id="value"
                                type="number"
                                value={discountForm.value}
                                onChange={(e) => setDiscountForm({ ...discountForm, value: e.target.value })}
                                placeholder={discountForm.type === "percentage" ? "20" : "100"}
                                required
                                className="mt-1"
                              />
                            </div>
                          )}
                        </div>

                        {discountForm.type === "buyXgetX" && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="buyX" className="text-sm">Buy Quantity *</Label>
                              <Input
                                id="buyX"
                                type="number"
                                value={discountForm.buyX}
                                onChange={(e) => setDiscountForm({ ...discountForm, buyX: e.target.value })}
                                placeholder="2"
                                required
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="getX" className="text-sm">Get Quantity *</Label>
                              <Input
                                id="getX"
                                type="number"
                                value={discountForm.getX}
                                onChange={(e) => setDiscountForm({ ...discountForm, getX: e.target.value })}
                                placeholder="1"
                                required
                                className="mt-1"
                              />
                            </div>
                          </div>
                        )}

                        {discountForm.type === "buyXgetYpercent" && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="buyXPercent" className="text-sm">Buy Quantity *</Label>
                              <Input
                                id="buyXPercent"
                                type="number"
                                value={discountForm.buyX}
                                onChange={(e) => setDiscountForm({ ...discountForm, buyX: e.target.value })}
                                placeholder="1"
                                required
                                className="mt-1"
                              />
                              <p className="text-xs text-gray-500 mt-1">Buy this many items</p>
                            </div>
                            <div>
                              <Label htmlFor="discountPercentage" className="text-sm">Discount % *</Label>
                              <Input
                                id="discountPercentage"
                                type="number"
                                value={discountForm.discountPercentage}
                                onChange={(e) => setDiscountForm({ ...discountForm, discountPercentage: e.target.value })}
                                placeholder="50"
                                required
                                className="mt-1"
                              />
                              <p className="text-xs text-gray-500 mt-1">% off on next item (cheapest)</p>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="minOrderAmount" className="text-sm">Min Order Amount (EGP)</Label>
                            <Input
                              id="minOrderAmount"
                              type="number"
                              value={discountForm.minOrderAmount}
                              onChange={(e) => setDiscountForm({ ...discountForm, minOrderAmount: e.target.value })}
                              placeholder="500"
                              className="mt-1"
                            />
                          </div>

                          <div>
                            <Label htmlFor="maxUses" className="text-sm">Max Uses</Label>
                            <Input
                              id="maxUses"
                              type="number"
                              value={discountForm.maxUses}
                              onChange={(e) => setDiscountForm({ ...discountForm, maxUses: e.target.value })}
                              placeholder="100"
                              className="mt-1"
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="expiresAt" className="text-sm">Expires At</Label>
                          <Input
                            id="expiresAt"
                            type="datetime-local"
                            value={discountForm.expiresAt}
                            onChange={(e) => setDiscountForm({ ...discountForm, expiresAt: e.target.value })}
                            className="mt-1"
                          />
                        </div>

                        <Button type="submit" className="w-full bg-black text-white hover:bg-gray-800">
                          {editingDiscount ? "Update Discount Code" : "Create Discount Code"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Discount Codes List */}
                  <Card>
                    <CardHeader className="p-4 sm:p-6">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Discount Codes ({discountCodes.length})</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6">
                      {discountCodes.length === 0 ? (
                        <div className="text-center py-8">
                          <Percent className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                          <p className="text-gray-600">No discount codes created yet</p>
                        </div>
                      ) : (
                        <div className="space-y-4 max-h-[400px] sm:max-h-[600px] overflow-y-auto">
                          {discountCodes.map((code) => (
                            <div key={code._id} className="p-3 sm:p-4 border rounded-lg">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 space-y-2 sm:space-y-0">
                                <span className="font-mono font-medium text-sm sm:text-base">{code.code}</span>
                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleDiscountStatus(code)}
                                    className={`${code.isActive ? "text-green-600" : "text-gray-500"} text-xs`}
                                  >
                                    {code.isActive ? "Active" : "Inactive"}
                                  </Button>
                                  <Badge variant={code.isActive ? "default" : "secondary"} className="text-xs">
                                    {code.type === "percentage"
                                      ? `${code.value}%`
                                      : code.type === "fixed"
                                        ? `${code.value} USD`
                                        : code.type === "buyXgetX"
                                          ? `Buy ${code.buyX} Get ${code.getX}`
                                          : `Buy ${code.buyX} Get ${code.discountPercentage}% Off`}
                                  </Badge>
                                </div>
                              </div>
                              <div className="text-xs sm:text-sm text-gray-600 space-y-1">
                                {code.minOrderAmount && <p>Min order: {code.minOrderAmount} USD</p>}
                                {code.maxUses && (
                                  <p>
                                    Uses: {code.currentUses}/{code.maxUses}
                                  </p>
                                )}
                                {code.expiresAt && <p>Expires: {formatDate(code.expiresAt)}</p>}
                                <p>Created: {formatDate(code.createdAt)}</p>
                              </div>
                              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mt-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditDiscount(code)}
                                  className="w-full sm:w-auto text-xs"
                                >
                                  <Edit className="h-3 w-3 mr-2" />
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 w-full sm:w-auto text-xs"
                                  onClick={() => handleDeleteDiscountCode(code._id)}
                                >
                                  <Trash2 className="h-3 w-3 mr-2" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="offers">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Create/Edit Offer Form */}
                  <Card>
                    <CardHeader className="p-4 sm:p-6">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center text-lg">
                          <Gift className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                          {editingOffer ? "Edit Offer" : "Create Offer"}
                        </CardTitle>
                        {editingOffer && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingOffer(null)
                              setOfferForm({
                                title: "",
                                description: "",
                                discountCode: "",
                                priority: "",
                                expiresAt: "",
                              })
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6">
                      <form onSubmit={editingOffer ? handleUpdateOffer : handleCreateOffer} className="space-y-4">
                        <div>
                          <Label htmlFor="title" className="text-sm">Offer Title</Label>
                          <Input
                            id="title"
                            value={offerForm.title}
                            onChange={(e) => setOfferForm({ ...offerForm, title: e.target.value })}
                            placeholder="🎉 Special Weekend Sale!"
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label htmlFor="description" className="text-sm">Description *</Label>
                          <Textarea
                            id="description"
                            value={offerForm.description}
                            onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })}
                            placeholder="Get 20% off on all products this weekend only!"
                            rows={3}
                            required
                            className="mt-1"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="discountCode" className="text-sm">Discount Code (Optional)</Label>
                            <Input
                              id="discountCode"
                              value={offerForm.discountCode}
                              onChange={(e) => setOfferForm({ ...offerForm, discountCode: e.target.value })}
                              placeholder="WEEKEND20"
                              className="mt-1"
                            />
                          </div>

                          <div>
                            <Label htmlFor="priority" className="text-sm">Priority</Label>
                            <Input
                              id="priority"
                              type="number"
                              value={offerForm.priority}
                              onChange={(e) => setOfferForm({ ...offerForm, priority: e.target.value })}
                              placeholder="1"
                              className="mt-1"
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="offerExpiresAt" className="text-sm">Expires At</Label>
                          <Input
                            id="offerExpiresAt"
                            type="datetime-local"
                            value={offerForm.expiresAt}
                            onChange={(e) => setOfferForm({ ...offerForm, expiresAt: e.target.value })}
                            className="mt-1"
                          />
                        </div>

                        <Button type="submit" className="w-full bg-black text-white hover:bg-gray-800">
                          {editingOffer ? "Update Offer" : "Create Offer"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Offers List */}
                  <Card>
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="text-lg">Active Offers ({offers.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6">
                      {offers.length === 0 ? (
                        <div className="text-center py-8">
                          <Gift className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                          <p className="text-gray-600">No offers created yet</p>
                        </div>
                      ) : (
                        <div className="space-y-4 max-h-[400px] sm:max-h-96 overflow-y-auto">
                          {offers.map((offer) => (
                            offer && (
                              <div key={offer._id} className="p-3 sm:p-4 border rounded-lg">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 space-y-2 sm:space-y-0">
                                  <span className="font-medium text-sm sm:text-base">{offer.title || "Untitled Offer"}</span>
                                  <div className="flex items-center space-x-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleToggleOfferStatus(offer)}
                                      className={`${offer.isActive ? "text-green-600" : "text-gray-500"} text-xs`}
                                    >
                                      {offer.isActive ? "Active" : "Inactive"}
                                    </Button>
                                    <Badge variant={offer.isActive ? "default" : "secondary"} className="text-xs">
                                      Priority: {offer.priority}
                                    </Badge>
                                  </div>
                                </div>
                                <p className="text-xs sm:text-sm text-gray-600 mb-2">{offer.description}</p>
                                <div className="text-xs text-gray-500 space-y-1">
                                  {offer.discountCode && <p>Code: {offer.discountCode}</p>}
                                  {offer.expiresAt && <p>Expires: {formatDate(offer.expiresAt)}</p>}
                                  <p>Created: {formatDate(offer.createdAt)}</p>
                                </div>
                                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mt-3">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditOffer(offer)}
                                    className="w-full sm:w-auto text-xs"
                                  >
                                    <Edit className="h-3 w-3 mr-2" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 w-full sm:w-auto text-xs"
                                    onClick={() => handleDeleteOffer(offer._id)}
                                  >
                                    <Trash2 className="h-3 w-3 mr-2" />
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Analytics tab removed */}
            </Tabs>
          </motion.div>

          {/* Lightbox Modal */}
          {selectedImage && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
              onClick={() => setSelectedImage(null)}
            >
              <div
                className="relative max-w-4xl w-full h-[80vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute top-0 right-0 z-10 p-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 rounded-full bg-black/50 backdrop-blur-md"
                    onClick={() => setSelectedImage(null)}
                  >
                    <X className="h-6 w-6" />
                  </Button>
                </div>
                <div className="relative w-full h-full">
                  <Image
                    src={selectedImage}
                    alt="Product preview"
                    fill
                    className="object-contain"
                    quality={100}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
