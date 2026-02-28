-- Add columns to discount_codes table for special discount types
-- Run this in your Supabase SQL Editor

-- Add original_type column to store the actual discount type (buyXgetX, buyXgetYpercent, etc.)
ALTER TABLE discount_codes 
ADD COLUMN IF NOT EXISTS original_type TEXT;

-- Add buy_x column for buyXgetX and buyXgetYpercent types
ALTER TABLE discount_codes 
ADD COLUMN IF NOT EXISTS buy_x INTEGER;

-- Add get_x column for buyXgetX type
ALTER TABLE discount_codes 
ADD COLUMN IF NOT EXISTS get_x INTEGER;

-- Add discount_percentage column for buyXgetYpercent type
ALTER TABLE discount_codes 
ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC;

-- Add comments to document the columns
COMMENT ON COLUMN discount_codes.original_type IS 'Stores the original discount type (buyXgetX, buyXgetYpercent) when different from discount_type';
COMMENT ON COLUMN discount_codes.buy_x IS 'Number of items to buy for buyXgetX and buyXgetYpercent discount types';
COMMENT ON COLUMN discount_codes.get_x IS 'Number of items to get free for buyXgetX discount type';
COMMENT ON COLUMN discount_codes.discount_percentage IS 'Discount percentage for buyXgetYpercent discount type';

