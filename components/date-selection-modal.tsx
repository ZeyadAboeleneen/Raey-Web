"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { useDateContext } from "@/lib/date-context"
import { Calendar as CalendarIcon, X, CalendarDays, ShoppingBag, ChevronRight } from "lucide-react"
import { useLocale } from "@/lib/locale-context"
import { useTranslation } from "@/lib/translations"

interface DateSelectionModalProps {
  isOpen: boolean
  onClose?: () => void
  onConfirm?: () => void
  onBrowseOnly?: () => void
  cancellable?: boolean
}

export function DateSelectionModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  onBrowseOnly,
  cancellable = false 
}: DateSelectionModalProps) {
  const { setOccasionDate, setIsBrowsingOnly, setMode, occasionDate } = useDateContext()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)
  const [localDate, setLocalDate] = useState<Date | undefined>(occasionDate || undefined)
  // Step 1: choose rent vs buy. Step 2 (rent only): pick the occasion date.
  const [step, setStep] = useState<"mode" | "date">("mode")

  // Always start at the mode choice each time the modal opens.
  useEffect(() => {
    if (isOpen) setStep("mode")
  }, [isOpen])

  const handleChooseBuy = () => {
    setMode("buy")
    setOccasionDate(null)
    setIsBrowsingOnly(false)
    if (onConfirm) onConfirm()
    if (onClose) onClose()
  }

  const handleChooseRent = () => {
    setMode("rent")
    setStep("date")
  }

  const handleConfirm = () => {
    if (localDate) {
      setMode("rent")
      setOccasionDate(localDate)
      setIsBrowsingOnly(false)
      if (onConfirm) onConfirm()
      if (onClose) onClose()
    }
  }

  const handleBrowseOnly = () => {
    setMode("rent")
    setOccasionDate(null)
    setIsBrowsingOnly(true)
    if (onBrowseOnly) onBrowseOnly()
    if (onClose) onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancellable ? onClose : undefined}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-[310px] sm:max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.03]"
          >
            {cancellable && (
              <button
                onClick={onClose}
                className="absolute right-4 top-4 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors z-10"
              >
                <X className="h-5 w-5" />
              </button>
            )}

            <div className="px-6 py-6 sm:p-10 bg-white">
              {step === "mode" ? (
                <>
                  <div className="flex flex-col items-center mb-6 sm:mb-8">
                    <h2
                      className="text-center text-[18px] sm:text-[26px] font-light tracking-tight text-gray-900 mb-2"
                      style={{ fontFamily: 'var(--font-playfair-display), "Playfair Display", serif' }}
                    >
                      How would you like to shop?
                    </h2>
                    <div className="h-px w-10 bg-rose-300 mb-2 sm:mb-3" />
                    <p className="text-center text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-gray-400 font-medium">
                      Rent for the moment · Buy to keep
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:gap-4">
                    <button
                      type="button"
                      onClick={handleChooseRent}
                      className="group flex items-center gap-4 w-full rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 text-left transition-all duration-300 hover:border-rose-300 hover:shadow-[0_12px_30px_rgba(0,0,0,0.07)] hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500 transition-colors duration-300 group-hover:bg-rose-500 group-hover:text-white">
                        <CalendarDays className="h-5 w-5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] sm:text-sm font-semibold uppercase tracking-[0.16em] text-gray-900">
                          Rent a Dress
                        </span>
                        <span className="block text-[11px] sm:text-xs text-gray-400 mt-1 normal-case tracking-normal">
                          Wear it for your special occasion
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-rose-400" />
                    </button>

                    <button
                      type="button"
                      onClick={handleChooseBuy}
                      className="group flex items-center gap-4 w-full rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 text-left transition-all duration-300 hover:border-gray-900 hover:shadow-[0_12px_30px_rgba(0,0,0,0.07)] hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors duration-300 group-hover:bg-gray-900 group-hover:text-white">
                        <ShoppingBag className="h-5 w-5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] sm:text-sm font-semibold uppercase tracking-[0.16em] text-gray-900">
                          Buy a Dress
                        </span>
                        <span className="block text-[11px] sm:text-xs text-gray-400 mt-1 normal-case tracking-normal">
                          Make it yours to keep forever
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-gray-700" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center mb-4 sm:mb-8">
                    <h2 className="text-center text-[16px] sm:text-2xl font-semibold tracking-[0.15em] text-gray-900 uppercase mb-1">
                      Event Date
                    </h2>
                    <div className="h-0.5 w-8 bg-rose-200 mb-2 sm:mb-4" />
                    <p className="text-center text-[10px] sm:text-xs uppercase tracking-[0.1em] text-gray-400 font-medium">
                      Select your occasion date
                    </p>
                  </div>

                  <div className="flex justify-center mb-4 sm:mb-8 scale-[0.85] sm:scale-105 origin-top transition-transform">
                    <div className="rounded-2xl border border-gray-100 p-2 sm:p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white">
                      <Calendar
                        mode="single"
                        selected={localDate}
                        onSelect={setLocalDate}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        className="bg-white rounded-xl p-0 sm:p-2"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 items-center">
                    <Button
                      className="w-full h-10 sm:h-13 text-[11px] sm:text-sm font-bold tracking-[0.2em] bg-black hover:bg-gray-800 text-white rounded-full shadow-xl transition-all duration-300 uppercase"
                      onClick={handleConfirm}
                      disabled={!localDate}
                    >
                      Confirm Date
                    </Button>

                    <button
                      onClick={handleBrowseOnly}
                      className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.15em] text-gray-400 hover:text-gray-900 transition-colors underline underline-offset-4 decoration-gray-200"
                    >
                      I&apos;m just browsing
                    </button>

                    <button
                      onClick={() => setStep("mode")}
                      className="text-[10px] sm:text-xs font-medium uppercase tracking-[0.15em] text-gray-300 hover:text-gray-600 transition-colors"
                    >
                      ← Back
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
