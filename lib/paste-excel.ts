import { normalizeTime } from './time-utils'

// ─── Column guides ─────────────────────────────────────────────────────────────
export const PASTE_COLUMN_GUIDE = [
  { no: 1,  name: 'PNR',             example: 'SD1SD2 หรือว่าง' },
  { no: 2,  name: 'Seat',            example: '36' },
  { no: 3,  name: 'วันไป',           example: '10/10/2026' },
  { no: 4,  name: 'เที่ยวบินไป',    example: 'TG640' },
  { no: 5,  name: 'จาก (ขาไป)',      example: 'BKK' },
  { no: 6,  name: 'ถึง (ขาไป)',       example: 'NRT' },
  { no: 7,  name: 'วันกลับ',         example: '14/10/2026' },
  { no: 8,  name: 'เที่ยวบินกลับ',  example: 'TG641' },
  { no: 9,  name: 'จาก (ขากลับ)',    example: 'NRT' },
  { no: 10, name: 'ถึง (ขากลับ)',     example: 'BKK' },
]

export const PASTE_MULTI_SECTOR_COLUMN_GUIDE = [
  { no: 1,  name: 'Import Group', example: 'G1',         note: 'ว่างได้ถ้ามี PNR' },
  { no: 2,  name: 'PNR',          example: 'SD1SD2',     note: 'ว่างได้ (Dummy PNR)' },
  { no: 3,  name: 'Seat',         example: '36',         note: '' },
  { no: 4,  name: 'Seq',          example: '1',          note: '' },
  { no: 5,  name: 'วันที่',       example: '10/10/2026', note: '' },
  { no: 6,  name: 'เที่ยวบิน',   example: 'TG701',      note: '' },
  { no: 7,  name: 'จาก',          example: 'BKK',        note: '' },
  { no: 8,  name: 'ถึง',           example: 'NRT',        note: '' },
  { no: 9,  name: 'เวลาออก',      example: '23:00',      note: '' },
  { no: 10, name: 'เวลาถึง',      example: '16:00',      note: '' },
  { no: 11, name: '+Day',         example: '1',          note: '' },
]

// ─── Master data defaults ─────────────────────────────────────────────────────
export const AIRLINE_CODES: readonly string[] = [
  'TG','FD','DD','PG','JL','NH','KE','OZ','CX','SQ','MH','EK','QR','BA','LH',
]

export const AIRPORT_CODES: readonly string[] = [
  'BKK','DMK','NRT','HND','KIX','CTS','FUK','OKA','ICN','GMP','HKG','SIN',
  'KUL','LHR','CDG','FRA','DXB','DOH','PEK','PVG','HAN','SGN','SYD','LAX',
  'TPE','MNL','CGK','BKI',
]

// ─── Sector template (mapped from FlightSectorFormData in Step 2) ─────────────
export interface SectorTemplate {
  seq: number
  sectorType: string      // 'Departure' | 'Transit' | 'Return' (accepts legacy 'Arrival' via normalizeSectorType at read sites)
  airlineCode: string
  flightNo: string
  depAirportCode: string
  arrAirportCode: string
  depTime: string
  arrTime: string
  plusDay: number         // arr_day_offset
  dayOffset: number       // Sector date = travel_start + dayOffset
}

// ─── Two-sector mode types ────────────────────────────────────────────────────
export type FieldKey =
  | 'pnrCode'
  | 'seatCount'
  | 'outboundDate'
  | 'outboundFlight'
  | 'outboundFrom'
  | 'outboundTo'
  | 'returnDate'
  | 'returnFlight'
  | 'returnFrom'
  | 'returnTo'

export interface PastedExcelRow {
  pnrCode: string
  isDummy: boolean        // true when pnrCode is empty — Dummy PNR, NOT an error
  seatCount: number
  outboundDate: string
  outboundFlight: string
  outboundFrom: string
  outboundTo: string
  returnDate: string
  returnFlight: string
  returnFrom: string
  returnTo: string
  outboundAirlineCode: string
  returnAirlineCode: string
}

export type PastedRowStatus = 'READY' | 'WARNING' | 'ERROR'

export interface RowIssue {
  col: string
  fields: FieldKey[]
  message: string
}

