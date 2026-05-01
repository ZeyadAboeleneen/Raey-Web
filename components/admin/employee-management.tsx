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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium">Employee Accounts</h2>
          <p className="text-sm text-gray-500">Manage dashboard access and permissions for your team.</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="bg-black text-white hover:bg-gray-800">
          <Plus className="mr-2 h-4 w-4" /> Add Employee
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                  No employees found.
                </TableCell>
              </TableRow>
            ) : (
              employees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div className="font-medium">{emp.fullName}</div>
                    <div className="text-sm text-gray-500">{emp.email} • {emp.username}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={emp.role === "admin" ? "default" : "secondary"}>
                      {emp.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={emp.isActive}
                      onCheckedChange={(c) => handleToggleActive(emp, c)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(emp)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-500" onClick={() => {
                      setSelectedEmployee(emp)
                      setDeleteDialogOpen(true)
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedEmployee ? "Edit Employee" : "Add Employee"}</DialogTitle>
            <DialogDescription>
              Configure employee details and set granular access permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            {/* Account Details */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><Shield className="h-4 w-4" /> Account Details</h3>
              
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name <span className="text-red-500">*</span></Label>
                <Input id="fullName" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
                <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username <span className="text-red-500">*</span></Label>
                <Input id="username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password {selectedEmployee ? "(Leave blank to keep current)" : "<span className='text-red-500'>*</span>"}</Label>
                <Input id="password" type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone (Optional)</Label>
                <Input id="phone" value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={formData.role} onValueChange={(val) => setFormData({ ...formData, role: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {formData.role === "admin" && (
                  <p className="text-xs text-amber-600 mt-1">Admin role bypasses all permission checks.</p>
                )}
              </div>
            </div>

            {/* Permissions */}
            <div className="space-y-6">
              <h3 className="font-semibold">Permissions</h3>
              
              <div className={formData.role === "admin" ? "opacity-50 pointer-events-none" : ""}>
                <div className="space-y-1 mb-4">
                  <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Products</h4>
                  <Card className="p-3">
                    <PermissionToggle field="canViewProducts" label="View Products" />
                    <PermissionToggle field="canAddProducts" label="Add Products" />
                    <PermissionToggle field="canEditProducts" label="Edit Products" />
                    <PermissionToggle field="canDeleteProducts" label="Delete Products" />
                  </Card>
                </div>

                <div className="space-y-1 mb-4">
                  <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Orders</h4>
                  <Card className="p-3">
                    <PermissionToggle field="canViewOrders" label="View Orders" />
                    <PermissionToggle field="canUpdateOrders" label="Update Orders" />
                    <PermissionToggle field="canDeleteOrders" label="Delete Orders" />
                  </Card>
                </div>

                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Pricing & Marketing</h4>
                  <Card className="p-3">
                    <PermissionToggle field="canViewPricesInDashboard" label="View Prices in Dashboard" />
                    <PermissionToggle field="canViewPricesOnWebsite" label="View Prices on Website" />
                    <PermissionToggle field="canManageDiscountCodes" label="Manage Discount Codes" />
                    <PermissionToggle field="canManageOffers" label="Manage Offers" />
                  </Card>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-black text-white hover:bg-gray-800">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {selectedEmployee ? "Save Changes" : "Create Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Employee</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedEmployee?.fullName}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              Deleting an employee immediately revokes their access.
            </AlertDescription>
          </Alert>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
