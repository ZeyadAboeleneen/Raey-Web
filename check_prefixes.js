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

  const prefixes = await pool.request().query("SELECT SUBSTRING(Item_name, 1, 1) as Prefix, COUNT(*) as Count FROM Items WHERE Category_id IN (1,6) GROUP BY SUBSTRING(Item_name, 1, 1) ORDER BY Count DESC");
  console.table(prefixes.recordset);

  const sampleMissing = await pool.request().query("SELECT TOP 10 ID, Item_name FROM Items WHERE Category_id IN (1,6) AND ID NOT IN (SELECT DISTINCT ModelTypeID FROM Booking WHERE BranchID IS NOT NULL) AND ID NOT IN (SELECT ItemID FROM tb_ItemStores)");
  console.table(sampleMissing.recordset);

  process.exit();
})();
