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
  "sell-dresses": 16,
};

export function resolveStoreId(branch: string | undefined | null): number | null {
  if (!branch) return null;
  const key = branch.trim();
  return STORE_MAP[key] ?? STORE_MAP[key.toUpperCase()] ?? STORE_MAP[key.toLowerCase()] ?? null;
}
