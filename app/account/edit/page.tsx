"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, User, Save } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { useAuth } from "@/lib/auth-context"

export default function EditProfilePage() {
  const router = useRouter()

  // Page disabled: immediately redirect to home
  useEffect(() => {
    router.replace("/")
  }, [router])

  return null

  const { state: authState, updateUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  useEffect(() => {
    if (authState.isLoading) {
      return
    }

    if (!authState.isAuthenticated) {
      router.push("/auth/login")
      return
    }

    if (authState.user) {
      setFormData((prev) => ({
        ...prev,
        name: authState.user.name,
        email: authState.user.email,
      }))
    }
  }, [authState, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess(false)

    if (formData.newPassword) {
      if (!formData.currentPassword) {
        setError("Current password is required to change password")
        setLoading(false)
        return
      }

      if (formData.newPassword !== formData.confirmPassword) {
        setError("New passwords do not match")
        setLoading(false)
        return
      }

      if (formData.newPassword.length < 6) {
        setError("New password must be at least 6 characters long")
        setLoading(false)
        return
      }
    }

    try {
      const updateData: any = {
        name: formData.name,
        email: formData.email,
      }

      if (formData.newPassword) {
        updateData.currentPassword = formData.currentPassword
        updateData.newPassword = formData.newPassword
      }

      const response = await fetch("/api/auth/update-profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authState.token}`,
        },
        body: JSON.stringify(updateData),
      })

      const result = await response.json() // ✅ Use only once

      if (!response.ok || result.error) {
        setError(result.error || "Failed to update profile")
      } else {
        updateUser({
          ...authState.user!,
          name: result.user.name,
          email: result.user.email,
        })

        setSuccess(true)
        setFormData((prev) => ({
          ...prev,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }))

        setTimeout(() => setSuccess(false), 5000)
      }
    } catch (error) {
      console.error("Update profile error:", error)
      setError("An unexpected error occurred while updating your profile.")
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  if (authState.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />

        <section className="pt-32 pb-16">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="text-center py-12 sm:py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div>
              <p className="text-gray-600">Loading profile...</p>
            </div>
          </div>
        </section>
      </div>
    )
  }

  if (!authState.isAuthenticated) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <section className="pt-32 pb-16">
        <div className="container mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-6 sm:mb-8"
          >
            <Link
              href="/account"
              className="inline-flex items-center text-gray-600 hover:text-black transition-colors mb-4 sm:mb-6"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to My Account
            </Link>
            <h1 className="text-2xl sm:text-3xl font-light tracking-wider mb-2">Edit Profile</h1>
            <p className="text-gray-600">Update your account information</p>
          </motion.div>

          <div className="max-w-2xl mx-auto">
            {success && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <Alert className="border-green-200 bg-green-50">
                  <AlertDescription className="text-green-600">Profile updated successfully!</AlertDescription>
                </Alert>
              </motion.div>
            )}

            {error && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription className="text-red-600">{error}</AlertDescription>
                </Alert>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <User className="mr-2 h-5 w-5" />
                    Profile Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                      <div>
                        <Label htmlFor="name" className="text-sm font-medium">Full Name *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleChange("name", e.target.value)}
                          placeholder="Your full name"
                          required
                          className="mt-1 h-12"
                        />
                      </div>

                      <div>
                        <Label htmlFor="email" className="text-sm font-medium">Email Address *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleChange("email", e.target.value)}
                          placeholder="your@email.com"
                          required
                          className="mt-1 h-12"
                        />
                      </div>
                    </div>

                    <div className="border-t pt-6">
                      <h3 className="text-base sm:text-lg font-medium mb-4">Change Password (Optional)</h3>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="currentPassword" className="text-sm font-medium">Current Password</Label>
                          <Input
                            id="currentPassword"
                            type="password"
                            value={formData.currentPassword}
                            onChange={(e) => handleChange("currentPassword", e.target.value)}
                            placeholder="Enter current password"
                            autoComplete="current-password"
                            className="mt-1 h-12"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="newPassword" className="text-sm font-medium">New Password</Label>
                            <Input
                              id="newPassword"
                              type="password"
                              value={formData.newPassword}
                              onChange={(e) => handleChange("newPassword", e.target.value)}
                              placeholder="Enter new password"
                              autoComplete="new-password"
                              className="mt-1 h-12"
                            />
                          </div>

                          <div>
                            <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm New Password</Label>
                            <Input
                              id="confirmPassword"
                              type="password"
                              value={formData.confirmPassword}
                              onChange={(e) => handleChange("confirmPassword", e.target.value)}
                              placeholder="Confirm new password"
                              autoComplete="new-password"
                              className="mt-1 h-12"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-3 sm:gap-4 pt-6">
                      <Link href="/account" className="order-2 sm:order-1">
                        <Button type="button" variant="outline" className="w-full sm:w-auto h-12">
                          Cancel
                        </Button>
                      </Link>
                      <Button 
                        type="submit" 
                        className="bg-black text-white hover:bg-gray-800 w-full sm:w-auto h-12 order-1 sm:order-2" 
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Updating...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Save Changes
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  )
}
