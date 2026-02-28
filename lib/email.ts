import nodemailer from "nodemailer"

type EmailRecipient = {
  email: string
  name?: string
}

export interface SendEmailOptions {
  to: string | EmailRecipient | Array<string | EmailRecipient>
  subject: string
  html: string
  fromEmail?: string
  fromName?: string
  replyTo?: EmailRecipient
}

function normalizeRecipients(to: SendEmailOptions["to"]): EmailRecipient[] {
  if (Array.isArray(to)) {
    return to.map((item) => (typeof item === "string" ? { email: item } : item))
  }

  if (typeof to === "string") {
    return [{ email: to }]
  }

  return [to]
}

let cachedTransporter: nodemailer.Transporter | null = null

function getTransporter(senderEmail: string, senderPassword: string): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: senderEmail,
      pass: senderPassword,
    },
  })

  return cachedTransporter
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const senderEmail = options.fromEmail || process.env.EMAIL_USER
  const senderPassword = process.env.EMAIL_PASSWORD

  if (!senderEmail || !senderPassword) {
    console.error("❌ [EMAIL] Missing email configuration", {
      hasSenderEmail: !!senderEmail,
      hasSenderPassword: !!senderPassword,
    })

    throw new Error(
      "Email configuration missing. Please check EMAIL_USER and EMAIL_PASSWORD environment variables.",
    )
  }

  console.log("📧 [EMAIL] Sending with sender email:", senderEmail)

  const sender: EmailRecipient = {
    email: senderEmail,
    ...(options.fromName ? { name: options.fromName } : {}),
  }

  const toRecipients = normalizeRecipients(options.to)

  const transporter = getTransporter(senderEmail, senderPassword)

  await transporter.sendMail({
    from: sender.name ? `${sender.name} <${sender.email}>` : sender.email,
    to: toRecipients
      .map((recipient) =>
        recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email,
      )
      .join(", "),
    subject: options.subject,
    html: options.html,
    replyTo: options.replyTo?.email,
  })
}
