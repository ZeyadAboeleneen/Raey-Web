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

    // New configuration IDs
    const VALID_ERP_LINE_IDS = [1, 5, 6, 9, 10, 11, 12, 13, 18];
    const SOIREE_CAT_IDS = [1, 5, 10, 12, 18];
    const WEDDING_CAT_IDS = [6, 11, 13];

    // Query 1: Total products matching VALID_ERP_LINE_IDS
    const totalCountRes = await pool.request().query(`
      SELECT COUNT(*) as count 
      FROM Items 
      WHERE Item_Isdisabled = 0 
        AND Category_id IN (${VALID_ERP_LINE_IDS.join(",")})
        AND Item_sellpricNow > 0
    `);
    console.log(`\nTotal Active Priced Products (VALID_ERP_LINE_IDS): ${totalCountRes.recordset[0].count}`);

    // Query 2: Soiree count matching SOIREE_CAT_IDS
    const soireeCountRes = await pool.request().query(`
      SELECT COUNT(*) as count 
      FROM Items 
      WHERE Item_Isdisabled = 0 
        AND Category_id IN (${SOIREE_CAT_IDS.join(",")})
        AND Item_sellpricNow > 0
    `);
    console.log(`Active Priced Soiree Products: ${soireeCountRes.recordset[0].count}`);

    // Query 3: Wedding count matching WEDDING_CAT_IDS
    const weddingCountRes = await pool.request().query(`
      SELECT COUNT(*) as count 
      FROM Items 
      WHERE Item_Isdisabled = 0 
        AND Category_id IN (${WEDDING_CAT_IDS.join(",")})
        AND Item_sellpricNow > 0
    `);
    console.log(`Active Priced Wedding Products: ${weddingCountRes.recordset[0].count}`);

    // Query 4: Break down by specific category
    console.log("\n=== Active Priced Products Breakdown ===");
    const breakdownRes = await pool.request().query(`
      SELECT c.Name as CategoryName, i.Category_id, COUNT(*) as Count
      FROM Items i
      LEFT JOIN Category c ON i.Category_id = c.ID
      WHERE i.Item_Isdisabled = 0 
        AND i.Category_id IN (${VALID_ERP_LINE_IDS.join(",")})
        AND i.Item_sellpricNow > 0
      GROUP BY c.Name, i.Category_id
      ORDER BY Count DESC
    `);
    console.table(breakdownRes.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Verification error:", err);
    process.exit(1);
  }
})();
