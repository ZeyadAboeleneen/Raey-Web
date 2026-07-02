// READ-ONLY focused report. No writes/DDL.
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const sql = require('mssql');
const config = {
  server: process.env.MSSQL_SERVER, database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER, password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }, pool: { max: 1, min: 0 },
};
(async () => {
  let pool;
  try {
    pool = await new sql.ConnectionPool(config).connect();

    console.log('=== Reps (Emps where IsRep=1) ===');
    const reps = await pool.request().query(
      'SELECT ID, Emp_name, Emp_job, BranchID, Emp_IsDisabled FROM Emps WHERE IsRep=1 ORDER BY ID'
    );
    console.table(reps.recordset);

    console.log('=== RepIDs actually used in Users, resolved to Emp_name ===');
    const usedReps = await pool.request().query(`
      SELECT U.RepID, E.Emp_name, COUNT(*) AS users
      FROM Users U LEFT JOIN Emps E ON U.RepID = E.ID
      GROUP BY U.RepID, E.Emp_name ORDER BY U.RepID
    `);
    console.table(usedReps.recordset);

    console.log('=== Branches (full) ===');
    const br = await pool.request().query('SELECT BranchID, BranchName FROM Branches ORDER BY BranchID');
    console.table(br.recordset);

    console.log('=== Users.BranchID resolved against Branches ===');
    const ub = await pool.request().query(`
      SELECT U.BranchID, B.BranchName, COUNT(*) AS users
      FROM Users U LEFT JOIN Branches B ON U.BranchID = B.BranchID
      GROUP BY U.BranchID, B.BranchName ORDER BY U.BranchID
    `);
    console.table(ub.recordset);

    console.log('=== Stores (ID, name, Branch_ID) ===');
    const st = await pool.request().query('SELECT ID, Store_name, Branch_ID FROM Stores ORDER BY ID');
    console.table(st.recordset);

    console.log('=== Booking.BranchID distinct (what web orders/bookings actually use) ===');
    const bb = await pool.request().query('SELECT BranchID, COUNT(*) AS n FROM Booking GROUP BY BranchID ORDER BY BranchID');
    console.table(bb.recordset);
  } catch (e) { console.error('ERR', e.code, e.message); }
  finally { if (pool) await pool.close(); }
})();
