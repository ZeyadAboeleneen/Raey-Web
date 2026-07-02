// READ-ONLY follow-up discovery for Rep + Branch sources. No writes/DDL.
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const sql = require('mssql');
const config = {
  server: process.env.MSSQL_SERVER, database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER, password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }, pool: { max: 1, min: 0 },
};
async function colsOf(pool, t) {
  const r = await pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t}' ORDER BY ORDINAL_POSITION`);
  return r.recordset.map(c => `${c.COLUMN_NAME}(${c.DATA_TYPE})`).join(', ');
}
(async () => {
  let pool;
  try {
    pool = await new sql.ConnectionPool(config).connect();

    console.log('=== Emps columns ==='); console.log(await colsOf(pool, 'Emps'));
    const emps = await pool.request().query('SELECT TOP 60 * FROM Emps ORDER BY 1');
    console.log('=== Emps rows ==='); console.table(emps.recordset);

    console.log('\n=== Co-Branches columns ==='); console.log(await colsOf(pool, 'Co-Branches'));
    try { const cb = await pool.request().query('SELECT TOP 60 * FROM [Co-Branches] ORDER BY 1'); console.table(cb.recordset); } catch(e){console.log(e.message);}

    console.log('\n=== Stores: ID, name, Branch_ID ===');
    const st = await pool.request().query('SELECT ID, Store_name, Branch_ID, Store_IsDisabled FROM Stores ORDER BY ID');
    console.table(st.recordset);

    // Which table has rows whose ID set == Users.BranchID {1,3,5,7,8,9}?
    console.log('\n=== Users.BranchID values vs Branches/Stores/Co-Branches ===');
    const probe = await pool.request().query(`
      SELECT 'Branches.BranchID' AS src, BranchID AS id FROM Branches
      UNION ALL SELECT 'Stores.Branch_ID', Branch_ID FROM Stores
      UNION ALL SELECT 'Stores.ID', ID FROM Stores
    `);
    console.table(probe.recordset);
  } catch (e) { console.error('ERR', e.code, e.message); }
  finally { if (pool) await pool.close(); }
})();
