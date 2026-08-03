/* ============================================================================
   Fawry payment ledger — MSSQL (ERP database)

   A dedicated table for the Fawry integration. Deliberately independent of the
   existing `online_transactions` / `payment_companies` tables, which belong to
   another part of the system and are left untouched.

   Run once against the ERP database. Safe to re-run — every statement is guarded.
   ========================================================================== */

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tb_FawryPayments')
BEGIN
    CREATE TABLE dbo.tb_FawryPayments (
        ID                  BIGINT IDENTITY(1,1) NOT NULL,

        /* Our order id, sent to Fawry as merchantRefNum. */
        OrderRef            NVARCHAR(100)  NOT NULL,
        /* Booking.invoice_code for this order, once the booking exists. */
        InvoiceCode         NVARCHAR(50)   NULL,

        /* Fawry's references. */
        FawryRefNumber      NVARCHAR(100)  NULL,
        PaymentRefNumber    NVARCHAR(100)  NULL,

        /* initiated | unpaid | paid | canceled | refunded | expired | failed */
        Status              VARCHAR(20)    NOT NULL CONSTRAINT DF_FawryPayments_Status DEFAULT ('initiated'),

        Amount              DECIMAL(18,2)  NOT NULL CONSTRAINT DF_FawryPayments_Amount DEFAULT (0),
        ExpectedAmount      DECIMAL(18,2)  NOT NULL CONSTRAINT DF_FawryPayments_Expected DEFAULT (0),
        Fees                DECIMAL(18,2)  NOT NULL CONSTRAINT DF_FawryPayments_Fees DEFAULT (0),
        Currency            VARCHAR(3)     NOT NULL CONSTRAINT DF_FawryPayments_Currency DEFAULT ('EGP'),
        PaymentMethod       NVARCHAR(32)   NULL,

        /* Did Fawry's SHA-256 signature verify, and did the amount match. */
        SignatureValid      BIT            NOT NULL CONSTRAINT DF_FawryPayments_SigValid DEFAULT (0),
        AmountVerified      BIT            NOT NULL CONSTRAINT DF_FawryPayments_AmtVerified DEFAULT (0),

        /* Fingerprint of the provider event — the idempotency key. */
        EventHash           VARCHAR(64)    NULL,

        /* Verbatim provider payload, for disputes and audit. */
        RawPayload          NVARCHAR(MAX)  NULL,

        FailureCode         NVARCHAR(64)   NULL,
        FailureReason       NVARCHAR(MAX)  NULL,

        /* tb_Journal.ID of the cash entry posted for this payment, if any. */
        JournalID           INT            NULL,

        ProviderPaidAt      DATETIME       NULL,
        CreatedAt           DATETIME       NOT NULL CONSTRAINT DF_FawryPayments_Created DEFAULT (GETDATE()),
        UpdatedAt           DATETIME       NOT NULL CONSTRAINT DF_FawryPayments_Updated DEFAULT (GETDATE()),

        CONSTRAINT PK_tb_FawryPayments PRIMARY KEY CLUSTERED (ID)
    );
END
GO

/* ---------------------------------------------------------------------------
   Idempotency.

   SQL Server treats NULLs as equal in a UNIQUE constraint, so a plain unique
   index would allow only ONE row with a NULL EventHash. The "initiated" rows
   written when a checkout starts have no event hash yet, so the index must be
   filtered to non-NULL values.

   This is what makes a replayed Fawry callback a no-op: the second insert
   violates the index and the application treats that violation as "already
   applied" rather than as an error.
   --------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_FawryPayments_EventHash')
    CREATE UNIQUE NONCLUSTERED INDEX UX_FawryPayments_EventHash
        ON dbo.tb_FawryPayments (EventHash)
        WHERE EventHash IS NOT NULL;
GO

/* One 'initiated' row per order — repeated checkout attempts update it rather
   than piling up rows before any payment event has arrived. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_FawryPayments_OrderInitiated')
    CREATE UNIQUE NONCLUSTERED INDEX UX_FawryPayments_OrderInitiated
        ON dbo.tb_FawryPayments (OrderRef)
        WHERE Status = 'initiated';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FawryPayments_OrderRef')
    CREATE NONCLUSTERED INDEX IX_FawryPayments_OrderRef ON dbo.tb_FawryPayments (OrderRef);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FawryPayments_FawryRef')
    CREATE NONCLUSTERED INDEX IX_FawryPayments_FawryRef ON dbo.tb_FawryPayments (FawryRefNumber);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FawryPayments_Status')
    CREATE NONCLUSTERED INDEX IX_FawryPayments_Status ON dbo.tb_FawryPayments (Status, CreatedAt);
GO
