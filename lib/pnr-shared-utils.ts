/**
 * Shared PNR utilities — single source of truth for:
 *  - Form value type (PnrFormValues)
 *  - Sector date calculation
 *  - Dummy PNR code generation
 *  - DemoPNR ↔ form conversion
 *  - Validation
 *  - Building DemoPNR from form values
 *
 * Used by: SinglePnrModal, BulkPnrBuilder, Step4PNR, PNRTab
 */

import { addDays, parseISO, format, isValid } from 'date-fns'
import type { DemoStock, DemoFlightSet, DemoPNR } from './demo-storage'
import type { TtlType } from './ttl-utils'

// ── Lightweight sector / flightSet types ──────────────────────────────────────
// Compatible with DemoSector / DemoFlightSet — callers can pass either.

export interface PnrModalSector {
  sectorId: string
  seq: number
  sectorType: string
  airlineCode?: string | null
  flightNo?: string | null
  depAirportCode?: string | null
  arrAirportCode?: string | null
  depTime?: string | null
  arrTime?: string | null
  dayOffset: number
  arrDayOffset?: number | null
}

export interface PnrModalFlightSet {
  flightSetId: string
  flightSetName: string
  sectors: PnrModalSector[]
}

export interface PnrModalCondition {
  code: string
  name: string
  ttlRule?: {
    calcType: 'TRAVEL_MINUS_DAYS' | 'FIXED_DATE' | 'NONE'
    daysBefore?: number | null
    fixedDate?: string | null
    time?: string | null
  }
}

// ── Unified PNR form values ───────────────────────────────────────────────────

export interface PnrFormValues {
  pnrCode: string
  flightSetId: string
  travelStart: string      // YYYY-MM-DD
  seatTotal: string
  priceFormat: 'FARE' | 'FARE_YQ' | 'ALL_IN'
  fare: string
  yq: string
  taxType: 'separate' | 'included' | 'pending'
  tax: string
  allIn: string
  conditionCode: string
  ttlType: TtlType
  ttlDaysBefore: string
  ttlDate: string
  ttlTime: string
  remark: string
}

export const EMPTY_PNR_FORM: PnrFormValues = {
  pnrCode: '', flightSetId: '', travelStart: '', seatTotal: '',
  priceFormat: 'FARE', fare: '', yq: '', taxType: 'separate', tax: '', allIn: '',
  conditionCode: '', ttlType: 'NONE', ttlDaysBefore: '', ttlDate: '', ttlTime: '',
  remark: '',
}

// ── Sector row (computed, for display) ───────────────────────────────────────

export interface PnrSectorRow {
  sectorId: string
  seq: number
  sectorType: string
  airlineCode: string
  flightNo: string
  depAirportCode: string
  arrAirportCode: string
  depTime: string
  arrTime: string
  dayOffset: number
  arrDayOffset: number
  depDate: string    // YYYY-MM-DD, empty if travelStart not set
  arrDate: string    // YYYY-MM-DD, empty if travelStart not set
}

// ── Sector date calculation ───────────────────────────────────────────────────

/**
 * Compute departure / arrival dates for every sector given a travel start date.
 * Single source of truth — replaces computeSectorOverrides, calcSectorDate,
 * calcSectorDepDate, and addDaysToDate scattered across wizard / PNRTab / BulkPnrBuilder.
 */
export function calculateSectorDatesFromTravelStart(
  travelStart: string,
  sectors: Pick<PnrModalSector, 'dayOffset' | 'arrDayOffset'>[]
): { depDate: string; arrDate: string }[] {
  if (!sectors.length) return []

  let base: Date | null = null
  if (travelStart) {
    try {
      const d = parseISO(travelStart)
      if (isValid(d)) base = d
    } catch { /* ignore */ }
  }

  return sectors.map(sec => {
    if (!base) return { depDate: '', arrDate: '' }
    const dayOffset    = sec.dayOffset ?? 1
    const arrDayOffset = sec.arrDayOffset ?? 0
    try {
      const dep = addDays(base!, dayOffset - 1)
      const arr = addDays(dep, arrDayOffset)
      return {
        depDate: isValid(dep) ? format(dep, 'yyyy-MM-dd') : '',
        arrDate: isValid(arr) ? format(arr, 'yyyy-MM-dd') : '',
      }
    } catch {
      return { depDate: '', arrDate: '' }
    }
  })
}

