-- Migration 004: Add unified stock_type column
-- Replaces the two-field (ticket_type + group_type) system with a single stock_type enum.
-- Old data is preserved via the backfill below.

-- Add stock_type enum (if not exists)
DO $$ BEGIN
  CREATE TYPE stock_type_enum AS ENUM ('SERIES', 'AD_HOC', 'FIT', 'TICKET_ONLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add stock_type column to flight_series
ALTER TABLE flight_series
  ADD COLUMN IF NOT EXISTS stock_type stock_type_enum;

-- Backfill stock_type from existing ticket_type + group_type values
UPDATE flight_series SET stock_type = 'SERIES'      WHERE ticket_type = 'Group'       AND group_type = 'SERIES';
UPDATE flight_series SET stock_type = 'AD_HOC'      WHERE ticket_type = 'Group'       AND group_type = 'ADHOC';
UPDATE flight_series SET stock_type = 'FIT'         WHERE ticket_type = 'FIT';
UPDATE flight_series SET stock_type = 'TICKET_ONLY' WHERE ticket_type = 'Ticket + Land';
-- Default any remaining Group stocks without group_type to SERIES
UPDATE flight_series SET stock_type = 'SERIES' WHERE ticket_type = 'Group' AND stock_type IS NULL;

-- Make stock_type NOT NULL after backfill
ALTER TABLE flight_series
  ALTER COLUMN stock_type SET NOT NULL;

-- Update the ticket_type CHECK constraint to also allow new enum values as strings (optional compat)
-- The canonical value is now stock_type; ticket_type is kept for backward compat
ALTER TABLE flight_series
  DROP CONSTRAINT IF EXISTS flight_series_ticket_type_check;

ALTER TABLE flight_series
  ADD CONSTRAINT flight_series_ticket_type_check
  CHECK (ticket_type IN ('Group', 'FIT', 'Ticket + Land'));

-- Add group_type column (was only in TypeScript before)
ALTER TABLE flight_series
  ADD COLUMN IF NOT EXISTS group_type VARCHAR(10)
  CHECK (group_type IN ('SERIES', 'ADHOC') OR group_type IS NULL);

-- Index for fast type-based queries
CREATE INDEX IF NOT EXISTS idx_flight_series_stock_type ON flight_series(stock_type);
