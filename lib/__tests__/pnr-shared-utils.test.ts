import { describe, it, expect } from 'vitest'
import {
  calculateSectorDatesFromTravelStart,
  generateDummyPnrCode,
  pnrToFormValues,
  buildDemoPnrFromForm,
  validatePnrFormValues,
  EMPTY_PNR_FORM,
} from '@/lib/pnr-shared-utils'
import type { PnrFormValues, PnrModalFlightSet } from '@/lib/pnr-shared-utils'
import type { DemoStock, DemoPNR } from '@/lib/demo-storage'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TRAVEL_START = '2026-03-01'

const TWO_SECTORS: PnrModalFlightSet['sectors'] = [
  { sectorId: 'S1', seq: 1, sectorType: 'Departure', dayOffset: 1, arrDayOffset: 0,
    depAirportCode: 'BKK', arrAirportCode: 'NRT', depTime: '08:00', arrTime: '15:00' },
  { sectorId: 'S2', seq: 2, sectorType: 'Arrival',   dayOffset: 3, arrDayOffset: 0,
    depAirportCode: 'NRT', arrAirportCode: 'BKK', depTime: '17:00', arrTime: '22:00' },
]

const FLIGHT_SET: PnrModalFlightSet = {
  flightSetId:   'FS-1',
  flightSetName: 'BKK ↔ NRT',
  sectors:       TWO_SECTORS,
}

function mkStock(overrides: Partial<DemoStock> = {}): DemoStock {
  return {
    stockId:      'ST-1',
    stockCode:    'GRP001',
    ticketType:   'Group',
    tripType:     'Round-trip',
    groupName:    'Test Group',
    airlineCode:  'TG',
    countryId:    'JP',
    destination:  'NRT',
    currency:     'THB',
    remark:       '',
    routeText:    'BKK-NRT',
    createdAt:    '',
    updatedAt:    '',
    sectors:      [],
    conditions:   [],
    pnrs:         [],
    summary:      { period: '', periodStart: null, periodEnd: null, pnrCount: 0, seatTotal: 0,
                    seatUsed: 0, seatBalance: 0, fareTotal: 0, taxTotal: 0, yqTotal: 0,
                    grandTotal: 0, nextTTL: null },
    logs:         [],
    transactions: [],
    ...overrides,
  } as DemoStock
}

function mkPNR(overrides: Partial<DemoPNR> = {}): DemoPNR {
  return {
    pnrId:          'PNR-1', pnrCode: '', dummyPnr: 'DMY-GRPTG2603-0001',
    pnrType:        'dummy', pnrDisplay: 'DMY-GRPTG2603-0001',
    travelStart:    TRAVEL_START, travelEnd: '2026-03-03', flightSetId: 'FS-1',
    sectorDates:    [{ sectorType: 'Departure', date: '2026-03-01' }, { sectorType: 'Arrival', date: '2026-03-03' }],
    seatTotal:      40, seatUsed: 0, seatBalance: 40,
    priceFormat:    'FARE', fare: 1000, yq: 200, taxType: 'separate', tax: 100,
    fareIncludesTax: false, taxStatus: 'completed', total: 1300,
    conditionCode:  '', ttlType: 'NONE', ttlDate: null, ttlTime: null, ttlDateTime: null,
    status:         'Pending', remark: '',
    ...overrides,
  } as DemoPNR
}

const BASE_FORM: PnrFormValues = {
  ...EMPTY_PNR_FORM,
  flightSetId:  'FS-1',
  travelStart:  TRAVEL_START,
  seatTotal:    '40',
  priceFormat:  'FARE',
  fare:         '1000',
  yq:           '200',
  tax:          '100',
}

// ─── Test 1 — shared data model (PnrFormValues) ──────────────────────────────

describe('Test 1 — shared data model: EMPTY_PNR_FORM and round-trip', () => {
  it('EMPTY_PNR_FORM has camelCase fields with correct defaults', () => {
    expect(EMPTY_PNR_FORM.pnrCode).toBe('')
    expect(EMPTY_PNR_FORM.flightSetId).toBe('')
    expect(EMPTY_PNR_FORM.travelStart).toBe('')
    expect(EMPTY_PNR_FORM.priceFormat).toBe('FARE')
    expect(EMPTY_PNR_FORM.taxType).toBe('separate')
    expect(EMPTY_PNR_FORM.ttlType).toBe('NONE')
  })

  it('pnrToFormValues maps DemoPNR fields to camelCase form fields', () => {
    const pnr = mkPNR({ pnrCode: 'TG123', flightSetId: 'FS-42', priceFormat: 'FARE_YQ', fare: 1000, yq: 200 })
    const form = pnrToFormValues(pnr)
    expect(form.pnrCode).toBe('TG123')
    expect(form.flightSetId).toBe('FS-42')
    expect(form.priceFormat).toBe('FARE_YQ')
    expect(form.fare).toBe('1000')
    expect(form.yq).toBe('200')
  })
})

// ─── Test 2 — same sector dates from Travel Start + FlightSet ─────────────────

describe('Test 2 — sector dates from Travel Start + FlightSet', () => {
  it('calculateSectorDatesFromTravelStart returns correct dep/arr dates', () => {
    const dates = calculateSectorDatesFromTravelStart(TRAVEL_START, TWO_SECTORS)
    expect(dates).toHaveLength(2)
    expect(dates[0].depDate).toBe('2026-03-01')   // dayOffset=1 → day 0 offset from travel start
    expect(dates[0].arrDate).toBe('2026-03-01')   // arrDayOffset=0
    expect(dates[1].depDate).toBe('2026-03-03')   // dayOffset=3 → 2 days after travel start
    expect(dates[1].arrDate).toBe('2026-03-03')   // arrDayOffset=0
  })

  it('sector dates appear correctly in DemoPNR built from form', () => {
    const pnr = buildDemoPnrFromForm(BASE_FORM, mkStock(), FLIGHT_SET)
    expect(pnr.sectorDates[0]?.date).toBe('2026-03-01')
    expect(pnr.sectorDates[1]?.date).toBe('2026-03-03')
  })
})

