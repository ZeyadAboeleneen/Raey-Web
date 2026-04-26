import { type NextRequest, NextResponse } from "next/server";
import { getMssqlPool, sql } from "@/lib/mssql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/items/[id]/availability?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Checks whether a dress (by ERP Item ID) is available for rental
 * in the requested date range by querying the MSSQL Booking table.
 *
 * A dress is NOT available if any existing booking overlaps:
 *   requestedStart <= existingReturnDate AND requestedEnd >= existingReceivedDate
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const itemId = parseInt(params.id, 10);
    if (isNaN(itemId)) {
      return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    const pool = await getMssqlPool();

    // If no start/end provided, fetch ALL future bookings
    if (!start || !end) {
      const result = await pool
        .request()
        .input("itemId", sql.Int, itemId)
        .input("today", sql.Date, new Date())
        .query(`
          SELECT 
            ID AS BookingID,
            ReceivedDate,
            ReturnDate
          FROM Booking
          WHERE ModelTypeID = @itemId
            AND ReturnDate >= @today
        `);

      return NextResponse.json({
        bookings: result.recordset.map((b: any) => ({
          from: b.ReceivedDate,
          to: b.ReturnDate,
        })),
      });
    }

    // Validate date format if start/end are provided
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    if (endDate < startDate) {
      return NextResponse.json(
        { error: "End date must be after start date" },
        { status: 400 }
      );
    }

    // Check for overlapping bookings
    const result = await pool
      .request()
      .input("itemId", sql.Int, itemId)
      .input("requestedStart", sql.Date, start)
      .input("requestedEnd", sql.Date, end)
      .query(`
        SELECT 
          ID AS BookingID,
          ReceivedDate,
          ReturnDate
        FROM Booking
        WHERE ModelTypeID = @itemId
          AND @requestedStart < ReturnDate
          AND @requestedEnd >= ReceivedDate
      `);

    const conflicting = result.recordset;
    const available = conflicting.length === 0;

    return NextResponse.json({
      available,
      itemId,
      requestedStart: start,
      requestedEnd: end,
      ...(available
        ? {}
        : {
            message: "This dress is already booked for the selected dates",
            conflictingBookings: conflicting.map((b: any) => ({
              from: b.ReceivedDate,
              to: b.ReturnDate,
            })),
          }),
    });
  } catch (error: any) {
    console.error(
      `❌ [ERP] Error checking availability for item ${params.id}:`,
      error?.message || error
    );
    return NextResponse.json(
      { error: "Failed to check availability" },
      { status: 500 }
    );
  }
}
