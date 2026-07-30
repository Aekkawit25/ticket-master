'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  addDays, addMonths, subMonths, format as fnsFormat, parseISO, isValid as fnsIsValid,
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, X, Trash2, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import { cn, formatDate, formatDateTime, formatDateThai, formatDateTimeThai, calculatePlusDay, calcTTLDatetime } from '@/lib/utils'
import { TimeInput } from '@/components/ui/time-input'
import { calculateStockSummary, saveDemoStock, checkPNRDuplicatesInSystem } from '@/lib/demo-storage'
import { generateDummyPnrCode, calcTravelEndFromFlightSet } from '@/lib/pnr-shared-utils'
import type { DemoStock, DemoPNR, DemoLog } from '@/lib/demo-storage'
import { calcTtlDateFromTravelAdjusted } from '@/lib/ttl-utils'
import { adjustDateForHolidays } from '@/lib/holiday-utils'
import { getActiveHolidays } from '@/lib/holiday-storage'
import { TtlTemplateConflictModal, type TtlTemplateConflictDecision } from '@/components/shared/TtlTemplateConflictModal'
import { validatePnrRowFields } from '@/lib/pnr-validation'
import { PNRSeatsTable } from '@/components/shared/PNRSeatsTable'
import type { PNRRecord, PNRSectorRecord, ScheduleTemplate } from '@/lib/pnr-record'

// ─── Exported Types ───────────────────────────────────────────────────────────

export type BulkPnrMode = 'create_stock' | 'add_to_existing'

export interface BulkPnrSector {
  sectorType: string
  dayOffset: number
  depAirportCode?: string
  arrAirportCode?: string
  depTime?: string
  arrTime?: string
  arrDayOffset?: number
  airlineCode?: string
  flightNo?: string
}

export interface BulkPnrFlightSet {
  flightSetId: string
  flightSetName: string
  sectors: BulkPnrSector[]
}

export interface BulkPnrCondition {
  code: string
  name: string
  stages: Array<{
    paymentBaseDate: string
    paymentDueDaysBefore: number
    paymentDueTime: string
  }>
  ttlRule: {
    calcType: string  // 'from_travel_date' | 'manual' | 'not_set' | 'none'
    baseDate: string
    daysBefore: number
    date?: string
    time?: string
  }
}

export interface BulkPnrRow {
  travelStart: string
  travelEnd: string
  seatTotal: number
  priceFormat: 'FARE' | 'FARE_YQ' | 'ALL_IN'
  fare: number
  yq: number
  breakdown: boolean
  taxType: 'separate' | 'included' | 'pending'
  tax: number
  total: number
  conditionCode: string
  status: string
  remark: string
  isDummy: boolean
  pnrCode: string
  dummyPnr: string
  ttlType: 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE'
  ttlDaysBefore: number | null
  ttlDate: string | null
  ttlTime: string | null
}

export interface BulkPnrBuilderProps {
  open: boolean
  onClose: () => void
  mode: BulkPnrMode
  sectors?: BulkPnrSector[]          // backward compat (Step4PNR / create_stock)
  flightSets?: BulkPnrFlightSet[]     // for add_to_existing: shows FS dropdown
  conditions: BulkPnrCondition[]
  currency: string
  // CREATE_STOCK mode
  onConfirm?: (rows: BulkPnrRow[]) => void
  // ADD_TO_EXISTING mode
  stock?: DemoStock
  onSaved?: (updatedStock: DemoStock, count: number) => void
  // Initial config defaults (pre-filled on first open)
  defaultSeatTotal?: number
  defaultPriceFormat?: 'FARE' | 'FARE_YQ' | 'ALL_IN'
}

// ─── Internal Types ───────────────────────────────────────────────────────────

type CreationMethod = 'count' | 'weekday' | 'calendar'
type TaxType = 'separate' | 'included' | 'pending'

interface SharedCfg {
  seatTotal: number
  flightSetId: string
  priceFormat: 'FARE' | 'FARE_YQ' | 'ALL_IN'
  fare: string
  yq: string
  allIn: string
  breakdown: boolean
  tax: string
  conditionCode: string
  status: string
  remark: string
  ttlType: 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE'
  ttlDaysBefore: string
  ttlDate: string
  ttlTime: string
  ttlUserModified: boolean
}

interface CountCfg { startDate: string; count: number; intervalDays: number }
interface WdCfg { startDate: string; endDate: string; weekdays: Set<number> }

interface InternalRow {
  rowId: string; seq: number
  travelStart: string; travelEnd: string
  pnrCode: string; dummyPnr: string
  seatTotal: number; priceFormat: 'FARE' | 'FARE_YQ' | 'ALL_IN'
  fare: number; yq: number; taxType: TaxType; tax: number; breakdown: boolean; total: number
  conditionCode: string; status: string; remark: string
  isDummy: boolean
  paymentDueDate: string | null; ttlDateTime: string | null
  ttlType: 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE'
  ttlDate: string | null
  ttlTime: string | null
  ttlDaysBefore: number | null
  ttlDateOriginal: string | null
  ttlHolidayAdjusted: boolean
  ttlHolidayAdjustReason: string | null
  errors: string[]; selected: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_ABBR = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const

const INIT_SHARED: SharedCfg = {
  seatTotal: 0, flightSetId: '',
  priceFormat: 'FARE', fare: '', yq: '', allIn: '', breakdown: false,
  tax: '', conditionCode: '', status: 'Pending', remark: '',
  ttlType: 'NONE', ttlDaysBefore: '', ttlDate: '', ttlTime: '', ttlUserModified: false,
}
const INIT_COUNT: CountCfg = { startDate: '', count: 1, intervalDays: 1 }
const INIT_WD: WdCfg = { startDate: '', endDate: '', weekdays: new Set() }

const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ─── Internal Helpers ─────────────────────────────────────────────────────────


function calcPaymentDue(
  travelStart: string,
  travelEnd: string,
  cond: BulkPnrCondition | undefined,
): string | null {
  if (!cond || !cond.stages.length) return null
  const s = cond.stages[0]
  if (s.paymentBaseDate === 'Travel Start') {
    return calcTTLDatetime(travelStart, 'Travel Start', s.paymentDueDaysBefore, s.paymentDueTime || '18:00')
  }
  if (s.paymentBaseDate === 'Travel End' && travelEnd) {
    try {
      const base = parseISO(travelEnd)
      if (!fnsIsValid(base)) return null
      const d = addDays(base, -s.paymentDueDaysBefore)
      const [h, m] = (s.paymentDueTime || '18:00').split(':').map(Number)
      const dt = new Date(d); dt.setHours(h, m, 0, 0)
      return dt.toISOString()
    } catch { return null }
  }
  return null
}



function buildInternalRows(
  method: CreationMethod,
  shared: SharedCfg,
  countCfg: CountCfg,
  wdCfg: WdCfg,
  calDates: string[],  // sorted list (may have duplicates)
  sectors: BulkPnrSector[],
  conditions: BulkPnrCondition[],
  stock?: DemoStock,
): InternalRow[] {
  let starts: string[] = []

  if (method === 'count') {
    if (!countCfg.startDate || countCfg.count <= 0) return []
    try {
      let cur = parseISO(countCfg.startDate)
      for (let i = 0; i < countCfg.count; i++) {
        starts.push(fnsFormat(cur, 'yyyy-MM-dd'))
        cur = addDays(cur, Math.max(1, countCfg.intervalDays))
      }
    } catch { return [] }
  } else if (method === 'weekday') {
    if (!wdCfg.startDate || !wdCfg.endDate || !wdCfg.weekdays.size) return []
    try {
      const all = eachDayOfInterval({ start: parseISO(wdCfg.startDate), end: parseISO(wdCfg.endDate) })
      starts = all.filter(d => wdCfg.weekdays.has(getDay(d))).map(d => fnsFormat(d, 'yyyy-MM-dd'))
    } catch { return [] }
  } else {
    starts = calDates
  }

  const priceFormat = shared.priceFormat ?? 'FARE'
  let fareAmt: number, yqAmt: number, taxAmt: number, taxType: TaxType, totalAmt: number, bdwn: boolean
  if (priceFormat === 'FARE') {
    fareAmt = Math.max(0, Number(shared.fare) || 0)
    yqAmt   = Math.max(0, Number(shared.yq)   || 0)
    taxAmt  = Math.max(0, Number(shared.tax)  || 0)
    taxType = 'separate'; bdwn = false
    totalAmt = fareAmt + yqAmt + taxAmt
  } else if (priceFormat === 'FARE_YQ') {
    fareAmt = Math.max(0, Number(shared.fare) || 0)
    yqAmt   = 0
    taxAmt  = Math.max(0, Number(shared.tax)  || 0)
    taxType = 'separate'; bdwn = false
    totalAmt = fareAmt + taxAmt
  } else {
    totalAmt = Math.max(0, Number(shared.allIn) || 0)
    bdwn = shared.breakdown
    if (bdwn) {
      fareAmt = Math.max(0, Number(shared.fare) || 0)
      yqAmt   = Math.max(0, Number(shared.yq)   || 0)
      taxAmt  = Math.max(0, Number(shared.tax)  || 0)
      taxType = 'separate'
    } else {
      fareAmt = 0; yqAmt = 0; taxAmt = 0; taxType = 'included'
    }
  }
  const cond    = conditions.find(c => c.code === shared.conditionCode)
  const usedSet = new Set<string>()
  const activeHolidays = getActiveHolidays()

  return starts.map((s, i) => {
    const travelEnd = calcTravelEndFromFlightSet(s, sectors)
    const dummy     = stock ? generateDummyPnrCode(s, stock, usedSet) : ''
    if (dummy) usedSet.add(dummy)

    // NAME DL — resolve raw date, then shift off Sat/Sun and active holidays
    let ttlType: 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE' = 'NONE'
    let ttlDate: string | null = null
    let ttlDateOriginal: string | null = null
    let ttlHolidayAdjusted = false
    let ttlHolidayAdjustReason: string | null = null
    if (shared.ttlType === 'DAYS_BEFORE') {
      const d = parseInt(shared.ttlDaysBefore, 10)
      if (!isNaN(d) && d >= 0) {
        const { date, adjustment } = calcTtlDateFromTravelAdjusted(s, d, activeHolidays)
        if (date) {
          ttlType = 'DAYS_BEFORE'; ttlDate = date
          if (adjustment) {
            ttlDateOriginal = adjustment.originalDate
            ttlHolidayAdjusted = adjustment.adjusted
            ttlHolidayAdjustReason = adjustment.reason
          }
        }
      }
    } else if (shared.ttlType === 'FIXED_DATE' && shared.ttlDate) {
      const adjustment = adjustDateForHolidays(shared.ttlDate, activeHolidays)
      ttlType = 'FIXED_DATE'; ttlDate = adjustment.adjustedDate
      ttlDateOriginal = adjustment.originalDate
      ttlHolidayAdjusted = adjustment.adjusted
      ttlHolidayAdjustReason = adjustment.reason
    }

    return {
      rowId: newId('R'), seq: i + 1,
      travelStart: s, travelEnd,
      pnrCode: '', dummyPnr: dummy,
      isDummy: !!dummy,
      seatTotal: shared.seatTotal,
      priceFormat, fare: fareAmt, yq: yqAmt, taxType, tax: taxAmt, breakdown: bdwn, total: totalAmt,
      conditionCode: shared.conditionCode, status: shared.status, remark: shared.remark,
      paymentDueDate: calcPaymentDue(s, travelEnd, cond),
      ttlDateTime: null,
      ttlType,
      ttlDate,
      ttlTime: ttlType !== 'NONE' ? (shared.ttlTime || null) : null,
      ttlDaysBefore: ttlType === 'DAYS_BEFORE' ? (parseInt(shared.ttlDaysBefore, 10) || null) : null,
      ttlDateOriginal,
      ttlHolidayAdjusted,
      ttlHolidayAdjustReason,
      errors: [], selected: false,
    }
  })
}

function validateInternalRows(
  rows: InternalRow[],
  mode: BulkPnrMode,
  stock?: DemoStock,
): InternalRow[] {
  const seenStart = new Map<string, number>()

  return rows.map((row, idx) => {
    // Field-level rules (seat/price-by-format/NAME DL) come from the single shared validator —
    // kept in sync with the wizard's Next/Save gate, Single PNR modal, and the PNR & Seats table.
    const fieldIssues = validatePnrRowFields({
      pnrCode: row.pnrCode,
      travelStart: row.travelStart,
      seatTotal: row.seatTotal,
      priceFormat: row.priceFormat,
      fare: row.fare,
      yq: row.yq,
      allInAmount: row.priceFormat === 'ALL_IN' ? row.total : null,
      ttlType: row.ttlType,
      ttlDaysBefore: row.ttlDaysBefore,
      ttlDate: row.ttlDate,
    })
    const errors: string[] = fieldIssues.map(i => i.message)
    if (row.taxType === 'separate' && row.tax < 0) errors.push('Tax ต้องไม่ติดลบ')

    if (seenStart.has(row.travelStart)) {
      errors.push(`วันเดินทางเริ่มต้น ซ้ำกับรายการ #${(seenStart.get(row.travelStart)! + 1)}`)
    } else { seenStart.set(row.travelStart, idx) }

    if (mode === 'add_to_existing' && row.pnrCode.trim()) {
      const check = checkPNRDuplicatesInSystem(
        [{ pnr_code: row.pnrCode.trim() }],
        stock?.stockId,
      )
      if (check.hasConflicts) {
        const cs = check.conflicts[0]?.conflictingStock
        errors.push(cs ? `PNR ซ้ำใน ${cs.stockCode}` : `PNR ซ้ำในระบบ`)
      }
    }

    return { ...row, errors }
  })
}

// ─── MultiDateCalendar ────────────────────────────────────────────────────────

interface CalItem { id: string; date: string }

function MultiDateCalendar({
  items, onAdd, onRemove,
}: {
  items: CalItem[]
  onAdd: (date: string) => void
  onRemove: (id: string) => void
}) {
  const [month, setMonth] = useState(new Date())
  const monthStart = startOfMonth(month)
  const monthEnd   = endOfMonth(month)

  const calDays = useMemo(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
    const pad  = getDay(monthStart)
    const cells: (Date | null)[] = [...(Array(pad).fill(null) as null[]), ...days]
    while (cells.length < 42) cells.push(null)
    return cells
  }, [month])  // eslint-disable-line react-hooks/exhaustive-deps

