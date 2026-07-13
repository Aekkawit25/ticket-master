import * as XLSX from 'xlsx'
import { format, parse, isValid } from 'date-fns'
import { normalizeTime, isValidHHmm } from './time-utils'
import { getActiveCurrencies } from './currency-storage'

// ============================================================
// Types
// ============================================================

export type ImportIssueLevel = 'error' | 'warning'

export interface ImportIssue {
  level: ImportIssueLevel
  sheet: string
  field: string
  row?: number
  message: string
}

export interface ImportStockInfo {
  stockCode: string
  ticketType: string
  groupType?: string
  groupName: string
  airlineCode: string
  countryId: string
  destination: string
  currency: string
  status: string
  tripType: string
  remark: string
}

export interface ImportSector {
  seq: number
  sectorType: string
  airlineCode: string
  flightNo: string
  depAirportCode: string
  arrAirportCode: string
  depTime: string
  arrTime: string
  arrDayOffset: number
  dayOffset: number
  remark: string
}

export interface ImportConditionStage {
  stageSeq: number
  stageName: string
  paymentType: string
  amountType: string
  amount: number
  percent: number
  paymentBaseDate: string
  paymentDueDaysBefore: number
  paymentDueTime: string
  remark: string
  // legacy field names (backwards compat for old Excel imports)
  baseDate?: string
  dueDaysBefore?: number
  ttlTime?: string
}

export interface ImportCondition {
  conditionCode: string
  conditionName: string
  description: string
  status: string
  stages: ImportConditionStage[]
  ttlRule?: {
    ttlCalcType: 'from_travel_date' | 'manual' | 'not_set'
    ttlBaseDate: string
    ttlDaysBefore: number
    ttlDate: string
    ttlTime: string
  }
}

export interface ImportPNR {
  pnrCode: string
  travelStart: string
  seatTotal: number
  fare: number
  taxType: string
  tax: number
  conditionCode: string
  status: string
  remark: string
}

export interface ImportReviewData {
  ticketType: string
  stockInfo: ImportStockInfo
  sectors: ImportSector[]
  conditions: ImportCondition[]
  pnrs: ImportPNR[]
  issues: ImportIssue[]
}

// ============================================================
// Helpers
// ============================================================

function parseDateStr(val: unknown): string {
  if (!val) return ''
  // xlsx with cellDates: true returns Date objects
  if (val instanceof Date) {
    if (!isValid(val)) return ''
    return format(val, 'yyyy-MM-dd')
  }
  const str = String(val).trim()
  if (!str) return ''
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = parse(str, 'yyyy-MM-dd', new Date())
    return isValid(d) ? format(d, 'yyyy-MM-dd') : ''
  }
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const d = parse(str, 'dd/MM/yyyy', new Date())
    return isValid(d) ? format(d, 'yyyy-MM-dd') : ''
  }
  // Try numeric serial (xlsx date serial)
  const num = Number(str)
  if (!isNaN(num) && num > 1000) {
    try {
      const d = XLSX.SSF.parse_date_code(num)
      if (d) {
        const js = new Date(d.y, d.m - 1, d.d)
        if (isValid(js)) return format(js, 'yyyy-MM-dd')
      }
    } catch {
      // ignore
    }
  }
  return ''
}

