require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

const BRANCH_ID_TO_CODE = {
  3: "E",   // el-raey-1
  9: "M",   // mona-saleh
  7: "D",   // el-raey-2
  5: "R",   // el-raey-the-yard
  1: "15",  // sell-dresses
};

const branchMapLocal = {
  E: "el-raey-1",
  M: "mona-saleh",
  D: "el-raey-2",
  R: "el-raey-the-yard",
  "15": "sell-dresses",
};

function mapBookingBranchIdToSlug(branchId) {
  if (branchId === null || branchId === undefined) return null;
  const code = BRANCH_ID_TO_CODE[branchId];
  return code ? (branchMapLocal[code] ?? null) : null;
}

function resolveBranchSlugFromErpRowLocal(row) {
  const fromId = mapBookingBranchIdToSlug(row.BranchID ?? null);
  if (fromId) return fromId;

  const raw = (row.StoreName || "").trim();
  if (raw) {
    const upper = raw.toUpperCase();
    if (branchMapLocal[upper]) return branchMapLocal[upper];
    if (branchMapLocal[raw]) return branchMapLocal[raw];

    const letter = upper.charAt(0);
    if (branchMapLocal[letter]) return branchMapLocal[letter];
  }

  // Fallback to Item_name
  const itemName = (row.Item_name || "").trim().toUpperCase();
  if (itemName) {
    const firstLetter = itemName.charAt(0);
    if (branchMapLocal[firstLetter]) return branchMapLocal[firstLetter];
  }

  return null;
}

(async () => {
  const pool = await sql.connect({
    server: process.env.MSSQL_SERVER,
    database: process.env.MSSQL_DATABASE,
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true },
  });

  const query = `
      SELECT
        i.ID          AS ItemID,
        i.Item_name,
        b.BranchID,
        s.Store_name  AS StoreName,
        istore.Branch_ID AS ItemStoreBranchID,
        istore.Store_name AS ItemStoreName,
        fallback.FallbackStoreName
      FROM Items i
      LEFT JOIN Category c ON i.Category_id = c.ID
      LEFT JOIN Booking  b ON b.ModelTypeID  = i.ID AND b.ReturnDate >= CAST(GETDATE() AS DATE)
      LEFT JOIN Stores   s ON b.BranchID     = s.Branch_ID
      LEFT JOIN (
          SELECT itemst.ItemID, st.Store_name, st.Branch_ID 
          FROM tb_ItemStores itemst 
          JOIN Stores st ON itemst.StoreID = st.ID
      ) istore ON istore.ItemID = i.ID
      OUTER APPLY (
          SELECT TOP 1 s2.Store_name AS FallbackStoreName
          FROM Booking b2
          JOIN Stores s2 ON b2.BranchID = s2.Branch_ID
          WHERE b2.ModelTypeID = i.ID
          ORDER BY b2.ID DESC
      ) fallback
      WHERE i.Category_id IN (1, 6)
  `;

  const result = await pool.request().query(query);
  const rows = result.recordset;

  let total = rows.length;
  let resolved = 0;
  const branches = {};

  rows.forEach(row => {
    const branchIdToUse = row.ItemStoreBranchID ?? row.BranchID ?? null;
    const storeNameToUse = row.ItemStoreName ?? row.StoreName ?? row.FallbackStoreName ?? null;
    
    const branch = resolveBranchSlugFromErpRowLocal({
        BranchID: branchIdToUse,
        StoreName: storeNameToUse,
        Item_name: row.Item_name
    });

    if (branch) {
      resolved++;
      branches[branch] = (branches[branch] || 0) + 1;
    }
  });

  console.log(`Total items: ${total}`);
  console.log(`Resolved branches: ${resolved}`);
  console.log(`Still null: ${total - resolved}`);
  console.log('Branch distribution:', branches);

  process.exit();
})();
