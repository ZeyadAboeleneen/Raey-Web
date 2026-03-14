-- Add registration and favorites update policies to users table
-- Run this in your Supabase SQL Editor

-- Drop the policies if they already exist (to avoid errors)
DROP POLICY IF EXISTS "Anyone can register" ON users;
DROP POLICY IF EXISTS "Users can update own favorites" ON users;

-- Create the policy to allow user registration
CREATE POLICY "Anyone can register"
  ON users FOR INSERT
  WITH CHECK (true);

-- Policy: Allow users to update their own favorites
-- Note: The API routes use the admin client which bypasses RLS, but this provides a backup
CREATE POLICY "Users can update own favorites"
  ON users FOR UPDATE
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

