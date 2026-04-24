import { type NextRequest, NextResponse } from "next/server";
import { getMssqlPool, sql } from "@/lib/mssql";
import { mapCollectionToLineId } from "@/lib/erp-mappings";
import { clearErpProductCaches, isAdminRequest } from "@/lib/erp-items";
import { resolveStoreId } from "@/lib/erp-stores";

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message, timestamp: new Date().toISOString() }, { status });

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return errorResponse(403, "Admin access required");
    }

    const body = await request.json();
    const name = String(body.name || body.Item_name || "").trim();
    const image = String(body.image || body.PicPath || "").trim();
    const priceRaw = body.price ?? body.Item_sellpricNow;
    const price = Number(priceRaw);
    const lineId =
      typeof body.lineId === "number"
        ? body.lineId
        : mapCollectionToLineId(body.collection);
    const branchCode = body.branch ? String(body.branch).trim() : null;

    if (!name) return errorResponse(400, "Product name is required");
    if (!Number.isFinite(price)) return errorResponse(400, "Valid price is required");
    if (!lineId) return errorResponse(400, "Valid collection is required");

    const baseCode = name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
    const itemCode = `${baseCode || "ITEM"}-${Date.now().toString().slice(-6)}`;

    // ── Insert into MSSQL ERP (NO branch column) ────────────────
    const pool = await getMssqlPool();
    const result = await pool
      .request()
      .input("itemCode", sql.NVarChar(64), itemCode)
      .input("name", sql.NVarChar(sql.MAX), name)
      .input("price", sql.Decimal(18, 2), price)
      .input("image", sql.NVarChar(sql.MAX), image || null)
      .input("lineId", sql.Int, lineId)
      .input("requestPoint", sql.Decimal(18, 2), 0)
      .query(`
        INSERT INTO Items (
          Item_code,
          Item_name,
          Item_sellpricNow,
          PicPath,
          Category_id,
          Item_request_point,
          Item_Isdisabled
        )
        OUTPUT INSERTED.ID AS id
        VALUES (
          @itemCode,
          @name,
          @price,
          @image,
          @lineId,
          @requestPoint,
          0
        )
      `);

    const newId = result.recordset[0]?.id;

    // ── Save branch to MSSQL via ItemStores ─────────────
    if (newId && branchCode) {
      const storeId = resolveStoreId(branchCode);
      if (storeId) {
        try {
          await pool
            .request()
            .input("itemId", sql.Int, newId)
            .input("storeId", sql.Int, storeId)
            .query(`INSERT INTO ItemStores (ItemID, StoreID) VALUES (@itemId, @storeId)`);
          console.log(`✅ [MSSQL] Saved branch for item ${newId} (StoreID: ${storeId})`);
        } catch (mssqlErr: any) {
          console.error("⚠️ [MSSQL] Failed to save branch:", mssqlErr?.message);
        }
      }
    }

    clearErpProductCaches();

    return NextResponse.json({
      success: true,
      id: newId ?? null,
      message: "Product created successfully in ERP",
    });
  } catch (error: any) {
    console.error("❌ [ERP] Error creating item:", error?.message || error);
    return errorResponse(500, "Failed to create item in ERP");
  }
}
