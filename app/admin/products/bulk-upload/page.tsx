"use client"

import React, { useState, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  ImageIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  ArrowRight,
  Package,
  Eye,
  Loader2,
  Ban,
} from "lucide-react"
import * as XLSX from "xlsx"
import { useAuth, usePermission } from "@/lib/auth-context"
import { toast } from "sonner"
import {
  extractAndUploadZip,
  getZipImageList,
  safeFetch,
  type UploadResult,
  type UploadProgress,
} from "@/lib/cloudinary-client"

// Types matching the API response
interface ValidationError {
  row: number
  field: string
  message: string
}

interface PreviewProduct {
  rowIndex: number
  name: string
  price: number
  collection: string
  branch?: string
  description?: string
  status: "create" | "update"
  matchedImages: string[]
  errors: ValidationError[]
}

interface PreviewSummary {
  totalRows: number
  toCreate: number
  toUpdate: number
  withErrors: number
  totalImages: number
  linkedImages: number
  unmatchedImages: string[]
}

interface UploadReport {
  mode?: string
  created?: number
  updated?: number
  linkedImages?: number
  unmatchedImages?: string[]
  errors: { row?: number; file?: string; reason: string }[]

  // Image-only fields
  total?: number
  matched?: number
  failed?: number
  details?: { file: string; matchedTo: string; imageUrl: string }[]
}

type Step = "upload" | "preview" | "processing" | "report"