function parseNum(val: unknown): number {
  if (!val && val !== 0) return 0
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

function str(val: unknown): string {
  if (val == null) return ''
  return String(val).trim()
}

function mapPnrStatus(val: string): 'Pending' | 'Confirmed' {
  const v = val.trim()
  if (v === 'Confirmed' || v === 'ยืนยันแล้ว') return 'Confirmed'
  return 'Pending'
}

/**
 * Convert a sheet to an array of objects using the first row as headers.
 */
function sheetToObjects(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  if (rows.length < 2) return []
  const headers = (rows[0] as unknown[]).map(h => str(h))
  return rows.slice(1).map(row => {
    const obj: Record<string, unknown> = {}
    headers.forEach((h, i) => {
      obj[h] = (row as unknown[])[i] ?? ''
    })
    return obj
  })
}

function parseTimeStr(val: unknown): { value: string; wasReset: boolean; raw: string } {
  const raw = str(val)
  if (!raw) return { value: '', wasReset: false, raw: '' }
  const normalized = normalizeTime(raw)
  if (normalized) return { value: normalized, wasReset: false, raw }
  // Invalid → reset to 00:00
  return { value: '00:00', wasReset: true, raw }
}

// ============================================================
// Main parser
// ============================================================

export async function parseExcelImport(file: File): Promise<ImportReviewData> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })

  const issues: ImportIssue[] = []

  // ── STOCK_INFO ──────────────────────────────────────────────
  const wsStockInfo = wb.Sheets['STOCK_INFO']
  let stockInfo: ImportStockInfo = {
    stockCode: '',
    ticketType: '',
    groupName: '',
    airlineCode: '',
    countryId: '',
    destination: '',
    currency: '',
    status: 'Draft',
    tripType: '',
    remark: '',
  }

  if (wsStockInfo) {
    const rows = sheetToObjects(wsStockInfo)
    if (rows.length > 0) {
      const r = rows[0]
      stockInfo = {
        stockCode:   str(r['stockCode']),
        ticketType:  str(r['ticketType']),
        groupName:   str(r['groupName']),
        airlineCode: str(r['airlineCode']),
        countryId:   str(r['country']),
        destination: str(r['destination']),
        currency:    str(r['currency']).toUpperCase() || 'THB',
        status:      str(r['status']) || 'Draft',
        tripType:    str(r['tripType']),
        remark:      str(r['remark']),
      }
    }
  }

  // ── FLIGHT_SECTORS ──────────────────────────────────────────
  const wsSectors = wb.Sheets['FLIGHT_SECTORS']
  const sectors: ImportSector[] = []

  if (wsSectors) {
    const rows = sheetToObjects(wsSectors)
    rows.forEach((r, idx) => {
      const rowNum = idx + 2
      const sectorType = str(r['sectorType'])
      const flightNo = str(r['flightNo'])
      const from = str(r['from'])
      const to = str(r['to'])

      if (!sectorType && !from && !to) return // skip empty rows

      if (!flightNo) {
        issues.push({ level: 'warning', sheet: 'FLIGHT_SECTORS', field: 'flightNo', row: rowNum, message: `Row ${rowNum}: flightNo ว่าง` })
      }

      const depTimeResult = parseTimeStr(r['depTime'])
      const arrTimeResult = parseTimeStr(r['arrTime'])
      if (depTimeResult.wasReset) {
        issues.push({ level: 'warning', sheet: 'FLIGHT_SECTORS', field: 'depTime', row: rowNum, message: `Row ${rowNum}: depTime "${depTimeResult.raw}" ไม่ถูกต้อง ระบบปรับเป็น 00:00` })
      }
      if (arrTimeResult.wasReset) {
        issues.push({ level: 'warning', sheet: 'FLIGHT_SECTORS', field: 'arrTime', row: rowNum, message: `Row ${rowNum}: arrTime "${arrTimeResult.raw}" ไม่ถูกต้อง ระบบปรับเป็น 00:00` })
      }

      sectors.push({
        seq:            parseNum(r['seq']) || idx + 1,
        sectorType:     sectorType,
        airlineCode:    str(r['airlineCode']),
        flightNo:       flightNo,
        depAirportCode: from,
        arrAirportCode: to,
        depTime:        depTimeResult.value,
        arrTime:        arrTimeResult.value,
        arrDayOffset:   parseNum(r['arrDayOffset']),
        dayOffset:      parseNum(r['dayOffset']),
        remark:         str(r['remark']),
      })
    })
  }

  // ── CONDITIONS ──────────────────────────────────────────────
  const wsConditions = wb.Sheets['CONDITIONS']
  const conditionsMap: Map<string, ImportCondition> = new Map()

  if (wsConditions) {
    const rows = sheetToObjects(wsConditions)
    rows.forEach((r) => {
      const code = str(r['conditionCode'])
      if (!code) return
      if (!conditionsMap.has(code)) {
        conditionsMap.set(code, {
          conditionCode: code,
          conditionName: str(r['conditionName']),
          description:   str(r['description']),
          status:        str(r['conditionStatus']) || 'Active',
          stages:        [],
        })
      }
      const cond = conditionsMap.get(code)!
      const stageSeq = parseNum(r['stageSeq'])
      if (stageSeq > 0) {
        cond.stages.push({
          stageSeq:      stageSeq,
          stageName:     str(r['stageName']),
          paymentType:   str(r['paymentType']),
          amountType:    str(r['amountType']),
          amount:        parseNum(r['amount']),
          percent:       parseNum(r['percent']),
          paymentBaseDate:     str(r['paymentBaseDate']) || str(r['baseDate']) || 'Travel Start',
          paymentDueDaysBefore: parseNum(r['paymentDueDaysBefore'] ?? r['dueDaysBefore']),
          paymentDueTime:      str(r['paymentDueTime']) || str(r['ttlTime']) || '18:00',
          baseDate:      str(r['baseDate']),
          dueDaysBefore: parseNum(r['dueDaysBefore']),
          ttlTime:       str(r['ttlTime']) || '18:00',
          remark:        str(r['remark']),
        })
      }
    })
  }

  const conditions = Array.from(conditionsMap.values())

  // ── PNR_LIST ────────────────────────────────────────────────
  const wsPNR = wb.Sheets['PNR_LIST']
  const pnrs: ImportPNR[] = []

  if (wsPNR) {
    const rows = sheetToObjects(wsPNR)
    rows.forEach((r, idx) => {
      const rowNum = idx + 2
      const travelStart = parseDateStr(r['travelStart'])
      const seatTotal = parseNum(r['seatTotal'])
      const taxType = str(r['taxType'])
      const conditionCode = str(r['conditionCode'])
      const pnrCode = str(r['pnrCode'])

      // skip fully empty rows
      if (!travelStart && !seatTotal && !conditionCode && !pnrCode) return

      if (!travelStart) {
        issues.push({ level: 'error', sheet: 'PNR_LIST', field: 'travelStart', row: rowNum, message: `Row ${rowNum}: travelStart ว่างหรือรูปแบบไม่ถูกต้อง` })
      }
      if (seatTotal <= 0) {
        issues.push({ level: 'error', sheet: 'PNR_LIST', field: 'seatTotal', row: rowNum, message: `Row ${rowNum}: seatTotal ต้องมากกว่า 0` })
      }
      if (!taxType) {
        issues.push({ level: 'error', sheet: 'PNR_LIST', field: 'taxType', row: rowNum, message: `Row ${rowNum}: taxType ว่าง` })
      }
      if (!pnrCode) {
        issues.push({ level: 'warning', sheet: 'PNR_LIST', field: 'pnrCode', row: rowNum, message: `Row ${rowNum}: pnrCode ว่าง — ระบบจะสร้าง Dummy PNR` })
      }
      if (taxType === 'pending') {
        issues.push({ level: 'warning', sheet: 'PNR_LIST', field: 'taxType', row: rowNum, message: `Row ${rowNum}: taxType = pending — ยังไม่ระบุ Tax` })
      }
      if (taxType === 'separate' && parseNum(r['tax']) === 0) {
        issues.push({ level: 'warning', sheet: 'PNR_LIST', field: 'tax', row: rowNum, message: `Row ${rowNum}: taxType = separate แต่ tax = 0` })
      }

      pnrs.push({
        pnrCode:       pnrCode,
        travelStart:   travelStart,
        seatTotal:     seatTotal,
        fare:          parseNum(r['fare']),
        taxType:       taxType,
        tax:           parseNum(r['tax']),
        conditionCode: conditionCode,
        status:        mapPnrStatus(str(r['status'])),
        remark:        str(r['remark']),
      })
    })
  }

  // ── Stock-level validations ──────────────────────────────────
  if (!stockInfo.stockCode) {
    issues.push({ level: 'error', sheet: 'STOCK_INFO', field: 'stockCode', message: 'stockCode ว่าง' })
  }
  if (!stockInfo.ticketType) {
    issues.push({ level: 'error', sheet: 'STOCK_INFO', field: 'ticketType', message: 'ticketType ว่าง' })
  }
  if (!stockInfo.groupName) {
    issues.push({ level: 'error', sheet: 'STOCK_INFO', field: 'groupName', message: 'groupName ว่าง' })
  }
  if (!stockInfo.airlineCode) {
    issues.push({ level: 'error', sheet: 'STOCK_INFO', field: 'airlineCode', message: 'airlineCode ว่าง' })
  }
  // Validate currency against Currency Master (fallback THB is always valid)
  {
    const validCodes = new Set(getActiveCurrencies().map(c => c.currencyCode))
    if (!validCodes.has(stockInfo.currency)) {
      issues.push({
        level: 'error',
        sheet: 'STOCK_INFO',
        field: 'currency',
        message: `currency "${stockInfo.currency}" ไม่พบใน Currency Master (ตัวอย่าง: THB, USD, JPY)`,
      })
    }
  }
  if (!stockInfo.tripType) {
    issues.push({ level: 'error', sheet: 'STOCK_INFO', field: 'tripType', message: 'tripType ว่าง' })
  }
  if (sectors.length === 0) {
    issues.push({ level: 'error', sheet: 'FLIGHT_SECTORS', field: 'sectors', message: 'ไม่พบข้อมูล Sector' })
  }
  if (stockInfo.ticketType === 'Group' && sectors.length < 2) {
    issues.push({ level: 'error', sheet: 'FLIGHT_SECTORS', field: 'sectors', message: 'ticketType = Group ต้องมีอย่างน้อย 2 Sector' })
  }
  if (stockInfo.tripType === 'Round-trip' && !sectors.some(s => s.sectorType === 'Return')) {
    issues.push({ level: 'error', sheet: 'FLIGHT_SECTORS', field: 'sectors', message: 'tripType = Round-trip ต้องมี Return Sector' })
  }
  if (pnrs.length === 0) {
    issues.push({ level: 'error', sheet: 'PNR_LIST', field: 'pnrs', message: 'ไม่พบข้อมูล PNR' })
  }
  // PNR conditionCode validation
  pnrs.forEach((p, idx) => {
    if (p.conditionCode && !conditionsMap.has(p.conditionCode)) {
      issues.push({
        level: 'error',
        sheet: 'PNR_LIST',
        field: 'conditionCode',
        row: idx + 2,
        message: `Row ${idx + 2}: conditionCode "${p.conditionCode}" ไม่พบใน CONDITIONS sheet`,
      })
    }
  })
  if (conditions.length === 0) {
    issues.push({ level: 'warning', sheet: 'CONDITIONS', field: 'conditions', message: 'ไม่พบ Condition — PNR จะไม่มี Payment Schedule' })
  }

  return {
    ticketType: stockInfo.ticketType,
    stockInfo,
    sectors,
    conditions,
    pnrs,
    issues,
  }
}

