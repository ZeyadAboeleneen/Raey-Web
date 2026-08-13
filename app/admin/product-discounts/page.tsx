"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Percent,
  Tag,
  Power,
  Search,
  X,
  Calendar,
  ShoppingBag,
  Repeat,
  Layers,
  Store,
  Sparkles,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth, usePermission } from "@/lib/auth-context"
import { type CachedProduct } from "@/lib/products-cache"
import { toast } from "sonner"

const COLLECTIONS = [
  { value: "", label: "All Categories" },
  { value: "wedding", label: "Wedding" },
  { value: "soiree", label: "Soiree" },
  { value: "fionka", label: "Fionka" },
]

const BRANCHES = [
  { value: "mona-saleh", label: "Hay El-Gamaa" },
  { value: "el-raey-1", label: "El Mashaya 1" },
  { value: "el-raey-2", label: "El Mashaya 2" },
  { value: "el-raey-the-yard", label: "The Yard Cairo" },
  { value: "hay-el-gamaa-2", label: "Main Branch" },
]

interface ProductDiscount {
  id: string
  name: string
  discountType: "fixed" | "percentage"
  discountValue: number
  /** Percentage discounts only — caps the EGP amount taken off a single unit. Null = uncapped. */
  maxDiscountAmount: number | null
  appliesTo: "buy" | "rent" | "both"
  branches: string[]
  productIds: string[]
  isActive: boolean
  validFrom: string | null
  validUntil: string | null
  createdAt: string
  updatedAt: string
}

const emptyForm = {
  name: "",
  discountType: "percentage" as "fixed" | "percentage",
  discountValue: "",
  maxDiscountAmount: "",
  appliesTo: "buy" as "buy" | "rent" | "both",
  collection: "",
  branches: [] as string[],
  validFrom: "",
  validUntil: "",
  isActive: true,
}

function toDateInputValue(iso: string | null) {
  if (!iso) return ""
  return iso.slice(0, 10)
}

function fmtEGP(n: number) {
  return `${n.toLocaleString("en-US")} EGP`
}

const APPLIES_TO_META = {
  buy: { label: "Buy only", icon: ShoppingBag },
  rent: { label: "Rent only", icon: Repeat },
  both: { label: "Buy & Rent", icon: Layers },
} as const

