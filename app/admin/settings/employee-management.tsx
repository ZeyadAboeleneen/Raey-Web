"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import { UserPlus, Edit2, Trash2, Shield, Loader2 } from "lucide-react"

interface Permissions {
  canAddProducts: boolean
  canEditProducts: boolean
  canDeleteProducts: boolean
  canViewProducts: boolean
  canViewOrders: boolean
  canUpdateOrders: boolean
  canDeleteOrders: boolean
  canViewPricesInDashboard: boolean
  canViewPricesOnWebsite: boolean
}

interface Employee {
  id: string
  email: string
  name: string
  role: string
  phone?: string | null
  isActive: boolean
  permissions: Permissions | null
  createdAt: string
}

const DEFAULT_PERMISSIONS: Permissions = {
  canAddProducts: false,
  canEditProducts: false,
  canDeleteProducts: false,
  canViewProducts: true,
  canViewOrders: false,
  canUpdateOrders: false,
  canDeleteOrders: false,
  canViewPricesInDashboard: false,
  canViewPricesOnWebsite: false,
}

export function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "staff",
    isActive: true,
    permissions: { ...DEFAULT_PERMISSIONS }
  })

  useEffect(() => {
    fetchEmployees()
  }, [])

  const fetchEmployees = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem("sense_auth") ? JSON.parse(localStorage.getItem("sense_auth")!).token : ""
      const res = await fetch("/api/admin/employees", {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setEmployees(data)
      } else {
        toast.error("Failed to load employees")
      }
    } catch (err) {
      console.error(err)
      toast.error("Error loading employees")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (employee?: Employee) => {
    if (employee) {
      setEditingId(employee.id)
      setFormData({
        name: employee.name,
        email: employee.email,
        password: "", // Keep empty for edit unless they want to change it
        phone: employee.phone || "",
        role: employee.role,
        isActive: employee.isActive,
        permissions: employee.permissions || { ...DEFAULT_PERMISSIONS }
      })
    } else {
      setEditingId(null)
      setFormData({
        name: "",
        email: "",
        password: "",
        phone: "",
        role: "staff",
        isActive: true,
        permissions: { ...DEFAULT_PERMISSIONS }
      })
    }
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.email || (!editingId && !formData.password)) {
      toast.error("Name, email and password are required")
      return
    }

    try {
      setSaving(true)
      const token = localStorage.getItem("sense_auth") ? JSON.parse(localStorage.getItem("sense_auth")!).token : ""
      
      const url = editingId ? `/api/admin/employees/${editingId}` : "/api/admin/employees"
      const method = editingId ? "PUT" : "POST"
      
      const payload: any = { ...formData }
      if (editingId && !payload.password) {
        delete payload.password // Don't update password if it's empty
      }

      const res = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success(`Employee ${editingId ? "updated" : "added"} successfully`)
        fetchEmployees()
        setIsDialogOpen(false)
      } else {
        const data = await res.json()
        toast.error(data.error || `Failed to ${editingId ? "update" : "add"} employee`)
      }
    } catch (err) {
      console.error(err)
      toast.error("An error occurred")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this employee?")) return

    try {
      const token = localStorage.getItem("sense_auth") ? JSON.parse(localStorage.getItem("sense_auth")!).token : ""
      const res = await fetch(`/api/admin/employees/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.ok) {
        toast.success("Employee deleted successfully")
        setEmployees(employees.filter(e => e.id !== id))
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to delete employee")
      }
    } catch (err) {
      console.error(err)
      toast.error("An error occurred")
    }
  }

  const togglePermission = (key: keyof Permissions) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key]
      }
    }))
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Employee Accounts</h2>
          <p className="text-sm text-gray-500">Manage dashboard access and permissions for your staff.</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="bg-black text-white hover:bg-gray-800">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  No employees found. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">{employee.name}</TableCell>
                  <TableCell>{employee.email}</TableCell>
                  <TableCell>
                    <Badge variant={employee.role === "admin" ? "default" : "secondary"} className="capitalize">
                      {employee.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={employee.isActive ? "default" : "destructive"} className={employee.isActive ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}>
                      {employee.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(employee)}>
                        <Edit2 className="h-4 w-4 text-blue-500" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(employee.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Employee" : "Add New Employee"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-8 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold border-b pb-2">Account Details</h3>
                
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                </div>
                
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
                </div>
                
                <div className="space-y-2">
                  <Label>{editingId ? "New Password (leave blank to keep current)" : "Password"}</Label>
                  <Input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required={!editingId} />
                </div>
                
                <div className="space-y-2">
                  <Label>Phone (Optional)</Label>
                  <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>

                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={formData.role} onValueChange={v => setFormData({...formData, role: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                  <div>
                    <Label className="text-base">Account Status</Label>
                    <p className="text-sm text-gray-500">Allow user to log in</p>
                  </div>
                  <Switch checked={formData.isActive} onCheckedChange={c => setFormData({...formData, isActive: c})} />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold border-b pb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-500" /> 
                  Permissions
                </h3>
                
                <div className="space-y-6">
                  {/* Products */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-500 uppercase">Products</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {["canViewProducts", "canAddProducts", "canEditProducts", "canDeleteProducts"].map((key) => (
                        <div key={key} className="flex items-center justify-between p-2 border rounded text-sm bg-white">
                          <Label htmlFor={key} className="cursor-pointer font-normal">
                            {key.replace("can", "").replace(/([A-Z])/g, ' $1').trim()}
                          </Label>
                          <Switch 
                            id={key}
                            checked={formData.permissions[key as keyof Permissions]} 
                            onCheckedChange={() => togglePermission(key as keyof Permissions)} 
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Orders */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-500 uppercase">Orders</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {["canViewOrders", "canUpdateOrders", "canDeleteOrders"].map((key) => (
                        <div key={key} className="flex items-center justify-between p-2 border rounded text-sm bg-white">
                          <Label htmlFor={key} className="cursor-pointer font-normal">
                            {key.replace("can", "").replace(/([A-Z])/g, ' $1').trim()}
                          </Label>
                          <Switch 
                            id={key}
                            checked={formData.permissions[key as keyof Permissions]} 
                            onCheckedChange={() => togglePermission(key as keyof Permissions)} 
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-amber-600 uppercase">Pricing & Visibility</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border border-amber-200 rounded-lg bg-amber-50">
                        <div>
                          <Label htmlFor="viewPricesDash" className="cursor-pointer text-amber-900">View Prices (Dashboard)</Label>
                          <p className="text-xs text-amber-700">Allow seeing prices in admin panel</p>
                        </div>
                        <Switch 
                          id="viewPricesDash"
                          checked={formData.permissions.canViewPricesInDashboard} 
                          onCheckedChange={() => togglePermission("canViewPricesInDashboard")} 
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 border border-amber-200 rounded-lg bg-amber-50">
                        <div>
                          <Label htmlFor="viewPricesWeb" className="cursor-pointer font-bold text-amber-900">View Prices (Website)</Label>
                          <p className="text-xs text-amber-700">Critical: See prices on the live storefront</p>
                        </div>
                        <Switch 
                          id="viewPricesWeb"
                          checked={formData.permissions.canViewPricesOnWebsite} 
                          onCheckedChange={() => togglePermission("canViewPricesOnWebsite")} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-black text-white hover:bg-gray-800" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? "Save Changes" : "Add Employee"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
