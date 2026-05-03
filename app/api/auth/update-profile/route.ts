import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")

    if (!token) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    const { name, email, currentPassword, newPassword } = await request.json()

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }

    const userId = decoded.userId
    if (!userId) {
      return NextResponse.json({ error: "Invalid token: missing user ID" }, { status: 401 })
    }

    // Fetch user from MySQL
    const user = await prisma.user.findUnique({ where: { id: userId } })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if email is being changed and if new email already exists
    if (email !== user.email) {
      const existing = await prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
      })
      if (existing) {
        return NextResponse.json({ error: "Email already in use" }, { status: 400 })
      }
    }

    const updateData: any = { name, email }

    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password is required" }, { status: 400 })
      }

      const isValidPassword = await bcrypt.compare(currentPassword, user.password)
      if (!isValidPassword) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
      }

      updateData.password = await bcrypt.hash(newPassword, 12)
    }

    // Update user in MySQL
    await prisma.user.update({ where: { id: userId }, data: updateData })

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
      user: { name, email, role: user.role },
    })
  } catch (error) {
    console.error("Update profile error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
