"use client"

import type React from "react"
import { createContext, useContext, useReducer, useEffect, useState, type ReactNode } from "react"
import { useAuth } from "@/lib/auth-context"

export interface FavoriteItem {
  id: string
  name: string
  price: number
  image: string
  branch: string
  collection?: string
  rating?: number
  isNew?: boolean
  isBestseller?: boolean
  isOutOfStock?: boolean
  // Gift package fields
  isGiftPackage?: boolean
  packagePrice?: number
  packageOriginalPrice?: number
  giftPackageSizes?: any[]
  sizes?: Array<{
    size: string
    volume: string
    originalPrice?: number
    discountedPrice?: number
  }>
}

interface FavoritesState {
  items: FavoriteItem[]
  count: number
}

type FavoritesAction =
  | { type: "ADD_FAVORITE"; payload: FavoriteItem }
  | { type: "REMOVE_FAVORITE"; payload: string }
  | { type: "CLEAR_FAVORITES" }
  | { type: "LOAD_FAVORITES"; payload: FavoriteItem[] }

const FavoritesContext = createContext<{
  state: FavoritesState
  dispatch: React.Dispatch<FavoritesAction>
  addToFavorites: (item: FavoriteItem) => void
  removeFromFavorites: (id: string) => void
  isFavorite: (id: string) => boolean
  clearFavorites: () => void
  loading: boolean
} | null>(null)

