"use client"

/**
 * components/try-on/TryOnModal.tsx
 *
 * The RAEY AI TRY-ON experience — a full-screen, four-stage flow:
 *
 *   upload → generating → result
 *                      ↘ error
 *
 * It talks to `/api/ai/virtual-try-on` and nothing else; the Gemini key, the
 * prompt and the official gown image all live server-side. The shopper's photo
 * is held in component state for the duration of the visit and is never
 * uploaded anywhere except that one endpoint.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { motion } from "framer-motion"
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  Download,
  Share2,
  Sparkles,
  Upload,
  X,
} from "lucide-react"
import imageCompression from "browser-image-compression"
import { trackTryOn } from "@/lib/ai/try-on-analytics"
import { saveLook } from "@/lib/try-on-storage"

/* ── Types ────────────────────────────────────────────────────────── */

export interface TryOnDress {
  id: string
  name: string
  collection: string
  branch: string
  image: string
}

interface Props {
  open: boolean
  onClose: () => void
  dress: TryOnDress
}

type Stage = "upload" | "generating" | "result" | "error"
type PhotoSource = "upload" | "camera"

interface ResultState {
  image: string
  productUrl: string
  durationMs: number
}

interface ErrorState {
  message: string
  code: string
  /** TRY AGAIN is only offered when retrying the same photo could work. */
  retryable: boolean
}

/* ── Constants ────────────────────────────────────────────────────── */

const WHATSAPP_NUMBER = "201015847000"
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024
const MIN_DIMENSION = 256

/** The loading copy, advanced on a timer while generation runs. */
const LOADING_STAGES = [
  "Analyzing your photo",
  "Understanding the silhouette",
  "Fitting the gown",
  "Perfecting the details",
  "Your RAEY moment is ready",
]

const GOLD = "#B9975B"

/* ── Client-side photo checks ─────────────────────────────────────── */

/**
 * Cheap local validation so obvious problems never cost a network round-trip.
 * The server re-validates everything — this is convenience, not enforcement.
 */
async function validatePhoto(file: File): Promise<string | null> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Please choose a JPG, PNG or WEBP photo."
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "That photo is larger than 12 MB. Please choose a smaller one."
  }

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    bitmap.close?.()
    if (Math.min(width, height) < MIN_DIMENSION) {
      return "We couldn't get a clear view of you. For the best result, upload a full-body photo with your entire body visible."
    }
  } catch {
    return "We couldn't read that photo. Please try another one."
  }

  return null
}

/* ── Component ────────────────────────────────────────────────────── */

