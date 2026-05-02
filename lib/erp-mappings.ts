/**
 * ERP → storefront mapping (MSSQL source of truth).
 * Branch = store / location slug; line id 1|6 = Soiree|Wedding collection.
 */

import { resolveBranchSlugFromErpRow } from "@/lib/branch-map";

// ── Line id (ERP Items.Category_id) → collection label ───────────────
const LINE_ID_TO_COLLECTION: Record<number, string> = {
  1: "Soiree",
  6: "Wedding",
};

/** Only these line ids are valid for the website catalog. */
export const VALID_ERP_LINE_IDS = [1, 6];

export function mapLineIdToCollection(lineId: number | null | undefined): string {
  if (lineId == null) return "Unknown";
  return LINE_ID_TO_COLLECTION[lineId] || "Unknown";
}

export function mapCollectionToLineId(
  collection: string | null | undefined
): number | null {
  if (!collection) return null;
  const normalized = collection.trim().toLowerCase();
  if (normalized === "wedding") return 6;
  if (normalized === "soiree") return 1;
  return null;
}

// ── Unavailable Date Range ──────────────────────────────────────────

export interface UnavailableDateRange {
  from: string;
  to: string;
}

// ── Transformed Product ─────────────────────────────────────────────

export interface ErpProduct {
  id: number;
  name: string;
  price: number;
  /** Dress cost (Item_buypric) from ERP — used to derive rental category prices. */
  cost: number;
  image: string;
  /** ERP Items.Category_id — wedding vs soiree line only. */
  lineId: number | null;
  collection: string;
  /** Storefront branch slug from Booking→Stores; null if no booking / unmapped. */
  branch: string | null;
  isActive: boolean;
  unavailableDates: UnavailableDateRange[];
}

/**
 * Row returned from the main Items query.
 * Each row may have ONE booking join — we group later.
 */
export interface ErpItemRow {
  ItemID: number;
  Item_name: string | null;
  Item_sellpricNow: number | null;
  Item_buypric: number | null;
  PicPath: string | null;
  Item_Isdisabled: boolean | number | null;
  LineId: number | null;
  LineName: string | null;
  BookingID: number | null;
  ReceivedDate: Date | string | null;
  ReturnDate: Date | string | null;
  BranchID: number | null;
  StoreName: string | null;
  ItemStoreBranchID?: number | null;
  ItemStoreName?: string | null;
}

/**
 * Groups flat JOIN rows by Item and builds the final product objects.
 */
export function transformErpRows(rows: ErpItemRow[]): ErpProduct[] {
  const itemMap = new Map<number, ErpProduct>();

  for (const row of rows) {
    const id = row.ItemID;

    if (!itemMap.has(id)) {
      const branchIdToUse = row.ItemStoreBranchID != null ? row.ItemStoreBranchID : row.BranchID;
      const storeNameToUse = row.ItemStoreName != null ? row.ItemStoreName : row.StoreName;

      const branch = resolveBranchSlugFromErpRow({
        BranchID: branchIdToUse,
        StoreName: storeNameToUse,
      });
      itemMap.set(id, {
        id,
        name: (row.Item_name || "").trim(),
        price: row.Item_sellpricNow ?? 0,
        cost: row.Item_buypric ?? 0,
        image: (row.PicPath || "").trim(),
        lineId: row.LineId,
        collection: mapLineIdToCollection(row.LineId),
        branch,
        isActive: !Boolean(row.Item_Isdisabled),
        unavailableDates: [],
      });
    }

    if (row.ReceivedDate && row.ReturnDate) {
      const product = itemMap.get(id)!;
      const from =
        row.ReceivedDate instanceof Date
          ? row.ReceivedDate.toISOString()
          : new Date(row.ReceivedDate).toISOString();
      const to =
        row.ReturnDate instanceof Date
          ? row.ReturnDate.toISOString()
          : new Date(row.ReturnDate).toISOString();

      const alreadyExists = product.unavailableDates.some(
        (d) => d.from === from && d.to === to
      );
      if (!alreadyExists) {
        product.unavailableDates.push({ from, to });
      }
    }
  }

  return Array.from(itemMap.values());
}

/** Round to nearest 100 EGP (same logic as rental-pricing.ts). */
const round100 = (val: number) => Math.round(val / 100) * 100;

/**
 * Maps an ERP product to the JSON shape the storefront consumes.
 */
export function erpProductToCachedShape(p: ErpProduct): Record<string, any> {
  // Category A rental price = cost × 0.8, rounded to nearest 100, floor 3000
  const rentalPriceA = p.cost > 0 ? Math.max(round100(p.cost * 0.8), 3000) : null;

  return {
    _id: String(p.id),
    id: String(p.id),
    product_id: String(p.id),
    name: p.name,
    description: "",
    longDescription: "",
    price: p.price,
    rentalPriceA,
    image: p.image,
    beforeSalePrice: null,
    afterSalePrice: null,
    sizes: [
      {
        size: "Standard",
        volume: "-",
        originalPrice: p.price,
        discountedPrice: p.price,
        stockCount: 10,
      },
    ],
    images: p.image ? [p.image] : [],
    rating: 0,
    reviews: 0,
    notes: { top: [], middle: [], base: [] },
    branch: p.branch,
    collection: p.collection.toLowerCase(),
    isNew: false,
    isBestseller: false,
    isActive: p.isActive,
    isOutOfStock: !p.isActive,
    isGiftPackage: false,
    packagePrice: null,
    packageOriginalPrice: null,
    giftPackageSizes: [],
    unavailableDates: p.unavailableDates,
    hasBeenRented: p.unavailableDates.length > 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
