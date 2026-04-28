require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

async function test() {
  try {
    const config = {
      server: process.env.MSSQL_SERVER,
      user: process.env.MSSQL_USER,
      password: process.env.MSSQL_PASSWORD,
      database: process.env.MSSQL_DATABASE,
      options: {
        encrypt: process.env.MSSQL_ENCRYPT === 'true',
        trustServerCertificate: true,
      }
    };
    const pool = await sql.connect(config);
    const res = await pool.request().query('SELECT TOP 5 * FROM Booking ORDER BY ID DESC');
    console.log(JSON.stringify(res.recordset, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
test();