// ─── Test 3 — FARE+YQ price field mapping ────────────────────────────────────

describe('Test 3 — FARE+YQ price fields', () => {
  it('FARE_YQ: total = fare + yq, tax is 0', () => {
    const form: PnrFormValues = { ...BASE_FORM, priceFormat: 'FARE_YQ', fare: '1000', yq: '200', tax: '99' }
    const pnr = buildDemoPnrFromForm(form, mkStock(), FLIGHT_SET)
    expect(pnr.fare).toBe(1000)
    expect(pnr.yq).toBe(200)
    expect(pnr.tax).toBe(0)
    expect(pnr.total).toBe(1200)
  })

  it('ALL_IN: total = allIn, fare/yq/tax are all 0', () => {
    const form: PnrFormValues = { ...BASE_FORM, priceFormat: 'ALL_IN', allIn: '3500' }
    const pnr = buildDemoPnrFromForm(form, mkStock(), FLIGHT_SET)
    expect(pnr.fare).toBe(0)
    expect(pnr.yq).toBe(0)
    expect(pnr.tax).toBe(0)
    expect(pnr.total).toBe(3500)
    expect(pnr.taxType).toBe('included')
  })

  it('FARE: total = fare + yq + tax', () => {
    const form: PnrFormValues = { ...BASE_FORM, priceFormat: 'FARE', fare: '1000', yq: '200', tax: '100' }
    const pnr = buildDemoPnrFromForm(form, mkStock(), FLIGHT_SET)
    expect(pnr.total).toBe(1300)
  })
})

// ─── Test 4 — empty PNR code generates Dummy by shared rule ──────────────────

describe('Test 4 — empty PNR code → Dummy code via shared generateDummyPnrCode', () => {
  it('generates DMY-GRPTG2603-0001 for first PNR in Group/TG stock', () => {
    const code = generateDummyPnrCode(TRAVEL_START, mkStock())
    expect(code).toBe('DMY-GRPTG2603-0001')
  })

  it('alreadyUsed set bumps sequence correctly', () => {
    const used = new Set(['DMY-GRPTG2603-0001', 'DMY-GRPTG2603-0002'])
    const code = generateDummyPnrCode(TRAVEL_START, mkStock(), used)
    expect(code).toBe('DMY-GRPTG2603-0003')
  })

  it('buildDemoPnrFromForm with empty pnrCode sets dummyPnr and pnrType="dummy"', () => {
    const form: PnrFormValues = { ...BASE_FORM, pnrCode: '' }
    const pnr = buildDemoPnrFromForm(form, mkStock(), FLIGHT_SET)
    expect(pnr.pnrCode).toBe('')
    expect(pnr.dummyPnr).toMatch(/^DMY-GRPTG2603-\d{4}$/)
    expect(pnr.pnrType).toBe('dummy')
  })

  it('buildDemoPnrFromForm with non-empty pnrCode sets pnrType="real"', () => {
    const form: PnrFormValues = { ...BASE_FORM, pnrCode: 'TG1234' }
    const pnr = buildDemoPnrFromForm(form, mkStock(), FLIGHT_SET)
    expect(pnr.pnrCode).toBe('TG1234')
    expect(pnr.pnrType).toBe('real')
    expect(pnr.dummyPnr).toBe('')
  })
})

// ─── Test 5 — Series PNR preserves flightSetId ───────────────────────────────

describe('Test 5 — existing Series PNR has correct flightSetId', () => {
  it('pnrToFormValues preserves flightSetId from DemoPNR', () => {
    const pnr = mkPNR({ flightSetId: 'FS-99' })
    const form = pnrToFormValues(pnr)
    expect(form.flightSetId).toBe('FS-99')
  })

  it('buildDemoPnrFromForm carries flightSetId from the passed PnrModalFlightSet', () => {
    const form: PnrFormValues = { ...BASE_FORM, flightSetId: 'FS-1', pnrCode: 'ABC' }
    const pnr = buildDemoPnrFromForm(form, mkStock(), FLIGHT_SET)
    expect(pnr.flightSetId).toBe('FS-1')
  })

  it('editing an existing PNR preserves its pnrId', () => {
    const existing = mkPNR({ pnrId: 'PNR-EXISTING', pnrCode: 'TG999' })
    const form: PnrFormValues = { ...BASE_FORM, pnrCode: 'TG999' }
    const pnr = buildDemoPnrFromForm(form, mkStock(), FLIGHT_SET, existing)
    expect(pnr.pnrId).toBe('PNR-EXISTING')
  })
})

// ─── Test 6 — shared validation applies to both wizard and series flows ───────

describe('Test 6 — validatePnrFormValues is the single shared validation', () => {
  it('rejects empty travelStart', () => {
    const errs = validatePnrFormValues({ ...BASE_FORM, travelStart: '' })
    expect(errs.travelStart).toBeTruthy()
  })

  it('rejects zero or missing seatTotal', () => {
    const errs = validatePnrFormValues({ ...BASE_FORM, seatTotal: '0' })
    expect(errs.seatTotal).toBeTruthy()
  })

  it('rejects empty fare when priceFormat is FARE', () => {
    const errs = validatePnrFormValues({ ...BASE_FORM, fare: '0' })
    expect(errs.fare).toBeTruthy()
  })

  it('passes when all required fields are valid', () => {
    const errs = validatePnrFormValues(BASE_FORM)
    expect(Object.keys(errs)).toHaveLength(0)
  })
})
