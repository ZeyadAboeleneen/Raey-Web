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

  const tbItemStores = await pool.request().query("SELECT TOP 10 * FROM tb_ItemStores");
  console.log("=== tb_ItemStores entries ===");
  console.table(tbItemStores.recordset);

  const count = await pool.request().query("SELECT COUNT(*) as total FROM tb_ItemStores");
  console.log("Total tb_ItemStores:", count.recordset[0].total);

  process.exit();
})();
