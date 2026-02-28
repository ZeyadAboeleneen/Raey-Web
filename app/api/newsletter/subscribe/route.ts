import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const trimmedEmail = email.trim().toLowerCase()

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    try {
      await prisma.newsletterSubscriber.create({ data: { email: trimmedEmail } })
      return NextResponse.json({ success: true })
    } catch (error: any) {
      // P2002 = unique constraint violation (already subscribed)
      if (error?.code === "P2002") {
        return NextResponse.json({ success: true, alreadySubscribed: true })
      }
      throw error
    }
  } catch (error) {
    console.error("Newsletter subscribe error:", error)
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 })
  }
}
