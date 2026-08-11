"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Plus, Trash2, Edit, Percent, Power } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Navigation } from "@/components/navigation"
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

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        discount_type: form.discountType,
        discount_value: value,
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
      <Navigation />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-2">
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Link>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Percent className="h-6 w-6" /> Product Discounts
            </h1>
            <p className="text-sm text-gray-500 mt-1">Automatic discounts shown directly on product cards for buy items. No code required.</p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Discount
            </Button>
          )}
        </div>

        {showForm && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg">{editingId ? "Edit Discount" : "New Discount"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Summer Sale" />
                </div>
                <div>
                  <Label>Discount Type</Label>
                  <Select value={form.discountType} onValueChange={(v: "fixed" | "percentage") => setForm({ ...form, discountType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Applies To</Label>
                  <Select value={form.appliesTo} onValueChange={(v: "buy" | "rent" | "both") => setForm({ ...form, appliesTo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy">Buy only</SelectItem>
                      <SelectItem value="rent">Rent only</SelectItem>
                      <SelectItem value="both">Buy &amp; Rent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Value {form.discountType === "percentage" ? "(%)" : "(EGP)"}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={form.discountType === "percentage" ? 100 : undefined}
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                  />
                </div>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      className="h-4 w-4"
                    />
                    Active
                  </label>
                </div>
                <div>
                  <Label>Start Date (optional)</Label>
                  <Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
                </div>
                <div>
                  <Label>End Date (optional)</Label>
                  <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={form.collection || "__all"} onValueChange={(v) => setForm({ ...form, collection: v === "__all" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLLECTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value || "__all"}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Branches (used only if no specific products selected)</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {BRANCHES.map((b) => {
                      const checked = form.branches.includes(b.value)
                      return (
                        <label
                          key={b.value}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                            checked ? "bg-rose-50 border-rose-200 text-rose-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setForm((f) => ({
                                ...f,
                                branches: checked ? f.branches.filter((x) => x !== b.value) : [...f.branches, b.value],
                              }))
                            }
                            className="h-3.5 w-3.5"
                          />
                          {b.label}
                        </label>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{form.branches.length === 0 ? "All branches" : `${form.branches.length} selected`}</p>
                </div>
              </div>

              <div className="border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-medium">
                    Select specific dresses <span className="text-gray-400 font-normal">(optional — leave empty to apply to all in the category/branch above)</span>
                  </h3>
                  <div className="flex gap-3 text-xs">
                    <button type="button" className="text-rose-600 underline" onClick={() => setSelectedProductIds(new Set(filteredForList.map((p) => p.id)))}>
                      Select all ({filteredForList.length})
                    </button>
                    {selectedProductIds.size > 0 && (
                      <button type="button" className="text-gray-500 underline" onClick={() => setSelectedProductIds(new Set())}>
                        Clear selection
                      </button>
                    )}
                  </div>
                </div>
                <Input placeholder="Search by dress name…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {productsLoading ? (
                    <p className="text-gray-400 text-sm text-center py-6">Loading products…</p>
                  ) : productListToShow.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-6">No products match.</p>
                  ) : (
                    productListToShow.map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border ${
                          selectedProductIds.has(p.id) ? "bg-rose-50 border-rose-200" : "border-transparent hover:bg-gray-50"
                        }`}
                      >
                        <input type="checkbox" checked={selectedProductIds.has(p.id)} onChange={() => toggleProduct(p.id)} className="h-4 w-4" />
                        <div className="relative h-10 w-8 rounded overflow-hidden flex-shrink-0 bg-gray-100">
                          {p.images?.[0] && <Image src={p.images[0]} alt={p.name} fill sizes="32px" className="object-cover" unoptimized />}
                        </div>
                        <span className="text-sm flex-1 truncate">{p.name}</span>
                      </label>
                    ))
                  )}
                </div>
                {selectedProductIds.size > 0 && (
                  <p className="text-xs text-gray-500">{selectedProductIds.size} product(s) selected</p>
                )}
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Update Discount" : "Create Discount"}
                </Button>
                <Button variant="outline" onClick={resetForm} disabled={saving}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Discounts ({discounts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
            ) : discounts.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">No discounts yet.</p>
            ) : (
              <div className="space-y-3">
                {discounts.map((d) => (
                  <div key={d.id} className="flex items-center justify-between border rounded-xl p-4 flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{d.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${d.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {d.isActive ? "Active" : "Ended"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {d.discountType === "percentage" ? `${d.discountValue}% off` : `${d.discountValue} EGP off`}
                        {" · "}
                        {d.appliesTo === "both" ? "Buy & Rent" : d.appliesTo === "rent" ? "Rent only" : "Buy only"}
                        {" · "}
                        {d.productIds.length > 0
                          ? `${d.productIds.length} specific product(s)`
                          : d.branches.length > 0
                            ? `Branches: ${d.branches.map((b) => BRANCHES.find((x) => x.value === b)?.label || b).join(", ")}`
                            : "All products"}
                        {(d.validFrom || d.validUntil) && (
                          <>
                            {" · "}
                            {d.validFrom ? toDateInputValue(d.validFrom) : "…"} – {d.validUntil ? toDateInputValue(d.validUntil) : "…"}
                          </>
                        )}
                      </p>
                      {d.productIds.length > 0 && d.productIds.length <= 5 && (
                        <p className="text-xs text-gray-400 mt-1">
                          {d.productIds.map((id) => productNameById.get(id)?.name || id).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {(d.productIds.length > 0 || d.branches.length > 0) && (
                        <Button size="sm" variant="outline" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                          {expandedId === d.id ? "Hide" : "Manage"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleToggle(d)}>
                        <Power className="h-3.5 w-3.5 mr-1.5" /> {d.isActive ? "End Now" : "Reactivate"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => startEdit(d)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => handleDelete(d.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {expandedId === d.id && (
                      <div className="w-full border-t pt-3 mt-1 space-y-3">
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
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
