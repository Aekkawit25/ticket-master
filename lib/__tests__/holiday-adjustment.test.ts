/**
 * Holiday-Avoidance Tests for NAME DL calculation
 *
 * Spec: after computing the NAME DL date from the original rule (N days
 * before travel, or a fixed date), the result must be checked against the
 * holiday calendar (Sat/Sun, public holidays, company holidays, other
 * holidays). If it lands on a holiday, shift backward one day at a time
 * until a business day is found — never shift onto another holiday.
 */

import { describe, it, expect } from 'vitest'
import {
  getHolidayReason, isBusinessDay, adjustDateForHolidays, adjustIsoDateTimeForHolidays,
} from '../holiday-utils'
import type { HolidayData } from '../holiday-storage'
import { calcTtlDateFromTravel, calcTtlDateFromTravelAdjusted } from '../ttl-utils'
import { calcCondTtlDate, calcCondTtlDateAdjusted, defaultTtlRule } from '../condition-schema'

function holiday(date: string, name: string, type: HolidayData['type'] = 'COMPANY', status: HolidayData['status'] = 'Active'): HolidayData {
  return { id: `H-${date}`, date, name, type, status }
}

describe('§1 — getHolidayReason / isBusinessDay', () => {
  it('TC01: 2026-01-04 is a Sunday → weekend reason', () => {
    expect(getHolidayReason('2026-01-04', [])).toBe('วันอาทิตย์')
    expect(isBusinessDay('2026-01-04', [])).toBe(false)
  })

  it('TC02: 2026-01-03 is a Saturday → weekend reason', () => {
    expect(getHolidayReason('2026-01-03', [])).toBe('วันเสาร์')
  })

  it('TC03: a weekday with no matching holiday is a business day', () => {
    expect(getHolidayReason('2026-01-05', [])).toBeNull()   // Monday
    expect(isBusinessDay('2026-01-05', [])).toBe(true)
  })

  it('TC04: an active COMPANY holiday on a weekday is reported by type', () => {
    const holidays = [holiday('2026-01-05', 'ปิดบริษัทกรณีพิเศษ', 'COMPANY')]
    expect(getHolidayReason('2026-01-05', holidays)).toBe('วันหยุดบริษัท: ปิดบริษัทกรณีพิเศษ')
    expect(isBusinessDay('2026-01-05', holidays)).toBe(false)
  })

  it('TC05: an Inactive holiday entry is ignored', () => {
    const holidays = [holiday('2026-01-05', 'ปิดบริษัทกรณีพิเศษ', 'COMPANY', 'Inactive')]
    expect(getHolidayReason('2026-01-05', holidays)).toBeNull()
  })

  it('TC06: PUBLIC and OTHER types are reported with their own label', () => {
    expect(getHolidayReason('2026-01-05', [holiday('2026-01-05', 'วันหยุดราชการพิเศษ', 'PUBLIC')]))
      .toBe('วันหยุดราชการ: วันหยุดราชการพิเศษ')
    expect(getHolidayReason('2026-01-05', [holiday('2026-01-05', 'กิจกรรมภายใน', 'OTHER')]))
      .toBe('วันหยุดอื่น: กิจกรรมภายใน')
  })
})

describe('§2 — adjustDateForHolidays: backward shift until a business day', () => {
  it('TC07: Sunday shifts back to Friday when Friday is a normal business day', () => {
    // 2026-01-04 = Sunday
    const result = adjustDateForHolidays('2026-01-04', [])
    expect(result.adjustedDate).toBe('2026-01-02')   // Friday
    expect(result.adjusted).toBe(true)
    expect(result.originalDate).toBe('2026-01-04')
    expect(result.reason).toBeTruthy()
  })

  it('TC08: spec example — Friday is also a company holiday → shifts further to Thursday', () => {
    // 2026-01-04 (Sun) → 2026-01-03 (Sat) → 2026-01-02 (Fri, COMPANY holiday) → 2026-01-01 (Thu, business day)
    const holidays = [holiday('2026-01-02', 'วันหยุดพิเศษบริษัท', 'COMPANY')]
    const result = adjustDateForHolidays('2026-01-04', holidays)
    expect(result.adjustedDate).toBe('2026-01-01')
    expect(result.adjusted).toBe(true)
  })

  it('TC09: multi-day consecutive holiday run is skipped in full (never re-lands on a holiday)', () => {
    // Songkran-style run: Mon–Wed all company holidays, preceded by a weekend
    const holidays = [
      holiday('2026-04-13', 'วันหยุดต่อเนื่อง 1', 'COMPANY'),
      holiday('2026-04-14', 'วันหยุดต่อเนื่อง 2', 'COMPANY'),
      holiday('2026-04-15', 'วันหยุดต่อเนื่อง 3', 'COMPANY'),
    ]
    // 2026-04-15 = Wed (holiday) → 04-14 Tue (holiday) → 04-13 Mon (holiday) → 04-12 Sun (weekend) → 04-11 Sat (weekend) → 04-10 Fri (business day)
    const result = adjustDateForHolidays('2026-04-15', holidays)
    expect(result.adjustedDate).toBe('2026-04-10')
    expect(isBusinessDay(result.adjustedDate, holidays)).toBe(true)
  })

  it('TC10: a date already on a business day is never adjusted', () => {
    const result = adjustDateForHolidays('2026-01-05', [])   // Monday
    expect(result.adjusted).toBe(false)
    expect(result.adjustedDate).toBe('2026-01-05')
    expect(result.reason).toBeNull()
  })

  it('TC11: adjustment is idempotent — re-adjusting an adjusted date is a no-op', () => {
    const first = adjustDateForHolidays('2026-01-04', [])
    const second = adjustDateForHolidays(first.adjustedDate, [])
    expect(second.adjusted).toBe(false)
    expect(second.adjustedDate).toBe(first.adjustedDate)
  })

  it('TC12: empty date string is a no-op', () => {
    const result = adjustDateForHolidays('', [])
    expect(result.adjusted).toBe(false)
    expect(result.adjustedDate).toBe('')
  })
})

