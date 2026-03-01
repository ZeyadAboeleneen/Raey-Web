import { type NextRequest, NextResponse } from "next/server"
import { createEmailTemplate, createEmailSection, createProductCard } from "@/lib/email-templates"
import { sendEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  try {
    const { order, product } = await request.json()

    if (!order || !product) {
      return NextResponse.json({ error: "Order and product are required" }, { status: 400 })
    }

    const customerEmail = order.shippingAddress.email
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.alanoudalqadi.com'

    // Create email content sections
    const greeting = createEmailSection({
      content: `
        <div style="text-align: center; margin-bottom: 30px;">
          <h1>How was your experience?</h1>
          <p style="font-size: 18px; margin: 10px 0;">We'd love to hear from you!</p>
        </div>
        
        <h2>Hello ${order.shippingAddress.name},</h2>
        <p>Thank you for choosing Raey! We hope you're enjoying your new couture look.</p>
      `
    })

    const productSection = createEmailSection({
      title: "Your Recent Purchase",
      highlight: true,
      content: `
        ${createProductCard({
        name: product.name,
        description: `Order #${order.id} • Your honest feedback helps other customers make informed decisions and helps us improve our products and service.`
      })}
        
        <div style="text-align: center; margin: 20px 0;">
          <div style="color: #FFD700; font-size: 28px; letter-spacing: 5px;">★★★★★</div>
        </div>
        
        <h4>What did you think?</h4>
        <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
          <li>How did the gown feel and move?</li>
          <li>How long does it last?</li>
          <li>Would you recommend it to others?</li>
          <li>How was your overall experience?</li>
        </ul>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${baseUrl}/account" class="btn btn-primary" style="font-size: 16px;">
            Leave Your Review
          </a>
        </div>
      `
    })

    const whyReviewSection = createEmailSection({
      title: "Why leave a review?",
      content: `
        <ul style="margin: 0; padding-left: 20px; line-height: 1.8;">
          <li>Help other couture lovers discover their perfect look</li>
          <li>Share your experience with the community</li>
          <li>Help us improve our products and service</li>
          <li>Get exclusive offers and updates</li>
        </ul>
        
        <hr class="divider">
        
        <p style="text-align: center;">
          Your review will be visible on our website and will help other customers make informed decisions.
        </p>
        
        <p style="text-align: center;">
          Have questions? Contact us at <a href="mailto:Raey@gmail.com">Raey@gmail.com</a> or WhatsApp: +971 50 299 6885
        </p>
        
        <p style="text-align: center; margin-top: 30px; font-weight: 600;">
          Thank you for being part of the Raey family!
        </p>
      `
    })

    const emailContent = greeting + productSection + whyReviewSection

    const htmlContent = createEmailTemplate({
      title: "Share Your Experience - Raey",
      preheader: `How was your ${product.name}? Share your experience with us!`,
      content: emailContent,
      theme: { mode: 'light' }
    })

    // Send email via Brevo
    await sendEmail({
      to: customerEmail,
      subject: `How was your ${product.name}? Share your experience!`,
      html: htmlContent,
      fromName: "Raey",
    })

    console.log(`✅ Review reminder email sent to ${customerEmail} for product: ${product.name}`)

    return NextResponse.json({ success: true, message: "Review reminder email sent" })
  } catch (error) {
    console.error("❌ Error sending review reminder email:", error)
    return NextResponse.json({ error: "Failed to send review reminder email" }, { status: 500 })
  }
}

