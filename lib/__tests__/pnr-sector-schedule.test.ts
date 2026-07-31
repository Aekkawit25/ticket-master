import { describe, it, expect } from 'vitest'
import {
  getPnrSectorSchedules,
  resolvePnrSectorSchedules,
  adaptLegacyPnrSchedule,
  resolveTravelEnd,
} from '@/lib/schedule-resolver'
import type { DemoPNR, DemoFlightSet, PnrSectorSchedule } from '@/lib/demo-storage'

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeSector(
  seq: number,
  sectorType: 'Departure' | 'Transit' | 'Return',
  dayOffset: number,
  arrDayOffset = 0,
  depTime = '08:00',
  arrTime = '10:00'
) {
  return {
    sectorId: `SEC-${seq}`,
    seq,
    sectorType,
    airlineCode: 'TG',
    flightNo: `TG${100 + seq}`,
    depAirportCode: 'BKK',
    arrAirportCode: 'HKT',
    depTime,
    arrTime,
    arrDayOffset,
    dayOffset,
    remark: '',
  }
}

function makeFlightSet(sectors: ReturnType<typeof makeSector>[]): DemoFlightSet {
  return {
    flightSetId: 'fset-test',
    flightSetName: 'Test FlightSet',
    sectors,
  }
}

function makePNR(
  travelStart: string,
  sectorSchedules?: PnrSectorSchedule[],
  sectorDates: { sectorType: string; date: string }[] = []
): DemoPNR {
  return {
    pnrId: 'PNR-test',
    pnrCode: '',
    dummyPnr: 'DMY-001',
    pnrType: 'dummy',
    pnrDisplay: 'DMY-001',
    travelStart,
    travelEnd: '',
    sectorDates,
    sectorSchedules,
    seatTotal: 10,
    seatUsed: 0,
    seatBalance: 10,
    priceFormat: 'FARE',
    fare: 10000,
    yq: 0,
    taxType: 'separate',
    tax: 0,
    fareIncludesTax: false,
    taxStatus: 'completed',
    total: 10000,
    conditionCode: '',
    ttlType: null,
    ttlDaysBefore: null,
    ttlDate: null,
    ttlTime: null,
    ttlDateTime: null,
    status: 'Pending',
    remark: '',
    stageSnapshots: {},
  } as DemoPNR
}

// ─── TC-SS-01: Round-trip 2 sectors, no overnight ────────────────────────────

describe('TC-SS-01: Round-trip 2 sectors — Departure day 1, Return day 5', () => {
  const sectors = [
    makeSector(1, 'Departure', 1, 0),
    makeSector(2, 'Return', 5, 0),
  ]
  const flightSet = makeFlightSet(sectors)
  const pnr = makePNR('2026-03-01')

  it('Departure date = 2026-03-01 (day 1)', () => {
    const [dep] = getPnrSectorSchedules(pnr, flightSet)
    expect(dep.departureDate).toBe('2026-03-01')
  })
  it('Return date = 2026-03-05 (day 5)', () => {
    const [, arr] = getPnrSectorSchedules(pnr, flightSet)
    expect(arr.departureDate).toBe('2026-03-05')
  })
  it('resolveTravelEnd = 2026-03-05', () => {
    const schedules = getPnrSectorSchedules(pnr, flightSet)
    expect(resolveTravelEnd(schedules)).toBe('2026-03-05')
  })
})

// ─── TC-SS-02: Transit 3 sectors ─────────────────────────────────────────────

describe('TC-SS-02: 3-sector trip — Departure day 1, Transit day 1, Return day 5', () => {
  const sectors = [
    makeSector(1, 'Departure', 1, 0),
    makeSector(2, 'Transit', 1, 0),
    makeSector(3, 'Return', 5, 0),
  ]
  const flightSet = makeFlightSet(sectors)
  const pnr = makePNR('2026-06-10')

  it('all 3 schedules produced', () => {
    expect(getPnrSectorSchedules(pnr, flightSet)).toHaveLength(3)
  })
  it('Transit sector date = 2026-06-10 (same as departure day)', () => {
    const schedules = getPnrSectorSchedules(pnr, flightSet)
    expect(schedules[1].departureDate).toBe('2026-06-10')
  })
  it('Return date = 2026-06-14', () => {
    const schedules = getPnrSectorSchedules(pnr, flightSet)
    expect(schedules[2].departureDate).toBe('2026-06-14')
  })
  it('travelEnd driven by last Return = 2026-06-14', () => {
    expect(resolveTravelEnd(getPnrSectorSchedules(pnr, flightSet))).toBe('2026-06-14')
  })
})

