import sql from "mssql";

async function test() {
  try {
    await sql.connect({
      server: "SQL8005.site4now.net",
      database: "db_a9c631_wael",
      user: "db_a9c631_wael_admin",
      password: "Omarwael3@",
      options: { encrypt: false, trustServerCertificate: true },
      port: 1433
    });
    
    const result = await sql.query(`
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
test();
