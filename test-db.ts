import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const order = await prisma.order.findFirst({
    orderBy: { createdAt: 'desc' }
  })
  
  if (order) {
    console.log("=== Latest Order ===")
    console.log(JSON.stringify(order, null, 2))
  } else {
    console.log("No orders found")
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
