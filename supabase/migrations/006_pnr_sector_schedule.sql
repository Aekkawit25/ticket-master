-- ============================================================
-- Migration 006: PNR Sector Schedule — Extended columns
-- ============================================================
-- Purpose  : Add per-sector dep/arr time + date-override flags to
--            flight_pnr_sector_date so the DB can store the same
--            information as the demo PnrSectorSchedule type.
-- Status   : PREPARED — DO NOT RUN without DBA approval.
-- Rollback : See section at the bottom of this file.
-- Impact   : Additive only; existing rows keep their travel_date.
--            New columns are nullable / have safe defaults.
-- ============================================================

-- ─── Forward migration ────────────────────────────────────────────────────────

ALTER TABLE flight_pnr_sector_date
  ADD COLUMN IF NOT EXISTS dep_time          VARCHAR(5)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS arr_date          DATE        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS arr_time          VARCHAR(5)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_dep_manual     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_arr_date_override BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_arr_time_override BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_type       VARCHAR(20) NOT NULL DEFAULT 'calculated'
    CHECK (source_type IN ('calculated', 'manual', 'imported'));

-- Backfill: copy travel_date → arr_date for rows that have a travel_date
-- (best-effort; arr_date will be corrected by the app on next save)
UPDATE flight_pnr_sector_date
  SET arr_date = travel_date
  WHERE arr_date IS NULL
    AND travel_date IS NOT NULL;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_psd_pnr_sector
  ON flight_pnr_sector_date (pnr_id, sector_id);

CREATE INDEX IF NOT EXISTS idx_psd_series
  ON flight_pnr_sector_date (series_id);

-- ─── Rollback (run this block to undo) ───────────────────────────────────────
-- DROP INDEX IF EXISTS idx_psd_pnr_sector;
-- DROP INDEX IF EXISTS idx_psd_series;
-- ALTER TABLE flight_pnr_sector_date
--   DROP COLUMN IF EXISTS dep_time,
--   DROP COLUMN IF EXISTS arr_date,
--   DROP COLUMN IF EXISTS arr_time,
--   DROP COLUMN IF EXISTS is_dep_manual,
--   DROP COLUMN IF EXISTS is_arr_date_override,
--   DROP COLUMN IF EXISTS is_arr_time_override,
--   DROP COLUMN IF EXISTS source_type;