function favoritesReducer(state: FavoritesState, action: FavoritesAction): FavoritesState {
  switch (action.type) {
    case "ADD_FAVORITE":
      if (state.items.find((item) => item.id === action.payload.id)) return state
      return { items: [...state.items, action.payload], count: state.items.length + 1 }
    case "REMOVE_FAVORITE":
      return { items: state.items.filter((item) => item.id !== action.payload), count: state.items.length - 1 }
    case "CLEAR_FAVORITES":
      return { items: [], count: 0 }
    case "LOAD_FAVORITES":
      return { items: action.payload, count: action.payload.length }
    default:
      return state
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { state: authState } = useAuth()
  const [state, dispatch] = useReducer(favoritesReducer, { items: [], count: 0 })
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(false)

  // Load favorites on mount or when auth changes
  useEffect(() => {
    async function loadFavorites() {
      setLoading(true)
      if (authState.isAuthenticated && authState.token) {
        console.log('[Favorites] Authenticated, loading from backend', authState.user, authState.token)
        try {
          const res = await fetch("/api/favorites", {
            headers: { Authorization: `Bearer ${authState.token}` },
          })
          if (res.ok) {
            const items = await res.json()
            console.log('[Favorites] Loaded from backend:', items)
            dispatch({ type: "LOAD_FAVORITES", payload: Array.isArray(items) ? items : [] })
          } else {
            console.log('[Favorites] Backend returned error:', res.status)
            dispatch({ type: "LOAD_FAVORITES", payload: [] })
          }
        } catch (e) {
          console.log('[Favorites] Backend fetch error:', e)
          dispatch({ type: "LOAD_FAVORITES", payload: [] })
        }
      } else {
        // Guest: load from localStorage
        if (typeof window !== "undefined") {
          const saved = localStorage.getItem("sense_favorites")
          if (saved) {
            try {
              const parsed = JSON.parse(saved)
              console.log('[Favorites] Loaded from localStorage:', parsed)
              dispatch({ type: "LOAD_FAVORITES", payload: parsed })
            } catch (e) {
              console.log('[Favorites] localStorage parse error:', e)
              dispatch({ type: "LOAD_FAVORITES", payload: [] })
            }
          } else {
            console.log('[Favorites] No localStorage favorites found')
            dispatch({ type: "LOAD_FAVORITES", payload: [] })
          }
        }
      }
      setHydrated(true)
      setLoading(false)
    }
    loadFavorites()
  }, [authState.isAuthenticated, authState.token, authState.user?.id])

  // Save to localStorage for guests
  useEffect(() => {
    if (!authState.isAuthenticated && hydrated && typeof window !== "undefined") {
      localStorage.setItem("sense_favorites", JSON.stringify(state.items))
    }
  }, [state.items, hydrated, authState.isAuthenticated])

  if (!hydrated) return null

  const addToFavorites = async (item: FavoriteItem) => {
    // Create a clean item without undefined properties
    const favoriteItem = {
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
      branch: item.branch,
      rating: item.rating, // Always include rating, even if it's 0
      ...(item.isNew !== undefined && { isNew: item.isNew }),
      ...(item.isBestseller !== undefined && { isBestseller: item.isBestseller }),
      ...(item.isGiftPackage !== undefined && { isGiftPackage: item.isGiftPackage }),
      ...(item.packagePrice !== undefined && { packagePrice: item.packagePrice }),
      ...(item.packageOriginalPrice !== undefined && { packageOriginalPrice: item.packageOriginalPrice }),
      ...(item.giftPackageSizes && { giftPackageSizes: item.giftPackageSizes }),
      ...(item.sizes && { sizes: item.sizes })
    };

    if (authState.isAuthenticated && authState.token) {
      console.log('[Favorites] Adding to backend:', favoriteItem)
      try {
        const response = await fetch("/api/favorites", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authState.token}`,
          },
          body: JSON.stringify({ productId: item.id }),
        })

        if (response.ok) {
          // Only update local state if API call succeeds
          dispatch({ type: "ADD_FAVORITE", payload: favoriteItem })
          console.log('[Favorites] Successfully added to backend')
        } else {
          const errorData = await response.json().catch(() => ({ error: "Failed to add favorite" }))
          console.error('[Favorites] Failed to add to backend:', errorData.error)
          // You could show a toast/notification here
        }
      } catch (error) {
        console.error('[Favorites] Error adding to backend:', error)
        // You could show a toast/notification here
      }
    } else {
      // Guest: update local state immediately
      console.log('[Favorites] Adding to localStorage:', favoriteItem)
      dispatch({ type: "ADD_FAVORITE", payload: favoriteItem })
    }
  }

  const removeFromFavorites = async (id: string) => {
    if (authState.isAuthenticated && authState.token) {
      console.log('[Favorites] Removing from backend:', id)
      try {
        const response = await fetch("/api/favorites", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authState.token}`,
          },
          body: JSON.stringify({ productId: id }),
        })

        if (response.ok) {
          // Only update local state if API call succeeds
          dispatch({ type: "REMOVE_FAVORITE", payload: id })
          console.log('[Favorites] Successfully removed from backend')
        } else {
          const errorData = await response.json().catch(() => ({ error: "Failed to remove favorite" }))
          console.error('[Favorites] Failed to remove from backend:', errorData.error)
        }
      } catch (error) {
        console.error('[Favorites] Error removing from backend:', error)
      }
    } else {
      // Guest: update local state immediately
      console.log('[Favorites] Removing from localStorage:', id)
      dispatch({ type: "REMOVE_FAVORITE", payload: id })
    }
  }

  const isFavorite = (id: string) => state.items.some((item) => item.id === id)

  const clearFavorites = async () => {
    dispatch({ type: "CLEAR_FAVORITES" })
    if (authState.isAuthenticated && authState.token) {
      // Remove all favorites for user (optional: implement a backend endpoint for this)
      // For now, remove one by one
      for (const item of state.items) {
        await fetch("/api/favorites", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authState.token}`,
          },
          body: JSON.stringify({ productId: item.id }),
        })
      }
    }
  }

  return (
    <FavoritesContext.Provider
      value={{ state, dispatch, addToFavorites, removeFromFavorites, isFavorite, clearFavorites, loading }}
    >
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const context = useContext(FavoritesContext)
  if (!context) throw new Error("useFavorites must be used within a FavoritesProvider")
  return context
}
