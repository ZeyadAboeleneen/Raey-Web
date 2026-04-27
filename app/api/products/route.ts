import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import type { Product as BaseProduct } from "@/lib/models/types"

type CachedProductsEntry = {
  status: number
  body: string
  headers: Record<string, string>
  expiresAt: number
}

const LIST_CACHE_TTL_MS = Number(process.env.PRODUCTS_CACHE_TTL_MS ?? 300_000)
const DETAIL_CACHE_TTL_MS = Number(process.env.PRODUCT_DETAIL_CACHE_TTL_MS ?? 300_000)

const globalForProducts = globalThis as typeof globalThis & {
  _productsCache?: Map<string, CachedProductsEntry>
}

const productsCache = globalForProducts._productsCache ?? new Map<string, CachedProductsEntry>()
if (!globalForProducts._productsCache) {
  globalForProducts._productsCache = productsCache
}

const buildCacheKey = (url: URL) => {
  const params = Array.from(url.searchParams.entries())
    .sort(([a, aVal], [b, bVal]) => {
      const nameCompare = a.localeCompare(b)
      return nameCompare !== 0 ? nameCompare : aVal.localeCompare(bVal)
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&")
  return params ? `${url.pathname}?${params}` : url.pathname
}

const getCachedResponse = (url: URL, variant?: string) => {
  const cacheKey = variant ? `${buildCacheKey(url)}|${variant}` : buildCacheKey(url)
  const entry = productsCache.get(cacheKey)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    productsCache.delete(cacheKey)
    return null
  }
  return new NextResponse(entry.body, { status: entry.status, headers: entry.headers })
}

const setCachedResponse = (url: URL, status: number, body: string, headers: Record<string, string>, ttl: number, variant?: string) => {
  const cacheKey = variant ? `${buildCacheKey(url)}|${variant}` : buildCacheKey(url)
  productsCache.set(cacheKey, { status, body, headers, expiresAt: Date.now() + Math.max(ttl, 1_000) })
}

const clearProductsCache = () => { 
  if (productsCache.size > 0) productsCache.clear() 
  // Also clear SSR cache and promise if they exist
  const g = globalThis as any
  if (g._ssrProductsCache) {
    g._ssrProductsCache = undefined
  }
  if (g._ssrProductsPromise) {
    g._ssrProductsPromise = undefined
  }
}

export const maxDuration = 60
export const runtime = "nodejs"

const errorResponse = (status: number, message: string, details?: any) =>
  NextResponse.json({
    error: message,
    details: details instanceof Error ? details.message : details,
    timestamp: new Date().toISOString()
  }, { status })

const calculateIsOutOfStock = (sizes: any[]): boolean => {
  if (!sizes || sizes.length === 0) return false
  return sizes.every((size: any) => {
    const stockCount = size.stockCount ?? size.stock_count
    return stockCount === 0
  })
}

type ApiProduct = BaseProduct & { _id: string; createdAt: string; updatedAt: string }

const transformProduct = (product: any): ApiProduct => {
  let sizes = product.sizes || []
  if (sizes.length === 0 && product.price) {
    sizes = [{
      size: "Standard",
      volume: "-",
      originalPrice: product.beforeSalePrice || product.price,
      discountedPrice: product.price,
      stockCount: 10
    }]
  }

  const isOutOfStock = product.isOutOfStock !== undefined
    ? product.isOutOfStock
    : calculateIsOutOfStock(sizes)

  const primaryImage = product.imageUrl || product.image_url
  const images = Array.isArray(product.images) && product.images.length > 0
    ? product.images
    : (primaryImage ? [primaryImage] : [])

  return {
    _id: product.productId,
    id: product.productId,
    product_id: product.productId,
    name: product.name,
    description: product.description,
    longDescription: product.longDescription,
    price: product.price || 0,
    beforeSalePrice: product.beforeSalePrice,
    afterSalePrice: product.afterSalePrice,
    sizes: sizes.map((size: any) => ({ ...size, stockCount: size.stockCount ?? size.stock_count })),
    images,
    rating: product.rating || 0,
    reviews: product.reviewCount || 0,
    notes: product.notes || { top: [], middle: [], base: [] },
    category: product.category,
    collection: product.collection || null,
    isNew: product.isNew === true,
    isBestseller: product.isBestseller === true,
    isActive: product.isActive !== false,
    isOutOfStock,
    isGiftPackage: product.isGiftPackage || false,
    packagePrice: product.packagePrice,
    packageOriginalPrice: product.packageOriginalPrice,
    giftPackageSizes: product.giftPackageSizes || [],
    createdAt: product.createdAt ? new Date(product.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: product.updatedAt ? new Date(product.updatedAt).toISOString() : new Date().toISOString(),
  }
}

const listSelect = {
  productId: true,
  code: true,
  name: true,
  description: true,
  price: true,
  beforeSalePrice: true,
  afterSalePrice: true,
  sizes: true,
  imageUrl: true,
  rating: true,
  reviewCount: true,
  category: true,
  collection: true,
  isNew: true,
  isBestseller: true,
  isActive: true,
  isOutOfStock: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  console.log("🔍 [API] GET /api/products - Request received")

  try {
    const { searchParams } = new URL(request.url)
    const requestUrl = new URL(request.url)
    const includeInactive = searchParams.get("includeInactive") === "true"

    const cachedResponse = getCachedResponse(requestUrl)
    if (cachedResponse && !includeInactive) {
      console.log("⚡ Served from API cache")
      return cachedResponse
    }

    let isAdmin = false
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
        isAdmin = decoded.role === "admin"
      } catch { }
    }

    const cacheEligible = !(includeInactive && isAdmin)

    const id = searchParams.get("id")
    const category = searchParams.get("category")
    const collection = searchParams.get("collection")
    const search = (searchParams.get("search") || searchParams.get("q") || "").trim()
    const searchWords = search.split(/\s+/).filter(Boolean)
    const isBestsellerParam = searchParams.get("isBestseller")
    const isNewParam = searchParams.get("isNew")
    const isGiftPackageParam = searchParams.get("isGiftPackage")
    const hasPageParam = searchParams.has("page")
    const hasLimitParam = searchParams.has("limit")
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "40", 10), 1), 1000)
    const skip = (page - 1) * limit

    // Build shared where clause
    const where: any = {}
    if (!includeInactive || !isAdmin) where.isActive = true
    if (category) where.category = category
    if (collection) where.collection = collection
    if (searchWords.length > 0) {
      where.AND = searchWords.map(word => ({
        name: { contains: word }
      }))
    }
    if (isBestsellerParam !== null) where.isBestseller = isBestsellerParam === "true"
    if (isNewParam !== null) where.isNew = isNewParam === "true"
    if (isGiftPackageParam !== null) where.isGiftPackage = isGiftPackageParam === "true"

    // Single product by id
    if (id) {
      const product = await prisma.product.findFirst({
        where: { productId: id, ...(!includeInactive || !isAdmin ? { isActive: true } : {}) },
      })

      if (!product) return errorResponse(404, "Product not found")

      const body = JSON.stringify(transformProduct(product))
      const headers = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", "Content-Type": "application/json" }
      if (cacheEligible) {
        setCachedResponse(requestUrl, 200, body, headers, LIST_CACHE_TTL_MS)
      }
      return new NextResponse(body, { status: 200, headers })
    }

    // Paginated list
    if (hasPageParam) {
      const [products, total] = await prisma.$transaction([
        prisma.product.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, select: listSelect }),
        prisma.product.count({ where }),
      ])

      const totalPages = Math.max(Math.ceil(total / limit), 1)
      const productsForList = products.map(transformProduct)

      const headers = {
        "Content-Type": "application/json",
        "X-Total-Count": String(total),
        "X-Page": String(page),
        "X-Limit": String(limit),
        "X-Total-Pages": String(totalPages),
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      }
      const body = JSON.stringify(productsForList)
      if (cacheEligible) {
        setCachedResponse(requestUrl, 200, body, headers, LIST_CACHE_TTL_MS)
      }
      return new NextResponse(body, { status: 200, headers })
    }

    // All products (no pagination)
    const queryOptions: any = { where, orderBy: { createdAt: "desc" } }
    if (hasLimitParam) queryOptions.take = limit
    queryOptions.select = listSelect

    const products = await prisma.product.findMany(queryOptions)
    const productsForList = products.map(transformProduct)

    console.log(`⏱️ [API] ${Date.now() - startTime}ms (all=${productsForList.length})`)
    const headers = { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" }
    const body = JSON.stringify(productsForList)
    if (cacheEligible) {
      setCachedResponse(requestUrl, 200, body, headers, LIST_CACHE_TTL_MS)
    }
    return new NextResponse(body, { status: 200, headers })

  } catch (error) {
    console.error("❌ [API] Error in GET /api/products:", error)
    return errorResponse(500, "Internal server error", error)
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return errorResponse(401, "Authorization required")

    let decoded: any
    try { decoded = jwt.verify(token, process.env.JWT_SECRET!) } catch { return errorResponse(401, "Invalid token") }
    if (decoded.role !== "admin") return errorResponse(403, "Admin access required")

    const productData = await request.json()
    const productId = productData.id || `product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Check for existing product with the same name if replace option is provided
    if (productData.checkDuplicate) {
      const existingProduct = await prisma.product.findFirst({
        where: { name: productData.name }
      })
      if (existingProduct) {
        return NextResponse.json({ 
          error: "DUPLICATE_NAME", 
          message: "A product with this name already exists.",
          existingId: existingProduct.productId 
        }, { status: 409 })
      }
    }

    let data: any

    if (productData.isGiftPackage) {
      data = {
        productId,
        name: productData.name,
        description: productData.description,
        longDescription: productData.longDescription || "",
        sizes: [],
        giftPackageSizes: productData.giftPackageSizes || [],
        packagePrice: productData.packagePrice ? Number(productData.packagePrice) : 0,
        packageOriginalPrice: productData.packageOriginalPrice ? Number(productData.packageOriginalPrice) : null,
        images: productData.images || ["/placeholder.svg"],
        imageUrl: (productData.images && productData.images.length > 0 && productData.images[0] !== "/placeholder.svg") ? productData.images[0] : null,
        rating: 0, reviewCount: 0,
        notes: { top: productData.notes?.top || [], middle: productData.notes?.middle || [], base: productData.notes?.base || [] },
        category: productData.category,
        collection: productData.collection ? productData.collection.trim() : null,
        isNew: productData.isNew ?? false,
        isBestseller: productData.isBestseller ?? false,
        isOutOfStock: productData.isOutOfStock ?? false,
        isActive: productData.isActive ?? true,
        isGiftPackage: true,
        price: productData.packagePrice ? Number(productData.packagePrice) : 0,
      }
    } else {
      const sizes = (productData.sizes || []).map((size: any) => {
        const stockCount = size.stockCount !== undefined && size.stockCount !== null && size.stockCount !== ""
          ? (Number(size.stockCount) >= 0 ? Number(size.stockCount) : undefined) : undefined
        
        // Convert prices to Number without extra rounding to preserve decimals provided by user
        const originalPrice = size.originalPrice !== undefined && size.originalPrice !== null && size.originalPrice !== "" 
          ? Number(size.originalPrice) 
          : undefined
        const discountedPrice = size.discountedPrice !== undefined && size.discountedPrice !== null && size.discountedPrice !== "" 
          ? Number(size.discountedPrice) 
          : undefined

        return { 
          size: size.size, 
          volume: size.volume, 
          originalPrice,
          discountedPrice,
          stockCount 
        }
      })
      const isOutOfStock = calculateIsOutOfStock(sizes)
      data = {
        productId,
        name: productData.name,
        description: productData.description,
        longDescription: productData.longDescription || "",
        sizes,
        giftPackageSizes: [],
        images: productData.images || ["/placeholder.svg"],
        imageUrl: (productData.images && productData.images.length > 0 && productData.images[0] !== "/placeholder.svg") ? productData.images[0] : null,
        rating: 0, reviewCount: 0,
        notes: { top: productData.notes?.top || [], middle: productData.notes?.middle || [], base: productData.notes?.base || [] },
        category: productData.category,
        collection: productData.collection ? productData.collection.trim() : null,
        isNew: productData.isNew ?? false,
        isBestseller: productData.isBestseller ?? false,
        isOutOfStock,
        isActive: productData.isActive ?? true,
        isGiftPackage: false,
        price: sizes.length > 0
          ? Math.min(...sizes.map((s: any) => s.discountedPrice !== undefined ? Number(s.discountedPrice) : Number(s.originalPrice)))
          : 0,
        beforeSalePrice: productData.beforeSalePrice !== undefined && productData.beforeSalePrice !== "" ? Number(productData.beforeSalePrice) : null,
        afterSalePrice: productData.afterSalePrice !== undefined && productData.afterSalePrice !== "" ? Number(productData.afterSalePrice) : null,
      }
    }

    const result = await prisma.product.create({ data })
    clearProductsCache()
    console.log(`⏱️ [API] Product created in ${Date.now() - startTime}ms`)
    return NextResponse.json({ success: true, product: transformProduct(result), message: "Product created successfully" })

  } catch (error) {
    console.error("❌ [API] Error in POST /api/products:", error)
    return errorResponse(500, "Internal server error", error)
  }
}

export async function PUT(request: NextRequest) {
  const startTime = Date.now()
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return errorResponse(401, "Authorization required")

    let decoded: any
    try { decoded = jwt.verify(token, process.env.JWT_SECRET!) } catch { return errorResponse(401, "Invalid token") }
    if (decoded.role !== "admin") return errorResponse(403, "Admin access required")

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return errorResponse(400, "Product ID is required")

    const productData = await request.json()
    let updateData: any

    if (productData.isGiftPackage) {
      updateData = {
        name: productData.name, description: productData.description, longDescription: productData.longDescription || "",
        category: productData.category, collection: productData.collection ? productData.collection.trim() : null, sizes: [], giftPackageSizes: productData.giftPackageSizes || [],
        packagePrice: productData.packagePrice ? Number(productData.packagePrice) : 0,
        packageOriginalPrice: productData.packageOriginalPrice ? Number(productData.packageOriginalPrice) : null,
        images: productData.images, imageUrl: (productData.images && productData.images.length > 0 && productData.images[0] !== "/placeholder.svg") ? productData.images[0] : null, notes: productData.notes,
        isActive: productData.isActive, isNew: productData.isNew, isBestseller: productData.isBestseller,
        isOutOfStock: productData.isOutOfStock, isGiftPackage: true,
        price: productData.packagePrice ? Number(productData.packagePrice) : 0,
        beforeSalePrice: null, afterSalePrice: null,
      }
    } else {
      const sizes = (productData.sizes || []).map((size: any) => {
        const stockCount = size.stockCount !== undefined && size.stockCount !== null && size.stockCount !== ""
          ? (Number(size.stockCount) >= 0 ? Number(size.stockCount) : undefined) : undefined
        return { size: size.size, volume: size.volume, originalPrice: size.originalPrice ? Number(size.originalPrice) : undefined, discountedPrice: size.discountedPrice ? Number(size.discountedPrice) : undefined, stockCount }
      })
      updateData = {
        name: productData.name, description: productData.description, longDescription: productData.longDescription || "",
        category: productData.category, collection: productData.collection ? productData.collection.trim() : null, sizes, images: productData.images, imageUrl: (productData.images && productData.images.length > 0 && productData.images[0] !== "/placeholder.svg") ? productData.images[0] : null, notes: productData.notes,
        isActive: productData.isActive, isNew: productData.isNew, isBestseller: productData.isBestseller,
        isOutOfStock: calculateIsOutOfStock(sizes), isGiftPackage: false,
        price: productData.sizes?.length > 0
          ? Math.min(...productData.sizes.map((s: any) => s.discountedPrice ? Number(s.discountedPrice) : Number(s.originalPrice)))
          : 0,
        beforeSalePrice: productData.beforeSalePrice !== undefined && productData.beforeSalePrice !== "" ? Number(productData.beforeSalePrice) : null,
        afterSalePrice: productData.afterSalePrice !== undefined && productData.afterSalePrice !== "" ? Number(productData.afterSalePrice) : null,
      }
    }

    const updatedProduct = await prisma.product.update({ where: { productId: id }, data: updateData })
    clearProductsCache()
    console.log(`⏱️ [API] Product updated in ${Date.now() - startTime}ms`)
    return NextResponse.json({ success: true, product: transformProduct(updatedProduct), message: "Product updated successfully" })

  } catch (error: any) {
    if (error?.code === "P2025") return errorResponse(404, "Product not found")
    console.error("❌ [API] Error in PUT /api/products:", error)
    return errorResponse(500, "Internal server error", error)
  }
}

export async function DELETE(request: NextRequest) {
  const startTime = Date.now()
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return errorResponse(401, "Authorization required")

    let decoded: any
    try { decoded = jwt.verify(token, process.env.JWT_SECRET!) } catch { return errorResponse(401, "Invalid token") }
    if (decoded.role !== "admin") return errorResponse(403, "Admin access required")

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return errorResponse(400, "Product ID is required")

    await prisma.product.delete({ where: { productId: id } })
    clearProductsCache()
    console.log(`⏱️ [API] Product deleted in ${Date.now() - startTime}ms`)
    return NextResponse.json({ success: true, message: "Product deleted successfully" })

  } catch (error: any) {
    if (error?.code === "P2025") return errorResponse(404, "Product not found")
    console.error("❌ [API] Error in DELETE /api/products:", error)
    return errorResponse(500, "Internal server error", error)
  }
}
