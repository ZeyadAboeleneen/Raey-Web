import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    { error: "Order status update emails are disabled" },
    { status: 410 },
  )
}

