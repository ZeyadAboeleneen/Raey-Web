require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');
const config = { server: process.env.MSSQL_SERVER, database: process.env.MSSQL_DATABASE, user: process.env.MSSQL_USER, password: process.env.MSSQL_PASSWORD, options: { encrypt: true, trustServerCertificate: true }, pool:{max:1} };
(async () => {
  let pool;
  const now = new Date();
  const invoiceCode = "WEB-SMOKE1";
  let realModelId=1; const userId=19, branchId=1, cashId=11, empId=18, cashAccount=569, depAccount=173;
  const finalPrice=4000, deposit=1000, remaining=3000;
  try {
    pool = await new sql.ConnectionPool(config).connect();
    const txn = new sql.Transaction(pool);
    const mid=await pool.request().query("SELECT TOP 1 ID FROM Items ORDER BY ID DESC"); realModelId=mid.recordset[0].ID; console.log("using Items.ID=",realModelId); await txn.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const b = await new sql.Request(txn)
        .input("invoice_code", sql.NVarChar, invoiceCode).input("Cust_Name", sql.NVarChar, "SMOKE")
        .input("Cust_Tel", sql.NVarChar, "").input("Cust_Mobile", sql.NVarChar, "").input("Cust_Address", sql.NVarChar, "")
        .input("DeviceTypeID", sql.Int, 0).input("ModelTypeID", sql.Int, realModelId).input("Scarves", sql.Bit, 0)
        .input("CashMayo", sql.Bit, 0).input("Other", sql.Bit, 0).input("OtheNote", sql.NVarChar, "")
        .input("BookingDate", sql.DateTime, now).input("ReceivedDate", sql.DateTime, now).input("ReturnDate", sql.DateTime, new Date(now.getTime()+86400000))
        .input("Emp_ID", sql.Int, empId).input("CurrencyID", sql.Int, 1).input("ExRate", sql.Decimal(18,2), 1)
        .input("Total", sql.Decimal(18,2), finalPrice).input("Deposit", sql.Decimal(18,2), deposit).input("Remaining", sql.Decimal(18,2), remaining)
        .input("NoteItem", sql.NVarChar, "smoke").input("BreastSize", sql.NVarChar, "").input("WaistSize", sql.NVarChar, "")
        .input("ButtocksSize", sql.NVarChar, "").input("SleeveSize", sql.NVarChar, "").input("ApprovedID", sql.Int, 1)
        .input("Desc_Customer", sql.NVarChar, "").input("BranchID", sql.Int, branchId).input("UserID", sql.Int, userId)
        .input("CashID", sql.Int, cashId).input("CariedOver", sql.Bit, 0).input("LastUpdate", sql.DateTime, now)
        .input("Transfer", sql.Bit, 0).input("Paid", sql.Decimal(18,2), 0).input("PersonalityinvestigationId", sql.Int, 0)
        .input("GuaranteeAmount", sql.Decimal(18,2), 0).input("GuaranteeNote", sql.NVarChar, "").input("ReturnNote", sql.NVarChar, "")
        .input("AdditionalCost", sql.Decimal(18,2), 0).input("First", sql.Bit, 1).input("OccasionDate", sql.DateTime, now)
        .query(`DECLARE @bk TABLE(ID INT); INSERT INTO Booking (invoice_code,Cust_Name,Cust_Tel,Cust_Mobile,Cust_Address,DeviceTypeID,ModelTypeID,Scarves,CashMayo,Other,OtheNote,BookingDate,ReceivedDate,ReturnDate,Emp_ID,CurrencyID,ExRate,Total,Deposit,Remaining,NoteItem,BreastSize,WaistSize,ButtocksSize,SleeveSize,ApprovedID,Desc_Customer,BranchID,UserID,CashID,CariedOver,LastUpdate,Transfer,Paid,PersonalityinvestigationId,GuaranteeAmount,GuaranteeNote,ReturnNote,AdditionalCost,First,OccasionDate) OUTPUT INSERTED.ID INTO @bk VALUES (@invoice_code,@Cust_Name,@Cust_Tel,@Cust_Mobile,@Cust_Address,@DeviceTypeID,@ModelTypeID,@Scarves,@CashMayo,@Other,@OtheNote,@BookingDate,@ReceivedDate,@ReturnDate,@Emp_ID,@CurrencyID,@ExRate,@Total,@Deposit,@Remaining,@NoteItem,@BreastSize,@WaistSize,@ButtocksSize,@SleeveSize,@ApprovedID,@Desc_Customer,@BranchID,@UserID,@CashID,@CariedOver,@LastUpdate,@Transfer,@Paid,@PersonalityinvestigationId,@GuaranteeAmount,@GuaranteeNote,@ReturnNote,@AdditionalCost,@First,@OccasionDate); SELECT ID FROM @bk;`);
      const bookingId = b.recordset[0].ID;
      console.log("Booking insert OK, ID =", bookingId);
      const j = await new sql.Request(txn)
        .input("JDate", sql.DateTime, now).input("JBookNo", sql.Int, 0).input("JTotalDeptor", sql.Decimal(18,2), deposit)
        .input("JTotalCredator", sql.Decimal(18,2), deposit).input("JSourceID", sql.Int, 29).input("CarryOvered", sql.Bit, 0)
        .input("Notes", sql.NVarChar, `اذن حجز رقم ${invoiceCode}`).input("RecID", sql.Int, bookingId).input("Deleted", sql.Bit, 0)
        .input("BranchID", sql.Int, branchId).input("CashID", sql.Int, cashId).input("User_ID", sql.Int, userId)
        .input("EnableCarryOver", sql.Int, 0).input("LastUpdate", sql.DateTime, now).input("Transfer", sql.Bit, 0)
        .input("PRD", sql.Int, 0).input("No", sql.Int, 0).input("JType", sql.Int, 1).input("PRG", sql.Int, 0)
        .input("PrevPRD", sql.Int, 0).input("AddedDate", sql.DateTime, now)
        .query(`DECLARE @jr TABLE(ID INT); INSERT INTO tb_Journal (JDate,JBookNo,JTotalDeptor,JTotalCredator,JSourceID,CarryOvered,Notes,RecID,Deleted,BranchID,CashID,User_ID,EnableCarryOver,LastUpdate,Transfer,PRD,No,JType,PRG,PrevPRD,AddedDate) OUTPUT INSERTED.ID INTO @jr VALUES (@JDate,@JBookNo,@JTotalDeptor,@JTotalCredator,@JSourceID,@CarryOvered,@Notes,@RecID,@Deleted,@BranchID,@CashID,@User_ID,@EnableCarryOver,@LastUpdate,@Transfer,@PRD,@No,@JType,@PRG,@PrevPRD,@AddedDate); SELECT ID FROM @jr;`);
      const journalId = j.recordset[0].ID;
      console.log("tb_Journal insert OK, ID =", journalId);
      await new sql.Request(txn)
        .input("J_ID", sql.Int, journalId).input("Deptor", sql.Decimal(18,2), deposit)
        .input("AccountCash", sql.Int, cashAccount).input("AccountDep", sql.Int, depAccount)
        .input("DescCash", sql.NVarChar, `عربون اذن حجز رقم ${invoiceCode}`).input("DescDep", sql.NVarChar, `عربون اذن حجز رقم ${invoiceCode}`)
        .input("JCDate", sql.DateTime, now).input("User_ID", sql.Int, userId)
        .query(`INSERT INTO tb_JournalDet (J_ID,Deptor,Creditor,AccountID,Description,CostCenterID,CurrencyID,ExRate,isbill,JCDate,User_ID) VALUES (@J_ID,@Deptor,0,@AccountCash,@DescCash,0,1,1,0,@JCDate,@User_ID),(@J_ID,0,@Deptor,@AccountDep,@DescDep,0,1,1,0,@JCDate,@User_ID)`);
      console.log("tb_JournalDet insert OK (2 lines)");
      await txn.rollback();
      console.log("ROLLED BACK — all INSERT statements valid, nothing persisted.");
    } catch (e) { try{await txn.rollback()}catch{}; console.error("INSERT FAILED:", e.message); }
  } catch (e) { console.error("CONN ERR", e.code, e.message); }
  finally { if(pool) await pool.close(); }
})();
