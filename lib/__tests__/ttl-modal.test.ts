/**
 * TTL Modal Regression Tests — 15 Test Cases
 *
 * Verifies correct TTL type preservation, computation, and display
 * for the Edit PNR modal (§1–§15 of the TTL spec).
 */

import { describe, it, expect } from 'vitest'
import { calcTtlDateFromTravel, condTtlTypeToTtlType, type TtlType } from '../ttl-utils'
import type { DemoPNR } from '../demo-storage'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePnr(overrides: Partial<DemoPNR> = {}): DemoPNR {
  return {
    pnrId: 'PNR-TTL-1',
    pnrCode: '',
    dummyPnr: 'DMY-TTL-0001',
    pnrType: 'dummy',
    pnrDisplay: 'DMY-TTL-0001',
    travelStart: '2025-12-01',
    travelEnd: '2025-12-10',
    flightSetId: 'fset-1',
    sectorDates: [],
    seatTotal: 20,
    seatUsed: 0,
    seatBalance: 20,
    priceFormat: 'FARE',
    fare: 5000,
    yq: 0,
    taxType: 'separate',
    tax: 500,
    fareIncludesTax: false,
    taxStatus: 'completed',
    total: 5500,
    conditionCode: '',
    ttlType: null,
    ttlDaysBefore: null,
    ttlDate: null,
    ttlTime: null,
    ttlDateTime: null,
    status: 'Pending',
    remark: '',
    activatedAt: null,
    activatedBy: null,
    closedAt: null,
    closedBy: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    stageSnapshots: {},
    ...overrides,
  }
}

// Simulate openEdit() TTL loading logic
function loadTtlFromPnr(pnr: DemoPNR): { ttlType: TtlType; ttlDaysBefore: string; ttlDate: string; ttlTime: string } {
  return {
    ttlType: pnr.ttlType ?? (pnr.ttlDate ? 'FIXED_DATE' : 'NONE'),
    ttlDaysBefore: pnr.ttlDaysBefore != null ? String(pnr.ttlDaysBefore) : '',
    ttlDate: pnr.ttlDate || '',
    ttlTime: pnr.ttlTime || '',
  }
}

// Simulate buildPnrFromForm() TTL computation
function computeTtlFromForm(form: { ttlType: TtlType; ttlDaysBefore: string; ttlDate: string; ttlTime: string; travelStart: string }) {
  let ttlDate: string | null = null
  const ttlTimeStr = form.ttlTime || null
  if (form.ttlType === 'DAYS_BEFORE') {
    const n = parseInt(form.ttlDaysBefore, 10)
    if (!isNaN(n) && n >= 0 && form.travelStart) {
      ttlDate = calcTtlDateFromTravel(form.travelStart, n)
    }
  } else if (form.ttlType === 'FIXED_DATE') {
    ttlDate = form.ttlDate || null
  }
  const ttlDateTime = ttlDate ? (ttlTimeStr ? `${ttlDate}T${ttlTimeStr}:00` : `${ttlDate}T00:00:00`) : null
  return { ttlDate, ttlTime: ttlTimeStr, ttlDateTime, ttlType: form.ttlType, ttlDaysBefore: form.ttlType === 'DAYS_BEFORE' ? (parseInt(form.ttlDaysBefore, 10) || null) : null }
}

// ─── TC01–TC03: Open modal — ttlType must not change ─────────────────────────

describe('§1 — Open modal: ttlType preserved', () => {
  it('TC01: PNR with ttlType=NONE → form shows NONE', () => {
    const pnr = makePnr({ ttlType: 'NONE', ttlDate: null })
    const form = loadTtlFromPnr(pnr)
    expect(form.ttlType).toBe('NONE')
  })

  it('TC02: PNR with ttlType=DAYS_BEFORE, ttlDaysBefore=30 → form shows DAYS_BEFORE + 30', () => {
    const pnr = makePnr({ ttlType: 'DAYS_BEFORE', ttlDaysBefore: 30, ttlDate: '2025-11-01', ttlTime: '18:00' })
    const form = loadTtlFromPnr(pnr)
    expect(form.ttlType).toBe('DAYS_BEFORE')
    expect(form.ttlDaysBefore).toBe('30')
    expect(form.ttlTime).toBe('18:00')
  })

  it('TC03: PNR with ttlType=FIXED_DATE → form shows FIXED_DATE, not DAYS_BEFORE', () => {
    const pnr = makePnr({ ttlType: 'FIXED_DATE', ttlDate: '2025-11-15', ttlTime: '12:00' })
    const form = loadTtlFromPnr(pnr)
    expect(form.ttlType).toBe('FIXED_DATE')
    expect(form.ttlDate).toBe('2025-11-15')
  })
})

// ─── TC04–TC05: ttlDaysBefore must not be lost ────────────────────────────────

