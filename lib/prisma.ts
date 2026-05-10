import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

function buildDatasourceUrl(): string {
    const base = process.env.DATABASE_URL || ""
    if (base.includes("connection_limit")) return base
    const separator = base.includes("?") ? "&" : "?"
    return `${base}${separator}connection_limit=3&pool_timeout=60&connect_timeout=60`
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