export interface ValidatedPastedRow {
  rowIndex: number
  data: PastedExcelRow
  status: PastedRowStatus
  errors: RowIssue[]
  warnings: RowIssue[]
  fieldErrors:   Partial<Record<FieldKey, string>>
  fieldWarnings: Partial<Record<FieldKey, string>>
}

// ─── Multi-sector mode types ──────────────────────────────────────────────────
export type MultiSectorFieldKey =
  | 'importGroup'
  | 'pnrCode'
  | 'seatCount'
  | 'seq'
  | 'travelDate'
  | 'flightNo'
  | 'depAirportCode'
  | 'arrAirportCode'
  | 'depTime'
  | 'arrTime'
  | 'plusDay'

export interface PastedMultiSectorRow {
  importGroup: string
  pnrCode: string
  seatCount: number
  seq: number
  travelDate: string
  flightNo: string
  depAirportCode: string
  arrAirportCode: string
  depTime: string
  arrTime: string
  plusDay: number
  airlineCode: string
}

export interface MultiRowIssue {
  col: string
  fields: MultiSectorFieldKey[]
  message: string
}

export interface ValidatedPNRGroup {
  groupKey: string
  pnrCode: string
  isDummy: boolean
  importGroup: string
  seatCount: number
  travelStart: string
  sectors: PastedMultiSectorRow[]
  status: PastedRowStatus
  errors:   MultiRowIssue[]
  warnings: MultiRowIssue[]
  sectorFieldErrors:   Array<Partial<Record<MultiSectorFieldKey, string>>>
  sectorFieldWarnings: Array<Partial<Record<MultiSectorFieldKey, string>>>
  rowIndex: number
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
const HEADER_KEYWORDS = [
  'pnr','seat','วัน','เที่ยว','flight','date','from','to','import','group','seq',
]

function buildFieldMap(issues: RowIssue[]): Partial<Record<FieldKey, string>> {
  const map: Partial<Record<FieldKey, string>> = {}
  for (const iss of issues) {
    for (const f of iss.fields) {
      if (!map[f]) map[f] = iss.message
    }
  }
  return map
}

function buildMultiFieldMap(issues: MultiRowIssue[]): Partial<Record<MultiSectorFieldKey, string>> {
  const map: Partial<Record<MultiSectorFieldKey, string>> = {}
  for (const iss of issues) {
    for (const f of iss.fields) {
      if (!map[f]) map[f] = iss.message
    }
  }
  return map
}

function addDaysToDateStr(dateStr: string, days: number): string {
  if (!dateStr || !days) return dateStr
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}


// ─── parsePastedExcel ─────────────────────────────────────────────────────────
export function parsePastedExcel(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map(line => line.split('\t').map(c => c.trim()))
    .filter(row => row.some(c => c !== ''))
}

// ─── isHeaderRow ─────────────────────────────────────────────────────────────
export function isHeaderRow(row: string[] | undefined): boolean {
  if (!row?.length) return false
  const first = row[0].toLowerCase()
  return HEADER_KEYWORDS.some(kw => first.includes(kw))
}

// ─── parseFlexDate ───────────────────────────────────────────────────────────
export function parseFlexDate(raw: string): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31)
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return null
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/').map(Number)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31)
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return null
  }

  return null
}

// ─── parseFlightNo ───────────────────────────────────────────────────────────
export function parseFlightNo(raw: string): { airlineCode: string; flightNo: string } | null {
  const m = (raw ?? '').trim().toUpperCase().match(/^([A-Z]{2,3})(\d{1,4}[A-Z]?)$/)
  if (!m) return null
  return { airlineCode: m[1], flightNo: m[2] }
}

