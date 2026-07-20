"use client"

import React, { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  MessageCircle,
  Loader2,
  Send,
  KeyRound,
  Users,
  ShieldCheck,
  AlertTriangle,
  Trash2,
  Sparkles,
} from "lucide-react"
import * as XLSX from "xlsx"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"

interface SendResult {
  phone: string
  success: boolean
  error?: string
}

interface SendReport {
  summary: { total: number; invalid: number; sent: number; failed: number }
  results: SendResult[]
}

// Any column that looks like it holds a phone number
function extractPhoneColumn(row: Record<string, any>): string | null {
  const keys = Object.keys(row)
  const phoneKey = keys.find((k) => /phone|mobile|number|رقم|موبايل|هاتف/i.test(k))
  const key = phoneKey || keys[0]
  const val = row[key]
  return val !== undefined && val !== null && String(val).trim() !== "" ? String(val).trim() : null
}

export default function WhatsAppMarketingPage() {
  const router = useRouter()
  const { state: authState } = useAuth()
  const isAdmin = authState.user?.role === "admin"

  const [message, setMessage] = useState("")
  const [token, setToken] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [credsSaved, setCredsSaved] = useState(false)
  const [savingCreds, setSavingCreds] = useState(false)
  const [dataFile, setDataFile] = useState<File | null>(null)
  const [phones, setPhones] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [report, setReport] = useState<SendReport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authState.isLoading && (!authState.isAuthenticated || !isAdmin)) {
      router.push("/admin/dashboard")
    }
  }, [authState, isAdmin, router])

  const getAuthToken = () => authState.token || localStorage.getItem("token") || ""

  useEffect(() => {
    if (!isAdmin) return
    fetch("/api/whatsapp/credentials", {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    })
      .then((r) => r.json())
      .then((data) => setCredsSaved(!!data.hasToken && !!data.hasPhoneNumberId))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  const handleSaveCredentials = async () => {
    if (!token.trim() || !phoneNumberId.trim()) {
      toast.error("أدخل Token ورقم الهاتف (Phone Number ID) الخاصين بواتساب")
      return
    }
    setSavingCreds(true)
    try {
      const res = await fetch("/api/whatsapp/credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ token, phoneNumberId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "فشل حفظ البيانات")
        return
      }
      setCredsSaved(true)
      setToken("")
      setPhoneNumberId("")
      toast.success("تم حفظ بيانات واتساب بشكل آمن")
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء الحفظ")
    } finally {
      setSavingCreds(false)
    }
  }

  const handleClearCredentials = async () => {
    try {
      await fetch("/api/whatsapp/credentials", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      })
      setCredsSaved(false)
      toast.success("تم حذف بيانات واتساب المحفوظة")
    } catch {
      toast.error("فشل حذف البيانات")
    }
  }

  const handleFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: "array" })
      const wsName = wb.SheetNames[0]
      if (!wsName) throw new Error("لا توجد بيانات في الملف")
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { defval: "" }) as Record<string, any>[]
      const extracted = rows.map(extractPhoneColumn).filter((p): p is string => !!p)
      if (extracted.length === 0) throw new Error("لم يتم العثور على أرقام هواتف في الملف")
      setDataFile(file)
      setPhones(extracted)
      setError("")
      toast.success(`تم العثور على ${extracted.length} رقم`)
    } catch (err: any) {
      setError(err.message || "فشل قراءة الملف")
      toast.error(err.message || "فشل قراءة الملف")
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("اكتب نص الرسالة أولاً")
      return
    }
    if (phones.length === 0) {
      toast.error("ارفع ملف إكسيل يحتوي على أرقام العملاء")
      return
    }
    if (!credsSaved) {
      toast.error("احفظ Token ورقم الهاتف (Phone Number ID) الخاصين بواتساب أولاً")
      return
    }

    setLoading(true)
    setError("")
    setReport(null)

    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ message, phones }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "فشل إرسال الرسائل")
        toast.error(data.error || "فشل إرسال الرسائل")
        return
      }
      setReport(data)
      toast.success(`تم الإرسال إلى ${data.summary.sent} من ${data.summary.total}`)
    } catch (err: any) {
      setError(err.message || "حدث خطأ")
      toast.error(err.message || "حدث خطأ")
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setDataFile(null)
    setPhones([])
    setReport(null)
    setError("")
  }

  if (authState.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4" />
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  if (!authState.isAuthenticated || !isAdmin) return null

  const messageLen = message.length
  const readyToSend = phones.length > 0 && message.trim() && credsSaved

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <section className="py-14 sm:py-20">
        <div className="container mx-auto px-6 max-w-4xl">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-10">
            <Link href="/admin/dashboard" className="inline-flex items-center text-gray-500 hover:text-black transition-colors mb-6 text-sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> العودة للوحة التحكم
            </Link>
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-green-200 flex-shrink-0">
                <MessageCircle className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-light tracking-wide">تسويق واتساب</h1>
                <p className="text-gray-500 text-sm sm:text-base mt-0.5">
                  أرسل رسالة عن أحدث الفساتين أو العروض لقائمة عملاء من ملف إكسيل
                </p>
              </div>
            </div>
          </motion.div>

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

          {/* WhatsApp API credentials */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="mb-6 overflow-hidden">
              <CardHeader className="pb-3 bg-gray-50/80 border-b">
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  <KeyRound className="h-4.5 w-4.5" /> إعدادات واتساب (Meta API)
                  {credsSaved && (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 gap-1 font-normal">
                      <CheckCircle2 className="h-3 w-3" /> محفوظ بشكل آمن
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phoneNumberId" className="text-sm text-gray-600">Phone Number ID</Label>
                    <Input
                      id="phoneNumberId"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder={credsSaved ? "•••••••••••••• (محفوظ)" : "مثال: 102938475647382"}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="token" className="text-sm text-gray-600">Access Token</Label>
                    <Input
                      id="token"
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={credsSaved ? "•••••••••••••• (محفوظ)" : "ألصق الـ Token هنا"}
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 flex items-start gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  يتم تشفير البيانات وحفظها في كوكي آمن (httpOnly) على السيرفر، ولا يمكن لأي كود JavaScript الوصول إليها.
                </p>
                <div className="flex flex-wrap gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveCredentials}
                    disabled={savingCreds}
                    className="gap-2"
                  >
                    {savingCreds ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    {credsSaved ? "تحديث البيانات" : "حفظ البيانات"}
                  </Button>
                  {credsSaved && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClearCredentials}
                      className="gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" /> حذف البيانات المحفوظة
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Message */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4.5 w-4.5" /> نص الرسالة
                    </span>
                    <span className={`text-xs font-normal ${messageLen > 1000 ? "text-red-500" : "text-gray-400"}`}>
                      {messageLen} حرف
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="اكتب رسالتك هنا... مثال: عروض جديدة على أحدث الفساتين، زوروا متجرنا الآن!"
                    rows={7}
                    className="resize-none"
                  />
                </CardContent>
              </Card>
            </motion.div>

            {/* Excel upload */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileSpreadsheet className="h-4.5 w-4.5" /> ملف أرقام العملاء
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[calc(100%-3.5rem)]">
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnter={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className={`h-full min-h-[168px] border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all hover:border-black hover:bg-gray-50 flex items-center justify-center
                      ${dataFile ? "border-green-400 bg-green-50" : "border-gray-300"}`}
                  >
                    {dataFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-9 w-9 text-green-500" />
                        <p className="font-medium text-green-700 text-sm break-all px-2">{dataFile.name}</p>
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 gap-1 font-normal">
                          <Users className="h-3 w-3" /> {phones.length} رقم هاتف
                        </Badge>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleReset()
                          }}
                          className="text-xs text-red-500 hover:text-red-700 underline mt-1"
                        >
                          إزالة
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <FileSpreadsheet className="h-10 w-10 text-gray-400" />
                        <p className="font-medium text-gray-700 text-sm">اسحب ملف Excel/CSV هنا أو اضغط للاختيار</p>
                        <p className="text-xs text-gray-400">.xlsx, .xls, .csv — يحتوي على عمود أرقام الهواتف</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleFile(f)
                      e.target.value = ""
                    }}
                  />
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Send action */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 p-5 rounded-xl border bg-white"
          >
            <div className="text-sm text-gray-500">
              {readyToSend ? (
                <span className="flex items-center gap-1.5 text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> جاهز للإرسال إلى {phones.length} عميل
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  أكمل الخطوات: {!credsSaved && "إعدادات واتساب"} {!credsSaved && phones.length === 0 && "، "}
                  {phones.length === 0 && "ملف العملاء"} {(phones.length === 0 || !credsSaved) && !message.trim() && "، "}
                  {!message.trim() && "نص الرسالة"}
                </span>
              )}
            </div>
            <Button
              onClick={handleSend}
              disabled={loading || !readyToSend}
              className="bg-black text-white hover:bg-gray-800 gap-2 px-8 py-5 text-base w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> جاري الإرسال...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> إرسال إلى {phones.length} عميل
                </>
              )}
            </Button>
          </motion.div>

          {loading && (
            <div className="mb-8 -mt-4">
              <Progress value={undefined} className="h-1.5 animate-pulse" />
            </div>
          )}

          <AnimatePresence>
            {report && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardHeader className="pb-3 border-b bg-gray-50/80">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-4.5 w-4.5 text-green-600" /> تقرير الإرسال
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <Card className="bg-gray-50">
                        <CardContent className="pt-5 pb-4 text-center">
                          <p className="text-3xl font-bold">{report.summary.total}</p>
                          <p className="text-sm text-gray-500 mt-1">الإجمالي</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-green-50 border-green-200">
                        <CardContent className="pt-5 pb-4 text-center">
                          <p className="text-3xl font-bold text-green-700">{report.summary.sent}</p>
                          <p className="text-sm text-green-600 mt-1">تم الإرسال</p>
                        </CardContent>
                      </Card>
                      <Card className={`${report.summary.failed > 0 ? "bg-red-50 border-red-200" : "bg-gray-50"}`}>
                        <CardContent className="pt-5 pb-4 text-center">
                          <p className={`text-3xl font-bold ${report.summary.failed > 0 ? "text-red-700" : "text-gray-700"}`}>
                            {report.summary.failed}
                          </p>
                          <p className={`text-sm mt-1 ${report.summary.failed > 0 ? "text-red-600" : "text-gray-500"}`}>فشل</p>
                        </CardContent>
                      </Card>
                      <Card className={`${report.summary.invalid > 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50"}`}>
                        <CardContent className="pt-5 pb-4 text-center">
                          <p className={`text-3xl font-bold ${report.summary.invalid > 0 ? "text-amber-700" : "text-gray-700"}`}>
                            {report.summary.invalid}
                          </p>
                          <p className={`text-sm mt-1 ${report.summary.invalid > 0 ? "text-amber-600" : "text-gray-500"}`}>
                            أرقام غير صالحة
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {report.results.some((r) => !r.success) && (
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-red-50">
                              <th className="text-left p-3 font-medium text-red-700">الرقم</th>
                              <th className="text-left p-3 font-medium text-red-700">الحالة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.results
                              .filter((r) => !r.success)
                              .map((r, i) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="p-3 font-mono text-gray-600">{r.phone}</td>
                                  <td className="p-3 text-red-600 flex items-center gap-1">
                                    <XCircle className="h-3 w-3 flex-shrink-0" /> {r.error}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="flex justify-end mt-6">
                      <Button variant="outline" onClick={handleReset} className="gap-2">
                        <Upload className="h-4 w-4" /> إرسال حملة جديدة
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  )
}
