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
  { code: "E",  label: "El-Raey 1" },
  { code: "M",  label: "Mona Saleh" },
  { code: "D",  label: "El-Raey 2" },
  { code: "R",  label: "El-Raey The Yard" },
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

/** Numeric Branch_ID from Booking (ERP) — only 15 is defined here; rest use store name. */
export function mapBookingBranchIdToSlug(branchId: number | null | undefined): string | null {
  if (branchId === null || branchId === undefined) return null;
  if (branchId === 15) return branchMap["15"];
  return null;
}

/**
 * Branch slug from Booking → Stores only (Items has no branch column).
 * No booking / no store row → null (caller must not crash).
 */
export function resolveBranchSlugFromErpRow(row: {
  BranchID?: number | null;
  StoreName?: string | null;
}): string | null {
  const fromId = mapBookingBranchIdToSlug(row.BranchID ?? null);
  if (fromId) return fromId;

  const raw = (row.StoreName || "").trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (branchMap[upper]) return branchMap[upper];
  if (branchMap[raw]) return branchMap[raw];

  const letter = upper.charAt(0);
  if (branchMap[letter]) return branchMap[letter];

  console.warn("Unknown branch value:", { BranchID: row.BranchID, StoreName: row.StoreName });
  return null;
}
