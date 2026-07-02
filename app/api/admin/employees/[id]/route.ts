import { NextResponse } from "next/server"
import { withPipeline } from "@/lib/api-pipeline"

// Employees live in the MSSQL ERP `Users` table; edits/deletes happen there.
const ERP_MANAGED_MESSAGE =
  "Employees are managed in the ERP system. Please edit this employee there."

export const PUT = withPipeline(async () => {
  return NextResponse.json({ error: ERP_MANAGED_MESSAGE }, { status: 501 })
}, { role: "admin" })

export const DELETE = withPipeline(async () => {
  return NextResponse.json({ error: ERP_MANAGED_MESSAGE }, { status: 501 })
}, { role: "admin" })
