import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import jwt from "jsonwebtoken"
import { createEmailTemplate, createEmailSection } from "@/lib/email-templates"
import { sendEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    })

    if (!user) {
      // Don't reveal if user exists or not for security
      return NextResponse.json({ message: "If an account with that email exists, we've sent a reset link." })
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" }
    )

    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/auth/reset-password?token=${resetToken}`

    // Create email content sections
    const greeting = createEmailSection({
      content: `
        <h2>Reset Your Password</h2>
        <p>We received a request to reset your password for your El Raey account. Click the button below to create a new password:</p>
      `,
    })

    const resetSection = createEmailSection({
      title: "Password Reset Request",
      highlight: true,
      content: `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" class="btn btn-primary" style="font-size: 16px;">
            Reset Password
          </a>
        </div>
        
        <div class="email-card" style="background-color: #fef3c7; border-left-color: #f59e0b; margin-top: 20px;">
          <p style="margin: 0;"><strong>Security Notice:</strong></p>
          <p style="margin: 10px 0 0 0;">This link will expire in 1 hour for security reasons. If you didn't request this reset, please ignore this email.</p>
        </div>
      `,
    })

    const troubleshootingSection = createEmailSection({
      title: "Need Help?",
      content: `
        <p style="margin-bottom: 15px;">If the button doesn't work, copy and paste this link into your browser:</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 14px;">
          ${resetUrl}
        </div>
        
        <hr class="divider">
        
        <p style="text-align: center;">
          Still having trouble? Contact us at <a href="mailto:Elraey@gmail.com">Elraey@gmail.com</a> or WhatsApp: +971 50 299 6885
        </p>
      `,
    })

    const emailContent = greeting + resetSection + troubleshootingSection

    // Send email
    await sendEmail({
      to: email,
      subject: "Reset Your El Raey Password",
      html: createEmailTemplate({
        title: "Reset Your Password - El Raey",
        preheader: "Reset your password to regain access to your account",
        content: emailContent,
        theme: { mode: "light" },
      }),
    })

    return NextResponse.json({ message: "If an account with that email exists, we've sent a reset link." })
  } catch (error) {
    console.error("Forgot password error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
