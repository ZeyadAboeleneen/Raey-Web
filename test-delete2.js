const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    await prisma.order.delete({ where: { orderId: 'ORD-1777153664776-T5ITKO0QX' } });
    console.log("Success");
  } catch (e) {
    console.error('Prisma Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
run();
