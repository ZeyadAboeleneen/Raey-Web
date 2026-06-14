"use client"

import { useCallback, useState } from "react"

/**
 * Pagination state backed by the `?page=` query string so the current page
 * survives a refresh and is restored when the user opens a product and presses
 * Back. Drop-in replacement for `const [page, setPage] = useState(1)`.
 *
 * Uses the History API directly (no `useSearchParams`) so it doesn't require a
 * Suspense boundary and doesn't trigger a Next.js navigation/refetch — it only
 * rewrites the URL bar. Page 1 omits the param to keep URLs clean.
 */
export function usePageParam(): [number, (page: number) => void] {
  const [page, setPageState] = useState<number>(() => {
    if (typeof window === "undefined") return 1
    const raw = parseInt(new URLSearchParams(window.location.search).get("page") || "1", 10)
    return isNaN(raw) || raw < 1 ? 1 : raw
  })

  const setPage = useCallback((next: number) => {
    const safe = Number.isFinite(next) && next > 1 ? Math.floor(next) : 1
    setPageState(safe)

    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (safe <= 1) params.delete("page")
    else params.set("page", String(safe))

    const qs = params.toString()
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(window.history.state, "", newUrl)
  }, [])

  return [page, setPage]
}