/** Convenience wrapper — returns full PnrSectorRow[] for display */
export function buildSectorRows(
  sectors: PnrModalSector[],
  travelStart: string
): PnrSectorRow[] {
  const dates = calculateSectorDatesFromTravelStart(travelStart, sectors)
  return sectors.map((sec, i) => ({
    sectorId:        sec.sectorId,
    seq:             sec.seq,
    sectorType:      sec.sectorType,
    airlineCode:     sec.airlineCode ?? '',
    flightNo:        sec.flightNo ?? '',
    depAirportCode:  sec.depAirportCode ?? '',
    arrAirportCode:  sec.arrAirportCode ?? '',
    depTime:         sec.depTime ?? '',
    arrTime:         sec.arrTime ?? '',
    dayOffset:       sec.dayOffset,
    arrDayOffset:    sec.arrDayOffset ?? 0,
    depDate:         dates[i]?.depDate ?? '',
    arrDate:         dates[i]?.arrDate ?? '',
  }))
}

/** Compute travel end = arr date of last sector */
export function calcTravelEndFromFlightSet(
  travelStart: string,
  sectors: Pick<PnrModalSector, 'dayOffset' | 'arrDayOffset'>[]
): string {
  if (!travelStart || !sectors.length) return travelStart
  const dates = calculateSectorDatesFromTravelStart(travelStart, sectors)
  return dates[dates.length - 1]?.arrDate || travelStart
}

// ── Dummy PNR code generation ─────────────────────────────────────────────────

function pnrTypePrefix(ticketType: string): string {
  if (ticketType === 'Group') return 'GRP'
  if (ticketType === 'FIT') return 'FIT'
  return 'TNL'
}

/**
 * Generate a globally-unique dummy PNR code.
 * Format: DMY-{TYPE}{AIRLINE}{YYMM}-{NNNN}
 * Scans stock.pnrs + optional alreadyUsed set to find the next available sequence.
 */
