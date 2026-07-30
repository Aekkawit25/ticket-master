/**
 * Unified PNR row validation (lib/pnr-validation.ts)
 *
 * Single source of truth used by the Add Stock wizard's Step 3 "PNR & Seats"
 * gate, the PNRSeatsTable grid, Single PNR modal, Bulk PNR builder, and
 * Review & Save — so a row that passes on one screen can never be silently
 * rejected by another.
 *
 * Regression-guards the root-cause bug: ALL_IN pricing must validate against
 * `allInAmount`, never `fare` (fare is always 0 for ALL_IN rows elsewhere in
 * the app, so requiring `fare > 0` for ALL_IN made Step 3 impossible to pass).
 */

import { describe, it, expect } from 'vitest'
import {
  validatePnrRowFields, findDuplicatePnrRowIndices, validatePnrRows,
  buildPnrValidationSummary, hasAnyPnrError, pnrFieldElementId,
  type NormalizedPnrRow,
} from '../pnr-validation'

function baseRow(overrides: Partial<NormalizedPnrRow> = {}): NormalizedPnrRow {
  return {
    pnrCode: '',
    travelStart: '2026-07-11',
    seatTotal: 10,
    priceFormat: 'FARE',
    fare: 5000,
    yq: null,
    allInAmount: null,
    ttlType: 'NONE',
    ttlDaysBefore: null,
    ttlDate: null,
    ...overrides,
  }
}

describe('§1 — always-required fields', () => {
  it('TC01: missing travelStart is an error', () => {
    const issues = validatePnrRowFields(baseRow({ travelStart: '' }))
    expect(issues.some(i => i.field === 'travelStart' && i.severity === 'error')).toBe(true)
  })

  it('TC02: seatTotal missing or <= 0 is an error', () => {
    expect(validatePnrRowFields(baseRow({ seatTotal: null })).some(i => i.field === 'seatTotal')).toBe(true)
    expect(validatePnrRowFields(baseRow({ seatTotal: 0 })).some(i => i.field === 'seatTotal')).toBe(true)
    expect(validatePnrRowFields(baseRow({ seatTotal: 10 })).some(i => i.field === 'seatTotal')).toBe(false)
  })

  it('TC03: a fully-filled FARE row (blank PNR code) has zero issues', () => {
    expect(validatePnrRowFields(baseRow())).toHaveLength(0)
  })
})

describe('§2 — PNR Code is never required (Dummy PNR supported)', () => {
  it('TC04: blank pnrCode never produces a field issue', () => {
    const issues = validatePnrRowFields(baseRow({ pnrCode: '' }))
    expect(issues.some(i => i.field === 'pnrCode')).toBe(false)
  })
})

describe('§3 — price validation by format (root-cause bug fix)', () => {
  it('TC05: FARE requires fare > 0; Tax/YQ are never checked', () => {
    expect(validatePnrRowFields(baseRow({ priceFormat: 'FARE', fare: 0 })).some(i => i.field === 'fare')).toBe(true)
    expect(validatePnrRowFields(baseRow({ priceFormat: 'FARE', fare: 5000 })).some(i => i.field === 'fare')).toBe(false)
    // Tax/YQ left null — must not appear as issues for FARE
    const issues = validatePnrRowFields(baseRow({ priceFormat: 'FARE', fare: 5000, yq: null }))
    expect(issues.some(i => i.field === 'yq' || i.field === 'tax')).toBe(false)
  })

  it('TC06: FARE_YQ requires BOTH fare > 0 and yq specified', () => {
    const missingBoth = validatePnrRowFields(baseRow({ priceFormat: 'FARE_YQ', fare: 0, yq: null }))
    expect(missingBoth.some(i => i.field === 'fare')).toBe(true)
    expect(missingBoth.some(i => i.field === 'yq')).toBe(true)

    const missingYq = validatePnrRowFields(baseRow({ priceFormat: 'FARE_YQ', fare: 5000, yq: null }))
    expect(missingYq.some(i => i.field === 'yq')).toBe(true)
    expect(missingYq.some(i => i.field === 'fare')).toBe(false)

    const complete = validatePnrRowFields(baseRow({ priceFormat: 'FARE_YQ', fare: 5000, yq: 0 }))
    expect(complete).toHaveLength(0)   // yq: 0 is a specified value, not "missing"
  })

  it('TC07 (regression guard): ALL_IN requires allInAmount > 0 — fare is NEVER checked, even when fare is forced to 0', () => {
    // This mirrors real PNR objects where fare is always forced to 0 for ALL_IN pricing —
    // the old bug checked `fare > 0` unconditionally and made ALL_IN permanently unable to pass.
    const zeroFareZeroAllIn = validatePnrRowFields(baseRow({ priceFormat: 'ALL_IN', fare: 0, allInAmount: 0 }))
    expect(zeroFareZeroAllIn.some(i => i.field === 'allInAmount')).toBe(true)
    expect(zeroFareZeroAllIn.some(i => i.field === 'fare')).toBe(false)

    const zeroFareValidAllIn = validatePnrRowFields(baseRow({ priceFormat: 'ALL_IN', fare: 0, allInAmount: 12000 }))
    expect(zeroFareValidAllIn).toHaveLength(0)
  })

  it('TC08: fields irrelevant to the current priceFormat are never flagged', () => {
    // ALL_IN: yq/tax stay null/unset and must not appear as issues
    const allIn = validatePnrRowFields(baseRow({ priceFormat: 'ALL_IN', allInAmount: 12000, yq: null }))
    expect(allIn.some(i => i.field === 'yq' || i.field === 'tax')).toBe(false)
  })
})

