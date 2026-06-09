const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    select: { productId: true, name: true, description: true, longDescription: true }
  });
  
  const actualLongDescriptions = products.filter(p => 
    p.longDescription && p.longDescription.trim().length > 1 && p.longDescription !== "null" && p.longDescription !== "."
  );
  
  console.log(`Found ${actualLongDescriptions.length} products with actual longDescriptions out of ${products.length} total.`);
  for (const p of actualLongDescriptions.slice(0, 10)) {
    console.log(`ID: ${p.productId}, Name: ${p.name}`);
    console.log(`  LongDescription: "${p.longDescription}"`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
