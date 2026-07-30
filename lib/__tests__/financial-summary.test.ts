import { describe, it, expect } from 'vitest'
import { computeStockFinancials, calculateStockSummary } from '@/lib/demo-storage'
import type { DemoPNR } from '@/lib/demo-storage'

// Minimal DemoPNR stub for testing
function makePNR(overrides: Partial<DemoPNR>): DemoPNR {
  return {
    pnrId: 'PNR-test',
    pnrCode: '', dummyPnr: 'DMY-001',
    pnrType: 'dummy', pnrDisplay: 'DMY-001',
    travelStart: '2026-07-11', travelEnd: '2026-07-18',
    sectorDates: [],
    seatTotal: 33, seatUsed: 0, seatBalance: 33,
    priceFormat: 'FARE',
    fare: 20000, yq: 1500.51,
    taxType: 'separate', tax: 1200,
    fareIncludesTax: false, taxStatus: 'completed',
    total: 22700.51,
    conditionCode: '',
    ttlType: null, ttlDaysBefore: null, ttlDate: null, ttlTime: null, ttlDateTime: null,
    status: 'Pending',
    remark: '', stageSnapshots: {},
    ...overrides,
  } as DemoPNR
}

// ─── TC-F-01: ราคาเหมือนกันทุก PNR (uniform) ──────────────────────────────

describe('TC-F-01: uniform pricing — 3 PNRs × 33 seats = 99 seats', () => {
  const pnrs = [
    makePNR({ seatTotal: 33 }),
    makePNR({ seatTotal: 33 }),
    makePNR({ seatTotal: 33 }),
  ]

  it('grandTotal = 22,700.51 × 99 = 2,247,350.49', () => {
    const f = computeStockFinancials(pnrs)
    expect(f.grandTotal).toBeCloseTo(2247350.49, 1)
  })
  it('fareTotal = 20,000 × 99 = 1,980,000', () => {
    const f = computeStockFinancials(pnrs)
    expect(f.fareTotal).toBeCloseTo(1980000, 1)
  })
  it('taxTotal = 1,200 × 99 = 118,800', () => {
    const f = computeStockFinancials(pnrs)
    expect(f.taxTotal).toBeCloseTo(118800, 1)
  })
  it('yqTotal = 1,500.51 × 99 = 148,550.49', () => {
    const f = computeStockFinancials(pnrs)
    expect(f.yqTotal).toBeCloseTo(148550.49, 1)
  })
  it('totalSeats = 99', () => {
    expect(computeStockFinancials(pnrs).totalSeats).toBe(99)
  })
  it('isUniform = true', () => {
    expect(computeStockFinancials(pnrs).isUniform).toBe(true)
  })
  it('totalPerSeat = 22,700.51 (same as input)', () => {
    const f = computeStockFinancials(pnrs)
    expect(f.totalPerSeat).toBeCloseTo(22700.51, 2)
  })
  it('hasTax = true, hasYQ = true', () => {
    const f = computeStockFinancials(pnrs)
    expect(f.hasTax).toBe(true)
    expect(f.hasYQ).toBe(true)
  })
})

// ─── TC-F-02: ราคาแต่ละ PNR ไม่เท่ากัน (non-uniform) ──────────────────────

describe('TC-F-02: non-uniform pricing — weighted average', () => {
  // PNR-A: 40 seats × 20,000 = 800,000 total
  // PNR-B: 60 seats × 25,000 = 1,500,000 total
  const pnrs = [
    makePNR({ seatTotal: 40, fare: 20000, yq: 0, tax: 0, total: 20000 }),
    makePNR({ seatTotal: 60, fare: 25000, yq: 0, tax: 0, total: 25000 }),
  ]

  it('grandTotal = 40×20000 + 60×25000 = 2,300,000', () => {
    expect(computeStockFinancials(pnrs).grandTotal).toBe(2300000)
  })
  it('totalPerSeat = 2,300,000 / 100 = 23,000 (weighted average)', () => {
    expect(computeStockFinancials(pnrs).totalPerSeat).toBe(23000)
  })
  it('isUniform = false', () => {
    expect(computeStockFinancials(pnrs).isUniform).toBe(false)
  })
})

