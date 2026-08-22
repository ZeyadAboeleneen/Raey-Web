/**
 * ERP → storefront mapping (MSSQL source of truth).
 * Branch = store / location slug; line id 1|6 = Soiree|Wedding collection.
 */

import { resolveBranchSlugFromErpRow } from "@/lib/branch-map";
import { mapOpStoreIdToBranchSlug } from "@/lib/erp-stores";
import { type ActiveProductDiscount, findDiscountForProduct, applyProductDiscount } from "@/lib/product-discounts";

// ── Line id (ERP Items.Category_id) → collection label ───────────────
const LINE_ID_TO_COLLECTION: Record<number, string> = {
  1: "Soiree",
  5: "Soiree",
  10: "Soiree",
  12: "Soiree",
  18: "Soiree", // Old Soiree
  6: "Wedding",
  11: "Wedding",
  13: "Wedding",
  15: "Wedding", // Second Look
  9: "Fionka",
};

/** Only these line ids are valid for the website catalog. */
export const VALID_ERP_LINE_IDS = [1, 5, 6, 9, 10, 11, 12, 13, 15, 18];

export function mapLineIdToCollection(lineId: number | null | undefined): string {
  if (lineId == null) return "Unknown";
  return LINE_ID_TO_COLLECTION[lineId] || "Unknown";
}

export function mapCollectionToLineId(
  collection: string | null | undefined
): number | null {
  if (!collection) return null;
  const normalized = collection.trim().toLowerCase();
  if (normalized === "wedding") return 6; // Primary Wedding category
  if (normalized === "soiree") return 1; // Primary Soiree category
  if (normalized === "fionka") return 9;
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
  /** ERP Items.Item_code — used as SKU in structured data. */
  code: string | null;
  /** ERP Items.Notes — product description (empty in current DB, falls back to name). */
  description: string | null;
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
  isBestseller: boolean;
  isNew: boolean;
  /** Never been booked (0 total bookings) → can be sold as new, not only rented. */
  isSellable: boolean;
  /**
   * Total number of Booking rows ever recorded for this dress, any status or
   * date — the same count `lib/rental-pricing.ts` uses to decide the POST4
   * pricing threshold (n >= 4). Carried through to the client so the instant
   * speculative price estimate can guess POST4 correctly instead of always
   * assuming a never-rented dress; the real price is still always confirmed
   * server-side afterward.
   */
  totalBookings: number;
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
  Item_code?: string | null;
  Notes?: string | null;
  PicPath: string | null;
  Item_Isdisabled: boolean | number | null;
  IsBestseller: boolean | number | null;
  IsNew: boolean | number | null;
  /** 1 if this item is linked to Store_name='15' via tb_ItemOperations — Hay El-Gamaa2 branch */
  IsSellDressOp: boolean | number | null;
  /** Most relevant tb_ItemOperations.OP_StoreID — used to resolve branch when no booking exists. */
  OpStoreID?: number | null;
  /** Total number of Booking rows ever recorded for this dress (0 = never rented). */
  TotalBookings: number | null;
  LineId: number | null;
  LineName: string | null;
  BookingID: number | null;
  ReceivedDate: Date | string | null;
  ReturnDate: Date | string | null;
  BranchID: number | null;
  StoreName: string | null;
  ItemStoreBranchID?: number | null;
  ItemStoreName?: string | null;
  FallbackStoreName?: string | null;
}

/**
 * Groups flat JOIN rows by Item and builds the final product objects.
 */