  const dateCounts = useMemo(() => {
    const map: Record<string, number> = {}
    items.forEach(p => { map[p.date] = (map[p.date] || 0) + 1 })
    return map
  }, [items])

  return (
    <div className="flex gap-4 items-start">
      {/* Calendar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => setMonth(m => subMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-semibold text-slate-700">{fnsFormat(month, 'MMM yyyy')}</span>
          <button type="button" onClick={() => setMonth(m => addMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DAY_ABBR.map(d => <div key={d} className="text-center text-[11px] font-medium text-slate-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {calDays.map((day, i) => {
            if (!day) return <div key={i} className="h-9" />
            const ds    = fnsFormat(day, 'yyyy-MM-dd')
            const count = dateCounts[ds] || 0
            return (
              <button key={i} type="button" onClick={() => onAdd(ds)}
                className={cn(
                  'relative h-9 w-full rounded-lg text-sm font-medium transition-colors',
                  count > 0 ? 'bg-[#05a94f] text-white' : 'hover:bg-green-50 text-slate-700'
                )}>
                {fnsFormat(day, 'd')}
                {count > 1 && (
                  <span className="absolute -top-1 -right-0.5 min-w-[16px] h-4 bg-amber-400 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                    ×{count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="h-7 mt-2 flex items-center">
          {items.length > 0 && (
            <button type="button" onClick={() => items.forEach(it => onRemove(it.id))}
              className="text-xs text-red-400 hover:text-red-600 transition-colors">
              ล้างทั้งหมด ({items.length})
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-400">คลิกวันที่ซ้ำเพื่อสร้างอีก 1 PNR ในวันเดียวกัน</p>
      </div>
      {/* Selected list */}
      <div className="w-[130px] shrink-0">
        <p className="text-[11px] font-semibold text-slate-500 mb-1.5">รายการ {items.length > 0 ? `(${items.length})` : ''}</p>
        <div className="max-h-[240px] overflow-y-auto space-y-1 pr-0.5">
          {items.length === 0 ? (
            <p className="text-[11px] text-slate-300 italic">ยังไม่ได้เลือก</p>
          ) : (
            [...items].sort((a, b) => a.date.localeCompare(b.date)).map((it, idx) => (
              <div key={it.id} className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-md px-1.5 py-1">
                <span className="text-[10px] text-slate-400 w-4 shrink-0 text-right">{idx + 1}.</span>
                <span className="text-[11px] font-mono text-green-800 flex-1 min-w-0 truncate">{formatDate(it.date)}</span>
                <button type="button" onClick={() => onRemove(it.id)}
                  className="shrink-0 text-slate-300 hover:text-red-400 transition-colors">
                  <Trash2 size={10} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Flight Set helpers ───────────────────────────────────────────────────────

function buildFsRoute(sectors: BulkPnrSector[]): string {
  const first = sectors[0]
  const last  = sectors[sectors.length - 1]
  if (!first || !last) return ''
  const dep = first.depAirportCode || ''
  const arr = last.arrAirportCode  || ''
  return dep && arr ? `${dep} – ${arr}` : ''
}

function buildFsLabel(fs: BulkPnrFlightSet): string {
  const route = buildFsRoute(fs.sectors)
  const n     = fs.sectors.length
  const days  = fs.sectors.length ? Math.max(...fs.sectors.map(s => s.dayOffset), 1) : 1
  const parts = [fs.flightSetName]
  if (route) parts.push(route)
  if (n)     parts.push(`${n} Sectors`)
  if (days > 1) parts.push(`${days} วัน`)
  return parts.join(' · ')
}

function buildFsFlightSummary(sectors: BulkPnrSector[]): string[] {
  return sectors
    .map(s => {
      const code  = [(s.airlineCode || ''), (s.flightNo || '')].join('').trim()
      const route = [s.depAirportCode, s.arrAirportCode].filter(Boolean).join('–')
      return [code, route].filter(Boolean).join(' ')
    })
    .filter(Boolean)
}

// ─── Day-of-week helper ───────────────────────────────────────────────────────

const DOW_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
function getDayLabel(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr + 'T12:00:00')
    if (isNaN(d.getTime())) return '—'
    return DOW_LABELS[d.getDay()]
  } catch { return '—' }
}

function calcSectorDepDate(travelStart: string, dayOffset: number): string {
  if (!travelStart) return ''
  try {
    return fnsFormat(addDays(parseISO(travelStart), dayOffset - 1), 'yyyy-MM-dd')
  } catch { return '' }
}

// ─── Label helper ─────────────────────────────────────────────────────────────

function FL({ label, children, className, required }: { label: string; children: React.ReactNode; className?: string; required?: boolean }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-slate-700">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

const iCls = [
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900',
  'outline-none transition placeholder:text-slate-400',
  'hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15',
  'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
].join(' ')

// Compact inline input for TTL inline-sentence layout
const ttlInlineCls = [
  'h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900',
  'outline-none transition placeholder:text-slate-400',
  'hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15',
].join(' ')

// ─── Main Component ───────────────────────────────────────────────────────────

export function BulkPnrBuilder({
  open, onClose, mode,
  sectors: sectorsProp, flightSets, conditions, currency,
  onConfirm, stock, onSaved,
  defaultSeatTotal, defaultPriceFormat,
}: BulkPnrBuilderProps) {

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const [step,    setStep]    = useState<'form' | 'preview'>('form')
  const [method,  setMethod]  = useState<CreationMethod>('count')
  const [shared,  setShared]  = useState<SharedCfg>(INIT_SHARED)
  const [countCfg, setCountCfg] = useState<CountCfg>(INIT_COUNT)
  const [wdCfg,   setWdCfg]  = useState<WdCfg>(INIT_WD)
  const [calItems, setCalItems] = useState<CalItem[]>([])

  const [rows,    setRows]    = useState<InternalRow[]>([])
  const [saving,  setSaving]  = useState(false)
  const [formErr, setFormErr] = useState('')
  const [condTtlConfirm, setCondTtlConfirm] = useState<{
    pendingCode: string; condName: string; currentIso: string | null; candidateIso: string | null
  } | null>(null)
  const [fsChangeConfirm, setFsChangeConfirm] = useState<{ toFsId: string } | null>(null)

  // Bulk toolbar
  const [bSeat, setBSeat]   = useState('')
  const [bCond, setBCond]   = useState('')

  // (Preview table UI state is now internal to PNRSeatsTable)

  // Pre-fill defaults from initialConfig when modal opens
  useEffect(() => {
    if (!open) return
    if (defaultSeatTotal !== undefined || defaultPriceFormat !== undefined) {
      setShared(s => ({
        ...s,
        seatTotal:   defaultSeatTotal   !== undefined ? defaultSeatTotal   : s.seatTotal,
        priceFormat: defaultPriceFormat !== undefined ? defaultPriceFormat : s.priceFormat,
      }))
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select FS when modal opens — only when exactly 1 FS (multiple FS: user must choose)
  useEffect(() => {
    if (!open || !flightSets?.length) return
    if (flightSets.length === 1) {
      setShared(s => ({ ...s, flightSetId: flightSets[0].flightSetId }))
    }
  }, [open, flightSets]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed ──────────────────────────────────────────────────────────────

  const effectiveSectors = useMemo(() => {
    if (flightSets?.length) {
      return flightSets.find(fs => fs.flightSetId === shared.flightSetId)?.sectors ?? []
    }
    return sectorsProp ?? []
  }, [flightSets, sectorsProp, shared.flightSetId])

  const travelDays = useMemo(() => {
    if (!effectiveSectors.length) return 1
    const returns = effectiveSectors.filter(s => s.sectorType === 'Arrival')
    const target  = returns.length ? returns[returns.length - 1] : effectiveSectors[effectiveSectors.length - 1]
    return target.dayOffset
  }, [effectiveSectors])

  const sharedFare  = Number(shared.fare)  || 0
  const sharedYq    = Number(shared.yq)    || 0
  const sharedTax   = Number(shared.tax)   || 0
  const sharedAllIn = Number(shared.allIn) || 0
  const displayFare = shared.priceFormat === 'ALL_IN' ? sharedAllIn : sharedFare
  const computedTotal =
    shared.priceFormat === 'FARE'    ? sharedFare + sharedYq + sharedTax :
    shared.priceFormat === 'FARE_YQ' ? sharedFare + sharedTax :
    sharedAllIn
  const breakdownMismatch = shared.priceFormat === 'ALL_IN' && shared.breakdown
    ? Math.round(sharedFare * 100) + Math.round(sharedYq * 100) + Math.round(sharedTax * 100) !== Math.round(sharedAllIn * 100)
    : false

  const allSelected = rows.length > 0 && rows.every(r => r.selected)
  const numSelected = rows.filter(r => r.selected).length
  const hasErrors   = rows.some(r => r.errors.length > 0)

  // Count of dates for weekday method
  const wdDateCount = useMemo(() => {
    if (method !== 'weekday' || !wdCfg.startDate || !wdCfg.endDate || !wdCfg.weekdays.size) return 0
    try {
      const all = eachDayOfInterval({ start: parseISO(wdCfg.startDate), end: parseISO(wdCfg.endDate) })
      return all.filter(d => wdCfg.weekdays.has(getDay(d))).length
    } catch { return 0 }
  }, [method, wdCfg])

  const hasSummaryData = shared.seatTotal > 0 || computedTotal > 0

  const hasAnyFormData = !!(
    countCfg.startDate || wdCfg.startDate || calItems.length ||
    Number(shared.fare) > 0 || Number(shared.yq) > 0 ||
    Number(shared.tax) > 0 || Number(shared.allIn) > 0
  )

  // First travel date — used for TTL preview text
  const firstTravelDate = useMemo(() => {
    if (method === 'count' && countCfg.startDate) return countCfg.startDate
    if (method === 'weekday' && wdCfg.startDate && wdCfg.endDate && wdCfg.weekdays.size) {
      try {
        const all = eachDayOfInterval({ start: parseISO(wdCfg.startDate), end: parseISO(wdCfg.endDate) })
        const first = all.find(d => wdCfg.weekdays.has(getDay(d)))
        return first ? fnsFormat(first, 'yyyy-MM-dd') : ''
      } catch { return '' }
    }
    if (method === 'calendar' && calItems.length) {
      return [...calItems].sort((a, b) => a.date.localeCompare(b.date))[0].date
    }
    return ''
  }, [method, countCfg.startDate, wdCfg, calItems])

  const previewTtlDate = useMemo(() => {
    if (shared.ttlType === 'DAYS_BEFORE' && firstTravelDate && shared.ttlDaysBefore !== '') {
      const d = parseInt(shared.ttlDaysBefore, 10)
      if (!isNaN(d) && d >= 0) return calcTtlDateFromTravelAdjusted(firstTravelDate, d, getActiveHolidays()).date
    }
    if (shared.ttlType === 'FIXED_DATE' && shared.ttlDate) return adjustDateForHolidays(shared.ttlDate, getActiveHolidays()).adjustedDate
    return null
  }, [shared.ttlType, shared.ttlDaysBefore, shared.ttlDate, firstTravelDate])

  const hasDateInput =
    method === 'count'   ? !!countCfg.startDate :
    method === 'weekday' ? (!!wdCfg.startDate && !!wdCfg.endDate && wdCfg.weekdays.size > 0) :
    calItems.length > 0

  // FS requirement: when FS field is shown (add_to_existing OR flightSets provided), a FS must be selected
  const fsFieldShown = mode === 'add_to_existing' || !!flightSets?.length
  const fsOk         = !fsFieldShown || !flightSets?.length || !!shared.flightSetId
  const canPreview   = hasDateInput && shared.seatTotal > 0 && fsOk

  const resolveSharedTtlIso = (): string | null => {
    if (shared.ttlType === 'FIXED_DATE' && shared.ttlDate) {
      const adj = adjustDateForHolidays(shared.ttlDate, getActiveHolidays())
      return `${adj.adjustedDate}T${shared.ttlTime || '00:00'}:00`
    }
    if (shared.ttlType === 'DAYS_BEFORE' && shared.ttlDaysBefore && firstTravelDate) {
      const n = parseInt(shared.ttlDaysBefore, 10)
      if (!isNaN(n) && n >= 0) {
        const { date } = calcTtlDateFromTravelAdjusted(firstTravelDate, n, getActiveHolidays())
        return date ? `${date}T${shared.ttlTime || '00:00'}:00` : null
      }
    }
    return null
  }

  const resolveCondTtlIso = (cond?: BulkPnrCondition): string | null => {
    if (!cond?.ttlRule) return null
    const { calcType, daysBefore, date, time } = cond.ttlRule
    if (calcType === 'MANUAL_DATE' && date) {
      const adj = adjustDateForHolidays(date, getActiveHolidays())
      return `${adj.adjustedDate}T${time || '00:00'}:00`
    }
    if (calcType === 'TRAVEL_MINUS_DAYS' && daysBefore != null && firstTravelDate) {
      const { date: d } = calcTtlDateFromTravelAdjusted(firstTravelDate, daysBefore, getActiveHolidays())
      return d ? `${d}T${time || '00:00'}:00` : null
    }
    return null
  }

  const applyConditionCode = (code: string, cond?: BulkPnrCondition) => {
    const patch: Partial<SharedCfg> = { conditionCode: code, ttlUserModified: false }
    if (!code) {
      patch.ttlType = 'NONE'; patch.ttlDaysBefore = ''; patch.ttlDate = ''; patch.ttlTime = ''
    } else if (cond?.ttlRule) {
      const { calcType, daysBefore, date, time } = cond.ttlRule
      if (calcType === 'TRAVEL_MINUS_DAYS') {
        patch.ttlType = 'DAYS_BEFORE'; patch.ttlDaysBefore = String(daysBefore ?? 0); patch.ttlTime = time || ''
      } else if (calcType === 'MANUAL_DATE') {
        patch.ttlType = 'FIXED_DATE'; patch.ttlDate = date || ''; patch.ttlTime = time || ''
      } else {
        patch.ttlType = 'NONE'; patch.ttlDaysBefore = ''; patch.ttlDate = ''; patch.ttlTime = ''
      }
    }
    setShared(s => ({ ...s, ...patch }))
    setCondTtlConfirm(null)
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  const resetAll = () => {
    setStep('form'); setMethod('count')
    setShared({ ...INIT_SHARED, flightSetId: '' })
    setCountCfg(INIT_COUNT); setWdCfg(INIT_WD); setCalItems([])
    setRows([]); setSaving(false); setFormErr(''); setCondTtlConfirm(null)
  }

  const handleClose = () => { resetAll(); onClose() }

  // ── Row operations ────────────────────────────────────────────────────────

  const toggleRow = (id: string) =>
    setRows(prev => prev.map(r => r.rowId === id ? { ...r, selected: !r.selected } : r))
  const toggleAll = () => setRows(prev => prev.map(r => ({ ...r, selected: !allSelected })))
  const deleteRow = (id: string) => setRows(prev => prev.filter(r => r.rowId !== id).map((r, i) => ({ ...r, seq: i + 1 })))
  const deleteSelected = () => setRows(prev => prev.filter(r => !r.selected).map((r, i) => ({ ...r, seq: i + 1 })))

  const updateRow = (id: string, patch: Partial<InternalRow>) => {
    setRows(prev => prev.map(r => {
      if (r.rowId !== id) return r
      const m = { ...r, ...patch }
      // Recompute total
      const f  = typeof patch.fare    !== 'undefined' ? patch.fare : r.fare
      const tx = typeof patch.tax     !== 'undefined' ? patch.tax  : r.tax
      const tt = typeof patch.taxType !== 'undefined' ? patch.taxType : r.taxType
      m.total  = f + (tt === 'separate' ? tx : 0)
      // Recompute travelEnd + payment due when travelStart changes
      if (patch.travelStart) {
        m.travelEnd = calcTravelEndFromFlightSet(m.travelStart, effectiveSectors)
        const cond = conditions.find(c => c.code === m.conditionCode)
        m.paymentDueDate = calcPaymentDue(m.travelStart, m.travelEnd, cond)
      }
      // Recompute payment due when condition changes
      if (patch.conditionCode) {
        const cond = conditions.find(c => c.code === m.conditionCode)
        m.paymentDueDate = calcPaymentDue(m.travelStart, m.travelEnd, cond)
      }
      return m
    }))
  }

  const applyBulk = (field: 'seat' | 'cond') => {
    setRows(prev => prev.map(r => {
      if (!r.selected) return r
      let m = { ...r }
      if (field === 'seat')   { m.seatTotal = Math.max(1, Number(bSeat) || r.seatTotal) }
      if (field === 'cond') {
        m.conditionCode = bCond
        const cond = conditions.find(c => c.code === bCond)
        m.paymentDueDate = calcPaymentDue(m.travelStart, m.travelEnd, cond)
      }
      return m
    }))
  }

  // ── Preview adapters ─────────────────────────────────────────────────────

  const scheduleTemplateForPreview = useMemo((): ScheduleTemplate => ({
    scheduleId:   'bulk-preview',
    scheduleName: 'Preview',
    isMain:       true,
    sectors:      effectiveSectors.map(s => ({
      sectorType:     s.sectorType,
      dayOffset:      s.dayOffset,
      arrDayOffset:   s.arrDayOffset ?? 0,
      depAirportCode: s.depAirportCode ?? '',
      arrAirportCode: s.arrAirportCode ?? '',
      depTime:        s.depTime ?? '',
      arrTime:        s.arrTime ?? '',
    })),
  }), [effectiveSectors])

  const conditionsForPreview = useMemo(() =>
    conditions.map(c => ({ conditionId: c.code, conditionName: c.name }))
  , [conditions])

  const previewRecords = useMemo((): PNRRecord[] =>
    rows.map(row => {
      const sectors: PNRSectorRecord[] = effectiveSectors.map(s => {
        const depDate = calcSectorDepDate(row.travelStart, s.dayOffset)
        const arrDayOff = s.arrDayOffset ?? 0
        let arrDate = depDate
        if (depDate) {
          try { arrDate = fnsFormat(addDays(parseISO(depDate), arrDayOff), 'yyyy-MM-dd') } catch { arrDate = depDate }
        }
        return {
          sectorType:     s.sectorType,
          dayOffset:      s.dayOffset,
          arrDayOffset:   arrDayOff,
          depAirportCode: s.depAirportCode ?? '',
          arrAirportCode: s.arrAirportCode ?? '',
          depDate,
          depTime:        s.depTime ?? '',
          arrDate:        arrDate ?? '',
          arrTime:        s.arrTime ?? '',
          depManual:      false,
          arrManual:      false,
          timeOverride:   false,
          tmplDepTime:    s.depTime ?? '',
          tmplArrTime:    s.arrTime ?? '',
        }
      })
      return {
        rowId:           row.rowId,
        seq:             row.seq,
        pnrCode:         row.pnrCode,
        dummyPnr:        row.dummyPnr,
        activeScheduleId: 'bulk-preview',
        seatTotal:       row.seatTotal,
        priceFormat:     row.priceFormat,
        fare:            row.priceFormat === 'ALL_IN' ? 0 : row.fare,
        allInAmount:     row.priceFormat === 'ALL_IN' ? (row.total || null) : null,
        yq:              row.yq,
        tax:             row.tax,
        taxType:         row.taxType,
        totalAmount:     row.total,
        currency,
        conditionId:     row.conditionCode,
        remark:          row.remark,
        ttlType:         row.ttlType,
        ttlDate:         row.ttlDate,
        ttlTime:         row.ttlTime,
        ttlDaysBefore:   row.ttlDaysBefore,
        sectors,
        selected:        row.selected,
        errors:          row.errors,
      }
    })
  , [rows, effectiveSectors, currency]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePreviewTableChange = (newRecords: PNRRecord[]) => {
    setRows(prev => {
      const recMap = new Map(newRecords.map(r => [r.rowId, r]))
      return prev.map(row => {
        const rec = recMap.get(row.rowId)
        if (!rec) return row
        const travelStart = rec.sectors[0]?.depDate || row.travelStart
        const travelEnd   = rec.sectors[rec.sectors.length - 1]?.arrDate || row.travelEnd
        const cond = conditions.find(c => c.code === rec.conditionId)
        return {
          ...row,
          pnrCode:       rec.pnrCode,
          seatTotal:     rec.seatTotal,
          priceFormat:   rec.priceFormat,
          fare:          rec.fare,
          yq:            rec.yq ?? 0,
          taxType:       rec.taxType,
          tax:           rec.tax ?? 0,
          total:         rec.totalAmount,
          conditionCode: rec.conditionId,
          remark:        rec.remark,
          ttlType:       rec.ttlType,
          ttlDate:       rec.ttlDate,
          ttlTime:       rec.ttlTime,
          ttlDaysBefore: rec.ttlDaysBefore,
          travelStart,
          travelEnd,
          selected:      rec.selected ?? row.selected,
          paymentDueDate: calcPaymentDue(travelStart, travelEnd, cond),
        }
      })
    })
  }

  const handlePreviewToggleSelect = (rowId: string) => toggleRow(rowId)
  const handlePreviewToggleAll    = () => toggleAll()

  // ── Go to preview ─────────────────────────────────────────────────────────

  const handlePreview = () => {
    setFormErr('')

    // Seat validation
    if (shared.seatTotal <= 0) { setFormErr('กรุณาระบุจำนวนที่นั่ง / PNR มากกว่า 0'); return }

    // Date validation per method
    if (method === 'count') {
      if (!countCfg.startDate) { setFormErr('กรุณาเลือกวันเดินทางเริ่มต้น'); return }
      if (countCfg.count <= 0) { setFormErr('จำนวน PNR ต้องมากกว่า 0'); return }
      if (countCfg.intervalDays <= 0) { setFormErr('ระยะห่างระหว่างรอบต้องมากกว่า 0'); return }
    }
    if (method === 'weekday') {
      if (!wdCfg.startDate || !wdCfg.endDate) { setFormErr('กรุณาระบุช่วงวันที่เริ่มต้น – สิ้นสุด'); return }
      if (!wdCfg.weekdays.size) { setFormErr('กรุณาเลือกวันประจำสัปดาห์อย่างน้อย 1 วัน'); return }
    }
    if (method === 'calendar' && !calItems.length) { setFormErr('กรุณาเลือกวันเดินทางบนปฏิทินอย่างน้อย 1 วัน'); return }

    // Flight Set validation (only when flightSets mode)
    if (flightSets?.length) {
      if (!shared.flightSetId) { setFormErr('กรุณาเลือก Flight Set'); return }
      const selFs = flightSets.find(fs => fs.flightSetId === shared.flightSetId)
      if (!selFs) { setFormErr('ไม่พบ Flight Set ที่เลือก'); return }
      if (!selFs.sectors.length) { setFormErr('Flight Set ที่เลือกไม่มี Sector — กรุณาเลือก Flight Set อื่น'); return }
      const first = selFs.sectors[0]
      const last  = selFs.sectors[selFs.sectors.length - 1]
      if (first.sectorType !== 'Departure') { setFormErr('Sector แรกของ Flight Set ต้องเป็น Departure'); return }
      if (last.sectorType !== 'Arrival' && last.sectorType !== 'Departure') { setFormErr('Sector สุดท้ายของ Flight Set ต้องเป็น Return'); return }
    }

    // Price validation
    if (computedTotal <= 0) { setFormErr('กรุณาระบุราคา / ยอดสุทธิมากกว่า 0'); return }
    if (breakdownMismatch)  { setFormErr('Fare + YQ + Tax ไม่เท่ากับ All In / Total'); return }

    // TTL validation
    if (shared.ttlType === 'DAYS_BEFORE') {
      const d = parseInt(shared.ttlDaysBefore, 10)
      if (shared.ttlDaysBefore === '' || isNaN(d)) { setFormErr('กรุณาระบุจำนวนวันก่อนเดินทาง'); return }
      if (d < 0) { setFormErr('จำนวนวันก่อนเดินทางต้องไม่ติดลบ'); return }
    }
    if (shared.ttlType === 'FIXED_DATE' && !shared.ttlDate) {
      setFormErr('กรุณาเลือกวันที่กำหนดส่ง NAME DL'); return
    }

    const calDates = [...calItems].sort((a, b) => a.date.localeCompare(b.date)).map(it => it.date)
    const generated = buildInternalRows(method, shared, countCfg, wdCfg, calDates, effectiveSectors, conditions, stock)
    if (!generated.length) {
      setFormErr('ไม่สามารถสร้าง PNR ได้ — กรุณาตรวจสอบข้อมูลที่กรอก')
      return
    }
    if (generated.length > 60) {
      setFormErr(`สร้างได้สูงสุด 60 PNR ต่อครั้ง (ปัจจุบัน: ${generated.length})`)
      return
    }
    const validated = validateInternalRows(generated, mode, stock)
    setRows(validated)
    setStep('preview')
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = () => {
    const revalidated = validateInternalRows(rows, mode, stock)
    setRows(revalidated)
    if (revalidated.some(r => r.errors.length > 0)) return
    setSaving(true)
    const now = new Date().toISOString()

    const outRows: BulkPnrRow[] = revalidated.map(r => ({
      travelStart:   r.travelStart,
      travelEnd:     r.travelEnd,
      seatTotal:     r.seatTotal,
      priceFormat:   r.priceFormat,
      fare:          r.fare,
      yq:            r.yq,
      breakdown:     r.breakdown,
      taxType:       r.taxType,
      tax:           r.tax,
      total:         r.total,
      conditionCode: r.conditionCode,
      status:        r.status,
      remark:        r.remark,
      isDummy:       !!r.dummyPnr,
      pnrCode:       r.pnrCode,
      dummyPnr:      r.dummyPnr,
      ttlType:       r.ttlType,
      ttlDaysBefore: r.ttlDaysBefore,
      ttlDate:       r.ttlDate,
      ttlTime:       r.ttlTime,
    }))

    if (mode === 'create_stock') {
      // Give React one frame to render the loading/disabled state before committing
      setTimeout(() => {
        onConfirm?.(outRows)
        handleClose()
      }, 0)
      return
    }

    // ADD_TO_EXISTING: persist to stock
    const methodLabel = method === 'count' ? 'เพิ่มตามจำนวน' : method === 'weekday' ? 'วันประจำสัปดาห์' : 'เลือกจากปฏิทิน'
    const newPnrs: DemoPNR[] = revalidated.map(r => {
      const ttlDate: string | null = r.ttlDate
      const ttlTime: string | null = r.ttlTime
      const ttlDateTime: string | null = (ttlDate && ttlTime) ? `${ttlDate}T${ttlTime}:00` : null
      return {
        pnrId:          newId('PNR'),
        pnrCode:        r.pnrCode.trim(),
        dummyPnr:       r.dummyPnr,
        pnrType:        r.dummyPnr ? 'dummy' : 'real',
        pnrDisplay:     r.dummyPnr || r.pnrCode.trim(),
        travelStart:    r.travelStart,
        travelEnd:      r.travelEnd,
        flightSetId:    shared.flightSetId || undefined,
        sectorDates:    effectiveSectors.map(s => ({
          sectorType: s.sectorType,
          date: (() => {
            try { return fnsFormat(addDays(parseISO(r.travelStart), s.dayOffset - 1), 'yyyy-MM-dd') } catch { return '' }
          })(),
        })),
        seatTotal:      r.seatTotal,
        seatUsed:       0,
        seatBalance:    r.seatTotal,
        priceFormat:    r.priceFormat,
        fare:           r.fare,
        yq:             r.yq,
        breakdown:      r.breakdown,
        taxType:        r.taxType,
        tax:            r.tax,
        fareIncludesTax: r.taxType === 'included',
        taxStatus:      r.taxType === 'included' ? 'included' : r.taxType === 'pending' ? 'pending' : 'completed',
        total:          r.total,
        conditionCode:       r.conditionCode,
        ttlType:             r.ttlType === 'NONE' ? null : r.ttlType,
        ttlDaysBefore:       r.ttlDaysBefore,
        ttlDate,
        ttlTime,
        ttlDateTime,
        ttlDateOriginal:        r.ttlDateOriginal,
        ttlHolidayAdjusted:     r.ttlHolidayAdjusted,
        ttlHolidayAdjustReason: r.ttlHolidayAdjustReason,
        status:              r.status,
        pnrStatus:           'PENDING' as const,
        confirmationStatus:  'PENDING_CONFIRMATION' as const,
        remark:              r.remark,
      } as DemoPNR
    })

    const pnrList = revalidated.map(r => r.dummyPnr || r.pnrCode).join(', ')
    const log: DemoLog = {
      logId:     newId('LOG'),
      action:    'เพิ่มหลาย PNR',
      message:   `เพิ่ม ${revalidated.length} PNR (${methodLabel}) | ${pnrList}`,
      createdAt: now,
      createdBy: 'System',
    }

    const updatedPnrs   = [...(stock?.pnrs ?? []), ...newPnrs]
    const updatedStock: DemoStock = {
      ...stock!,
      pnrs:      updatedPnrs,
      summary:   calculateStockSummary(updatedPnrs),
      updatedAt: now,
      logs:      [log, ...(stock?.logs ?? [])],
    }
    saveDemoStock(updatedStock)
    onSaved?.(updatedStock, revalidated.length)
    setSaving(false)
    resetAll()
  }

  // ── Derived PNR count for UI labels ──────────────────────────────────────
  const pnrCount =
    method === 'count'    ? countCfg.count :
    method === 'weekday'  ? wdDateCount :
    calItems.length

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={handleClose} />

      {/* ── Modal container ── */}
      <div className="relative z-10 flex w-[95vw] max-w-[1500px] max-h-[85vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* ══ HEADER ══════════════════════════════════════════════════════ */}
        <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              {step === 'form' ? 'เพิ่มหลาย PNR' : `ตรวจสอบรายการ — ${rows.length} PNR`}
            </h2>
            {step === 'preview' && (
              <button type="button" onClick={() => setStep('form')}
                className="text-xs text-slate-500 hover:text-slate-800 hover:underline underline-offset-2 transition-colors">
                ← แก้ไขข้อมูล
              </button>
            )}
          </div>
          <button type="button" onClick={handleClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
            <X size={16} />
          </button>
        </div>

        {/* ══ BODY ════════════════════════════════════════════════════════ */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">

          {/* ════ STEP: FORM ════════════════════════════════════════════ */}
          {step === 'form' && (
            <div>
              {/* ── Method Tabs (full-width, above the split) ── */}
              <div className="mb-5 grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {([
                  { key: 'count',    label: 'เพิ่มตามจำนวน' },
                  { key: 'weekday',  label: 'วันประจำสัปดาห์' },
                  { key: 'calendar', label: 'เลือกจากปฏิทิน' },
                ] as { key: CreationMethod; label: string }[]).map((t, i) => (
                  <button key={t.key} type="button" onClick={() => setMethod(t.key)}
                    className={cn(
                      'min-h-11 px-4 text-sm font-medium transition',
                      i < 2 && 'border-r border-slate-200',
                      method === t.key
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    )}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Two-column layout ── */}
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_480px] xl:items-start">

                {/* ── LEFT: กำหนดรอบการเดินทาง ── */}
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-slate-900">กำหนดรอบการเดินทาง</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {method === 'count'    && 'ระบุวันเริ่มต้น จำนวน PNR และระยะห่างระหว่างรอบ'}
                      {method === 'weekday'  && 'ระบุช่วงวันที่และเลือกวันของสัปดาห์ที่ต้องการ'}
                      {method === 'calendar' && 'คลิกวันที่บนปฏิทินเพื่อเพิ่มรอบเดินทาง'}
                    </p>
                  </div>

                  {/* ── Count method ── */}
                  {method === 'count' && (
                    <div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                        <FL label="วันเดินทางเริ่มต้น" required className="md:col-span-2 xl:col-span-1">
                          <input type="date" value={countCfg.startDate}
                            onChange={e => setCountCfg(c => ({ ...c, startDate: e.target.value }))}
                            className={iCls} />
                        </FL>
                        <FL label="จำนวน PNR" required>
                          <input type="number" min={1} max={60} value={countCfg.count}
                            onChange={e => setCountCfg(c => ({ ...c, count: Math.min(60, Math.max(1, Number(e.target.value))) }))}
                            className={cn(iCls, 'text-center')} />
                        </FL>
                        <FL label="ระยะห่างระหว่างรอบ (วัน)" required>
                          <input type="number" min={1} value={countCfg.intervalDays}
                            onChange={e => setCountCfg(c => ({ ...c, intervalDays: Math.max(1, Number(e.target.value)) }))}
                            className={cn(iCls, 'text-center')} />
                        </FL>
                      </div>

                      {/* Date preview */}
                      {countCfg.startDate && countCfg.count > 0 && (
                        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="mb-3 text-xs font-semibold text-slate-700">ตัวอย่างวันเดินทาง</p>
                          <div className="flex flex-wrap gap-2">
                            {Array.from({ length: Math.min(countCfg.count, 8) }).map((_, i) => {
                              try {
                                const s = addDays(parseISO(countCfg.startDate), i * countCfg.intervalDays)
                                const e = addDays(s, travelDays - 1)
                                return (
                                  <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
                                    <span className="font-semibold text-emerald-600">#{i + 1}</span>
                                    <span>{fnsFormat(s, 'dd MMM')} – {fnsFormat(e, 'dd MMM yy')}</span>
                                  </span>
                                )
                              } catch { return null }
                            })}
                            {countCfg.count > 8 && (
                              <span className="inline-flex items-center text-xs text-slate-400">+{countCfg.count - 8} รายการ</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Weekday method ── */}
                  {method === 'weekday' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
                        <FL label="วันที่เริ่มต้น" required>
                          <input type="date" value={wdCfg.startDate}
                            onChange={e => setWdCfg(c => ({ ...c, startDate: e.target.value }))}
                            className={iCls} />
                        </FL>
                        <FL label="วันที่สิ้นสุด" required>
                          <input type="date" value={wdCfg.endDate} min={wdCfg.startDate}
                            onChange={e => setWdCfg(c => ({ ...c, endDate: e.target.value }))}
                            className={iCls} />
                        </FL>
                      </div>
                      <FL label="วันที่เดินทาง" required>
                        <div className="flex gap-2 flex-wrap pt-0.5">
                          {DAY_ABBR.map((d, i) => (
                            <button key={i} type="button"
                              onClick={() => {
                                const next = new Set(wdCfg.weekdays)
                                next.has(i) ? next.delete(i) : next.add(i)
                                setWdCfg(c => ({ ...c, weekdays: next }))
                              }}
                              className={cn(
                                'h-10 w-10 rounded-full text-sm font-semibold transition border',
                                wdCfg.weekdays.has(i)
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                  : 'border-slate-300 text-slate-600 hover:border-emerald-500 hover:text-emerald-600'
                              )}>
                              {d}
                            </button>
                          ))}
                        </div>
                      </FL>
                      {wdDateCount > 0 && (
                        <p className="text-sm font-medium text-emerald-600">จะสร้าง {wdDateCount} PNR</p>
                      )}
                    </div>
                  )}

                  {/* ── Calendar method ── */}
                  {method === 'calendar' && (
                    <div className="space-y-4">
                      <MultiDateCalendar
                        items={calItems}
                        onAdd={date => setCalItems(prev => [
                          ...prev,
                          { id: `${date}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, date },
                        ])}
                        onRemove={id => setCalItems(prev => prev.filter(it => it.id !== id))}
                      />
                    </div>
                  )}

                  {/* Form error */}
                  {formErr && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-600">
                      <AlertTriangle size={13} className="shrink-0" /> {formErr}
                    </div>
                  )}
                </div>

                {/* ── RIGHT: ข้อมูลร่วมของทุก PNR ── */}
                <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                  {/* Card header — compact */}
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">ข้อมูลร่วม</h3>
                        {pnrCount > 0 && (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            {pnrCount} PNR
                          </span>
                        )}
                      </div>
                      {hasSummaryData ? (
                        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                          {shared.seatTotal} ที่นั่ง
                          {' · '}
                          <span className={`font-semibold px-1.5 py-0.5 rounded-full text-[10px] ${
                            shared.priceFormat === 'FARE' ? 'bg-slate-100 text-slate-600' :
                            shared.priceFormat === 'FARE_YQ' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {shared.priceFormat === 'FARE' ? 'FARE' : shared.priceFormat === 'FARE_YQ' ? 'FARE+YQ' : 'ALL IN'}
                          </span>
                          {displayFare > 0 && ` · ${displayFare.toLocaleString('en-US')}`}
                          {travelDays > 1 && ` · ${travelDays} วัน`}
                          {computedTotal > 0 && (
                            <span className="font-semibold text-emerald-700"> · ยอดสุทธิ {computedTotal.toLocaleString('en-US')} {currency}</span>
                          )}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-slate-400 italic">รอกรอกข้อมูลที่นั่ง / ราคา</p>
                      )}
                    </div>
                  </div>

                  {/* Fields — compact 2-col grid */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-3">

                    {/* Row 0: Flight Set — always visible when FS data available OR in add_to_existing mode */}
                    {(mode === 'add_to_existing' || !!flightSets?.length) && (() => {
                      const hasFs  = !!flightSets?.length
                      const selFs  = hasFs ? flightSets!.find(f => f.flightSetId === shared.flightSetId) : undefined
                      const route  = selFs ? buildFsRoute(selFs.sectors) : ''
                      const flightSummary = selFs ? buildFsFlightSummary(selFs.sectors) : []

                      return (
                        <div className="col-span-2 space-y-2">
                          <label className="block text-xs font-medium text-slate-700">
                            Flight Set<span className="ml-0.5 text-red-500">*</span>
                          </label>

                          {/* No FS available */}
                          {!hasFs && (
                            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                              <span className="text-xs text-red-600 font-medium">
                                ยังไม่มี Flight Set กรุณาสร้าง Flight Set ก่อนเพิ่ม PNR
                              </span>
                            </div>
                          )}

                          {/* Single FS: read-only */}
                          {hasFs && flightSets!.length === 1 && (
                            <div className={cn(iCls, 'flex items-center gap-2 bg-slate-50 cursor-default select-none')}>
                              <span className="font-medium text-slate-800 truncate flex-1">{flightSets![0].flightSetName}</span>
                              <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{travelDays} วัน</span>
                              <span className="shrink-0 text-[10px] text-slate-400">อ่านอย่างเดียว</span>
                            </div>
                          )}

                          {/* Multiple FS: dropdown */}
                          {hasFs && flightSets!.length > 1 && (
                            <>
                              <select
                                value={shared.flightSetId}
                                onChange={e => {
                                  const toFsId = e.target.value
                                  if (hasAnyFormData && toFsId && toFsId !== shared.flightSetId) {
                                    setFsChangeConfirm({ toFsId })
                                  } else {
                                    setShared(s => ({ ...s, flightSetId: toFsId }))
                                  }
                                }}
                                className={cn(iCls, !shared.flightSetId ? 'border-amber-400 ring-1 ring-amber-300' : '')}>
                                <option value="">— เลือก Flight Set —</option>
                                {flightSets!.map(fs => (
                                  <option key={fs.flightSetId} value={fs.flightSetId}>
                                    {buildFsLabel(fs)}
                                  </option>
                                ))}
                              </select>
                              {!shared.flightSetId && (
                                <p className="text-[10px] text-amber-600">กรุณาเลือก Flight Set ก่อนดำเนินการ</p>
                              )}
                            </>
                          )}

                          {/* FS summary detail card */}
                          {selFs && (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
                              {/* Header chips */}
                              <div className="flex flex-wrap gap-1.5">
                                {route && (
                                  <span className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{route}</span>
                                )}
                                <span className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">{selFs.sectors.length} Sectors</span>
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{travelDays} วัน</span>
                              </div>
                              {/* Per-sector rows */}
                              {selFs.sectors.map((s, i) => {
                                const flightCode = [(s.airlineCode || ''), (s.flightNo || '')].join('').trim()
                                const sRoute = [s.depAirportCode, s.arrAirportCode].filter(Boolean).join('→')
                                const plusDay = (s.arrDayOffset ?? 0) > 0 ? `+${s.arrDayOffset}` : ''
                                return (
                                  <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-600 border-t border-slate-200 pt-1.5">
                                    <span className="font-semibold text-slate-500 w-3">{i + 1}.</span>
                                    <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${s.sectorType === 'Departure' ? 'bg-blue-100 text-blue-700' : s.sectorType === 'Arrival' ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'}`}>
                                      {s.sectorType === 'Arrival' ? 'Return' : s.sectorType}
                                    </span>
                                    {flightCode && <span className="font-semibold text-slate-800">{flightCode}</span>}
                                    {sRoute && <span>{sRoute}</span>}
                                    {s.depTime && <span className="text-slate-500">{s.depTime}{s.arrTime ? ` → ${s.arrTime}` : ''}{plusDay && <span className="ml-0.5 text-amber-600 font-medium">{plusDay}</span>}</span>}
                                    <span className="text-slate-400">Day {s.dayOffset}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Row 1: Seat | ระยะเวลาเดินทาง */}
                    <FL label="ที่นั่ง / PNR" required>
                      <input type="number" min={1} value={shared.seatTotal}
                        onChange={e => setShared(s => ({ ...s, seatTotal: Math.max(1, Number(e.target.value) || 1) }))}
                        className={cn(iCls, 'text-center font-semibold')} />
                    </FL>
                    <FL label="ระยะเวลาเดินทาง">
                      <div className={cn(iCls, 'flex items-center text-slate-600 bg-slate-50 cursor-default select-none gap-1.5')}>
                        <span>{travelDays} วัน</span>
                        {effectiveSectors.length > 0 && (
                          <span className="text-[10px] text-slate-400">({effectiveSectors.length} Sectors)</span>
                        )}
                      </div>
                    </FL>

                    {/* Price Format Section */}
                    <div className="col-span-2 space-y-3">
                      <FL label="รูปแบบราคาที่ได้รับ" required>
                        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200">
                          {(['FARE', 'FARE_YQ', 'ALL_IN'] as const).map((fmt, i) => (
                            <button key={fmt} type="button"
                              onClick={() => setShared(s => ({ ...s, priceFormat: fmt, fare: '', yq: '', allIn: '', tax: '', breakdown: false }))}
                              className={cn(
                                'h-9 text-xs font-medium transition',
                                i < 2 && 'border-r border-slate-200',
                                shared.priceFormat === fmt
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-slate-600 hover:bg-slate-50'
                              )}>
                              {fmt === 'FARE' ? 'FARE' : fmt === 'FARE_YQ' ? 'FARE + YQ' : 'ALL IN'}
                            </button>
                          ))}
                        </div>
                      </FL>

                      {shared.priceFormat === 'FARE' && (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                          <FL label={`Fare (${currency})`} required>
                            <input type="number" min={0} placeholder="0" value={shared.fare}
                              onChange={e => setShared(s => ({ ...s, fare: e.target.value }))}
                              className={cn(iCls, 'text-right')} />
                          </FL>
                          <FL label={`YQ (${currency})`}>
                            <input type="number" min={0} placeholder="0" value={shared.yq}
                              onChange={e => setShared(s => ({ ...s, yq: e.target.value }))}
                              className={cn(iCls, 'text-right')} />
                          </FL>
                          <FL label={`Tax (${currency})`}>
                            <input type="number" min={0} placeholder="0" value={shared.tax}
                              onChange={e => setShared(s => ({ ...s, tax: e.target.value }))}
                              className={cn(iCls, 'text-right')} />
                          </FL>
                          <FL label={`ยอดสุทธิ (${currency})`}>
                            <div className={cn(iCls, 'flex items-center justify-end font-bold text-emerald-700 bg-emerald-50 border-emerald-200 cursor-default select-none')}>
                              {computedTotal > 0 ? computedTotal.toLocaleString('en-US') : '—'}
                            </div>
                          </FL>
                        </div>
                      )}

                      {shared.priceFormat === 'FARE_YQ' && (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                          <FL label={`Fare + YQ (${currency})`} required>
                            <input type="number" min={0} placeholder="0" value={shared.fare}
                              onChange={e => setShared(s => ({ ...s, fare: e.target.value }))}
                              className={cn(iCls, 'text-right')} />
                          </FL>
                          <FL label={`Tax (${currency})`}>
                            <input type="number" min={0} placeholder="0" value={shared.tax}
                              onChange={e => setShared(s => ({ ...s, tax: e.target.value }))}
                              className={cn(iCls, 'text-right')} />
                          </FL>
                          <FL label={`ยอดสุทธิ (${currency})`} className="col-span-2">
                            <div className={cn(iCls, 'flex items-center justify-end font-bold text-emerald-700 bg-emerald-50 border-emerald-200 cursor-default select-none')}>
                              {computedTotal > 0 ? computedTotal.toLocaleString('en-US') : '—'}
                            </div>
                          </FL>
                        </div>
                      )}

                      {shared.priceFormat === 'ALL_IN' && (
                        <div className="space-y-2">
                          <FL label={`All In / Total (${currency})`} required>
                            <input type="number" min={0} placeholder="0" value={shared.allIn}
                              onChange={e => setShared(s => ({ ...s, allIn: e.target.value }))}
                              className={cn(iCls, 'text-right font-bold')} />
                          </FL>
                          {!shared.breakdown ? (
                            <button type="button"
                              onClick={() => setShared(s => ({ ...s, breakdown: true }))}
                              className="text-xs text-[#05a94f] hover:text-[#048a40] hover:underline transition-colors">
                              + เพิ่มรายละเอียด Fare / YQ / Tax
                            </button>
                          ) : (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-[11px] font-semibold text-slate-600">รายละเอียด Fare / YQ / Tax</p>
                                <button type="button"
                                  onClick={() => setShared(s => ({ ...s, breakdown: false, fare: '', yq: '', tax: '' }))}
                                  className="text-[10px] text-slate-400 hover:text-red-500 transition-colors">
                                  ✕ ยกเลิก
                                </button>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <FL label={`Fare`}>
                                  <input type="number" min={0} placeholder="0" value={shared.fare}
                                    onChange={e => setShared(s => ({ ...s, fare: e.target.value }))}
                                    className={cn(iCls, 'text-right text-xs h-9')} />
                                </FL>
                                <FL label={`YQ`}>
                                  <input type="number" min={0} placeholder="0" value={shared.yq}
                                    onChange={e => setShared(s => ({ ...s, yq: e.target.value }))}
                                    className={cn(iCls, 'text-right text-xs h-9')} />
                                </FL>
                                <FL label={`Tax`}>
                                  <input type="number" min={0} placeholder="0" value={shared.tax}
                                    onChange={e => setShared(s => ({ ...s, tax: e.target.value }))}
                                    className={cn(iCls, 'text-right text-xs h-9')} />
                                </FL>
                              </div>
                              {(() => {
                                const detailSum = (Number(shared.fare)||0) + (Number(shared.yq)||0) + (Number(shared.tax)||0)
                                const allInTotal = Number(shared.allIn) || 0
                                const centDiff = Math.round(allInTotal*100) - Math.round((Number(shared.fare)||0)*100) - Math.round((Number(shared.yq)||0)*100) - Math.round((Number(shared.tax)||0)*100)
                                return (
                                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                                    <span className="text-slate-500">รวมจากรายละเอียด: <strong>{detailSum.toLocaleString('en-US')}</strong></span>
                                    <span className={cn('font-semibold', centDiff === 0 ? 'text-emerald-600' : 'text-red-500')}>
                                      ส่วนต่าง: {centDiff === 0 ? '0' : (allInTotal - detailSum).toLocaleString('en-US')}{centDiff !== 0 && ' ⚠'}
                                    </span>
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Condition */}
                    <FL label="Condition" className="col-span-2">
                      <select value={shared.conditionCode}
                        onChange={e => {
                          const newCode = e.target.value
                          const cond = conditions.find(c => c.code === newCode)
                          if (shared.ttlUserModified && shared.ttlType !== 'NONE') {
                            const currentIso = resolveSharedTtlIso()
                            const candidateIso = resolveCondTtlIso(cond)
                            if (candidateIso && candidateIso !== currentIso) {
                              setCondTtlConfirm({ pendingCode: newCode, condName: cond?.name ?? newCode, currentIso, candidateIso })
                              return
                            }
                          }
                          applyConditionCode(newCode, cond)
                        }}
                        className={iCls}>
                        <option value="">ไม่ระบุ</option>
                        {conditions.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </select>
                    </FL>

                    {/* Row 4: TTL — full width */}
                    <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
                      {/* Type selector */}
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-slate-700">NAME DL (Deadline)</label>
                        <select
                          value={shared.ttlType}
                          onChange={e => {
                            const t = e.target.value as 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE'
                            setShared(s => ({
                              ...s, ttlType: t, ttlUserModified: true,
                              ttlDaysBefore: t === 'NONE' ? '' : s.ttlDaysBefore,
                              ttlDate: t === 'NONE' || t === 'DAYS_BEFORE' ? '' : s.ttlDate,
                              ttlTime: t === 'NONE' ? '' : s.ttlTime,
                            }))
                          }}
                          className={iCls}>
                          <option value="NONE">ไม่ระบุ</option>
                          <option value="DAYS_BEFORE">ก่อนวันเดินทาง</option>
                          <option value="FIXED_DATE">วันที่กำหนดเอง</option>
                        </select>
                      </div>

                      {/* NONE helper */}
                      {shared.ttlType === 'NONE' && (
                        <p className="text-xs text-slate-400">PNR รายการนี้จะไม่มีการกำหนดวันส่ง NAME</p>
                      )}

                      {/* DAYS_BEFORE — inline sentence */}
                      {shared.ttlType === 'DAYS_BEFORE' && (
                        <div className="space-y-1.5">
                          {/*
                            Mobile/lg: flex-wrap — day group and time group each stay together.
                            xl+: CSS Grid 5-col — sub-groups become display:contents so each
                            child element is a direct grid item, giving exact column widths.
                          */}
                          <div className="flex flex-wrap items-center gap-2 min-w-0 w-full xl:grid xl:grid-cols-[max-content_72px_max-content_max-content_112px]">
                            <div className="flex items-center gap-2 shrink-0 xl:contents">
                              <span className="text-xs text-slate-600 whitespace-nowrap">กำหนดส่งก่อนวันเดินทาง</span>
                              <input
                                type="number" min={0} placeholder="30"
                                value={shared.ttlDaysBefore}
                                onChange={e => setShared(s => ({ ...s, ttlDaysBefore: e.target.value, ttlUserModified: true }))}
                                aria-label="จำนวนวันก่อนเดินทาง"
                                className={cn(ttlInlineCls, 'w-[72px] min-w-0 text-center')} />
                              <span className="text-xs text-slate-600 whitespace-nowrap">วัน</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 xl:contents">
                              <span className="text-xs text-slate-600 whitespace-nowrap">เวลา</span>
                              <TimeInput
                                value={shared.ttlTime}
                                onChange={v => setShared(s => ({ ...s, ttlTime: v, ttlUserModified: true }))}
                                placeholder="HH:mm"
                                className={cn(ttlInlineCls, 'w-[112px] min-w-0')} />
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-400">ไม่ระบุเวลาได้ ระบบจะบันทึกเฉพาะวันที่ NAME DL</p>
                          {previewTtlDate && (
                            <p className="text-xs text-slate-500">
                              {pnrCount > 1
                                ? <>ระบบจะคำนวณ NAME DL แยกตามวันเดินทางของแต่ละ PNR · เช่น PNR แรก: <strong className="text-slate-700">{formatDate(previewTtlDate)}{shared.ttlTime ? ` เวลา ${shared.ttlTime}` : ''}</strong></>
                                : <>วันที่ NAME DL <strong className="text-slate-700">{formatDate(previewTtlDate)}{shared.ttlTime ? ` เวลา ${shared.ttlTime}` : ''}</strong></>
                              }
                            </p>
                          )}
                        </div>
                      )}

                      {/* FIXED_DATE — inline date + time */}
                      {shared.ttlType === 'FIXED_DATE' && (
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 min-w-0 w-full xl:grid xl:grid-cols-[max-content_150px_max-content_112px]">
                            <div className="flex items-center gap-2 shrink-0 xl:contents">
                              <span className="text-xs text-slate-600 whitespace-nowrap">
                                วันที่ NAME DL <span className="text-red-400">*</span>
                              </span>
                              <input
                                type="date"
                                value={shared.ttlDate}
                                onChange={e => setShared(s => ({ ...s, ttlDate: e.target.value, ttlUserModified: true }))}
                                aria-label="วันที่ NAME DL"
                                className={cn(ttlInlineCls, 'w-[150px] min-w-0')} />
                            </div>
                            <div className="flex items-center gap-2 shrink-0 xl:contents">
                              <span className="text-xs text-slate-600 whitespace-nowrap">เวลา</span>
                              <TimeInput
                                value={shared.ttlTime}
                                onChange={v => setShared(s => ({ ...s, ttlTime: v, ttlUserModified: true }))}
                                placeholder="HH:mm"
                                className={cn(ttlInlineCls, 'w-[112px] min-w-0')} />
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-400">ไม่ระบุเวลาได้ ระบบจะบันทึกเฉพาะวันที่ NAME DL</p>
                          {previewTtlDate && (
                            <p className="text-xs text-slate-500">
                              วันที่ NAME DL <strong className="text-slate-700">{formatDate(previewTtlDate)}{shared.ttlTime ? ` เวลา ${shared.ttlTime}` : ''}</strong>
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Row 6: Remark — full width */}
                    <FL label="Remark" className="col-span-2">
                      <textarea rows={2} value={shared.remark} placeholder="หมายเหตุ..."
                        onChange={e => setShared(s => ({ ...s, remark: e.target.value }))}
                        className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" />
                    </FL>
                  </div>

                  {/* Info text */}
                  <p className="mt-2.5 text-[11px] text-slate-400">
                    หากไม่ได้ระบุรหัส PNR ระบบจะสร้าง Dummy PNR ให้อัตโนมัติ
                  </p>
                </div>

              </div>{/* end two-column grid */}
            </div>
          )}

          {/* ════ STEP: PREVIEW ═════════════════════════════════════════ */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Info size={13} className="shrink-0" />
                คลิกในช่องเพื่อแก้ไขทีละรายการ — เลือก Checkbox เพื่อแก้ไขพร้อมกัน
              </div>

              {/* FS info bar */}
              {flightSets?.length && shared.flightSetId && (() => {
                const selFs = flightSets.find(f => f.flightSetId === shared.flightSetId)
                if (!selFs) return null
                const route = buildFsRoute(selFs.sectors)
                return (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
                    <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
                    <span className="text-xs font-semibold text-emerald-800">Flight Set:</span>
                    <span className="text-xs text-emerald-700">{selFs.flightSetName}</span>
                    {route && <span className="rounded-md bg-white border border-emerald-200 px-2 py-0.5 text-xs text-slate-600">{route}</span>}
                    <span className="rounded-md bg-white border border-emerald-200 px-2 py-0.5 text-xs text-slate-600">{travelDays} วัน</span>
                  </div>
                )
              })()}

              {/* Bulk toolbar */}
              {numSelected > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-xs font-semibold text-blue-700">เลือก {numSelected} รายการ — แก้ไขพร้อมกัน:</span>
                  {[
                    { label: 'Seat', state: bSeat, set: setBSeat, field: 'seat' as const, w: 'w-16', type: 'number' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <span className="text-xs text-blue-600 font-medium">{item.label}:</span>
                      <input type={item.type} value={item.state} onChange={e => item.set(e.target.value)} placeholder="ค่า"
                        className={cn('h-7 border border-blue-300 rounded-lg px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400', item.w)} />
                      <button onClick={() => applyBulk(item.field)}
                        className="h-7 px-2.5 text-[11px] font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">ใช้</button>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-blue-600 font-medium">Condition:</span>
                    <select value={bCond} onChange={e => setBCond(e.target.value)}
                      className="h-7 border border-blue-300 rounded-lg px-2 text-xs focus:outline-none max-w-[110px]">
                      <option value="">—</option>
                      {conditions.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                    <button onClick={() => applyBulk('cond')}
                      className="h-7 px-2.5 text-[11px] font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">ใช้</button>
                  </div>
                  <button onClick={deleteSelected}
                    className="ml-auto flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition-colors">
                    <Trash2 size={12} /> ลบที่เลือก ({numSelected})
                  </button>
                </div>
              )}

              {/* Preview table */}
              <PNRSeatsTable
                records={previewRecords}
                scheduleTemplates={[scheduleTemplateForPreview]}
                conditions={conditionsForPreview}
                currency={currency}
                mode="review"
                showValidation={hasErrors}
                onChange={handlePreviewTableChange}
                onDelete={rowId => deleteRow(rowId)}
                onToggleSelect={handlePreviewToggleSelect}
                onToggleAll={handlePreviewToggleAll}
                allSelected={allSelected}
              />

              {hasErrors && (
                <div className="space-y-1.5">
                  {rows.filter(r => r.errors.length > 0).map(r => (
                    <div key={r.rowId} className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-600">
                      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                      <span><strong>#{r.seq}</strong>{r.travelStart ? ` (${formatDate(r.travelStart)})` : ''}: {r.errors.join(' · ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Flight Set change confirmation dialog */}
        {fsChangeConfirm && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 rounded-2xl">
            <div className="bg-white rounded-2xl shadow-2xl w-80 p-6 mx-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">เปลี่ยน Flight Set?</h3>
              <p className="text-xs text-slate-600 mb-5">
                คุณได้กรอกข้อมูลไปแล้ว การเปลี่ยน Flight Set จะอัปเดตระยะเวลาและ Sector ของทุก PNR ในชุดนี้
              </p>
              <div className="flex justify-end gap-3">
                <button type="button"
                  onClick={() => setFsChangeConfirm(null)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  ยกเลิก
                </button>
                <button type="button"
                  onClick={() => {
                    setShared(s => ({ ...s, flightSetId: fsChangeConfirm.toFsId }))
                    setFsChangeConfirm(null)
                  }}
                  className="px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                  เปลี่ยน Flight Set
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Condition–TTL confirmation dialog — NAME DL default is always "keep", never silently overwritten */}
        {condTtlConfirm && (
          <TtlTemplateConflictModal
            open
            templateName={condTtlConfirm.condName}
            currentIso={condTtlConfirm.currentIso}
            templateIso={condTtlConfirm.candidateIso}
            onCancel={() => setCondTtlConfirm(null)}
            onDecide={(decision: TtlTemplateConflictDecision) => {
              if (decision === 'KEEP') {
                setShared(s => ({ ...s, conditionCode: condTtlConfirm.pendingCode }))
              } else {
                const cond = conditions.find(c => c.code === condTtlConfirm.pendingCode)
                applyConditionCode(condTtlConfirm.pendingCode, cond)
              }
              setCondTtlConfirm(null)
            }}
          />
        )}

        {/* ══ FOOTER ══════════════════════════════════════════════════════ */}
        <div className="flex min-h-[68px] shrink-0 items-center justify-between gap-4 border-t border-slate-200 bg-white px-6 py-4 flex-wrap sm:flex-nowrap">
          {step === 'form' ? (
            <>
              <button type="button" onClick={handleClose}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                ยกเลิก
              </button>
              <div className="flex items-center gap-4 sm:ml-auto">
                {pnrCount > 0 && (
                  <span className="text-sm text-slate-500">จะสร้าง <strong className="text-slate-700">{pnrCount}</strong> PNR</span>
                )}
                <button type="button" onClick={handlePreview}
                  disabled={!canPreview}
                  className={cn(
                    'inline-flex h-10 items-center justify-center rounded-lg px-5 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 w-full sm:w-auto',
                    canPreview
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  )}>
                  ตรวจสอบรายการ →
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setStep('form')}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                ← ย้อนกลับ
              </button>
              <div className="flex items-center gap-3 sm:ml-auto">
                {hasErrors && (
                  <span className="flex items-center gap-1.5 text-xs text-red-500">
                    <AlertTriangle size={12} /> {rows.filter(r => r.errors.length > 0).length} รายการมีข้อผิดพลาด
                  </span>
                )}
                <button type="button" onClick={handleSave}
                  disabled={saving || hasErrors || rows.length === 0}
                  className={cn(
                    'inline-flex h-10 items-center justify-center rounded-lg px-5 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2',
                    saving || hasErrors || rows.length === 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  )}>
                  {saving ? 'กำลังบันทึก...' : `บันทึก ${mode === 'create_stock' ? 'และเพิ่มลงตาราง' : 'PNR ทั้งหมด'} (${rows.length} รายการ)`}
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