export function generateDummyPnrCode(
  travelStart: string,
  stock: Pick<DemoStock, 'ticketType' | 'airlineCode' | 'pnrs'>,
  alreadyUsed?: Set<string>
): string {
  const typeCode = pnrTypePrefix(stock.ticketType)
  const airline  = (stock.airlineCode || 'XX').toUpperCase()
  const yymm     = travelStart.length >= 7
    ? travelStart.slice(2, 4) + travelStart.slice(5, 7)
    : format(new Date(), 'yyMM')
  const key      = `${typeCode}${airline}${yymm}`
  const pat      = new RegExp(`^DMY-${key}-(\\d{4})$`)

  let max = 0
  for (const p of stock.pnrs) {
    if (p.dummyPnr) { const m = p.dummyPnr.match(pat); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  }
  alreadyUsed?.forEach(u => { const m = u.match(pat); if (m) max = Math.max(max, parseInt(m[1], 10)) })

  return `DMY-${key}-${String(max + 1).padStart(4, '0')}`
}

// ── DemoPNR → PnrFormValues ───────────────────────────────────────────────────

export function pnrToFormValues(pnr: DemoPNR): PnrFormValues {
  const fmt = (pnr.priceFormat ?? 'FARE') as 'FARE' | 'FARE_YQ' | 'ALL_IN'
  return {
    pnrCode:       pnr.pnrCode || '',
    flightSetId:   pnr.flightSetId || '',
    travelStart:   pnr.travelStart || '',
    seatTotal:     String(pnr.seatTotal),
    priceFormat:   fmt,
    fare:          fmt === 'ALL_IN' ? '' : String(pnr.fare ?? 0),
    yq:            pnr.yq != null ? String(pnr.yq) : '',
    taxType:       (pnr.taxType as 'separate' | 'included' | 'pending') || 'separate',
    tax:           pnr.tax != null ? String(pnr.tax) : '',
    allIn:         fmt === 'ALL_IN' ? String(pnr.total ?? 0) : '',
    conditionCode: pnr.conditionCode || '',
    ttlType:       pnr.ttlType ?? 'NONE',
    ttlDaysBefore: pnr.ttlDaysBefore != null ? String(pnr.ttlDaysBefore) : '',
    ttlDate:       pnr.ttlDate || '',
    ttlTime:       pnr.ttlTime || '',
    remark:        pnr.remark || '',
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface PnrValidationCtx {
  stock?: DemoStock
  existingPnrId?: string
}

export function validatePnrFormValues(
  v: PnrFormValues,
  ctx: PnrValidationCtx = {}
): Record<string, string> {
  const e: Record<string, string> = {}

  if (!v.travelStart) e.travelStart = 'กรุณากรอก Travel Start'

  const seats = Number(v.seatTotal)
  if (!v.seatTotal || isNaN(seats) || seats <= 0) e.seatTotal = 'กรุณากรอก Seat (มากกว่า 0)'

  if (v.priceFormat === 'ALL_IN') {
    const n = Number(v.allIn)
    if (!v.allIn || isNaN(n) || n <= 0) e.allIn = 'กรุณากรอก All In (มากกว่า 0)'
  } else {
    const n = Number(v.fare)
    if (!v.fare || isNaN(n) || n <= 0) e.fare = 'กรุณากรอก Fare (มากกว่า 0)'
  }

  if (v.ttlType === 'DAYS_BEFORE') {
    const d = parseInt(v.ttlDaysBefore, 10)
    if (v.ttlDaysBefore === '' || isNaN(d) || d < 0) e.ttlDaysBefore = 'กรุณากรอกจำนวนวัน (≥ 0)'
  }
  if (v.ttlType === 'FIXED_DATE' && !v.ttlDate) e.ttlDate = 'กรุณากรอกวันที่ TTL'

  if (v.pnrCode.trim() && ctx.stock) {
    const dup = ctx.stock.pnrs.find(p =>
      p.pnrCode === v.pnrCode.trim() && p.pnrId !== ctx.existingPnrId
    )
    if (dup) e.pnrCode = `PNR "${v.pnrCode.trim()}" มีอยู่แล้วใน Series นี้`
  }

  return e
}

// ── Build DemoPNR from form ───────────────────────────────────────────────────

export function buildDemoPnrFromForm(
  v: PnrFormValues,
  stock: DemoStock,
  flightSet: PnrModalFlightSet | DemoFlightSet,
  existingPnr?: DemoPNR
): DemoPNR {
  const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  // Code / dummy
  const isReal     = !!v.pnrCode.trim()
  const dummyPnr   = isReal ? '' : (existingPnr?.dummyPnr || generateDummyPnrCode(v.travelStart, stock))
  const pnrCode    = isReal ? v.pnrCode.trim() : ''
  const pnrDisplay = isReal ? pnrCode : dummyPnr

  // Price
  const fare  = Number(v.fare) || 0
  const yqAmt = Number(v.yq) || 0
  const tax   = Number(v.tax) || 0
  const allIn = Number(v.allIn) || 0

  let finalFare: number, finalYq: number, finalTax: number, finalTotal: number
  let taxType: 'separate' | 'included' | 'pending'

  if (v.priceFormat === 'ALL_IN') {
    finalFare = 0; finalYq = 0; finalTax = 0; finalTotal = allIn; taxType = 'included'
  } else if (v.priceFormat === 'FARE_YQ') {
    finalFare = fare; finalYq = yqAmt; finalTax = 0; finalTotal = fare + yqAmt; taxType = 'separate'
  } else {
    finalFare = fare; finalYq = yqAmt; finalTax = tax; finalTotal = fare + yqAmt + tax; taxType = 'separate'
  }

  // Sector dates
  const sectorRows = buildSectorRows(flightSet.sectors as PnrModalSector[], v.travelStart)
  const travelEnd  = sectorRows[sectorRows.length - 1]?.arrDate || v.travelStart

  const sectorDates = sectorRows.map(r => ({ sectorType: r.sectorType, date: r.depDate }))

  const sectorSchedules = sectorRows.map((r, i) => ({
    flightSetSectorId:  r.sectorId,
    sequence:           i + 1,
    sectorType:         r.sectorType as 'Departure' | 'Transit' | 'Arrival',
    departureDate:      r.depDate,
    departureTime:      r.depTime,
    arrivalDate:        r.arrDate,
    arrivalTime:        r.arrTime,
    plusDay:            r.arrDayOffset,
    departureDayOffset: r.dayOffset,
    isDateOverride:     false,
    isTimeOverride:     false,
    sourceType:         'calculated' as const,
  }))

  // TTL
  let ttlDate: string | null = null
  let ttlTimeStr: string | null = null
  let ttlDateTime: string | null = null

  if (v.ttlType === 'FIXED_DATE' && v.ttlDate) {
    ttlDate = v.ttlDate; ttlTimeStr = v.ttlTime || null
    ttlDateTime = ttlTimeStr ? `${ttlDate}T${ttlTimeStr}:00` : `${ttlDate}T00:00:00`
  } else if (v.ttlType === 'DAYS_BEFORE' && v.ttlDaysBefore && v.travelStart) {
    const days = parseInt(v.ttlDaysBefore, 10)
    if (!isNaN(days) && days >= 0) {
      try {
        const d = addDays(parseISO(v.travelStart), -days)
        if (isValid(d)) {
          ttlDate = format(d, 'yyyy-MM-dd'); ttlTimeStr = v.ttlTime || null
          ttlDateTime = ttlTimeStr ? `${ttlDate}T${ttlTimeStr}:00` : `${ttlDate}T00:00:00`
        }
      } catch { /* ignore */ }
    }
  }

  const seatTotal   = Number(v.seatTotal) || 0
  const taxStatus: 'completed' | 'included' | 'pending' =
    taxType === 'included' ? 'included' : 'completed'

  return {
    pnrId:              existingPnr?.pnrId ?? newId('PNR'),
    pnrCode,
    dummyPnr,
    pnrType:            isReal ? 'real' : 'dummy',
    pnrDisplay,
    travelStart:        v.travelStart,
    travelEnd,
    flightSetId:        v.flightSetId || flightSet.flightSetId,
    scheduleId:         v.flightSetId || flightSet.flightSetId,
    sectorDates,
    sectorSchedules,
    seatTotal,
    seatUsed:           existingPnr?.seatUsed ?? 0,
    seatBalance:        seatTotal - (existingPnr?.seatUsed ?? 0),
    priceFormat:        v.priceFormat,
    fare:               finalFare,
    yq:                 finalYq,
    taxType,
    tax:                finalTax,
    fareIncludesTax:    taxType === 'included',
    taxStatus,
    total:              finalTotal,
    conditionCode:      v.conditionCode,
    ttlType:            v.ttlType === 'NONE' ? null : v.ttlType,
    ttlDaysBefore:      v.ttlType === 'DAYS_BEFORE' ? (parseInt(v.ttlDaysBefore, 10) || null) : null,
    ttlDate,
    ttlTime:            ttlTimeStr,
    ttlDateTime,
    status:             existingPnr?.status ?? 'Pending',
    pnrStatus:          existingPnr?.pnrStatus ?? 'PENDING',
    confirmationStatus: existingPnr?.confirmationStatus ?? 'PENDING_CONFIRMATION',
    activatedAt:        existingPnr?.activatedAt ?? null,
    activatedBy:        existingPnr?.activatedBy ?? null,
    closedAt:           existingPnr?.closedAt ?? null,
    closedBy:           existingPnr?.closedBy ?? null,
    cancelledAt:        existingPnr?.cancelledAt ?? null,
    cancelledBy:        existingPnr?.cancelledBy ?? null,
    cancellationReason: existingPnr?.cancellationReason ?? null,
    remark:             v.remark,
    initialSeatCount:   existingPnr?.initialSeatCount ?? seatTotal,
    stageSnapshots:     existingPnr?.stageSnapshots ?? {},
  }
}
