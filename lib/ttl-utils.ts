import { formatDate } from '@/lib/utils'
import { adjustDateForHolidays, type HolidayAdjustment } from '@/lib/holiday-utils'
import type { HolidayData } from '@/lib/holiday-storage'

export type TtlType = 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE'

/** Map CondTtlCalcType → TtlType used in PNR form */
export function condTtlTypeToTtlType(calcType: string): TtlType {
  if (calcType === 'TRAVEL_MINUS_DAYS') return 'DAYS_BEFORE'
  if (calcType === 'MANUAL_DATE') return 'FIXED_DATE'
  return 'NONE'
}

/** Subtract daysBefore from travelStart, noon-anchored to avoid timezone issues */
export function calcTtlDateFromTravel(travelStart: string, daysBefore: number): string | null {
  if (!travelStart || daysBefore < 0) return null
  try {
    const d = new Date(travelStart + 'T12:00:00')
    d.setDate(d.getDate() - daysBefore)
    return d.toISOString().split('T')[0]
  } catch { return null }
}

/**
 * Same as calcTtlDateFromTravel, but shifts the result backward off any
 * Sat/Sun or active holiday until it lands on a business day. Used for the
 * final resolved NAME DL — calcTtlDateFromTravel itself stays pure (raw
 * calendar-day subtraction) so existing callers/tests are unaffected.
 */
export function calcTtlDateFromTravelAdjusted(
  travelStart: string,
  daysBefore: number,
  holidays: HolidayData[],
): { date: string | null; adjustment: HolidayAdjustment | null } {
  const raw = calcTtlDateFromTravel(travelStart, daysBefore)
  if (!raw) return { date: null, adjustment: null }
  const adjustment = adjustDateForHolidays(raw, holidays)
  return { date: adjustment.adjustedDate, adjustment }
}

/** Format TTL date+time for display: "DD MMM YY · HH:mm" or "DD MMM YY" */
export function formatTtlDisplay(ttlDate: string | null, ttlTime: string | null): string {
  if (!ttlDate) return '—'
  const d = formatDate(ttlDate)
  return ttlTime ? `${d} · ${ttlTime}` : d
}

/**
 * Resolves the final TTL date for a PNR form row (wizard / edit context).
 * Priority: per-PNR ttl_type override → stored ttl_date → condition-derived fallback.
 *
 * For DAYS_BEFORE, always recomputes from travel_start so the date stays in
 * sync when the user changes the departure date after setting TTL.
 */
export function resolvePnrFormTtl(
  p: {
    ttl_type?: TtlType | null
    ttl_days_before?: number | null
    ttl_date?: string | null
    travel_start?: string
  },
  conditionTtlDate?: string | null,
): string | null {
  if (p.ttl_type === 'DAYS_BEFORE') {
    // Always recompute — keeps TTL in sync when travel_start changes
    if (p.ttl_days_before != null && p.ttl_days_before >= 0 && p.travel_start) {
      return calcTtlDateFromTravel(p.travel_start, p.ttl_days_before)
    }
    return p.ttl_date || null   // fallback: stored date (no travel_start yet)
  }
  if (p.ttl_type === 'FIXED_DATE') return p.ttl_date || null
  if (p.ttl_type === 'NONE') return null
  // No explicit ttl_type (legacy / no TTL set): fall back to stored date then condition
  if (p.ttl_date) return p.ttl_date
  return conditionTtlDate ?? null
}

/** Check if a PNR has a set TTL (ttl_type is not NONE and ttl_date is set) */
export function hasTtl(p: { ttl_type?: TtlType; ttl_date?: string | null }): boolean {
  // Explicitly cleared
  if (p.ttl_type === 'NONE') return false
  // New-style: type is set → require date too
  if (p.ttl_type === 'DAYS_BEFORE' || p.ttl_type === 'FIXED_DATE') return !!p.ttl_date
  // Backward compat: no ttl_type yet → use date presence (old ttl_status='SET' data)
  return !!p.ttl_date
}
