require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

(async () => {
  try {
    console.log("Connecting to database...");
    const pool = await sql.connect({
      server: process.env.MSSQL_SERVER,
      database: process.env.MSSQL_DATABASE,
      user: process.env.MSSQL_USER,
      password: process.env.MSSQL_PASSWORD,
      options: { encrypt: true, trustServerCertificate: true },
    });
    console.log("Connected successfully!");

    // 1. Categories
    console.log("\n=== CATEGORIES IN DATABASE ===");
    const categories = await pool.request().query("SELECT ID, Name FROM Category");
    console.table(categories.recordset);

    // 2. Count of items per category
    console.log("\n=== ITEMS COUNT PER CATEGORY ===");
    const itemCounts = await pool.request().query(
      "SELECT Category_id, COUNT(*) as Count, SUM(CASE WHEN Item_Isdisabled = 0 THEN 1 ELSE 0 END) as ActiveCount FROM Items GROUP BY Category_id ORDER BY Category_id"
    );
    console.table(itemCounts.recordset);

    // 3. Sample items for Soiree categories
    console.log("\n=== SAMPLE SOIREES ===");
    const sampleSoirees = await pool.request().query(
      "SELECT TOP 10 ID, Item_name, Category_id, Item_sellpricNow, Item_Isdisabled, PicPath FROM Items WHERE Category_id IN (1, 5, 10, 12) AND Item_sellpricNow > 0 ORDER BY ID DESC"
    );
    console.table(sampleSoirees.recordset);

    // 4. Sample items for Wedding categories
    console.log("\n=== SAMPLE WEDDING ===");
    const sampleWeddings = await pool.request().query(
      "SELECT TOP 10 ID, Item_name, Category_id, Item_sellpricNow, Item_Isdisabled, PicPath FROM Items WHERE Category_id IN (6, 11, 13) AND Item_sellpricNow > 0 ORDER BY ID DESC"
    );
    console.table(sampleWeddings.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Database connection/query error:", err);
    process.exit(1);
  }
})();
