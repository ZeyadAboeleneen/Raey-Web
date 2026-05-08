/**
 * Single source of truth: ERP branch codes / IDs → storefront branch slugs.
 * Raw DB values (E, M, D, R, 15) must never be shown in UI — map through here.
 */

export const branchMap: Record<string, string> = {
  E: "el-raey-1",
  M: "mona-saleh",
  D: "el-raey-2",
  R: "el-raey-the-yard",
  "15": "sell-dresses",
};

const slugToCode: Record<string, string> = Object.fromEntries(
  Object.entries(branchMap).map(([code, slug]) => [slug, code])
);

export { slugToCode };

/** Admin-facing branch options for dropdowns. */
export const BRANCH_OPTIONS = [
  { code: "E", label: "El Mashaya 1" },
  { code: "M", label: "Hay El-Gamaa" },
  { code: "D", label: "El Mashaya 2" },
  { code: "R", label: "The yard cairo" },
  { code: "15", label: "Sell Dresses" },
] as const;

export function mapBranchCodeToSlug(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) {
    console.warn("Unknown branch value:", raw);
    return "unknown";
  }
  const key = String(raw).trim();
  const slug = branchMap[key.toUpperCase()] ?? branchMap[key];
  if (!slug) {
    console.warn("Unknown branch value:", raw);
    return "unknown";
  }
  return slug;
}

/** Map storefront slug → raw branch code for admin / MSSQL writes (E, M, D, R, 15). */
export function mapBranchSlugToCode(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const normalized = slug.trim().toLowerCase();
  return slugToCode[normalized] ?? null;
}

/** Map storefront slug → ERP BranchID (integer) for Booking / ItemStores tables */
export function mapBranchSlugToBranchId(slug: string | null | undefined): number | null {
  const code = mapBranchSlugToCode(slug);
  switch (code) {
    case "E": return 3;
    case "M": return 9;
    case "D": return 7;
    case "R": return 5;
    case "15": return 1;
    default: return null;
  }
}

/** Map numeric Stores.Branch_ID → storefront slug. */
const BRANCH_ID_TO_CODE: Record<number, string> = {
  3: "E",   // el-raey-1
  9: "M",   // mona-saleh
  7: "D",   // el-raey-2
  5: "R",   // el-raey-the-yard
  1: "15",  // sell-dresses
};

export function mapBookingBranchIdToSlug(branchId: number | null | undefined): string | null {
  if (branchId === null || branchId === undefined) return null;
  const code = BRANCH_ID_TO_CODE[branchId];
  return code ? (branchMap[code] ?? null) : null;
}

/**
 * Branch slug from Booking → Stores only (Items has no branch column).
 * No booking / no store row → null (caller must not crash).
 */
export function resolveBranchSlugFromErpRow(row: {
  BranchID?: number | null;
  StoreName?: string | null;
  Item_name?: string | null;
}): string | null {
  const fromId = mapBookingBranchIdToSlug(row.BranchID ?? null);
  if (fromId) return fromId;

  const raw = (row.StoreName || "").trim();
  if (raw) {
    const upper = raw.toUpperCase();
    if (branchMap[upper]) return branchMap[upper];
    if (branchMap[raw]) return branchMap[raw];

    const letter = upper.charAt(0);
    if (branchMap[letter]) return branchMap[letter];
  }

  // Last resort: Fallback to first letter of item name (e.g. "R123" -> "el-raey-the-yard")
  const itemName = (row.Item_name || "").trim().toUpperCase();
  if (itemName) {
    const firstLetter = itemName.charAt(0);
    if (branchMap[firstLetter]) return branchMap[firstLetter];
  }

  if (row.BranchID || row.StoreName) {
    console.warn("Unknown branch value:", { BranchID: row.BranchID, StoreName: row.StoreName });
  }
  return null;
}
