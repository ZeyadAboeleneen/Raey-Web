"use client"

import { useCallback, useMemo, useState } from "react"

export type MeasurementUnit = "cm" | "inch"

export type MeasurementFields = "shoulder" | "breast" | "waist" | "hips" | "sleeve" | "length"

export type MeasurementValues = Record<MeasurementFields, string>

const initialMeasurements: MeasurementValues = {
  shoulder: "",
  breast: "",
  waist: "",
  hips: "",
  sleeve: "",
  length: "",
}

export const measurementLabels: Record<MeasurementFields, string> = {
  shoulder: "Shoulder",
  breast: "Breast",
  waist: "Waist",
  hips: "Hips",
  sleeve: "Sleeve",
  length: "Dress Length",
}

export const useCustomSize = () => {
  const [isCustomSizeMode, setIsCustomSizeMode] = useState(true)
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>("cm")
  const [measurements, setMeasurements] = useState<MeasurementValues>(initialMeasurements)
  const [confirmMeasurements, setConfirmMeasurements] = useState(false)

  const resetMeasurements = useCallback(() => {
    setMeasurements(initialMeasurements)
    setConfirmMeasurements(false)
    setMeasurementUnit("cm")
  }, [])

  const handleMeasurementChange = useCallback((field: MeasurementFields, value: string) => {
    setMeasurements(prev => ({ ...prev, [field]: value }))
  }, [])

  const isMeasurementsValid = useMemo(() => {
    const requiredFields: MeasurementFields[] = ["breast", "waist", "hips"]
    return requiredFields.every(field => measurements[field]?.toString().trim().length > 0)
  }, [measurements])

  return {
    isCustomSizeMode,
    setIsCustomSizeMode,
    measurementUnit,
    setMeasurementUnit,
    measurements,
    handleMeasurementChange,
    confirmMeasurements,
    setConfirmMeasurements,
    resetMeasurements,
    isMeasurementsValid,
  }
}

