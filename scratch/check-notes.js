require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

(async () => {
  try {
    const pool = await sql.connect({
      server: process.env.MSSQL_SERVER,
      database: process.env.MSSQL_DATABASE,
      user: process.env.MSSQL_USER,
      password: process.env.MSSQL_PASSWORD,
      options: { encrypt: true, trustServerCertificate: true },
    });
    
    const result = await pool.request().query(`
      SELECT TOP 10
          ID,
          Item_name,
          Item_code,
          Notes
      FROM Items
      WHERE Notes IS NOT NULL
        AND LTRIM(RTRIM(Notes)) <> '';
    `);
    
    console.log("=== Query Results ===");
    console.table(result.recordset);
  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    process.exit();
  }
})();
