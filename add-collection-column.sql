-- Migration: Add collection column to products table
-- This adds support for the Wedding/Soiree collection split
-- Run this SQL on your MySQL database (smarterasp.net)

ALTER TABLE `products` ADD COLUMN `collection` VARCHAR(20) NULL AFTER `category`;

-- After adding the column, assign existing products to their collection:
-- UPDATE `products` SET `collection` = 'wedding' WHERE category IN ('mona-saleh', 'el-raey-1', 'el-raey-2');
-- UPDATE `products` SET `collection` = 'soiree' WHERE category IN ('el-raey-the-yard', 'sell-dresses');
-- (Adjust the above based on which categories belong to which collection)
