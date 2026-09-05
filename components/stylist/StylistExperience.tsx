"use client"

/**
 * components/stylist/StylistExperience.tsx
 *
 * The RAEY AI Stylist consultation.
 *
 * Two surfaces in one flow: the consultation itself, and the conversion
 * close. It is deliberately not a bubble-per-turn chat log — the stylist's
 * words sit as editorial text, and product cards, chips and the closing
 * block are first-class parts of the transcript.
 *
 * Direction flips to RTL automatically when the shopper writes Arabic, without
 * touching the surrounding LTR page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, ArrowUp, Heart, ImagePlus, RotateCcw, X } from "lucide-react"
import StylistProductCard from "./StylistProductCard"
import { trackStylist } from "@/lib/ai/stylist/stylist-analytics"
import {
  STYLIST_IMAGE_ACCEPT,
  imageFromTransfer,
  prepareInspirationImage,
  type PreparedImage,
} from "@/lib/stylist-image"
import {
  clearSession,
  emptySession,
  isRtlLanguage,
  loadSession,
  saveSession,
  type StylistMessage,
  type StylistRecommendation,
  type StylistSession,
} from "@/lib/stylist-session"

const WHATSAPP_NUMBER = "201015847000"
const GOLD = "#B9975B"

/** Small gold mark preceding the stylist's words — the same accent colour as
    the launcher, and the same heart the stylist's own copy already uses
    (🤍), so the reply visually traces back to who's speaking without a full
    avatar illustration at this size. */
function StylistMark() {
  return (
    <span
      aria-hidden
      className="flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center"
      style={{ backgroundColor: "rgba(185,151,91,0.12)" }}
    >
      <Heart className="h-3 w-3" style={{ color: GOLD }} strokeWidth={1.75} />
    </span>
  )
}

/** Copy pairs. The stylist's own words come from the model; this is chrome. */
const COPY = {
  en: {
    viewDress: "View Dress",
    tryItOn: "Try It On",
    showSimilar: "Show Similar",
    notForMe: "Not for me",
    placeholder: "Tell me what you're imagining…",
    send: "Send",
    startOver: "Start over",
    thinking: "RAEY is thinking",
    attach: "Send a photo of a dress you like",
    attached: "Photo attached",
    removePhoto: "Remove photo",
    reading: "Reading your photo",
    imageUnsupported: "That file type won't work — a JPG, PNG or WEBP photo, please. 🤍",
    imageTooLarge: "That photo is a little too large. Could you try a smaller one? 🤍",
    imageUnreadable: "I couldn't open that photo. Could you try another one? 🤍",
    genericError:
      "The RAEY Stylist isn't available right now. 🤍 Please try again in a moment.",
    foundTitle: "I think we found your RAEY looks 🤍",
    conversionTitle: "Found something you love? 🤍",
    conversionBody: "Talk to RAEY about your favourite, or book a private experience.",
    conversionCta: "Chat with RAEY on WhatsApp",
    rejectTitle: "What didn't work?",
    rejectOptions: [
      "Too simple",
      "Too dramatic",
      "Too much volume",
      "Don't like the neckline",
      "Don't like the details",
      "Not my style",
    ],
  },
  ar: {
    viewDress: "شوفي الفستان",
    tryItOn: "جربيه",
    showSimilar: "وريني شبهه",
    notForMe: "مش ليا",
    placeholder: "احكيلي عن اللي في بالك…",
    send: "إرسال",
    startOver: "من الأول",
    thinking: "RAEY بتفكر",
    attach: "ابعتيلي صورة فستان عاجبك",
    attached: "الصورة اتضافت",
    removePhoto: "شيلي الصورة",
    reading: "بشوف صورتك",
    imageUnsupported: "نوع الملف ده مش هينفع — ابعتي صورة JPG أو PNG أو WEBP 🤍",
    imageTooLarge: "الصورة كبيرة شوية. ممكن تجربي واحدة أصغر؟ 🤍",
    imageUnreadable: "مقدرتش أفتح الصورة دي. ممكن تجربي واحدة تانية؟ 🤍",
    genericError: "عذرًا، الـRAEY Stylist مش متاحة دلوقتي 🤍 ممكن تحاولي تاني بعد شوية.",
    foundTitle: "أعتقد لقينا الـRAEY look بتاعك 🤍",
    conversionTitle: "لقيتي حاجة عجبتك؟ 🤍",
    conversionBody: "كلمي RAEY عن اللي عجبك، أو احجزي تجربة خاصة.",
    conversionCta: "كلمي RAEY على واتساب",
    rejectTitle: "إيه اللي مش عاجبك؟",
    rejectOptions: [
      "بسيط أوي",
      "dramatic أوي",
      "منفوش أوي",
      "مش عاجبني الـneckline",
      "مش عاجبني التفاصيل",
      "مش ستايلي",
    ],
  },
}

