// /app/api/auth/me/route.ts
import { NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value
    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    let decoded: any
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!)
    } catch {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const userId = decoded.userId
    if (!userId) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 404 })
    }

    return NextResponse.json({
      authenticated: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  } catch (error) {
    console.error("Auth check error:", error)
    return NextResponse.json({ authenticated: false }, { status: 500 })
  }
}
