"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useLocale } from "@/lib/locale-context"
import { useTranslation } from "@/lib/translations"

export default function ForgotPasswordPage() {
  const { settings } = useLocale()
  const t = useTranslation(settings.language)
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage("")
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || t("somethingWentWrong"))
      } else {
        setMessage(data.message)
      }
    } catch (err) {
      setError(t("networkError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded shadow">
        <h1 className="text-2xl font-bold mb-4 text-center">{t("forgotPasswordTitle")}</h1>
        <p className="text-sm text-gray-600 mb-6 text-center">
          {t("forgotPasswordDesc")}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder={t("yourEmail")}
            className="w-full px-4 py-2 border border-gray-300 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-black text-white py-2 rounded hover:bg-gray-800 transition ${settings.language === "ar" ? "flex-row-reverse" : ""}`}
          >
            {loading ? t("sending") : t("sendResetLink")}
          </button>
        </form>

        {message && <p className="text-green-600 text-sm mt-4">{message}</p>}
        {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

        <div className="text-center mt-6">
          <Link href="/auth/login" className={`inline-flex items-center text-gray-600 hover:text-black mb-6 transition-colors ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
                        <ArrowLeft className={`h-4 w-4 ${settings.language === "ar" ? "ml-2 rotate-180" : "mr-2"}`} />
                        {t("backToLoginPage")}
                      </Link>
        </div>
      </div>
    </div>
  )
}
