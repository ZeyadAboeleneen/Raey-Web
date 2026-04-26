require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

const config = {
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

async function checkBookings() {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query("SELECT TOP 5 ID, invoice_code, DeviceTypeID, ModelTypeID, Emp_ID, CurrencyID, UserID, ApprovedID FROM Booking ORDER BY ID DESC");
    console.table(result.recordset);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkBookings();