export default function ProductDiscountsPage() {
  const { state: authState } = useAuth()
  const canManage = usePermission("canManageDiscountCodes")

  // The shared site-wide product cache caps at 500 items (a deliberate storefront
  // perf tradeoff) — too small for a catalog of ~900+ products, so this page loads
  // its own complete, paginated copy rather than silently working off a partial list.
  const [products, setProducts] = useState<CachedProduct[]>([])
  const [productsLoading, setProductsLoading] = useState(true)

  const [discounts, setDiscounts] = useState<ProductDiscount[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())
  const [productSearch, setProductSearch] = useState("")
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [discountSearch, setDiscountSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ended">("all")

  const getAuthToken = () => authState.token || (typeof window !== "undefined" ? localStorage.getItem("token") : "") || ""

  const fetchDiscounts = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/product-discounts", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      })
      if (res.ok) {
        setDiscounts(await res.json())
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Failed to load discounts")
      }
    } catch {
      toast.error("Failed to load discounts")
    } finally {
      setLoading(false)
    }
  }

  const fetchAllProducts = async () => {
    setProductsLoading(true)
    try {
      const all: CachedProduct[] = []
      let page = 1
      let totalPages = 1
      do {
        const res = await fetch(`/api/items?page=${page}&limit=500`, { cache: "no-store" })
        if (!res.ok) break
        const batch = (await res.json()) as CachedProduct[]
        all.push(...batch)
        totalPages = parseInt(res.headers.get("X-Total-Pages") || "1", 10) || 1
        page += 1
      } while (page <= totalPages)
      setProducts(all)
    } catch {
      toast.error("Failed to load products")
    } finally {
      setProductsLoading(false)
    }
  }

  useEffect(() => {
    fetchDiscounts()
    fetchAllProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sellableProducts = useMemo(
    () => products.filter((p) => p.branch === "sell-dresses" || (p as any).sellPrice != null || (p as any).isSellable),
    [products],
  )

  const filteredForList = useMemo(() => {
    // Buy-only rules only make sense against sellable dresses; rent/both can target any product.
    const pool = form.appliesTo === "buy" ? (sellableProducts.length > 0 ? sellableProducts : products) : products
    return pool.filter((p) => {
      if (form.collection && (p.collection || "").toLowerCase() !== form.collection) return false
      if (form.branches.length > 0 && !form.branches.includes(p.branch)) return false
      return true
    })
  }, [sellableProducts, products, form.collection, form.branches, form.appliesTo])

  const productListToShow = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return filteredForList
    return filteredForList.filter((p) => p.name.toLowerCase().includes(q))
  }, [filteredForList, productSearch])

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const resetForm = () => {
    setForm(emptyForm)
    setSelectedProductIds(new Set())
    setProductSearch("")
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (d: ProductDiscount) => {
    // Category isn't stored on the rule itself (only branches/productIds are) — infer it
    // from the selected products so the filter doesn't silently reset on edit.
    const selectedProducts = d.productIds.map((id) => productNameById.get(id)).filter(Boolean) as CachedProduct[]
    const collections = new Set(selectedProducts.map((p) => (p.collection || "").toLowerCase()).filter(Boolean))
    const inferredCollection = collections.size === 1 ? Array.from(collections)[0] : ""

    setForm({
      name: d.name,
      discountType: d.discountType,
      discountValue: String(d.discountValue),
      maxDiscountAmount: d.maxDiscountAmount != null ? String(d.maxDiscountAmount) : "",
      appliesTo: d.appliesTo || "buy",
      collection: inferredCollection,
      branches: d.branches || [],
      validFrom: toDateInputValue(d.validFrom),
      validUntil: toDateInputValue(d.validUntil),
      isActive: d.isActive,
    })
    setSelectedProductIds(new Set(d.productIds))
    setEditingId(d.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Name is required")
    const value = Number(form.discountValue)
    if (!value || value <= 0) return toast.error("Enter a valid discount value")
    if (form.discountType === "percentage" && value > 100) return toast.error("Percentage cannot exceed 100")
    const maxAmount = form.maxDiscountAmount.trim() ? Number(form.maxDiscountAmount) : null
    if (maxAmount != null && (isNaN(maxAmount) || maxAmount < 0)) return toast.error("Enter a valid max discount amount")

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        discount_type: form.discountType,
        discount_value: value,
        max_discount_amount: form.discountType === "percentage" ? maxAmount : null,
        applies_to: form.appliesTo,
        branches: selectedProductIds.size === 0 ? form.branches : [],
        product_ids: Array.from(selectedProductIds),
        valid_from: form.validFrom || null,
        valid_until: form.validUntil || null,
        is_active: form.isActive,
      }

      const url = editingId ? `/api/product-discounts?id=${editingId}` : "/api/product-discounts"
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save discount")

      toast.success(editingId ? "Discount updated" : "Discount created")
      resetForm()
      fetchDiscounts()
    } catch (e: any) {
      toast.error(e.message || "Failed to save discount")
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (d: ProductDiscount) => {
    try {
      const res = await fetch(`/api/product-discounts?id=${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ is_active: !d.isActive }),
      })
      if (!res.ok) throw new Error("Failed to toggle discount")
      setDiscounts((prev) => prev.map((x) => (x.id === d.id ? { ...x, isActive: !x.isActive } : x)))
      toast.success(!d.isActive ? "Discount enabled" : "Discount ended")
    } catch {
      toast.error("Failed to toggle discount")
    }
  }

  const handleEndForProduct = async (d: ProductDiscount, productId: string) => {
    try {
      const res = await fetch(`/api/product-discounts?id=${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ remove_product_ids: [productId] }),
      })
      if (!res.ok) throw new Error("Failed to end discount for this product")
      const data = await res.json()
      setDiscounts((prev) => prev.map((x) => (x.id === d.id ? data.discount : x)))
      toast.success("Discount ended for this product")
    } catch {
      toast.error("Failed to end discount for this product")
    }
  }

  const handleEndForBranch = async (d: ProductDiscount, branch: string) => {
    try {
      const res = await fetch(`/api/product-discounts?id=${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ remove_branches: [branch] }),
      })
      if (!res.ok) throw new Error("Failed to end discount for this branch")
      const data = await res.json()
      setDiscounts((prev) => prev.map((x) => (x.id === d.id ? data.discount : x)))
      toast.success("Discount ended for this branch")
    } catch {
      toast.error("Failed to end discount for this branch")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this discount rule? This cannot be undone.")) return
    try {
      const res = await fetch(`/api/product-discounts?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      })
      if (!res.ok) throw new Error("Failed to delete discount")
      setDiscounts((prev) => prev.filter((x) => x.id !== id))
      toast.success("Discount deleted")
    } catch {
      toast.error("Failed to delete discount")
    }
  }

  const productNameById = useMemo(() => {
    const map = new Map<string, CachedProduct>()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  const visibleDiscounts = useMemo(() => {
    const q = discountSearch.trim().toLowerCase()
    return discounts.filter((d) => {
      if (statusFilter === "active" && !d.isActive) return false
      if (statusFilter === "ended" && d.isActive) return false
      if (q && !d.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [discounts, discountSearch, statusFilter])

  const activeCount = useMemo(() => discounts.filter((d) => d.isActive).length, [discounts])

  // Live "customer sees" example, using a representative 1,000 EGP item.
  const previewExample = useMemo(() => {
    const original = 1000
    const value = Number(form.discountValue) || 0
    if (value <= 0) return null
    if (form.discountType === "fixed") {
      return { original, final: Math.max(0, original - value) }
    }
    const pct = Math.min(100, Math.max(0, value))
    let amountOff = original * (pct / 100)
    const cap = form.maxDiscountAmount.trim() ? Number(form.maxDiscountAmount) : null
    if (cap != null && !isNaN(cap) && cap >= 0) amountOff = Math.min(amountOff, cap)
    return { original, final: Math.round(original - amountOff) }
  }, [form.discountType, form.discountValue, form.maxDiscountAmount])

  if (!canManage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <p className="text-gray-600">You don't have permission to manage product discounts.</p>
            <Link href="/admin/dashboard"><Button variant="outline">Back to Dashboard</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* ── Header ── */}
        <div className="mb-6 sm:mb-8">
          <Link href="/admin/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-3">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                <Percent className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Product Discounts</h1>
                <p className="text-sm text-gray-500">Automatic discounts on product cards — no code required.</p>
              </div>
            </div>
            {!showForm && (
              <Button onClick={() => setShowForm(true)} className="bg-black hover:bg-gray-800 rounded-full px-5 shadow-sm self-start sm:self-auto">
                <Plus className="h-4 w-4 mr-2" /> New Discount
              </Button>
            )}
          </div>
        </div>

        {/* ── Stat pills ── */}
        {!loading && discounts.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Total</p>
              <p className="text-xl font-semibold text-gray-900">{discounts.length}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Active</p>
              <p className="text-xl font-semibold text-emerald-600">{activeCount}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Ended</p>
              <p className="text-xl font-semibold text-gray-400">{discounts.length - activeCount}</p>
            </div>
          </div>
        )}

        {/* ── Form ── */}
        {showForm && (
          <Card className="mb-8 rounded-2xl border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-rose-50 to-pink-50 px-5 sm:px-6 py-4 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-rose-500" />
                <h2 className="text-base font-semibold text-gray-900">{editingId ? "Edit Discount" : "New Discount"}</h2>
              </div>
              <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-700 transition-colors" aria-label="Close form">
                <X className="h-4 w-4" />
              </button>
            </div>

            <CardContent className="p-5 sm:p-6 space-y-7">
              {/* Section: Basics */}
              <section>
                <SectionLabel icon={Tag} text="Basics" />
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Label>Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Summer Sale" className="mt-1" />
                  </div>
                  <div>
                    <Label>Discount Type</Label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <TypeToggle
                        active={form.discountType === "percentage"}
                        onClick={() => setForm({ ...form, discountType: "percentage" })}
                        label="Percentage"
                        sub="e.g. 20% off"
                      />
                      <TypeToggle
                        active={form.discountType === "fixed"}
                        onClick={() => setForm({ ...form, discountType: "fixed" })}
                        label="Fixed Amount"
                        sub="e.g. 500 EGP off"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Applies To</Label>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                      {(Object.keys(APPLIES_TO_META) as Array<keyof typeof APPLIES_TO_META>).map((key) => {
                        const meta = APPLIES_TO_META[key]
                        const Icon = meta.icon
                        const active = form.appliesTo === key
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setForm({ ...form, appliesTo: key })}
                            className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 px-1 text-[11px] font-medium transition-colors ${
                              active ? "bg-rose-50 border-rose-300 text-rose-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {meta.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </section>

              {/* Section: Discount amount */}
              <section>
                <SectionLabel icon={Percent} text="Discount Amount" />
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Value {form.discountType === "percentage" ? "(%)" : "(EGP)"}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={form.discountType === "percentage" ? 100 : undefined}
                      value={form.discountValue}
                      onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                      className="mt-1"
                      placeholder={form.discountType === "percentage" ? "e.g. 20" : "e.g. 500"}
                    />
                  </div>
                  {form.discountType === "percentage" ? (
                    <div>
                      <Label>Max Discount (EGP, optional)</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g. 2000 — caps the EGP taken off"
                        value={form.maxDiscountAmount}
                        onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  ) : (
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-600 pb-2.5">
                        <input
                          type="checkbox"
                          checked={form.isActive}
                          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                          className="h-4 w-4 accent-rose-600"
                        />
                        Active immediately
                      </label>
                    </div>
                  )}
                </div>

                {form.discountType === "percentage" && (
                  <label className="mt-3 flex items-center gap-2 text-sm cursor-pointer text-gray-600">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      className="h-4 w-4 accent-rose-600"
                    />
                    Active immediately
                  </label>
                )}

                {/* Live preview */}
                {previewExample && (
                  <div className="mt-4 flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                    <span className="text-xs text-gray-500 uppercase tracking-wide flex-shrink-0">Preview (1,000 EGP item)</span>
                    <span className="line-through text-gray-400 text-sm">{fmtEGP(previewExample.original)}</span>
                    <span className="text-red-600 font-semibold text-sm">{fmtEGP(previewExample.final)}</span>
                    {form.discountType === "percentage" && form.maxDiscountAmount.trim() && (
                      <span className="text-[11px] text-gray-400 ml-auto">capped at {fmtEGP(Number(form.maxDiscountAmount) || 0)}</span>
                    )}
                  </div>
                )}
              </section>

              {/* Section: Schedule */}
              <section>
                <SectionLabel icon={Calendar} text="Schedule (optional)" />
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className="mt-1" />
                  </div>
                </div>
              </section>

              {/* Section: Scope */}
              <section>
                <SectionLabel icon={Store} text="Scope" />
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Category</Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {COLLECTIONS.map((c) => {
                        const active = (form.collection || "") === c.value
                        return (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setForm({ ...form, collection: c.value })}
                            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                              active ? "bg-gray-900 border-gray-900 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            {c.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <Label>Branches <span className="text-gray-400 font-normal">(used only if no specific products selected)</span></Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {BRANCHES.map((b) => {
                        const checked = form.branches.includes(b.value)
                        return (
                          <button
                            key={b.value}
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                branches: checked ? f.branches.filter((x) => x !== b.value) : [...f.branches, b.value],
                              }))
                            }
                            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                              checked ? "bg-rose-50 border-rose-300 text-rose-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            {b.label}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">{form.branches.length === 0 ? "All branches" : `${form.branches.length} selected`}</p>
                  </div>
                </div>
              </section>

              {/* Section: Specific dresses */}
              <section className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <h3 className="text-sm font-medium text-gray-900">
                    Select specific dresses <span className="text-gray-400 font-normal">(optional — overrides category/branch above)</span>
                  </h3>
                  <div className="flex gap-3 text-xs">
                    <button type="button" className="text-rose-600 hover:text-rose-700 font-medium" onClick={() => setSelectedProductIds(new Set(filteredForList.map((p) => p.id)))}>
                      Select all ({filteredForList.length})
                    </button>
                    {selectedProductIds.size > 0 && (
                      <button type="button" className="text-gray-500 hover:text-gray-700 font-medium" onClick={() => setSelectedProductIds(new Set())}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input placeholder="Search by dress name…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pl-9 bg-white" />
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {productsLoading ? (
                    <div className="py-8 flex flex-col items-center gap-2 text-gray-400">
                      <div className="h-5 w-5 border-2 border-gray-300 border-t-rose-500 rounded-full animate-spin" />
                      <span className="text-sm">Loading products…</span>
                    </div>
                  ) : productListToShow.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-6">No products match.</p>
                  ) : (
                    productListToShow.map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer border transition-colors ${
                          selectedProductIds.has(p.id) ? "bg-rose-50 border-rose-200" : "border-transparent bg-white hover:bg-gray-50"
                        }`}
                      >
                        <input type="checkbox" checked={selectedProductIds.has(p.id)} onChange={() => toggleProduct(p.id)} className="h-4 w-4 accent-rose-600" />
                        <div className="relative h-10 w-8 rounded overflow-hidden flex-shrink-0 bg-gray-100">
                          {p.images?.[0] && <Image src={p.images[0]} alt={p.name} fill sizes="32px" className="object-cover" unoptimized />}
                        </div>
                        <span className="text-sm flex-1 truncate">{p.name}</span>
                      </label>
                    ))
                  )}
                </div>
                {selectedProductIds.size > 0 && (
                  <p className="text-xs text-gray-500 mt-2">{selectedProductIds.size} product(s) selected</p>
                )}
              </section>

              <div className="flex gap-3 pt-1">
                <Button onClick={handleSave} disabled={saving} className="bg-black hover:bg-gray-800 rounded-full px-6">
                  {saving ? "Saving…" : editingId ? "Update Discount" : "Create Discount"}
                </Button>
                <Button variant="outline" onClick={resetForm} disabled={saving} className="rounded-full px-6">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Discount list ── */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-900">Discounts</h2>
          {discounts.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  placeholder="Search discounts…"
                  value={discountSearch}
                  onChange={(e) => setDiscountSearch(e.target.value)}
                  className="pl-9 h-9 w-48 rounded-full bg-white"
                />
              </div>
              <div className="flex rounded-full border border-gray-200 bg-white p-0.5">
                {(["all", "active", "ended"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                      statusFilter === s ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-gray-100 bg-white h-24 animate-pulse" />
            ))}
          </div>
        ) : discounts.length === 0 ? (
          <Card className="rounded-2xl border-gray-100 border-dashed">
            <CardContent className="py-14 flex flex-col items-center text-center gap-3">
              <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center">
                <Percent className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <p className="text-gray-900 font-medium">No discounts yet</p>
                <p className="text-sm text-gray-500 mt-0.5">Create one to start showing sale prices on product cards.</p>
              </div>
              <Button onClick={() => setShowForm(true)} className="bg-black hover:bg-gray-800 rounded-full px-5 mt-1">
                <Plus className="h-4 w-4 mr-2" /> New Discount
              </Button>
            </CardContent>
          </Card>
        ) : visibleDiscounts.length === 0 ? (
          <Card className="rounded-2xl border-gray-100">
            <CardContent className="py-10 text-center text-sm text-gray-500">No discounts match your search.</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleDiscounts.map((d) => {
              const meta = APPLIES_TO_META[d.appliesTo] || APPLIES_TO_META.buy
              const AppliesIcon = meta.icon
              const previewProducts = d.productIds.slice(0, 4).map((id) => productNameById.get(id)).filter(Boolean) as CachedProduct[]

              return (
                <Card key={d.id} className={`rounded-2xl border shadow-sm overflow-hidden transition-opacity ${d.isActive ? "border-gray-100" : "border-gray-100 opacity-70"}`}>
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Value badge */}
                        <div
                          className={`flex-shrink-0 h-14 w-14 rounded-2xl flex flex-col items-center justify-center font-bold ${
                            d.isActive ? "bg-rose-50 text-rose-600" : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          <span className="text-sm leading-none">
                            {d.discountType === "percentage" ? `${d.discountValue}%` : fmtEGP(d.discountValue)}
                          </span>
                          <span className="text-[9px] font-medium uppercase tracking-wide mt-0.5 opacity-70">off</span>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900">{d.name}</span>
                            <StatusPill active={d.isActive} />
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            <Chip icon={AppliesIcon}>{meta.label}</Chip>
                            {d.discountType === "percentage" && d.maxDiscountAmount != null && (
                              <Chip>capped at {fmtEGP(d.maxDiscountAmount)}</Chip>
                            )}
                            <Chip icon={d.productIds.length > 0 ? Tag : Store}>
                              {d.productIds.length > 0
                                ? `${d.productIds.length} product${d.productIds.length === 1 ? "" : "s"}`
                                : d.branches.length > 0
                                  ? d.branches.map((b) => BRANCHES.find((x) => x.value === b)?.label || b).join(", ")
                                  : "All products"}
                            </Chip>
                            {(d.validFrom || d.validUntil) && (
                              <Chip icon={Calendar}>
                                {d.validFrom ? toDateInputValue(d.validFrom) : "…"} – {d.validUntil ? toDateInputValue(d.validUntil) : "…"}
                              </Chip>
                            )}
                          </div>

                          {previewProducts.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <div className="flex -space-x-2">
                                {previewProducts.map((p) => (
                                  <div key={p.id} className="relative h-6 w-6 rounded-full overflow-hidden border-2 border-white bg-gray-100 flex-shrink-0">
                                    {p.images?.[0] && <Image src={p.images[0]} alt={p.name} fill sizes="24px" className="object-cover" unoptimized />}
                                  </div>
                                ))}
                              </div>
                              <span className="text-xs text-gray-400 truncate">
                                {previewProducts.map((p) => p.name).join(", ")}
                                {d.productIds.length > previewProducts.length && ` +${d.productIds.length - previewProducts.length} more`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {(d.productIds.length > 0 || d.branches.length > 0) && (
                          <IconButton onClick={() => setExpandedId(expandedId === d.id ? null : d.id)} title="Manage individual items">
                            <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === d.id ? "rotate-180" : ""}`} />
                          </IconButton>
                        )}
                        <IconButton onClick={() => handleToggle(d)} title={d.isActive ? "End now" : "Reactivate"}>
                          <Power className={`h-4 w-4 ${d.isActive ? "text-emerald-600" : "text-gray-400"}`} />
                        </IconButton>
                        <IconButton onClick={() => startEdit(d)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton onClick={() => handleDelete(d.id)} title="Delete" danger>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </div>

                    {expandedId === d.id && (
                      <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                        {d.productIds.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1.5">End discount for a specific product:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {d.productIds.map((id) => (
                                <span key={id} className="flex items-center gap-1 text-xs bg-gray-100 rounded-full pl-2.5 pr-1 py-1">
                                  {productNameById.get(id)?.name || id}
                                  <button
                                    type="button"
                                    className="h-4 w-4 rounded-full bg-white hover:bg-red-100 text-red-600 flex items-center justify-center text-[10px] leading-none"
                                    onClick={() => handleEndForProduct(d, id)}
                                    title="End discount for this product"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {d.branches.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1.5">End discount for a specific branch:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {d.branches.map((b) => (
                                <span key={b} className="flex items-center gap-1 text-xs bg-gray-100 rounded-full pl-2.5 pr-1 py-1">
                                  {BRANCHES.find((x) => x.value === b)?.label || b}
                                  <button
                                    type="button"
                                    className="h-4 w-4 rounded-full bg-white hover:bg-red-100 text-red-600 flex items-center justify-center text-[10px] leading-none"
                                    onClick={() => handleEndForBranch(d, b)}
                                    title="End discount for this branch"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Small presentational helpers ──────────────────────────────────────────

function SectionLabel({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      <Icon className="h-3.5 w-3.5 text-rose-500" />
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{text}</h3>
    </div>
  )
}

function TypeToggle({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border px-3 py-2 transition-colors ${
        active ? "bg-rose-50 border-rose-300" : "border-gray-200 hover:bg-gray-50"
      }`}
    >
      <p className={`text-sm font-medium ${active ? "text-rose-700" : "text-gray-700"}`}>{label}</p>
      <p className="text-[11px] text-gray-400">{sub}</p>
    </button>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
        active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-gray-400"}`} />
      {active ? "Active" : "Ended"}
    </span>
  )
}

function Chip({ icon: Icon, children }: { icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5">
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  )
}

function IconButton({
  onClick,
  title,
  children,
  danger,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`h-8 w-8 rounded-full flex items-center justify-center border border-gray-200 transition-colors ${
        danger ? "text-gray-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  )
}
