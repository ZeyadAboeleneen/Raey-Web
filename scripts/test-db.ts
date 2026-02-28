import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

async function main() {
    const prisma = new PrismaClient()
    try {
        console.log('Testing database connection...')
        await prisma.$connect()
        console.log('✅ Connection successful!')
    } catch (e) {
        console.error('❌ Connection failed!')
        console.error(e)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

main()
