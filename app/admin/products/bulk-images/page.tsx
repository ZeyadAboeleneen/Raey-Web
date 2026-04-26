"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ImageIcon, Loader2, Upload, XCircle } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

type UploadState = "pending" | "uploading" | "success" | "failed"

type UploadItem = {
  file: File
  progress: number
  state: UploadState
  url?: string
  error?: string
}

type AttachError = {
  fileName: string
  reason: string
}

type AttachResponse = {
  totalImages: number
  matched: number
  failed: number
  errors: AttachError[]
}

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"]
const CLIENT_UPLOAD_CONCURRENCY = 4

export default function BulkImagesUploadPage() {
  const router = useRouter()
  const { state: authState } = useAuth()

  const [items, setItems] = useState<UploadItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<AttachResponse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authState.isLoading && (!authState.isAuthenticated || authState.user?.role !== "admin")) {
      router.push("/auth/login")
    }
  }, [authState, router])

  const getAuthToken = () => authState.token || localStorage.getItem("token") || ""

  const selectedSizeMb = useMemo(
    () => items.reduce((sum, item) => sum + item.file.size, 0) / (1024 * 1024),
    [items]
  )

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""
  const unsignedPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || ""

  const isImageFile = (file: File) =>
    ALLOWED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))

  const updateItem = (name: string, updater: (item: UploadItem) => UploadItem) => {
    setItems((prev) => prev.map((item) => (item.file.name === name ? updater(item) : item)))
  }

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return

    const all = Array.from(files)
    const valid = all.filter(isImageFile)
    const invalidCount = all.length - valid.length
    if (invalidCount > 0) {
      toast.error(`Skipped ${invalidCount} invalid file(s). Allowed: jpg, png, webp`)
    }

    setItems((prev) => {
      const map = new Map<string, UploadItem>()
      for (const item of prev) map.set(item.file.name.toLowerCase(), item)
      for (const file of valid) {
        map.set(file.name.toLowerCase(), {
          file,
          progress: 0,
          state: "pending",
        })
      }
      return Array.from(map.values())
    })
    setError("")
  }

  const removeFile = (fileName: string) => {
    setItems((prev) => prev.filter((item) => item.file.name !== fileName))
  }

  const uploadToCloudinary = async (file: File): Promise<string> => {
    if (!cloudName) throw new Error("Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME")

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
    const formData = new FormData()
    formData.append("file", file)
    formData.append("folder", "products")

    if (unsignedPreset) {
      formData.append("upload_preset", unsignedPreset)
    } else {
      const signatureRes = await fetch("/api/admin/cloudinary-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ folder: "products" }),
      })

      if (!signatureRes.ok) {
        const payload = await signatureRes.json().catch(() => ({}))
        throw new Error(payload.error || "Failed to get Cloudinary signature")
      }

      const signaturePayload = (await signatureRes.json()) as {
        timestamp: number
        signature: string
        apiKey: string
      }
      formData.append("timestamp", String(signaturePayload.timestamp))
      formData.append("signature", signaturePayload.signature)
      formData.append("api_key", signaturePayload.apiKey)
    }

    return await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("POST", uploadUrl)
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return
        const progress = Math.round((event.loaded / event.total) * 100)
        updateItem(file.name, (item) => ({ ...item, progress, state: "uploading" }))
      }
      xhr.onerror = () => reject(new Error("Network error during Cloudinary upload"))
      xhr.onload = () => {
        try {
          const payload = JSON.parse(xhr.responseText) as { secure_url?: string; error?: { message?: string } }
          if (xhr.status >= 200 && xhr.status < 300 && payload.secure_url) {
            resolve(payload.secure_url)
            return
          }
          reject(new Error(payload.error?.message || "Cloudinary upload failed"))
        } catch {
          reject(new Error("Invalid Cloudinary response"))
        }
      }
      xhr.send(formData)
    })
  }

  const runParallel = async <T,>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> => {
    const results = new Array<T>(tasks.length)
    let index = 0

    async function worker() {
      while (index < tasks.length) {
        const current = index
        index += 1
        results[current] = await tasks[current]()
      }
    }

    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()))
    return results
  }

  const handleUpload = async () => {
    if (items.length === 0) {
      toast.error("Select images first")
      return
    }

    setLoading(true)
    setError("")
    setResult(null)

    const tasks = items.map((item) => async () => {
      try {
        updateItem(item.file.name, (current) => ({ ...current, state: "uploading", progress: 0, error: undefined }))
        const url = await uploadToCloudinary(item.file)
        updateItem(item.file.name, (current) => ({ ...current, state: "success", progress: 100, url }))
        return { fileName: item.file.name, url, error: null as string | null }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed"
        updateItem(item.file.name, (current) => ({ ...current, state: "failed", error: message }))
        return { fileName: item.file.name, url: null as string | null, error: message }
      }
    })

    try {
      const uploadResults = await runParallel(tasks, CLIENT_UPLOAD_CONCURRENCY)
      const uploaded = uploadResults
        .filter((entry) => Boolean(entry.url))
        .map((entry) => ({ fileName: entry.fileName, url: entry.url as string }))
      const clientErrors: AttachError[] = uploadResults
        .filter((entry) => !entry.url)
        .map((entry) => ({ fileName: entry.fileName, reason: entry.error || "Cloudinary upload failed" }))

      if (uploaded.length === 0) {
        setResult({
          totalImages: uploadResults.length,
          matched: 0,
          failed: clientErrors.length,
          errors: clientErrors,
        })
        toast.error("No images uploaded to Cloudinary")
        return
      }

      const response = await fetch("/api/admin/products/attach-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ images: uploaded }),
      })

      const data = (await response.json()) as AttachResponse & { error?: string }
      if (!response.ok) {
        const message = data.error || "Failed to attach images to products"
        setError(message)
        toast.error(message)
        return
      }

      const mergedResult: AttachResponse = {
        totalImages: uploadResults.length,
        matched: data.matched,
        failed: data.failed + clientErrors.length,
        errors: [...clientErrors, ...data.errors],
      }

      setResult(mergedResult)
      toast.success(`Completed: ${mergedResult.matched} matched, ${mergedResult.failed} failed`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload flow failed"
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
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

  if (!authState.isAuthenticated || authState.user?.role !== "admin") return null

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="py-16 sm:py-24">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="mb-8">
            <Link href="/admin/dashboard" className="inline-flex items-center text-gray-600 hover:text-black transition-colors mb-6">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Link>
            <h1 className="text-3xl font-light tracking-wider mb-2">Bulk Product Images Upload</h1>
            <p className="text-gray-600">Images upload directly to Cloudinary, then URLs are attached to products.</p>
          </div>

          {error && (
            <Alert className="mb-6 border-red-200 bg-red-50">
              <XCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">{error}</AlertDescription>
            </Alert>
          )}

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ImageIcon className="h-5 w-5" />
                Multiple Images
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                onDrop={(e) => {
                  e.preventDefault()
                  addFiles(e.dataTransfer.files)
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-black hover:bg-gray-50 transition-all"
              >
                <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="font-medium text-gray-700">Drop images or click to browse</p>
                <p className="text-xs text-gray-500 mt-1">Allowed: jpg, jpeg, png, webp</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                multiple
                accept=".jpg,.jpeg,.png,.webp"
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ""
                }}
              />
              <p className="text-xs text-gray-500 mt-3">
                Selected: {items.length} file(s), {selectedSizeMb.toFixed(2)} MB
              </p>
            </CardContent>
          </Card>

          {items.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Upload Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-80 overflow-auto pr-1">
                  {items.map((item) => (
                    <div key={item.file.name} className="border rounded-md p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{item.file.name}</p>
                          <p className="text-xs text-gray-500">{(item.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={item.state === "success" ? "default" : item.state === "failed" ? "destructive" : "secondary"}>
                            {item.state}
                          </Badge>
                          {!loading && (
                            <button
                              type="button"
                              onClick={() => removeFile(item.file.name)}
                              className="text-xs text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 h-2 bg-gray-100 rounded">
                        <div className="h-2 bg-black rounded transition-all" style={{ width: `${item.progress}%` }} />
                      </div>
                      {item.error && <p className="text-xs text-red-600 mt-2">{item.error}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end mb-8">
            <Button onClick={handleUpload} disabled={loading || items.length === 0} className="bg-black text-white hover:bg-gray-800 gap-2 px-8 py-5 text-base">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Upload & Attach
                </>
              )}
            </Button>
          </div>

          {result && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-2xl font-bold">{result.totalImages}</p>
                    <p className="text-xs text-gray-500 mt-1">Total Images</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{result.matched}</p>
                    <p className="text-xs text-green-600 mt-1">Matched</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{result.failed}</p>
                    <p className="text-xs text-red-600 mt-1">Failed</p>
                  </CardContent>
                </Card>
              </div>

              {result.errors.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-red-700 text-lg">Errors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-72 overflow-auto pr-1">
                      {result.errors.map((entry, index) => (
                        <div key={`${entry.fileName}-${index}`} className="border rounded-md p-3 bg-red-50/40">
                          <p className="font-medium text-sm">{entry.fileName}</p>
                          <p className="text-xs text-red-700 mt-1">{entry.reason}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