export default function BulkUploadPage() {
  const router = useRouter()
  const { state: authState } = useAuth()
  const canAddProducts = usePermission("canAddProducts")
  const canEditProducts = usePermission("canEditProducts")
  const [step, setStep] = useState<Step>("upload")
  const [dataFile, setDataFile] = useState<File | null>(null)
  const [imagesFile, setImagesFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState("")
  const [previewData, setPreviewData] = useState<{
    summary: PreviewSummary
    products: PreviewProduct[]
    allErrors: ValidationError[]
  } | null>(null)
  const [report, setReport] = useState<UploadReport | null>(null)
  const [error, setError] = useState("")
  const [uploadStats, setUploadStats] = useState<UploadProgress | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const dataInputRef = useRef<HTMLInputElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authState.isLoading && (!authState.isAuthenticated || (!canAddProducts && !canEditProducts))) {
      router.push("/admin/dashboard")
    }
  }, [authState, router, canAddProducts, canEditProducts])

  const getAuthToken = () => {
    return authState.token || localStorage.getItem("token") || ""
  }

  // ==========================
  // Download Template
  // ==========================
  const downloadTemplate = () => {
    const templateData = [
      {
        name: "Sample Product",
        price: 1500,
        collection: "summer-collection",
        images: "sample-product-1.jpg,sample-product-2.jpg",
        branch: "womens-wear",
        description: "Product description here",
      },
    ]
    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Products")

    // Set column widths
    ws["!cols"] = [
      { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 15 },
      { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 35 }, { wch: 8 },
    ]

    XLSX.writeFile(wb, "bulk_upload_template.xlsx")
    toast.success("Template downloaded!")
  }

  // ==========================
  // File Drop Handlers
  // ==========================
  const handleDataDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".csv") || file.name.endsWith(".xls"))) {
      setDataFile(file)
      setError("")
    } else {
      toast.error("Please upload an Excel (.xlsx) or CSV (.csv) file")
    }
  }, [])

  const handleImagesDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith(".zip")) {
      setImagesFile(file)
      setError("")
    } else {
      toast.error("Please upload a ZIP file containing images")
    }
  }, [])

  const preventDefault = (e: React.DragEvent) => e.preventDefault()

  // ==========================
  // Cancel Upload
  // ==========================
  const handleCancel = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setStep("upload")
    setProgress(0)
    setProgressMessage("")
    setUploadStats(null)
    toast.info("Upload cancelled")
  }

  // ==========================
  // Preview (Step 1 → 2) — CLIENT-SIDE parsing, no server round-trip
  // ==========================
  const handlePreview = async () => {
    if (!dataFile) {
      toast.error("Please select an Excel/CSV file")
      return
    }

    setLoading(true)
    setError("")
    setProgress(20)
    setProgressMessage("Parsing data file locally...")

    try {
      // ── Parse Excel client-side ──
      const buffer = await dataFile.arrayBuffer()
      const wb = XLSX.read(buffer, { type: "array" })
      const wsName = wb.SheetNames[0]
      if (!wsName) throw new Error("No sheets found in the file")
      const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { defval: "" }) as Record<string, any>[]
      if (rawRows.length === 0) throw new Error("No data rows found")

      setProgress(40)
      setProgressMessage("Scanning ZIP images...")

      // ── Get ZIP image list (names only, no extraction) ──
      let zipImages: { name: string; size: number }[] = []
      if (imagesFile) {
        zipImages = await getZipImageList(imagesFile)
      }
      const zipNameSet = new Set(zipImages.map((i) => i.name))

      setProgress(60)
      setProgressMessage("Matching products...")

      // ── Send parsed data + image list to server for MSSQL matching ──
      const { data: result, error: fetchErr } = await safeFetch<any>("/api/products/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          mode: "preview",
          rows: rawRows,
          zipImageNames: Array.from(zipNameSet),
        }),
      })

      if (fetchErr || !result) {
        setError(fetchErr || "Failed to process files")
        toast.error(fetchErr || "Preview failed")
        return
      }

      setProgress(100)
      setPreviewData({
        summary: result.summary,
        products: result.products,
        allErrors: result.allErrors,
      })
      setStep("preview")
      toast.success(`Preview ready: ${result.summary.totalRows} products found`)
    } catch (err: any) {
      setError(err.message || "An error occurred")
      toast.error(err.message || "An error occurred")
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  // ==========================
  // Confirm Upload (Step 2 → 3 → 4)
  // Client uploads images to Cloudinary, then sends metadata to API
  // ==========================
  const handleConfirm = async () => {
    if (!dataFile) return

    const controller = new AbortController()
    abortControllerRef.current = controller

    setStep("processing")
    setProgress(5)
    setProgressMessage("Preparing...")
    setUploadStats(null)

    try {
      // ── Phase 1: Upload images to Cloudinary if ZIP provided ──
      let uploadResults: UploadResult[] = []
      if (imagesFile) {
        setProgressMessage("Uploading images to Cloudinary...")
        uploadResults = await extractAndUploadZip(imagesFile, {
          authToken: getAuthToken(),
          folder: "products",
          concurrency: 5,
          signal: controller.signal,
          onProgress: (p) => {
            setUploadStats(p)
            // Images are 80% of the work
            setProgress(Math.round((p.percentage * 0.8)))
            setProgressMessage(`Uploading ${p.currentFile} (${p.completed}/${p.total})...`)
          },
        })

        if (controller.signal.aborted) return

        const failed = uploadResults.filter((r) => !r.success)
        if (failed.length > 0) {
          console.warn(`⚠️ ${failed.length} images failed to upload`)
        }
      }

      // ── Phase 2: Parse Excel and send to server ──
      setProgress(85)
      setProgressMessage("Saving products to database...")

      const buffer = await dataFile.arrayBuffer()
      const wb = XLSX.read(buffer, { type: "array" })
      const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as Record<string, any>[]

      // Build a map of filename → Cloudinary URL
      const imageUrlMap: Record<string, string> = {}
      for (const r of uploadResults) {
        if (r.success && r.url) imageUrlMap[r.filename.toLowerCase()] = r.url
      }

      const { data: result, error: fetchErr } = await safeFetch<any>("/api/products/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          mode: "confirm",
          rows: rawRows,
          imageUrlMap,
        }),
        signal: controller.signal,
      })

      if (fetchErr || !result) {
        setError(fetchErr || "Upload failed")
        toast.error(fetchErr || "Upload failed")
        setStep("preview")
        return
      }

      setProgress(100)
      setReport(result.report)
      setStep("report")
      toast.success(result.message || "Upload complete!")
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setError(err.message || "Upload failed")
        toast.error(err.message || "Upload failed")
        setStep("preview")
      }
    } finally {
      abortControllerRef.current = null
    }
  }

  // ==========================
  // Image-Only Upload — Direct to Cloudinary, then metadata to API
  // ==========================
  const handleImageOnlyUpload = async () => {
    if (!imagesFile) return

    const controller = new AbortController()
    abortControllerRef.current = controller

    setStep("processing")
    setProgress(5)
    setProgressMessage("Extracting ZIP and uploading to Cloudinary...")
    setUploadStats(null)

    try {
      // ── Phase 1: Upload all images to Cloudinary ──
      const uploadResults = await extractAndUploadZip(imagesFile, {
        authToken: getAuthToken(),
        folder: "products",
        concurrency: 5,
        signal: controller.signal,
        onProgress: (p) => {
          setUploadStats(p)
          setProgress(Math.round(p.percentage * 0.8))
          setProgressMessage(`Uploading ${p.currentFile} (${p.completed}/${p.total})...`)
        },
      })

      if (controller.signal.aborted) return

      // ── Phase 2: Send URLs to server for auto-matching ──
      setProgress(85)
      setProgressMessage("Matching images to products...")

      const images = uploadResults
        .filter((r) => r.success)
        .map((r) => ({ filename: r.filename, url: r.url, publicId: r.publicId }))

      const { data: result, error: fetchErr } = await safeFetch<any>("/api/products/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ mode: "image-only", images }),
        signal: controller.signal,
      })

      if (fetchErr || !result) {
        setError(fetchErr || "Image matching failed")
        toast.error(fetchErr || "Image matching failed")
        setStep("upload")
        return
      }

      setProgress(100)
      // Merge client-side upload failures into the report
      const clientFailures = uploadResults.filter((r) => !r.success)
      if (clientFailures.length > 0 && result.errors) {
        for (const f of clientFailures) {
          result.errors.push({ file: f.filename, reason: `Client upload failed: ${f.error}` })
        }
        result.failed = (result.failed || 0) + clientFailures.length
      }

      setReport(result)
      setStep("report")
      toast.success(result.message || "Image match complete!")
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setError(err.message || "Upload failed")
        toast.error(err.message || "Upload failed")
        setStep("upload")
      }
    } finally {
      abortControllerRef.current = null
    }
  }

  // ==========================
  // Reset
  // ==========================
  const handleReset = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setStep("upload")
    setDataFile(null)
    setImagesFile(null)
    setPreviewData(null)
    setReport(null)
    setError("")
    setProgress(0)
    setUploadStats(null)
  }

  if (authState.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!authState.isAuthenticated || !canAddProducts) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="py-16 sm:py-24">
        <div className="container mx-auto px-6 max-w-6xl">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
            <Link href="/admin/dashboard" className="inline-flex items-center text-gray-600 hover:text-black transition-colors mb-6">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-light tracking-wider mb-2">Bulk Product Upload</h1>
                <p className="text-gray-600">Upload products via Excel/CSV with optional image ZIP</p>
              </div>
              <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                <Download className="h-4 w-4" /> Download Template
              </Button>
            </div>
          </motion.div>

          {/* Step Indicator */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mb-8">
            <div className="flex items-center justify-center gap-0">
              {["upload", "preview", "processing", "report"].map((s, i) => {
                const labels = ["Upload Files", "Preview", "Processing", "Report"]
                const icons = [Upload, Eye, RefreshCw, CheckCircle2]
                const Icon = icons[i]
                const isActive = step === s
                const isPast =
                  ["upload", "preview", "processing", "report"].indexOf(step) > i

                return (
                  <React.Fragment key={s}>
                    {i > 0 && (
                      <div className={`h-0.5 w-12 sm:w-20 ${isPast ? "bg-black" : "bg-gray-300"}`} />
                    )}
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className={`rounded-full p-2.5 transition-all ${isActive
                            ? "bg-black text-white shadow-lg scale-110"
                            : isPast
                              ? "bg-black text-white"
                              : "bg-gray-200 text-gray-500"
                          }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className={`text-xs font-medium ${isActive ? "text-black" : "text-gray-500"}`}>
                        {labels[i]}
                      </span>
                    </div>
                  </React.Fragment>
                )
              })}
            </div>
          </motion.div>

          {/* Error Alert */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-6">
                <Alert className="border-red-200 bg-red-50">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-600">{error}</AlertDescription>
                </Alert>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ============ STEP 1: UPLOAD ============ */}
          <AnimatePresence mode="wait">
            {step === "upload" && (
              <motion.div key="upload" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.4 }}>
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  {/* Data File Drop Zone */}
                  <Card className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5" /> Data File
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div
                        onDrop={handleDataDrop}
                        onDragOver={preventDefault}
                        onDragEnter={preventDefault}
                        onClick={() => dataInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all hover:border-black hover:bg-gray-50
                          ${dataFile ? "border-green-400 bg-green-50" : "border-gray-300"}`}
                      >
                        {dataFile ? (
                          <div className="flex flex-col items-center gap-2">
                            <CheckCircle2 className="h-10 w-10 text-green-500" />
                            <p className="font-medium text-green-700">{dataFile.name}</p>
                            <p className="text-sm text-green-600">{(dataFile.size / 1024).toFixed(1)} KB</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDataFile(null) }}
                              className="text-xs text-red-500 hover:text-red-700 underline mt-1"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-3">
                            <FileSpreadsheet className="h-12 w-12 text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-700">Drop Excel/CSV file here</p>
                              <p className="text-sm text-gray-500 mt-1">or click to browse</p>
                            </div>
                            <p className="text-xs text-gray-400">.xlsx, .xls, .csv</p>
                          </div>
                        )}
                      </div>
                      <input
                        ref={dataInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) setDataFile(f)
                          e.target.value = ""
                        }}
                      />
                    </CardContent>
                  </Card>

                  {/* ZIP Images Drop Zone */}
                  <Card className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <ImageIcon className="h-5 w-5" /> Images ZIP
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5"></Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div
                        onDrop={handleImagesDrop}
                        onDragOver={preventDefault}
                        onDragEnter={preventDefault}
                        onClick={() => zipInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all hover:border-black hover:bg-gray-50
                          ${imagesFile ? "border-green-400 bg-green-50" : "border-gray-300"}`}
                      >
                        {imagesFile ? (
                          <div className="flex flex-col items-center gap-2">
                            <CheckCircle2 className="h-10 w-10 text-green-500" />
                            <p className="font-medium text-green-700">{imagesFile.name}</p>
                            <p className="text-sm text-green-600">{(imagesFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); setImagesFile(null) }}
                              className="text-xs text-red-500 hover:text-red-700 underline mt-1"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-3">
                            <ImageIcon className="h-12 w-12 text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-700">Drop ZIP file here</p>
                              <p className="text-sm text-gray-500 mt-1">or click to browse</p>
                            </div>
                            <p className="text-xs text-gray-400">.zip (containing product images)</p>
                          </div>
                        )}
                      </div>
                      <input
                        ref={zipInputRef}
                        type="file"
                        accept=".zip"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) setImagesFile(f)
                          e.target.value = ""
                        }}
                      />
                    </CardContent>
                  </Card>
                </div>

                {/* Image Matching Info */}
                <Card className="mb-6 bg-blue-50 border-blue-200">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex gap-3">
                      <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <p className="font-medium mb-1">Image Matching Rules</p>
                        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
                          <li>Images are matched by the <code className="bg-blue-100 px-1 rounded">images</code> column (comma-separated filenames)</li>
                          <li>Or automatically by product name (e.g., <code className="bg-blue-100 px-1 rounded">red-dress.jpg</code> or <code className="bg-blue-100 px-1 rounded">red-dress-1.jpg</code>)</li>
                          <li>Unique constraint: <code className="bg-blue-100 px-1 rounded">name + collection</code> — existing products will be updated</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Button */}
                <div className="flex justify-end mt-4">
                  {!dataFile && imagesFile ? (
                    <Button
                      onClick={handleImageOnlyUpload}
                      disabled={loading}
                      className="bg-black text-white hover:bg-gray-800 gap-2 px-8 py-5 text-base"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                        </>
                      ) : (
                        <>
                          Auto-Match Images <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={handlePreview}
                      disabled={!dataFile || loading}
                      className="bg-black text-white hover:bg-gray-800 gap-2 px-8 py-5 text-base"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                        </>
                      ) : (
                        <>
                          Preview Products <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {loading && (
                  <div className="mt-4">
                    <Progress value={progress} className="h-2" />
                    <p className="text-sm text-gray-500 mt-2 text-center">{progressMessage}</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ============ STEP 2: PREVIEW ============ */}
            {step === "preview" && previewData && (
              <motion.div key="preview" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.4 }}>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <Card className="bg-white">
                    <CardContent className="pt-5 pb-4 text-center">
                      <p className="text-3xl font-bold">{previewData.summary.totalRows}</p>
                      <p className="text-sm text-gray-500 mt-1">Total Products</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="pt-5 pb-4 text-center">
                      <p className="text-3xl font-bold text-green-700">{previewData.summary.toCreate}</p>
                      <p className="text-sm text-green-600 mt-1">To Create</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="pt-5 pb-4 text-center">
                      <p className="text-3xl font-bold text-blue-700">{previewData.summary.toUpdate}</p>
                      <p className="text-sm text-blue-600 mt-1">To Update</p>
                    </CardContent>
                  </Card>
                  <Card className={`${previewData.summary.withErrors > 0 ? "bg-red-50 border-red-200" : "bg-gray-50"}`}>
                    <CardContent className="pt-5 pb-4 text-center">
                      <p className={`text-3xl font-bold ${previewData.summary.withErrors > 0 ? "text-red-700" : "text-gray-700"}`}>
                        {previewData.summary.withErrors}
                      </p>
                      <p className={`text-sm mt-1 ${previewData.summary.withErrors > 0 ? "text-red-600" : "text-gray-500"}`}>
                        With Errors
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Images Summary */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  <Card>
                    <CardContent className="pt-4 pb-3 flex items-center gap-3">
                      <ImageIcon className="h-8 w-8 text-purple-500" />
                      <div>
                        <p className="text-lg font-bold">{previewData.summary.totalImages}</p>
                        <p className="text-xs text-gray-500">Images in ZIP</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3 flex items-center gap-3">
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="text-lg font-bold">{previewData.summary.linkedImages}</p>
                        <p className="text-xs text-gray-500">Linked to Products</p>
                      </div>
                    </CardContent>
                  </Card>
                  {(previewData.summary.unmatchedImages?.length || 0) > 0 && (
                    <Card className="bg-amber-50 border-amber-200">
                      <CardContent className="pt-4 pb-3 flex items-center gap-3">
                        <AlertTriangle className="h-8 w-8 text-amber-500" />
                        <div>
                          <p className="text-lg font-bold text-amber-700">{previewData.summary.unmatchedImages.length}</p>
                          <p className="text-xs text-amber-600">Unmatched Images</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Products Table */}
                <Card className="mb-6">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Products Preview</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            <th className="text-left p-3 font-medium text-gray-600">Row</th>
                            <th className="text-left p-3 font-medium text-gray-600">Status</th>
                            <th className="text-left p-3 font-medium text-gray-600">Name</th>
                            <th className="text-left p-3 font-medium text-gray-600">Collection</th>
                            <th className="text-left p-3 font-medium text-gray-600">Price</th>
                            <th className="text-left p-3 font-medium text-gray-600">Branch</th>
                            <th className="text-left p-3 font-medium text-gray-600">Images</th>
                            <th className="text-left p-3 font-medium text-gray-600">Errors</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.products.map((product) => (
                            <tr
                              key={product.rowIndex}
                              className={`border-b hover:bg-gray-50 transition-colors ${product.errors.length > 0 ? "bg-red-50" : ""
                                }`}
                            >
                              <td className="p-3 text-gray-500">{product.rowIndex}</td>
                              <td className="p-3">
                                <Badge
                                  className={
                                    product.status === "create"
                                      ? "bg-green-100 text-green-700 hover:bg-green-100"
                                      : "bg-blue-100 text-blue-700 hover:bg-blue-100"
                                  }
                                >
                                  {product.status === "create" ? "🆕 Create" : "🔄 Update"}
                                </Badge>
                              </td>
                              <td className="p-3 max-w-[200px] font-medium truncate">{product.name || "—"}</td>
                              <td className="p-3">
                                {product.collection ? (
                                  <Badge variant="outline" className="text-xs border-indigo-200 bg-indigo-50 text-indigo-700">{product.collection}</Badge>
                                ) : "—"}
                              </td>
                              <td className="p-3">{product.price ? `${product.price.toLocaleString()} EGP` : "—"}</td>
                              <td className="p-3">
                                {product.branch ? (
                                  <Badge variant="secondary" className="text-xs">{product.branch}</Badge>
                                ) : "—"}
                              </td>
                              <td className="p-3">
                                {product.matchedImages.length > 0 ? (
                                  <span className="text-green-600 text-xs flex items-center gap-1">
                                    <ImageIcon className="h-3 w-3" /> {product.matchedImages.length}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-xs">None</span>
                                )}
                              </td>
                              <td className="p-3">
                                {product.errors.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {product.errors.map((err, i) => (
                                      <p key={i} className="text-xs text-red-600 flex items-center gap-1">
                                        <XCircle className="h-3 w-3 flex-shrink-0" />
                                        {err.field}: {err.message}
                                      </p>
                                    ))}
                                  </div>
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={handleReset} className="gap-2">
                    <ArrowLeft className="h-4 w-4" /> Back to Upload
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={previewData.summary.totalRows === previewData.summary.withErrors}
                    className="bg-black text-white hover:bg-gray-800 gap-2 px-8 py-5 text-base"
                  >
                    <Upload className="h-4 w-4" />
                    Confirm Upload ({previewData.summary.totalRows - previewData.summary.withErrors} products)
                  </Button>
                </div>

                {previewData.summary.withErrors > 0 && (
                  <p className="text-sm text-amber-600 text-right mt-2">
                    ⚠️ {previewData.summary.withErrors} row(s) with errors will be skipped
                  </p>
                )}
              </motion.div>
            )}

            {/* ============ STEP 3: PROCESSING ============ */}
            {step === "processing" && (
              <motion.div key="processing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                <Card className="max-w-lg mx-auto">
                  <CardContent className="py-16 text-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="inline-block mb-6"
                    >
                      <RefreshCw className="h-16 w-16 text-black" />
                    </motion.div>
                    <h2 className="text-xl font-medium mb-2">Processing Bulk Upload</h2>
                    <p className="text-gray-500 mb-4">{progressMessage || "Uploading products and images..."}</p>
                    <Progress value={progress} className="h-3 mb-2" />
                    <p className="text-sm text-gray-400 mb-4">{progress}%</p>
                    {uploadStats && (
                      <div className="text-xs text-gray-500 space-y-1 mt-3 border-t pt-3">
                        <p>📦 {uploadStats.completed}/{uploadStats.total} files</p>
                        {uploadStats.failures > 0 && <p className="text-red-500">❌ {uploadStats.failures} failed</p>}
                        {uploadStats.retries > 0 && <p className="text-amber-500">🔄 {uploadStats.retries} retries</p>}
                      </div>
                    )}
                    <Button variant="outline" onClick={handleCancel} className="mt-4 gap-2 text-red-600 border-red-200 hover:bg-red-50">
                      <Ban className="h-4 w-4" /> Cancel Upload
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ============ STEP 4: REPORT ============ */}
            {step === "report" && report && (
              <motion.div key="report" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.4 }}>
                {/* Success Banner */}
                <Alert className="border-green-200 bg-green-50 mb-6">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <AlertDescription className="text-green-700 font-medium">
                    Bulk upload completed successfully!
                  </AlertDescription>
                </Alert>

                {/* Report Stats */}
                {report.mode === "image-only" ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card className="bg-gray-50 border-gray-200">
                      <CardContent className="pt-5 pb-4 text-center">
                        <p className="text-3xl font-bold text-gray-700">{report.total}</p>
                        <p className="text-sm text-gray-600 mt-1">Total Images</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-blue-50 border-blue-200">
                      <CardContent className="pt-5 pb-4 text-center">
                        <p className="text-3xl font-bold text-blue-700">{report.matched}</p>
                        <p className="text-sm text-blue-600 mt-1">🎯 Matched</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-green-50 border-green-200">
                      <CardContent className="pt-5 pb-4 text-center">
                        <p className="text-3xl font-bold text-green-700">{report.updated}</p>
                        <p className="text-sm text-green-600 mt-1">✅ Uploaded/Updated</p>
                      </CardContent>
                    </Card>
                    <Card className={`${(report.failed || 0) > 0 ? "bg-red-50 border-red-200" : "bg-gray-50"}`}>
                      <CardContent className="pt-5 pb-4 text-center">
                        <p className={`text-3xl font-bold ${(report.failed || 0) > 0 ? "text-red-700" : "text-gray-700"}`}>
                          {report.failed}
                        </p>
                        <p className={`text-sm mt-1 ${(report.failed || 0) > 0 ? "text-red-600" : "text-gray-500"}`}>
                          ❌ Failed
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <Card className="bg-green-50 border-green-200">
                      <CardContent className="pt-5 pb-4 text-center">
                        <p className="text-3xl font-bold text-green-700">{report.created}</p>
                        <p className="text-sm text-green-600 mt-1">✅ Created</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-blue-50 border-blue-200">
                      <CardContent className="pt-5 pb-4 text-center">
                        <p className="text-3xl font-bold text-blue-700">{report.updated}</p>
                        <p className="text-sm text-blue-600 mt-1">🔄 Updated</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-purple-50 border-purple-200">
                      <CardContent className="pt-5 pb-4 text-center">
                        <p className="text-3xl font-bold text-purple-700">{report.linkedImages}</p>
                        <p className="text-sm text-purple-600 mt-1">🖼️ Images Linked</p>
                      </CardContent>
                    </Card>
                    <Card className={`${(report.unmatchedImages?.length || 0) > 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50"}`}>
                      <CardContent className="pt-5 pb-4 text-center">
                        <p className={`text-3xl font-bold ${(report.unmatchedImages?.length || 0) > 0 ? "text-amber-700" : "text-gray-700"}`}>
                          {report.unmatchedImages?.length || 0}
                        </p>
                        <p className={`text-sm mt-1 ${(report.unmatchedImages?.length || 0) > 0 ? "text-amber-600" : "text-gray-500"}`}>
                          ⚠️ Unmatched
                        </p>
                      </CardContent>
                    </Card>
                    <Card className={`${report.errors.length > 0 ? "bg-red-50 border-red-200" : "bg-gray-50"}`}>
                      <CardContent className="pt-5 pb-4 text-center">
                        <p className={`text-3xl font-bold ${report.errors.length > 0 ? "text-red-700" : "text-gray-700"}`}>
                          {report.errors.length}
                        </p>
                        <p className={`text-sm mt-1 ${report.errors.length > 0 ? "text-red-600" : "text-gray-500"}`}>
                          ❌ Errors
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Unmatched Images List (Standard Upload) */}
                {report.mode !== "image-only" && (report.unmatchedImages?.length || 0) > 0 && (
                  <Card className="mb-6">
                    <CardHeader className="pb-3 border-b">
                      <CardTitle className="text-lg text-amber-700 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" /> Unmatched Images
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="flex flex-wrap gap-2">
                        {report.unmatchedImages?.map((img, i) => (
                          <Badge key={i} variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 font-mono text-xs">
                            {img}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Error Details */}
                {report.errors.length > 0 && (
                  <Card className="mb-6">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg text-red-700">Error Details</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-red-50">
                              <th className="text-left p-3 font-medium text-red-700">
                                {report.mode === "image-only" ? "File" : "Row"}
                              </th>
                              <th className="text-left p-3 font-medium text-red-700">Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.errors.map((err, i) => (
                              <tr key={i} className="border-b">
                                <td className="p-3 text-gray-600">
                                  {report.mode === "image-only" ? err.file : err.row}
                                </td>
                                <td className="p-3 text-red-600">{err.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Action Buttons */}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={handleReset} className="gap-2">
                    <Upload className="h-4 w-4" /> Upload More Products
                  </Button>
                  <Link href="/admin/dashboard">
                    <Button className="bg-black text-white hover:bg-gray-800 gap-2">
                      <Package className="h-4 w-4" /> Go to Dashboard
                    </Button>
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  )
}
