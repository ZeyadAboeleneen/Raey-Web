"use client"

/**
 * components/stylist/StylistExperience.tsx
 *
 * The RAEY AI Stylist consultation.
 *
 * Three surfaces in one flow: an opening choice (chat vs. describe), the
 * consultation itself, and the conversion close. It is deliberately not a
 * bubble-per-turn chat log — the stylist's words sit as editorial text, and
 * product cards, chips and the closing block are first-class parts of the
 * transcript.
 *
 * Direction flips to RTL automatically when the shopper writes Arabic, without
 * touching the surrounding LTR page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { ArrowUp, MessageCircle, RotateCcw, Sparkles } from "lucide-react"
import StylistProductCard from "./StylistProductCard"
import { trackStylist } from "@/lib/ai/stylist/stylist-analytics"
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

const GOLD = "#B9975B"
const WHATSAPP_NUMBER = "201015847000"

type Mode = "intro" | "chat" | "describe"

/** Copy pairs. The stylist's own words come from the model; this is chrome. */
const COPY = {
  en: {
    viewDress: "View Dress",
    tryItOn: "Try It On",
    showSimilar: "Show Similar",
    notForMe: "Not for me",
    placeholder: "Tell me what you're imagining…",
    describePlaceholder: "I want something elegant, fitted and romantic with long sleeves…",
    send: "Send",
    startOver: "Start over",
    thinking: "RAEY is thinking",
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
    describePlaceholder: "عايزة فستان شيك وفِتد ورومانسي، بأكمام طويلة…",
    send: "إرسال",
    startOver: "من الأول",
    thinking: "RAEY بتفكر",
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

export default function StylistExperience() {
  const [mode, setMode] = useState<Mode>("intro")
  const [session, setSession] = useState<StylistSession>(emptySession)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<StylistRecommendation | null>(null)

  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const rtl = isRtlLanguage(session.language)
  const copy = rtl ? COPY.ar : COPY.en

  /* Restore an in-progress consultation on mount. */
  useEffect(() => {
    const restored = loadSession()
    if (restored.messages.length > 0) {
      setSession(restored)
      setMode("chat")
    }
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
    async (text: string, options: { similarToProductId?: string; rejectProductId?: string } = {}) => {
      const message = text.trim()
      if (!message || busy) return

      setBusy(true)
      setError(null)
      setInput("")

      const userMessage: StylistMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: message,
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
        mode: mode === "describe" ? "describe" : "chat",
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
            history: withUser.messages
              .slice(-12)
              .map((m) => ({ role: m.role, content: m.content })),
          }),
        })

        const data = await response.json().catch(() => null)

        if (!response.ok || !data?.message) {
          setError(data?.error || COPY.en.thinking)
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
        setError(
          rtl
            ? COPY.ar.thinking
            : "The RAEY Stylist isn't available right now. 🤍 Please try again in a moment."
        )
        setSession(withUser)
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [busy, session, mode, rtl]
  )

  function handleStartOver() {
    abortRef.current?.abort()
    clearSession()
    setSession(emptySession())
    setMode("intro")
    setInput("")
    setError(null)
  }

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

  /* ── Intro ──────────────────────────────────────────────────────── */

  if (mode === "intro") {
    return (
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-16 sm:py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 mb-5">
            RAEY AI Stylist
          </p>
          <h1 className="font-serif text-4xl sm:text-6xl font-light tracking-tight text-black mb-6">
            Find The One
          </h1>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-lg mx-auto mb-14">
            Tell us what you&apos;re looking for, and let RAEY help you discover the dress that
            feels like you.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left mb-10">
            <button
              type="button"
              onClick={() => {
                setMode("chat")
                setTimeout(() => inputRef.current?.focus(), 120)
              }}
              className="group border border-black/12 p-7 hover:border-black transition-colors duration-300"
            >
              <MessageCircle className="h-4 w-4 mb-4 text-gray-400 group-hover:text-black transition-colors" />
              <h2 className="text-[11px] uppercase tracking-[0.2em] mb-2">Chat with a stylist</h2>
              <p className="text-xs text-gray-500 leading-relaxed">Talk naturally with RAEY.</p>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("describe")
                setTimeout(() => inputRef.current?.focus(), 120)
              }}
              className="group border border-black/12 p-7 hover:border-black transition-colors duration-300"
            >
              <Sparkles className="h-4 w-4 mb-4" style={{ color: GOLD }} />
              <h2 className="text-[11px] uppercase tracking-[0.2em] mb-2">
                Describe your dream dress
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Tell RAEY exactly what you&apos;re imagining.
              </p>
            </button>
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            You don&apos;t need to know the fashion terms — English، عربي، or Franco.
          </p>
        </motion.div>
      </div>
    )
  }

  /* ── Consultation ───────────────────────────────────────────────── */

  const isEmpty = session.messages.length === 0

  return (
    <div className="flex flex-col min-h-[calc(100vh-80px)]" dir={rtl ? "rtl" : "ltr"}>
      <div className="flex-1 max-w-3xl w-full mx-auto px-5 sm:px-8 pt-10 pb-6">
        <div className="flex items-center justify-between mb-10" dir="ltr">
          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500">RAEY AI Stylist</p>
          {!isEmpty && (
            <button
              type="button"
              onClick={handleStartOver}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-gray-400 hover:text-black transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              {copy.startOver}
            </button>
          )}
        </div>

        {isEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-10"
          >
            <h2 className="font-serif text-2xl sm:text-3xl font-light text-black mb-4">
              {mode === "describe" ? "Describe your dream dress" : "Find the one 🤍"}
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-8 max-w-md">
              {mode === "describe"
                ? "You don't need to know the fashion terms. Just describe what you're imagining."
                : "Tell me what you're imagining. You don't need to know the fashion terms."}
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => send(example)}
                  dir="auto"
                  className="px-4 py-2 border border-black/12 text-xs text-gray-600 hover:border-black hover:text-black transition-colors duration-300"
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
                <p
                  dir="auto"
                  className="inline-block max-w-[85%] px-5 py-3 bg-black text-white text-sm leading-relaxed text-start"
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
                <p
                  dir="auto"
                  className="font-serif text-lg sm:text-xl font-light leading-relaxed text-black whitespace-pre-line max-w-2xl"
                >
                  {message.content}
                </p>

                {!!message.quickReplies?.length && (
                  <div className="mt-5 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
                    {message.quickReplies.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        dir="auto"
                        onClick={() => send(chip)}
                        className="flex-shrink-0 snap-start px-4 py-2 border border-black/12 text-xs text-gray-700 hover:border-black hover:text-black transition-colors duration-300 whitespace-nowrap"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                {!!message.recommendations?.length && (
                  <div className="mt-8">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 mb-5">
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
            <motion.p
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="text-[11px] uppercase tracking-[0.25em] text-gray-400"
            >
              {copy.thinking}
            </motion.p>
          )}

          {error && (
            <p dir="auto" className="text-sm text-gray-600 leading-relaxed border-s-2 border-black/15 ps-4">
              {error}
            </p>
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
              className="w-full sm:w-auto px-10 py-4 bg-black text-white text-[11px] uppercase tracking-[0.25em] hover:bg-gray-800 transition-colors duration-300"
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
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-end gap-3"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              rows={1}
              dir="auto"
              disabled={busy}
              placeholder={mode === "describe" ? copy.describePlaceholder : copy.placeholder}
              className="flex-1 resize-none bg-transparent text-sm leading-relaxed py-3 max-h-32 outline-none placeholder:text-gray-400 disabled:opacity-60"
              style={{ minHeight: "44px" }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label={copy.send}
              className="flex-shrink-0 h-11 w-11 rounded-full bg-black text-white flex items-center justify-center disabled:opacity-25 transition-opacity hover:bg-gray-800"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* "Not for me" reasons */}
      {rejecting && (
        <div
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          onClick={() => setRejecting(null)}
        >
          <div
            dir={rtl ? "rtl" : "ltr"}
            className="w-full max-w-sm bg-white p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-serif text-lg font-light mb-5">{copy.rejectTitle}</h4>
            <div className="space-y-2">
              {copy.rejectOptions.map((option, i) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleRejectReason(rejecting, COPY.en.rejectOptions[i])}
                  className="w-full py-3 px-4 text-start border border-black/12 text-xs hover:border-black transition-colors duration-300"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