// ─── TC-SS-03: Multi-city ─────────────────────────────────────────────────────

describe('TC-SS-03: Multi-city — 3 Departure sectors on different days', () => {
  const sectors = [
    makeSector(1, 'Departure', 1, 0),
    makeSector(2, 'Departure', 4, 0),
    makeSector(3, 'Departure', 7, 0),
  ]
  const flightSet = makeFlightSet(sectors)
  const pnr = makePNR('2026-08-01')

  it('sector 1 = 2026-08-01', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[0].departureDate).toBe('2026-08-01')
  })
  it('sector 2 = 2026-08-04', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[1].departureDate).toBe('2026-08-04')
  })
  it('sector 3 = 2026-08-07', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[2].departureDate).toBe('2026-08-07')
  })
  it('travelEnd = last sector departureDate when no Return sector (no plusDay)', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(resolveTravelEnd(s)).toBe('2026-08-07')
  })
})

// ─── TC-SS-04: +1 overnight day ──────────────────────────────────────────────

describe('TC-SS-04: Return flight crosses midnight (+1 day)', () => {
  const sectors = [
    makeSector(1, 'Departure', 1, 0, '09:00', '11:00'),
    makeSector(2, 'Return', 5, 1, '22:00', '01:00'),  // dep day 5, +1 arr
  ]
  const flightSet = makeFlightSet(sectors)
  const pnr = makePNR('2026-04-01')

  it('Return departureDate = 2026-04-05', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[1].departureDate).toBe('2026-04-05')
  })
  it('Return arrivalDate = 2026-04-06 (+1 from depDate)', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[1].arrivalDate).toBe('2026-04-06')
  })
  it('plusDay = 1', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[1].plusDay).toBe(1)
  })
  it('resolveTravelEnd = 2026-04-06', () => {
    expect(resolveTravelEnd(getPnrSectorSchedules(pnr, flightSet))).toBe('2026-04-06')
  })
})

// ─── TC-SS-05: +2 days ───────────────────────────────────────────────────────

describe('TC-SS-05: Return flight +2 days (long-haul overnight)', () => {
  const sectors = [
    makeSector(1, 'Departure', 1, 0),
    makeSector(2, 'Return', 1, 2, '20:00', '18:00'),  // +2 days
  ]
  const flightSet = makeFlightSet(sectors)
  const pnr = makePNR('2026-12-31')

  it('arrivalDate crosses year boundary = 2027-01-02', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[1].arrivalDate).toBe('2027-01-02')
  })
  it('plusDay = 2', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[1].plusDay).toBe(2)
  })
})

// ─── TC-SS-06: Time 00:00 ────────────────────────────────────────────────────

describe('TC-SS-06: Midnight departure time 00:00', () => {
  const sectors = [
    makeSector(1, 'Departure', 1, 0, '00:00', '03:00'),
    makeSector(2, 'Return', 3, 0, '00:00', '02:30'),
  ]
  const flightSet = makeFlightSet(sectors)
  const pnr = makePNR('2026-05-15')

  it('departureTime preserved as 00:00', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[0].departureTime).toBe('00:00')
  })
  it('departureDate still correct = 2026-05-15', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[0].departureDate).toBe('2026-05-15')
  })
  it('sector 2 departureTime = 00:00', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[1].departureTime).toBe('00:00')
  })
})

// ─── TC-SS-07: Time unspecified (empty string) ───────────────────────────────