// ─── normalizePastedRows ─────────────────────────────────────────────────────
export function normalizePastedRows(
  rawRows: string[][],
  hasHeader: boolean | null = null,
): PastedExcelRow[] {
  let rows = [...rawRows]
  const skip = hasHeader === null ? isHeaderRow(rows[0]) : hasHeader
  if (skip && rows.length > 0) rows = rows.slice(1)

  return rows.map(row => {
    const get = (i: number) => (row[i] ?? '').trim()

    const pnrCode           = get(0).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
    const outboundDate      = parseFlexDate(get(2)) ?? get(2)
    const outboundFlightRaw = get(3).toUpperCase()
    const returnDate        = parseFlexDate(get(6)) ?? get(6)
    const returnFlightRaw   = get(7).toUpperCase()
    const obFlight          = parseFlightNo(outboundFlightRaw)
    const retFlight         = parseFlightNo(returnFlightRaw)

    return {
      pnrCode,
      isDummy:             !pnrCode,   // empty PNR → Dummy (not an error)
      seatCount:           parseInt(get(1), 10) || 0,
      outboundDate,
      outboundFlight:      outboundFlightRaw,
      outboundFrom:        get(4).toUpperCase(),
      outboundTo:          get(5).toUpperCase(),
      returnDate,
      returnFlight:        returnFlightRaw,
      returnFrom:          get(8).toUpperCase(),
      returnTo:            get(9).toUpperCase(),
      outboundAirlineCode: obFlight?.airlineCode  ?? '',
      returnAirlineCode:   retFlight?.airlineCode ?? '',
    }
  })
}

// ─── validatePastedRows ──────────────────────────────────────────────────────
/**
 * Two-sector mode validation.
 * PNR empty → isDummy=true (WARNING, not ERROR).
 * Optional `templates` validates flight/airport/date against Step-2 sectors.
 */
