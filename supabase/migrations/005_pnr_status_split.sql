-- 005_pnr_status_split.sql
-- Splits the legacy pnr.status field into two independent axes:
--   pnr_status         → operational lifecycle  (PENDING / ACTIVE / CLOSED / CANCELLED)
--   confirmation_status → data confirmation      (PENDING_CONFIRMATION / CONFIRMED)

ALTER TABLE pnrs
  ADD COLUMN IF NOT EXISTS pnr_status VARCHAR(20)
    DEFAULT 'PENDING'
    CHECK (pnr_status IN ('PENDING', 'ACTIVE', 'CLOSED', 'CANCELLED')),

  ADD COLUMN IF NOT EXISTS confirmation_status VARCHAR(30)
    DEFAULT 'PENDING_CONFIRMATION'
    CHECK (confirmation_status IN ('PENDING_CONFIRMATION', 'CONFIRMED')),

  ADD COLUMN IF NOT EXISTS activated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_by  TEXT,
  ADD COLUMN IF NOT EXISTS closed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by     TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by  TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Migrate existing data -------------------------------------------------------
-- confirmation_status  ← old status field
UPDATE pnrs SET confirmation_status = CASE
  WHEN status IN ('Confirmed', 'Ticketed') THEN 'CONFIRMED'
  ELSE 'PENDING_CONFIRMATION'
END;

-- pnr_status  ← infer from old status + whether pnr belongs to closed/cancelled stock
UPDATE pnrs SET pnr_status = CASE
  WHEN status = 'Cancelled'             THEN 'CANCELLED'
  WHEN status IN ('Closed', 'Expired')  THEN 'CLOSED'
  ELSE 'PENDING'   -- safe default; will become ACTIVE when stock is activated
END;

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS idx_pnrs_pnr_status         ON pnrs (pnr_status);
CREATE INDEX IF NOT EXISTS idx_pnrs_confirmation_status ON pnrs (confirmation_status);
