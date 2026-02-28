const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient({
        datasources: {
            db: {
                url: process.env.DATABASE_URL
            }
        }
    });

    try {
        console.log('Testing connection to:', process.env.DATABASE_URL);
        await prisma.$connect();
        console.log('✅ Connection successful!');

        const userCount = await prisma.user.count();
        console.log('✅ Found users:', userCount);

    } catch (e) {
        console.error('❌ Error testing connection:');
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
