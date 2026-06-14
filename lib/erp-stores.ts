export const STORE_MAP: Record<string, number> = {
  E: 6,
  M: 8,
  D: 13,
  R: 14,
  "15": 16,
  "el-raey-1": 6,
  "mona-saleh": 8,
  "el-raey-2": 13,
  "el-raey-the-yard": 14,
  "hay-el-gamaa-2": 16,
};

export function resolveStoreId(branch: string | undefined | null): number | null {
  if (!branch) return null;
  const key = branch.trim();
  return STORE_MAP[key] ?? STORE_MAP[key.toUpperCase()] ?? STORE_MAP[key.toLowerCase()] ?? null;
}

/**
 * tb_ItemOperations.OP_StoreID → storefront branch slug.
 * Used to resolve a product's branch when it has no bookings.
 */
export const OP_STORE_ID_TO_BRANCH_SLUG: Record<number, string> = {
  6: "el-raey-1", // El Mashaya 1
  8: "mona-saleh", // Hay El-Gamaa
  13: "el-raey-2", // El Mashaya 2
  14: "el-raey-the-yard", // The Yard Cairo
  16: "hay-el-gamaa-2", // Main Branch
};

export function mapOpStoreIdToBranchSlug(storeId: number | null | undefined): string | null {
  if (storeId == null) return null;
  return OP_STORE_ID_TO_BRANCH_SLUG[storeId] ?? null;
}
