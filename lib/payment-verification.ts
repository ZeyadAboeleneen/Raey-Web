import { GoogleGenAI } from "@google/genai"
import { z } from "zod"

// Initialize Gemini Client
// We assume GEMINI_API_KEY is available in the environment
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

// Zod Schema for strict validation of Gemini's output
export const PaymentExtractionSchema = z.object({
  provider: z.string().describe("The payment provider identified on the receipt (e.g., 'instapay', 'vodafone cash', 'bank transfer', 'unknown')"),
  amount: z.number().describe("The total payment amount successfully transferred, extracted as a number"),
  confidence: z.number().min(0).max(1).describe("Confidence score between 0.0 and 1.0 of the extraction accuracy and image authenticity"),
  transactionId: z.string().optional().describe("The unique transaction ID or reference number shown on the receipt"),
  date: z.string().optional().describe("The date of the transaction in YYYY-MM-DD format"),
  time: z.string().optional().describe("The time of the transaction in HH:MM format"),
  isReceipt: z.boolean().describe("True if this image actually looks like a payment receipt, false if it is a random image or selfie"),
  suspiciousElementsFound: z.boolean().describe("True if there are signs of image manipulation, inconsistent fonts, or blurry fake overlays"),
})

// Plain OpenAPI schema definition for Google Gen AI SDK (Gemini expects uppercase type strings)
const PaymentExtractionResponseSchema = {
  type: "OBJECT",
  properties: {
    provider: {
      type: "STRING",
      description: "The payment provider identified on the receipt (e.g., 'instapay', 'vodafone cash', 'bank transfer', 'unknown')"
    },
    amount: {
      type: "NUMBER",
      description: "The total payment amount successfully transferred, extracted as a number"
    },
    confidence: {
      type: "NUMBER",
      description: "Confidence score between 0.0 and 1.0 of the extraction accuracy and image authenticity"
    },
    transactionId: {
      type: "STRING",
      description: "The unique transaction ID or reference number shown on the receipt"
    },
    date: {
      type: "STRING",
      description: "The date of the transaction in YYYY-MM-DD format"
    },
    time: {
      type: "STRING",
      description: "The time of the transaction in HH:MM format"
    },
    isReceipt: {
      type: "BOOLEAN",
      description: "True if this image actually looks like a payment receipt, false if it is a random image or selfie"
    },
    suspiciousElementsFound: {
      type: "BOOLEAN",
      description: "True if there are signs of image manipulation, inconsistent fonts, or blurry fake overlays"
    }
  },
  required: ["provider", "amount", "confidence", "isReceipt", "suspiciousElementsFound"]
}

export type PaymentExtractionResult = z.infer<typeof PaymentExtractionSchema>

export async function verifyPaymentReceiptWithGemini(
  imageUrl: string,
  promptVersion: string = "v1.0"
): Promise<{ success: boolean; data?: PaymentExtractionResult; raw?: string; error?: string }> {
  try {
    // We expect the image to be a Cloudinary URL or a base64 string
    let imageData: { inlineData: { data: string; mimeType: string } } | null = null

    // If it's a URL, we need to fetch it as an ArrayBuffer and convert to base64 for Gemini
    // (Gemini REST/SDK requires base64 inlineData or a Google Cloud Storage URI)
    if (imageUrl.startsWith("http")) {
      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error("Failed to fetch image from URL")
      const buffer = await response.arrayBuffer()
      const base64 = Buffer.from(buffer).toString("base64")
      const mimeType = response.headers.get("content-type") || "image/jpeg"
      
      imageData = {
        inlineData: {
          data: base64,
          mimeType: mimeType,
        },
      }
    } else if (imageUrl.startsWith("data:image/")) {
      // It's already a base64 data URL
      const [header, base64] = imageUrl.split(",")
      const mimeType = header.split(":")[1].split(";")[0]
      imageData = {
        inlineData: {
          data: base64,
          mimeType: mimeType,
        },
      }
    } else {
      throw new Error("Invalid image format provided")
    }

    const systemInstruction = `
      You are an expert fraud detection and payment verification system.
      Your task is to analyze the provided payment screenshot (InstaPay, Vodafone Cash, or Bank Transfer) and extract the facts.
      
      CRITICAL RULES:
      1. NEVER infer or guess unseen text. If you cannot clearly read the amount or transaction ID, return null or leave it empty.
      2. If the image is NOT a payment receipt (e.g. a selfie, a blank image, a random photo), set isReceipt to false and return low confidence.
      3. Look for signs of photoshop, inconsistent fonts, or overlapping text. If found, set suspiciousElementsFound to true.
      4. Ensure the extracted amount represents the SUCCESSFUL transfer amount.
      5. Your confidence score MUST reflect OCR certainty. 0.99 for perfect read, 0.5 for blurry/uncertain.
    `

    // Generate content using gemini-2.5-flash which is extremely fast and great for OCR
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [imageData] }
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: PaymentExtractionResponseSchema as any,
        temperature: 0.0, // We want deterministic extraction, no creativity
      }
    })

    const rawText = response.text
    if (!rawText) throw new Error("Empty response from Gemini")

    // Parse and validate with Zod
    const parsedJson = JSON.parse(rawText)
    const validData = PaymentExtractionSchema.parse(parsedJson)

    return {
      success: true,
      data: validData,
      raw: rawText
    }

  } catch (error: any) {
    console.error("❌ [AI Verification] Error:", error)
    return {
      success: false,
      error: error.message || "Failed to verify payment receipt",
    }
  }
}