describe('§4 — NAME DL (TTL) required only when a type is actually selected', () => {
  it('TC09: ttlType NONE never requires ttlDaysBefore/ttlDate', () => {
    expect(validatePnrRowFields(baseRow({ ttlType: 'NONE' }))).toHaveLength(0)
  })

  it('TC10: DAYS_BEFORE requires a non-negative ttlDaysBefore', () => {
    expect(validatePnrRowFields(baseRow({ ttlType: 'DAYS_BEFORE', ttlDaysBefore: null })).some(i => i.field === 'ttlDaysBefore')).toBe(true)
    expect(validatePnrRowFields(baseRow({ ttlType: 'DAYS_BEFORE', ttlDaysBefore: -1 })).some(i => i.field === 'ttlDaysBefore')).toBe(true)
    expect(validatePnrRowFields(baseRow({ ttlType: 'DAYS_BEFORE', ttlDaysBefore: 30 })).some(i => i.field === 'ttlDaysBefore')).toBe(false)
    expect(validatePnrRowFields(baseRow({ ttlType: 'DAYS_BEFORE', ttlDaysBefore: '30' })).some(i => i.field === 'ttlDaysBefore')).toBe(false)
  })

  it('TC11: FIXED_DATE requires ttlDate', () => {
    expect(validatePnrRowFields(baseRow({ ttlType: 'FIXED_DATE', ttlDate: null })).some(i => i.field === 'ttlDate')).toBe(true)
    expect(validatePnrRowFields(baseRow({ ttlType: 'FIXED_DATE', ttlDate: '2026-08-01' })).some(i => i.field === 'ttlDate')).toBe(false)
  })
})

describe('§5 — duplicate PNR code detection (cross-row + cross-stock)', () => {
  it('TC12: blank codes never conflict with each other', () => {
    const dups = findDuplicatePnrRowIndices([{ pnrCode: '' }, { pnrCode: '' }, { pnrCode: '' }])
    expect(dups.size).toBe(0)
  })

  it('TC13: two rows with the same non-blank code conflict; the first occurrence is not flagged', () => {
    const dups = findDuplicatePnrRowIndices([{ pnrCode: 'ABCDEF' }, { pnrCode: 'XYZ123' }, { pnrCode: 'ABCDEF' }])
    expect(dups.has(0)).toBe(false)
    expect(dups.has(2)).toBe(true)
  })

  it('TC14: a code matching an existing (already-saved) PNR conflicts even if unique within the batch', () => {
    const dups = findDuplicatePnrRowIndices([{ pnrCode: 'ABCDEF' }], new Set(['ABCDEF']))
    expect(dups.has(0)).toBe(true)
  })
})

describe('§6 — validatePnrRows / hasAnyPnrError / buildPnrValidationSummary', () => {
  it('TC15: a batch with one bad row (missing Seat) and one good row reports correctly', () => {
    const rows = [baseRow({ seatTotal: null }), baseRow()]
    const validations = validatePnrRows(rows)
    expect(validations[0].hasError).toBe(true)
    expect(validations[1].hasError).toBe(false)
    expect(hasAnyPnrError(validations)).toBe(true)
  })

  it('TC16: a fully valid batch has no errors anywhere', () => {
    const validations = validatePnrRows([baseRow(), baseRow({ travelStart: '2026-07-18' })])
    expect(hasAnyPnrError(validations)).toBe(false)
  })

  it('TC17: buildPnrValidationSummary produces one clickable, row-labeled line per issue, errors first', () => {
    const rows = [
      baseRow({ seatTotal: null }),                                   // row 1: missing Seat
      baseRow({ priceFormat: 'FARE_YQ', fare: 0, yq: null }),         // row 2: missing Fare + YQ
      baseRow(),                                                      // row 3: OK
    ]
    const summary = buildPnrValidationSummary(validatePnrRows(rows))
    expect(summary.every(s => s.severity === 'error')).toBe(true)   // no warnings/info produced by these cases
    expect(summary.some(s => s.rowIndex === 0 && s.label.startsWith('แถว 1:'))).toBe(true)
    expect(summary.some(s => s.rowIndex === 1 && s.field === 'fare')).toBe(true)
    expect(summary.some(s => s.rowIndex === 1 && s.field === 'yq')).toBe(true)
    expect(summary.some(s => s.rowIndex === 2)).toBe(false)
  })

  it('TC18: the example scenario from the spec produces exactly the described shape', () => {
    // "พบข้อมูลไม่ครบ 3 รายการ: แถว 2 ยังไม่ได้ระบุ Seat, แถว 4 ราคาต้องมากกว่า 0, แถว 6 วันที่เดินทางไม่ถูกต้อง"
    const rows = [
      baseRow(),                                            // 1: OK
      baseRow({ seatTotal: null }),                         // 2: missing seat
      baseRow(),                                            // 3: OK
      baseRow({ fare: 0 }),                                 // 4: fare must be > 0
      baseRow(),                                            // 5: OK
      baseRow({ travelStart: '' }),                         // 6: missing travel date
    ]
    const summary = buildPnrValidationSummary(validatePnrRows(rows))
    const errorCount = summary.filter(s => s.severity === 'error').length
    expect(errorCount).toBe(3)
    expect(summary.find(s => s.rowIndex === 1)?.label).toContain('แถว 2')
    expect(summary.find(s => s.rowIndex === 3)?.label).toContain('แถว 4')
    expect(summary.find(s => s.rowIndex === 5)?.label).toContain('แถว 6')
  })
})

describe('§7 — pnrFieldElementId', () => {
  it('TC19: produces a stable, unique id per row+field for scroll-to-error targeting', () => {
    expect(pnrFieldElementId(1, 'seatTotal')).toBe('pnr-field-1-seatTotal')
    expect(pnrFieldElementId(1, 'fare')).not.toBe(pnrFieldElementId(2, 'fare'))
  })
})
