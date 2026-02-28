import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    { error: "Order confirmation emails are disabled" },
    { status: 410 },
  )
}
