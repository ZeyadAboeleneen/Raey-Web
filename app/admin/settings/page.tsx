"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  ArrowLeft,
  Upload,
  ImageIcon,
  Save,
  Check,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react"
import { Navigation } from "@/components/navigation"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmployeeManagement } from "@/components/admin/employee-management"

interface HeroImages {
  wedding: string
  soiree: string
}

const DEFAULT_HERO_IMAGES: HeroImages = {
  wedding: "/wedding.jpg?v=2",
  soiree: "/elraey-bg.PNG",
}

export default function AdminSettings() {
  const router = useRouter()
  const { state: authState } = useAuth()
  const [activeTab, setActiveTab] = useState("appearance")
  const [heroImages, setHeroImages] = useState<HeroImages>(DEFAULT_HERO_IMAGES)
  const [weddingPreview, setWeddingPreview] = useState<string | null>(null)
  const [soireePreview, setSoireePreview] = useState<string | null>(null)
  const [weddingDataUrl, setWeddingDataUrl] = useState<string | null>(null)
  const [soireeDataUrl, setSoireeDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const weddingInputRef = useRef<HTMLInputElement>(null)
  const soireeInputRef = useRef<HTMLInputElement>(null)

  const getAuthToken = () => {
    return authState.token || localStorage.getItem("token") || ""
  }

  // Fetch current settings
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/settings")
      if (res.ok) {
        const data = await res.json()
        setHeroImages({
          wedding: data.heroImages?.wedding || DEFAULT_HERO_IMAGES.wedding,
          soiree: data.heroImages?.soiree || DEFAULT_HERO_IMAGES.soiree,
        })
      }
    } catch (err) {
      console.error("Error fetching settings:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authState.isLoading) return

    if (authState.isAuthenticated && authState.user?.role === "admin") {
      fetchSettings()
      return
    }

    router.push("/auth/login")
  }, [authState.isAuthenticated, authState.isLoading, authState.user?.role, fetchSettings, router])

  const handleImageSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "wedding" | "soiree"
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be less than 10MB")
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      if (type === "wedding") {
        setWeddingPreview(dataUrl)
        setWeddingDataUrl(dataUrl)
      } else {
        setSoireePreview(dataUrl)
        setSoireeDataUrl(dataUrl)
      }
    }
    reader.readAsDataURL(file)

    // Reset input so same file can be re-selected
    e.target.value = ""
  }

  const clearPreview = (type: "wedding" | "soiree") => {
    if (type === "wedding") {
      setWeddingPreview(null)
      setWeddingDataUrl(null)
    } else {
      setSoireePreview(null)
      setSoireeDataUrl(null)
    }
  }

  const handleSave = async () => {
    if (!weddingDataUrl && !soireeDataUrl) {
      toast.error("No changes to save. Upload at least one image.")
      return
    }

    try {
      setSaving(true)
      setError("")

      const token = getAuthToken()
      if (!token) {
        setError("Authentication required. Please log in again.")
        return
      }

      const body: any = {}
      if (weddingDataUrl) body.weddingImage = weddingDataUrl
      if (soireeDataUrl) body.soireeImage = soireeDataUrl

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      const result = await res.json()

      if (res.ok) {
        setHeroImages({
          wedding: result.heroImages?.wedding || heroImages.wedding,
          soiree: result.heroImages?.soiree || heroImages.soiree,
        })
        setWeddingPreview(null)
        setWeddingDataUrl(null)
        setSoireePreview(null)
        setSoireeDataUrl(null)
        toast.success("Hero images updated successfully!")
      } else {
        setError(result.error || "Failed to save settings")
        toast.error(result.error || "Failed to save settings")
      }
    } catch (err: any) {
      console.error("Error saving settings:", err)
      setError("An error occurred while saving")
      toast.error("An error occurred while saving")
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = weddingDataUrl || soireeDataUrl

  if (authState.isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    )
  }

  if (!authState.isAuthenticated || authState.user?.role !== "admin") {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 max-w-5xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-8"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <Link href="/admin/dashboard">
                  <Button variant="outline" size="icon" className="rounded-full bg-transparent">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-light tracking-wider">
                    Site Settings
                  </h1>
                  <p className="text-gray-600 text-sm">
                    Manage your website hero images and appearance
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  onClick={fetchSettings}
                  variant="outline"
                  size="sm"
                  className="bg-transparent text-xs sm:text-sm"
                >
                  <RefreshCw className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  Refresh
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  size="sm"
                  className="bg-black text-white hover:bg-gray-800 text-xs sm:text-sm disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-white border shadow-sm">
              <TabsTrigger value="appearance">Site Appearance</TabsTrigger>
              <TabsTrigger value="employees">Employee Management</TabsTrigger>
            </TabsList>

            <TabsContent value="appearance" className="space-y-6 m-0">
              {error && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                  <Alert className="border-red-200 bg-red-50">
                    <AlertDescription className="text-red-600">{error}</AlertDescription>
                  </Alert>
                </motion.div>
              )}

              {/* Hero Images Section */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-rose-500" />
                  Hero Images
                </CardTitle>
                <p className="text-sm text-gray-500">
                  These images appear as the background hero on the homepage, wedding, and soirée collection pages.
                  For best results, use high-quality landscape images (at least 1920×1080).
                </p>
              </CardHeader>
              <CardContent className="space-y-8 pt-4">
                {/* Wedding Hero Image */}
                <div>
                  <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-gradient-to-r from-amber-400 to-yellow-600" />
                    Wedding Collection Hero
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Used on the homepage left panel and the wedding page hero section.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Current Image */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                        Current Image
                      </p>
                      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                        <Image
                          src={heroImages.wedding}
                          alt="Current wedding hero"
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className="object-cover"
                        />
                        <div className="absolute bottom-2 left-2">
                          <span className="bg-black/60 text-white text-[10px] px-2 py-1 rounded-full">
                            Live
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* New Image / Upload */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                        {weddingPreview ? "New Image Preview" : "Upload New Image"}
                      </p>

                      {weddingPreview ? (
                        <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-green-400 bg-gray-100">
                          <Image
                            src={weddingPreview}
                            alt="New wedding hero preview"
                            fill
                            sizes="(max-width: 768px) 100vw, 50vw"
                            className="object-cover"
                          />
                          <button
                            onClick={() => clearPreview("wedding")}
                            className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <div className="absolute bottom-2 left-2">
                            <span className="bg-green-500/80 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              Ready to save
                            </span>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => weddingInputRef.current?.click()}
                          className="w-full aspect-video rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400 transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer"
                        >
                          <div className="h-10 w-10 rounded-full bg-gray-200 group-hover:bg-rose-100 flex items-center justify-center transition-colors">
                            <Upload className="h-5 w-5 text-gray-400 group-hover:text-rose-500 transition-colors" />
                          </div>
                          <span className="text-sm text-gray-500 group-hover:text-gray-700 transition-colors">
                            Click to upload
                          </span>
                          <span className="text-xs text-gray-400">
                            JPG, PNG, WebP • Max 10MB
                          </span>
                        </button>
                      )}

                      <input
                        ref={weddingInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageSelect(e, "wedding")}
                        className="hidden"
                      />

                      {weddingPreview && (
                        <Button
                          onClick={() => weddingInputRef.current?.click()}
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full text-xs bg-transparent"
                        >
                          <Upload className="mr-2 h-3 w-3" />
                          Choose Different Image
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-100" />

                {/* Soiree Hero Image */}
                <div>
                  <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-gradient-to-r from-rose-500 to-pink-500" />
                    Soirée Collection Hero
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Used on the homepage right panel and the soirée page hero section.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Current Image */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                        Current Image
                      </p>
                      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                        <Image
                          src={heroImages.soiree}
                          alt="Current soiree hero"
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className="object-cover"
                        />
                        <div className="absolute bottom-2 left-2">
                          <span className="bg-black/60 text-white text-[10px] px-2 py-1 rounded-full">
                            Live
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* New Image / Upload */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                        {soireePreview ? "New Image Preview" : "Upload New Image"}
                      </p>

                      {soireePreview ? (
                        <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-green-400 bg-gray-100">
                          <Image
                            src={soireePreview}
                            alt="New soiree hero preview"
                            fill
                            sizes="(max-width: 768px) 100vw, 50vw"
                            className="object-cover"
                          />
                          <button
                            onClick={() => clearPreview("soiree")}
                            className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <div className="absolute bottom-2 left-2">
                            <span className="bg-green-500/80 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              Ready to save
                            </span>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => soireeInputRef.current?.click()}
                          className="w-full aspect-video rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400 transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer"
                        >
                          <div className="h-10 w-10 rounded-full bg-gray-200 group-hover:bg-rose-100 flex items-center justify-center transition-colors">
                            <Upload className="h-5 w-5 text-gray-400 group-hover:text-rose-500 transition-colors" />
                          </div>
                          <span className="text-sm text-gray-500 group-hover:text-gray-700 transition-colors">
                            Click to upload
                          </span>
                          <span className="text-xs text-gray-400">
                            JPG, PNG, WebP • Max 10MB
                          </span>
                        </button>
                      )}

                      <input
                        ref={soireeInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageSelect(e, "soiree")}
                        className="hidden"
                      />

                      {soireePreview && (
                        <Button
                          onClick={() => soireeInputRef.current?.click()}
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full text-xs bg-transparent"
                        >
                          <Upload className="mr-2 h-3 w-3" />
                          Choose Different Image
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sticky Save Bar */}
            {hasChanges && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] p-4 z-50"
              >
                <div className="container mx-auto max-w-5xl flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium text-amber-600">Unsaved changes</span> — 
                    {weddingDataUrl && soireeDataUrl
                      ? " Both hero images will be updated"
                      : weddingDataUrl
                        ? " Wedding hero image will be updated"
                        : " Soirée hero image will be updated"}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        clearPreview("wedding")
                        clearPreview("soiree")
                      }}
                      variant="outline"
                      size="sm"
                      className="bg-transparent text-xs sm:text-sm"
                    >
                      Discard
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      size="sm"
                      className="bg-black text-white hover:bg-gray-800 text-xs sm:text-sm"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
            </TabsContent>

            <TabsContent value="employees" className="m-0">
              <EmployeeManagement />
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </div>
  )
}
