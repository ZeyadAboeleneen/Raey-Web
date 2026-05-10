"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback, Suspense } from "react"
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
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { EmployeeManagement } from "@/components/admin/employee-management"

interface HeroImages {
  wedding: string
  soiree: string
}

const DEFAULT_HERO_IMAGES: HeroImages = {
  wedding: "/wedding.jpg?v=2",
  soiree: "/elraey-bg.PNG",
}

function AdminSettingsContent() {
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

  const getAuthToken = useCallback(() => {
    return authState.token || localStorage.getItem("token") || ""
  }, [authState.token])

  // Fetch current settings
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/settings")
      if (res.ok) {
        const data = await res.json()
        if (data) {
          setHeroImages({
            wedding: data.heroImages?.wedding || DEFAULT_HERO_IMAGES.wedding,
            soiree: data.heroImages?.soiree || DEFAULT_HERO_IMAGES.soiree,
          })
        }
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

    if (!authState.isLoading && (!authState.isAuthenticated || authState.user?.role !== "admin")) {
      router.push("/auth/login")
    }
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

      if (res.ok && result) {
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
        setError(result?.error || "Failed to save settings")
        toast.error(result?.error || "Failed to save settings")
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
    <div className="min-h-screen bg-gray-50/50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-white shadow-sm border">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500">Configure your platform preferences and management</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Sidebar Navigation */}
          <aside className="md:col-span-3 space-y-1">
            <nav className="flex flex-col gap-1">
              <button
                onClick={() => setActiveTab("appearance")}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200",
                  activeTab === "appearance" 
                    ? "bg-white text-black shadow-sm border border-gray-100" 
                    : "text-gray-500 hover:bg-white/50 hover:text-gray-900"
                )}
              >
                <ImageIcon className={cn("h-4 w-4", activeTab === "appearance" ? "text-rose-500" : "text-gray-400")} />
                Site Appearance
              </button>
              <button
                onClick={() => setActiveTab("employees")}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200",
                  activeTab === "employees" 
                    ? "bg-white text-black shadow-sm border border-gray-100" 
                    : "text-gray-500 hover:bg-white/50 hover:text-gray-900"
                )}
              >
                <Upload className={cn("h-4 w-4", activeTab === "employees" ? "text-purple-500" : "text-gray-400")} />
                Employee Management
              </button>
            </nav>

            <div className="pt-8 px-4">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Actions</h4>
              <div className="space-y-2">
                <Button
                  onClick={fetchSettings}
                  variant="ghost"
                  className="w-full justify-start text-xs text-gray-500 hover:bg-white"
                >
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Reload Configuration
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className="w-full justify-start text-xs bg-black text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  <Save className="mr-2 h-3 w-3" />
                  Apply All Changes
                </Button>
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="md:col-span-9">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab === "appearance" && (
                <div className="space-y-6">
                  {error && (
                    <Alert className="border-red-200 bg-red-50 mb-6">
                      <AlertDescription className="text-red-600">{error}</AlertDescription>
                    </Alert>
                  )}

                  <Card className="border-0 shadow-sm overflow-hidden bg-white/80 backdrop-blur-sm">
                    <CardHeader className="border-b border-gray-50 pb-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg font-semibold">Hero Images</CardTitle>
                          <p className="text-xs text-gray-500 mt-1">Manage the visual identity of your collection pages</p>
                        </div>
                        <ImageIcon className="h-5 w-5 text-gray-300" />
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-10">
                      {/* Wedding Hero */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-amber-400" />
                            Wedding Collection Hero
                          </label>
                          <span className="text-[10px] text-gray-400 font-mono">1920 x 1080 Recommended</span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="relative aspect-video rounded-2xl overflow-hidden border bg-gray-50 group">
                            <Image src={heroImages.wedding} alt="Wedding" fill className="object-cover" />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-white text-[10px] font-medium bg-black/40 px-3 py-1 rounded-full backdrop-blur-md">Active Image</span>
                            </div>
                          </div>
                          
                          <div className="relative aspect-video">
                            {weddingPreview ? (
                              <div className="relative h-full rounded-2xl overflow-hidden border-2 border-green-500/50 shadow-lg shadow-green-100 group">
                                <Image src={weddingPreview} alt="Preview" fill className="object-cover" />
                                <button
                                  onClick={() => clearPreview("wedding")}
                                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:bg-red-600 transition-colors"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                                <div className="absolute bottom-3 left-3">
                                  <span className="bg-green-500 text-white text-[10px] px-3 py-1 rounded-full flex items-center gap-1 shadow-md">
                                    <Check className="h-3 w-3" /> New image ready
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => weddingInputRef.current?.click()}
                                className="w-full h-full rounded-2xl border-2 border-dashed border-gray-200 bg-white hover:border-rose-300 hover:bg-rose-50/30 transition-all flex flex-col items-center justify-center gap-3 group"
                              >
                                <div className="h-10 w-10 rounded-full bg-gray-50 group-hover:bg-rose-100 flex items-center justify-center transition-colors">
                                  <Upload className="h-5 w-5 text-gray-400 group-hover:text-rose-500 transition-colors" />
                                </div>
                                <div className="text-center">
                                  <p className="text-xs font-medium text-gray-600">Upload New Wedding Hero</p>
                                  <p className="text-[10px] text-gray-400 mt-1">JPG, PNG, WebP • Max 10MB</p>
                                </div>
                              </button>
                            )}
                            <input ref={weddingInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, "wedding")} />
                          </div>
                        </div>
                      </div>

                      <div className="h-px bg-gray-50" />

                      {/* Soiree Hero */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-rose-500" />
                            Soirée Collection Hero
                          </label>
                          <span className="text-[10px] text-gray-400 font-mono">1920 x 1080 Recommended</span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="relative aspect-video rounded-2xl overflow-hidden border bg-gray-50 group">
                            <Image src={heroImages.soiree} alt="Soiree" fill className="object-cover" />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-white text-[10px] font-medium bg-black/40 px-3 py-1 rounded-full backdrop-blur-md">Active Image</span>
                            </div>
                          </div>
                          
                          <div className="relative aspect-video">
                            {soireePreview ? (
                              <div className="relative h-full rounded-2xl overflow-hidden border-2 border-green-500/50 shadow-lg shadow-green-100 group">
                                <Image src={soireePreview} alt="Preview" fill className="object-cover" />
                                <button
                                  onClick={() => clearPreview("soiree")}
                                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:bg-red-600 transition-colors"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                                <div className="absolute bottom-3 left-3">
                                  <span className="bg-green-500 text-white text-[10px] px-3 py-1 rounded-full flex items-center gap-1 shadow-md">
                                    <Check className="h-3 w-3" /> New image ready
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => soireeInputRef.current?.click()}
                                className="w-full h-full rounded-2xl border-2 border-dashed border-gray-200 bg-white hover:border-rose-300 hover:bg-rose-50/30 transition-all flex flex-col items-center justify-center gap-3 group"
                              >
                                <div className="h-10 w-10 rounded-full bg-gray-50 group-hover:bg-rose-100 flex items-center justify-center transition-colors">
                                  <Upload className="h-5 w-5 text-gray-400 group-hover:text-rose-500 transition-colors" />
                                </div>
                                <div className="text-center">
                                  <p className="text-xs font-medium text-gray-600">Upload New Soirée Hero</p>
                                  <p className="text-[10px] text-gray-400 mt-1">JPG, PNG, WebP • Max 10MB</p>
                                </div>
                              </button>
                            )}
                            <input ref={soireeInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, "soiree")} />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === "employees" && (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-0 shadow-sm p-6 overflow-hidden">
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold">Employee Management</h3>
                    <p className="text-xs text-gray-500 mt-1">Control access and assign roles to your administration team</p>
                  </div>
                  <EmployeeManagement />
                </div>
              )}
            </motion.div>
          </main>
        </div>
      </div>

      {/* Floating Save Notification (Minimal) */}
      {hasChanges && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-4 pr-6 rounded-2xl z-50 flex items-center gap-6"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center">
              <Save className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Unsaved Changes</p>
              <p className="text-xs text-gray-900 font-medium">Hero images have been modified</p>
            </div>
          </div>
          <div className="flex items-center gap-2 border-l pl-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearPreview("wedding")
                clearPreview("soiree")
              }}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-black text-white hover:bg-gray-800 text-xs px-6 rounded-xl"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save Changes"}
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default function AdminSettings() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500" />
      </div>
    }>
      <AdminSettingsContent />
    </Suspense>
  )
}
