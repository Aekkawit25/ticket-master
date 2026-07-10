'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  addDays, addMonths, subMonths, format as fnsFormat, parseISO, isValid as fnsIsValid,
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, X, Trash2, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import { cn, formatDate, formatDateTime, calcTTLDatetime } from '@/lib/utils'
import { calculateStockSummary, saveDemoStock, checkPNRDuplicatesInSystem } from '@/lib/demo-storage'
import type { DemoStock, DemoPNR, DemoLog } from '@/lib/demo-storage'

// ─── Exported Types ───────────────────────────────────────────────────────────

export type BulkPnrMode = 'create_stock' | 'add_to_existing'

export interface BulkPnrSector {
  sectorType: string
  dayOffset: number
  depAirportCode?: string
  arrAirportCode?: string
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
  errors: string[]; selected: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_ABBR = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const
const STATUS_OPTS = ['Pending', 'Confirmed', 'Ticketed', 'Cancelled']

const INIT_SHARED: SharedCfg = {
  seatTotal: 0, flightSetId: '',
  priceFormat: 'FARE', fare: '', yq: '', allIn: '', breakdown: false,
  tax: '', conditionCode: '', status: 'Pending', remark: '',
}
const INIT_COUNT: CountCfg = { startDate: '', count: 1, intervalDays: 1 }
const INIT_WD: WdCfg = { startDate: '', endDate: '', weekdays: new Set() }

const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/** Mirror of calcTravelEndFromSectors using BulkPnrSector format */
function calcTravelEnd(travelStart: string, sectors: BulkPnrSector[]): string {
  if (!travelStart) return ''
  if (!sectors.length) return travelStart
  const returns = sectors.filter(s => s.sectorType === 'Arrival')
  const target  = returns.length ? returns[returns.length - 1] : sectors[sectors.length - 1]
  try {
    const d = addDays(parseISO(travelStart), target.dayOffset - 1)
    return fnsIsValid(d) ? fnsFormat(d, 'yyyy-MM-dd') : travelStart
  } catch { return travelStart }
}

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


function genDummyPnr(travelStart: string, stock: DemoStock, usedSet: Set<string>): string {
  const typeMap: Record<string, string> = { Group: 'GRP', FIT: 'FIT', 'Ticket + Land': 'TNL' }
  const typeCode = typeMap[stock.ticketType] ?? 'UNK'
  const airline  = (stock.airlineCode || 'XX').toUpperCase()
  const yymm     = travelStart.length >= 7 ? travelStart.slice(2, 4) + travelStart.slice(5, 7) : '0000'
  const key      = `${typeCode}${airline}${yymm}`
  const pat      = new RegExp(`^DMY-${key}-(\\d{4})$`)
  let max        = 0
  for (const p of stock.pnrs) {
    if (p.dummyPnr) { const m = p.dummyPnr.match(pat); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  }
  for (const u of usedSet) { const m = u.match(pat); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  return `DMY-${key}-${String(max + 1).padStart(4, '0')}`
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

  return starts.map((s, i) => {
    const travelEnd = calcTravelEnd(s, sectors)
    const dummy     = stock ? genDummyPnr(s, stock, usedSet) : ''
    if (dummy) usedSet.add(dummy)
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
    const errors: string[] = []
    if (row.seatTotal <= 0)  errors.push('ที่นั่ง / PNR ต้องมากกว่า 0')
    if (row.total <= 0)      errors.push('ยอดสุทธิต้องมากกว่า 0')
    if (row.fare < 0)        errors.push('Fare ต้องไม่ติดลบ')
    if (row.taxType === 'separate' && row.tax < 0) errors.push('Tax ต้องไม่ติดลบ')

    if (seenStart.has(row.travelStart)) {
      errors.push(`Travel Start ซ้ำกับรายการ #${(seenStart.get(row.travelStart)! + 1)}`)
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

// ─── Main Component ───────────────────────────────────────────────────────────

export function BulkPnrBuilder({
  open, onClose, mode,
  sectors: sectorsProp, flightSets, conditions, currency,
  onConfirm, stock, onSaved,
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

  // Bulk toolbar
  const [bSeat, setBSeat]   = useState('')
  const [bCond, setBCond]   = useState('')
  const [bStat, setBStat]   = useState('')

  // Auto-select FS when modal opens
  useEffect(() => {
    if (!open || !flightSets?.length) return
    if (shared.flightSetId && flightSets.some(fs => fs.flightSetId === shared.flightSetId)) return
    const defaultFs = flightSets.find(fs => fs.flightSetId === 'fset-default' || fs.flightSetName === 'Default')
    setShared(s => ({ ...s, flightSetId: (defaultFs ?? flightSets[0]).flightSetId }))
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

  const hasDateInput =
    method === 'count'   ? !!countCfg.startDate :
    method === 'weekday' ? (!!wdCfg.startDate && !!wdCfg.endDate && wdCfg.weekdays.size > 0) :
    calItems.length > 0
  const canPreview = hasDateInput && shared.seatTotal > 0

  // ── Reset ─────────────────────────────────────────────────────────────────

  const resetAll = () => {
    setStep('form'); setMethod('count')
    setShared({ ...INIT_SHARED, flightSetId: '' })
    setCountCfg(INIT_COUNT); setWdCfg(INIT_WD); setCalItems([])
    setRows([]); setSaving(false); setFormErr('')
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
        m.travelEnd = calcTravelEnd(m.travelStart, effectiveSectors)
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

  const applyBulk = (field: 'seat' | 'cond' | 'status') => {
    setRows(prev => prev.map(r => {
      if (!r.selected) return r
      let m = { ...r }
      if (field === 'seat')   { m.seatTotal = Math.max(1, Number(bSeat) || r.seatTotal) }
      if (field === 'cond') {
        m.conditionCode = bCond
        const cond = conditions.find(c => c.code === bCond)
        m.paymentDueDate = calcPaymentDue(m.travelStart, m.travelEnd, cond)
      }
      if (field === 'status') { m.status = bStat }
      return m
    }))
  }

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
      if (last.sectorType !== 'Arrival' && last.sectorType !== 'Departure') { setFormErr('Sector สุดท้ายของ Flight Set ต้องเป็น Arrival'); return }
    }

    // Price validation
    if (computedTotal <= 0) { setFormErr('กรุณาระบุราคา / ยอดสุทธิมากกว่า 0'); return }
    if (breakdownMismatch)  { setFormErr('Fare + YQ + Tax ไม่เท่ากับ All In / Total'); return }

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
    }))

    if (mode === 'create_stock') {
      onConfirm?.(outRows)
      setSaving(false)
      resetAll()
      return
    }

    // ADD_TO_EXISTING: persist to stock
    const methodLabel = method === 'count' ? 'เพิ่มตามจำนวน' : method === 'weekday' ? 'วันประจำสัปดาห์' : 'เลือกจากปฏิทิน'
    const newPnrs: DemoPNR[] = revalidated.map(r => {
      let ttlDate: string | null = null; let ttlTime: string | null = null
      if (r.ttlDateTime) {
        try {
          const d = parseISO(r.ttlDateTime)
          ttlDate = fnsIsValid(d) ? fnsFormat(d, 'yyyy-MM-dd') : null
          ttlTime = fnsIsValid(d) ? fnsFormat(d, 'HH:mm') : null
        } catch {}
      }
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
        conditionCode:  r.conditionCode,
        ttlDate,
        ttlTime,
        ttlDateTime:    r.ttlDateTime,
        status:         r.status,
        remark:         r.remark,
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
      <div className="relative z-10 flex w-[80vw] max-w-[1200px] max-h-[calc(100vh-48px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

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
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">

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
                      <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
                        <FL label="วันเดินทางเริ่มต้น" required>
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

                    {/* Row 1: Seat | Flight Set (or Travel Days) */}
                    <FL label="ที่นั่ง / PNR" required>
                      <input type="number" min={1} value={shared.seatTotal}
                        onChange={e => setShared(s => ({ ...s, seatTotal: Math.max(1, Number(e.target.value) || 1) }))}
                        className={cn(iCls, 'text-center font-semibold')} />
                    </FL>
                    {flightSets && flightSets.length > 0 ? (
                      <FL label="Flight Set" required>
                        <select value={shared.flightSetId}
                          onChange={e => setShared(s => ({ ...s, flightSetId: e.target.value }))}
                          className={cn(iCls, !shared.flightSetId ? 'border-amber-400 ring-1 ring-amber-300' : '')}>
                          <option value="">— เลือก —</option>
                          {flightSets.map(fs => (
                            <option key={fs.flightSetId} value={fs.flightSetId}>
                              {fs.flightSetName}{fs.sectors.length ? ` · ${fs.sectors.length}s` : ''}
                            </option>
                          ))}
                        </select>
                        {(() => {
                          const selFs = flightSets.find(f => f.flightSetId === shared.flightSetId)
                          if (!selFs?.sectors.length) return null
                          const route = buildFsRoute(selFs.sectors)
                          return (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {route && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{route}</span>}
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">{travelDays} วัน</span>
                            </div>
                          )
                        })()}
                      </FL>
                    ) : (
                      <FL label="วันเดินทาง">
                        <div className={cn(iCls, 'flex items-center text-slate-600 bg-slate-50 cursor-default select-none gap-1.5')}>
                          <span>{travelDays} วัน</span>
                          {effectiveSectors.length > 0 && <span className="text-[10px] text-slate-400">(Sectors)</span>}
                        </div>
                      </FL>
                    )}

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
                        onChange={e => setShared(s => ({ ...s, conditionCode: e.target.value }))}
                        className={iCls}>
                        <option value="">ไม่ระบุ</option>
                        {conditions.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </select>
                    </FL>

                    {/* Row 4: Status — full width */}
                    <FL label="Status" className="col-span-2">
                      <select value={shared.status}
                        onChange={e => setShared(s => ({ ...s, status: e.target.value }))}
                        className={iCls}>
                        {STATUS_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </FL>

                    {/* Row 5: Remark — full width */}
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
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-blue-600 font-medium">Status:</span>
                    <select value={bStat} onChange={e => setBStat(e.target.value)}
                      className="h-7 border border-blue-300 rounded-lg px-2 text-xs focus:outline-none">
                      <option value="">—</option>
                      {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={() => applyBulk('status')}
                      className="h-7 px-2.5 text-[11px] font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">ใช้</button>
                  </div>
                  <button onClick={deleteSelected}
                    className="ml-auto flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition-colors">
                    <Trash2 size={12} /> ลบที่เลือก ({numSelected})
                  </button>
                </div>
              )}

              {/* Preview table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 select-none">
                      <th className="px-3 h-10 w-10">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll}
                          className="rounded border-slate-300 text-emerald-600" />
                      </th>
                      {['#','PNR / Dummy','Travel Start','Travel End','Seat','ประเภทราคา','Fare','Tax','YQ','ยอดสุทธิ','Condition','Payment Due','TTL','Status',''].map(h => (
                        <th key={h} className="px-2 h-10 text-xs font-semibold text-slate-500 text-left whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr><td colSpan={15} className="py-12 text-center text-sm text-slate-400">ไม่มีรายการ — ย้อนกลับเพื่อเลือกวัน</td></tr>
                    )}
                    {rows.map(row => {
                      const hasErr = row.errors.length > 0
                      return (
                        <tr key={row.rowId} className={cn(
                          'border-b border-slate-100 last:border-0 transition-colors',
                          hasErr ? 'bg-red-50/70' : row.selected ? 'bg-blue-50/50' : 'hover:bg-slate-50/60'
                        )}>
                          <td className="px-3 py-2 text-center w-10">
                            <input type="checkbox" checked={row.selected} onChange={() => toggleRow(row.rowId)}
                              className="rounded border-slate-300 text-emerald-600" />
                          </td>
                          <td className="px-2 py-2 text-xs text-slate-400 font-medium">{row.seq}</td>
                          {/* PNR */}
                          <td className="px-1 py-2">
                            {row.dummyPnr ? (
                              <span className="font-mono text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 whitespace-nowrap">{row.dummyPnr}</span>
                            ) : mode === 'create_stock' ? (
                              <span className="text-[10px] text-slate-400 italic whitespace-nowrap">สร้างอัตโนมัติ</span>
                            ) : (
                              <input value={row.pnrCode} onChange={e => updateRow(row.rowId, { pnrCode: e.target.value.toUpperCase() })}
                                placeholder="PNR Code"
                                className={cn('w-28 h-7 border rounded-lg px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500',
                                  hasErr && !row.pnrCode.trim() ? 'border-red-400 bg-red-50' : 'border-slate-300')} />
                            )}
                          </td>
                          {/* Travel Start */}
                          <td className="px-1 py-2">
                            <input type="date" value={row.travelStart}
                              onChange={e => updateRow(row.rowId, { travelStart: e.target.value })}
                              className="h-7 border border-slate-300 rounded-lg px-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                          </td>
                          {/* Travel End */}
                          <td className="px-2 py-2 text-xs whitespace-nowrap text-slate-600">{row.travelEnd ? formatDate(row.travelEnd) : '—'}</td>
                          {/* Seat */}
                          <td className="px-1 py-2">
                            <input type="number" min={1} value={row.seatTotal}
                              onChange={e => updateRow(row.rowId, { seatTotal: Math.max(1, Number(e.target.value)) })}
                              className="w-14 h-7 border border-slate-300 rounded-lg px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                          </td>
                          {/* ประเภทราคา */}
                          <td className="px-2 py-2 text-center">
                            <span className={cn(
                              'text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap',
                              row.priceFormat === 'FARE_YQ' ? 'bg-amber-100 text-amber-700' :
                              row.priceFormat === 'ALL_IN'  ? 'bg-blue-100 text-blue-700' :
                                                              'bg-slate-100 text-slate-600'
                            )}>
                              {row.priceFormat === 'FARE_YQ' ? 'FARE+YQ' : row.priceFormat === 'ALL_IN' ? 'ALL IN' : 'FARE'}
                            </span>
                          </td>
                          {/* Fare */}
                          <td className="px-2 py-2 text-xs text-right font-semibold tabular-nums whitespace-nowrap">
                            {row.fare > 0 ? row.fare.toLocaleString('en-US') : <span className="italic text-slate-300">—</span>}
                          </td>
                          {/* Tax */}
                          <td className="px-2 py-2 text-xs text-right tabular-nums whitespace-nowrap text-slate-600">
                            {row.priceFormat === 'ALL_IN'
                              ? <span className="text-[9px] text-slate-400 italic">รวมแล้ว</span>
                              : row.tax > 0 ? row.tax.toLocaleString('en-US') : '0'}
                          </td>
                          {/* YQ */}
                          <td className="px-2 py-2 text-xs text-right tabular-nums whitespace-nowrap text-slate-600">
                            {(row.priceFormat === 'FARE_YQ' || row.priceFormat === 'ALL_IN')
                              ? <span className="text-[9px] text-slate-400 italic">รวมแล้ว</span>
                              : row.yq > 0 ? row.yq.toLocaleString('en-US') : '0'}
                          </td>
                          {/* ยอดสุทธิ */}
                          <td className="px-2 py-2 text-xs font-bold text-right tabular-nums text-slate-800 bg-emerald-50/60 whitespace-nowrap">
                            {row.total > 0 ? row.total.toLocaleString('en-US') : '—'}
                          </td>
                          {/* Condition */}
                          <td className="px-1 py-2">
                            <select value={row.conditionCode}
                              onChange={e => updateRow(row.rowId, { conditionCode: e.target.value })}
                              className="h-7 border border-slate-300 rounded-lg px-2 text-xs focus:outline-none max-w-[100px]">
                              <option value="">—</option>
                              {conditions.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                            </select>
                          </td>
                          {/* Payment Due */}
                          <td className="px-2 py-2 text-xs whitespace-nowrap">
                            {row.paymentDueDate
                              ? <span className="text-amber-600">{formatDateTime(row.paymentDueDate)}</span>
                              : <span className="text-slate-300">รอข้อมูล</span>}
                          </td>
                          {/* TTL */}
                          <td className="px-2 py-2 text-xs whitespace-nowrap">
                            {row.ttlDateTime
                              ? <span className="text-red-500">{formatDateTime(row.ttlDateTime)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          {/* Status */}
                          <td className="px-1 py-2">
                            <select value={row.status}
                              onChange={e => updateRow(row.rowId, { status: e.target.value })}
                              className="h-7 border border-slate-300 rounded-lg px-1.5 text-xs focus:outline-none">
                              {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          {/* Delete */}
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => deleteRow(row.rowId)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Error list */}
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
