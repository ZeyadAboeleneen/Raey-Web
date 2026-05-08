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

  const correlation = await pool.request().query(`
    SELECT 
      s.Store_name,
      SUBSTRING(i.Item_name, 1, 1) as Prefix,
      COUNT(*) as Count
    FROM Items i
    JOIN Booking b ON b.ModelTypeID = i.ID
    JOIN Stores s ON b.BranchID = s.Branch_ID
    WHERE i.Category_id IN (1,6)
    GROUP BY s.Store_name, SUBSTRING(i.Item_name, 1, 1)
    ORDER BY s.Store_name, Count DESC
  `);
  console.table(correlation.recordset);

  process.exit();
})();
