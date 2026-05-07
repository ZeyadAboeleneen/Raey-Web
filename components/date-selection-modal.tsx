"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { useDateContext } from "@/lib/date-context"
import { Calendar as CalendarIcon, X } from "lucide-react"
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
  const { setOccasionDate, setIsBrowsingOnly, occasionDate } = useDateContext()
  const { settings } = useLocale()
  const t = useTranslation(settings.language)
  const [localDate, setLocalDate] = useState<Date | undefined>(occasionDate || undefined)

  const handleConfirm = () => {
    if (localDate) {
      setOccasionDate(localDate)
      setIsBrowsingOnly(false)
      if (onConfirm) onConfirm()
      if (onClose) onClose()
    }
  }

  const handleBrowseOnly = () => {
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
                  I'm just browsing
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
