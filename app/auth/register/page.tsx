"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Eye, EyeOff } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { useAuth } from "@/lib/auth-context"
import { useLocale } from "@/lib/locale-context"
import { useTranslation } from "@/lib/translations"

export default function RegisterPage() {
  const { settings } = useLocale()
  const t = useTranslation(settings.language)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const { register, state } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get("redirect")
  const redirectPath = redirectParam && redirectParam.startsWith("/") ? redirectParam : "/"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (formData.password !== formData.confirmPassword) {
      setError(t("passwordsDoNotMatch"))
      return
    }

    if (formData.password.length < 6) {
      setError(t("passwordTooShort"))
      return
    }

    const result = await register(formData.email, formData.password, formData.name)
    if (result.success) {
      // Redirect to provided path (defaults to home) after successful registration
      router.push(redirectPath)
    } else {
      // Show the actual error message from the API, or fallback to translation
      const errorMessage = result.error || t("emailAlreadyExists")
      setError(errorMessage === "User already exists" ? t("emailAlreadyExists") : errorMessage)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      <section className="pt-28 md:pt-24 pb-16">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-8"
          >
            <Link href="/" className={`inline-flex items-center text-gray-600 hover:text-black transition-colors ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
              <ArrowLeft className={`h-4 w-4 ${settings.language === "ar" ? "ml-2 rotate-180" : "mr-2"}`} />
              {t("backToHome")}
            </Link>
          </motion.div>

          <div className="max-w-md mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="text-center mb-8"
            >
              <h1 className="text-3xl font-light tracking-wider mb-2 pt-6">{t("joinTheAtelier")}</h1>
              <p className="text-gray-600">{t("createAccountDesc")}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <Card className="shadow-lg border-0">
                <CardHeader>
                  <CardTitle className="text-center text-xl font-light">{t("signUp")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                      <Alert className="border-red-200 bg-red-50">
                        <AlertDescription className="text-red-600">{error}</AlertDescription>
                      </Alert>
                    )}

                    <div>
                      <Label htmlFor="name" className="text-sm font-medium mb-2 block">
                        {t("fullName")}
                      </Label>
                      <Input
                        id="name"
                        name="name"
                        type="text"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder={t("yourFullName")}
                        required
                        className="border-gray-300 focus:border-black"
                      />
                    </div>

                    <div>
                      <Label htmlFor="email" className="text-sm font-medium mb-2 block">
                        {t("emailAddress")}
                      </Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder={t("yourEmail")}
                        required
                        className="border-gray-300 focus:border-black"
                      />
                    </div>

                    <div>
                      <Label htmlFor="password" className="text-sm font-medium mb-2 block">
                        {t("password")}
                      </Label>
                      <div className="relative">
                        <Input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          value={formData.password}
                          onChange={handleChange}
                          placeholder={t("createPassword")}
                          required
                          className={`border-gray-300 focus:border-black ${settings.language === "ar" ? "pl-10" : "pr-10"}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className={`absolute top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 ${settings.language === "ar" ? "left-3" : "right-3"}`}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="confirmPassword" className="text-sm font-medium mb-2 block">
                        {t("confirmPassword")}
                      </Label>
                      <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        placeholder={t("confirmPasswordPlaceholder")}
                        required
                        className="border-gray-300 focus:border-black"
                      />
                    </div>

                    <Button
                      type="submit"
                      size="lg"
                      className={`w-full bg-black text-white hover:bg-gray-800 ${settings.language === "ar" ? "flex-row-reverse" : ""}`}
                      disabled={state.isLoading}
                    >
                      {state.isLoading ? t("creatingAccount") : t("signUp")}
                    </Button>
                  </form>

                  <div className="mt-6 text-center">
                    <p className="text-sm text-gray-600">
                      {t("alreadyHaveAccount")}{" "}
                      <Link href="/auth/login" className="text-black hover:underline font-medium">
                        {t("signIn")}
                      </Link>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  )
}
