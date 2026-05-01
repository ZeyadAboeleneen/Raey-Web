import { getMssqlPool, sql } from "./lib/mssql";

async function main() {
  const pool = await getMssqlPool();
  try {
    const result = await pool.request()
      .input("RentStart", sql.Date, "2026-05-21")
      .query(`SELECT @RentStart as rs`);
    console.log(result.recordset);
  } catch(e) {
    console.error("String error:", e);
  }
  
  try {
    const result2 = await pool.request()
      .input("RentStart", sql.Date, new Date("2026-05-21T00:00:00Z"))
      .query(`SELECT @RentStart as rs`);
    console.log(result2.recordset);
  } catch(e) {
    console.error("Date error:", e);
  }
  
  process.exit(0);
}

main().catch(console.error);
