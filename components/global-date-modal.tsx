"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useDateContext } from "@/lib/date-context"
import { DateSelectionModal } from "./date-selection-modal"

import { useAuth } from "@/lib/auth-context"

export function GlobalDateModal() {
  const pathname = usePathname()
  const { hasMadeSelection } = useDateContext()
  const { state: authState } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [hasShownForStaff, setHasShownForStaff] = useState(false)

  const isStaff = authState.user?.role === "admin" || authState.user?.role === "manager" || authState.user?.role === "staff"

  // Only trigger on collections or product pages
  const isRelevantRoute = pathname ? (
    pathname.startsWith("/wedding") || 
    pathname.startsWith("/soiree") || 
    pathname.startsWith("/products") ||
    pathname.startsWith("/favorites")
  ) : false;

  useEffect(() => {
    if (isRelevantRoute && (!hasMadeSelection || (isStaff && !hasShownForStaff))) {
      setShowModal(true)
    } else {
      setShowModal(false)
    }
  }, [pathname, isRelevantRoute, hasMadeSelection, isStaff, hasShownForStaff])

  if (!isRelevantRoute) return null
  if (hasMadeSelection && !showModal) return null

  return (
    <DateSelectionModal 
      isOpen={showModal} 
      cancellable={isStaff} // Staff can cancel if they just want to use the existing date
      onClose={isStaff ? () => {
        setShowModal(false)
        setHasShownForStaff(true)
      } : undefined}
      onConfirm={() => {
        setShowModal(false)
        setHasShownForStaff(true)
      }}
      onBrowseOnly={() => {
        setShowModal(false)
        setHasShownForStaff(true)
      }}
    />
  )
}
