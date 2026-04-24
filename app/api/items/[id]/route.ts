import { type NextRequest, NextResponse } from "next/server";
import { getMssqlPool, sql } from "@/lib/mssql";
import {
  type ErpItemRow,
  transformErpRows,
  erpProductToCachedShape,
  VALID_ERP_LINE_IDS,
  mapCollectionToLineId,
} from "@/lib/erp-mappings";
import { clearErpProductCaches, isAdminRequest } from "@/lib/erp-items";
import { resolveStoreId } from "@/lib/erp-stores";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

const errorResponse = (status: number, message: string) =>
  NextResponse.json(
    { error: message, timestamp: new Date().toISOString() },
    { status }
  );

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET /api/items/:id ──────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();

  try {
    const itemId = parseInt(params.id, 10);
    if (isNaN(itemId)) {
      return errorResponse(400, "Invalid item ID");
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");
    const includeInactive = searchParams.get("includeInactive") === "true" && isAdminRequest(request);

    const pool = await getMssqlPool();
    const result = await pool
      .request()
      .input("itemId", sql.Int, itemId)
      .query<ErpItemRow>(`
        SELECT
          i.ID          AS ItemID,
          i.Item_name,
          i.Item_sellpricNow,
          i.PicPath,
          i.Item_Isdisabled,
          i.Category_id AS LineId,
          c.Name        AS LineName,
          b.ID          AS BookingID,
          b.ReceivedDate,
          b.ReturnDate,
          b.BranchID,
          s.Store_name  AS StoreName,
          istore.Store_name AS ItemStoreName
        FROM Items i
        LEFT JOIN Category c ON i.Category_id = c.ID
        LEFT JOIN Booking  b ON b.ModelTypeID  = i.ID
        LEFT JOIN Stores   s ON b.BranchID     = s.Branch_ID
        LEFT JOIN (
            SELECT itemst.ItemID, st.Store_name, st.Branch_ID 
            FROM ItemStores itemst 
            JOIN Stores st ON itemst.StoreID = st.ID
        ) istore ON istore.ItemID = i.ID
        WHERE i.ID = @itemId
          AND i.Category_id IN (${VALID_ERP_LINE_IDS.join(",")})
          ${includeInactive ? "" : "AND i.Item_Isdisabled = 0"}
      `);

    if (result.recordset.length === 0) {
      return errorResponse(404, "Item not found");
    }

    const erpProducts = transformErpRows(result.recordset as ErpItemRow[]);

    if (erpProducts.length === 0) {
      return errorResponse(404, "Item not found");
    }

    const product = erpProducts[0];

    const output = format === "erp" ? product : erpProductToCachedShape(product);

    console.log(
      `✅ [ERP] Fetched item ${itemId} in ${Date.now() - startTime}ms`
    );
    return new NextResponse(JSON.stringify(output), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error: any) {
    console.error(
      `❌ [ERP] Error in GET /api/items/${params.id}:`,
      error?.message || error
    );
    return errorResponse(500, "Failed to fetch item from ERP");
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!isAdminRequest(request)) {
      return errorResponse(403, "Admin access required");
    }

    const itemId = parseInt(params.id, 10);
    if (isNaN(itemId)) {
      return errorResponse(400, "Invalid item ID");
    }

    const body = await request.json();
    const name = String(body.name || "").trim();
    const image = String(body.image || body.PicPath || "").trim();
    const priceRaw = body.price ?? body.Item_sellpricNow;
    const price = Number(priceRaw);
    const lineId =
      typeof body.lineId === "number"
        ? body.lineId
        : mapCollectionToLineId(body.collection);
    const isActive = body.isActive !== false;
    const branchCode = body.branch ? String(body.branch).trim() : null;

    if (!name) return errorResponse(400, "Product name is required");
    if (!Number.isFinite(price)) return errorResponse(400, "Valid price is required");
    if (!lineId) return errorResponse(400, "Valid collection is required");

    // ── Update MSSQL ERP (NO branch column) ─────────────────────
    const pool = await getMssqlPool();
    await pool
      .request()
      .input("itemId", sql.Int, itemId)
      .input("name", sql.NVarChar(sql.MAX), name)
      .input("price", sql.Decimal(18, 2), price)
      .input("image", sql.NVarChar(sql.MAX), image || null)
      .input("lineId", sql.Int, lineId)
      .input("isDisabled", sql.Bit, isActive ? 0 : 1)
      .query(`
        UPDATE Items
        SET
          Item_name = @name,
          Item_sellpricNow = @price,
          PicPath = @image,
          Category_id = @lineId,
          Item_Isdisabled = @isDisabled
        WHERE ID = @itemId
      `);

    // ── Save branch to MSSQL via ItemStores ─────────────
    if (branchCode) {
      const storeId = resolveStoreId(branchCode);
      if (storeId) {
        try {
          await pool
            .request()
            .input("itemId", sql.Int, itemId)
            .input("storeId", sql.Int, storeId)
            .query(`
              IF EXISTS (SELECT 1 FROM ItemStores WHERE ItemID = @itemId)
                UPDATE ItemStores SET StoreID = @storeId WHERE ItemID = @itemId
              ELSE
                INSERT INTO ItemStores (ItemID, StoreID) VALUES (@itemId, @storeId)
            `);
          console.log(`✅ [MSSQL] Updated branch for item ${itemId} (StoreID: ${storeId})`);
        } catch (mssqlErr: any) {
          console.error("⚠️ [MSSQL] Failed to save branch:", mssqlErr?.message);
        }
      }
    }

    clearErpProductCaches();

    return NextResponse.json({
      success: true,
      product: {
        id: String(itemId),
        name,
        price,
        image,
        collection: lineId === 6 ? "wedding" : "soiree",
        isActive,
      },
      message: "Product updated successfully",
    });
  } catch (error: any) {
    console.error(`❌ [ERP] Error updating item ${params.id}:`, error?.message || error);
    return errorResponse(500, "Failed to update item in ERP");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!isAdminRequest(request)) {
      return errorResponse(403, "Admin access required");
    }

    const itemId = parseInt(params.id, 10);
    if (isNaN(itemId)) {
      return errorResponse(400, "Invalid item ID");
    }

    const pool = await getMssqlPool();
    await pool
      .request()
      .input("itemId", sql.Int, itemId)
      .query(`
        UPDATE Items
        SET Item_Isdisabled = 1
        WHERE ID = @itemId
      `);

    clearErpProductCaches();
    return NextResponse.json({ success: true, message: "Product disabled successfully" });
  } catch (error: any) {
    console.error(`❌ [ERP] Error deleting item ${params.id}:`, error?.message || error);
    return errorResponse(500, "Failed to delete item from ERP");
  }
}
