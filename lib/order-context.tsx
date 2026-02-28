"use client"

import type React from "react"
import { createContext, useContext, useReducer, type ReactNode } from "react"

interface OrderItem {
  id: string
  name: string
  price: number
  size: string
  volume: string
  image: string
  category: string
  quantity: number
}

interface Order {
  id: string
  userId: string
  items: OrderItem[]
  total: number
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled"
  createdAt: string
  shippingAddress: {
    name: string
    address: string
    city: string
    zipCode: string
    country: string
  }
}

interface OrderState {
  orders: Order[]
}

type OrderAction =
  | { type: "ADD_ORDER"; payload: Order }
  | { type: "UPDATE_ORDER_STATUS"; payload: { orderId: string; status: Order["status"] } }
  | { type: "LOAD_ORDERS"; payload: Order[] }

const OrderContext = createContext<{
  state: OrderState
  dispatch: React.Dispatch<OrderAction>
  createOrder: (userId: string, items: OrderItem[], total: number, shippingAddress: Order["shippingAddress"]) => string
  getUserOrders: (userId: string) => Order[]
  getAllOrders: () => Order[]
  updateOrderStatus: (orderId: string, status: Order["status"]) => void
} | null>(null)

// Mock orders data
const mockOrders: Order[] = [
  {
    id: "order-1",
    userId: "user-1",
    items: [
      {
        id: "midnight-essence-1",
        name: "Midnight Essence",
        price: 120,
        size: "Standard",
        volume: "50ml",
        image: "/placeholder.svg",
        category: "men",
        quantity: 1,
      },
    ],
    total: 129.6,
    status: "delivered",
            createdAt: "2025-01-15T10:30:00Z",
    shippingAddress: {
      name: "John Doe",
      address: "123 Main St",
      city: "New York",
      zipCode: "10001",
      country: "USA",
    },
  },
  {
    id: "order-2",
    userId: "user-1",
    items: [
      {
        id: "rose-noir-1",
        name: "Rose Noir",
        price: 130,
        size: "Standard",
        volume: "50ml",
        image: "/placeholder.svg",
        category: "women",
        quantity: 2,
      },
    ],
    total: 280.8,
    status: "shipped",
            createdAt: "2025-01-20T14:15:00Z",
    shippingAddress: {
      name: "John Doe",
      address: "123 Main St",
      city: "New York",
      zipCode: "10001",
      country: "USA",
    },
  },
]

function orderReducer(state: OrderState, action: OrderAction): OrderState {
  switch (action.type) {
    case "ADD_ORDER":
      return {
        orders: [...state.orders, action.payload],
      }
    case "UPDATE_ORDER_STATUS":
      return {
        orders: state.orders.map((order) =>
          order.id === action.payload.orderId ? { ...order, status: action.payload.status } : order,
        ),
      }
    case "LOAD_ORDERS":
      return {
        orders: action.payload,
      }
    default:
      return state
  }
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(orderReducer, {
    orders: mockOrders,
  })

  const createOrder = (
    userId: string,
    items: OrderItem[],
    total: number,
    shippingAddress: Order["shippingAddress"],
  ): string => {
    const orderId = `order-${Date.now()}`
    const newOrder: Order = {
      id: orderId,
      userId,
      items,
      total,
      status: "pending",
      createdAt: new Date().toISOString(),
      shippingAddress,
    }

    dispatch({ type: "ADD_ORDER", payload: newOrder })
    return orderId
  }

  const getUserOrders = (userId: string): Order[] => {
    return state.orders.filter((order) => order.userId === userId)
  }

  const getAllOrders = (): Order[] => {
    return state.orders
  }

  const updateOrderStatus = (orderId: string, status: Order["status"]) => {
    dispatch({ type: "UPDATE_ORDER_STATUS", payload: { orderId, status } })
  }

  return (
    <OrderContext.Provider
      value={{
        state,
        dispatch,
        createOrder,
        getUserOrders,
        getAllOrders,
        updateOrderStatus,
      }}
    >
      {children}
    </OrderContext.Provider>
  )
}

export function useOrders() {
  const context = useContext(OrderContext)
  if (!context) {
    throw new Error("useOrders must be used within an OrderProvider")
  }
  return context
}
