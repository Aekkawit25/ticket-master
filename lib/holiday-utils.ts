import { HOLIDAY_TYPE_LABELS, type HolidayData } from '@/lib/holiday-storage'

const WEEKDAY_TH = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์']
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** Noon-anchored parse — avoids UTC midnight rolling to the previous calendar day. */
function parseDateOnly(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00')
}

function shiftDateStr(dateStr: string, deltaDays: number): string {
  const d = parseDateOnly(dateStr)
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

function isWeekend(dateStr: string): boolean {
  const day = parseDateOnly(dateStr).getDay()
  return day === 0 || day === 6
}

function formatDMY(dateStr: string): string {
  const d = parseDateOnly(dateStr)
  const year = String((d.getFullYear() + 543) % 100).padStart(2, '0')
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${year}`
}

function findHoliday(dateStr: string, holidays: HolidayData[]): HolidayData | undefined {
  return holidays.find(h => h.status === 'Active' && h.date === dateStr)
}

/** Thai description of why `dateStr` is not a business day, or null if it is a business day. */
export function getHolidayReason(dateStr: string, holidays: HolidayData[]): string | null {
  const holiday = findHoliday(dateStr, holidays)
  if (holiday) return `${HOLIDAY_TYPE_LABELS[holiday.type]}: ${holiday.name}`
  if (isWeekend(dateStr)) return WEEKDAY_TH[parseDateOnly(dateStr).getDay()]
  return null
}

export function isBusinessDay(dateStr: string, holidays: HolidayData[]): boolean {
  return !dateStr || getHolidayReason(dateStr, holidays) === null
}

export interface HolidayAdjustment {
  originalDate: string
  adjustedDate: string
  adjusted: boolean
  /** Thai description of the shift chain, or null when no adjustment was needed. */
  reason: string | null
}

/**
 * Shifts `dateStr` backward day-by-day until it lands on a business day —
 * i.e. not a Sat/Sun and not an active holiday of any type. Re-checks after
 * every shift so a run of consecutive holidays is skipped in full.
 */
export function adjustDateForHolidays(dateStr: string, holidays: HolidayData[]): HolidayAdjustment {
  if (!dateStr) {
    return { originalDate: dateStr, adjustedDate: dateStr, adjusted: false, reason: null }
  }
  const originalDate = dateStr
  let current = dateStr
  const skipped: string[] = []
  let guard = 0
  while (guard < 3660) {   // ~10-year safety cap against malformed/never-ending holiday data
    const reason = getHolidayReason(current, holidays)
    if (!reason) break
    skipped.push(`${formatDMY(current)} (${reason})`)
    current = shiftDateStr(current, -1)
    guard++
  }
  return {
    originalDate,
    adjustedDate: current,
    adjusted: current !== originalDate,
    reason: skipped.length ? `เลื่อนย้อนหลังจาก ${skipped.join(' → ')} เป็นวันทำการ ${formatDMY(current)}` : null,
  }
}

/**
 * Applies adjustDateForHolidays to the date portion of an ISO datetime string
 * (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...), preserving the time-of-day.
 */
export function adjustIsoDateTimeForHolidays(isoDateTime: string, holidays: HolidayData[]): {
  isoDateTime: string
  adjustment: HolidayAdjustment
} {
  const [datePart, timePart] = isoDateTime.split('T')
  const adjustment = adjustDateForHolidays(datePart, holidays)
  return {
    isoDateTime: timePart ? `${adjustment.adjustedDate}T${timePart}` : adjustment.adjustedDate,
    adjustment,
  }
}
