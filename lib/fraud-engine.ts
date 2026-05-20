import { prisma } from "@/lib/prisma"
import type { PaymentExtractionResult } from "@/lib/payment-verification"

export interface FraudEngineDecision {
  status: "approved" | "pending_review" | "rejected"
  reason: string | null
  confidenceScore: number
}

export async function runFraudDecisionEngine(
  expectedAmount: number,
  expectedProvider: string,
  extraction: PaymentExtractionResult
): Promise<FraudEngineDecision> {
  const {
    amount,
    provider,
    confidence,
    transactionId,
    date,
    time,
    isReceipt,
    suspiciousElementsFound
  } = extraction

  // 1. Base check: Is it even a receipt?
  if (!isReceipt) {
    return {
      status: "rejected",
      reason: "Image does not appear to be a valid payment receipt.",
      confidenceScore: confidence
    }
  }

  // 2. Suspicious elements check
  if (suspiciousElementsFound) {
    return {
      status: "rejected",
      reason: "Suspicious image editing or tampering detected.",
      confidenceScore: confidence
    }
  }

  // 3. Amount tolerance (must be >= expected amount to account for possible fees/rounding)
  // If we couldn't extract the amount, we can't approve it automatically.
  if (amount === undefined || amount === null) {
    return {
      status: "pending_review",
      reason: "Could not clearly read the payment amount from the receipt.",
      confidenceScore: confidence
    }
  }
  
  if (amount < expectedAmount) {
    return {
      status: "pending_review",
      reason: `Amount mismatch. Found ${amount}, but expected at least ${expectedAmount}.`,
      confidenceScore: confidence
    }
  }

  // 4. Duplicate transaction check
  if (transactionId) {
    // Check if this transaction ID has already been used on a NON-rejected order
    const existingOrder = await prisma.order.findFirst({
      where: {
        paymentTransactionId: transactionId,
        paymentStatus: {
          in: ["approved", "pending", "pending_review"]
        }
      } as any
    })

    if (existingOrder) {
      return {
        status: "rejected",
        reason: `Duplicate transaction. Transaction ID ${transactionId} has already been used.`,
        confidenceScore: confidence
      }
    }
  }

  // 5. Freshness check (Generous 24-hour absolute buffer to support timezone deltas between UTC servers and Egypt local time)
  if (date) {
    try {
      // Basic parse attempt. If time is missing, default to midnight.
      const timeStr = time ? `T${time.padStart(5, '0')}:00` : "T00:00:00"
      const receiptDate = new Date(`${date}${timeStr}`)
      const now = new Date()
      
      if (!isNaN(receiptDate.getTime())) {
        const diffMs = Math.abs(now.getTime() - receiptDate.getTime()) // Absolute value handles timezone differences smoothly
        const diffHours = diffMs / (1000 * 60 * 60)
        
        if (diffHours > 24) {
          return {
            status: "rejected",
            reason: `Receipt is too old. Extracted: ${date} ${time || ''}. Max 24 hours allowed to complete payment.`,
            confidenceScore: confidence
          }
        }
      }
    } catch (e) {
      // If date parsing fails, we fallback to pending_review
      return {
        status: "pending_review",
        reason: `Could not reliably parse the receipt date/time: ${date} ${time}`,
        confidenceScore: confidence
      }
    }
  }

  // 6. Provider mismatch check (e.g. selected instapay but uploaded vodafone cash)
  if (provider && expectedProvider) {
    const extProv = provider.toLowerCase()
    const expProv = expectedProvider.toLowerCase()
    // Soft match check
    if (!extProv.includes(expProv) && !expProv.includes(extProv) && extProv !== "unknown") {
      return {
        status: "pending_review",
        reason: `Provider mismatch. Expected ${expectedProvider}, found ${provider}.`,
        confidenceScore: confidence
      }
    }
  }

  // 7. Confidence threshold check (Optimized: 0.8+ is highly accurate for Gemini OCR extraction)
  if (confidence < 0.6) {
    return {
      status: "rejected",
      reason: "Low confidence in AI extraction. Please upload a clearer image.",
      confidenceScore: confidence
    }
  } else if (confidence < 0.8) {
    return {
      status: "pending_review",
      reason: "Medium confidence in OCR extraction. Requires manual review.",
      confidenceScore: confidence
    }
  }

  // If we passed all checks, auto-approve!
  return {
    status: "approved",
    reason: null,
    confidenceScore: confidence
  }
}