describe('§3 — adjustIsoDateTimeForHolidays: preserves time-of-day', () => {
  it('TC13: shifts the date portion only, keeps the time', () => {
    const { isoDateTime, adjustment } = adjustIsoDateTimeForHolidays('2026-01-04T18:00:00.000Z', [])
    expect(adjustment.adjustedDate).toBe('2026-01-02')
    expect(isoDateTime).toBe('2026-01-02T18:00:00.000Z')
  })
})

describe('§4 — calcTtlDateFromTravelAdjusted (ttl-utils.ts)', () => {
  it('TC14: raw calcTtlDateFromTravel stays pure (no holiday awareness) — regression guard', () => {
    // 2026-01-08 - 4 days = 2026-01-04 (Sunday) — raw function must NOT shift it
    expect(calcTtlDateFromTravel('2026-01-08', 4)).toBe('2026-01-04')
  })

  it('TC15: calcTtlDateFromTravelAdjusted shifts the same raw result off the Sunday', () => {
    const { date, adjustment } = calcTtlDateFromTravelAdjusted('2026-01-08', 4, [])
    expect(date).toBe('2026-01-02')
    expect(adjustment?.adjusted).toBe(true)
  })

  it('TC16: no shift needed → adjustment.adjusted is false, date unchanged', () => {
    // 2026-01-06 - 1 day = 2026-01-05 (Monday, business day)
    const { date, adjustment } = calcTtlDateFromTravelAdjusted('2026-01-06', 1, [])
    expect(date).toBe('2026-01-05')
    expect(adjustment?.adjusted).toBe(false)
  })
})

describe('§5 — calcCondTtlDateAdjusted (condition-schema.ts)', () => {
  it('TC17: TRAVEL_MINUS_DAYS rule resolves and holiday-adjusts, storing metadata on the returned rule', () => {
    const rule = { ...defaultTtlRule(), calcType: 'TRAVEL_MINUS_DAYS' as const, daysBefore: 4, time: '18:00' }
    const { isoDateTime, rule: adjustedRule } = calcCondTtlDateAdjusted(rule, '2026-01-08', [])
    expect(isoDateTime).toBeTruthy()
    expect(isoDateTime!.startsWith('2026-01-02')).toBe(true)   // shifted from Sunday 01-04 to Friday 01-02
    expect(adjustedRule.holidayAdjusted).toBe(true)
    expect(adjustedRule.holidayOriginalDate).toBe('2026-01-04')
    expect(adjustedRule.holidayAdjustedDate).toBe('2026-01-02')
    expect(adjustedRule.holidayAdjustReason).toBeTruthy()
  })

  it('TC18: MANUAL_DATE (fixed date) rule is holiday-adjusted too — supports the "custom date" mode from the spec', () => {
    const rule = { ...defaultTtlRule(), calcType: 'MANUAL_DATE' as const, fixedDate: '2026-01-04', time: '12:00' }
    const { rule: adjustedRule } = calcCondTtlDateAdjusted(rule, '', [])
    expect(adjustedRule.holidayAdjusted).toBe(true)
    expect(adjustedRule.holidayAdjustedDate).toBe('2026-01-02')
  })

  it('TC19: calcCondTtlDate itself stays pure — regression guard for existing callers', () => {
    const rule = { ...defaultTtlRule(), calcType: 'TRAVEL_MINUS_DAYS' as const, daysBefore: 4, time: '18:00' }
    const raw = calcCondTtlDate(rule, '2026-01-08')
    expect(raw?.startsWith('2026-01-04')).toBe(true)   // unshifted Sunday
  })

  it('TC20: NOT_SET calcType resolves to null with no adjustment', () => {
    const rule = { ...defaultTtlRule(), calcType: 'NOT_SET' as const }
    const { isoDateTime, rule: adjustedRule } = calcCondTtlDateAdjusted(rule, '2026-01-08', [])
    expect(isoDateTime).toBeNull()
    expect(adjustedRule.holidayAdjusted).toBe(false)
    expect(adjustedRule.holidayOriginalDate).toBeNull()
  })
})