export function validatePastedRows(
  rows: PastedExcelRow[],
  existingPnrCodes: string[],
  knownAirlineCodes: readonly string[] = AIRLINE_CODES,
  knownAirportCodes: readonly string[] = AIRPORT_CODES,
  templates?: SectorTemplate[],
): ValidatedPastedRow[] {
  const existingSet  = new Set(existingPnrCodes.map(c => c.toUpperCase()))
  const seenInPaste  = new Set<string>()

  return rows.map((row, i) => {
    const errors:   RowIssue[] = []
    const warnings: RowIssue[] = []

    // 1. PNR — empty = Dummy (isDummy flag), NOT an error
    if (!row.pnrCode) {
      // isDummy = true, no error pushed. UI shows yellow Dummy badge.
    } else if (seenInPaste.has(row.pnrCode)) {
      errors.push({ col: 'PNR', fields: ['pnrCode'],
        message: `PNR "${row.pnrCode}" ซ้ำในข้อมูลที่วาง` })
    } else {
      seenInPaste.add(row.pnrCode)
      if (existingSet.has(row.pnrCode))
        errors.push({ col: 'PNR', fields: ['pnrCode'],
          message: `PNR "${row.pnrCode}" มีอยู่ในระบบแล้ว` })
    }

    // 2. Seat
    if (!row.seatCount || row.seatCount <= 0 || !Number.isInteger(row.seatCount))
      errors.push({ col: 'Seat', fields: ['seatCount'],
        message: 'Seat ต้องเป็นจำนวนเต็มมากกว่า 0' })

    // 3. Outbound date
    const obDateOk = /^\d{4}-\d{2}-\d{2}$/.test(row.outboundDate)
    if (!obDateOk)
      errors.push({ col: 'วันไป', fields: ['outboundDate'],
        message: `รูปแบบวันที่ไม่ถูกต้อง: "${row.outboundDate}"` })

    // 4. Outbound flight
    const obFlight = parseFlightNo(row.outboundFlight)
    if (!obFlight) {
      errors.push({ col: 'เที่ยวบินไป', fields: ['outboundFlight'],
        message: `รหัสเที่ยวบินไม่ถูกต้อง: "${row.outboundFlight}"` })
    } else if (!knownAirlineCodes.includes(obFlight.airlineCode)) {
      warnings.push({ col: 'เที่ยวบินไป', fields: ['outboundFlight'],
        message: `Airline "${obFlight.airlineCode}" ไม่มีใน Master` })
    }

    // 5. Outbound airports
    if (!row.outboundFrom)
      errors.push({ col: 'จาก', fields: ['outboundFrom'], message: 'สนามบินต้นทางขาไปห้ามว่าง' })
    else if (!knownAirportCodes.includes(row.outboundFrom))
      warnings.push({ col: 'จาก', fields: ['outboundFrom'],
        message: `Airport "${row.outboundFrom}" ไม่มีใน Master` })
    if (!row.outboundTo)
      errors.push({ col: 'ถึง', fields: ['outboundTo'], message: 'สนามบินปลายทางขาไปห้ามว่าง' })
    else if (!knownAirportCodes.includes(row.outboundTo))
      warnings.push({ col: 'ถึง', fields: ['outboundTo'],
        message: `Airport "${row.outboundTo}" ไม่มีใน Master` })

    // 6. Return date
    const retDateOk = /^\d{4}-\d{2}-\d{2}$/.test(row.returnDate)
    if (!retDateOk)
      errors.push({ col: 'วันกลับ', fields: ['returnDate'],
        message: `รูปแบบวันที่ไม่ถูกต้อง: "${row.returnDate}"` })
    else if (obDateOk && row.returnDate < row.outboundDate)
      errors.push({ col: 'วันกลับ', fields: ['outboundDate', 'returnDate'],
        message: 'วันกลับต้องไม่ก่อนวันไป' })

    // 7. Return flight
    const retFlight = parseFlightNo(row.returnFlight)
    if (!retFlight)
      errors.push({ col: 'เที่ยวบินกลับ', fields: ['returnFlight'],
        message: `รหัสเที่ยวบินไม่ถูกต้อง: "${row.returnFlight}"` })
    else if (!knownAirlineCodes.includes(retFlight.airlineCode))
      warnings.push({ col: 'เที่ยวบินกลับ', fields: ['returnFlight'],
        message: `Airline "${retFlight.airlineCode}" ไม่มีใน Master` })

    // 8. Return airports
    if (!row.returnFrom)
      errors.push({ col: 'จาก (กลับ)', fields: ['returnFrom'], message: 'สนามบินต้นทางขากลับห้ามว่าง' })
    else if (!knownAirportCodes.includes(row.returnFrom))
      warnings.push({ col: 'จาก (กลับ)', fields: ['returnFrom'],
        message: `Airport "${row.returnFrom}" ไม่มีใน Master` })
    if (!row.returnTo)
      errors.push({ col: 'ถึง (กลับ)', fields: ['returnTo'], message: 'สนามบินปลายทางขากลับห้ามว่าง' })
    else if (!knownAirportCodes.includes(row.returnTo))
      warnings.push({ col: 'ถึง (กลับ)', fields: ['returnTo'],
        message: `Airport "${row.returnTo}" ไม่มีใน Master` })

    // 9. Sector template comparison (2-sector mode)
    if (templates && templates.length >= 1 && obDateOk) {
      const obTmpl  = templates[0]
      const retTmpl = templates.length > 1 ? templates[templates.length - 1] : null

      // Outbound vs template[0]
      if (obTmpl.flightNo && obFlight && obFlight.flightNo !== obTmpl.flightNo)
        errors.push({ col: 'เที่ยวบินไป', fields: ['outboundFlight'],
          message: `Flight No. ไม่ตรงกับ Step 2 (กำหนด: ${obTmpl.airlineCode}${obTmpl.flightNo}, วาง: ${row.outboundFlight})` })
      if (obTmpl.depAirportCode && row.outboundFrom && row.outboundFrom !== obTmpl.depAirportCode)
        errors.push({ col: 'จาก', fields: ['outboundFrom'],
          message: `From ไม่ตรงกับ Step 2 (กำหนด: ${obTmpl.depAirportCode}, วาง: ${row.outboundFrom})` })
      if (obTmpl.arrAirportCode && row.outboundTo && row.outboundTo !== obTmpl.arrAirportCode)
        errors.push({ col: 'ถึง', fields: ['outboundTo'],
          message: `To ไม่ตรงกับ Step 2 (กำหนด: ${obTmpl.arrAirportCode}, วาง: ${row.outboundTo})` })

      // Return vs last template
      if (retTmpl && retDateOk) {
        {
          const expectedDate = addDaysToDateStr(row.outboundDate, retTmpl.dayOffset - 1)
          if (expectedDate && row.returnDate !== expectedDate)
            errors.push({ col: 'วันกลับ', fields: ['returnDate'],
              message: `วันที่ Sector ${retTmpl.seq} ไม่ตรงกับ Travel Day (คาดหมาย: ${expectedDate}, วาง: ${row.returnDate})` })
        }
        if (retTmpl.flightNo && retFlight && retFlight.flightNo !== retTmpl.flightNo)
          errors.push({ col: 'เที่ยวบินกลับ', fields: ['returnFlight'],
            message: `Flight No. ไม่ตรงกับ Step 2 (กำหนด: ${retTmpl.airlineCode}${retTmpl.flightNo}, วาง: ${row.returnFlight})` })
        if (retTmpl.depAirportCode && row.returnFrom && row.returnFrom !== retTmpl.depAirportCode)
          errors.push({ col: 'จาก (กลับ)', fields: ['returnFrom'],
            message: `From ไม่ตรงกับ Step 2 (กำหนด: ${retTmpl.depAirportCode}, วาง: ${row.returnFrom})` })
        if (retTmpl.arrAirportCode && row.returnTo && row.returnTo !== retTmpl.arrAirportCode)
          errors.push({ col: 'ถึง (กลับ)', fields: ['returnTo'],
            message: `To ไม่ตรงกับ Step 2 (กำหนด: ${retTmpl.arrAirportCode}, วาง: ${row.returnTo})` })
      }
    }

    // Status: ERROR > WARNING (isDummy OR any warning) > READY
    const status: PastedRowStatus =
      errors.length > 0 ? 'ERROR'
      : (row.isDummy || warnings.length > 0) ? 'WARNING'
      : 'READY'

    return {
      rowIndex: i + 1, data: row, status, errors, warnings,
      fieldErrors:   buildFieldMap(errors),
      fieldWarnings: buildFieldMap(warnings),
    }
  })
}