export function transformErpRows(rows: ErpItemRow[]): ErpProduct[] {
  const itemMap = new Map<number, ErpProduct>();

  for (const row of rows) {
    const id = row.ItemID;

    if (!itemMap.has(id)) {
      // tb_ItemOperations link to Store_name='15' identifies the Hay El-Gamaa2 branch
      const branchIdToUse = row.ItemStoreBranchID ?? row.BranchID ?? null;
      const storeNameToUse = row.ItemStoreName ?? row.StoreName ?? row.FallbackStoreName ?? null;

      const resolvedBranch = resolveBranchSlugFromErpRow({
        BranchID: branchIdToUse,
        StoreName: storeNameToUse,
        Item_name: row.Item_name,
      });

      // No booking/store branch → fall back to the item's tb_ItemOperations store.
      const opBranch = mapOpStoreIdToBranchSlug(row.OpStoreID);
      const branch = resolvedBranch ?? opBranch;
      itemMap.set(id, {
        id,
        name: (row.Item_name || "").trim(),
        code: row.Item_code ? row.Item_code.trim() : null,
        description: row.Notes ? row.Notes.trim() : null,
        price: row.Item_sellpricNow ?? 0,
        cost: row.Item_buypric ?? 0,
        image: (row.PicPath || "").trim(),
        lineId: row.LineId,
        collection: mapLineIdToCollection(row.LineId),
        branch,
        isActive: !Boolean(row.Item_Isdisabled),
        isBestseller: Boolean(row.IsBestseller),
        isNew: Boolean(row.IsNew),
        isSellable: (row.TotalBookings ?? 0) === 0,
        totalBookings: row.TotalBookings ?? 0,
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
 *
 * `activeDiscounts` — currently-active ProductDiscount rows (buy items
 * only, see lib/product-discounts.ts). Callers fetch this once per batch
 * and pass it through rather than querying per product. Purely a display
 * concern here — the actual charge is recomputed independently and
 * authoritatively in lib/pricing/server-pricing.ts.
 */
export function erpProductToCachedShape(p: ErpProduct, activeDiscounts: ActiveProductDiscount[] = []): Record<string, any> {
  // Category A rental price = cost × 0.8, rounded to nearest 100, floor 3000
  const rentalPriceA = p.cost > 0 ? Math.max(round100(p.cost * 0.8), 3000) : null;
  // Category C rental price = cost × 0.4, rounded to nearest 100, floor 3000 (shown to clients)
  const rentalPriceC = p.cost > 0 ? Math.max(round100(p.cost * 0.4), 3000) : null;

  const buyDiscount = p.isSellable ? findDiscountForProduct(p.id, p.branch, activeDiscounts, "buy") : null;
  const discountedSellPrice = buyDiscount ? applyProductDiscount(p.price, buyDiscount) : p.price;

  // Rent discount applies to the "starting from" display prices (rentalPriceA/C).
  // The exact per-date price (once an occasion date is picked) is discounted
  // separately, server-side, in /api/rental/pricing and /api/rental/bulk-pricing.
  const rentDiscount = findDiscountForProduct(p.id, p.branch, activeDiscounts, "rent");
  const discountedRentalPriceA = rentDiscount && rentalPriceA ? applyProductDiscount(rentalPriceA, rentDiscount) : rentalPriceA;
  const discountedRentalPriceC = rentDiscount && rentalPriceC ? applyProductDiscount(rentalPriceC, rentDiscount) : rentalPriceC;

  return {
    _id: String(p.id),
    id: String(p.id),
    product_id: String(p.id),
    name: p.name,
    code: p.code,
    description: p.description || "",
    longDescription: "",
    price: p.price,
    // Sell price (Item_sellpricNow) shown to customers in Buy mode. Only meaningful
    // for never-rented dresses (isSellable); kept un-stripped so customers can see it.
    // Reflects an active automatic ProductDiscount, if one matches this item.
    sellPrice: p.isSellable ? discountedSellPrice : null,
    isSellable: p.isSellable,
    // Lets the client's instant speculative rental price guess POST4 pricing
    // correctly (see lib/rental-pricing.ts) instead of always assuming n=0.
    totalBookings: p.totalBookings,
    rentalPriceA: discountedRentalPriceA,
    rentalPriceC: discountedRentalPriceC,
    // Pre-discount "starting from" prices, for strikethrough display; null when no rent discount applies.
    rentalPriceAOriginal: rentDiscount ? rentalPriceA : null,
    rentalPriceCOriginal: rentDiscount ? rentalPriceC : null,
    // Passed to the client so the instant speculative price estimate (before the
    // server round-trip resolves) can apply the same discount without waiting.
    rentDiscount: rentDiscount ? { type: rentDiscount.discountType, value: rentDiscount.discountValue } : null,
    // Cheap booleans for sorting/badging discounted products to the front of a
    // listing without every page re-deriving it from the price fields.
    hasBuyDiscount: !!buyDiscount,
    hasRentDiscount: !!rentDiscount,
    image: p.image,
    beforeSalePrice: null,
    afterSalePrice: null,
    sizes: [
      {
        size: "Standard",
        volume: "-",
        originalPrice: p.price,
        discountedPrice: discountedSellPrice,
        stockCount: 10,
      },
    ],
    images: p.image ? [p.image] : [],
    rating: 0,
    reviews: 0,
    notes: { top: [], middle: [], base: [] },
    branch: p.branch,
    collection: p.collection.toLowerCase(),
    isNew: p.isNew,
    isBestseller: p.isBestseller,
    isActive: p.isActive,
    isOutOfStock: !p.isActive,
    isGiftPackage: false,
    packagePrice: null,
    packageOriginalPrice: null,
    giftPackageSizes: [],
    unavailableDates: p.unavailableDates,
    hasBeenRented: p.unavailableDates.length > 0,
    cost: p.cost,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
