import { describe, it, expect } from 'vitest'
import { resolvePnrFormTtl } from '@/lib/ttl-utils'

describe('resolvePnrFormTtl', () => {
  // TC-R-01: DAYS_BEFORE recomputed from travel_start
  it('TC-R-01: DAYS_BEFORE 30 days → 2026-06-11 when travel_start = 2026-07-11', () => {
    const result = resolvePnrFormTtl({
      ttl_type: 'DAYS_BEFORE',
      ttl_days_before: 30,
      ttl_date: '2026-06-11',
      travel_start: '2026-07-11',
    })
    expect(result).toBe('2026-06-11')
  })

  // TC-R-02: DAYS_BEFORE 30 days — always recomputes; stored ttl_date ignored when travel_start present
  it('TC-R-02: DAYS_BEFORE recomputes fresh when travel_start changes', () => {
    // travel_start = 2026-07-18 → 30 days before = 2026-06-18
    const result = resolvePnrFormTtl({
      ttl_type: 'DAYS_BEFORE',
      ttl_days_before: 30,
      ttl_date: '2026-05-01',   // stale stored date
      travel_start: '2026-07-18',
    })
    expect(result).toBe('2026-06-18')
  })

  // TC-R-03: DAYS_BEFORE — fallback to stored ttl_date when travel_start missing
  it('TC-R-03: DAYS_BEFORE falls back to stored ttl_date when travel_start not set', () => {
    const result = resolvePnrFormTtl({
      ttl_type: 'DAYS_BEFORE',
      ttl_days_before: 30,
      ttl_date: '2026-06-11',
      travel_start: undefined,
    })
    expect(result).toBe('2026-06-11')
  })

  // TC-R-04: FIXED_DATE returns the stored date directly
  it('TC-R-04: FIXED_DATE returns ttl_date as-is', () => {
    const result = resolvePnrFormTtl({
      ttl_type: 'FIXED_DATE',
      ttl_date: '2026-08-01',
      travel_start: '2026-09-10',
    })
    expect(result).toBe('2026-08-01')
  })

  // TC-R-05: NONE returns null even when ttl_date has a value
  it('TC-R-05: NONE → null regardless of other fields', () => {
    const result = resolvePnrFormTtl({
      ttl_type: 'NONE',
      ttl_date: '2026-06-11',
      ttl_days_before: 30,
      travel_start: '2026-07-11',
    })
    expect(result).toBeNull()
  })

  // TC-R-06: No ttl_type set — falls back to stored ttl_date
  it('TC-R-06: no ttl_type → use stored ttl_date (backward compat)', () => {
    const result = resolvePnrFormTtl({
      ttl_date: '2026-07-01',
      travel_start: '2026-08-01',
    })
    expect(result).toBe('2026-07-01')
  })

  // TC-R-07: No ttl_type, no ttl_date → falls back to conditionTtlDate
  it('TC-R-07: no ttl_type, no ttl_date → use conditionTtlDate fallback', () => {
    const result = resolvePnrFormTtl(
      { travel_start: '2026-07-01' },
      '2026-06-15',
    )
    expect(result).toBe('2026-06-15')
  })

  // TC-R-08: No TTL at all → null
  it('TC-R-08: no TTL data anywhere → null', () => {
    const result = resolvePnrFormTtl({ travel_start: '2026-07-01' })
    expect(result).toBeNull()
  })

  // TC-R-09: Three PNRs each 7 days apart, all DAYS_BEFORE 30
  it('TC-R-09: multiple PNRs with DAYS_BEFORE 30 produce correct dates', () => {
    const pnrs = [
      { ttl_type: 'DAYS_BEFORE' as const, ttl_days_before: 30, travel_start: '2026-07-11' },
      { ttl_type: 'DAYS_BEFORE' as const, ttl_days_before: 30, travel_start: '2026-07-18' },
      { ttl_type: 'DAYS_BEFORE' as const, ttl_days_before: 30, travel_start: '2026-07-25' },
    ]
    const results = pnrs.map(p => resolvePnrFormTtl(p))
    expect(results).toEqual(['2026-06-11', '2026-06-18', '2026-06-25'])
  })

  // TC-R-10: DAYS_BEFORE with 0 days → same as travel_start
  it('TC-R-10: DAYS_BEFORE 0 → same date as travel_start', () => {
    const result = resolvePnrFormTtl({
      ttl_type: 'DAYS_BEFORE',
      ttl_days_before: 0,
      travel_start: '2026-07-11',
    })
    expect(result).toBe('2026-07-11')
  })
})
