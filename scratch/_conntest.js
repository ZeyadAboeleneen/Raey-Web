require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');
console.log("server:", process.env.MSSQL_SERVER, "db:", process.env.MSSQL_DATABASE, "user:", process.env.MSSQL_USER, "passLen:", (process.env.MSSQL_PASSWORD||'').length);
const config = { server: process.env.MSSQL_SERVER, database: process.env.MSSQL_DATABASE, user: process.env.MSSQL_USER, password: process.env.MSSQL_PASSWORD, options: { encrypt: true, trustServerCertificate: true }, pool: { max: 1, min: 0 } };
(async () => {
  let pool;
  try {
    pool = await new sql.ConnectionPool(config).connect();
    const r = await pool.request().query("SELECT 1 AS ok, SUSER_SNAME() AS who");
    console.log("OK", JSON.stringify(r.recordset));
  } catch (e) { console.error("ERR", e.code, e.message); }
  finally { if (pool) await pool.close(); }
})();
