import { prisma } from "@/lib/prisma";
import { clearErpProductCaches } from "@/lib/erp-items";

/**
 * Returns order items to stock.
 * - For "sell-dresses", sets isOutOfStock to false.
 * - For regular products, increments stockCount for the specific size.
 * - Recalculates the global isOutOfStock status for the product.
 * - Invalidate ERP caches to reflect changes immediately.
 */
export async function returnOrderItemsToStock(items: any[]) {
  if (!items || !Array.isArray(items)) return;

  for (const item of items) {
    const productId = item.productId || item.id;
    if (!productId) continue;

    try {
      const product = await prisma.product.findUnique({ where: { productId } });
      if (!product) continue;

      const isSellDress = product.branch === "sell-dresses" || item.branch === "sell-dresses";
      
      if (isSellDress) {
        // Sell dresses are unique; returning to stock simply means setting isOutOfStock: false
        await prisma.product.update({
          where: { productId },
          data: { isOutOfStock: false }
        });
      } else {
        // Restore stock for regular products (increment stock count)
        const sizes = product.sizes as any[];
        if (!sizes || !Array.isArray(sizes)) continue;

        const updatedSizes = sizes.map((s: any) => {
          const matches = s.size === item.size || s.volume === item.size || s.size === item.volume || s.volume === item.volume;
          if (matches && s.stockCount !== null && s.stockCount !== undefined) {
            return { ...s, stockCount: s.stockCount + (item.quantity || 1) };
          }
          return s;
        });

        // Recalculate global isOutOfStock: true only if ALL sizes have 0 or undefined stockCount
        const isOutOfStock = updatedSizes.every((s: any) => !s.stockCount && s.stockCount !== undefined);

        await prisma.product.update({
          where: { productId },
          data: { 
            sizes: updatedSizes, 
            isOutOfStock 
          }
        });
      }
    } catch (error) {
      console.error(`Error returning item ${productId} to stock:`, error);
    }
  }

  // Clear cache so changes are reflected in listings immediately
  clearErpProductCaches();
}