// ============================================================
// PNR-only Excel helpers (Step 4 Import Excel feature)
// ============================================================

/**
 * Parse an ArrayBuffer of a PNR-only .xlsx file into raw string rows.
 * Looks for a sheet named "PNR" (case-insensitive) or falls back to the first sheet.
 * Returns string[][] — same format as parsePastedExcel() — so that the existing
 * normalizePastedRows / parseMultiSectorPaste validators work unchanged.
 */
export function parsePnrExcelBuffer(buffer: ArrayBuffer): string[][] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false, raw: false })
  const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'pnr') ?? wb.SheetNames[0]
  if (!sheetName) return []
  const ws = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][]
  return raw
    .map(row => row.map(cell => String(cell ?? '').trim()))
    .filter(row => row.some(c => c !== ''))
}

/**
 * Parse a File object (.xlsx only) into raw string rows for the PNR-import flow.
 * Returns { rows, error } — error is null on success.
 */
export async function parsePnrExcelFile(file: File): Promise<{ rows: string[][]; error: string | null }> {
  if (!file.name.match(/\.xlsx$/i)) {
    return { rows: [], error: 'รองรับเฉพาะไฟล์ .xlsx เท่านั้น' }
  }
  try {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false, raw: false })
    const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'pnr') ?? wb.SheetNames[0]
    if (!sheetName) return { rows: [], error: 'ไม่พบ Sheet ในไฟล์ Excel' }
    const ws = wb.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][]
    const rows = raw
      .map(row => row.map(cell => String(cell ?? '').trim()))
      .filter(row => row.some(c => c !== ''))
    if (rows.length === 0) return { rows: [], error: `Sheet "${sheetName}" ไม่มีข้อมูล` }
    return { rows, error: null }
  } catch (e) {
    return { rows: [], error: `อ่านไฟล์ไม่ได้: ${e instanceof Error ? e.message : String(e)}` }
  }
}
