"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useDateContext } from "@/lib/date-context"
import { DateSelectionModal } from "./date-selection-modal"

export function GlobalDateModal() {
  const pathname = usePathname()
  const { hasMadeSelection } = useDateContext()
  const [showModal, setShowModal] = useState(false)

  // Only trigger on collections or product pages
  const isRelevantRoute = pathname ? (
    pathname.startsWith("/wedding") || 
    pathname.startsWith("/soiree") || 
    pathname.startsWith("/products")
  ) : false;

  useEffect(() => {
    if (isRelevantRoute && !hasMadeSelection) {
      setShowModal(true)
    } else {
      setShowModal(false)
    }
  }, [pathname, isRelevantRoute, hasMadeSelection])

  if (!isRelevantRoute || hasMadeSelection) return null

  return (
    <DateSelectionModal 
      isOpen={showModal} 
      cancellable={false} // Force selection
    />
  )
}
