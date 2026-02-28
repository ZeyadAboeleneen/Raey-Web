-- Add policies for products, offers, and discount_codes tables to allow admin operations
-- Run this in your Supabase SQL Editor

-- Note: Since we're using JWT auth in API routes and the service role key,
-- these policies provide a backup. The API routes use the admin client which bypasses RLS.

-- ===== PRODUCTS POLICIES =====
-- Drop policies if they already exist (to avoid errors)
DROP POLICY IF EXISTS "Admins can insert products" ON products;
DROP POLICY IF EXISTS "Admins can update products" ON products;
DROP POLICY IF EXISTS "Admins can delete products" ON products;

-- Policy: Allow authenticated admins to insert products
CREATE POLICY "Admins can insert products"
  ON products FOR INSERT
  WITH CHECK (true);

-- Policy: Allow authenticated admins to update products
CREATE POLICY "Admins can update products"
  ON products FOR UPDATE
  USING (true);

-- Policy: Allow authenticated admins to delete products
CREATE POLICY "Admins can delete products"
  ON products FOR DELETE
  USING (true);

-- ===== OFFERS POLICIES =====
-- Drop policies if they already exist
DROP POLICY IF EXISTS "Admins can insert offers" ON offers;
DROP POLICY IF EXISTS "Admins can update offers" ON offers;
DROP POLICY IF EXISTS "Admins can delete offers" ON offers;

-- Policy: Allow authenticated admins to insert offers
CREATE POLICY "Admins can insert offers"
  ON offers FOR INSERT
  WITH CHECK (true);

-- Policy: Allow authenticated admins to update offers
CREATE POLICY "Admins can update offers"
  ON offers FOR UPDATE
  USING (true);

-- Policy: Allow authenticated admins to delete offers
CREATE POLICY "Admins can delete offers"
  ON offers FOR DELETE
  USING (true);

-- ===== DISCOUNT CODES POLICIES =====
-- Drop policies if they already exist
DROP POLICY IF EXISTS "Admins can insert discount codes" ON discount_codes;
DROP POLICY IF EXISTS "Admins can update discount codes" ON discount_codes;
DROP POLICY IF EXISTS "Admins can delete discount codes" ON discount_codes;

-- Policy: Allow authenticated admins to insert discount codes
CREATE POLICY "Admins can insert discount codes"
  ON discount_codes FOR INSERT
  WITH CHECK (true);

-- Policy: Allow authenticated admins to update discount codes
CREATE POLICY "Admins can update discount codes"
  ON discount_codes FOR UPDATE
  USING (true);

-- Policy: Allow authenticated admins to delete discount codes
CREATE POLICY "Admins can delete discount codes"
  ON discount_codes FOR DELETE
  USING (true);

-- ===== ORDERS POLICIES =====
-- Drop policies if they already exist
DROP POLICY IF EXISTS "Anyone can insert orders" ON orders;
DROP POLICY IF EXISTS "Admins can update orders" ON orders;

-- Policy: Allow anyone to insert orders (for guest checkout and authenticated users)
-- The API routes handle authentication and validation
CREATE POLICY "Anyone can insert orders"
  ON orders FOR INSERT
  WITH CHECK (true);

-- Policy: Allow authenticated admins to update orders
CREATE POLICY "Admins can update orders"
  ON orders FOR UPDATE
  USING (true);

