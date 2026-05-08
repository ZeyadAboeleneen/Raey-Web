require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

(async () => {
  const pool = await sql.connect({
    server: process.env.MSSQL_SERVER,
    database: process.env.MSSQL_DATABASE,
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true },
  });

  // List all tables
  const tables = await pool.request().query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME"
  );
  console.log("=== ALL TABLES ===");
  tables.recordset.forEach(r => console.log(r.TABLE_NAME));

  // Check if there's an item-store link table we're missing
  const itemStoreCheck = await pool.request().query(
    "SELECT * FROM ItemStores"
  );
  console.log("\n=== ItemStores entries ===");
  console.table(itemStoreCheck.recordset);

  // Check Items columns
  const cols = await pool.request().query(
    "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Items' ORDER BY ORDINAL_POSITION"
  );
  console.log("\n=== Items columns ===");
  cols.recordset.forEach(r => console.log(`  ${r.COLUMN_NAME} (${r.DATA_TYPE})`));

  // Check if Items has a Store/Branch related column
  const storeCol = await pool.request().query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Items' AND (COLUMN_NAME LIKE '%store%' OR COLUMN_NAME LIKE '%branch%' OR COLUMN_NAME LIKE '%Store%' OR COLUMN_NAME LIKE '%Branch%')"
  );
  console.log("\n=== Items store/branch columns ===");
  console.log(storeCol.recordset);

  // Check how many items have bookings with branch info
  const withBranch = await pool.request().query(
    "SELECT COUNT(DISTINCT b.ModelTypeID) as withBookingBranch FROM Booking b WHERE b.BranchID IS NOT NULL AND EXISTS (SELECT 1 FROM Items i WHERE i.ID = b.ModelTypeID AND i.Category_id IN (1,6))"
  );
  console.log("\n=== Items with booking branch ===", withBranch.recordset[0]);

  // Sample items WITHOUT bookings and WITHOUT ItemStores
  const noLink = await pool.request().query(`
    SELECT TOP 5 i.ID, i.Item_name, i.Item_code 
    FROM Items i 
    WHERE i.Category_id IN (1,6) 
      AND i.ID NOT IN (SELECT DISTINCT ModelTypeID FROM Booking WHERE BranchID IS NOT NULL)
      AND i.ID NOT IN (SELECT ItemID FROM ItemStores)
    ORDER BY i.ID DESC
  `);
  console.log("\n=== Sample items with NO branch link ===");
  console.table(noLink.recordset);

  process.exit();
})();