// ─── parseMultiSectorPaste ───────────────────────────────────────────────────
export function parseMultiSectorPaste(
  rawRows: string[][],
  hasHeader: boolean | null = null,
): PastedMultiSectorRow[] {
  let rows = [...rawRows]
  const skip = hasHeader === null ? isHeaderRow(rows[0]) : hasHeader
  if (skip && rows.length > 0) rows = rows.slice(1)

  return rows.map(row => {
    const get = (i: number) => (row[i] ?? '').trim()
    const flightRaw   = get(5).toUpperCase()
    const parsedFl    = parseFlightNo(flightRaw)
    return {
      importGroup:    get(0),
      pnrCode:        get(1).toUpperCase(),
      seatCount:      parseInt(get(2), 10) || 0,
      seq:            parseInt(get(3), 10) || 0,
      travelDate:     parseFlexDate(get(4)) ?? get(4),
      flightNo:       flightRaw,
      depAirportCode: get(6).toUpperCase(),
      arrAirportCode: get(7).toUpperCase(),
      depTime:        normalizeTime(get(8)),
      arrTime:        normalizeTime(get(9)),
      plusDay:        parseInt(get(10), 10) || 0,
      airlineCode:    parsedFl?.airlineCode ?? '',
    }
  })
}

// ─── groupMultiSectorRows ────────────────────────────────────────────────────
interface RawPNRGroup {
  groupKey: string
  pnrCode: string
  isDummy: boolean
  importGroup: string
  sectors: PastedMultiSectorRow[]
}

export function groupMultiSectorRows(rows: PastedMultiSectorRow[]): RawPNRGroup[] {
  const ordered: string[] = []
  const groups  = new Map<string, RawPNRGroup>()
  let emptyIdx  = 0

  for (const row of rows) {
    const key = row.pnrCode || row.importGroup
    if (!key) {
      // Both empty → error placeholder, each row gets its own group
      const placeholder = `__empty_${emptyIdx++}`
      ordered.push(placeholder)
      groups.set(placeholder, {
        groupKey: placeholder, pnrCode: '', isDummy: true, importGroup: '', sectors: [row],
      })
      continue
    }
    if (!groups.has(key)) {
      ordered.push(key)
      groups.set(key, {
        groupKey: key, pnrCode: row.pnrCode, isDummy: !row.pnrCode,
        importGroup: row.importGroup, sectors: [],
      })
    }
    groups.get(key)!.sectors.push(row)
  }

  return ordered.map(k => groups.get(k)!)
}

