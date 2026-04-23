import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  return NextResponse.json(
    {
      error: "Bulk product upload is disabled for the legacy Prisma product API. Use the MSSQL /api/items flow instead.",
    },
    { status: 410 }
  );
}
