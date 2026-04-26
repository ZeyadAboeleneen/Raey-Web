"use client"

import type React from "react"
import { createContext, useContext, useReducer, type ReactNode } from "react"

interface Product {
  id: string
  name: string
  description: string
  longDescription: string
  price: number
  beforeSalePrice?: number // original price before sale
  afterSalePrice?: number  // discounted price after sale
  sizes: { size: string; volume: string }[]
  images: string[]
  rating: number
  reviews: number
  notes: { top: string[]; middle: string[]; base: string[] }
  branch: string
  isNew?: boolean
  isBestseller?: boolean
  isActive: boolean
}

interface ProductState {
  products: Product[]
}

type ProductAction =
  | { type: "ADD_PRODUCT"; payload: Product }
  | { type: "UPDATE_PRODUCT"; payload: Product }
  | { type: "DELETE_PRODUCT"; payload: string }
  | { type: "LOAD_PRODUCTS"; payload: Product[] }

const ProductContext = createContext<{
  state: ProductState
  dispatch: React.Dispatch<ProductAction>
  addProduct: (product: Omit<Product, "id">) => void
  updateProduct: (product: Product) => void
  deleteProduct: (productId: string) => void
  getProductsByBranch: (branchSlug: string) => Product[]
  getProductById: (branchSlug: string, productId: string) => Product | undefined
} | null>(null)

// Initial products data
const initialProducts: Product[] = [
  {
    id: "midnight-essence",
    name: "Midnight Essence",
    description: "A bold and mysterious fragrance with notes of bergamot, cedar, and amber",
    longDescription:
      "Midnight Essence captures the allure of the night with its sophisticated blend of citrus freshness and woody depth. This captivating fragrance opens with bright bergamot and black pepper, evolving into a heart of cedar and lavender, before settling into a rich base of amber, vanilla, and musk. Perfect for the modern gentleman who commands attention.",
    price: 120,
    beforeSalePrice: 150, // Added sale price
    afterSalePrice: 120,  // Added sale price
    sizes: [
              { size: "Travel", volume: "15ml" },
        { size: "Standard", volume: "50ml" },
        { size: "Large", volume: "100ml" },
    ],
    images: [
      "/placeholder.svg",
      "/placeholder.svg",
      "/placeholder.svg",
    ],
    rating: 4.8,
    reviews: 127,
    notes: {
      top: ["Bergamot", "Black Pepper", "Lemon"],
      middle: ["Cedar", "Lavender", "Geranium"],
      base: ["Amber", "Vanilla", "Musk"],
    },
    branch: "men",
    isBestseller: true,
    isActive: true,
  },
  {
    id: "rose-noir",
    name: "Rose Noir",
    description: "Elegant and romantic with dark rose, patchouli, and vanilla",
    longDescription:
      "Rose Noir is an intoxicating blend that celebrates the darker side of femininity. This sophisticated fragrance combines the classic elegance of rose with mysterious undertones of patchouli and warm vanilla. The result is a scent that is both romantic and rebellious, perfect for the woman who embraces her complexity.",
    price: 130,
    beforeSalePrice: 160, // Added sale price
    afterSalePrice: 130,  // Added sale price
    sizes: [
              { size: "Travel", volume: "15ml" },
        { size: "Standard", volume: "50ml" },
        { size: "Large", volume: "100ml" },
    ],
    images: [
      "/placeholder.svg",
      "/placeholder.svg",
      "/placeholder.svg",
    ],
    rating: 4.9,
    reviews: 203,
    notes: {
      top: ["Bulgarian Rose", "Pink Pepper", "Bergamot"],
      middle: ["Dark Rose", "Patchouli", "Jasmine"],
      base: ["Vanilla", "Sandalwood", "Amber"],
    },
    branch: "women",
    isBestseller: true,
    isActive: true,
  },
]

function productReducer(state: ProductState, action: ProductAction): ProductState {
  switch (action.type) {
    case "ADD_PRODUCT":
      return {
        products: [...state.products, action.payload],
      }
    case "UPDATE_PRODUCT":
      return {
        products: state.products.map((product) => (product.id === action.payload.id ? action.payload : product)),
      }
    case "DELETE_PRODUCT":
      return {
        products: state.products.filter((product) => product.id !== action.payload),
      }
    case "LOAD_PRODUCTS":
      return {
        products: action.payload,
      }
    default:
      return state
  }
}

export function ProductProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(productReducer, {
    products: initialProducts,
  })

  const addProduct = (product: Omit<Product, "id">) => {
    const newProduct: Product = {
      ...product,
      id: `product-${Date.now()}`,
    }
    dispatch({ type: "ADD_PRODUCT", payload: newProduct })
  }

  const updateProduct = (product: Product) => {
    dispatch({ type: "UPDATE_PRODUCT", payload: product })
  }

  const deleteProduct = (productId: string) => {
    dispatch({ type: "DELETE_PRODUCT", payload: productId })
  }

  const getProductsByBranch = (branchSlug: string): Product[] => {
    return state.products.filter((product) => product.branch === branchSlug && product.isActive)
  }

  const getProductById = (branchSlug: string, productId: string): Product | undefined => {
    return state.products.find((product) => product.branch === branchSlug && product.id === productId)
  }

  return (
    <ProductContext.Provider
      value={{
        state,
        dispatch,
        addProduct,
        updateProduct,
        deleteProduct,
        getProductsByBranch,
        getProductById,
      }}
    >
      {children}
    </ProductContext.Provider>
  )
}

export function useProducts() {
  const context = useContext(ProductContext)
  if (!context) {
    throw new Error("useProducts must be used within a ProductProvider")
  }
  return context
}
