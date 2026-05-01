import { getMssqlPool, sql } from "./lib/mssql";

async function main() {
  const pool = await getMssqlPool();
  // Find a booking around May 20 to get the ModelTypeID
  const bookings = await pool.request().query(`
    SELECT TOP 10 b.ID, b.ModelTypeID, b.BookingDate, b.ReceivedDate, b.ReturnDate, b.Total, i.Item_buypric
    FROM Booking b
    JOIN Items i ON b.ModelTypeID = i.ID
    WHERE b.ReturnDate >= '2026-04-20'
    ORDER BY b.ReturnDate DESC
  `);
  
  console.log("Recent Bookings:");
  console.dir(bookings.recordset);
  
  process.exit(0);
}

main().catch(console.error);
