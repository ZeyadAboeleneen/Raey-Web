"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import Image from "next/image"
import { useProductsCache, type CachedProduct } from "@/lib/products-cache"

// ── Constants ─────────────────────────────────────────────────────────────────

const INTERVAL_MS = 3000

const COLLECTIONS = [
  { value: "", label: "All Categories" },
  { value: "wedding", label: "Wedding" },
  { value: "soiree", label: "Soiree" },
  { value: "fionka", label: "Fionka" },
]

const BRANCHES = [
  { value: "", label: "All Branches" },
  { value: "mona-saleh", label: "Hay El-Gamaa" },
  { value: "el-raey-1", label: "El Mashaya 1" },
  { value: "el-raey-2", label: "El Mashaya 2" },
  { value: "el-raey-the-yard", label: "The Yard Cairo" },
  { value: "hay-el-gamaa-2", label: "Main Branch" },
]

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlideshowImage {
  url: string
  dressName: string
  dressId: string
  collection: string
  branch: string
}

// ── Control Panel ─────────────────────────────────────────────────────────────

function ControlPanel({
  products,
  onStart,
}: {
  products: CachedProduct[]
  onStart: (images: SlideshowImage[]) => void
}) {
  const [selectedCollection, setSelectedCollection] = useState("")
  const [selectedBranch, setSelectedBranch] = useState("")
  const [selectedDressIds, setSelectedDressIds] = useState<Set<string>>(new Set())
  const [dressSearch, setDressSearch] = useState("")
  const [error, setError] = useState("")

  // Candidate products after collection + branch filters (used to populate dress list)
  const filteredForList = useMemo(() => {
    return products.filter((p) => {
      if (selectedCollection && (p.collection || "").toLowerCase() !== selectedCollection) return false
      if (selectedBranch && p.branch !== selectedBranch) return false
      return p.images && p.images.length > 0
    })
  }, [products, selectedCollection, selectedBranch])

  // Dress list filtered by search input
  const dressListToShow = useMemo(() => {
    const q = dressSearch.trim().toLowerCase()
    if (!q) return filteredForList
    return filteredForList.filter((p) => p.name.toLowerCase().includes(q))
  }, [filteredForList, dressSearch])

  const toggleDress = (id: string) => {
    setSelectedDressIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedDressIds(new Set(filteredForList.map((p) => p.id)))
  const clearAll = () => setSelectedDressIds(new Set())

  // When collection or branch changes, clear specific dress selections
  const prevCollection = useRef(selectedCollection)
  const prevBranch = useRef(selectedBranch)
  useEffect(() => {
    if (prevCollection.current !== selectedCollection || prevBranch.current !== selectedBranch) {
      setSelectedDressIds(new Set())
      prevCollection.current = selectedCollection
      prevBranch.current = selectedBranch
    }
  }, [selectedCollection, selectedBranch])

  const handleStart = () => {
    setError("")

    // Determine which products to include
    let pool: CachedProduct[]

    if (selectedDressIds.size > 0) {
      // Specific dresses selected — use those (still respect collection/branch already implicit)
      pool = products.filter((p) => selectedDressIds.has(p.id) && p.images && p.images.length > 0)
    } else {
      // No specific dresses → all that match collection/branch filters
      pool = products.filter((p) => {
        if (selectedCollection && (p.collection || "").toLowerCase() !== selectedCollection) return false
        if (selectedBranch && p.branch !== selectedBranch) return false
        return p.images && p.images.length > 0
      })
    }

    if (pool.length === 0) {
      setError("No images found for the selected filters. Please adjust your selection.")
      return
    }

    // Build image list (one entry per image per dress)
    const images: SlideshowImage[] = pool.flatMap((p) =>
      (p.images || []).map((url) => ({
        url,
        dressName: p.name,
        dressId: p.id,
        collection: p.collection || "",
        branch: p.branch || "",
      }))
    )

    onStart(shuffle(images))
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-rose-500" />
            <span className="text-rose-400 text-xs tracking-[0.3em] uppercase font-medium">Raey Atelier</span>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-rose-500" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-light text-white tracking-wider mb-3" style={{ fontFamily: "var(--font-playfair-display, 'Playfair Display', serif)" }}>
            Slideshow
          </h1>
          <p className="text-gray-400 text-sm tracking-wide">
            Configure which dresses to display, then start the presentation.
          </p>
        </div>

        <div className="space-y-6">
          {/* ── Filters ── */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm space-y-5">
            <h2 className="text-white/80 text-xs tracking-[0.25em] uppercase font-medium">Filter Images</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Category */}
              <div>
                <label className="block text-gray-400 text-xs mb-2 tracking-wide uppercase">Category</label>
                <select
                  id="slideshow-category-select"
                  value={selectedCollection}
                  onChange={(e) => setSelectedCollection(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-rose-500 transition-colors appearance-none cursor-pointer"
                >
                  {COLLECTIONS.map((c) => (
                    <option key={c.value} value={c.value} className="bg-[#1a1a24]">
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch */}
              <div>
                <label className="block text-gray-400 text-xs mb-2 tracking-wide uppercase">Branch</label>
                <select
                  id="slideshow-branch-select"
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-rose-500 transition-colors appearance-none cursor-pointer"
                >
                  {BRANCHES.map((b) => (
                    <option key={b.value} value={b.value} className="bg-[#1a1a24]">
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dress count indicator */}
            <p className="text-gray-500 text-xs">
              {filteredForList.length === 0
                ? "No dresses with images match the current filters."
                : `${filteredForList.length} dress${filteredForList.length !== 1 ? "es" : ""} with images match the current filters.`}
            </p>
          </div>

          {/* ── Specific Dress Selection ── */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white/80 text-xs tracking-[0.25em] uppercase font-medium">
                Select Specific Dresses
                <span className="ml-2 text-gray-500 normal-case tracking-normal font-normal">
                  (optional — leave empty to use all filtered dresses)
                </span>
              </h2>
            </div>

            {/* Search within list */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                id="slideshow-dress-search"
                type="text"
                placeholder="Search by dress name…"
                value={dressSearch}
                onChange={(e) => setDressSearch(e.target.value)}
                className="w-full bg-black/40 border border-white/15 text-white text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-rose-500 transition-colors placeholder:text-gray-600"
              />
            </div>

            {/* Select / Clear All */}
            {filteredForList.length > 0 && (
              <div className="flex gap-3">
                <button
                  id="slideshow-select-all-btn"
                  onClick={selectAll}
                  className="text-xs text-rose-400 hover:text-rose-300 transition-colors underline underline-offset-2"
                >
                  Select all ({filteredForList.length})
                </button>
                {selectedDressIds.size > 0 && (
                  <button
                    id="slideshow-clear-all-btn"
                    onClick={clearAll}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
                  >
                    Clear selection
                  </button>
                )}
                {selectedDressIds.size > 0 && (
                  <span className="text-xs text-white/60 ml-auto">
                    {selectedDressIds.size} selected
                  </span>
                )}
              </div>
            )}

            {/* Dress list */}
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
              {dressListToShow.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-6">
                  {dressSearch ? "No dresses match your search." : "No dresses available."}
                </p>
              ) : (
                dressListToShow.map((p) => (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                      selectedDressIds.has(p.id)
                        ? "bg-rose-500/15 border border-rose-500/30"
                        : "hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDressIds.has(p.id)}
                      onChange={() => toggleDress(p.id)}
                      className="accent-rose-500 w-4 h-4 rounded flex-shrink-0"
                    />
                    {/* Thumbnail */}
                    <div className="relative h-10 w-8 rounded overflow-hidden flex-shrink-0 bg-white/5">
                      {p.images?.[0] && (
                        <Image
                          src={p.images[0]}
                          alt={p.name}
                          fill
                          sizes="32px"
                          className="object-cover"
                          unoptimized
                        />
                      )}
                    </div>
                    <span className="text-white/80 text-sm truncate flex-1">{p.name}</span>
                    <span className="text-gray-600 text-xs flex-shrink-0">
                      {p.images?.length ?? 0} img{(p.images?.length ?? 0) !== 1 ? "s" : ""}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* ── Start Button ── */}
          <button
            id="slideshow-start-btn"
            onClick={handleStart}
            className="w-full py-4 rounded-2xl text-white font-medium tracking-wider text-sm uppercase transition-all duration-300 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 shadow-[0_0_30px_rgba(244,63,94,0.3)] hover:shadow-[0_0_40px_rgba(244,63,94,0.5)] active:scale-[0.98]"
          >
            Start Slideshow
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Slideshow View ─────────────────────────────────────────────────────────────

function SlideshowView({
  images,
  onBack,
}: {
  images: SlideshowImage[]
  onBack: () => void
}) {
  const [index, setIndex] = useState(0)
  const [deck, setDeck] = useState<SlideshowImage[]>(images)
  const [paused, setPaused] = useState(false)
  const [showUI, setShowUI] = useState(false)
  const uiTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const current = deck[index]

  // Auto-advance
  useEffect(() => {
    if (paused) return
    intervalRef.current = setInterval(() => {
      setIndex((prev) => {
        const next = prev + 1
        if (next >= deck.length) {
          // Reshuffle for a fresh loop
          setDeck((d) => shuffle(d))
          return 0
        }
        return next
      })
    }, INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [paused, deck])

  // Mouse / touch movement → show UI temporarily
  const revealUI = useCallback(() => {
    setShowUI(true)
    if (uiTimer.current) clearTimeout(uiTimer.current)
    uiTimer.current = setTimeout(() => setShowUI(false), 2500)
  }, [])

  useEffect(() => () => { if (uiTimer.current) clearTimeout(uiTimer.current) }, [])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack()
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        setIndex((prev) => {
          const next = prev + 1
          if (next >= deck.length) { setDeck((d) => shuffle(d)); return 0 }
          return next
        })
      }
      if (e.key === "ArrowLeft") {
        setIndex((prev) => Math.max(0, prev - 1))
      }
      if (e.key === "p" || e.key === "P") setPaused((v) => !v)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [deck, onBack])

  const goNext = () => {
    setIndex((prev) => {
      const next = prev + 1
      if (next >= deck.length) { setDeck((d) => shuffle(d)); return 0 }
      return next
    })
  }

  const goPrev = () => setIndex((prev) => Math.max(0, prev - 1))

  return (
    <div
      className="fixed inset-0 bg-black z-50 overflow-hidden select-none"
      onMouseMove={revealUI}
      onTouchStart={revealUI}
    >
      {/* ── Image ── */}
      <AnimatePresence mode="sync">
        <motion.div
          key={current.url + index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <Image
            src={current.url}
            alt={current.dressName}
            fill
            sizes="100vw"
            className="object-contain"
            priority
            unoptimized
          />
          {/* Very subtle vignette */}
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.5)_100%)]" />
        </motion.div>
      </AnimatePresence>

      {/* ── Dress name overlay (bottom) ── */}
      <AnimatePresence>
        {showUI && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
            className="absolute bottom-0 inset-x-0 pointer-events-none"
          >
            <div className="bg-gradient-to-t from-black/80 via-black/30 to-transparent px-8 py-8 pt-16">
              <p className="text-white/90 text-lg sm:text-2xl font-light tracking-widest text-center" style={{ fontFamily: "var(--font-playfair-display, 'Playfair Display', serif)" }}>
                {current.dressName}
              </p>
              <p className="text-white/40 text-xs text-center mt-1 tracking-[0.2em] uppercase">
                {BRANCHES.find(b => b.value === current.branch)?.label || current.branch || ""}
                {current.collection ? ` · ${current.collection.charAt(0).toUpperCase() + current.collection.slice(1)}` : ""}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top controls ── */}
      <AnimatePresence>
        {showUI && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="absolute top-0 inset-x-0 pointer-events-auto"
          >
            <div className="bg-gradient-to-b from-black/70 to-transparent px-6 py-5 flex items-center justify-between">
              {/* Back button */}
              <button
                id="slideshow-back-btn"
                onClick={onBack}
                className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm tracking-wide group"
              >
                <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Controls
              </button>

              {/* Counter */}
              <span className="text-white/40 text-xs tracking-widest">
                {index + 1} / {deck.length}
              </span>

              {/* Pause / Resume */}
              <button
                id="slideshow-pause-btn"
                onClick={() => setPaused((v) => !v)}
                className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm tracking-wide"
              >
                {paused ? (
                  <>
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Resume
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                    Pause
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Arrow navigation (sides) ── */}
      <AnimatePresence>
        {showUI && (
          <>
            <motion.button
              id="slideshow-prev-btn"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3 }}
              onClick={goPrev}
              disabled={index === 0}
              className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-black/50 border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </motion.button>

            <motion.button
              id="slideshow-next-btn"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.3 }}
              onClick={goNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-black/50 border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </motion.button>
          </>
        )}
      </AnimatePresence>

      {/* ── Progress bar ── */}
      <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white/10">
        <motion.div
          key={index}
          className="h-full bg-rose-500/70"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: INTERVAL_MS / 1000, ease: "linear" }}
        />
      </div>
    </div>
  )
}

// ── Loading screen ─────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-6">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-2 border-white/10 border-t-rose-500 animate-spin" />
      </div>
      <p className="text-white/40 text-sm tracking-[0.25em] uppercase">Loading dresses…</p>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function SlideshowPage() {
  const { products, loading } = useProductsCache()
  const [slideshowImages, setSlideshowImages] = useState<SlideshowImage[] | null>(null)

  if (loading && products.length === 0) return <LoadingScreen />

  if (slideshowImages) {
    return (
      <SlideshowView
        images={slideshowImages}
        onBack={() => setSlideshowImages(null)}
      />
    )
  }

  return (
    <ControlPanel
      products={products}
      onStart={(imgs) => setSlideshowImages(imgs)}
    />
  )
}
