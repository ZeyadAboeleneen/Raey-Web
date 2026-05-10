"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, Edit2, Trash2, Shield, AlertTriangle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

type Employee = any // Will use proper type later if needed, but 'any' is fine for rapid UI.

const DEFAULT_EMPLOYEE = {
  fullName: "",
  email: "",
  username: "",
  password: "",
  phone: "",
  role: "staff",
  isActive: true,
  canAddProducts: false,
  canEditProducts: false,
  canDeleteProducts: false,
  canViewProducts: true,
  canViewOrders: false,
  canUpdateOrders: false,
  canDeleteOrders: false,
  canViewPricesInDashboard: false,
  canViewPricesOnWebsite: false,
  canManageDiscountCodes: false,
  canManageOffers: false,
}

export function EmployeeManagement() {
  const { state: authState } = useAuth()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [formData, setFormData] = useState<any>(DEFAULT_EMPLOYEE)
  const [saving, setSaving] = useState(false)

  const fetchEmployees = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/employees", {
        headers: {
          Authorization: `Bearer ${authState.token || localStorage.getItem("token")}`,
        },
      })
      if (!res.ok) throw new Error("Failed to fetch employees")
      const data = await res.json()
      setEmployees(data.employees || [])
    } catch (err: any) {
      toast.error(err.message || "Failed to load employees")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmployees()
  }, [])

  const handleOpenDialog = (employee?: Employee) => {
    if (employee) {
      setSelectedEmployee(employee)
      setFormData({ ...employee, password: "" }) // Password blank on edit
    } else {
      setSelectedEmployee(null)
      setFormData(DEFAULT_EMPLOYEE)
    }
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.fullName || !formData.email || !formData.username) {
      toast.error("Please fill in all required fields")
      return
    }
    if (!selectedEmployee && !formData.password) {
      toast.error("Password is required for new employees")
      return
    }

    try {
      setSaving(true)
      const url = selectedEmployee ? `/api/employees/${selectedEmployee.id}` : "/api/employees"
      const method = selectedEmployee ? "PUT" : "POST"

      const payload = { ...formData }
      if (!payload.password) delete payload.password // Don't send empty password on edit

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authState.token || localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save employee")

      toast.success(selectedEmployee ? "Employee updated" : "Employee created")
      setDialogOpen(false)
      fetchEmployees()
    } catch (err: any) {
      toast.error(err.message || "An error occurred")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedEmployee) return
    try {
      setSaving(true)
      const res = await fetch(`/api/employees/${selectedEmployee.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authState.token || localStorage.getItem("token")}`,
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to delete employee")

      toast.success("Employee deleted")
      setDeleteDialogOpen(false)
      fetchEmployees()
    } catch (err: any) {
      toast.error(err.message || "An error occurred")
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (employee: Employee, isActive: boolean) => {
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authState.token || localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to update status")
      }
      toast.success(`Employee ${isActive ? "activated" : "deactivated"}`)
      fetchEmployees()
    } catch (err: any) {
      toast.error(err.message || "An error occurred")
    }
  }

  const PermissionToggle = ({ field, label }: { field: string, label: string }) => (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <Label htmlFor={field} className="text-sm font-normal text-gray-700 cursor-pointer">{label}</Label>
      <Switch
        id={field}
        checked={formData[field]}
        onCheckedChange={(checked) => setFormData({ ...formData, [field]: checked })}
        disabled={formData.role === "admin"}
      />
    </div>
  )

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Employee Accounts</h2>
          <p className="text-sm text-gray-500 mt-1">Configure dashboard access levels and permissions</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="bg-black text-white hover:bg-gray-800 rounded-xl px-6">
          <Plus className="mr-2 h-4 w-4" /> Add Employee
        </Button>
      </div>

      <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow className="hover:bg-transparent border-0">
              <TableHead className="py-4 font-medium text-gray-600">Employee Details</TableHead>
              <TableHead className="py-4 font-medium text-gray-600">Role</TableHead>
              <TableHead className="py-4 font-medium text-gray-600">Access</TableHead>
              <TableHead className="py-4 text-right font-medium text-gray-600 pr-6">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <Shield className="h-8 w-8 opacity-20" />
                    <p className="text-sm">No employee accounts found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              employees.map((emp) => (
                <TableRow key={emp.id} className="group hover:bg-gray-50/50 transition-colors border-gray-50">
                  <TableCell className="py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-gray-900">{emp.fullName}</span>
                      <span className="text-xs text-gray-500">{emp.email} • <span className="font-mono">{emp.username}</span></span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge variant="outline" className={cn(
                      "capitalize font-medium border-0 px-3 py-1",
                      emp.role === "admin" ? "bg-black text-white" : 
                      emp.role === "manager" ? "bg-purple-100 text-purple-700" :
                      "bg-gray-100 text-gray-700"
                    )}>
                      {emp.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4">
                    <Switch
                      checked={emp.isActive}
                      onCheckedChange={(c) => handleToggleActive(emp, c)}
                      className="data-[state=checked]:bg-green-500"
                    />
                  </TableCell>
                  <TableCell className="text-right py-4 pr-6">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-blue-50 hover:text-blue-600" onClick={() => handleOpenDialog(emp)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-red-50 hover:text-red-600" onClick={() => {
                        setSelectedEmployee(emp)
                        setDeleteDialogOpen(true)
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden border-0 shadow-2xl rounded-3xl">
          <div className="bg-black p-8 text-white">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-2xl text-white">{selectedEmployee ? "Modify Employee" : "New Account"}</DialogTitle>
                  <DialogDescription className="text-white/60">
                    Define access levels and security credentials
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Account Details */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b pb-2">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">Identity</h3>
                </div>
                
                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName" className="text-xs font-semibold text-gray-600 ml-1">Full Name</Label>
                    <Input id="fullName" className="rounded-xl border-gray-100 focus:border-black transition-all" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-xs font-semibold text-gray-600 ml-1">Email</Label>
                      <Input id="email" type="email" className="rounded-xl border-gray-100 focus:border-black" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="username" className="text-xs font-semibold text-gray-600 ml-1">Username</Label>
                      <Input id="username" className="rounded-xl border-gray-100 focus:border-black" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-semibold text-gray-600 ml-1">
                      Password {selectedEmployee && <span className="text-[10px] text-gray-400 font-normal ml-2">(Keep empty to skip change)</span>}
                    </Label>
                    <Input id="password" type="password" className="rounded-xl border-gray-100 focus:border-black" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="phone" className="text-xs font-semibold text-gray-600 ml-1">Phone</Label>
                      <Input id="phone" placeholder="+20..." className="rounded-xl border-gray-100 focus:border-black" value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-600 ml-1">Primary Role</Label>
                      <Select value={formData.role} onValueChange={(val) => setFormData({ ...formData, role: val })}>
                        <SelectTrigger className="rounded-xl border-gray-100 focus:ring-0 focus:ring-offset-0">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-gray-100 shadow-xl">
                          <SelectItem value="admin" className="rounded-lg">Administrator</SelectItem>
                          <SelectItem value="manager" className="rounded-lg">Manager</SelectItem>
                          <SelectItem value="staff" className="rounded-lg">Staff Member</SelectItem>
                          <SelectItem value="custom" className="rounded-lg">Custom Access</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Permissions */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b pb-2">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">Permissions</h3>
                </div>
                
                <div className={cn("space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar", formData.role === "admin" && "opacity-30 grayscale pointer-events-none")}>
                  {formData.role === "admin" && (
                    <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center gap-3">
                      <Shield className="h-4 w-4 text-amber-600" />
                      <p className="text-[11px] text-amber-800 font-medium leading-tight">Admin role grants absolute authority and bypasses all granular permission checks.</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Inventory Control</h4>
                      <div className="grid grid-cols-1 gap-2">
                        <PermissionToggle field="canViewProducts" label="View Product Catalog" />
                        <PermissionToggle field="canAddProducts" label="Create New Listings" />
                        <PermissionToggle field="canEditProducts" label="Update Existing Products" />
                        <PermissionToggle field="canDeleteProducts" label="Remove Items from Store" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Order Processing</h4>
                      <div className="grid grid-cols-1 gap-2">
                        <PermissionToggle field="canViewOrders" label="Review Order History" />
                        <PermissionToggle field="canUpdateOrders" label="Modify Live Orders" />
                        <PermissionToggle field="canDeleteOrders" label="Archive/Cancel Records" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Revenue & Marketing</h4>
                      <div className="grid grid-cols-1 gap-2">
                        <PermissionToggle field="canViewPricesInDashboard" label="Access Financial Data" />
                        <PermissionToggle field="canViewPricesOnWebsite" label="Toggle Storefront Visibility" />
                        <PermissionToggle field="canManageDiscountCodes" label="Issue Promotional Codes" />
                        <PermissionToggle field="canManageOffers" label="Create Flash Sale Offers" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-10 pt-6 border-t border-gray-50">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="rounded-xl px-8 text-gray-500">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-black text-white hover:bg-gray-800 rounded-xl px-10 shadow-lg shadow-black/10">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {selectedEmployee ? "Update Account" : "Initialize Account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="rounded-3xl border-0 shadow-2xl p-8 max-w-md">
          <DialogHeader>
            <div className="h-12 w-12 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <DialogTitle className="text-xl">Delete Account?</DialogTitle>
            <DialogDescription className="text-gray-500">
              You are about to remove <span className="font-bold text-gray-900">{selectedEmployee?.fullName}</span>. This will immediately revoke all access to the administration panel.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-3 mt-8">
            <Button variant="destructive" onClick={handleDelete} disabled={saving} className="rounded-xl h-12 bg-red-500 hover:bg-red-600 shadow-lg shadow-red-100">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirm Deletion"}
            </Button>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} className="rounded-xl h-12 text-gray-500 hover:bg-gray-50">
              Keep Account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
