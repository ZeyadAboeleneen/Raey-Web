-- MySQL equivalent for registration and favorites management
-- This replaces Supabase RLS policies with MySQL approaches

-- Note: MySQL doesn't have Row Level Security like Supabase
-- Instead, implement these controls at the application level:

-- 1. For user registration: Handle in your API route (app/api/auth/register/route.ts)
-- Example validation:
-- - Check if email already exists
-- - Hash password before insertion
-- - Insert new user record

-- 2. For users updating own favorites: Use WHERE clause in queries
-- Example query pattern:
-- UPDATE users SET favorites = ? WHERE id = ? AND id = current_user_id

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);

-- 4. Example stored procedure for updating favorites (optional)
DELIMITER //
CREATE PROCEDURE UpdateUserFavorites(
    IN user_id VARCHAR(255),
    IN favorites_data JSON
)
BEGIN
    UPDATE users 
    SET favorites = favorites_data 
    WHERE id = user_id;
END //
DELIMITER ;

