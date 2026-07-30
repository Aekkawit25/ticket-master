import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, addDays, differenceInDays, isValid } from 'date-fns'
import type { FlightSector, FlightPNR, FlightCondition, FlightConditionStage, PaymentSchedule, AmountType } from '@/types'

// ============================================================
// Dummy PNR Generation  (สร้างเฉพาะตอนเข้า Step 5)
// ============================================================

function getTicketTypeCode(ticketType: string, groupType?: string): string {
  if (ticketType === 'Group' && groupType === 'ADHOC') return 'AH'
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
  stockInfo: { ticket_type: string; airline_code: string; group_type?: string },
  systemDummies?: Set<string>,
): T[] {
  const runningMap: Record<string, number> = {}
  const typeCode = getTicketTypeCode(stockInfo.ticket_type, stockInfo.group_type)
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

const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

/** Thai date: D เดือนย่อ YY (พ.ศ. 2 หลัก) e.g. "10 มิ.ย. 69". Safe for date-only ISO strings. */
export function formatDateThai(date: string | null | undefined): string {
  if (!date) return '—'
  try {
    const d = new Date(date + 'T12:00:00')
    if (isNaN(d.getTime())) return '—'
    const year = String((d.getFullYear() + 543) % 100).padStart(2, '0')
    return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${year}`
  } catch { return '—' }
}

/** Thai date+time: "10 มิ.ย. 69 · 02:00" or "10 มิ.ย. 69" if no time. */
export function formatDateTimeThai(date: string | null | undefined, time: string | null | undefined): string {
  const d = formatDateThai(date)
  if (d === '—') return '—'
  return time ? `${d} · ${time}` : d
}

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

/**
 * Compute a smart period display from an array of departure date strings.
 * - Deduplicates and sorts dates
 * - Smart range format: same month ("15–29 Jul 26"), same year ("15 Jul – 20 Aug 26"), cross-year ("15 Dec 26 – 10 Jan 27")
 */
export function formatPeriodDisplay(depDates: string[]): {
  dateRange: string
  count: number
  allDates: string[]
} {
  const allDates = [...new Set(depDates.filter(Boolean))].sort()
  const count = allDates.length
  if (count === 0) return { dateRange: '', count: 0, allDates: [] }

  const d1 = parseDateSafe(allDates[0])
  if (!isValid(d1)) return { dateRange: allDates[0], count, allDates }

  if (count === 1) {
    return { dateRange: format(d1, 'dd MMM yy'), count, allDates }
  }

  const d2 = parseDateSafe(allDates[count - 1])
  if (!isValid(d2)) return { dateRange: format(d1, 'dd MMM yy'), count, allDates }

  const y1 = d1.getFullYear(), m1 = d1.getMonth()
  const y2 = d2.getFullYear(), m2 = d2.getMonth()

  if (y1 === y2 && m1 === m2) {
    // "15–29 Jul 26"
    return { dateRange: `${format(d1, 'd')}–${format(d2, 'dd MMM yy')}`, count, allDates }
  }
  if (y1 === y2) {
    // "15 Jul – 20 Aug 26"
    return { dateRange: `${format(d1, 'dd MMM')} – ${format(d2, 'dd MMM yy')}`, count, allDates }
  }
  // "15 Dec 26 – 10 Jan 27"
  return { dateRange: `${format(d1, 'dd MMM yy')} – ${format(d2, 'dd MMM yy')}`, count, allDates }
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
    // Use local noon to avoid UTC-midnight timezone shift (same approach as calcSectorDepDate in pnr-record.ts)
    const d = new Date(travelStart + 'T12:00:00')
    if (isNaN(d.getTime())) return null
    d.setDate(d.getDate() + Math.max(0, (dayOffset ?? 1) - 1))
    return d.toISOString().split('T')[0]
  } catch {
    return null
  }
}

type SectorDateInput = { sector_type: string; day_offset: number; arr_day_offset?: number }

// Travel End = วันที่ของ Sector Type = Arrival ตัวสุดท้าย, ถ้าไม่มี Arrival ใช้ Sector สุดท้าย
// Respects arr_day_offset so overnight arrivals (+1, +2, ...) yield the correct return date.
export function calcTravelEndFromSectors(
  travelStart: string | null,
  sectors: SectorDateInput[]
): string | null {
  if (!travelStart || !sectors?.length) return null
  const returns = sectors.filter(s => s.sector_type === 'Arrival')
  const target = returns.length ? returns[returns.length - 1] : sectors[sectors.length - 1]
  const depDate = calcSectorDate(travelStart, target.day_offset)
  const arrOffset = target.arr_day_offset ?? 0
  if (arrOffset > 0 && depDate) {
    try {
      const [y, m, d] = depDate.split('-').map(Number)
      const local = new Date(y, m - 1, d)
      local.setDate(local.getDate() + arrOffset)
      return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
    } catch {
      return depDate
    }
  }
  return depDate
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

/**
 * +Day = calendar day difference between dep and arr using local date math (no UTC shift).
 * Returns null if either date is missing/unparseable; can return negative (use for validation).
 */
export function calculatePlusDay(
  departureDate: string | null | undefined,
  arrivalDate: string | null | undefined,
): number | null {
  if (!departureDate || !arrivalDate) return null
  const [dy, dm, dd] = departureDate.split('-').map(Number)
  const [ay, am, ad] = arrivalDate.split('-').map(Number)
  if (!dy || !dm || !dd || !ay || !am || !ad) return null
  return Math.round(
    (new Date(ay, am - 1, ad).getTime() - new Date(dy, dm - 1, dd).getTime()) / 86400000,
  )
}

/** Difference in days between two ISO date strings (b − a). Returns 0 if either is null/invalid. */
export function daysBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0
  try {
    return differenceInDays(parseISO(b), parseISO(a))
  } catch {
    return 0
  }
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

// Accepts both naming conventions used across the codebase (snake_case in
// wizard/import-review data, camelCase in PNR/Flight-Set records) so every
// screen can call this directly on its native sector shape.
type RouteSector = {
  dep_airport_code?: string | null
  arr_airport_code?: string | null
  depAirportCode?: string | null
  arrAirportCode?: string | null
}

export function buildRouteText(
  sectors: RouteSector[],
  separator = '-'
): string {
  if (!sectors || sectors.length === 0) return ''
  const airports: string[] = []
  sectors.forEach((s, i) => {
    const dep = s.dep_airport_code ?? s.depAirportCode
    const arr = s.arr_airport_code ?? s.arrAirportCode
    if (i === 0 && dep) airports.push(dep)
    if (arr) airports.push(arr)
  })
  // ห้ามมีค่าซ้ำติดกัน เช่น BKK > BKK
  return airports.filter((code, i) => code && code !== airports[i - 1]).join(separator)
}

// ============================================================
// Flight Set Travel Days — same rule used everywhere a Flight Set's
// duration badge is shown: Dep Date of the first sector to Arr Date of the
// last (Arrival, or last overall) sector, inclusive of both end days.
// ============================================================

type DurationSector = {
  day_offset?: number | null
  dayOffset?: number | null
  arr_day_offset?: number | null
  arrDayOffset?: number | null
  sector_type?: string | null
  sectorType?: string | null
}

export function calcFlightSetTravelDays(sectors: DurationSector[]): number {
  if (!sectors || sectors.length === 0) return 1
  const norm = sectors.map(s => ({
    day_offset: s.day_offset ?? s.dayOffset ?? 1,
    arr_day_offset: s.arr_day_offset ?? s.arrDayOffset ?? 0,
    sector_type: s.sector_type ?? s.sectorType ?? '',
  }))
  const firstOffset = norm[0].day_offset
  const returns = norm.filter(s => s.sector_type === 'Arrival')
  const target = returns.length ? returns[returns.length - 1] : norm[norm.length - 1]
  const endOffset = target.day_offset + target.arr_day_offset
  return Math.max(1, endOffset - firstOffset + 1)
}

/**
 * Compares a stored/preset day count against the value computed from the
 * Flight Set's own sectors. The computed value is always authoritative —
 * callers should display `days` and surface `mismatch` as a warning rather
 * than trusting the preset value.
 */
export function resolveFlightSetTravelDays(
  sectors: DurationSector[],
  presetDays?: number | null
): { days: number; mismatch: boolean } {
  const days = calcFlightSetTravelDays(sectors)
  return { days, mismatch: presetDays != null && presetDays !== days }
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
    // One-way: min 1 sector; multi-sector requires Arrival as last
    if (sectors.length === 1) return null
    if (sectors[sectors.length - 1]?.sector_type !== 'Arrival') return 'One-way Sector สุดท้ายต้องเป็น Arrival'
    return null
  }

  if (tripType === 'Round-trip') {
    if (sectors.length < 2) return 'Round-trip ต้องมีอย่างน้อย 2 Sectors'
    if (sectors[sectors.length - 1]?.sector_type !== 'Arrival') return 'Round-trip Sector สุดท้ายต้องเป็น Arrival'
    const firstFrom = sectors[0]?.dep_airport_code
    const lastTo    = sectors[sectors.length - 1]?.arr_airport_code
    if (firstFrom && lastTo && firstFrom !== lastTo)
      return `Round-trip ต้องกลับมาสิ้นสุดที่ ${firstFrom} แต่ Sector สุดท้ายสิ้นสุดที่ ${lastTo}`
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
// Flight Number Helpers
// ============================================================

export function normalizeFlightNo(airlineCode: string, flightNo: string): string {
  let n = String(flightNo || '').trim()
  if (airlineCode) {
    const esc = airlineCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    n = n.replace(new RegExp(`^${esc}`, 'i'), '')
  }
  // Strip everything that's not a digit (handles Thai, symbols, spaces, leftover Latin)
  n = n.replace(/\D/g, '')
  return n
}

export function getDisplayFlightNo(airlineCode: string, flightNo: string): string {
  return `${airlineCode || ''}${normalizeFlightNo(airlineCode, flightNo)}`
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

export function getStockCodePrefix(ticketType: string, groupType?: string | null): string {
  // Accept new StockType keys directly
  if (ticketType === 'SERIES')      return 'SR'
  if (ticketType === 'AD_HOC')      return 'AH'
  if (ticketType === 'TICKET_ONLY') return 'TO'
  // Legacy ticket_type + group_type
  if (ticketType === 'Group') return groupType === 'ADHOC' ? 'AH' : 'SR'
  if (ticketType === 'FIT')   return 'FIT'
  return 'TO'  // Ticket + Land → new prefix
}

export function generateStockCode(prefix = 'SR', existingCodes: string[] = []): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const base = `${prefix}${yy}${mm}`
  let maxNum = 0
  for (const code of existingCodes) {
    if (code.startsWith(base) && code.length === base.length + 4) {
      const n = parseInt(code.slice(base.length), 10)
      if (!isNaN(n) && n > maxNum) maxNum = n
    }
  }
  return `${base}${String(maxNum + 1).padStart(4, '0')}`
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
