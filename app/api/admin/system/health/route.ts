import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withPipeline } from "@/lib/api-pipeline"
import { InvariantService } from "@/services/invariant.service"

export const GET = withPipeline(async (request) => {
  // 0. ASSERT INVARIANTS (The Enforcement Step)
  const violations = await InvariantService.assertSystemInvariants()
  // 1. Basic Stats
  const stats = await prisma.outboxEvent.groupBy({
    by: ['status'],
    _count: { id: true }
  })

  // 2. Failure Analysis
  const recentFailures = await prisma.outboxEvent.findMany({
    where: { status: 'FAILED' },
    orderBy: { createdAt: 'desc' },
    take: 5
  })

  // 3. Lag Calculation (Average time from created to processed for last 50 events)
  const recentCompleted = await prisma.outboxEvent.findMany({
    where: { status: 'COMPLETED' },
    orderBy: { processedAt: 'desc' },
    take: 50,
    select: { createdAt: true, processedAt: true }
  })

  let avgLagMs = 0
  if (recentCompleted.length > 0) {
    const totalLag = recentCompleted.reduce((acc, event) => {
      return acc + (event.processedAt!.getTime() - event.createdAt.getTime())
    }, 0)
    avgLagMs = totalLag / recentCompleted.length
  }

  // 4. Pending events count
  const pendingCount = await prisma.outboxEvent.count({
    where: { status: 'PENDING' }
  })

  return NextResponse.json({
    health: violations.length > 0 ? "CRITICAL" : (pendingCount > 100 ? "WARNING" : "HEALTHY"),
    violations,
    stats: stats.reduce((acc: any, s) => {
      acc[s.status] = s._count.id
      return acc
    }, {}),
    latency: {
      averageLagMs: Math.round(avgLagMs),
      unit: "milliseconds"
    },
    pendingCount,
    recentFailures: recentFailures.map(f => ({
      id: f.id,
      type: f.type,
      error: f.lastError,
      at: f.createdAt
    }))
  })
}, { role: "admin" })
