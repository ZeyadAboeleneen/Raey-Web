import { type NextRequest, NextResponse } from "next/server"
import { OAuth2Client } from "google-auth-library"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

const client = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)

export async function POST(request: NextRequest) {
  try {
    const { idToken, phone } = await request.json()

    if (!idToken) {
      return NextResponse.json({ error: "Google ID token is required" }, { status: 400 })
    }

    // Verify the Google token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    })
    
    const payload = ticket.getPayload()
    if (!payload || !payload.email) {
      return NextResponse.json({ error: "Invalid Google token" }, { status: 400 })
    }

    const { email, name, sub: googleId } = payload

    // Check if user exists
    let user = await prisma.user.findUnique({ where: { email } })

    if (user) {
      // If user exists but didn't have a phone, require one if they haven't provided it now
      if (!user.phone && !phone) {
         return NextResponse.json({ error: "Phone number is required to complete your profile", requirePhone: true }, { status: 400 })
      }
      
      // Update googleId if not linked, and phone if provided
      user = await prisma.user.update({
        where: { email },
        data: {
          googleId: user.googleId || googleId,
          phone: phone || user.phone,
        }
      })
    } else {
      // New user signup via Google
      if (!phone) {
        return NextResponse.json({ error: "Phone number is required to complete your profile", requirePhone: true }, { status: 400 })
      }
      
      user = await prisma.user.create({
        data: {
          email,
          name: name || "Google User",
          googleId,
          phone,
          role: "user",
          favorites: [],
        }
      })
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    )

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role },
      token,
    })
  } catch (error) {
    console.error("Google auth error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
