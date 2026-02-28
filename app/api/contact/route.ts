import { type NextRequest, NextResponse } from "next/server"
import { createEmailTemplate, createEmailSection } from "@/lib/email-templates"
import { sendEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  try {
    const { name, email, subject, message } = await request.json()

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    // Create email content sections
    const headerSection = createEmailSection({
      content: `
        <div style="text-align: center; margin-bottom: 30px;">
          <h1>New Contact Form Submission</h1>
          <p style="font-size: 18px;">El Raey Website</p>
        </div>
      `
    })

    const contactDetailsSection = createEmailSection({
      title: "Customer Information",
      highlight: true,
      content: `
        <div class="email-card" style="margin: 15px 0;">
          <div style="margin-bottom: 15px;">
            <strong style="color: currentColor;">Name:</strong>
            <div style="margin-top: 5px; padding: 10px; background-color: rgba(0,0,0,0.05); border-radius: 6px;">
              ${name}
            </div>
          </div>
          
          <div style="margin-bottom: 15px;">
            <strong style="color: currentColor;">Email:</strong>
            <div style="margin-top: 5px; padding: 10px; background-color: rgba(0,0,0,0.05); border-radius: 6px;">
              <a href="mailto:${email}" style="color: currentColor; text-decoration: none;">${email}</a>
            </div>
          </div>
          
          <div style="margin-bottom: 15px;">
            <strong style="color: currentColor;">Subject:</strong>
            <div style="margin-top: 5px; padding: 10px; background-color: rgba(0,0,0,0.05); border-radius: 6px;">
              ${subject}
            </div>
          </div>
        </div>
      `
    })

    const messageSection = createEmailSection({
      title: "Message",
      content: `
        <div style="padding: 20px; background-color: rgba(0,0,0,0.05); border-radius: 8px; line-height: 1.8; white-space: pre-wrap;">${message}</div>
        
        <hr class="divider">
        
        <div class="email-card" style="background-color: #e0f2fe; border-left-color: #0284c7; margin-top: 20px;">
          <p style="margin: 0;"><strong>Action Required:</strong></p>
          <p style="margin: 10px 0 0 0;">Please reply directly to the customer's email: <a href="mailto:${email}" style="color: currentColor;">${email}</a></p>
        </div>
      `
    })

    const emailContent = headerSection + contactDetailsSection + messageSection

    const htmlContent = createEmailTemplate({
      title: "New Contact Form Submission",
      preheader: `New message from ${name} - ${subject}`,
      content: emailContent,
      theme: { mode: 'light' },
      includeUnsubscribe: false
    })

    // Send email via Brevo
    await sendEmail({
      to: process.env.EMAIL_USER || "",
      subject: `Contact Form: ${subject}`,
      html: htmlContent,
      replyTo: { email },
    })

    return NextResponse.json({ success: true, message: "Message sent successfully" })
  } catch (error) {
    console.error("Contact form error:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
