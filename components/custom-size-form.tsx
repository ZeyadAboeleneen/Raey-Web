"use client"

import Image from "next/image"
import { motion } from "framer-motion"
import { Input } from "@/components/ui/input"
import { measurementLabels, MeasurementFields, MeasurementUnit, useCustomSize } from "@/hooks/use-custom-size"

export interface SizeChartRow {
  label: string
  shoulderIn: string
  waistIn: string
  bustIn: string
  hipsIn: string
  sleeveIn: string
  shoulderCm: string
  waistCm: string
  bustCm: string
  hipsCm: string
  sleeveCm: string
}

export interface ProductSizeLite {
  size?: string
  volume?: string
  originalPrice?: number
  discountedPrice?: number
  stockCount?: number
}

export interface CustomSizeController {
  isCustomSizeMode: boolean
  setIsCustomSizeMode: (value: boolean) => void
  measurementUnit: MeasurementUnit
  setMeasurementUnit: (value: MeasurementUnit) => void
  measurements: Record<MeasurementFields, string>
  onMeasurementChange: (field: MeasurementFields, value: string) => void
  confirmMeasurements: boolean
  setConfirmMeasurements: (value: boolean) => void
  isMeasurementsValid: boolean
}

interface CustomSizeFormProps {
  controller: CustomSizeController
  sizeChart: SizeChartRow[]
  sizes?: ProductSizeLite[]
  selectedSize?: ProductSizeLite | null
  onSelectSize?: (size: ProductSizeLite) => void
  formatPrice?: (price: number) => string
}

export const CustomSizeForm = ({
  controller,
}: CustomSizeFormProps) => {
  const {
    measurementUnit,
    setMeasurementUnit,
    measurements,
    onMeasurementChange,
  } = controller

  return (
    <div className="space-y-5 overflow-x-hidden">
      <div className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500 mb-2">Units</p>
          <div className="flex gap-2">
            {["cm", "inch"].map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => setMeasurementUnit(unit as MeasurementUnit)}
                className={`flex-1 rounded-2xl border px-4 py-2 text-sm ${
                  measurementUnit === unit
                    ? "border-black bg-black text-white"
                    : "border-gray-200 hover:border-gray-400"
                }`}
              >
                {unit.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(measurementLabels) as MeasurementFields[]).map((field) => (
            <div key={field} className="space-y-1">
              <label className="text-xs uppercase tracking-[0.3em] text-gray-500">{measurementLabels[field]}</label>
              <Input
                value={measurements[field]}
                onChange={(e) => onMeasurementChange(field, e.target.value)}
                placeholder={measurementUnit === "cm" ? "cm" : "inch"}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-medium text-gray-500">Custom size guide</p>
          <div className="flex justify-center">
            <Image
              src="/size-guide.PNG"
              alt="Size guide"
              width={360}
              height={760}
              className="h-auto w-auto max-w-full rounded-lg border border-gray-200"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
