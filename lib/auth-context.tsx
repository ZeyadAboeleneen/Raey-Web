"use client"

import { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from "react"

export interface EmployeePermissions {
  canAddProducts: boolean
  canEditProducts: boolean
  canDeleteProducts: boolean
  canViewProducts: boolean
  canViewOrders: boolean
  canUpdateOrders: boolean
  canDeleteOrders: boolean
  canViewPricesInDashboard: boolean
  canViewPricesOnWebsite: boolean
  canManageDiscountCodes: boolean
  canManageOffers: boolean
}

interface User {
  id: string
  email: string
  name: string
  role: string
  isEmployee?: boolean
  permissions?: EmployeePermissions
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
}

type AuthAction =
  | { type: "LOGIN_START" }
  | { type: "LOGIN_SUCCESS"; payload: { user: User; token: string } }
  | { type: "LOGIN_FAILURE" }
  | { type: "LOGOUT" }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "UPDATE_USER"; payload: User }
  | { type: "SET_PERMISSIONS"; payload: EmployeePermissions }

interface AuthContextType {
  state: AuthState
  dispatch: React.Dispatch<AuthAction>
  login: (email: string, password: string, type?: "employee" | "customer") => Promise<boolean>
  logout: () => void
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>
  forgotPassword: (email: string) => Promise<boolean>
  updateUser: (user: User) => void
  checkPermission: (key: keyof EmployeePermissions) => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOGIN_START":
      return { ...state, isLoading: true }
    case "LOGIN_SUCCESS":
      return {
        user: action.payload.user,
        token: action.payload.token,
        isLoading: false,
        isAuthenticated: true,
      }
    case "LOGIN_FAILURE":
      return {
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      }
    case "LOGOUT":
      return {
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      }
    case "SET_LOADING":
      return { ...state, isLoading: action.payload }
    case "UPDATE_USER":
      return {
        ...state,
        user: action.payload,
      }
    case "SET_PERMISSIONS":
      if (!state.user) return state
      return {
        ...state,
        user: {
          ...state.user,
          permissions: action.payload
        }
      }
    default:
      return state
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  })

  const fetchEmployeePermissions = async (token: string) => {
    try {
      const res = await fetch("/api/auth/employee/me", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        // API returns permissions directly at the top level (NOT nested under 'employee')
        if (data.permissions) {
          dispatch({ type: "SET_PERMISSIONS", payload: data.permissions })
        }
      }
    } catch (err) {
      console.error("Failed to fetch employee permissions", err)
    }
  }

  const verifyToken = async (token: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/verify", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        return false
      }
      
      const data = await response.json()
      return data.valid === true
    } catch (error) {
      console.error("Token verification failed:", error)
      return false
    }
  }

  const refreshToken = async (oldToken: string): Promise<{ user: User; token: string } | null> => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${oldToken}`,
        },
      })

      if (response.ok) {
        return await response.json()
      }
      return null
    } catch (error) {
      console.error("Token refresh failed:", error)
      return null
    }
  }

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const authData = localStorage.getItem("sense_auth")
        
        if (!authData) {
          dispatch({ type: "SET_LOADING", payload: false })
          return
        }

        let parsedData
        try {
          parsedData = JSON.parse(authData)
        } catch (parseError) {
          localStorage.removeItem("sense_auth")
          dispatch({ type: "SET_LOADING", payload: false })
          return
        }

        const { user, token, expiresAt } = parsedData
        
        if (!user || !token || !expiresAt) {
          localStorage.removeItem("sense_auth")
          dispatch({ type: "SET_LOADING", payload: false })
          return
        }
        
        if (Date.now() > (expiresAt - 5 * 60 * 1000)) {
          const refreshed = await refreshToken(token)
          if (refreshed) {
            const newAuthData = {
              user: refreshed.user,
              token: refreshed.token,
              expiresAt: Date.now() + 3600 * 1000,
            }
            localStorage.setItem("sense_auth", JSON.stringify(newAuthData))
            dispatch({ type: "LOGIN_SUCCESS", payload: refreshed })
            if (refreshed.user.isEmployee) {
              await fetchEmployeePermissions(refreshed.token)
            }
            dispatch({ type: "SET_LOADING", payload: false })
            return
          }
        }

        const isValid = await verifyToken(token)
        if (isValid) {
          dispatch({ type: "LOGIN_SUCCESS", payload: { user, token } })
          if (user.isEmployee) {
            await fetchEmployeePermissions(token)
          }
        } else {
          const refreshed = await refreshToken(token)
          if (refreshed) {
            const newAuthData = {
              user: refreshed.user,
              token: refreshed.token,
              expiresAt: Date.now() + 3600 * 1000,
            }
            localStorage.setItem("sense_auth", JSON.stringify(newAuthData))
            dispatch({ type: "LOGIN_SUCCESS", payload: refreshed })
            if (refreshed.user.isEmployee) {
              await fetchEmployeePermissions(refreshed.token)
            }
          } else {
            throw new Error("Invalid token")
          }
        }
      } catch (error) {
        console.error("Auth initialization error:", error)
        localStorage.removeItem("sense_auth")
        dispatch({ type: "LOGOUT" })
      } finally {
        dispatch({ type: "SET_LOADING", payload: false })
      }
    }

    initializeAuth()
  }, [])

  const login = async (email: string, password: string, type?: "employee" | "customer"): Promise<boolean> => {
    dispatch({ type: "LOGIN_START" })

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, type }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const data = await response.json()
      const authData = {
        user: data.user,
        token: data.token,
        expiresAt: Date.now() + 3600 * 1000,
      }

      localStorage.setItem("sense_auth", JSON.stringify(authData))
      dispatch({ type: "LOGIN_SUCCESS", payload: { user: data.user, token: data.token } })
      
      // Always fetch fresh permissions for any employee (isEmployee=true means they are in the employees table)
      if (data.user.isEmployee) {
        await fetchEmployeePermissions(data.token)
      }

      return true
    } catch (error) {
      console.error("Login error:", error)
      dispatch({ type: "LOGIN_FAILURE" })
      return false
    }
  }

  const register = async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string }> => {
    dispatch({ type: "LOGIN_START" })

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, name }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Registration failed" }))
        const errorMessage = errorData.error || "Registration failed"
        dispatch({ type: "LOGIN_FAILURE" })
        return { success: false, error: errorMessage }
      }

      const data = await response.json()
      const authData = {
        user: data.user,
        token: data.token,
        expiresAt: Date.now() + 3600 * 1000,
      }

      localStorage.setItem("sense_auth", JSON.stringify(authData))
      
      fetch("/api/send-welcome-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, name }),
      }).catch(error => console.error("Welcome email error:", error))

      dispatch({ type: "LOGIN_SUCCESS", payload: { user: data.user, token: data.token } })
      return { success: true }
    } catch (error) {
      console.error("Registration error:", error)
      dispatch({ type: "LOGIN_FAILURE" })
      return { success: false, error: "An unexpected error occurred" }
    }
  }

  const forgotPassword = async (email: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      })
      return response.ok
    } catch (error) {
      console.error("Password reset error:", error)
      return false
    }
  }

  const logout = () => {
    localStorage.removeItem("sense_auth")
    dispatch({ type: "LOGOUT" })
  }

  const checkPermission = useCallback((key: keyof EmployeePermissions) => {
    if (!state.user) return false
    // Admins bypass all permission checks (both admin users and admin employees)
    // But ONLY if they are explicitly role="admin" from the server — never assume
    if (state.user.role === "admin") return true
    // For employees with role="staff" or any other role, check the permissions object
    // If permissions haven't loaded yet, deny access (fail-safe)
    if (!state.user.permissions) return false
    return state.user.permissions[key] === true
  }, [state.user])

  return (
    <AuthContext.Provider
      value={{
        state,
        dispatch,
        login,
        logout,
        register,
        forgotPassword,
        updateUser: (user: User) => {
          try {
            const authDataRaw = localStorage.getItem("sense_auth")
            if (authDataRaw) {
              const parsed = JSON.parse(authDataRaw)
              const next = {
                ...parsed,
                user,
              }
              localStorage.setItem("sense_auth", JSON.stringify(next))
            }
          } catch (error) {
            console.error("Failed to update auth data in storage:", error)
          }
          dispatch({ type: "UPDATE_USER", payload: user })
        },
        checkPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export function usePermission(key: keyof EmployeePermissions): boolean {
  const context = useContext(AuthContext)
  if (!context) return false
  return context.checkPermission(key)
}
