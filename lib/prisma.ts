import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

/**
 * Build the database URL with connection pool settings optimised for
 * a slow remote MySQL host.
 *
 * Prisma lets us append query-string parameters to the DATABASE_URL:
 *   - connection_limit  = max open connections (keep low to avoid overwhelming the remote host)
 *   - pool_timeout      = seconds to wait for a free connection before erroring
 *   - connect_timeout   = seconds to wait for the TCP handshake to complete
 */
function buildDatasourceUrl(): string {
    const base = process.env.DATABASE_URL || ""
    // Only add pool params if they aren't already present
    if (base.includes("connection_limit")) return base
    const separator = base.includes("?") ? "&" : "?"
    return `${base}${separator}connection_limit=10&pool_timeout=30&connect_timeout=30`
}

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
        datasources: {
            db: {
                url: buildDatasourceUrl(),
            },
        },
    })

globalForPrisma.prisma = prisma
