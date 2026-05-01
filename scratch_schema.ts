import { getMssqlPool } from "./lib/mssql";

async function main() {
  const pool = await getMssqlPool();
  try {
    const result = await pool.request().query(`
      SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Booking' 
        AND DATA_TYPE IN ('nvarchar', 'varchar', 'char', 'nchar')
    `);
    console.table(result.recordset);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}

main().catch(console.error);
