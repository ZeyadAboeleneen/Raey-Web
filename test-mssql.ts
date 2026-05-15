import { getMssqlPool } from "./lib/mssql";

async function main() {
  const pool = await getMssqlPool();
  try {
    const result = await pool.request().query(`
      SELECT TOP 5 * FROM tb_ItemStores
    `);
    console.log("ItemStores:", result.recordset);
    
    const result2 = await pool.request().query(`
      SELECT TOP 5 * FROM Stores
    `);
    console.log("Stores:", result2.recordset);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
main();
