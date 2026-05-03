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
  rentalPriceA?: number
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
      // Always load from localStorage first as a baseline
      let localItems: FavoriteItem[] = []
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("sense_favorites")
        if (saved) {
          try {
            localItems = JSON.parse(saved)
            console.log('[Favorites] Loaded baseline from localStorage:', localItems)
          } catch (e) {
            console.error('[Favorites] localStorage parse error:', e)
          }
        }
      }

      if (authState.isAuthenticated && authState.token) {
        console.log('[Favorites] Authenticated, syncing with backend')
        try {
          const res = await fetch("/api/favorites", {
            headers: { Authorization: `Bearer ${authState.token}` },
          })
          if (res.ok) {
            const backendItems = await res.json()
            console.log('[Favorites] Loaded from backend:', backendItems)
            
            // Merge local and backend items, prioritizing backend items
            const mergedItems = [...backendItems]
            localItems.forEach(localItem => {
              if (!mergedItems.find(item => item.id === localItem.id)) {
                mergedItems.push(localItem)
              }
            })
            
            dispatch({ type: "LOAD_FAVORITES", payload: mergedItems })
          } else {
            console.log('[Favorites] Backend returned error:', res.status)
            dispatch({ type: "LOAD_FAVORITES", payload: localItems })
          }
        } catch (e) {
          console.error('[Favorites] Backend fetch error:', e)
          dispatch({ type: "LOAD_FAVORITES", payload: localItems })
        }
      } else {
        // Guest mode: use localStorage items
        dispatch({ type: "LOAD_FAVORITES", payload: localItems })
      }
      setHydrated(true)
      setLoading(false)
    }
    loadFavorites()
  }, [authState.isAuthenticated, authState.token, authState.user?.id])

  // Persist to localStorage whenever state changes
  useEffect(() => {
    if (hydrated && typeof window !== "undefined") {
      localStorage.setItem("sense_favorites", JSON.stringify(state.items))
    }
  }, [state.items, hydrated])

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
      ...(item.sizes && { sizes: item.sizes }),
      ...(item.rentalPriceA !== undefined && { rentalPriceA: item.rentalPriceA })
    };

    // Optimistic update
    dispatch({ type: "ADD_FAVORITE", payload: favoriteItem })

    if (authState.isAuthenticated && authState.token) {
      console.log('[Favorites] Syncing to backend:', favoriteItem.id)
      try {
        const response = await fetch("/api/favorites", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authState.token}`,
          },
          body: JSON.stringify({ productId: item.id }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Failed to sync favorite" }))
          console.error('[Favorites] Failed to sync to backend:', errorData.error)
          if (response.status === 401) {
            console.log('[Favorites] Token expired, keeping in local state only')
          }
        }
      } catch (error) {
        console.error('[Favorites] Error syncing to backend:', error)
      }
    }
  }

  const removeFromFavorites = async (id: string) => {
    // Optimistic update
    dispatch({ type: "REMOVE_FAVORITE", payload: id })

    if (authState.isAuthenticated && authState.token) {
      console.log('[Favorites] Syncing removal to backend:', id)
      try {
        const response = await fetch(`/api/favorites?productId=${id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authState.token}`,
          },
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Failed to sync removal" }))
          console.error('[Favorites] Failed to sync removal to backend:', errorData.error)
        }
      } catch (error) {
        console.error('[Favorites] Error syncing removal to backend:', error)
      }
    }
  }

  const isFavorite = (id: string) => state.items.some((item) => item.id === id)

  const clearFavorites = async () => {
    dispatch({ type: "CLEAR_FAVORITES" })
    if (authState.isAuthenticated && authState.token) {
      // Remove all favorites for user (optional: implement a backend endpoint for this)
      // For now, remove one by one
      for (const item of state.items) {
        await fetch(`/api/favorites?productId=${item.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authState.token}`,
          },
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
