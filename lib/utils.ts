import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, addDays, differenceInDays, isValid } from 'date-fns'
import type { FlightSector, FlightPNR, FlightCondition, FlightConditionStage, PaymentSchedule, AmountType } from '@/types'

// ============================================================
// Dummy PNR Generation  (สร้างเฉพาะตอนเข้า Step 5)
// ============================================================

function getTicketTypeCode(ticketType: string): string {
  if (ticketType === 'Group') return 'GRP'
  if (ticketType === 'FIT') return 'FIT'
  if (ticketType === 'Ticket + Land') return 'TNL'
  return 'UNK'
}

function getYYMM(travelStart: string | null | undefined): string {
  if (!travelStart) return '0000'
  try {
    const d = parseISO(travelStart)
    if (!isValid(d)) return '0000'
    return format(d, 'yyMM')  // e.g. 2026-06-13 → "2606"
  } catch {
    return '0000'
  }
}

type PNRDummyInput = { pnr_code: string; dummy_pnr: string; travel_start: string }

/**
 * Generates Dummy PNR codes (DMY-{TYPE}{AIRLINE}{YYMM}-{NNNN}) for every PNR
 * that has no real pnr_code and no existing dummy_pnr.
 * Idempotent: already-assigned dummies are preserved; real PNR codes clear the dummy slot.
 * Running numbers are scoped per (TYPE+AIRLINE+YYMM) group key and never repeat within a call.
 *
 * @param systemDummies - All dummy codes already in use across the entire system (other stocks).
 *   Pass this to guarantee global uniqueness. Built by the caller from getDemoStocks().
 */
export function generateDummyPnrs<T extends PNRDummyInput>(
  pnrs: T[],
  stockInfo: { ticket_type: string; airline_code: string },
  systemDummies?: Set<string>,
): T[] {
  const runningMap: Record<string, number> = {}
  const typeCode = getTicketTypeCode(stockInfo.ticket_type)
  const stockAirline = (stockInfo.airline_code || 'XX').toUpperCase()

  // Pass 1a: register max running numbers from dummies already on THIS stock's PNRs
  for (const pnr of pnrs) {
    if (!pnr.pnr_code.trim() && pnr.dummy_pnr.trim()) {
      const match = pnr.dummy_pnr.match(/^DMY-([A-Z0-9]+)-(\d{4})$/)
      if (match) {
        const key = match[1]
        const run = parseInt(match[2], 10)
        runningMap[key] = Math.max(runningMap[key] || 0, run)
      }
    }
  }

  // Pass 1b: register max running numbers from OTHER stocks so generated codes never clash
  if (systemDummies) {
    for (const code of systemDummies) {
      const match = code.match(/^DMY-([A-Z0-9]+)-(\d{4})$/i)
      if (match) {
        const key = match[1].toUpperCase()
        const run = parseInt(match[2], 10)
        runningMap[key] = Math.max(runningMap[key] || 0, run)
      }
    }
  }

  // Pass 2: fill missing dummies
  return pnrs.map(pnr => {
    if (pnr.pnr_code.trim()) {
      // Real PNR set → clear any leftover dummy
      return { ...pnr, dummy_pnr: '' }
    }
    if (pnr.dummy_pnr.trim()) {
      // Already has a dummy (from a previous Step-5 visit) → keep it
      return { ...pnr }
    }
    const yymm = getYYMM(pnr.travel_start)
    const groupKey = `${typeCode}${stockAirline}${yymm}`
    runningMap[groupKey] = (runningMap[groupKey] || 0) + 1
    const running = String(runningMap[groupKey]).padStart(4, '0')
    return { ...pnr, dummy_pnr: `DMY-${groupKey}-${running}` }
  })
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ============================================================
// Date Formatting
// ============================================================

/**
 * Safe parser for both date-only and datetime strings.
 *
 * date-only  "2026-07-17"        → new Date(2026, 6, 17)   local midnight — no UTC shift
 * datetime   "2026-07-17T14:30Z" → parseISO (standard)     converts to local time correctly
 *
 * Using `new Date('yyyy-MM-dd')` or the browser `Date` constructor on a
 * date-only string treats it as UTC midnight, which shifts to the previous
 * calendar day in timezones behind UTC.  This helper avoids that trap.
 */
function parseDateSafe(date: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d)   // local midnight, no UTC
  }
  return parseISO(date)
}

