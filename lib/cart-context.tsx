"use client"

import type React from "react"
import { createContext, useContext, useReducer, useEffect, type ReactNode } from "react"
import { useAuth } from "@/lib/auth-context"

interface CustomMeasurements {
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

interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
  size: string
  volume?: string
  image: string
  branch: string | null
  productId: string 
  originalPrice?: number 
  isGiftPackage?: boolean
  customMeasurements?: CustomMeasurements
  stockCount?: number // Available stock for this size
  type?: "buy" | "rent"
  rentStart?: string
  rentEnd?: string
  collection?: string
  selectedProduct?: {
    productId: string
    productName: string
    productImage: string
    productDescription: string
  }
  selectedProducts?: Array<{
    size: string
    volume?: string
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
      volume?: string
      selectedProduct: {
        productId: string
        productName: string
        productImage: string
        productDescription: string
      }
    }>
  }
}

interface CartState {
  items: CartItem[]
  total: number
  count: number
  showNotification: boolean
  lastAddedItem: CartItem | null
}

const GUEST_CART_KEY = "ala_cart_guest"

function checkStorageQuota(key: string, data: string): boolean {
  try {
    // Check if we can estimate the size
    const dataSize = new Blob([data]).size
    
    // Try to get remaining quota estimate (not supported in all browsers)
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then((estimate) => {
        if (estimate.quota && estimate.usage) {
          const remaining = estimate.quota - estimate.usage
          if (remaining < dataSize * 2) { // Leave some buffer
            console.warn('Storage quota nearly exceeded. Proactively clearing cart.')
            clearAllCartData()
          }
        }
      })
    }
    
    // Test if we can actually save the data
    const testData = 'test_' + Date.now()
    localStorage.setItem(testData, data)
    localStorage.removeItem(testData)
    return true
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.error('Storage quota exceeded during check. Clearing cart data.')
      clearAllCartData()
      return false
    }
    return true // Other errors, try anyway
  }
}

function clearAllCartData() {
  try {
    // Clear all possible cart keys
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.startsWith('sense_cart_')) {
        localStorage.removeItem(key)
      }
    })
  } catch (error) {
    console.error('Error clearing cart data:', error)
  }
}

function saveCartToStorage(key: string, items: CartItem[]) {
  try {
    // Limit cart size to prevent quota issues (max 15 items)
    const limitedItems = items.slice(0, 15)
    if (limitedItems.length < items.length) {
      console.warn('Cart size limited to 15 items to prevent storage quota issues.')
      // Show user notification
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('cartSizeLimited', {
          detail: { 
            message: `Cart limited to 15 items. Removed ${items.length - 15} items.`,
            removedCount: items.length - 15
          }
        }))
      }
    }
    
    // Create minimal version for storage to reduce space
    const minimalItems = limitedItems.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      size: item.size,
      volume: item.volume,
      image: item.image,
      branch: item.branch,
      productId: item.productId,
      originalPrice: item.originalPrice,
      isGiftPackage: item.isGiftPackage,
      customMeasurements: item.customMeasurements,
      type: item.type,
      rentStart: item.rentStart,
      rentEnd: item.rentEnd,
      collection: item.collection,
    }))
    
    const serialized = JSON.stringify(minimalItems)
    
    localStorage.setItem(key, serialized)
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.error('LocalStorage quota exceeded. Clearing old cart data.')
      clearAllCartData()
      // Try to save empty cart
      try {
        localStorage.setItem(key, JSON.stringify([]))
      } catch (clearError) {
        console.error('Failed to clear cart storage:', clearError)
      }
      // Notify app about quota issue
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('cartQuotaExceeded'))
      }
    } else {
      console.error('Error saving cart to storage:', error)
    }
  }
}

function getCartFromStorage(key: string): CartItem[] {
  try {
    const raw = localStorage.getItem(key)
    return parseCart(raw)
  } catch (error) {
    console.error('Error reading cart from storage:', error)
    return []
  }
}

function removeCartFromStorage(key: string) {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.error('Error removing cart from storage:', error)
  }
}

function parseCart(raw: string | null): CartItem[] {
  if (!raw) {
    return []
  }
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch (error) {
    console.error("Error parsing cart data:", error)
    return []
  }
}

