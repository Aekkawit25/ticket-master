import { describe, it, expect } from 'vitest'
import {
  calcSectorDepDate,
  getDayLabel,
  autoAdjustArrDate,
  recalcSectorDates,
} from '@/lib/pnr-record'
import type { SectorTemplate, PNRSectorRecord } from '@/lib/pnr-record'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// BKK→SIN→BKK trip: D1 out, D4 back, D5 overnight return
const TMPL_SECTORS: SectorTemplate[] = [
  { sectorType: 'Departure', dayOffset: 1, arrDayOffset: 0, depAirportCode: 'BKK', arrAirportCode: 'SIN', depTime: '08:00', arrTime: '12:00' },
  { sectorType: 'Return',    dayOffset: 4, arrDayOffset: 0, depAirportCode: 'SIN', arrAirportCode: 'BKK', depTime: '14:00', arrTime: '18:00' },
  { sectorType: 'Departure', dayOffset: 5, arrDayOffset: 1, depAirportCode: 'BKK', arrAirportCode: 'NRT', depTime: '22:00', arrTime: '06:00' },
]

// ─── calcSectorDepDate ────────────────────────────────────────────────────────

describe('calcSectorDepDate', () => {
  const ts = '2026-09-01' // Tuesday

  it('D1 → same as travel start', () => {
    expect(calcSectorDepDate(ts, 1)).toBe('2026-09-01')
  })

  it('D4 → travel start + 3 days', () => {
    expect(calcSectorDepDate(ts, 4)).toBe('2026-09-04')
  })

  it('D5 → travel start + 4 days', () => {
    expect(calcSectorDepDate(ts, 5)).toBe('2026-09-05')
  })

  it('returns empty string when travelStart is empty', () => {
    expect(calcSectorDepDate('', 1)).toBe('')
  })

  it('is UTC-safe: uses local noon to avoid date shift in negative-UTC zones', () => {
    // 2026-09-01T00:00:00Z in UTC-5 would be 2026-08-31 — the T12:00:00 fix prevents this
    expect(calcSectorDepDate('2026-08-01', 1)).toBe('2026-08-01')
    expect(calcSectorDepDate('2026-08-01', 31)).toBe('2026-08-31')
  })
})

// ─── getDayLabel ──────────────────────────────────────────────────────────────

describe('getDayLabel', () => {
  it('2026-09-01 is TUE', () => expect(getDayLabel('2026-09-01')).toBe('TUE'))
  it('2026-09-04 is FRI', () => expect(getDayLabel('2026-09-04')).toBe('FRI'))
  it('2026-09-05 is SAT', () => expect(getDayLabel('2026-09-05')).toBe('SAT'))
  it('empty string returns —', () => expect(getDayLabel('')).toBe('—'))
})

// ─── autoAdjustArrDate ────────────────────────────────────────────────────────

describe('autoAdjustArrDate', () => {
  it('+Day 0: arr same day when arr > dep', () => {
    const { arrDate, wasAdjusted } = autoAdjustArrDate('2026-09-01', '08:00', '12:00', 0)
    expect(arrDate).toBe('2026-09-01')
    expect(wasAdjusted).toBe(false)
  })

  it('+Day 1: arr next day', () => {
    const { arrDate, wasAdjusted } = autoAdjustArrDate('2026-09-05', '22:00', '06:00', 1)
    expect(arrDate).toBe('2026-09-06')
    expect(wasAdjusted).toBe(false)
  })

  it('+Day 0 but overnight (arr time < dep time): auto-adds 1 day', () => {
    const { arrDate, wasAdjusted } = autoAdjustArrDate('2026-09-05', '22:00', '06:00', 0)
    expect(arrDate).toBe('2026-09-06')
    expect(wasAdjusted).toBe(true)
  })

  it('empty depDate returns empty', () => {
    const { arrDate } = autoAdjustArrDate('', '08:00', '12:00', 0)
    expect(arrDate).toBe('')
  })
})

// ─── recalcSectorDates ────────────────────────────────────────────────────────

describe('recalcSectorDates', () => {
  const ts = '2026-09-01'

  it('builds correct dep/arr dates for all sectors from travelStart', () => {
    const result = recalcSectorDates(ts, TMPL_SECTORS, [])
    expect(result[0].depDate).toBe('2026-09-01') // D1
    expect(result[0].arrDate).toBe('2026-09-01') // +0 → same day
    expect(result[1].depDate).toBe('2026-09-04') // D4
    expect(result[1].arrDate).toBe('2026-09-04') // +0 → same day
    expect(result[2].depDate).toBe('2026-09-05') // D5
    expect(result[2].arrDate).toBe('2026-09-06') // +1 → next day
  })

  it('recalculates correctly when travelStart changes (2026-08-15 → 2026-09-01)', () => {
    const oldTs = '2026-08-15'
    const oldSectors: PNRSectorRecord[] = recalcSectorDates(oldTs, TMPL_SECTORS, [])
    // Verify old dates (the stale values)
    expect(oldSectors[0].depDate).toBe('2026-08-15')
    expect(oldSectors[1].depDate).toBe('2026-08-18')

    // Now recalculate with new travelStart
    const newSectors = recalcSectorDates(ts, TMPL_SECTORS, oldSectors)
    expect(newSectors[0].depDate).toBe('2026-09-01')
    expect(newSectors[1].depDate).toBe('2026-09-04')
    expect(newSectors[2].depDate).toBe('2026-09-05')
  })

  it('preserves manually-edited dep when skipManualDep=true', () => {
    const existing: PNRSectorRecord[] = recalcSectorDates(ts, TMPL_SECTORS, [])
    existing[1] = { ...existing[1], depDate: '2026-09-06', depManual: true }

    const result = recalcSectorDates(ts, TMPL_SECTORS, existing, { skipManualDep: true })
    expect(result[0].depDate).toBe('2026-09-01') // non-manual: recalculated
    expect(result[1].depDate).toBe('2026-09-06') // manual: preserved
    expect(result[2].depDate).toBe('2026-09-05') // non-manual: recalculated
  })

  it('clears depManual flag when NOT skipping manual dep', () => {
    const existing: PNRSectorRecord[] = recalcSectorDates(ts, TMPL_SECTORS, [])
    existing[1] = { ...existing[1], depDate: '2026-09-06', depManual: true }

    const result = recalcSectorDates(ts, TMPL_SECTORS, existing)
    expect(result[1].depDate).toBe('2026-09-04')  // recalculated from template
    expect(result[1].depManual).toBe(false)
  })

  it('returns empty sectors for empty template', () => {
    const result = recalcSectorDates(ts, [], [])
    expect(result).toHaveLength(0)
  })
})