export default function TryOnModal({ open, onClose, dress }: Props) {
  const router = useRouter()

  const [stage, setStage] = useState<Stage>("upload")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoSource, setPhotoSource] = useState<PhotoSource>("upload")
  const [validationError, setValidationError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [loadingStage, setLoadingStage] = useState(0)
  const [result, setResult] = useState<ResultState | null>(null)
  const [error, setError] = useState<ErrorState | null>(null)
  const [saved, setSaved] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)

  const uploadInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  /* — Preview object URL lifecycle — */
  const setPreviewFor = useCallback((file: File | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    if (!file) {
      setPhotoPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setPhotoPreview(url)
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      abortRef.current?.abort()
    }
  }, [])

  /* — Open/close side effects: scroll lock, Escape, analytics — */
  useEffect(() => {
    if (!open) return

    trackTryOn("try_on_opened", {
      product_id: dress.id,
      collection: dress.collection,
      branch: dress.branch,
    })

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    }
    window.addEventListener("keydown", onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
    // handleClose is stable enough for this lifecycle; re-binding on every
    // state change would tear down the listener mid-generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dress.id])

  /* — Loading stage ticker — */
  useEffect(() => {
    if (stage !== "generating") return
    setLoadingStage(0)
    const interval = setInterval(() => {
      // Hold on the penultimate line; the last line belongs to the result.
      setLoadingStage((s) => Math.min(s + 1, LOADING_STAGES.length - 2))
    }, 4200)
    return () => clearInterval(interval)
  }, [stage])

  /* — Actions — */

  function resetPhoto() {
    setPhotoFile(null)
    setPreviewFor(null)
    setValidationError(null)
  }

  function handleClose() {
    // Cancelling mid-generation must actually stop the request.
    abortRef.current?.abort()
    abortRef.current = null
    onClose()
  }

  async function handleFileSelected(file: File | undefined, source: PhotoSource) {
    if (!file) return
    setValidationError(null)
    setError(null)
    setPhotoSource(source)

    const problem = await validatePhoto(file)
    if (problem) {
      setValidationError(problem)
      setPhotoFile(null)
      setPreviewFor(null)
      return
    }

    setPhotoFile(file)
    setPreviewFor(file)
    trackTryOn("try_on_photo_uploaded", {
      product_id: dress.id,
      collection: dress.collection,
      source,
    })
  }

  async function handleGenerate(fileOverride?: File) {
    const file = fileOverride ?? photoFile
    if (!file) return

    setStage("generating")
    setError(null)
    setSaved(false)
    setSaveFailed(false)
    setShareNote(null)

    const startedAt = Date.now()
    trackTryOn("try_on_generation_started", {
      product_id: dress.id,
      collection: dress.collection,
      source: photoSource,
    })

    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Compress before upload: phone photos are routinely 6-10 MB, and the
      // server downscales to 1536px anyway, so sending the original just makes
      // the shopper wait on their own uplink.
      setPreparing(true)
      let toSend: File = file
      try {
        toSend = await imageCompression(file, {
          maxSizeMB: 3,
          maxWidthOrHeight: 1600,
          useWebWorker: true,
          initialQuality: 0.9,
        })
      } catch {
        // Compression is an optimisation — fall back to the original file.
        toSend = file
      } finally {
        setPreparing(false)
      }

      const form = new FormData()
      form.append("photo", toSend, "photo.jpg")
      form.append("dressId", dress.id)
      form.append("branch", dress.branch)

      const response = await fetch("/api/ai/virtual-try-on", {
        method: "POST",
        body: form,
        signal: controller.signal,
      })

      const data = await response.json().catch(() => null)

      if (!response.ok || !data?.image) {
        const failure: ErrorState = {
          message:
            data?.error ||
            "We couldn't create your look this time. Please try again with a clear full-body photo.",
          code: data?.code || "GENERATION_FAILED",
          retryable: data?.retryable !== false,
        }
        setError(failure)
        setStage("error")
        trackTryOn("try_on_generation_failed", {
          product_id: dress.id,
          collection: dress.collection,
          error_code: failure.code,
          duration_ms: Date.now() - startedAt,
        })
        return
      }

      setLoadingStage(LOADING_STAGES.length - 1)
      setResult({
        image: data.image,
        productUrl: data.dress?.productUrl || `/products/${dress.branch}/${dress.id}`,
        durationMs: data.meta?.durationMs ?? Date.now() - startedAt,
      })
      setStage("result")

      trackTryOn("try_on_generation_success", {
        product_id: dress.id,
        collection: dress.collection,
        duration_ms: data.meta?.durationMs ?? Date.now() - startedAt,
      })
      trackTryOn("try_on_result_viewed", { product_id: dress.id, collection: dress.collection })
    } catch (err: any) {
      if (err?.name === "AbortError") return // shopper cancelled — no error UI
      setError({
        message:
          "We couldn't reach RAEY AI Try-On. Please check your connection and try again.",
        code: "NETWORK",
        retryable: true,
      })
      setStage("error")
      trackTryOn("try_on_generation_failed", {
        product_id: dress.id,
        collection: dress.collection,
        error_code: "NETWORK",
        duration_ms: Date.now() - startedAt,
      })
    } finally {
      abortRef.current = null
    }
  }

  function handleTryAnotherPhoto() {
    resetPhoto()
    setResult(null)
    setError(null)
    setStage("upload")
  }

  function handleTryAnotherDress() {
    handleClose()
    router.push("/wedding")
  }

  function handleSaveLook() {
    if (!result) return
    const stored = saveLook({
      dressId: dress.id,
      dressName: dress.name,
      branch: dress.branch,
      collection: dress.collection,
      productUrl: result.productUrl,
      image: result.image,
    })

    if (stored) {
      setSaved(true)
      setSaveFailed(false)
      trackTryOn("try_on_saved", { product_id: dress.id, collection: dress.collection })
    } else {
      setSaveFailed(true)
    }
  }

  function downloadResult() {
    if (!result) return
    const link = document.createElement("a")
    link.href = result.image
    link.download = `raey-look-${dress.name.replace(/\s+/g, "-").toLowerCase()}.jpg`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function handleShare() {
    if (!result) return
    const shareText = "Meet my RAEY look ✨"

    try {
      const blob = await (await fetch(result.image)).blob()
      const file = new File([blob], "raey-look.jpg", { type: blob.type || "image/jpeg" })

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "RAEY AI Try-On", text: shareText, files: [file] })
        trackTryOn("try_on_shared", {
          product_id: dress.id,
          collection: dress.collection,
          method: "web_share_file",
        })
        return
      }

      if (navigator.share) {
        await navigator.share({ title: "RAEY AI Try-On", text: shareText, url: result.productUrl })
        trackTryOn("try_on_shared", {
          product_id: dress.id,
          collection: dress.collection,
          method: "web_share_link",
        })
        return
      }

      // No Web Share API (most desktop browsers) — hand them the image instead.
      downloadResult()
      setShareNote("Your look has been downloaded — share it from your device.")
      trackTryOn("try_on_shared", {
        product_id: dress.id,
        collection: dress.collection,
        method: "download",
      })
    } catch (err: any) {
      if (err?.name === "AbortError") return // share sheet dismissed
      downloadResult()
      setShareNote("Your look has been downloaded — share it from your device.")
    }
  }

  function handleBookAppointment() {
    trackTryOn("try_on_appointment_clicked", {
      product_id: dress.id,
      collection: dress.collection,
      branch: dress.branch,
    })

    const message =
      `مرحباً، أود حجز موعد خاص لتجربة فستان RAEY\n\n` +
      `الفستان: ${dress.name}\n` +
      `رقم الموديل: ${dress.id}\n\n` +
      `(جربته عبر RAEY AI Try-On)`

    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  if (!open) return null

  /* ── Render ─────────────────────────────────────────────────────── */

  // Rendered through a portal on <body>. The product page nests its content in
  // animated motion.div wrappers, and an ancestor `transform` makes itself the
  // containing block for `position: fixed` descendants — without the portal the
  // "full-screen" overlay is trapped inside that column instead of covering the
  // viewport.
  //
  // No <AnimatePresence>: the parent mounts this behind an `open &&` guard, so
  // an exit animation would never get to play anyway.
  return createPortal(
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain"
        style={{ backgroundColor: "#FBF9F6" }}
        role="dialog"
        aria-modal="true"
        aria-label="RAEY AI Try-On"
        // Current stage, exposed as a stable hook for end-to-end tests.
        data-stage={stage}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 backdrop-blur-sm border-b"
          style={{ backgroundColor: "rgba(251,249,246,0.92)", borderColor: "rgba(0,0,0,0.06)" }}
        >
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-4 sm:py-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-serif text-lg sm:text-2xl tracking-[0.18em] uppercase text-black truncate">
                RAEY AI Try-On
              </h2>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 tracking-wide">
                See yourself in your RAEY moment.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close RAEY AI Try-On"
              className="flex-shrink-0 h-10 w-10 rounded-full border border-black/10 flex items-center justify-center hover:bg-black hover:text-white transition-colors duration-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
          {/* Stages animate on entry only, with no AnimatePresence.
              Exit choreography here proved unreliable — the outgoing panel's
              exit animation could fail to complete, leaving every stage
              stacked in the DOM at once. A keyed panel that fades in on mount
              gives the same feel with no way to strand the previous one. */}
          <>
            {stage === "upload" ? (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start"
              >
                {/* Selected gown */}
                <div className="order-1">
                  <div className="relative aspect-[3/4] w-full bg-white overflow-hidden">
                    <Image
                      src={dress.image || "/placeholder.svg"}
                      alt={dress.name}
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-contain"
                      priority
                    />
                    <span
                      className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] bg-white/90 backdrop-blur-sm"
                      style={{ color: GOLD }}
                    >
                      <Sparkles className="h-3 w-3" /> AI Powered
                    </span>
                  </div>
                  <div className="mt-5 text-center lg:text-left">
                    {dress.collection && (
                      <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 mb-1.5">
                        {dress.collection} Collection
                      </p>
                    )}
                    <h3 className="font-serif text-xl sm:text-2xl font-light text-black">
                      {dress.name}
                    </h3>
                  </div>
                </div>

                {/* Upload panel */}
                <div className="order-2 lg:pt-6">
                  <h3 className="font-serif text-2xl sm:text-3xl font-light text-black mb-3">
                    Upload Your Photo
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed mb-8 max-w-md">
                    Upload a clear full-body photo to see how this dress looks on you.
                  </p>

                  {photoPreview ? (
                    <div className="mb-8">
                      <div className="relative w-full max-w-xs aspect-[3/4] bg-white overflow-hidden mx-auto lg:mx-0">
                        {/* Local object URL — plain <img> avoids the optimizer entirely. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoPreview}
                          alt="Your uploaded photo"
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={resetPhoto}
                          aria-label="Remove photo"
                          className="absolute top-3 right-3 h-8 w-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-black hover:text-white transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ul className="text-xs text-gray-500 space-y-2 mb-8 leading-relaxed">
                      {[
                        "Full body, standing upright",
                        "Good, even lighting",
                        "You clearly visible and unobstructed",
                        "JPG, PNG or WEBP · up to 12 MB",
                      ].map((tip) => (
                        <li key={tip} className="flex items-start gap-2.5">
                          <span
                            className="mt-[7px] h-[3px] w-[3px] rounded-full flex-shrink-0"
                            style={{ backgroundColor: GOLD }}
                          />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  )}

                  {validationError && (
                    <div className="flex items-start gap-2.5 mb-6 p-3.5 bg-white border border-black/5">
                      <AlertCircle className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-700 leading-relaxed">{validationError}</p>
                    </div>
                  )}

                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      handleFileSelected(e.target.files?.[0], "upload")
                      e.target.value = ""
                    }}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      handleFileSelected(e.target.files?.[0], "camera")
                      e.target.value = ""
                    }}
                  />

                  <div className="space-y-3">
                    {photoFile ? (
                      <button
                        type="button"
                        onClick={() => handleGenerate()}
                        disabled={preparing}
                        className="w-full py-4 bg-black text-white text-[11px] uppercase tracking-[0.25em] hover:bg-gray-800 transition-colors duration-300 disabled:opacity-50"
                      >
                        Create My RAEY Look
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => uploadInputRef.current?.click()}
                        className="w-full py-4 bg-black text-white text-[11px] uppercase tracking-[0.25em] hover:bg-gray-800 transition-colors duration-300 flex items-center justify-center gap-2.5"
                      >
                        <Upload className="h-3.5 w-3.5" /> Upload Photo
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-full py-4 border border-black/15 text-black text-[11px] uppercase tracking-[0.25em] hover:border-black transition-colors duration-300 flex items-center justify-center gap-2.5"
                    >
                      <Camera className="h-3.5 w-3.5" /> Take a Photo
                    </button>

                    {photoFile && (
                      <button
                        type="button"
                        onClick={() => uploadInputRef.current?.click()}
                        className="w-full py-2 text-[11px] uppercase tracking-[0.2em] text-gray-500 hover:text-black transition-colors"
                      >
                        Choose a different photo
                      </button>
                    )}
                  </div>

                  <p className="mt-8 text-[10px] text-gray-400 leading-relaxed max-w-md">
                    Your photo is used only to create this visualization and is never stored on our
                    servers.
                  </p>
                </div>
              </motion.div>
            ) : stage === "generating" ? (
              <motion.div
                key="generating"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="min-h-[62vh] flex flex-col items-center justify-center text-center"
              >
                <motion.p
                  animate={{ opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                  className="font-serif text-3xl sm:text-5xl tracking-[0.3em] text-black mb-10"
                >
                  RAEY
                </motion.p>

                <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 mb-10">
                  Creating Your RAEY Look
                </p>

                {/* A single hairline that fills as the stages advance. */}
                <div className="w-48 sm:w-64 h-px bg-black/10 mb-10 overflow-hidden">
                  <motion.div
                    className="h-full"
                    style={{ backgroundColor: GOLD }}
                    animate={{ width: `${((loadingStage + 1) / LOADING_STAGES.length) * 100}%` }}
                    transition={{ duration: 1.2, ease: "easeInOut" }}
                  />
                </div>

                  <motion.p
                    key={loadingStage}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="font-serif text-base sm:text-lg font-light text-gray-700"
                  >
                    {preparing ? "Preparing your photo" : LOADING_STAGES[loadingStage]}
                  </motion.p>

                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-14 text-[10px] uppercase tracking-[0.25em] text-gray-400 hover:text-black transition-colors"
                >
                  Cancel
                </button>
              </motion.div>
            ) : stage === "result" && result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="text-center mb-8">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 mb-2">
                    Your RAEY Look
                  </p>
                  <h3 className="font-serif text-2xl sm:text-3xl font-light text-black">
                    {dress.name}
                  </h3>
                </div>

                <div className="relative w-full max-w-lg mx-auto bg-white">
                  {/* Generated result is a data: URL — the optimizer cannot handle it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.image}
                    alt={`AI visualization of you wearing ${dress.name}`}
                    className="w-full h-auto object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                </div>

                <p className="text-center text-[10px] text-gray-400 mt-4 mb-10 tracking-wide">
                  AI visualization — actual fit, color and appearance may vary.
                </p>

                <div className="max-w-lg mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleTryAnotherDress}
                    className="py-4 border border-black/15 text-[11px] uppercase tracking-[0.2em] hover:border-black transition-colors duration-300"
                  >
                    Try Another Dress
                  </button>
                  <button
                    type="button"
                    onClick={handleTryAnotherPhoto}
                    className="py-4 border border-black/15 text-[11px] uppercase tracking-[0.2em] hover:border-black transition-colors duration-300"
                  >
                    Try Another Photo
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLook}
                    className="py-4 border border-black/15 text-[11px] uppercase tracking-[0.2em] hover:border-black transition-colors duration-300 flex items-center justify-center gap-2"
                  >
                    {saved ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                    {saved ? "Look Saved" : "Save Look"}
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="py-4 border border-black/15 text-[11px] uppercase tracking-[0.2em] hover:border-black transition-colors duration-300 flex items-center justify-center gap-2"
                  >
                    <Share2 className="h-3.5 w-3.5" /> Share
                  </button>
                </div>

                {(saveFailed || shareNote) && (
                  <p className="text-center text-[10px] text-gray-500 mt-4">
                    {saveFailed
                      ? "We couldn't save your look on this device — download it instead."
                      : shareNote}
                  </p>
                )}

                <div className="max-w-lg mx-auto mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      handleClose()
                      router.push(result.productUrl)
                    }}
                    className="w-full py-3 text-[11px] uppercase tracking-[0.2em] text-gray-500 hover:text-black transition-colors"
                  >
                    View Dress Details
                  </button>
                </div>

                {/* Conversion */}
                <div
                  className="max-w-lg mx-auto mt-12 pt-10 border-t text-center"
                  style={{ borderColor: "rgba(0,0,0,0.07)" }}
                >
                  <h4 className="font-serif text-xl sm:text-2xl font-light text-black mb-3">
                    Love the look?
                  </h4>
                  <p className="text-sm text-gray-600 leading-relaxed mb-7 max-w-sm mx-auto">
                    Book a private RAEY appointment and experience the gown in person.
                  </p>
                  <button
                    type="button"
                    onClick={handleBookAppointment}
                    className="w-full py-4 bg-black text-white text-[11px] uppercase tracking-[0.25em] hover:bg-gray-800 transition-colors duration-300"
                  >
                    Book Your Private Appointment
                  </button>
                </div>
              </motion.div>
            ) : stage === "error" && error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="min-h-[55vh] flex flex-col items-center justify-center text-center max-w-md mx-auto"
              >
                <div
                  className="h-12 w-12 rounded-full border flex items-center justify-center mb-7"
                  style={{ borderColor: "rgba(0,0,0,0.12)" }}
                >
                  <AlertCircle className="h-5 w-5 text-gray-400" />
                </div>

                <h3 className="font-serif text-xl sm:text-2xl font-light text-black mb-4">
                  We couldn&apos;t create your look
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-10">{error.message}</p>

                <div className="w-full space-y-3">
                  {error.retryable && photoFile && (
                    <button
                      type="button"
                      onClick={() => handleGenerate()}
                      className="w-full py-4 bg-black text-white text-[11px] uppercase tracking-[0.25em] hover:bg-gray-800 transition-colors duration-300"
                    >
                      Try Again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleTryAnotherPhoto}
                    className="w-full py-4 border border-black/15 text-[11px] uppercase tracking-[0.2em] hover:border-black transition-colors duration-300"
                  >
                    Choose Another Photo
                  </button>
                  <button
                    type="button"
                    onClick={handleBookAppointment}
                    className="w-full py-3 text-[11px] uppercase tracking-[0.2em] text-gray-500 hover:text-black transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="h-3 w-3" /> Book a private appointment instead
                  </button>
                </div>
              </motion.div>
            ) : null}
          </>
        </div>
      </motion.div>,
    document.body
  )
}
