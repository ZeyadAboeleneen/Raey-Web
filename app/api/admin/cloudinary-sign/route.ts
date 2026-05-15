import { type NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { isAdminRequest } from "@/lib/erp-items";

/**
 * Cloudinary Signed Upload Endpoint
 *
 * Generates a short-lived signature so the browser can upload
 * directly to Cloudinary without the API secret ever leaving
 * the server.
 *
 * force-dynamic prevents Next.js from caching signatures.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    /* ── auth guard ─────────────────────────────────────────── */
    if (
      !(await isAdminRequest(request, "canAddProducts")) &&
      !(await isAdminRequest(request, "canEditProducts"))
    ) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    /* ── read requested params ──────────────────────────────── */
    const body = await request.json();
    const folder = String(body.folder || "products");
    const publicId = body.publicId ? String(body.publicId) : undefined;

    /* ── configure cloudinary (server-side secret) ──────────── */
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.error("❌ [Cloudinary Sign] Missing env vars");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    /* ── generate signature ─────────────────────────────────── */
    const timestamp = Math.round(Date.now() / 1000);

    // Parameters that must match what the client sends to Cloudinary
    const paramsToSign: Record<string, string | number> = {
      timestamp,
      folder,
      overwrite: 1,
    };
    if (publicId) paramsToSign.public_id = publicId;

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret
    );

    return NextResponse.json({
      signature,
      timestamp,
      folder,
      publicId,
      apiKey,
      cloudName,
    });
  } catch (err: any) {
    console.error("❌ [Cloudinary Sign] Error:", err?.message);
    return NextResponse.json(
      { error: "Failed to generate signature" },
      { status: 500 }
    );
  }
}
