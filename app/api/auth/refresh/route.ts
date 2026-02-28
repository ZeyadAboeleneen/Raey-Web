import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const oldToken = authHeader.substring(7)

    // Verify old token (allow slightly expired tokens so refresh works)
    let decoded: { userId: string; email: string }
    try {
      decoded = jwt.verify(oldToken, JWT_SECRET) as { userId: string; email: string }
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Find user in MySQL
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Create new token
    const newToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    )

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token: newToken,
    })
  } catch (error) {
    console.error("Token refresh error:", error)
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }
}
