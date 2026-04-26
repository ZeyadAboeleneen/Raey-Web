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

async function checkSchema() {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Booking'");
    console.log(JSON.stringify(result.recordset, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkSchema();
