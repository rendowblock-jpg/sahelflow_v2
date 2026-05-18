-- Add delivery_type column to orders table
-- Supports E-Commerce Bible Rule #6: both domicile and stop desk delivery options

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'home' CHECK (delivery_type IN ('home', 'desk'));
