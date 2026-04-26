export interface User {
  id?: string // UUID
  email: string
  password: string
  name: string
  role: "admin" | "user"
  favorites?: string[] // Array of product IDs
  created_at?: Date
  updated_at?: Date
}

export interface Product {
  id?: string // UUID
  product_id: string // The actual product ID (e.g., "midnight-essence")
  code?: string
  name: string
  description: string
  longDescription?: string
  price: number
  beforeSalePrice?: number // original price before sale
  afterSalePrice?: number  // discounted price after sale
  sizes: { size: string; volume: string; originalPrice?: number; discountedPrice?: number; stockCount?: number }[]
  images: string[]
  rating: number
  reviews: number
  notes: { top: string[]; middle: string[]; base: string[] }
  branch: string
  collection?: string
  isNew?: boolean
  isBestseller?: boolean
  isActive: boolean
  isOutOfStock?: boolean
  isGiftPackage?: boolean
  packagePrice?: number
  packageOriginalPrice?: number
  giftPackageSizes?: any[]
  created_at?: Date
  updated_at?: Date
}

export interface OrderItem {
  id: string
  productId?: string
  name: string
  price: number
  size: string
  volume: string
  image: string
  branch: string
  quantity: number
  type?: "buy" | "rent"
  rentStart?: string
  rentEnd?: string
  collection?: string
  isGiftPackage?: boolean
  selectedProducts?: any[]
  packageDetails?: any
  customMeasurements?: {
    unit: "cm" | "inch"
    values: {
      shoulder: string
      bust: string
      waist: string
      hips: string
      sleeve: string
      length: string
    }
  }
}

export interface Order {
  id?: string // UUID
  order_id: string // The actual order ID used in the app
  user_id: string // UUID
  items: OrderItem[]
  total: number
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled"
  shippingAddress: {
    name: string
    email: string
    phone: string
    secondaryPhone: string
    address: string
    city: string
    country: string
    countryCode?: string
    governorate?: string
    postalCode: string
  }
  paymentMethod: "cod" | "visa" | "mastercard"
  paymentDetails?: {
    cardNumber: string
    cardName: string
  }
  discount_code?: string | null
  discount_amount?: number
  created_at?: Date
  updated_at?: Date
}

export interface CartItem {
  id: string
  name: string
  price: number
  size: string
  volume: string
  image: string
  branch: string
  quantity: number
  type?: "buy" | "rent"
  rentStart?: string
  rentEnd?: string
  collection?: string
}