// ─── validatePNRGroups ───────────────────────────────────────────────────────
export function validatePNRGroups(
  rawGroups: RawPNRGroup[],
  existingPnrCodes: string[],
  templates: SectorTemplate[],
  knownAirlineCodes: readonly string[] = AIRLINE_CODES,
  knownAirportCodes: readonly string[] = AIRPORT_CODES,
): ValidatedPNRGroup[] {
  const existingSet = new Set(existingPnrCodes.map(c => c.toUpperCase()))
  const seenPnrs    = new Set<string>()

  return rawGroups.map((group, gi) => {
    const groupLevelErrors:   MultiRowIssue[] = []
    const groupLevelWarnings: MultiRowIssue[] = []
    const sectorFieldErrors:   Array<Partial<Record<MultiSectorFieldKey, string>>> = []
    const sectorFieldWarnings: Array<Partial<Record<MultiSectorFieldKey, string>>> = []

    const isDummy = !group.pnrCode

    // ── Group-level: PNR / Import Group ──────────────────────────────────────
    if (isDummy && !group.importGroup) {
      groupLevelErrors.push({ col: 'Import Group', fields: ['importGroup', 'pnrCode'],
        message: 'กรุณาระบุ Import Group เพื่อรวม Sector ของ Dummy PNR' })
    } else if (!isDummy) {
      if (seenPnrs.has(group.pnrCode))
        groupLevelErrors.push({ col: 'PNR', fields: ['pnrCode'],
          message: `PNR "${group.pnrCode}" ซ้ำในข้อมูลที่วาง` })
      else {
        seenPnrs.add(group.pnrCode)
        if (existingSet.has(group.pnrCode))
          groupLevelErrors.push({ col: 'PNR', fields: ['pnrCode'],
            message: `PNR "${group.pnrCode}" มีอยู่ในระบบแล้ว` })
      }
    }

    // ── Group-level: Sector count vs template ─────────────────────────────────
    if (templates.length > 0 && group.sectors.length !== templates.length) {
      const missingSeqs = templates
        .filter(t => !group.sectors.some(s => s.seq === t.seq))
        .map(t => t.seq)
        .join(', ')
      groupLevelErrors.push({ col: 'จำนวน Sector', fields: ['seq'],
        message: `จำนวน Sector ไม่ตรง Step 2 กำหนด ${templates.length} แต่พบ ${group.sectors.length}` +
          (missingSeqs ? ` (ขาด Seq: ${missingSeqs})` : '') })
    }

    // Detect duplicate seqs within group
    const seqCount = new Map<number, number>()
    for (const s of group.sectors) seqCount.set(s.seq, (seqCount.get(s.seq) ?? 0) + 1)
    const dupSeqs = new Set([...seqCount.entries()].filter(([, c]) => c > 1).map(([k]) => k))

    // Seat consistency: all sectors in same group must have same seat count
    const canonSeat = group.sectors[0]?.seatCount ?? 0

    // Sort sectors by seq for travelStart and continuity check
    const sortedSectors = [...group.sectors].sort((a, b) => a.seq - b.seq)
    const travelStart   = sortedSectors[0]?.travelDate ?? ''

    // ── Per-sector validation ─────────────────────────────────────────────────
    for (const [si, sector] of group.sectors.entries()) {
      const sErrors:   MultiRowIssue[] = []
      const sWarnings: MultiRowIssue[] = []

      // Seat
      if (!sector.seatCount || sector.seatCount <= 0)
        sErrors.push({ col: 'Seat', fields: ['seatCount'], message: 'Seat ต้องมากกว่า 0' })
      else if (sector.seatCount !== canonSeat)
        sErrors.push({ col: 'Seat', fields: ['seatCount'],
          message: `Seat ใน PNR เดียวกันต้องเท่ากัน (คาดหมาย: ${canonSeat}, วาง: ${sector.seatCount})` })

      // Seq
      if (!sector.seq || sector.seq <= 0)
        sErrors.push({ col: 'Seq', fields: ['seq'], message: 'Seq ต้องเป็นจำนวนเต็มมากกว่า 0' })
      else if (dupSeqs.has(sector.seq))
        sErrors.push({ col: 'Seq', fields: ['seq'], message: `Seq ${sector.seq} ซ้ำกันใน PNR เดียวกัน` })

      // Travel date
      const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(sector.travelDate)
      if (!dateOk)
        sErrors.push({ col: 'วันที่', fields: ['travelDate'],
          message: `รูปแบบวันที่ไม่ถูกต้อง: "${sector.travelDate}"` })

      // Flight
      const parsedFl = parseFlightNo(sector.flightNo)
      if (!parsedFl)
        sErrors.push({ col: 'เที่ยวบิน', fields: ['flightNo'],
          message: `รหัสเที่ยวบินไม่ถูกต้อง: "${sector.flightNo}"` })
      else if (!knownAirlineCodes.includes(parsedFl.airlineCode))
        sWarnings.push({ col: 'เที่ยวบิน', fields: ['flightNo'],
          message: `Airline "${parsedFl.airlineCode}" ไม่มีใน Master` })

      // Airports
      if (!sector.depAirportCode)
        sErrors.push({ col: 'จาก', fields: ['depAirportCode'], message: 'สนามบินต้นทางห้ามว่าง' })
      else if (!knownAirportCodes.includes(sector.depAirportCode))
        sWarnings.push({ col: 'จาก', fields: ['depAirportCode'],
          message: `Airport "${sector.depAirportCode}" ไม่มีใน Master` })
      if (!sector.arrAirportCode)
        sErrors.push({ col: 'ถึง', fields: ['arrAirportCode'], message: 'สนามบินปลายทางห้ามว่าง' })
      else if (!knownAirportCodes.includes(sector.arrAirportCode))
        sWarnings.push({ col: 'ถึง', fields: ['arrAirportCode'],
          message: `Airport "${sector.arrAirportCode}" ไม่มีใน Master` })

      // Template comparison
      const tmpl = templates.find(t => t.seq === sector.seq)
      if (sector.seq > 0 && templates.length > 0 && !tmpl) {
        sErrors.push({ col: 'Seq', fields: ['seq'],
          message: `ไม่พบ Sector ลำดับที่ ${sector.seq} ในโครงสร้าง Step 2` })
      } else if (tmpl && sector.seq > 0) {
        if (tmpl.flightNo && parsedFl && parsedFl.flightNo !== tmpl.flightNo)
          sErrors.push({ col: 'เที่ยวบิน', fields: ['flightNo'],
            message: `Flight No. ไม่ตรงกับ Step 2 (กำหนด: ${tmpl.airlineCode}${tmpl.flightNo}, วาง: ${sector.flightNo})` })
        if (tmpl.airlineCode && parsedFl && parsedFl.airlineCode !== tmpl.airlineCode)
          sErrors.push({ col: 'เที่ยวบิน', fields: ['flightNo'],
            message: `Airline ไม่ตรงกับ Step 2 (กำหนด: ${tmpl.airlineCode}, วาง: ${parsedFl.airlineCode})` })
        if (tmpl.depAirportCode && sector.depAirportCode && sector.depAirportCode !== tmpl.depAirportCode)
          sErrors.push({ col: 'จาก', fields: ['depAirportCode'],
            message: `From ไม่ตรงกับ Step 2 (กำหนด: ${tmpl.depAirportCode}, วาง: ${sector.depAirportCode})` })
        if (tmpl.arrAirportCode && sector.arrAirportCode && sector.arrAirportCode !== tmpl.arrAirportCode)
          sErrors.push({ col: 'ถึง', fields: ['arrAirportCode'],
            message: `To ไม่ตรงกับ Step 2 (กำหนด: ${tmpl.arrAirportCode}, วาง: ${sector.arrAirportCode})` })
        if (tmpl.depTime && sector.depTime && sector.depTime !== tmpl.depTime)
          sErrors.push({ col: 'เวลาออก', fields: ['depTime'],
            message: `เวลาออกไม่ตรงกับ Step 2 (กำหนด: ${tmpl.depTime}, วาง: ${sector.depTime})` })
        if (tmpl.arrTime && sector.arrTime && sector.arrTime !== tmpl.arrTime)
          sErrors.push({ col: 'เวลาถึง', fields: ['arrTime'],
            message: `เวลาถึงไม่ตรงกับ Step 2 (กำหนด: ${tmpl.arrTime}, วาง: ${sector.arrTime})` })
        if (sector.depTime && sector.arrTime && sector.plusDay !== tmpl.plusDay)
          sErrors.push({ col: '+Day', fields: ['plusDay'],
            message: `+Day ไม่ตรงกับ Step 2 (กำหนด: ${tmpl.plusDay}, วาง: ${sector.plusDay})` })
        // Travel Day check
        if (dateOk && travelStart) {
          const expectedDate = addDaysToDateStr(travelStart, tmpl.dayOffset - 1)
          if (expectedDate && sector.travelDate !== expectedDate)
            sErrors.push({ col: 'วันที่', fields: ['travelDate'],
              message: `วันที่ Sector ${sector.seq} ไม่ตรงกับ Travel Day (คาดหมาย: ${expectedDate}, วาง: ${sector.travelDate})` })
        }
      }

      sectorFieldErrors.push(buildMultiFieldMap(sErrors))
      sectorFieldWarnings.push(buildMultiFieldMap(sWarnings))
      groupLevelErrors.push(...sErrors)
      groupLevelWarnings.push(...sWarnings)
    }

    // Airport continuity between consecutive sorted sectors
    for (let ci = 0; ci < sortedSectors.length - 1; ci++) {
      const cur  = sortedSectors[ci]
      const nxt  = sortedSectors[ci + 1]
      if (cur.arrAirportCode && nxt.depAirportCode && cur.arrAirportCode !== nxt.depAirportCode) {
        const msg = `Airport ไม่ต่อเนื่อง: Sector ${cur.seq} ถึง "${cur.arrAirportCode}" ≠ Sector ${nxt.seq} จาก "${nxt.depAirportCode}"`
        const curOrigIdx = group.sectors.indexOf(cur)
        const nxtOrigIdx = group.sectors.indexOf(nxt)
        if (curOrigIdx >= 0) sectorFieldErrors[curOrigIdx].arrAirportCode = msg
        if (nxtOrigIdx >= 0) sectorFieldErrors[nxtOrigIdx].depAirportCode = msg
        groupLevelErrors.push({ col: 'Airport', fields: ['arrAirportCode', 'depAirportCode'], message: msg })
      }
    }

    const status: PastedRowStatus =
      groupLevelErrors.length > 0 ? 'ERROR'
      : (isDummy || groupLevelWarnings.length > 0) ? 'WARNING'
      : 'READY'

    return {
      groupKey:    group.groupKey,
      pnrCode:     group.pnrCode,
      isDummy,
      importGroup: group.importGroup,
      seatCount:   canonSeat,
      travelStart,
      sectors:     group.sectors,
      status,
      errors:      groupLevelErrors,
      warnings:    groupLevelWarnings,
      sectorFieldErrors,
      sectorFieldWarnings,
      rowIndex:    gi + 1,
    }
  })
}

