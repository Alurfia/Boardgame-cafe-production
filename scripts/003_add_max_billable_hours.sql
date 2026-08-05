-- Add max_billable_hours column to pricing_config table
ALTER TABLE pricing_config
ADD COLUMN max_billable_hours INTEGER NOT NULL DEFAULT 5;