describe('§2 — ttlDaysBefore round-trip', () => {
  it('TC04: ttlDaysBefore=30 round-trips through form correctly', () => {
    const pnr = makePnr({ ttlType: 'DAYS_BEFORE', ttlDaysBefore: 30, ttlDate: '2025-11-01' })
    const form = loadTtlFromPnr(pnr)
    expect(form.ttlDaysBefore).toBe('30')
    expect(form.ttlDaysBefore).not.toBe('')
  })

  it('TC05: ttlDaysBefore=0 is valid and preserved (same day)', () => {
    const pnr = makePnr({ ttlType: 'DAYS_BEFORE', ttlDaysBefore: 0, ttlDate: '2025-12-01' })
    const form = loadTtlFromPnr(pnr)
    expect(form.ttlDaysBefore).toBe('0')
  })
})

// ─── TC06–TC07: Travel date change recalculates DAYS_BEFORE TTL ──────────────

describe('§3 — Travel date change', () => {
  it('TC06: changing travelStart recalculates DAYS_BEFORE TTL date', () => {
    const form1 = computeTtlFromForm({ ttlType: 'DAYS_BEFORE', ttlDaysBefore: '30', ttlDate: '', ttlTime: '18:00', travelStart: '2025-12-01' })
    const form2 = computeTtlFromForm({ ttlType: 'DAYS_BEFORE', ttlDaysBefore: '30', ttlDate: '', ttlTime: '18:00', travelStart: '2026-01-01' })
    expect(form1.ttlDate).toBe('2025-11-01')
    expect(form2.ttlDate).toBe('2025-12-02')
    expect(form1.ttlDate).not.toBe(form2.ttlDate)
  })

  it('TC07: changing travelStart does NOT change FIXED_DATE ttlDate', () => {
    const form1 = computeTtlFromForm({ ttlType: 'FIXED_DATE', ttlDaysBefore: '', ttlDate: '2025-11-15', ttlTime: '', travelStart: '2025-12-01' })
    const form2 = computeTtlFromForm({ ttlType: 'FIXED_DATE', ttlDaysBefore: '', ttlDate: '2025-11-15', ttlTime: '', travelStart: '2026-03-01' })
    expect(form1.ttlDate).toBe('2025-11-15')
    expect(form2.ttlDate).toBe('2025-11-15')
  })
})

// ─── TC08–TC10: Condition TTL helper ─────────────────────────────────────────

describe('§4 — Condition TTL type mapping', () => {
  it('TC08: TRAVEL_MINUS_DAYS maps to DAYS_BEFORE', () => {
    expect(condTtlTypeToTtlType('TRAVEL_MINUS_DAYS')).toBe('DAYS_BEFORE')
  })

  it('TC09: MANUAL_DATE maps to FIXED_DATE', () => {
    expect(condTtlTypeToTtlType('MANUAL_DATE')).toBe('FIXED_DATE')
  })

  it('TC10: NOT_SET and unknown map to NONE', () => {
    expect(condTtlTypeToTtlType('NOT_SET')).toBe('NONE')
    expect(condTtlTypeToTtlType('CONFIRM_PLUS_DAYS')).toBe('NONE')
    expect(condTtlTypeToTtlType('')).toBe('NONE')
  })
})

// ─── TC11–TC12: Switching to NONE clears TTL data ────────────────────────────

describe('§5 — Switch to NONE clears TTL', () => {
  it('TC11: selecting NONE produces null ttlDate and ttlDateTime', () => {
    const result = computeTtlFromForm({ ttlType: 'NONE', ttlDaysBefore: '', ttlDate: '', ttlTime: '', travelStart: '2025-12-01' })
    expect(result.ttlDate).toBeNull()
    expect(result.ttlDateTime).toBeNull()
    expect(result.ttlDaysBefore).toBeNull()
  })

  it('TC12: NONE type does not produce a ttlDateTime even if travelStart is set', () => {
    const result = computeTtlFromForm({ ttlType: 'NONE', ttlDaysBefore: '30', ttlDate: '2025-11-01', ttlTime: '18:00', travelStart: '2025-12-01' })
    // ttlType=NONE overrides everything
    expect(result.ttlDate).toBeNull()
    expect(result.ttlDateTime).toBeNull()
  })
})

// ─── TC13–TC14: Timezone-safe date calculation ────────────────────────────────

describe('§6 — No timezone drift', () => {
  it('TC13: calcTtlDateFromTravel uses noon anchor to avoid UTC date shift', () => {
    // 2025-12-01 noon Bangkok = 2025-11-30 05:00 UTC — noon anchor prevents shift
    const result = calcTtlDateFromTravel('2025-12-01', 30)
    expect(result).toBe('2025-11-01')
  })

  it('TC14: result is always a date-only string yyyy-MM-dd', () => {
    const result = calcTtlDateFromTravel('2026-03-15', 14)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result).toBe('2026-03-01')
  })
})

// ─── TC15: DemoPNR interface has ttlType/ttlDaysBefore ───────────────────────

describe('§7 — DemoPNR stores TTL type metadata', () => {
  it('TC15: backward-compat: pnr without ttlType but with ttlDate infers FIXED_DATE', () => {
    const pnr = makePnr({ ttlType: undefined, ttlDaysBefore: undefined, ttlDate: '2025-11-15' })
    const form = loadTtlFromPnr(pnr)
    expect(form.ttlType).toBe('FIXED_DATE')
    expect(form.ttlDate).toBe('2025-11-15')
  })
})
