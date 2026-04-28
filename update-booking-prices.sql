-- =============================================================
-- Dress Rental Pricing System — Backfill Existing Bookings
-- Run AFTER pricing-migration.sql to update historical records.
-- =============================================================

WITH RankedRentals AS (
    SELECT
        B.ID                                        AS BookingID,
        B.ModelTypeID,
        B.BookingDate,
        B.ReceivedDate,
        B.ReturnDate,
        B.IsExclusive,
        I.Item_buypric                              AS cost,
        DATEDIFF(DAY, B.BookingDate, B.ReceivedDate) AS d,
        ROW_NUMBER() OVER (
            PARTITION BY B.ModelTypeID
            ORDER BY B.BookingDate ASC
        )                                           AS RentalNumber
    FROM Booking B
    INNER JOIN Items I ON B.ModelTypeID = I.ID
    WHERE B.ReceivedDate IS NOT NULL
),
First4Prices AS (
    SELECT
        BookingID,
        ModelTypeID,
        RentalNumber,
        cost,
        d,
        IsExclusive,
        CASE
            WHEN IsExclusive = 1
                THEN ROUND((cost * 1.1) / 100, 0) * 100
            WHEN d BETWEEN 1 AND 15
                THEN ROUND((cost * 0.8) / 100, 0) * 100
            WHEN d BETWEEN 16 AND 45
                THEN ROUND((cost * (0.8 - (0.2 / 15.0) * (d - 15))) / 100, 0) * 100
            ELSE ROUND((cost * 0.8) / 100, 0) * 100
        END                                         AS CalculatedPrice
    FROM RankedRentals
    WHERE RentalNumber <= 4
),
MinPrice AS (
    SELECT
        ModelTypeID,
        MIN(CalculatedPrice)                        AS P_min
    FROM First4Prices
    GROUP BY ModelTypeID
),
AllRentals AS (
    SELECT
        F.BookingID,
        F.ModelTypeID,
        F.RentalNumber,
        F.CalculatedPrice                           AS Total,
        CASE
            WHEN F.IsExclusive = 1 THEN 'F'
            WHEN F.d BETWEEN 1 AND 15 THEN 'A'
            WHEN F.d BETWEEN 16 AND 30 THEN 'B'
            WHEN F.d BETWEEN 31 AND 45 THEN 'C'
            ELSE 'A'
        END                                         AS PriceCategory
    FROM First4Prices F

    UNION ALL

    SELECT
        R.BookingID,
        R.ModelTypeID,
        R.RentalNumber,
        -- Apply 3000 EGP floor
        CASE
            WHEN M.P_min - (500 * (R.RentalNumber - 3)) < 3000 THEN 3000
            ELSE M.P_min - (500 * (R.RentalNumber - 3))
        END                                         AS Total,
        'P'                                         AS PriceCategory
    FROM RankedRentals R
    INNER JOIN MinPrice M ON R.ModelTypeID = M.ModelTypeID
    WHERE R.RentalNumber > 4
)

UPDATE B
SET
    B.Total         = A.Total,
    B.PriceCategory = A.PriceCategory
FROM Booking B
INNER JOIN AllRentals A ON B.ID = A.BookingID;