// ─── Utility: convert ValidatedPNRGroup[] → PastedExcelRow[] ─────────────────
/**
 * Used by PasteExcelModal to convert multi-sector groups to the same
 * PastedExcelRow[] format that Step4PNR.addPastedPNRs expects.
 * The only fields that matter for Step4 are: pnrCode, isDummy, seatCount, outboundDate.
 * Step4 recomputes all other dates from the global sector template.
 */
export function groupsToPastedRows(groups: ValidatedPNRGroup[]): PastedExcelRow[] {
  return groups.map(g => ({
    pnrCode:             g.pnrCode,
    isDummy:             g.isDummy,
    seatCount:           g.seatCount,
    outboundDate:        g.travelStart,
    outboundFlight:      g.sectors.find(s => s.seq === 1)?.flightNo ?? '',
    outboundFrom:        g.sectors.find(s => s.seq === 1)?.depAirportCode ?? '',
    outboundTo:          g.sectors.find(s => s.seq === 1)?.arrAirportCode ?? '',
    returnDate:          '',  // Step4 recomputes from sectors template
    returnFlight:        '',
    returnFrom:          '',
    returnTo:            '',
    outboundAirlineCode: g.sectors.find(s => s.seq === 1)?.airlineCode ?? '',
    returnAirlineCode:   '',
  }))
}
