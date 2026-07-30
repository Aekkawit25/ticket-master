const KEY = 'holidays_data'
export const HOLIDAYS_UPDATED_EVENT = 'holidays_updated'

export type HolidayType = 'PUBLIC' | 'COMPANY' | 'OTHER'

export const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  PUBLIC:  'วันหยุดราชการ',
  COMPANY: 'วันหยุดบริษัท',
  OTHER:   'วันหยุดอื่น',
}

export interface HolidayData {
  id: string
  date: string           // YYYY-MM-DD
  name: string
  type: HolidayType
  status: 'Active' | 'Inactive'
}

// ── Seed: fixed-date Thai public holidays (2026) — editable via Settings > Holidays ──
export const SEED_HOLIDAYS: Omit<HolidayData, 'status'>[] = [
  { id: 'HOL-2026-0101', date: '2026-01-01', name: "วันขึ้นปีใหม่", type: 'PUBLIC' },
  { id: 'HOL-2026-0406', date: '2026-04-06', name: 'วันจักรี', type: 'PUBLIC' },
  { id: 'HOL-2026-0413', date: '2026-04-13', name: 'วันสงกรานต์', type: 'PUBLIC' },
  { id: 'HOL-2026-0414', date: '2026-04-14', name: 'วันสงกรานต์', type: 'PUBLIC' },
  { id: 'HOL-2026-0415', date: '2026-04-15', name: 'วันสงกรานต์', type: 'PUBLIC' },
  { id: 'HOL-2026-0501', date: '2026-05-01', name: 'วันแรงงานแห่งชาติ', type: 'PUBLIC' },
  { id: 'HOL-2026-0728', date: '2026-07-28', name: 'วันเฉลิมพระชนมพรรษา ร.10', type: 'PUBLIC' },
  { id: 'HOL-2026-1023', date: '2026-10-23', name: 'วันปิยมหาราช', type: 'PUBLIC' },
  { id: 'HOL-2026-1205', date: '2026-12-05', name: 'วันพ่อแห่งชาติ', type: 'PUBLIC' },
  { id: 'HOL-2026-1210', date: '2026-12-10', name: 'วันรัฐธรรมนูญ', type: 'PUBLIC' },
  { id: 'HOL-2026-1231', date: '2026-12-31', name: "วันสิ้นปี", type: 'PUBLIC' },
]

function seed(): HolidayData[] {
  return SEED_HOLIDAYS.map(h => ({ ...h, status: 'Active' as const }))
}

/** Seed once on first use — subsequent loads never resurrect a user-deleted holiday. */
export function getHolidays(): HolidayData[] {
  if (typeof window === 'undefined') return seed()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return seed()
    return JSON.parse(raw)
  } catch { return seed() }
}

export function saveHolidays(holidays: HolidayData[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(holidays))
  window.dispatchEvent(new Event(HOLIDAYS_UPDATED_EVENT))
}

export function getActiveHolidays(): HolidayData[] {
  return getHolidays().filter(h => h.status === 'Active')
}
