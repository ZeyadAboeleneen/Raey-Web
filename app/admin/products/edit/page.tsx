"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import imageCompression from "browser-image-compression"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Plus, Trash2, Upload, X, Save } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { useAuth } from "@/lib/auth-context"
import { uploadImage } from "@/lib/supabase-storage"
import { useProductsCache } from "@/lib/products-cache"

interface ProductSize {
  originalPrice?: string
  discountedPrice?: string
  stockCount?: string
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
  collection?: string
  sizes: ProductSize[]
  isActive: boolean
  isNew: boolean
  isBestseller: boolean
  isOutOfStock: boolean
}

export default function EditProductPage() {
  const { state: authState } = useAuth()
  const { refresh } = useProductsCache()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<string[]>([])

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    longDescription: "",
    collection: "wedding",
    category: "mona-saleh",
    sizes: [{
      originalPrice: "",
      discountedPrice: "",
      stockCount: ""
    }],
    isActive: true,
    isNew: false,
    isBestseller: false,
    isOutOfStock: false
  })

  useEffect(() => {
    if (!authState.isLoading && (!authState.isAuthenticated || authState.user?.role !== "admin")) {
      router.push("/auth/login")
    }
  }, [authState, router])

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const productId = searchParams?.get('id')
        if (!productId) {
          setError("Product ID not found")
          setLoading(false)
          return
        }

        const response = await fetch(`/api/products?id=${productId}&includeInactive=true`, {
          headers: {
            'Authorization': `Bearer ${authState.token}`
          }
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch product: ${response.status}`)
        }

        const product = await response.json()

        setFormData({
          name: product.name || "",
          description: product.description || "",
          longDescription: product.longDescription || "",
          collection: product.collection || "wedding",
          category: product.category || "mona-saleh",
          sizes: product.sizes?.map((size: any) => ({
            originalPrice: size.originalPrice?.toString() || "",
            discountedPrice: size.discountedPrice?.toString() || "",
            stockCount: size.stockCount?.toString() || "",
          })) || [{
            originalPrice: "",
            discountedPrice: "",
            stockCount: "",
          }],
          isActive: product.isActive ?? true,
          isNew: product.isNew ?? false,
          isBestseller: product.isBestseller ?? false,
          isOutOfStock: product.isOutOfStock ?? false,
        })

        const initialImages = Array.isArray(product.images)
          ? product.images.filter((img: string) => img && img !== "/placeholder.svg")
          : []
        setUploadedImages(initialImages)
        setLoading(false)
      } catch (error) {
        console.error("Error fetching product:", error)
        setError(error instanceof Error ? error.message : "Failed to load product")
        setLoading(false)
      }
    }

    fetchProduct()
  }, [searchParams])

  const fileToBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError('');

    try {
      const imagePromises = Array.from(files).map(async (file) => {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.35,
          maxWidthOrHeight: 1200,
          useWebWorker: true,
          initialQuality: 0.7,
        })
        const base64 = await fileToBase64(compressed as File)
        return uploadImage(base64, "products")
      })

      const imageUrls = await Promise.all(imagePromises);
      setUploadedImages(prev => [...prev, ...imageUrls]);
    } catch (err) {
      console.error('Image upload failed:', err);
      setError(`Failed to upload images: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const productId = searchParams?.get('id')
      if (!productId) {
        throw new Error("Product ID not found")
      }

      const productToSave = {
        name: formData.name,
        description: formData.description,
        longDescription: formData.longDescription,
        category: formData.category,
        collection: formData.collection,
        sizes: formData.sizes.map(size => ({
          size: "M",
          volume: "Standard",
          originalPrice: size.originalPrice ? parseFloat(size.originalPrice) : undefined,
          discountedPrice: size.discountedPrice ? parseFloat(size.discountedPrice) : undefined,
          stockCount: size.stockCount && size.stockCount.trim() !== "" ? parseInt(size.stockCount, 10) : undefined,
        })),
        images: uploadedImages.length > 0 ? uploadedImages : ["/placeholder.svg"],
        // Keep notes structure for backend compatibility but no longer editable in UI
        notes: {
          top: [],
          middle: [],
          base: [],
        },
        isActive: formData.isActive,
        isNew: formData.isNew,
        isBestseller: formData.isBestseller,
        isOutOfStock: formData.isOutOfStock,
      }

      const response = await fetch(`/api/products?id=${productId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authState.token}`
        },
        body: JSON.stringify(productToSave)
      })

      if (!response.ok) {
        let message = `Update failed with status ${response.status}`
        try {
          const contentType = response.headers.get("content-type") || ""
          if (contentType.includes("application/json")) {
            const errorData = await response.json()
            message = errorData.error || message
          } else {
            const text = await response.text()
            if (response.status === 413) {
              message = "Images too large. Please upload fewer or smaller images."
            }
          }
        } catch { }
        throw new Error(message)
      }

      // Refresh products cache so the updated product shows up immediately in the store
      try {
        await refresh()
      } catch (refreshError) {
        console.error("Failed to refresh products cache:", refreshError)
      }

      setSuccess(true)
      setTimeout(() => router.push("/admin/dashboard"), 2000)
    } catch (error) {
      console.error("Update error:", error)
      setError(error instanceof Error ? error.message : "Failed to update product")
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSizeChange = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      sizes: prev.sizes.map((size, i) => (i === index ? { ...size, [field]: value } : size)),
    }))
  }

  const addSize = () => {
    setFormData(prev => ({
      ...prev,
      sizes: [...prev.sizes, {
        originalPrice: "",
        discountedPrice: "",
        stockCount: ""
      }],
    }))
  }

  const removeSize = (index: number) => {
    setFormData(prev => ({
      ...prev,
      sizes: prev.sizes.filter((_, i) => i !== index),
    }))
  }

  if (authState.isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading product details...</p>
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
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-8"
          >
            <Link
              href="/admin/dashboard"
              className="inline-flex items-center text-gray-600 hover:text-black transition-colors mb-6"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-light tracking-wider mb-2">Edit Product: {formData.name}</h1>
            <p className="text-gray-600">Update the product details below</p>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            {success && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <Alert className="border-green-200 bg-green-50">
                  <AlertDescription className="text-green-600">
                    Product updated successfully! Redirecting to dashboard...
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            {error && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription className="text-red-600">{error}</AlertDescription>
                </Alert>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Product Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Product Images */}
                    <div>
                      <Label>Product Images</Label>
                      <div className="mt-2">
                        <div className="flex items-center justify-center w-full">
                          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              <Upload className="w-8 h-8 mb-4 text-gray-500" />
                              <p className="mb-2 text-sm text-gray-500">
                                {uploading ? "Uploading..." : <><span className="font-semibold">Click to upload</span> product images</>}
                              </p>
                              <p className="text-xs text-gray-500">PNG, JPG or JPEG (MAX. 5MB each)</p>
                            </div>
                            <input
                              type="file"
                              className="hidden"
                              multiple
                              accept="image/*"
                              onChange={handleImageUpload}
                            />
                          </label>
                        </div>

                        {uploadedImages.length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                            {uploadedImages.map((image, index) => (
                              <div key={index} className="relative">
                                <img
                                  src={image}
                                  alt={`Product ${index + 1}`}
                                  className="w-full h-24 object-cover rounded-lg"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeImage(index)}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="name">Product Name *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleChange("name", e.target.value)}
                          placeholder="e.g., Midnight Essence"
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="collection">Collection *</Label>
                        <Select
                          value={formData.collection}
                          onValueChange={(value) => handleChange("collection", value)}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select collection" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="wedding">Wedding Collection</SelectItem>
                            <SelectItem value="soiree">Soiree Collection</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="category">Category *</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => handleChange("category", value)}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mona-saleh">Mona Saleh</SelectItem>
                          <SelectItem value="el-raey-1">Raey 1</SelectItem>
                          <SelectItem value="el-raey-2">Raey 2</SelectItem>
                          <SelectItem value="el-raey-the-yard">Raey The Yard</SelectItem>
                          <SelectItem value="sell-dresses">Collection for Sell Dresses</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="description">Short Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => handleChange("description", e.target.value)}
                        placeholder="Brief product description for product cards and listings"
                        rows={4}
                      />
                      <p className="text-sm text-gray-600 mt-1">
                        This short description will be displayed on product cards and listings
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="longDescription">Long Description</Label>
                      <Textarea
                        id="longDescription"
                        value={formData.longDescription}
                        onChange={(e) => handleChange("longDescription", e.target.value)}
                        placeholder="Extended product description for detailed view"
                        rows={6}
                      />
                    </div>

                    {/* Product Sizes */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <Label>Available Options *</Label>
                        <Button type="button" onClick={addSize} size="sm" variant="outline">
                          <Plus className="h-4 w-4 mr-1" />
                          Add Option
                        </Button>
                      </div>
                      <div className="space-y-4">
                        {formData.sizes.map((size, index) => (
                          <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                            <div className="grid md:grid-cols-2 gap-3 items-end">
                              <div>
                                <Label>Original Price (EGP)</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={size.originalPrice}
                                  onChange={(e) => handleSizeChange(index, "originalPrice", e.target.value)}
                                  placeholder="200.00"
                                />
                                <p className="text-xs text-gray-500 mt-1">Price in EGP</p>
                              </div>
                              <div>
                                <Label>Discounted Price (EGP)</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={size.discountedPrice}
                                  onChange={(e) => handleSizeChange(index, "discountedPrice", e.target.value)}
                                  placeholder="150.00"
                                />
                                <p className="text-xs text-gray-500 mt-1">Price in EGP</p>
                              </div>
                            </div>
                            <div className="flex justify-end mt-3">
                              {formData.sizes.length > 1 && (
                                <Button
                                  type="button"
                                  onClick={() => removeSize(index)}
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Status Flags */}
                    <div className="flex items-center space-x-6 pt-4">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="active"
                          checked={formData.isActive}
                          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                          className="h-4 w-4 text-black rounded"
                        />
                        <Label htmlFor="active" className="ml-2">Active</Label>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="new"
                          checked={formData.isNew}
                          onChange={(e) => setFormData({ ...formData, isNew: e.target.checked })}
                          className="h-4 w-4 text-black rounded"
                        />
                        <Label htmlFor="new" className="ml-2">New</Label>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="bestseller"
                          checked={formData.isBestseller}
                          onChange={(e) => setFormData({ ...formData, isBestseller: e.target.checked })}
                          className="h-4 w-4 text-black rounded"
                        />
                        <Label htmlFor="bestseller" className="ml-2">Best Rental</Label>
                      </div>


                    </div>

                    <div className="flex items-center justify-end space-x-4 pt-6">
                      <Link href="/admin/dashboard">
                        <Button type="button" variant="outline">
                          Cancel
                        </Button>
                      </Link>
                      <Button type="submit" className="bg-black text-white hover:bg-gray-800" disabled={loading}>
                        {loading ? (
                          <>
                            <Save className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Changes
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  )
}
