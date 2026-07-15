import { describe, it, expect } from 'vitest'
import { validateSectors } from '@/lib/utils'
import type { FlightSector } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mkSector(overrides: Partial<FlightSector> = {}): FlightSector {
  return {
    id: 'S1', series_id: 'X', seq: 1,
    sector_type: 'Departure', airline_code: 'TG', flight_no: '703',
    dep_airport_code: 'BKK', arr_airport_code: 'NRT',
    dep_time: '08:00', arr_time: '15:00',
    relative_day_type: 'Departure', relative_day_no: 1,
    day_offset: 1, remark: null, status: 'Active',
    created_at: '', updated_at: '',
    ...overrides,
  }
}

const DEP_BKK_NRT = mkSector({ seq: 1, sector_type: 'Departure', dep_airport_code: 'BKK', arr_airport_code: 'NRT' })
const TR_NRT_KIX  = mkSector({ seq: 2, sector_type: 'Transit',   dep_airport_code: 'NRT', arr_airport_code: 'KIX' })
const TR_KIX_NRT  = mkSector({ seq: 3, sector_type: 'Transit',   dep_airport_code: 'KIX', arr_airport_code: 'NRT' })
const ARR_NRT_BKK = mkSector({ seq: 4, sector_type: 'Arrival',   dep_airport_code: 'NRT', arr_airport_code: 'BKK' })
const ARR_BKK     = mkSector({ seq: 2, sector_type: 'Arrival',   dep_airport_code: 'NRT', arr_airport_code: 'BKK' })

// ─── Test 1: Round-trip 2 Sectors — must pass ─────────────────────────────────

describe('Round-trip 2 Sectors', () => {
  it('Dep BKK→NRT + Arr NRT→BKK is valid', () => {
    expect(validateSectors([DEP_BKK_NRT, ARR_BKK], 'Group', 'Round-trip')).toBeNull()
  })
})

// ─── Test 2: Round-trip 4 Sectors — must pass ────────────────────────────────

describe('Round-trip 4 Sectors', () => {
  const sectors = [DEP_BKK_NRT, TR_NRT_KIX, TR_KIX_NRT, ARR_NRT_BKK]

  it('BKK→NRT→KIX→NRT→BKK is valid (origin == destination)', () => {
    expect(validateSectors(sectors, 'Group', 'Round-trip')).toBeNull()
  })

  it('has no error about sector count (null = valid)', () => {
    const result = validateSectors(sectors, 'Group', 'Round-trip')
    expect(result).toBeNull()
  })
})

// ─── Test 3: Round-trip 4 Sectors last.to ≠ first.from — must fail ───────────

describe('Round-trip origin/destination mismatch', () => {
  const lastToHND = mkSector({ seq: 4, sector_type: 'Arrival', dep_airport_code: 'NRT', arr_airport_code: 'HND' })

  it('returns error naming the mismatched airports', () => {
    const err = validateSectors([DEP_BKK_NRT, TR_NRT_KIX, TR_KIX_NRT, lastToHND], 'Group', 'Round-trip')
    expect(err).toBeTruthy()
    expect(err).toContain('BKK')
    expect(err).toContain('HND')
  })
})

// ─── Test 4: Round-trip continuity error between Sector 2 and 3 ──────────────

describe('validateSectors does not check route continuity (UI responsibility)', () => {
  // validateSectors only checks structure; route-gap detection is in Step2Sectors UI
  const badMiddle = mkSector({ seq: 2, sector_type: 'Transit', dep_airport_code: 'NRT', arr_airport_code: 'CDG' })
  const badNext   = mkSector({ seq: 3, sector_type: 'Transit', dep_airport_code: 'KIX', arr_airport_code: 'NRT' })

  it('passes structural check even when transit airports do not chain (route-gap is a UI warning)', () => {
    const result = validateSectors(
      [DEP_BKK_NRT, badMiddle, badNext, ARR_NRT_BKK], 'Group', 'Round-trip'
    )
    expect(result).toBeNull()
  })
})

// ─── One-way single Sector ────────────────────────────────────────────────────

describe('One-way 1 Sector', () => {
  it('single Departure is valid', () => {
    expect(validateSectors([DEP_BKK_NRT], 'FIT', 'One-way')).toBeNull()
  })
})

// ─── One-way multi-Sector ────────────────────────────────────────────────────

describe('One-way multi-Sector (connecting flights)', () => {
  const tr  = mkSector({ seq: 2, sector_type: 'Transit', dep_airport_code: 'NRT', arr_airport_code: 'CTS' })
  const arr = mkSector({ seq: 3, sector_type: 'Arrival', dep_airport_code: 'CTS', arr_airport_code: 'SPK' })

  it('Dep + Transit + Arrival is valid', () => {
    expect(validateSectors([DEP_BKK_NRT, tr, arr], 'FIT', 'One-way')).toBeNull()
  })

  it('Dep + Transit (no Arrival) is invalid', () => {
    const err = validateSectors([DEP_BKK_NRT, tr], 'FIT', 'One-way')
    expect(err).toBeTruthy()
    expect(err).toContain('Arrival')
  })
})

// ─── Multi-city ───────────────────────────────────────────────────────────────

describe('Multi-city', () => {
  it('4 sectors with Dep and Arr is valid', () => {
    expect(validateSectors([DEP_BKK_NRT, TR_NRT_KIX, TR_KIX_NRT, ARR_NRT_BKK], 'Group', 'Multi-city')).toBeNull()
  })

  it('1 sector is invalid', () => {
    expect(validateSectors([DEP_BKK_NRT], 'Group', 'Multi-city')).toBeTruthy()
  })
})

// ─── Edge: first sector is not Departure ─────────────────────────────────────

describe('first sector must be Departure', () => {
  it('returns error when first is Transit', () => {
    const err = validateSectors([TR_NRT_KIX, ARR_NRT_BKK], 'Group', 'Round-trip')
    expect(err).toBeTruthy()
    expect(err).toContain('Departure')
  })
})

// ─── Edge: airports empty — no false positive for from/to check ──────────────

describe('Round-trip airport check skipped when airports empty', () => {
  const depEmpty = mkSector({ seq: 1, sector_type: 'Departure', dep_airport_code: '', arr_airport_code: '' })
  const arrEmpty = mkSector({ seq: 2, sector_type: 'Arrival',   dep_airport_code: '', arr_airport_code: '' })

  it('passes when airports are not yet filled', () => {
    expect(validateSectors([depEmpty, arrEmpty], 'Group', 'Round-trip')).toBeNull()
  })
})