describe('TC-SS-07: No times configured on FlightSet sector', () => {
  const sectors = [
    makeSector(1, 'Departure', 1, 0, '', ''),
    makeSector(2, 'Return', 4, 0, '', ''),
  ]
  const flightSet = makeFlightSet(sectors)
  const pnr = makePNR('2026-07-01')

  it('departureTime is empty string', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[0].departureTime).toBe('')
  })
  it('arrivalTime is empty string', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[1].arrivalTime).toBe('')
  })
  it('dates still resolve correctly', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[0].departureDate).toBe('2026-07-01')
    expect(s[1].departureDate).toBe('2026-07-04')
  })
})

// ─── TC-SS-08: Use FlightSet default (no PNR override) ───────────────────────

describe('TC-SS-08: All dates calculated from FlightSet template — no stored overrides', () => {
  const sectors = [
    makeSector(1, 'Departure', 1, 0, '06:30', '09:00'),
    makeSector(2, 'Return', 7, 0, '14:00', '17:00'),
  ]
  const flightSet = makeFlightSet(sectors)
  const pnr = makePNR('2026-09-10', [])  // empty sectorSchedules → legacy path

  it('sourceType = calculated', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[0].sourceType).toBe('calculated')
  })
  it('isDateOverride = false', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s.every(x => !x.isDateOverride)).toBe(true)
  })
  it('dep date from FlightSet dayOffset = 2026-09-10', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[0].departureDate).toBe('2026-09-10')
  })
  it('arr date from FlightSet dayOffset 7 = 2026-09-16', () => {
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[1].departureDate).toBe('2026-09-16')
  })
})

// ─── TC-SS-09: PNR override (isDateOverride=true) ────────────────────────────

describe('TC-SS-09: PNR has manual departure date override for sector 2', () => {
  const sectors = [
    makeSector(1, 'Departure', 1, 0),
    makeSector(2, 'Return', 5, 0),
  ]
  const flightSet = makeFlightSet(sectors)

  // Sector 2 has been manually overridden to 2026-03-10 (instead of calculated 2026-03-05)
  const storedSchedules: PnrSectorSchedule[] = [
    {
      flightSetSectorId: 'SEC-1',
      sequence: 1,
      sectorType: 'Departure',
      departureDate: '2026-03-01',
      departureTime: '08:00',
      arrivalDate: '2026-03-01',
      arrivalTime: '10:00',
      plusDay: 0,
      departureDayOffset: 1,
      isDateOverride: false,
      isTimeOverride: false,
      sourceType: 'calculated',
    },
    {
      flightSetSectorId: 'SEC-2',
      sequence: 2,
      sectorType: 'Return',
      departureDate: '2026-03-10',
      departureTime: '14:00',
      arrivalDate: '2026-03-10',
      arrivalTime: '16:00',
      plusDay: 0,
      departureDayOffset: 5,
      isDateOverride: true,
      isTimeOverride: false,
      sourceType: 'manual',
    },
  ]
  const pnr = makePNR('2026-03-01', storedSchedules)

  it('override date preserved: sector 2 = 2026-03-10', () => {
    const s = resolvePnrSectorSchedules(pnr, flightSet)
    expect(s[1].departureDate).toBe('2026-03-10')
  })
  it('sector 2 isDateOverride = true', () => {
    const s = resolvePnrSectorSchedules(pnr, flightSet)
    expect(s[1].isDateOverride).toBe(true)
  })
  it('sector 1 still calculated (not overridden) = 2026-03-01', () => {
    const s = resolvePnrSectorSchedules(pnr, flightSet)
    expect(s[0].departureDate).toBe('2026-03-01')
    expect(s[0].isDateOverride).toBe(false)
  })
})

// ─── TC-SS-10: Change Travel Date (re-derives dates) ─────────────────────────

describe('TC-SS-10: Re-resolve when travelStart changes (new PNR with different date)', () => {
  const sectors = [
    makeSector(1, 'Departure', 1, 0),
    makeSector(2, 'Return', 5, 0),
  ]
  const flightSet = makeFlightSet(sectors)

  const pnrOriginal = makePNR('2026-01-10')
  const pnrMoved = makePNR('2026-02-20')

  it('original: dep = 2026-01-10, arr = 2026-01-14', () => {
    const s = getPnrSectorSchedules(pnrOriginal, flightSet)
    expect(s[0].departureDate).toBe('2026-01-10')
    expect(s[1].departureDate).toBe('2026-01-14')
  })
  it('after travel date move: dep = 2026-02-20, arr = 2026-02-24', () => {
    const s = getPnrSectorSchedules(pnrMoved, flightSet)
    expect(s[0].departureDate).toBe('2026-02-20')
    expect(s[1].departureDate).toBe('2026-02-24')
  })
})

