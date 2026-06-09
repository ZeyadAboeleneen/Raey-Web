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

  const result = await pool.request().query(`
    SELECT TOP 10 ID, Item_name, sku, Item_code
    FROM Items
    WHERE sku IS NOT NULL AND sku != ''
  `);
  console.log("=== Items with SKU in MSSQL ===");
  console.table(result.recordset);

  process.exit();
})();
