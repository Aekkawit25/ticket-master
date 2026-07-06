-- ============================================================
-- Air Ticket Stock Management — Sector Date Model
-- ============================================================
-- เปลี่ยนโมเดล: Step 4 กรอกเฉพาะ Travel Start
--   Sector Travel Date = PNR travel_start + sector day_offset
--   Travel End = วันของ Return ตัวสุดท้าย (หรือ Sector สุดท้าย)
--   duration_days ไม่ใช้เป็น input หลัก, Day Type (relative_day_*) เลิกใช้
-- ============================================================

-- 1) flight_series_sector: ใช้ day_offset อย่างเดียว
--    คงคอลัมน์ relative_day_* ไว้แบบ nullable เพื่อความเข้ากันได้กับข้อมูลเดิม
ALTER TABLE flight_series_sector
  ALTER COLUMN relative_day_type DROP NOT NULL,
  ALTER COLUMN relative_day_no  DROP NOT NULL;

-- 2) flight_series_pnr: duration_days ไม่บังคับ (Travel End คำนวณจาก Sector)
ALTER TABLE flight_series_pnr
  ALTER COLUMN duration_days DROP NOT NULL;

-- 3) วันที่จริงของแต่ละ Sector ต่อ PNR
--    travel_date คำนวณจาก PNR travel_start + sector day_offset
CREATE TABLE IF NOT EXISTS flight_pnr_sector_date (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id UUID NOT NULL REFERENCES flight_series(id) ON DELETE CASCADE,
  pnr_id UUID NOT NULL REFERENCES flight_series_pnr(id) ON DELETE CASCADE,
  sector_id UUID NOT NULL REFERENCES flight_series_sector(id) ON DELETE CASCADE,
  sector_type VARCHAR(20) NOT NULL CHECK (sector_type IN ('Outbound','Transit','Domestic','Return')),
  travel_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pnr_id, sector_id)
);

CREATE INDEX IF NOT EXISTS idx_pnr_sector_date_pnr ON flight_pnr_sector_date(pnr_id);
CREATE INDEX IF NOT EXISTS idx_pnr_sector_date_sector ON flight_pnr_sector_date(sector_id);