// ─── TC-SS-11: Local date — no UTC shift ─────────────────────────────────────

describe('TC-SS-11: Date strings must not UTC-shift (local midnight only)', () => {
  const sectors = [
    makeSector(1, 'Departure', 1, 0),
    makeSector(2, 'Return', 2, 1),  // +1 overnight: arr day 2, arrive day 3
  ]
  const flightSet = makeFlightSet(sectors)

  it('2026-01-01 stays Jan 1 regardless of timezone (no UTC shift)', () => {
    const pnr = makePNR('2026-01-01')
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[0].departureDate).toBe('2026-01-01')
  })

  it('2026-03-08 (DST boundary for some locales) parsed correctly', () => {
    const pnr = makePNR('2026-03-08')
    const s = getPnrSectorSchedules(pnr, flightSet)
    expect(s[0].departureDate).toBe('2026-03-08')
  })

  it('+1 overnight from 2026-12-31 = 2027-01-01 (no UTC confusion)', () => {
    const pnr = makePNR('2026-12-31')
    const s = getPnrSectorSchedules(pnr, flightSet)
    // sector 2: depDate = day 2 = Jan 1 2027; arrivalDate = +1 = Jan 2 2027
    expect(s[1].departureDate).toBe('2027-01-01')
    expect(s[1].arrivalDate).toBe('2027-01-02')
  })
})

// ─── TC-SS-12: Legacy data (no sectorSchedules) ──────────────────────────────

describe('TC-SS-12: Legacy PNR — sectorSchedules absent, reconstruct from sectorDates', () => {
  const sectors = [
    makeSector(1, 'Departure', 1, 0, '07:00', '09:00'),
    makeSector(2, 'Return', 6, 0, '12:00', '14:00'),
  ]
  const flightSet = makeFlightSet(sectors)

  // Note: sectorDates[].sectorType is not read by adaptLegacyPnrSchedule (only .date is —
  // sector type comes from the FlightSet template above), so this only exercises the
  // legacy date-fallback path, not sector-type normalization.
  const legacyPnr = makePNR(
    '2026-11-01',
    undefined,  // no sectorSchedules
    [
      { sectorType: 'Departure', date: '2026-11-01' },
      { sectorType: 'Return', date: '2026-11-06' },
    ]
  )

  it('uses adaptLegacyPnrSchedule path (getPnrSectorSchedules)', () => {
    const s = getPnrSectorSchedules(legacyPnr, flightSet)
    expect(s).toHaveLength(2)
  })
  it('departure date from legacy sectorDates = 2026-11-01', () => {
    const s = adaptLegacyPnrSchedule(legacyPnr, flightSet)
    expect(s[0].departureDate).toBe('2026-11-01')
  })
  it('arrival date from legacy sectorDates = 2026-11-06', () => {
    const s = adaptLegacyPnrSchedule(legacyPnr, flightSet)
    expect(s[1].departureDate).toBe('2026-11-06')
  })
  it('sourceType = calculated (legacy path)', () => {
    const s = adaptLegacyPnrSchedule(legacyPnr, flightSet)
    expect(s.every(x => x.sourceType === 'calculated')).toBe(true)
  })
  it('isDateOverride = false (legacy path)', () => {
    const s = adaptLegacyPnrSchedule(legacyPnr, flightSet)
    expect(s.every(x => !x.isDateOverride)).toBe(true)
  })
  it('times come from FlightSet template', () => {
    const s = adaptLegacyPnrSchedule(legacyPnr, flightSet)
    expect(s[0].departureTime).toBe('07:00')
    expect(s[1].arrivalTime).toBe('14:00')
  })
  it('resolveTravelEnd = 2026-11-06', () => {
    const s = adaptLegacyPnrSchedule(legacyPnr, flightSet)
    expect(resolveTravelEnd(s)).toBe('2026-11-06')
  })
})
