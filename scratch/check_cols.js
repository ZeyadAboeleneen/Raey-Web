const sql = require('mssql');
require('dotenv').config({ path: '.env.local' });

(async () => {
  try {
    await sql.connect({
      server: process.env.MSSQL_SERVER,
      database: process.env.MSSQL_DATABASE,
      user: process.env.MSSQL_USER,
      password: process.env.MSSQL_PASSWORD,
      options: { encrypt: true, trustServerCertificate: true },
    });
    const res = await sql.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tb_ItemStores'");
    console.log(JSON.stringify(res.recordset, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
})();