/** DD MMM YY  e.g. 17 Jul 26.  Safe for date-only ISO strings. */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '-'
  try {
    const d = parseDateSafe(date)
    if (!isValid(d)) return '-'
    return format(d, 'dd MMM yy')
  } catch {
    return '-'
  }
}

/** Canonical UI date format for travel dates — always DD MMM YY (e.g., 17 Jun 26) */
export const formatTravelDate = formatDate

/**
 * Formats a stock period for display using Dep Date range only.
 * - Single date (start === end or no end): "17 Jun 26"
 * - Date range: "10 Mar 26 – 14 Mar 26"
 * - No data: "-"
 */
export function formatStockPeriod(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined
): string {
  if (!periodStart) return '-'
  const s = formatDate(periodStart)
  if (!periodEnd || periodStart === periodEnd) return s
  return `${s} – ${formatDate(periodEnd)}`
}

/** DD MMM YY HH:mm  e.g. 25 Feb 26 18:00.  Always interprets datetime strings in local time. */
export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '-'
  try {
    const d = parseDateSafe(date)
    if (!isValid(d)) return '-'
    return format(d, 'dd MMM yy HH:mm')
  } catch {
    return '-'
  }
}

export function formatDateISO(date: string | null | undefined): string {
  if (!date) return ''
  try {
    const d = parseISO(date)
    if (!isValid(d)) return ''
    return format(d, 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

export function parseDisplayDate(dateStr: string): string {
  // Parse "25 Feb 26" to "2026-02-25"
  if (!dateStr) return ''
  try {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    }
    const parts = dateStr.trim().split(' ')
    if (parts.length !== 3) return dateStr
    const day = parts[0].padStart(2, '0')
    const month = months[parts[1].toLowerCase()] || '01'
    const year = `20${parts[2]}`
    return `${year}-${month}-${day}`
  } catch {
    return dateStr
  }
}

// ============================================================
// Business Logic Calculations
// ============================================================

export function calcTravelEnd(travelStart: string | null, durationDays: number | null): string | null {
  if (!travelStart || !durationDays) return null
  try {
    const start = parseISO(travelStart)
    if (!isValid(start)) return null
    const end = addDays(start, durationDays - 1)
    return format(end, 'yyyy-MM-dd')
  } catch {
    return null
  }
}

// ── Sector date model ──────────────────────────────────────────
// Sector Travel Date = PNR Travel Start + (Travel Day - 1)
// Travel Day 1 = Travel Start, Travel Day 2 = Travel Start + 1 day, etc.
export function calcSectorDate(travelStart: string | null, dayOffset: number | null | undefined): string | null {
  if (!travelStart) return null
  try {
    const start = parseISO(travelStart)
    if (!isValid(start)) return null
    return format(addDays(start, Math.max(0, (dayOffset ?? 1) - 1)), 'yyyy-MM-dd')
  } catch {
    return null
  }
}

type SectorDateInput = { sector_type: string; day_offset: number }

// Travel End = วันที่ของ Sector Type = Arrival ตัวสุดท้าย, ถ้าไม่มี Arrival ใช้ Sector สุดท้าย
export function calcTravelEndFromSectors(
  travelStart: string | null,
  sectors: SectorDateInput[]
): string | null {
  if (!travelStart || !sectors?.length) return null
  const returns = sectors.filter(s => s.sector_type === 'Arrival')
  const target = returns.length ? returns[returns.length - 1] : sectors[sectors.length - 1]
  return calcSectorDate(travelStart, target.day_offset)
}

// แถวของ Sector Dates (mini-table): Sector Type | Travel Date — เติมเลขเมื่อมีชนิดซ้ำ (Transit 1, Transit 2)
export function buildSectorDateRows(
  travelStart: string | null,
  sectors: SectorDateInput[]
): { label: string; sector_type: string; date: string | null }[] {
  const totals: Record<string, number> = {}
  sectors.forEach(s => { totals[s.sector_type] = (totals[s.sector_type] || 0) + 1 })
  const seen: Record<string, number> = {}
  return sectors.map(s => {
    seen[s.sector_type] = (seen[s.sector_type] || 0) + 1
    const label = totals[s.sector_type] > 1 ? `${s.sector_type} ${seen[s.sector_type]}` : s.sector_type
    return { label, sector_type: s.sector_type, date: calcSectorDate(travelStart, s.day_offset) }
  })
}

export function calcSeatBalance(seatTotal: number, seatUsed: number): number {
  return Math.max(0, seatTotal - seatUsed)
}

// TTL Date = Base Date − Due Days Before; TTL DateTime = TTL Date + TTL Time
// Only 'Travel Start' base date is computable in the wizard (no created/custom date yet)
export function calcTTLDatetime(
  travelStart: string | null,
  baseDateType: string,
  dueDaysBefore: number,
  ttlTime: string
): string | null {
  if (!travelStart || baseDateType !== 'Travel Start') return null
  try {
    const base = parseISO(travelStart)
    if (!isValid(base)) return null
    const dueDate = addDays(base, -dueDaysBefore)
    const [h, m] = ttlTime.split(':').map(n => parseInt(n) || 0)
    const dt = new Date(dueDate)
    dt.setHours(h, m, 0, 0)
    return dt.toISOString()
  } catch {
    return null
  }
}

/** คำนวณวันครบกำหนดชำระเงิน: baseDate − dueDaysBefore */
export function calcPaymentDueDate(
  travelStart: string | null,
  baseDateType: string,
  dueDaysBefore: number,
  dueTime: string
): string | null {
  return calcTTLDatetime(travelStart, baseDateType, dueDaysBefore, dueTime)
}

export function calcTotal(fare: number, tax: number): number {
  return fare + tax
}

export function calcSeatStatus(seatTotal: number, seatBalance: number): 'available' | 'low' | 'full' {
  if (seatBalance <= 0) return 'full'
  if (seatTotal > 0 && seatBalance / seatTotal < 0.2) return 'low'
  return 'available'
}

// ============================================================
// Route Text from Sectors
// ============================================================

export function buildRouteText(
  sectors: { dep_airport_code: string; arr_airport_code: string }[],
  separator = '-'
): string {
  if (!sectors || sectors.length === 0) return ''
  const airports: string[] = []
  sectors.forEach((s, i) => {
    if (i === 0 && s.dep_airport_code) airports.push(s.dep_airport_code)
    if (s.arr_airport_code) airports.push(s.arr_airport_code)
  })
  // ห้ามมีค่าซ้ำติดกัน เช่น BKK > BKK
  return airports.filter((code, i) => code && code !== airports[i - 1]).join(separator)
}

// ============================================================
// Payment Schedule Generation
// ============================================================

export function generatePaymentSchedule(
  pnr: Pick<FlightPNR, 'id' | 'series_id' | 'travel_start' | 'total_amount'>,
  condition: FlightCondition & { stages: FlightConditionStage[] }
): Omit<PaymentSchedule, 'id' | 'created_at' | 'updated_at'>[] {
  if (!pnr.travel_start || !condition?.stages?.length) return []

  const travelStart = parseISO(pnr.travel_start)
  const stages = [...condition.stages].sort((a, b) => a.stage_no - b.stage_no)
  const totalAmount = pnr.total_amount || 0

  let remainingAmount = totalAmount
  const schedule: Omit<PaymentSchedule, 'id' | 'created_at' | 'updated_at'>[] = []

  for (const stage of stages) {
    let amountDue = 0
    if (stage.amount_type === 'Fixed') {
      amountDue = stage.amount_value
    } else if (stage.amount_type === 'Percent') {
      amountDue = (totalAmount * stage.amount_value) / 100
    } else if (stage.amount_type === 'Remaining') {
      amountDue = remainingAmount
    }
    amountDue = Math.round(amountDue * 100) / 100
    remainingAmount -= amountDue

    let baseDate = travelStart
    if (stage.payment_base_date_type === 'Travel Start') {
      baseDate = travelStart
    }

    const dueDate = addDays(baseDate, -stage.payment_due_days_before)
    const [ttlHour, ttlMin] = stage.payment_due_time.split(':').map(Number)
    const ttlDatetime = new Date(dueDate)
    ttlDatetime.setHours(ttlHour || 18, ttlMin || 0, 0, 0)

    schedule.push({
      series_id: pnr.series_id,
      pnr_id: pnr.id,
      condition_id: condition.id,
      condition_stage_id: stage.id,
      stage_no: stage.stage_no,
      stage_name: stage.stage_name,
      payment_type: stage.payment_type,
      amount_due: amountDue,
      due_date: format(dueDate, 'yyyy-MM-dd'),
      ttl_datetime: ttlDatetime.toISOString(),
      paid_amount: 0,
      payment_status: 'Pending',
    })
  }
  return schedule
}

export function calcNextTTL(schedules: PaymentSchedule[]): string | null {
  const pending = schedules
    .filter(s => s.payment_status === 'Pending' && s.ttl_datetime)
    .sort((a, b) => new Date(a.ttl_datetime!).getTime() - new Date(b.ttl_datetime!).getTime())
  return pending[0]?.ttl_datetime ?? null
}

// ============================================================
// Sector Validation
// ============================================================

export function getMinSectors(ticketType: string, tripType = 'Round-trip'): number {
  if (ticketType === 'FIT' && tripType === 'One-way') return 1
  return 2
}

export function validateSectors(sectors: FlightSector[], ticketType: string, tripType: string): string | null {
  if (sectors.length === 0) return 'ต้องมีอย่างน้อย 1 Sector'
  if (sectors[0]?.sector_type !== 'Departure') return 'Sector แรกต้องเป็น Departure'

  if (tripType === 'One-way') {
    if (sectors.length !== 1) return 'One-way ต้องมี 1 Sector (Departure) เท่านั้น'
    return null
  }

  if (tripType === 'Round-trip') {
    if (sectors.length !== 2) return 'Round-trip ต้องมีพอดี 2 Sector (Departure + Arrival)'
    if (sectors[1]?.sector_type !== 'Arrival') return 'Round-trip Sector ที่ 2 ต้องเป็น Arrival'
    return null
  }

  // Multi-city
  if (sectors.length < 2) return 'Multi-city ต้องมีอย่างน้อย 2 Sector'
  if (sectors[sectors.length - 1]?.sector_type !== 'Arrival') return 'Multi-city Sector สุดท้ายต้องเป็น Arrival'
  return null
}

// ============================================================
// Number Format
// ============================================================

export function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '-'
  return n.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatCurrency(n: number | null | undefined, currency = 'THB'): string {
  if (n == null) return '-'
  return `${formatNumber(n, 2)} ${currency}`
}

// ============================================================
// Status Colors
// ============================================================

export function getStockStatusColor(status: string): string {
  const map: Record<string, string> = {
    Draft: 'badge-gray',
    Active: 'badge-green',
    Closed: 'badge-blue',
    Cancelled: 'badge-red',
  }
  return map[status] || 'badge-gray'
}

export function getPNRStatusColor(status: string): string {
  const map: Record<string, string> = {
    Pending: 'badge-yellow',
    Confirmed: 'badge-blue',
    Ticketed: 'badge-green',
    Cancelled: 'badge-red',
    Expired: 'badge-orange',
    Closed: 'badge-gray',
  }
  return map[status] || 'badge-gray'
}

export function getSeatStatusColor(status: string): string {
  const map: Record<string, string> = {
    available: 'badge-green',
    low: 'badge-orange',
    full: 'badge-red',
  }
  return map[status] || 'badge-gray'
}

export function getPaymentStatusColor(status: string): string {
  const map: Record<string, string> = {
    Pending: 'badge-yellow',
    Paid: 'badge-green',
    Overdue: 'badge-red',
    Waived: 'badge-gray',
  }
  return map[status] || 'badge-gray'
}

// ============================================================
// PNR Duplicate Detection
// ============================================================

export interface PNRDuplicateDetail {
  pnrCode: string
  rowIndices: number[]
  existsInSystem: boolean
}

export interface PNRDuplicateResult {
  duplicateIndices: Set<number>
  details: PNRDuplicateDetail[]
}

export function findDuplicatePNRs(
  pnrs: { pnr_code: string }[],
  existingPNRCodes?: Set<string>,
): PNRDuplicateResult {
  const map = new Map<string, number[]>()
  pnrs.forEach((p, i) => {
    const code = p.pnr_code.trim().toUpperCase()
    if (!code) return
    if (!map.has(code)) map.set(code, [])
    map.get(code)!.push(i)
  })

  const details: PNRDuplicateDetail[] = []
  const duplicateIndices = new Set<number>()

  for (const [code, indices] of map.entries()) {
    const isDupInList = indices.length > 1
    const existsInSystem = existingPNRCodes?.has(code) ?? false
    if (isDupInList || existsInSystem) {
      details.push({ pnrCode: code, rowIndices: indices, existsInSystem })
      indices.forEach(i => duplicateIndices.add(i))
    }
  }

  return { duplicateIndices, details }
}

// ============================================================
// Misc
// ============================================================

export function truncate(str: string, len = 30): string {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}

export function generateStockCode(prefix = 'STK'): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `${prefix}${yy}${mm}${rand}`
}

// ============================================================
// Payment Type Labels & Stage Display Name
// ============================================================

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  RSVN_FEE:           'ค่าจองที่นั่ง (RSVN Fee)',
  DEPOSIT:            'มัดจำ',
  BALANCE:            'ชำระส่วนที่เหลือ',
  FULL_PAYMENT:       'ชำระเต็มจำนวน',
  FEE:                'ชำระค่าธรรมเนียม',
  // backward-compat — legacy data only
  REMAINING_PAYMENT:  'ชำระส่วนที่เหลือ',
  ADDITIONAL_PAYMENT: 'ชำระเพิ่ม',
  OTHER:              'อื่น ๆ',
  PARTIAL_PAYMENT:    'ชำระเพิ่ม',
  FINAL_PAYMENT:      'ชำระส่วนที่เหลือ',
}

export function stageDisplayName(seq: number, paymentType: string, customName?: string | null): string {
  if (!paymentType) return `งวดที่ ${seq} — กรุณาเลือกประเภทการชำระเงิน`
  if (paymentType === 'OTHER') return `งวดที่ ${seq} — ${customName || 'อื่น ๆ'}`
  return `งวดที่ ${seq} — ${PAYMENT_TYPE_LABELS[paymentType] || paymentType}`
}

export const PERCENT_BASE_LABELS: Record<string, string> = {
  TOTAL_AMOUNT:         'ยอดรวม PNR (Fare + Tax)',
  FARE_ONLY:            'ค่าโดยสาร Fare',
  PER_SEAT:             'ราคาต่อที่นั่ง × จำนวนที่นั่ง',
  REMAINING_AFTER_PREV: 'ยอดคงเหลือหลังหักงวดก่อนหน้า',
}
