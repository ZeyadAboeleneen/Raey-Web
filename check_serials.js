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

  const serials = await pool.request().query("SELECT TOP 10 * FROM Item_Serials");
  console.log("=== Item_Serials entries ===");
  console.table(serials.recordset);

  const cols = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Item_Serials'");
  console.log("=== Item_Serials columns ===");
  console.table(cols.recordset);

  process.exit();
})();