function mergeCartItems(...carts: CartItem[][]): CartItem[] {
  const itemMap = new Map<string, CartItem>()

  carts.forEach((cart) => {
    cart.forEach((item) => {
      const existing = itemMap.get(item.id)
      if (existing) {
        itemMap.set(item.id, { ...existing, quantity: existing.quantity + item.quantity })
      } else {
        itemMap.set(item.id, { ...item })
      }
    })
  })

  return Array.from(itemMap.values())
}

type CartAction =
  | { type: "ADD_ITEM"; payload: Omit<CartItem, "quantity"> & { quantity?: number } }
  | { type: "REMOVE_ITEM"; payload: string }
  | { type: "UPDATE_QUANTITY"; payload: { id: string; quantity: number; availableStock?: number } }
  | { type: "CLEAR_CART" }
  | { type: "LOAD_CART"; payload: CartItem[] }
  | { type: "SHOW_NOTIFICATION"; payload: CartItem }
  | { type: "HIDE_NOTIFICATION" }

const CartContext = createContext<{
  state: CartState
  dispatch: React.Dispatch<CartAction>
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number, availableStock?: number) => void
  clearCart: () => void
  hideNotification: () => void
} | null>(null)

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      console.log("Cart reducer: ADD_ITEM called with payload:", action.payload)
      
      const existingItem = state.items.find((item) => item.id === action.payload.id)
      let newItems: CartItem[]
      let customQuantity = action.payload.quantity || 1
      
      // Check stock if available
      if (action.payload.stockCount !== undefined && action.payload.stockCount !== null) {
        if (existingItem) {
          // Check if adding more would exceed stock
          const newTotalQuantity = existingItem.quantity + customQuantity
          if (newTotalQuantity > action.payload.stockCount) {
            // Limit to available stock
            customQuantity = Math.max(0, action.payload.stockCount - existingItem.quantity)
            if (customQuantity <= 0) {
              // Can't add more, return current state
              return state
            }
          }
        } else {
          // New item, check if quantity exceeds stock
          if (customQuantity > action.payload.stockCount) {
            customQuantity = action.payload.stockCount
          }
          if (customQuantity <= 0) {
            // Can't add, return current state
            return state
          }
        }
      }

      if (existingItem) {
        console.log("Cart reducer: Updating existing item:", existingItem.id)
        newItems = state.items.map((item) =>
          item.id === action.payload.id ? { ...item, quantity: item.quantity + customQuantity, stockCount: action.payload.stockCount } : item,
        )
      } else {
        console.log("Cart reducer: Adding new item:", action.payload.id)
        newItems = [...state.items, { ...action.payload, quantity: customQuantity }]
      }

      const newTotal = newItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
      const newCount = newItems.reduce((sum, item) => sum + item.quantity, 0)

      console.log("Cart reducer: New items count:", newItems.length)
      console.log("Cart reducer: New total:", newTotal)

      return {
        ...state,
        items: newItems,
        total: newTotal,
        count: newCount,
        showNotification: true,
        lastAddedItem: existingItem
          ? { ...existingItem, quantity: existingItem.quantity + customQuantity, stockCount: action.payload.stockCount }
          : { ...action.payload, quantity: customQuantity },
      }
    }

    case "REMOVE_ITEM": {
      const newItems = state.items.filter((item) => item.id !== action.payload)
      const newTotal = newItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
      const newCount = newItems.reduce((sum, item) => sum + item.quantity, 0)

      return {
        ...state,
        items: newItems,
        total: newTotal,
        count: newCount,
      }
    }

    case "UPDATE_QUANTITY": {
      const item = state.items.find((item) => item.id === action.payload.id)
      let quantity = action.payload.quantity
      
      // Check stock if available
      if (item && action.payload.availableStock !== undefined && action.payload.availableStock !== null) {
        // Don't allow quantity to exceed available stock
        quantity = Math.min(quantity, action.payload.availableStock)
        if (quantity <= 0) {
          // Remove item if stock is 0
          const newItems = state.items.filter((item) => item.id !== action.payload.id)
          const newTotal = newItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
          const newCount = newItems.reduce((sum, item) => sum + item.quantity, 0)
          return {
            ...state,
            items: newItems,
            total: newTotal,
            count: newCount,
          }
        }
      }
      
      const newItems = state.items
        .map((item) => (item.id === action.payload.id ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0)

      const newTotal = newItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
      const newCount = newItems.reduce((sum, item) => sum + item.quantity, 0)

      return {
        ...state,
        items: newItems,
        total: newTotal,
        count: newCount,
      }
    }

    case "CLEAR_CART":
      return {
        items: [],
        total: 0,
        count: 0,
        showNotification: false,
        lastAddedItem: null,
      }

    case "LOAD_CART": {
      const newTotal = action.payload.reduce((sum, item) => sum + item.price * item.quantity, 0)
      const newCount = action.payload.reduce((sum, item) => sum + item.quantity, 0)

      return {
        ...state,
        items: action.payload,
        total: newTotal,
        count: newCount,
      }
    }

    case "SHOW_NOTIFICATION":
      return {
        ...state,
        showNotification: true,
        lastAddedItem: action.payload,
      }

    case "HIDE_NOTIFICATION":
      return {
        ...state,
        showNotification: false,
        lastAddedItem: null,
      }

    default:
      return state
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { state: authState } = useAuth()
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
    total: 0,
    count: 0,
    showNotification: false,
    lastAddedItem: null,
  })

  // Get user-specific cart key
  const getCartKey = () => {
    if (authState.isAuthenticated && authState.user?.id) {
      return `sense_cart_${authState.user.id}`
    }
    return GUEST_CART_KEY
  }

  // Load cart from localStorage on mount and when user changes
  useEffect(() => {
    const loadCart = () => {
      try {
        if (authState.isAuthenticated && authState.user?.id) {
          const userCartKey = `sense_cart_${authState.user.id}`
          const guestCartItems = getCartFromStorage(GUEST_CART_KEY)
          const userCartItems = getCartFromStorage(userCartKey)

          const mergedItems = mergeCartItems(userCartItems, guestCartItems)

          if (mergedItems.length > 0) {
            saveCartToStorage(userCartKey, mergedItems)
            dispatch({ type: "LOAD_CART", payload: mergedItems })
          } else {
            removeCartFromStorage(userCartKey)
            dispatch({ type: "CLEAR_CART" })
          }

          if (guestCartItems.length > 0) {
            removeCartFromStorage(GUEST_CART_KEY)
          }
        } else {
          const guestCartItems = getCartFromStorage(GUEST_CART_KEY)
          if (guestCartItems.length > 0) {
            dispatch({ type: "LOAD_CART", payload: guestCartItems })
          } else {
            dispatch({ type: "CLEAR_CART" })
          }
        }
      } catch (error) {
        console.error("Error loading cart:", error)
        dispatch({ type: "CLEAR_CART" })
      }
    }

    loadCart()
  }, [authState.isAuthenticated, authState.user?.id])

  // Save cart to localStorage whenever items change
  useEffect(() => {
    const cartKey = getCartKey()
    saveCartToStorage(cartKey, state.items)
  }, [state.items, authState.isAuthenticated, authState.user?.id])

  // Auto-hide notification after 4 seconds
  useEffect(() => {
    if (state.showNotification) {
      const timer = setTimeout(() => {
        dispatch({ type: "HIDE_NOTIFICATION" })
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [state.showNotification])

  // Listen for quota exceeded events
  useEffect(() => {
    const handleQuotaExceeded = () => {
      console.log('Cart quota exceeded event received. Clearing cart.')
      dispatch({ type: "CLEAR_CART" })
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('cartQuotaExceeded', handleQuotaExceeded)
      return () => {
        window.removeEventListener('cartQuotaExceeded', handleQuotaExceeded)
      }
    }
  }, [])

  const addItem = (item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    dispatch({ type: "ADD_ITEM", payload: item })
  }

  const removeItem = (id: string) => {
    dispatch({ type: "REMOVE_ITEM", payload: id })
  }

  const updateQuantity = (id: string, quantity: number, availableStock?: number) => {
    dispatch({ type: "UPDATE_QUANTITY", payload: { id, quantity, availableStock } })
  }

  const clearCart = () => {
    dispatch({ type: "CLEAR_CART" })
  }

  const hideNotification = () => {
    dispatch({ type: "HIDE_NOTIFICATION" })
  }

  return (
    <CartContext.Provider
      value={{
        state,
        dispatch,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        hideNotification,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error("useCart must be used within a CartProvider")
  }
  return context
}
