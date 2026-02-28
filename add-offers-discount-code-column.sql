-- Add discount_code column to offers table
-- Run this in your Supabase SQL Editor

ALTER TABLE offers 
ADD COLUMN IF NOT EXISTS discount_code TEXT;

-- Add a comment to document the column
COMMENT ON COLUMN offers.discount_code IS 'Optional discount code associated with this offer';

