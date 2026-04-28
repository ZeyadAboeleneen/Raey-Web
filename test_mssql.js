require('dotenv').config({ path: '.env.local' });
const { getMssqlPool, sql } = require('./lib/mssql.js');

async function test() {
  try {
    const pool = await getMssqlPool();
    await pool.request()
      .input('invoice_code', sql.NVarChar, 'WEB-TEST01')
      .input('Cust_Name', sql.NVarChar, 'Test User')
      .input('Cust_Tel', sql.NVarChar, '123456')
      .input('Cust_Mobile', sql.NVarChar, '123456')
      .input('Cust_Address', sql.NVarChar, 'Test')
      .input('DeviceTypeID', sql.Int, 0)
      .input('ModelTypeID', sql.Int, 3998)
      .input('Scarves', sql.Bit, 0)
      .input('CashMayo', sql.Bit, 0)
      .input('Other', sql.Bit, 0)
      .input('OtheNote', sql.NVarChar, '')
      .input('BookingDate', sql.DateTime, new Date())
      .input('ReceivedDate', sql.DateTime, new Date())
      .input('ReturnDate', sql.DateTime, new Date())
      .input('Emp_ID', sql.Int, 1)
      .input('CurrencyID', sql.Int, 1)
      .input('ExRate', sql.Decimal(18, 2), 1.0)
      .input('Total', sql.Decimal(18, 2), 100)
      .input('Deposit', sql.Decimal(18, 2), 0)
      .input('Remaining', sql.Decimal(18, 2), 100)
      .input('NoteItem', sql.NVarChar, 'Test')
      .input('BreastSize', sql.NVarChar, '')
      .input('WaistSize', sql.NVarChar, '')
      .input('ButtocksSize', sql.NVarChar, '')
      .input('SleeveSize', sql.NVarChar, '')
      .input('ApprovedID', sql.Int, 1)
      .input('Desc_Customer', sql.NVarChar, '')
      .input('BranchID', sql.Int, 15)
      .input('UserID', sql.Int, 1)
      .input('CariedOver', sql.Bit, 0)
      .input('LastUpdate', sql.DateTime, new Date())
      .input('Transfer', sql.Bit, 0)
      .input('Paid', sql.Decimal(18, 2), 0)
      .input('PersonalityinvestigationId', sql.Int, 0)
      .input('GuaranteeAmount', sql.Decimal(18, 2), 0)
      .input('GuaranteeNote', sql.NVarChar, '')
      .input('ReturnNote', sql.NVarChar, '')
      .input('AdditionalCost', sql.Decimal(18, 2), 0)
      .input('First', sql.Bit, 1)
      .input('OccasionDate', sql.DateTime, new Date())
      .input('IsExclusive', sql.Bit, 0)
      .input('PriceCategory', sql.NVarChar(1), 'A')
      .query(`
        INSERT INTO Booking (
          invoice_code, Cust_Name, Cust_Tel, Cust_Mobile, Cust_Address,
          DeviceTypeID, ModelTypeID, Scarves, CashMayo, Other, OtheNote,
          BookingDate, ReceivedDate, ReturnDate, Emp_ID, CurrencyID,
          ExRate, Total, Deposit, Remaining, NoteItem,
          BreastSize, WaistSize, ButtocksSize, SleeveSize,
          ApprovedID, Desc_Customer, BranchID, UserID, CariedOver,
          LastUpdate, Transfer, Paid, PersonalityinvestigationId,
          GuaranteeAmount, GuaranteeNote, ReturnNote, AdditionalCost,
          First, OccasionDate, IsExclusive, PriceCategory
        ) VALUES (
          @invoice_code, @Cust_Name, @Cust_Tel, @Cust_Mobile, @Cust_Address,
          @DeviceTypeID, @ModelTypeID, @Scarves, @CashMayo, @Other, @OtheNote,
          @BookingDate, @ReceivedDate, @ReturnDate, @Emp_ID, @CurrencyID,
          @ExRate, @Total, @Deposit, @Remaining, @NoteItem,
          @BreastSize, @WaistSize, @ButtocksSize, @SleeveSize,
          @ApprovedID, @Desc_Customer, @BranchID, @UserID, @CariedOver,
          @LastUpdate, @Transfer, @Paid, @PersonalityinvestigationId,
          @GuaranteeAmount, @GuaranteeNote, @ReturnNote, @AdditionalCost,
          @First, @OccasionDate, @IsExclusive, @PriceCategory
        )
      `);
    console.log('Success!');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}
test();