// ─── TC-F-03: Tax = 0 (ระบุเป็นศูนย์จริง) ──────────────────────────────────

describe('TC-F-03: Tax explicitly 0', () => {
  const pnrs = [makePNR({ tax: 0, total: 20000 + 0 + 1500.51 })]

  it('taxTotal = 0 (not null/undefined)', () => {
    expect(computeStockFinancials(pnrs).taxTotal).toBe(0)
  })
  it('hasTax = true (taxType=separate, even if value is 0)', () => {
    expect(computeStockFinancials(pnrs).hasTax).toBe(true)
  })
})

// ─── TC-F-04: ALL_IN format — ไม่มี Tax / YQ แยก ───────────────────────────

describe('TC-F-04: ALL_IN format', () => {
  const pnrs = [makePNR({
    priceFormat: 'ALL_IN',
    fare: 30000, yq: undefined, taxType: 'included', tax: 0, total: 30000,
    seatTotal: 10,
  })]

  it('taxTotal = 0 (taxType not separate)', () => {
    expect(computeStockFinancials(pnrs).taxTotal).toBe(0)
  })
  it('yqTotal = 0 (ALL_IN excludes YQ)', () => {
    expect(computeStockFinancials(pnrs).yqTotal).toBe(0)
  })
  it('fareTotal = 30000 × 10 = 300,000', () => {
    expect(computeStockFinancials(pnrs).fareTotal).toBe(300000)
  })
  it('hasTax = false, hasYQ = false', () => {
    const f = computeStockFinancials(pnrs)
    expect(f.hasTax).toBe(false)
    expect(f.hasYQ).toBe(false)
  })
})

// ─── TC-F-05: YQ = 0 (ไม่ใช้ YQ แต่ format ไม่ใช่ ALL_IN) ─────────────────

describe('TC-F-05: YQ = 0, format FARE', () => {
  const pnrs = [makePNR({ yq: 0, total: 20000 + 1200 + 0, seatTotal: 5 })]

  it('yqTotal = 0', () => {
    expect(computeStockFinancials(pnrs).yqTotal).toBe(0)
  })
  it('hasYQ = false (yq=0)', () => {
    expect(computeStockFinancials(pnrs).hasYQ).toBe(false)
  })
})

// ─── TC-F-06: Cancelled PNRs ถูก exclude ──────────────────────────────────

describe('TC-F-06: cancelled PNRs excluded from totals', () => {
  const pnrs = [
    makePNR({ seatTotal: 33, status: 'Pending' }),
    makePNR({ seatTotal: 33, status: 'Cancelled' }),  // should be excluded
  ]

  it('totalSeats = 33 (only active PNR)', () => {
    expect(computeStockFinancials(pnrs).totalSeats).toBe(33)
  })
  it('grandTotal uses only active PNRs', () => {
    const f = computeStockFinancials(pnrs)
    expect(f.grandTotal).toBeCloseTo(22700.51 * 33, 1)
  })
})

// ─── TC-F-07: Empty PNR list ─────────────────────────────────────────────────

describe('TC-F-07: empty PNR list', () => {
  it('all totals = 0, no division by zero', () => {
    const f = computeStockFinancials([])
    expect(f.grandTotal).toBe(0)
    expect(f.totalPerSeat).toBe(0)
    expect(f.totalSeats).toBe(0)
    expect(f.isUniform).toBe(true)
  })
})

// ─── TC-F-08: calculateStockSummary produces same totals ────────────────────

describe('TC-F-08: calculateStockSummary × seatTotal (stored summary)', () => {
  const pnrs = [
    makePNR({ seatTotal: 33 }),
    makePNR({ seatTotal: 33 }),
    makePNR({ seatTotal: 33 }),
  ]

  it('summary.grandTotal = 2,247,350.49', () => {
    const s = calculateStockSummary(pnrs)
    expect(s.grandTotal).toBeCloseTo(2247350.49, 1)
  })
  it('summary.yqTotal = 148,550.49', () => {
    const s = calculateStockSummary(pnrs)
    expect(s.yqTotal).toBeCloseTo(148550.49, 1)
  })
  it('summary.fareTotal = 1,980,000', () => {
    const s = calculateStockSummary(pnrs)
    expect(s.fareTotal).toBeCloseTo(1980000, 1)
  })
})
