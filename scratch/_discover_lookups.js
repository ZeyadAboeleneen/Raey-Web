// READ-ONLY discovery of Cash / Branch / Rep lookup tables. No writes/DDL.
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' }); // fallback, does not override
const sql = require('mssql');

const config = {
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  pool: { max: 1, min: 0 },
};

async function cols(pool, table) {
  const r = await pool.request().query(
    `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}' ORDER BY ORDINAL_POSITION`
  );
  return r.recordset.map((c) => `${c.COLUMN_NAME}(${c.DATA_TYPE})`).join(', ');
}

(async () => {
  console.log('DB:', process.env.MSSQL_DATABASE, 'server:', process.env.MSSQL_SERVER);
  let pool;
  try {
    pool = await new sql.ConnectionPool(config).connect();

    // 1. Find candidate lookup tables by name
    const tbls = await pool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE='BASE TABLE'
        AND (TABLE_NAME LIKE '%Cash%' OR TABLE_NAME LIKE '%Branch%'
             OR TABLE_NAME LIKE '%Store%' OR TABLE_NAME LIKE '%Rep%'
             OR TABLE_NAME LIKE '%Emp%' OR TABLE_NAME='Users')
      ORDER BY TABLE_NAME
    `);
    console.log('\n=== Candidate tables ===');
    console.log(tbls.recordset.map((t) => t.TABLE_NAME).join('\n'));

    // 2. Cashes contents
    console.log('\n=== Cashes columns ===');
    console.log(await cols(pool, 'Cashes'));
    const cashes = await pool.request().query('SELECT TOP 50 * FROM Cashes ORDER BY ID');
    console.log('=== Cashes rows ===');
    console.table(cashes.recordset);

    // 3. Distinct BranchID / CashID / RepID actually used in Users
    console.log('\n=== Distinct CashID/BranchID/RepID in Users ===');
    const used = await pool.request().query(`
      SELECT 'CashID' AS field, CashID AS val, COUNT(*) AS n FROM Users GROUP BY CashID
      UNION ALL SELECT 'BranchID', BranchID, COUNT(*) FROM Users GROUP BY BranchID
      UNION ALL SELECT 'RepID', RepID, COUNT(*) FROM Users GROUP BY RepID
      ORDER BY field, val
    `);
    console.table(used.recordset);

    // 4. Try to locate a Branch/Store lookup table and a Rep lookup table dynamically
    for (const name of ['Stores', 'Store', 'Branches', 'Branch', 'Reps', 'Rep', 'Representatives', 'Employees', 'Emp']) {
      const exists = await pool.request().query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='${name}'`
      );
      if (exists.recordset[0].c > 0) {
        console.log(`\n=== ${name} columns ===`);
        console.log(await cols(pool, name));
        try {
          const rows = await pool.request().query(`SELECT TOP 30 * FROM [${name}] ORDER BY 1`);
          console.log(`=== ${name} rows (top 30) ===`);
          console.table(rows.recordset);
        } catch (e) { console.log(`(could not select from ${name}: ${e.message})`); }
      }
    }
  } catch (e) {
    console.error('ERR', e.code, e.message);
  } finally {
    if (pool) await pool.close();
  }
})();
