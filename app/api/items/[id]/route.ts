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
import { logAudit, getRequestMetadata } from "@/lib/audit";
import jwt from "jsonwebtoken";
import { resolveStoreId } from "@/lib/erp-stores";
import { isPubliclyVisible } from "@/lib/product-visibility";
import { prisma } from "@/lib/prisma"; // <-- added missing import

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
    const includeInactive = searchParams.get("includeInactive") === "true" && (await isAdminRequest(request, "canViewProducts"));

    const pool = await getMssqlPool();
    const result = await pool
      .request()
      .input("itemId", sql.Int, itemId)
      .query<ErpItemRow>(`
        SELECT
          i.ID          AS ItemID,
          i.Item_name,
          i.Item_sellpricNow,
          i.Item_buypric,
          i.PicPath,
          i.Item_Isdisabled,
          i.Category_id AS LineId,
          c.Name        AS LineName,
          b.ID          AS BookingID,
          b.ReceivedDate,
          b.ReturnDate,
          b.BranchID,
          s.Store_name  AS StoreName,
          istore.Branch_ID AS ItemStoreBranchID,
          istore.Store_name AS ItemStoreName,
          fallback.FallbackStoreName
        FROM Items i
        LEFT JOIN Category c ON i.Category_id = c.ID
        LEFT JOIN Booking  b ON b.ModelTypeID  = i.ID
        LEFT JOIN Stores   s ON b.BranchID     = s.Branch_ID
        LEFT JOIN (
            SELECT itemst.ItemID, st.Store_name, st.Branch_ID 
            FROM ItemStores itemst 
            JOIN Stores st ON itemst.StoreID = st.ID
        ) istore ON istore.ItemID = i.ID
        OUTER APPLY (
            SELECT TOP 1 s2.Store_name AS FallbackStoreName
            FROM Booking b2
            JOIN Stores s2 ON b2.BranchID = s2.Branch_ID
            WHERE b2.ModelTypeID = i.ID
            ORDER BY b2.ID DESC
        ) fallback
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

    if (!includeInactive && !isPubliclyVisible(product)) {
      return errorResponse(404, "Item not found");
    }

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

// ── PUT /api/items/:id (with audit logging) ─────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!(await isAdminRequest(request, "canEditProducts"))) {
      return errorResponse(403, "Admin access required or insufficient permissions");
    }

    const itemId = parseInt(params.id, 10);
    if (isNaN(itemId)) {
      return errorResponse(400, "Invalid item ID");
    }

    // Capture existing state for audit logging
    const pool = await getMssqlPool();
    const existingResult = await pool.request().input("itemId", sql.Int, itemId).query(`
      SELECT i.Item_name, i.Item_sellpricNow, s.Store_name
      FROM Items i
      LEFT JOIN ItemStores ist ON i.ID = ist.ItemID
      LEFT JOIN Stores s ON ist.StoreID = s.ID
      WHERE i.ID = @itemId
    `);
    const existingItem = existingResult.recordset[0];

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
    if (!Number.isFinite(price) || price <= 0) return errorResponse(400, "Price must be a positive number");
    if (!lineId) return errorResponse(400, "Valid collection is required");

    const isSellDress = branchCode === "15";
    await pool
      .request()
      .input("itemId", sql.Int, itemId)
      .input("name", sql.NVarChar(sql.MAX), name)
      .input("price", sql.Decimal(18, 2), price)
      .input("cost", sql.Decimal(18, 2), isSellDress ? 0 : price)
      .input("image", sql.NVarChar(sql.MAX), image || null)
      .input("lineId", sql.Int, lineId)
      .input("isDisabled", sql.Bit, isActive ? 0 : 1)
      .query(`
        UPDATE Items
        SET
          Item_name = @name,
          Item_sellpricNow = @price,
          Item_buypric = @cost,
          PicPath = @image,
          Category_id = @lineId,
          Item_Isdisabled = @isDisabled
        WHERE ID = @itemId
      `);

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

    // Audit: get actor from token
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.split(" ")[1];
    let actorId = "unknown";
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        actorId = decoded.employeeId || decoded.userId || "unknown";
      } catch { }
    }

    logAudit({
      action: "PRODUCT_UPDATE",
      actorId,
      entity: "Product",
      entityId: String(itemId),
      before: { name: existingItem?.Item_name, price: existingItem?.Item_sellpricNow, branch: existingItem?.Store_name },
      after: { name, price, branch: branchCode },
      metadata: getRequestMetadata(request)
    });

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

// ── DELETE /api/items/:id ───────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!(await isAdminRequest(request, "canDeleteProducts"))) {
      return errorResponse(403, "Admin access required or insufficient permissions");
    }

    const itemId = parseInt(params.id, 10);
    if (isNaN(itemId)) {
      return errorResponse(400, "Invalid item ID");
    }

    // Get actor ID from token for audit
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.split(" ")[1];
    let actorId = "unknown";
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        actorId = decoded.employeeId || decoded.userId || "unknown";
      } catch { }
    }

    const pool = await getMssqlPool();

    // Remove from ItemStores (foreign key)
    await pool
      .request()
      .input("itemId", sql.Int, itemId)
      .query(`DELETE FROM ItemStores WHERE ItemID = @itemId`);

    // Hard-delete from Items
    await pool
      .request()
      .input("itemId", sql.Int, itemId)
      .query(`DELETE FROM Items WHERE ID = @itemId`);

    // Prisma cleanup
    try {
      await prisma.$transaction(async (tx) => {
        await tx.review.deleteMany({ where: { productId: String(itemId) } });
        await tx.product.delete({ where: { productId: String(itemId) } }).catch(() => { });
      });
      console.log(`✅ [Prisma] Cleaned up records for item ${itemId}`);
    } catch (prismaErr: any) {
      console.warn(`⚠️ [Prisma] Failed to clean up: ${prismaErr.message}`);
    }

    clearErpProductCaches();

    logAudit({
      action: "PRODUCT_DELETE",
      actorId,
      entity: "Product",
      entityId: String(itemId),
      metadata: getRequestMetadata(request)
    });

    return NextResponse.json({ success: true, message: "Product deleted permanently" });
  } catch (error: any) {
    console.error(`❌ [ERP] Error deleting item ${params.id}:`, error?.message || error);
    return errorResponse(500, "Failed to delete item from ERP");
  }
}