/** Openers offered on the empty state, in both languages. */
const EXAMPLES = [
  "عايزة حاجة بسيطة ورومانسية",
  "I want something dramatic for an evening wedding",
  "عايزة mermaid بس مش tight أوي",
  "3ayza dress simple w classy",
]

/** Phrasing a rejection reason sends back as a normal refinement. */
const REJECT_PHRASES: Record<string, { en: string; ar: string }> = {
  "Too simple": { en: "Show me something less simple.", ar: "وريني حاجة أقل بساطة." },
  "Too dramatic": { en: "Show me something less dramatic.", ar: "وريني حاجة أقل dramatic." },
  "Too much volume": { en: "Less volume please.", ar: "من غير volume كتير." },
  "Don't like the neckline": { en: "I don't like that neckline.", ar: "مش عاجبني الـneckline ده." },
  "Don't like the details": { en: "I don't like those details.", ar: "مش عاجبني التفاصيل دي." },
  "Not my style": { en: "That's not my style.", ar: "ده مش ستايلي." },
}

interface StylistExperienceProps {
  /** Rendered inside the launcher's floating panel rather than a full page. */
  embedded?: boolean
  /** Only meaningful when embedded — closes the panel. */
  onClose?: () => void
}

export default function StylistExperience({ embedded = false, onClose }: StylistExperienceProps = {}) {
  const [session, setSession] = useState<StylistSession>(emptySession)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<StylistRecommendation | null>(null)
  const [attachment, setAttachment] = useState<PreparedImage | null>(null)
  const [preparing, setPreparing] = useState(false)

  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const rtl = isRtlLanguage(session.language)
  const copy = rtl ? COPY.ar : COPY.en

  /* Restore an in-progress consultation on mount. */
  useEffect(() => {
    const restored = loadSession()
    if (restored.messages.length > 0) setSession(restored)
    trackStylist("ai_stylist_opened")
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    if (session.messages.length > 0) saveSession(session)
  }, [session])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [session.messages.length, busy])

  const lastRecommendations = useMemo(() => {
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const recs = session.messages[i].recommendations
      if (recs && recs.length > 0) return recs
    }
    return []
  }, [session.messages])

  const send = useCallback(
    async (
      text: string,
      options: {
        similarToProductId?: string
        rejectProductId?: string
        /** Passed explicitly by the composer, so a quick reply never carries a
            photo she attached but hasn't sent yet. */
        image?: PreparedImage | null
      } = {}
    ) => {
      const image = options.image ?? null
      const typed = text.trim()
      if ((!typed && !image) || busy) return

      // A photo on its own is a complete request; give it words so the
      // transcript reads as a conversation rather than a bare thumbnail.
      const message = typed || (rtl ? "عايزة حاجة زي دي." : "I want something like this.")

      setBusy(true)
      setError(null)
      setInput("")
      if (image) setAttachment(null)

      const userMessage: StylistMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: message,
        image: image?.thumb,
        createdAt: Date.now(),
      }

      // Optimistic: her message appears immediately.
      const withUser: StylistSession = {
        ...session,
        messages: [...session.messages, userMessage],
      }
      setSession(withUser)

      trackStylist("ai_stylist_message_sent", {
        language: session.language,
        with_image: !!image,
      })

      const startedAt = Date.now()
      const controller = new AbortController()
      abortRef.current = controller

      // A rejected gown is recorded in the profile so it never returns.
      const preferences = options.rejectProductId
        ? {
            ...(session.preferences ?? {}),
            rejectedProductIds: [
              ...((session.preferences?.rejectedProductIds as string[]) ?? []),
              options.rejectProductId,
            ],
          }
        : session.preferences

      try {
        const response = await fetch("/api/ai/stylist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message,
            preferences,
            similarToProductId: options.similarToProductId ?? null,
            image: image ? { data: image.data, mimeType: image.mimeType } : null,
            history: withUser.messages
              .slice(-12)
              .map((m) => ({ role: m.role, content: m.content })),
          }),
        })

        const data = await response.json().catch(() => null)

        if (!response.ok || !data?.message) {
          // data.error only exists on a real failure response; a 200 with an
          // empty `message` (a rare model hiccup) has none, so fall back to a
          // real apology — never the "thinking" label, which would render as
          // a stuck loading state indistinguishable from no response at all.
          setError(data?.error || copy.genericError)
          setSession(withUser)
          return
        }

        // The model usually already asks its follow-up inside `message`; only
        // append it when it genuinely isn't there, or it reads twice.
        const question = String(data.followUpQuestion || "").trim()
        const body = String(data.message || "").trim()
        const alreadyAsked = question && body.includes(question)

        const assistantMessage: StylistMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: question && !alreadyAsked ? `${body}\n\n${question}` : body,
          recommendations: data.recommendations ?? [],
          quickReplies: data.quickReplies ?? [],
          createdAt: Date.now(),
        }

        setSession({
          messages: [...withUser.messages, assistantMessage],
          preferences: data.preferences,
          language: data.language || session.language,
          updatedAt: Date.now(),
        })

        if (data.recommendations?.length) {
          trackStylist("ai_dress_search", {
            result_count: data.recommendations.length,
            language: data.language,
            duration_ms: Date.now() - startedAt,
          })
          trackStylist("ai_recommendation_shown", {
            result_count: data.recommendations.length,
            language: data.language,
          })
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return
        setError(copy.genericError)
        setSession(withUser)
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [busy, session, rtl]
  )

  function handleStartOver() {
    abortRef.current?.abort()
    clearSession()
    setSession(emptySession())
    setInput("")
    setError(null)
    setAttachment(null)
  }

  /**
   * Accepts a photo from the picker, a paste, or a drop. Downscaling and
   * re-encoding happen here, before anything leaves the browser — see
   * `lib/stylist-image.ts`.
   */
  const attachPhoto = useCallback(
    async (file: File | null | undefined) => {
      if (!file || preparing) return
      setPreparing(true)
      setError(null)
      try {
        const result = await prepareInspirationImage(file)
        if (!result.ok) {
          setError(
            result.reason === "unsupported"
              ? copy.imageUnsupported
              : result.reason === "too-large"
                ? copy.imageTooLarge
                : copy.imageUnreadable
          )
          return
        }
        setAttachment(result.image)
        trackStylist("ai_stylist_image_attached")
        inputRef.current?.focus()
      } finally {
        setPreparing(false)
      }
    },
    [preparing, copy]
  )

  function handleWhatsApp(product?: StylistRecommendation) {
    trackStylist("ai_whatsapp_clicked", { product_id: product?.productId })
    const base = "مرحباً، كنت بستخدم RAEY AI Stylist"
    const message = product
      ? `${base}\n\nالفستان: ${product.name}\nرقم الموديل: ${product.productId}\n\nحابة أعرف تفاصيل أكتر 🤍`
      : `${base}\n\nحابة أحجز تجربة خاصة 🤍`
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  function handleShowSimilar(product: StylistRecommendation) {
    trackStylist("ai_similar_requested", {
      product_id: product.productId,
      collection: product.collection,
    })
    send(rtl ? "وريني حاجة شبه ده." : "Show me something similar to this one.", {
      similarToProductId: product.productId,
    })
  }

  function handleRejectReason(product: StylistRecommendation, reason: string) {
    trackStylist("ai_product_rejected", {
      product_id: product.productId,
      collection: product.collection,
      reason_code: reason.toLowerCase().replace(/[^a-z]+/g, "_"),
    })
    setRejecting(null)
    const phrase = REJECT_PHRASES[reason]
    send(phrase ? (rtl ? phrase.ar : phrase.en) : reason, { rejectProductId: product.productId })
  }

  const cardLabels = {
    viewDress: copy.viewDress,
    tryItOn: copy.tryItOn,
    showSimilar: copy.showSimilar,
    notForMe: copy.notForMe,
  }

  /* ── Consultation ───────────────────────────────────────────────── */

  const isEmpty = session.messages.length === 0

  return (
    <div
      className={embedded ? "relative flex flex-col h-full" : "flex flex-col min-h-[calc(100vh-80px)]"}
      dir={rtl ? "rtl" : "ltr"}
    >
      <div
        className={
          embedded
            ? "flex-1 min-h-0 overflow-y-auto w-full px-5 pt-6 pb-6"
            : "flex-1 max-w-3xl w-full mx-auto px-5 sm:px-8 pt-10 pb-6"
        }
      >
        <div
          className={
            embedded
              ? "flex items-center justify-between mb-6 pb-4 border-b border-black/[0.06]"
              : "flex items-center justify-between mb-10"
          }
          dir="ltr"
        >
          <div className="flex items-center gap-2">
            <StylistMark />
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500">RAEY AI Stylist</p>
          </div>
          <div className="flex items-center gap-1">
            {!isEmpty && (
              <button
                type="button"
                onClick={handleStartOver}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[10px] uppercase tracking-[0.18em] text-gray-400 hover:text-black hover:bg-black/5 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                {copy.startOver}
              </button>
            )}
            {embedded && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="h-7 w-7 flex items-center justify-center rounded-full text-gray-400 hover:text-black hover:bg-black/5 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {isEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-10"
          >
            <h2 className="font-serif text-2xl sm:text-3xl font-light text-black mb-4">
              Find the one 🤍
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-8 max-w-md">
              Tell me what you're imagining. You don't need to know the fashion terms.
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => send(example)}
                  dir="auto"
                  className="px-4 py-2.5 rounded-full border border-black/12 text-xs text-gray-600 hover:border-black hover:bg-black hover:text-white transition-all duration-300"
                >
                  {example}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Transcript */}
        <div className="space-y-10">
          {session.messages.map((message) =>
            message.role === "user" ? (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className={rtl ? "text-left" : "text-right"}
              >
                {message.image && (
                  <div className="mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={message.image}
                      alt=""
                      className="inline-block max-h-40 w-auto rounded-xl border border-black/10"
                    />
                  </div>
                )}
                <p
                  dir="auto"
                  className="inline-block max-w-[85%] px-5 py-3 rounded-2xl bg-black text-white text-sm leading-relaxed text-start"
                >
                  {message.content}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
              >
                <div className="flex items-start gap-2.5">
                  <StylistMark />
                  <p
                    dir="auto"
                    className="flex-1 min-w-0 font-serif text-lg sm:text-xl font-light leading-relaxed text-black whitespace-pre-line"
                  >
                    {message.content}
                  </p>
                </div>

                {!!message.quickReplies?.length && (
                  <div className="mt-5 ms-[34px] flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
                    {message.quickReplies.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        dir="auto"
                        onClick={() => send(chip)}
                        className="flex-shrink-0 snap-start px-4 py-2 rounded-full border border-black/12 text-xs text-gray-700 hover:border-black hover:bg-black hover:text-white transition-all duration-300 whitespace-nowrap"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                {!!message.recommendations?.length && (
                  <div className="mt-8">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 mb-5 ms-[34px]">
                      {copy.foundTitle}
                    </p>
                    <div className="flex gap-4 overflow-x-auto pb-3 -mx-5 px-5 sm:-mx-8 sm:px-8 snap-x snap-mandatory">
                      {message.recommendations.map((product) => (
                        <StylistProductCard
                          key={product.productId}
                          product={product}
                          rtl={rtl}
                          labels={cardLabels}
                          onShowSimilar={handleShowSimilar}
                          onReject={setRejecting}
                          onTryOn={(p) =>
                            trackStylist("ai_try_on_clicked", {
                              product_id: p.productId,
                              collection: p.collection,
                            })
                          }
                          onOpen={(p) =>
                            trackStylist("ai_recommendation_clicked", {
                              product_id: p.productId,
                              collection: p.collection,
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )
          )}

          {busy && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2.5"
              role="status"
              aria-label={copy.thinking}
            >
              <StylistMark />
              <span className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-black/30"
                    animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                  />
                ))}
              </span>
            </motion.div>
          )}

          {error && (
            <div
              dir="auto"
              className="flex items-start gap-2.5 ms-[34px] text-sm text-gray-700 leading-relaxed bg-black/[0.03] rounded-xl px-4 py-3"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-gray-400" strokeWidth={1.75} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Conversion close */}
        {lastRecommendations.length > 0 && !busy && (
          <div className="mt-16 pt-10 border-t" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
            <h3 className="font-serif text-xl sm:text-2xl font-light text-black mb-3">
              {copy.conversionTitle}
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-6 max-w-md">
              {copy.conversionBody}
            </p>
            <button
              type="button"
              onClick={() => handleWhatsApp(lastRecommendations[0])}
              className="w-full sm:w-auto px-10 py-4 rounded-full bg-black text-white text-[11px] uppercase tracking-[0.25em] hover:bg-gray-800 hover:scale-[1.02] active:scale-100 transition-all duration-300"
            >
              {copy.conversionCta}
            </button>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div
        className="sticky bottom-0 border-t backdrop-blur-sm"
        style={{ backgroundColor: "rgba(255,255,255,0.94)", borderColor: "rgba(0,0,0,0.07)" }}
      >
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4">
          {/* Attached photo, still removable until she sends it. */}
          {(attachment || preparing) && (
            <div className="mb-3 flex items-center gap-3">
              {attachment ? (
                <>
                  <span className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachment.thumb}
                      alt=""
                      className="h-14 w-14 object-cover rounded-xl border border-black/12"
                    />
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      aria-label={copy.removePhoto}
                      className="absolute -top-2 -end-2 h-5 w-5 rounded-full bg-black text-white flex items-center justify-center hover:bg-gray-700 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-gray-500">
                    {copy.attached}
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-gray-400">
                  <motion.span
                    className="h-3 w-3 rounded-full border-2 border-black/15 border-t-black/50"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  />
                  {copy.reading}…
                </span>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input, { image: attachment })
            }}
            className="flex items-end gap-2"
          >
            <input
              ref={fileRef}
              type="file"
              accept={STYLIST_IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                void attachPhoto(e.target.files?.[0])
                // Reset so picking the same file twice still fires a change.
                e.target.value = ""
              }}
            />

            {/* A visible, bordered field — not just text floating on the
                background — so it reads unmistakably as "type here", with a
                focus ring that follows the whole group including the attach
                button rather than just the textarea. */}
            <div className="flex-1 flex items-end gap-1 rounded-[26px] border border-black/15 bg-white pe-1.5 ps-1.5 py-1.5 transition-colors focus-within:border-black/40 focus-within:ring-4 focus-within:ring-black/[0.04]">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy || preparing}
                aria-label={copy.attach}
                title={copy.attach}
                className="flex-shrink-0 h-9 w-9 rounded-full text-gray-500 flex items-center justify-center hover:bg-black/5 hover:text-black disabled:opacity-30 transition-colors"
              >
                <ImagePlus className="h-4 w-4" />
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    send(input, { image: attachment })
                  }
                }}
                // Pasting a screenshot is how most people will actually send an
                // inspiration photo, so it goes through the same path as the picker.
                onPaste={(e) => {
                  const file = imageFromTransfer(e.clipboardData)
                  if (file) {
                    e.preventDefault()
                    void attachPhoto(file)
                  }
                }}
                onDrop={(e) => {
                  const file = imageFromTransfer(e.dataTransfer)
                  if (file) {
                    e.preventDefault()
                    void attachPhoto(file)
                  }
                }}
                rows={1}
                dir="auto"
                disabled={busy}
                placeholder={copy.placeholder}
                className="flex-1 resize-none bg-transparent text-sm leading-relaxed py-2 max-h-32 outline-none placeholder:text-gray-400 disabled:opacity-60"
                style={{ minHeight: "36px" }}
              />
            </div>

            <button
              type="submit"
              disabled={busy || (!input.trim() && !attachment)}
              aria-label={copy.send}
              className="flex-shrink-0 h-11 w-11 rounded-full bg-black text-white flex items-center justify-center disabled:opacity-25 transition-all hover:bg-gray-800 hover:scale-105 active:scale-95"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* "Not for me" reasons */}
      <AnimatePresence>
        {rejecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={
              embedded
                ? "absolute inset-0 z-[90] flex items-end justify-center p-4"
                : "fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4"
            }
            style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
            onClick={() => setRejecting(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              dir={rtl ? "rtl" : "ltr"}
              className="w-full max-w-sm bg-white rounded-2xl p-7 shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="font-serif text-lg font-light mb-5">{copy.rejectTitle}</h4>
              <div className="space-y-2">
                {copy.rejectOptions.map((option, i) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleRejectReason(rejecting, COPY.en.rejectOptions[i])}
                    className="w-full py-3 px-4 rounded-xl text-start border border-black/12 text-xs hover:border-black hover:bg-black/[0.02] transition-colors duration-300"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
