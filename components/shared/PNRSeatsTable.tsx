'use client'

import { useRef, useState, Fragment } from 'react'
import { Trash2, Copy, RotateCcw, Pencil, CalendarDays } from 'lucide-react'
import { cn, formatTravelDate, formatDateThai, formatDateTimeThai, calculatePlusDay } from '@/lib/utils'
// hasTtl helper for PNRRecord (camelCase fields)
const hasTtlFn = (r: { ttlType: string; ttlDate: string | null }): boolean =>
  r.ttlType !== 'NONE' && !!r.ttlDate
import { TtlEditor } from '@/components/shared/TtlEditor'
import { CurrencyCombobox } from '@/components/shared/CurrencyCombobox'
import { TimeInput } from '@/components/ui/time-input'
import * as Popover from '@radix-ui/react-popover'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  type PNRRecord,
  type ScheduleTemplate,
  type TtlType,
  calcPnrTotal,
  autoAdjustArrDate,
  calcSectorDepDate,
  getDayLabel,
  recalcSectorDates,
} from '@/lib/pnr-record'
import { getCurrencyOptions } from '@/lib/currency-storage'

// ─── Column definitions — single source of truth ─────────────────────────────
export const PNR_COLS = [
  { key: 'checkbox',    label: '',               width: 36,  align: 'center' }, // review only
  { key: 'index',       label: '#',              width: 42,  align: 'center' },
  { key: 'pnr',        label: 'PNR',            width: 92,  align: 'left'   },
  { key: 'flightSet',  label: 'Flight Set',     width: 110, align: 'left'   },
  { key: 'sector',     label: 'Sector',          width: 55,  align: 'center' },
  { key: 'day',        label: 'Day',             width: 68,  align: 'center' },
  { key: 'depDate',    label: 'Dep Date',        width: 115, align: 'center' },
  { key: 'depTime',    label: 'Dep Time',        width: 78,  align: 'center' },
  { key: 'arrDate',    label: 'Arr Date',        width: 115, align: 'center' },
  { key: 'arrTime',    label: 'Arr Time',        width: 92,  align: 'center' },
  { key: 'seat',       label: 'Seat',            width: 62,  align: 'center' },
  { key: 'priceDetail',label: 'รายละเอียดราคา',  width: 165, align: 'left'   },
  { key: 'condition',  label: 'Condition',        width: 115, align: 'left'   },
  { key: 'ttl',        label: 'NAME TTL',        width: 145, align: 'left'   },
  { key: 'remark',     label: 'Remark',          width: 90,  align: 'left'   },
  { key: 'action',     label: 'Action',          width: 46,  align: 'center' },
]

export const PNR_FIXED_WIDTH = PNR_COLS.filter(c => c.key !== 'action' && c.key !== 'checkbox')
  .reduce((s, c) => s + c.width, 0)

// ─── PriceInput ───────────────────────────────────────────────────────────────
function PriceInput({
  value, nullable = false, disabled = false, hasError = false,
  onChange, onBlur, compact = false,
}: {
  value: number | null; nullable?: boolean; disabled?: boolean
  hasError?: boolean; compact?: boolean
  onChange: (v: number | null) => void; onBlur?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState(() => (value == null ? '' : String(value)))
  const preEditRef = useRef<number | null>(null)

  const fmtDisplay = (v: number | null) =>
    v == null ? '' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const parse = (s: string): number | null => {
    const t = s.trim()
    if (t === '') return null
    const n = Number(t)
    return (isNaN(n) || n < 0) ? null : Math.round(n * 100) / 100
  }
  const commit = (rawStr: string) => {
    const v = parse(rawStr); onChange(v); setRaw(v == null ? '' : String(v))
  }

  if (disabled) {
    return <span className="text-slate-300 select-none text-[12px] block text-right pr-1">—</span>
  }

  return (
    <input ref={inputRef} type="text" inputMode="decimal"
      value={focused ? raw : fmtDisplay(value)}
      placeholder={focused ? (nullable ? '—' : '0.00') : (value == null ? 'ยังไม่ระบุ' : '')}
      className={cn(
        'w-full min-w-0 bg-transparent focus:outline-none tabular-nums transition-colors',
        compact
          ? cn('text-[11px] h-[18px] border-0 text-right px-0.5 py-0',
              hasError ? 'text-red-500' : '',
              !focused && value == null ? 'placeholder:text-slate-300 placeholder:italic' : 'text-slate-800 font-medium')
          : cn('text-[12px] h-7 border-0 text-right px-1 py-0',
              hasError ? 'text-red-500' : '',
              !focused && value == null ? 'placeholder:text-slate-300' : 'text-slate-800 font-medium'),
      )}
      onFocus={e => {
        preEditRef.current = value; setFocused(true)
        setRaw(value == null ? '' : String(value))
        requestAnimationFrame(() => e.target.select())
      }}
      onBlur={() => { setFocused(false); commit(raw); onBlur?.() }}
      onChange={e => setRaw(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault()
          const p = preEditRef.current; onChange(p)
          setRaw(p == null ? '' : String(p)); setFocused(false); inputRef.current?.blur()
        } else if (e.key === 'Enter') {
          e.preventDefault(); commit(raw); setFocused(false); inputRef.current?.blur()
        }
      }}
    />
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface PNRSeatsTableProps {
  records:           PNRRecord[]
  scheduleTemplates: ScheduleTemplate[]
  conditions:        { conditionId: string; conditionName: string }[]
  currency:          string            // stock-level default currency
  mode:              'step3' | 'review'
  showValidation?:   boolean
  onChange:          (records: PNRRecord[]) => void
  onDelete:          (rowId: string) => void
  onDuplicate?:      (rowId: string) => void
  // step3 only
  onToggleSelect?:   (rowId: string) => void
  onToggleAll?:      () => void
  allSelected?:      boolean
  // highlight newly added
  newHighlight?:     { start: number; count: number } | null
  readOnly?:         boolean
  /** When true, changing sector-0 dep recalculates all sectors immediately (no confirmation banner).
   *  Use in Add Stock wizard where all dates are auto-calculated from travelStart. */
  immediateRecalcOnTravelStart?: boolean
}

const TTL_NEAR_DAYS = 7
function getTtlStatus(ttlDate: string | null, ttlTime: string | null): 'unset' | 'past' | 'near' | 'ok' {
  if (!ttlDate) return 'unset'
  const now = new Date()
  const dt = new Date(`${ttlDate}T${ttlTime || '00:00'}:00`)
  if (isNaN(dt.getTime())) return 'unset'
  if (dt < now) return 'past'
  if (dt.getTime() - now.getTime() <= TTL_NEAR_DAYS * 86400000) return 'near'
  return 'ok'
}

function addDaysToDate(dateStr: string, days: number): string {
  if (!dateStr || days === 0) return dateStr
  try {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  } catch { return dateStr }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PNRSeatsTable({
  records, scheduleTemplates, conditions, currency, mode, showValidation = false,
  onChange, onDelete, onDuplicate,
  onToggleSelect, onToggleAll, allSelected,
  newHighlight, readOnly = false,
  immediateRecalcOnTravelStart = false,
}: PNRSeatsTableProps) {

  const [hoveredIdx,        setHoveredIdx]        = useState<number | null>(null)
  const [touchedRows,       setTouchedRows]        = useState<Set<number>>(new Set())
  const [ttlPopover,        setTtlPopover]         = useState<number | null>(null)
  const [remarkPopover,     setRemarkPopover]      = useState<number | null>(null)
  const [shiftConfirm,      setShiftConfirm]       = useState<{ idx: number; origDep: string; newDep: string } | null>(null)
  const [priceTypeConfirm,  setPriceTypeConfirm]   = useState<{ idx: number; newFmt: 'FARE' | 'FARE_YQ' | 'ALL_IN' } | null>(null)
  const [currencyConfirm,   setCurrencyConfirm]    = useState<{ idx: number; newCurrency: string } | null>(null)
  const [toastMsg,          setToastMsg]           = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currencyOptions = getCurrencyOptions()

  const markTouched = (idx: number) =>
    setTouchedRows(prev => { if (prev.has(idx)) return prev; const n = new Set(prev); n.add(idx); return n })

  const showToast = (msg: string) => {
    setToastMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2500)
  }

  const update = (idx: number, patch: Partial<PNRRecord>) =>
    onChange(records.map((r, i) => i !== idx ? r : { ...r, ...patch }))

  // ─── Schedule helpers ───────────────────────────────────────────────────────
  const mainSchedule = scheduleTemplates.find(s => s.isMain) ?? scheduleTemplates[0]

  const getSchedule = (r: PNRRecord): ScheduleTemplate =>
    (r.activeScheduleId ? scheduleTemplates.find(s => s.scheduleId === r.activeScheduleId) : null)
    ?? mainSchedule
    ?? { scheduleId: '', scheduleName: 'Default', isMain: true, sectors: [] }

  const getSectors = (r: PNRRecord) => {
    const sch = getSchedule(r)
    const tmpl = sch.sectors
    // travelStart = sector 0 dep date (single source of truth)
    const travelStart = r.sectors[0]?.depDate || ''
    return tmpl.map((s, i) => {
      const sd = r.sectors[i]
      // Dep: derive from travelStart + dayOffset unless manually edited
      const dep = sd?.depManual
        ? (sd.depDate || '')
        : (travelStart ? calcSectorDepDate(travelStart, s.dayOffset) : (sd?.depDate || ''))
      // Arr: derive from dep + arrDayOffset unless manually edited
      const arr = sd?.arrManual
        ? (sd?.arrDate || '')
        : (dep ? addDaysToDate(dep, s.arrDayOffset) : '')
      if (!sd) {
        return {
          sectorType: s.sectorType, dayOffset: s.dayOffset, arrDayOffset: s.arrDayOffset,
          depAirportCode: s.depAirportCode, arrAirportCode: s.arrAirportCode,
          depDate: dep, depTime: s.depTime, arrDate: arr, arrTime: s.arrTime,
          depManual: false, arrManual: false, timeOverride: false,
          tmplDepTime: s.depTime, tmplArrTime: s.arrTime,
        }
      }
      return { ...sd, depDate: dep, arrDate: arr,
        depTime: sd.depTime !== undefined ? sd.depTime : s.depTime,
        arrTime: sd.arrTime !== undefined ? sd.arrTime : s.arrTime }
    })
  }

  // ─── Sector date handlers ───────────────────────────────────────────────────
  const handleDepChange = (idx: number, sIdx: number, newDep: string) => {
    const r = records[idx]; const sectors = getSectors(r); const sch = getSchedule(r)
    const cur = sectors[sIdx]?.depDate ?? ''
    if (sIdx === 0) {
      // In Add Stock mode (immediateRecalcOnTravelStart) always recalc immediately — no banner.
      // In Edit mode, defer to shiftConfirm so user can choose to keep manual overrides.
      if (cur && newDep !== cur && !immediateRecalcOnTravelStart) {
        setShiftConfirm({ idx, origDep: cur, newDep }); return
      }
      // Recalculate all sectors atomically from the new travelStart
      const newSects = recalcSectorDates(newDep, sch.sectors, r.sectors)
      markTouched(idx); update(idx, { sectors: newSects }); return
    }
    const s = sch.sectors[sIdx]
    const newSects = sectors.map((sd, i) => {
      if (i !== sIdx) return sd
      const newArr = !sd.arrManual && newDep
        ? autoAdjustArrDate(newDep, sd.depTime, sd.arrTime, s?.arrDayOffset ?? 0).arrDate
        : sd.arrDate
      return { ...sd, depDate: newDep, depManual: !!newDep, arrDate: newArr }
    })
    markTouched(idx); update(idx, { sectors: newSects })
  }

  const handleArrChange = (idx: number, sIdx: number, newArr: string) => {
    const sectors = getSectors(records[idx])
    const newSects = sectors.map((sd, i) => i === sIdx ? { ...sd, arrDate: newArr, arrManual: !!newArr } : sd)
    markTouched(idx); update(idx, { sectors: newSects })
  }

  const handleDepTimeChange = (idx: number, sIdx: number, newTime: string) => {
    const r = records[idx]; const sectors = getSectors(r); const sch = getSchedule(r)
    const s = sch.sectors[sIdx]
    let pendingToast = ''
    const newSects = sectors.map((sd, i) => {
      if (i !== sIdx) return sd
      const timeOverride = (newTime !== (s?.depTime ?? '')) || (sd.arrTime !== (s?.arrTime ?? ''))
      if (!sd.arrManual && sd.depDate) {
        const { arrDate, wasAdjusted } = autoAdjustArrDate(sd.depDate, newTime, sd.arrTime, s?.arrDayOffset ?? 0)
        if (wasAdjusted && arrDate !== sd.arrDate) pendingToast = 'ปรับวันถึงเป็นวันถัดไป เนื่องจากเวลาถึงน้อยกว่าเวลาออก'
        return { ...sd, depTime: newTime, arrDate, timeOverride }
      }
      if (sd.arrManual && sd.depDate && sd.arrDate === sd.depDate && sd.arrTime && newTime && sd.arrTime < newTime)
        pendingToast = 'เวลาถึงน้อยกว่าเวลาออกในวันเดียวกัน กรุณาตรวจสอบ Arr Date'
      return { ...sd, depTime: newTime, timeOverride }
    })
    if (pendingToast) showToast(pendingToast)
    markTouched(idx); update(idx, { sectors: newSects })
  }

  const handleArrTimeChange = (idx: number, sIdx: number, newTime: string) => {
    const r = records[idx]; const sectors = getSectors(r); const sch = getSchedule(r)
    const s = sch.sectors[sIdx]
    let pendingToast = ''
    const newSects = sectors.map((sd, i) => {
      if (i !== sIdx) return sd
      const timeOverride = (sd.depTime !== (s?.depTime ?? '')) || (newTime !== (s?.arrTime ?? ''))
      if (!sd.arrManual && sd.depDate) {
        const { arrDate, wasAdjusted } = autoAdjustArrDate(sd.depDate, sd.depTime, newTime, s?.arrDayOffset ?? 0)
        if (wasAdjusted && arrDate !== sd.arrDate) pendingToast = 'ปรับวันถึงเป็นวันถัดไป เนื่องจากเวลาถึงน้อยกว่าเวลาออก'
        return { ...sd, arrTime: newTime, arrDate, timeOverride }
      }
      if (sd.arrManual && sd.depDate && sd.arrDate === sd.depDate && sd.depTime && newTime && newTime < sd.depTime)
        pendingToast = 'เวลาถึงน้อยกว่าเวลาออกในวันเดียวกัน กรุณาตรวจสอบ Arr Date'
      return { ...sd, arrTime: newTime, timeOverride }
    })
    if (pendingToast) showToast(pendingToast)
    markTouched(idx); update(idx, { sectors: newSects })
  }

  const handleResetSector = (idx: number, sIdx: number) => {
    const r = records[idx]; const sch = getSchedule(r); const s = sch.sectors[sIdx]
    if (!s) return
    const travelStart = r.sectors[0]?.depDate || ''
    const dep = travelStart ? calcSectorDepDate(travelStart, s.dayOffset) : ''
    const arr = dep ? addDaysToDate(dep, s.arrDayOffset) : ''
    const sectors = getSectors(r)
    const newSects = sectors.map((sd, i) => i === sIdx
      ? { ...sd, depDate: dep, arrDate: arr, depManual: false as const, arrManual: false as const,
          depTime: s.depTime, arrTime: s.arrTime, timeOverride: false as const,
          tmplDepTime: s.depTime, tmplArrTime: s.arrTime }
      : sd)
    markTouched(idx); update(idx, { sectors: newSects })
  }

  const handleResetAllSectors = (idx: number) => {
    const r = records[idx]; const sch = getSchedule(r)
    const travelStart = r.sectors[0]?.depDate || ''
    const newSects = recalcSectorDates(travelStart, sch.sectors, r.sectors)
    markTouched(idx); update(idx, { sectors: newSects })
  }

  // ─── Shift confirm — atomic updates, no partial state ──────────────────────
  const confirmRecalcAll = () => {
    if (!shiftConfirm) return
    const { idx, newDep } = shiftConfirm
    const r = records[idx]; const sch = getSchedule(r)
    // Recalculate ALL sectors atomically from newDep (clears all manual flags)
    const newSects = recalcSectorDates(newDep, sch.sectors, r.sectors)
    markTouched(idx); update(idx, { sectors: newSects }); setShiftConfirm(null)
  }
  const confirmRecalcNonManual = () => {
    if (!shiftConfirm) return
    const { idx, newDep } = shiftConfirm
    const r = records[idx]; const sch = getSchedule(r)
    // Recalculate only sectors that have NOT been manually edited
    const newSects = recalcSectorDates(newDep, sch.sectors, r.sectors, { skipManualDep: true, skipManualArr: true })
    markTouched(idx); update(idx, { sectors: newSects }); setShiftConfirm(null)
  }
  // "คงค่าเดิม" — cancel: revert input to original, leave ALL sectors unchanged
  const cancelShiftConfirm = () => setShiftConfirm(null)

  // ─── Price handlers ─────────────────────────────────────────────────────────
  const handlePriceTypeChange = (idx: number, newFmt: 'FARE' | 'FARE_YQ' | 'ALL_IN') => {
    const r = records[idx]; const oldFmt = r.priceFormat
    if (newFmt === oldFmt) return
    const losingTax = (newFmt === 'FARE_YQ' || newFmt === 'ALL_IN') && (r.tax ?? 0) > 0
    const losingYq  = newFmt === 'ALL_IN' && (r.yq ?? 0) > 0
    if (losingTax || losingYq) { setPriceTypeConfirm({ idx, newFmt }); return }
    commitPriceTypeChange(idx, newFmt)
  }
  const commitPriceTypeChange = (idx: number, newFmt: 'FARE' | 'FARE_YQ' | 'ALL_IN') => {
    const r = records[idx]
    const newTax = newFmt === 'FARE' ? r.tax : null
    const newYq  = newFmt !== 'ALL_IN' ? r.yq ?? null : null
    update(idx, { priceFormat: newFmt, tax: newTax, yq: newYq, totalAmount: calcPnrTotal(newFmt, r.fare, newTax, newYq) })
  }
  const commitPriceTypeKeep = (idx: number, newFmt: 'FARE' | 'FARE_YQ' | 'ALL_IN') => {
    const r = records[idx]
    update(idx, { priceFormat: newFmt, totalAmount: calcPnrTotal(newFmt, r.fare, r.tax ?? null, r.yq ?? null) })
  }

  const handleCurrencyChange = (idx: number, code: string) => {
    const r = records[idx]
    if ((r.fare > 0) || ((r.yq ?? 0) > 0)) { setCurrencyConfirm({ idx, newCurrency: code }); return }
    update(idx, { currency: code })
  }

  // ─── CSS classes ────────────────────────────────────────────────────────────
  const TH   = 'border-r border-b border-[#E5EAF0] px-1.5 py-0 h-[34px] align-middle text-[11px] font-medium text-slate-600 bg-[#F0F4F8] select-none overflow-hidden whitespace-nowrap box-border'
  const TH_C = cn(TH, 'text-center')
  const TH_L = cn(TH, 'text-left')
  const TD   = 'border-r border-[#E5EAF0] px-1.5 align-middle overflow-hidden whitespace-nowrap box-border'
  const TD_C = cn(TD, 'text-center')
  const TD_L = cn(TD, 'text-left')
  const TD_SEC   = cn(TD, 'bg-[#F8FAFC]')
  const TD_SEC_C = cn(TD_SEC, 'text-center')

  const isReview = mode === 'review'
  const showCheckbox = isReview && !readOnly
  const showAction = !readOnly
  // Total fixed cols width (+ checkbox in review)
  const checkboxWidth = showCheckbox ? 36 : 0
  const totalFixedWidth = PNR_FIXED_WIDTH + checkboxWidth

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-0">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-slate-800/95 text-white text-xs px-4 py-2 rounded-full shadow-xl pointer-events-none">
          {toastMsg}
        </div>
      )}

      {/* Confirmation banners */}
      {!readOnly && shiftConfirm && !immediateRecalcOnTravelStart && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-800 flex-wrap mb-1">
          <CalendarDays size={12} className="shrink-0 text-blue-500" />
          <span className="flex-1 min-w-0">Travel Start เปลี่ยนเป็น <strong>{formatTravelDate(shiftConfirm.newDep)}</strong> — คำนวณวันที่ Sector อื่นใหม่อย่างไร?</span>
          <button type="button" onClick={confirmRecalcAll} className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-semibold hover:bg-blue-700 whitespace-nowrap shrink-0">คำนวณใหม่ทุก Sector</button>
          <button type="button" onClick={confirmRecalcNonManual} className="px-2 py-0.5 bg-white border border-blue-300 text-blue-700 rounded text-[10px] hover:bg-blue-50 whitespace-nowrap shrink-0">เฉพาะที่ไม่ได้แก้เอง</button>
          <button type="button" onClick={cancelShiftConfirm} className="px-2 py-0.5 bg-white border border-slate-300 text-slate-600 rounded text-[10px] hover:bg-slate-50 whitespace-nowrap shrink-0">คงค่าเดิม</button>
          <button type="button" onClick={cancelShiftConfirm} className="text-slate-400 hover:text-slate-600 text-[10px] whitespace-nowrap shrink-0 px-1">ยกเลิก</button>
        </div>
      )}
      {!readOnly && priceTypeConfirm && (() => {
        const r = records[priceTypeConfirm.idx]
        const oldFmt = r.priceFormat
        const newFmt = priceTypeConfirm.newFmt
        const fmtLabel = (f: string) => f === 'FARE_YQ' ? 'FARE+YQ' : f === 'ALL_IN' ? 'ALL IN' : 'FARE'
        const losingTax = (newFmt === 'FARE_YQ' || newFmt === 'ALL_IN') && (r.tax ?? 0) > 0
        const losingYq  = newFmt === 'ALL_IN' && (r.yq ?? 0) > 0
        const lossDesc = losingTax && losingYq ? 'Tax และ YQ' : losingTax ? 'Tax' : 'YQ'
        return (
          <div className="flex items-start gap-2 px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex-wrap mb-1">
            <span className="shrink-0 mt-0.5">⚠</span>
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="font-semibold">เปลี่ยนประเภทราคา — PNR #{priceTypeConfirm.idx + 1}</p>
              <p className="text-amber-700">
                <span className={cn('font-bold', oldFmt === 'FARE_YQ' ? 'text-amber-600' : oldFmt === 'ALL_IN' ? 'text-blue-600' : 'text-slate-600')}>{fmtLabel(oldFmt)}</span>
                {' → '}
                <span className={cn('font-bold', newFmt === 'FARE_YQ' ? 'text-amber-600' : newFmt === 'ALL_IN' ? 'text-blue-600' : 'text-slate-600')}>{fmtLabel(newFmt)}</span>
                {' · มีค่า '}<strong>{lossDesc}</strong>{' ที่กรอกไว้แล้ว'}
              </p>
            </div>
            <button type="button" onClick={() => setPriceTypeConfirm(null)} className="px-2 py-0.5 bg-white border border-amber-300 text-amber-700 rounded text-[10px] hover:bg-amber-50 whitespace-nowrap shrink-0">ยกเลิก</button>
            <button type="button" onClick={() => { commitPriceTypeKeep(priceTypeConfirm.idx, newFmt); setPriceTypeConfirm(null) }} className="px-2 py-0.5 bg-white border border-amber-400 text-amber-800 rounded text-[10px] font-semibold hover:bg-amber-100 whitespace-nowrap shrink-0">เก็บค่าที่กรอกไว้</button>
            <button type="button" onClick={() => { commitPriceTypeChange(priceTypeConfirm.idx, newFmt); setPriceTypeConfirm(null) }} className="px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-semibold hover:bg-amber-700 whitespace-nowrap shrink-0">ล้างค่าที่ไม่เกี่ยวข้อง</button>
          </div>
        )
      })()}
      {!readOnly && currencyConfirm && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex-wrap mb-1">
          <span className="shrink-0">⚠</span>
          <span className="flex-1 min-w-0">เปลี่ยนสกุลเงิน PNR #{currencyConfirm.idx + 1} เป็น <strong className="font-mono">{currencyConfirm.newCurrency}</strong> — ราคาไม่ถูกแปลงอัตโนมัติ</span>
          <button type="button" onClick={() => { update(currencyConfirm.idx, { currency: currencyConfirm.newCurrency }); setCurrencyConfirm(null) }} className="px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-semibold hover:bg-amber-700 whitespace-nowrap shrink-0">เปลี่ยน</button>
          <button type="button" onClick={() => setCurrencyConfirm(null)} className="px-2 py-0.5 bg-white border border-amber-300 text-amber-700 rounded text-[10px] hover:bg-amber-50 whitespace-nowrap shrink-0">ยกเลิก</button>
        </div>
      )}

      {/* Focus outline */}
      <style>{`.pnrg td:focus-within{outline:1.5px solid #05a94f;outline-offset:-1px;position:relative;z-index:1}`}</style>

      {/* Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm"
        style={{ maxHeight: records.length > 10 ? 'calc(100vh - 260px)' : undefined, overflowY: records.length > 10 ? 'auto' : 'visible' }}>
        <table className="pnrg text-[12px]"
          style={{ width: '100%', minWidth: totalFixedWidth + 60, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
          <colgroup>
            {showCheckbox && <col style={{ width: 36 }} />}
            {PNR_COLS.filter(c => c.key !== 'checkbox' && (showAction || c.key !== 'action')).map(c =>
              c.key === 'action' ? <col key={c.key} /> : <col key={c.key} style={{ width: c.width }} />
            )}
          </colgroup>
          <thead>
            <tr>
              {showCheckbox && (
                <th className={cn(TH_C, 'w-[36px]')}>
                  <input type="checkbox" checked={!!allSelected} onChange={() => onToggleAll?.()}
                    className="rounded border-slate-300 text-emerald-600" />
                </th>
              )}
              <th className={TH_C}>#</th>
              <th className={TH_L}>PNR</th>
              <th className={TH_L}>Flight Set</th>
              <th className={cn(TH_C, 'bg-[#EDF5FF]')}>Sector</th>
              <th className={cn(TH_C, 'bg-[#EDF5FF]')}>Day</th>
              <th className={cn(TH_C, 'bg-[#EDF5FF]')}>Dep Date</th>
              <th className={cn(TH_C, 'bg-[#EDF5FF]')} style={{ width: 78, minWidth: 78, maxWidth: 78, paddingLeft: 0, paddingRight: 0 }}>Dep Time</th>
              <th className={cn(TH_C, 'bg-[#EDF5FF]')}>Arr Date</th>
              <th className={cn(TH_C, 'bg-[#EDF5FF]')} style={{ width: 92, minWidth: 92, maxWidth: 92, paddingLeft: 0, paddingRight: 0 }}>Arr Time</th>
              <th className={TH_C}>Seat</th>
              <th className={TH_L}>รายละเอียดราคา</th>
              <th className={TH_L}>Condition</th>
              <th className={TH_L}>NAME TTL</th>
              <th className={TH_L}>Remark</th>
              {showAction && <th className={cn(TH_C, 'border-r-0')}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={showCheckbox ? 16 : showAction ? 15 : 14} className="py-10 text-center border-b border-[#E5EAF0]">
                  <p className="text-[13px] text-slate-400">ยังไม่มีรายการ PNR</p>
                </td>
              </tr>
            )}

            {records.map((r, pnrIdx) => {
              const sch = getSchedule(r)
              const sectorDates = getSectors(r)
              const sectorCount = Math.max(sectorDates.length, 1)
              const isHovered = hoveredIdx === pnrIdx
              const touched = touchedRows.has(pnrIdx) || showValidation
              const fmt = r.priceFormat
              const isDupPnr = !!r.pnrCode.trim() && records.some((o, oi) => oi !== pnrIdx && o.pnrCode.trim() === r.pnrCode.trim())
              const pnrErr = touched && isDupPnr
              const missingSeat = touched && (!r.seatTotal || r.seatTotal <= 0)
              const fareErr = touched && !(r.fare > 0)
              const taxErr  = touched && fmt === 'FARE' && r.tax == null
              const yqErr   = touched && (fmt === 'FARE' || fmt === 'FARE_YQ') && r.yq == null
              const isNewlyAdded = newHighlight !== null && newHighlight !== undefined && pnrIdx >= newHighlight.start && pnrIdx < newHighlight.start + newHighlight.count
              const hvBg  = isHovered ? '#F0F7FF' : isNewlyAdded ? '#f0fdf4' : '#FFFFFF'
              const hvSec = isHovered ? '#EBF4FF' : isNewlyAdded ? '#dcfce7' : '#F8FAFC'
              const isLastPnr = pnrIdx === records.length - 1
              const pnrBorderB = isLastPnr ? 'border-b border-b-[#E5EAF0]' : 'border-b-2 border-b-slate-300'
              const ttlSt = getTtlStatus(r.ttlDate, r.ttlTime)
              const taxDisabled = fmt !== 'FARE'
              const yqDisabled  = fmt === 'ALL_IN'
              const fsName = sch.scheduleName

              // Per-sector validation
              const sectorErrors: (string | null)[] = sectorDates.map((sd, i) => {
                if (sd.depDate && sd.arrDate && sd.arrDate < sd.depDate) return 'Arr ก่อน Dep'
                if (i > 0) { const prev = sectorDates[i - 1]; if (prev.arrDate && sd.depDate && sd.depDate < prev.arrDate) return `Dep ก่อน Arr S${i}` }
                if (sd.depDate && sd.arrDate === sd.depDate && sd.depTime && sd.arrTime && sd.arrTime < sd.depTime) return 'เวลาถึงก่อนเวลาออก'
                return null
              })

              return (
                <Fragment key={r.rowId}>
                  {sectorDates.map((sd, sIdx) => {
                    const isFirstRow = sIdx === 0
                    const isLastSector = sIdx === sectorDates.length - 1
                    const s = sch.sectors[sIdx]
                    const sectorErr = sectorErrors[sIdx]
                    // Use same formula as getSectors: depDate = travelStart + (dayOffset - 1)
                    const travelStartDisplay = sectorDates[0]?.depDate || ''
                    const expectedDep = s && travelStartDisplay ? calcSectorDepDate(travelStartDisplay, s.dayOffset) : ''
                    const expectedArr = expectedDep && s ? addDaysToDate(expectedDep, s.arrDayOffset) : ''
                    const isDepManual = sd.depManual || !!(sd.depDate && expectedDep && sd.depDate !== expectedDep)
                    const isArrManual = sd.arrManual || !!(sd.arrDate && expectedArr && sd.arrDate !== expectedArr)
                    // During shiftConfirm pending, show original dates everywhere — no partial preview
                    const displayDep = sd.depDate || ''
                    const displayArr = sd.arrDate || ''
                    const rowBorderB = isLastSector ? pnrBorderB : 'border-b border-b-[#E5EAF0]'

                    return (
                      <tr key={`${r.rowId}-${sIdx}`}
                        data-pnr-idx={isFirstRow ? pnrIdx : undefined}
                        style={{ height: 36, backgroundColor: hvBg, transition: 'background-color 1.2s ease' }}
                        onMouseEnter={() => setHoveredIdx(pnrIdx)}
                        onMouseLeave={() => setHoveredIdx(null)}>

                        {/* Checkbox (review only, PNR-level) */}
                        {showCheckbox && isFirstRow && (
                          <td rowSpan={sectorCount}
                            className={cn('border-r border-[#E5EAF0] text-center align-middle', pnrBorderB)}
                            style={{ backgroundColor: hvBg }}>
                            <input type="checkbox" checked={!!r.selected} onChange={() => onToggleSelect?.(r.rowId)}
                              className="rounded border-slate-300 text-emerald-600" />
                          </td>
                        )}

                        {/* # */}
                        {isFirstRow && (
                          <td rowSpan={sectorCount}
                            className={cn('border-r border-[#E5EAF0] text-center align-middle overflow-hidden', pnrBorderB)}
                            style={{ backgroundColor: hvBg }}>
                            <span className="text-[11px] text-slate-400 select-none">{pnrIdx + 1}</span>
                          </td>
                        )}

                        {/* PNR */}
                        {isFirstRow && (
                          <td rowSpan={sectorCount}
                            className={cn('border-r border-[#E5EAF0] align-middle text-center overflow-hidden', pnrBorderB, pnrErr ? 'bg-red-50' : '')}
                            style={{ backgroundColor: pnrErr ? undefined : hvBg }}>
                            <div className="px-1">
                              {readOnly ? (
                                <>
                                  <span className="text-[12px] font-mono font-bold text-slate-800 block leading-tight">
                                    {r.pnrCode || r.dummyPnr || <span className="text-slate-300 italic text-[10px] font-sans">ไม่ระบุ</span>}
                                  </span>
                                  {r.dummyPnr && !r.pnrCode && <div className="text-[9px] text-amber-500 font-mono truncate leading-none mt-0.5">Dummy</div>}
                                </>
                              ) : (
                                <>
                                  <input
                                    value={r.pnrCode}
                                    maxLength={7}
                                    onChange={e => update(pnrIdx, { pnrCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                                    onPaste={e => { e.preventDefault(); const v = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); update(pnrIdx, { pnrCode: v }) }}
                                    onBlur={() => markTouched(pnrIdx)}
                                    placeholder="ว่างได้"
                                    className={cn(
                                      'w-full min-w-0 h-7 text-[12px] font-mono text-center bg-transparent focus:outline-none',
                                      'border rounded px-1 py-0 transition-colors placeholder:text-slate-300 placeholder:text-[10px]',
                                      pnrErr ? 'border-red-300 text-red-600' : 'border-transparent text-slate-800 hover:border-slate-200 focus:border-[#05a94f]'
                                    )}
                                  />
                                  {pnrErr && <p className="text-[9px] text-red-500 leading-none mt-0.5 truncate">PNR ซ้ำ</p>}
                                  {!pnrErr && r.dummyPnr && <div className="text-[9px] text-slate-300 font-mono truncate leading-none mt-0.5">{r.dummyPnr}</div>}
                                </>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Flight Set */}
                        {isFirstRow && (
                          <td rowSpan={sectorCount}
                            className={cn('border-r border-[#E5EAF0] px-[5px] align-middle overflow-hidden', pnrBorderB)}
                            style={{ backgroundColor: hvBg }}>
                            {readOnly ? (
                              <span className="text-[12px] text-slate-600 block overflow-hidden text-ellipsis whitespace-nowrap" title={fsName}>{fsName}</span>
                            ) : scheduleTemplates.length > 1 ? (
                              <select value={r.activeScheduleId ?? sch.scheduleId}
                                onChange={e => {
                                  const newSchId = e.target.value || undefined
                                  const newSch = scheduleTemplates.find(t => t.scheduleId === newSchId)
                                    ?? scheduleTemplates.find(t => t.isMain)
                                    ?? scheduleTemplates[0]
                                  const travelStart = r.sectors[0]?.depDate || ''
                                  // Recalculate all sector dates using the new Flight Set's dayOffset values
                                  const newSects = recalcSectorDates(travelStart, newSch.sectors, r.sectors)
                                  update(pnrIdx, { activeScheduleId: newSchId, sectors: newSects })
                                  markTouched(pnrIdx)
                                }}
                                className="w-full min-w-0 h-7 text-[12px] bg-transparent border-0 focus:outline-none cursor-pointer text-slate-700 truncate">
                                {scheduleTemplates.map(t => <option key={t.scheduleId} value={t.scheduleId}>{t.scheduleName}{t.isMain ? ' ★' : ''}</option>)}
                              </select>
                            ) : (
                              <span className="text-[12px] text-slate-600 block overflow-hidden text-ellipsis whitespace-nowrap" title={fsName}>{fsName}</span>
                            )}
                          </td>
                        )}

                        {/* Sector badge */}
                        <td className={cn(TD_SEC_C, rowBorderB)} style={{ backgroundColor: hvSec }}>
                          <span className={cn('inline-block text-[10px] font-bold px-1 py-0.5 rounded leading-none',
                            s?.sectorType === 'Departure' ? 'text-emerald-700 bg-emerald-100' :
                            s?.sectorType === 'Arrival'   ? 'text-blue-700 bg-blue-100' : 'text-slate-600 bg-slate-100')}>
                            S{sIdx + 1}
                          </span>
                        </td>

                        {/* Day — Travel Day number (from Flight Set) + weekday derived from dep date */}
                        <td className={cn(TD_SEC_C, 'text-[11px] font-medium', rowBorderB)} style={{ backgroundColor: hvSec }}>
                          {s?.dayOffset ? (
                            <span className="inline-flex items-center gap-0.5 leading-none">
                              <span className="text-[10px] font-bold text-slate-500">D{s.dayOffset}</span>
                              <span className="text-slate-300 text-[9px] select-none">·</span>
                              <span className="text-slate-500">{getDayLabel(displayDep)}</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">{getDayLabel(displayDep)}</span>
                          )}
                        </td>

                        {/* Dep Date */}
                        <td className={cn(TD_SEC, rowBorderB, sectorErr || (touched && sIdx === 0 && !r.sectors[0]?.depDate) ? 'bg-red-50' : '')}
                          style={{ backgroundColor: (sectorErr || (touched && sIdx === 0 && !r.sectors[0]?.depDate)) ? undefined : hvSec }}>
                          {readOnly ? (
                            <div className={cn('flex items-center h-7 px-1 text-[12px] tabular-nums', isDepManual ? 'text-orange-600 font-medium' : 'text-slate-700')}>
                              {displayDep ? formatTravelDate(displayDep) : '—'}
                            </div>
                          ) : (
                            <div className="flex items-center h-7 group/dep">
                              <input type="date" value={displayDep}
                                onChange={e => handleDepChange(pnrIdx, sIdx, e.target.value)}
                                onBlur={() => markTouched(pnrIdx)}
                                className={cn('flex-1 min-w-0 h-7 text-[12px] bg-transparent border-0 focus:outline-none tabular-nums',
                                  isDepManual ? 'text-orange-600 font-medium' : 'text-slate-700')}
                              />
                              {isDepManual && (
                                <button type="button" onClick={() => handleResetSector(pnrIdx, sIdx)} title="คืนค่าตาม Flight Set"
                                  className="opacity-0 group-hover/dep:opacity-100 text-orange-400 hover:text-emerald-600 transition-all shrink-0">
                                  <RotateCcw size={11} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Dep Time */}
                        <td className={cn(TD_SEC_C, 'px-0', rowBorderB)} style={{ backgroundColor: hvSec, width: 78, minWidth: 78, maxWidth: 78 }}>
                          {readOnly ? (
                            <div className={cn('flex items-center justify-center h-7 text-[12px] tabular-nums', sd.timeOverride ? 'text-orange-600 font-medium' : 'text-slate-700')}>
                              {sd.depTime || '—'}
                            </div>
                          ) : (
                            <TimeInput value={sd.depTime ?? ''} onChange={v => handleDepTimeChange(pnrIdx, sIdx, v)}
                              compact
                              className={cn('border-0 bg-transparent focus:outline-none text-center w-full min-w-0 h-7 text-[12px]',
                                sd.timeOverride ? 'text-orange-600 font-medium' : 'text-slate-700')}
                            />
                          )}
                        </td>

                        {/* Arr Date */}
                        <td className={cn(TD_SEC, rowBorderB, sectorErr ? 'bg-red-50' : '')} style={{ backgroundColor: sectorErr ? undefined : hvSec }}>
                          {readOnly ? (
                            <div className={cn('flex items-center h-7 px-1 text-[12px] tabular-nums', isArrManual ? 'text-orange-600 font-medium' : 'text-slate-700')}>
                              {displayArr ? formatTravelDate(displayArr) : '—'}
                            </div>
                          ) : (
                            <div className="flex items-center h-7 group/arr">
                              <input type="date" value={displayArr}
                                onChange={e => handleArrChange(pnrIdx, sIdx, e.target.value)}
                                onBlur={() => markTouched(pnrIdx)}
                                className={cn('flex-1 min-w-0 h-7 text-[12px] bg-transparent border-0 focus:outline-none tabular-nums',
                                  isArrManual ? 'text-orange-600 font-medium' : 'text-slate-700')}
                              />
                              {isArrManual && (
                                <button type="button" onClick={() => handleResetSector(pnrIdx, sIdx)} title="คืนค่าตาม Flight Set"
                                  className="opacity-0 group-hover/arr:opacity-100 text-orange-400 hover:text-emerald-600 transition-all shrink-0">
                                  <RotateCcw size={11} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Arr Time + +Day */}
                        <td className={cn(TD_SEC_C, 'px-0', rowBorderB)} style={{ backgroundColor: hvSec, width: 92, minWidth: 92, maxWidth: 92 }}>
                          <div className="h-7 items-center justify-center"
                            style={{ display: 'grid', gridTemplateColumns: '58px 26px', columnGap: 3 }}>
                            {readOnly ? (
                              <div className={cn('flex items-center justify-center h-7 text-[12px] tabular-nums', sd.timeOverride ? 'text-orange-600 font-medium' : 'text-slate-700')}>
                                {sd.arrTime || '—'}
                              </div>
                            ) : (
                              <TimeInput value={sd.arrTime ?? ''} onChange={v => handleArrTimeChange(pnrIdx, sIdx, v)}
                                compact
                                className={cn('border-0 bg-transparent focus:outline-none text-center w-full min-w-0 h-7 text-[12px] tabular-nums',
                                  sd.timeOverride ? 'text-orange-600 font-medium' : 'text-slate-700')}
                              />
                            )}
                            <div style={{ width: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                              {(() => {
                                const pd = calculatePlusDay(sd.depDate || null, sd.arrDate || null)
                                return (
                                  <span title={pd && pd > 0 ? (pd === 1 ? 'ถึงวันถัดไป' : `ถึงอีก ${pd} วัน`) : undefined}
                                    style={{ visibility: pd && pd > 0 ? 'visible' : 'hidden', minWidth: 22 }}
                                    className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded px-[3px] py-[1px] text-center select-none whitespace-nowrap">
                                    +{pd ?? 0}
                                  </span>
                                )
                              })()}
                            </div>
                          </div>
                        </td>

                        {/* PNR-level cells — first row only, rowspan */}
                        {isFirstRow && (
                          <>
                            {/* Seat */}
                            <td rowSpan={sectorCount} className={cn(TD_C, pnrBorderB, missingSeat ? 'bg-red-50' : '')} style={{ backgroundColor: missingSeat ? undefined : hvBg }}>
                              {readOnly ? (
                                <span className="text-[12px] font-medium text-slate-800 tabular-nums">{r.seatTotal || '—'}</span>
                              ) : (
                                <input type="number" min={1} value={r.seatTotal || ''}
                                  onChange={e => update(pnrIdx, { seatTotal: parseInt(e.target.value) || 0 })}
                                  onBlur={() => markTouched(pnrIdx)}
                                  className={cn('w-full min-w-0 h-7 text-center text-[12px] font-medium bg-transparent border-0 focus:outline-none',
                                    missingSeat ? 'text-red-500' : 'text-slate-800')}
                                />
                              )}
                            </td>

                            {/* รายละเอียดราคา */}
                            <td rowSpan={sectorCount}
                              className={cn('border-r border-[#E5EAF0] align-top overflow-hidden box-border', pnrBorderB)}
                              style={{ backgroundColor: hvBg, transition: 'background-color 1.2s ease' }}>
                              {readOnly ? (
                                <div className="flex flex-col py-1">
                                  <div className="flex items-center justify-between px-1 pb-0.5 mb-0.5 border-b border-[#E5EAF0]">
                                    <span className={cn('text-[11px] font-bold', fmt === 'FARE_YQ' ? 'text-amber-700' : fmt === 'ALL_IN' ? 'text-blue-700' : 'text-slate-600')}>
                                      {fmt === 'FARE_YQ' ? 'FARE+YQ' : fmt === 'ALL_IN' ? 'ALL IN' : 'FARE'}
                                    </span>
                                    <span className="text-[11px] font-mono text-slate-500">{r.currency || currency}</span>
                                  </div>
                                  <div className="flex items-center h-[18px] px-1">
                                    <span className="w-[26px] shrink-0 text-[10px] text-slate-500 leading-none">{fmt === 'ALL_IN' ? 'AllIn' : 'Fare'}</span>
                                    <span className="flex-1 text-right text-[11px] font-medium text-slate-800 tabular-nums pr-0.5">{r.fare > 0 ? r.fare.toLocaleString() : '—'}</span>
                                  </div>
                                  {!taxDisabled && (
                                    <div className="flex items-center h-[18px] px-1">
                                      <span className="w-[26px] shrink-0 text-[10px] text-slate-500 leading-none">Tax</span>
                                      <span className={cn('flex-1 text-right text-[11px] tabular-nums pr-0.5', r.tax == null ? 'text-slate-300 italic text-[10px]' : 'text-slate-700')}>{r.tax != null ? r.tax.toLocaleString() : 'ยังไม่ระบุ'}</span>
                                    </div>
                                  )}
                                  {!yqDisabled && (
                                    <div className="flex items-center h-[18px] px-1">
                                      <span className="w-[26px] shrink-0 text-[10px] text-slate-500 leading-none">YQ</span>
                                      <span className={cn('flex-1 text-right text-[11px] tabular-nums pr-0.5', r.yq == null ? 'text-slate-300 italic text-[10px]' : 'text-slate-700')}>{r.yq != null ? r.yq.toLocaleString() : 'ยังไม่ระบุ'}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center h-[18px] px-1 border-t border-[#E5EAF0] mt-0.5">
                                    <span className="w-[26px] shrink-0 text-[10px] text-slate-400 leading-none">Total</span>
                                    <span className="flex-1 text-right text-[11px] font-bold text-[#05a94f] tabular-nums pr-0.5">{r.totalAmount > 0 ? r.totalAmount.toLocaleString() : '—'}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col py-1">
                                  <div className="flex items-center justify-between px-1 pb-0.5 mb-0.5 border-b border-[#E5EAF0]">
                                    <select value={fmt}
                                      onChange={e => handlePriceTypeChange(pnrIdx, e.target.value as 'FARE' | 'FARE_YQ' | 'ALL_IN')}
                                      className={cn('h-[22px] text-[11px] font-bold cursor-pointer focus:outline-none border-0 bg-transparent rounded py-0 pl-0 pr-3 min-w-0',
                                        fmt === 'FARE_YQ' ? 'text-amber-700' : fmt === 'ALL_IN' ? 'text-blue-700' : 'text-slate-600')}>
                                      <option value="FARE">FARE</option>
                                      <option value="FARE_YQ">FARE+YQ</option>
                                      <option value="ALL_IN">ALL IN</option>
                                    </select>
                                    <CurrencyCombobox variant="inline" value={r.currency || currency} stockDefault={currency}
                                      currencies={currencyOptions} onChange={code => handleCurrencyChange(pnrIdx, code)}
                                      className="w-[38px]" />
                                  </div>
                                  {/* Fare / AllIn */}
                                  <div className={cn('flex items-center h-[18px] px-1', fareErr ? 'bg-red-50/60 rounded' : '')}>
                                    <span className="w-[26px] shrink-0 text-[10px] text-slate-500 leading-none">{fmt === 'ALL_IN' ? 'AllIn' : 'Fare'}</span>
                                    <div className="flex-1 min-w-0">
                                      <PriceInput value={r.fare > 0 ? r.fare : null} compact hasError={fareErr}
                                        onChange={v => { const f = v ?? 0; update(pnrIdx, { fare: f, totalAmount: calcPnrTotal(fmt, f, r.tax ?? null, r.yq ?? null) }) }}
                                        onBlur={() => markTouched(pnrIdx)} />
                                    </div>
                                  </div>
                                  {/* Tax */}
                                  <div className={cn('flex items-center h-[18px] px-1', !taxDisabled && taxErr ? 'bg-red-50/60 rounded' : '')}>
                                    <span className={cn('w-[26px] shrink-0 text-[10px] leading-none', taxDisabled ? 'text-slate-300' : 'text-slate-500')}>Tax</span>
                                    <div className="flex-1 min-w-0">
                                      {taxDisabled
                                        ? <span className="block w-full text-right text-[10px] text-slate-300 pr-0.5">ไม่ใช้</span>
                                        : <PriceInput value={r.tax ?? null} compact nullable hasError={taxErr}
                                            onChange={v => update(pnrIdx, { tax: v, totalAmount: calcPnrTotal(fmt, r.fare, v, r.yq ?? null) })}
                                            onBlur={() => markTouched(pnrIdx)} />
                                      }
                                    </div>
                                  </div>
                                  {/* YQ */}
                                  <div className={cn('flex items-center h-[18px] px-1', !yqDisabled && yqErr ? 'bg-red-50/60 rounded' : '')}>
                                    <span className={cn('w-[26px] shrink-0 text-[10px] leading-none', yqDisabled ? 'text-slate-300' : 'text-slate-500')}>YQ</span>
                                    <div className="flex-1 min-w-0">
                                      {yqDisabled
                                        ? <span className="block w-full text-right text-[10px] text-slate-300 pr-0.5">ไม่ใช้</span>
                                        : <PriceInput value={r.yq ?? null} compact nullable hasError={yqErr}
                                            onChange={v => update(pnrIdx, { yq: v, totalAmount: calcPnrTotal(fmt, r.fare, r.tax, v) })}
                                            onBlur={() => markTouched(pnrIdx)} />
                                      }
                                    </div>
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Condition */}
                            <td rowSpan={sectorCount} className={cn(TD_L, pnrBorderB)} style={{ backgroundColor: hvBg }}>
                              {readOnly ? (
                                <span className="text-[12px] text-slate-600 px-1 block truncate">
                                  {r.conditionId ? (conditions.find(c => c.conditionId === r.conditionId)?.conditionName || r.conditionId) : 'ไม่ระบุ'}
                                </span>
                              ) : (
                                <select value={r.conditionId || ''}
                                  onChange={e => update(pnrIdx, { conditionId: e.target.value })}
                                  className="w-full min-w-0 h-7 text-[12px] bg-transparent border-0 focus:outline-none cursor-pointer text-slate-600">
                                  <option value="">ไม่ระบุ</option>
                                  {conditions.map(c => <option key={c.conditionId} value={c.conditionId}>{c.conditionName}</option>)}
                                </select>
                              )}
                            </td>

                            {/* NAME TTL */}
                            <td rowSpan={sectorCount}
                              className={cn(TD_L, pnrBorderB, !readOnly && ttlPopover === pnrIdx ? 'outline outline-1 outline-offset-[-1px] outline-[#05a94f]' : '')}
                              style={{ backgroundColor: hvBg }}>
                              {readOnly ? (
                                <div className="px-2 min-h-[28px] flex flex-col justify-center">
                                  {hasTtlFn(r) && r.ttlDate ? (
                                    <>
                                      <span className={cn('font-medium text-[11px] whitespace-nowrap leading-[16px]',
                                        ttlSt === 'past' ? 'text-red-600' : ttlSt === 'near' ? 'text-amber-700' : 'text-slate-700')}>
                                        {formatDateTimeThai(r.ttlDate, r.ttlTime ?? null)}
                                      </span>
                                      {r.ttlType === 'DAYS_BEFORE' && r.ttlDaysBefore != null && (
                                        <span className="text-[9px] text-slate-400 leading-[16px] whitespace-nowrap">ก่อนเดินทาง {r.ttlDaysBefore} วัน</span>
                                      )}
                                      {r.ttlType === 'FIXED_DATE' && (
                                        <span className="text-[9px] text-slate-400 leading-[16px]">วันที่กำหนดเอง</span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-slate-400 text-[10px]">ไม่ระบุ</span>
                                  )}
                                </div>
                              ) : null}
                              {!readOnly && <Popover.Root open={ttlPopover === pnrIdx} onOpenChange={open => setTtlPopover(open ? pnrIdx : null)}>
                                <Popover.Trigger asChild>
                                  <button type="button"
                                    title={hasTtlFn(r) && r.ttlDate
                                      ? `${formatDateTimeThai(r.ttlDate, r.ttlTime ?? null)}${r.ttlType === 'DAYS_BEFORE' ? ` · ก่อนเดินทาง ${r.ttlDaysBefore} วัน` : ' · วันที่กำหนดเอง'}`
                                      : 'ยังไม่ได้กำหนด NAME TTL — คลิกเพื่อตั้งค่า'}
                                    className={cn('group w-full h-full min-h-[28px] flex flex-col items-start justify-center gap-0 px-2 py-0.5 rounded text-left transition-colors',
                                      ttlSt === 'past' ? 'text-red-600 hover:bg-red-50' :
                                      ttlSt === 'near' ? 'text-amber-700 hover:bg-amber-50' :
                                      hasTtlFn(r) ? 'text-slate-700 hover:bg-slate-50' : 'hover:bg-slate-50')}>
                                    {hasTtlFn(r) && r.ttlDate ? (
                                      <>
                                        <div className="w-full flex items-center justify-between gap-1">
                                          <span className="font-medium text-[11px] whitespace-nowrap leading-[16px]">
                                            {formatDateTimeThai(r.ttlDate, r.ttlTime ?? null)}
                                          </span>
                                          <Pencil size={9} className="text-slate-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                        {(r.ttlType === 'DAYS_BEFORE' || r.ttlType === 'FIXED_DATE') && (
                                          <span className="text-[9px] leading-[16px] text-slate-400 whitespace-nowrap">
                                            {r.ttlType === 'DAYS_BEFORE' ? `ก่อนเดินทาง ${r.ttlDaysBefore} วัน` : 'วันที่กำหนดเอง'}
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-slate-400 text-[10px]">ไม่ระบุ</span>
                                    )}
                                  </button>
                                </Popover.Trigger>
                                <Popover.Portal>
                                  <Popover.Content side="bottom" align="end" sideOffset={6}
                                    avoidCollisions collisionPadding={8}
                                    style={{ width: 360, maxWidth: 'calc(100vw - 32px)', zIndex: 9200 }}>
                                    <TtlEditor
                                      pnrCode={r.pnrCode || r.dummyPnr || undefined}
                                      travelDate={sectorDates[0]?.depDate ?? null}
                                      ttlType={r.ttlType as TtlType}
                                      ttlDaysBefore={r.ttlDaysBefore ?? null}
                                      ttlDate={r.ttlDate ?? null}
                                      ttlTime={r.ttlTime ?? null}
                                      onSave={val => {
                                        update(pnrIdx, {
                                          ttlType: val.ttlType, ttlDaysBefore: val.ttlDaysBefore,
                                          ttlDate: val.ttlDate, ttlTime: val.ttlTime,
                                        })
                                        setTtlPopover(null)
                                      }}
                                      onClose={() => setTtlPopover(null)}
                                    />
                                  </Popover.Content>
                                </Popover.Portal>
                              </Popover.Root>}
                            </td>

                            {/* Remark */}
                            <td rowSpan={sectorCount} className={cn(TD_L, pnrBorderB)} style={{ backgroundColor: hvBg }}>
                              {readOnly ? (
                                <span className="text-[12px] text-slate-600 px-1.5 block truncate py-1">
                                  {r.remark || <span className="text-slate-300">—</span>}
                                </span>
                              ) : (
                              <Popover.Root open={remarkPopover === pnrIdx} onOpenChange={open => setRemarkPopover(open ? pnrIdx : null)}>
                                <Popover.Trigger asChild>
                                  <button type="button" title={r.remark || undefined}
                                    className="w-full h-7 flex items-center px-1.5 text-left rounded hover:bg-slate-50 transition-colors">
                                    {r.remark
                                      ? <span className="text-[12px] text-slate-600 truncate">{r.remark}</span>
                                      : <span className="text-slate-300 text-[12px]">—</span>}
                                  </button>
                                </Popover.Trigger>
                                <Popover.Portal>
                                  <Popover.Content side="bottom" align="end" sideOffset={4}
                                    avoidCollisions collisionPadding={8}
                                    style={{ width: 240, zIndex: 9200 }}>
                                    <div className="bg-white border border-slate-200 rounded-xl shadow-2xl p-3 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-700">หมายเหตุ PNR #{pnrIdx + 1}</span>
                                        <button type="button" onClick={() => setRemarkPopover(null)} className="text-slate-300 hover:text-slate-500 text-base leading-none">×</button>
                                      </div>
                                      <textarea value={r.remark} onChange={e => update(pnrIdx, { remark: e.target.value })}
                                        autoFocus rows={3} placeholder="พิมพ์หมายเหตุ..."
                                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-[#05a94f] focus:ring-1 focus:ring-[#05a94f]/20 text-slate-700 placeholder:text-slate-300"
                                      />
                                      <div className="flex justify-end">
                                        <button type="button" onClick={() => setRemarkPopover(null)}
                                          className="px-3 py-1 text-xs font-semibold bg-[#05a94f] text-white rounded-lg hover:bg-[#048f43] transition-colors">
                                          เสร็จสิ้น
                                        </button>
                                      </div>
                                    </div>
                                  </Popover.Content>
                                </Popover.Portal>
                              </Popover.Root>
                              )}
                            </td>

                            {/* Action */}
                            {showAction && <td rowSpan={sectorCount} className={cn('border-b', pnrBorderB, 'align-middle p-0')} style={{ backgroundColor: hvBg }}>
                              <div className="w-full h-full flex items-center justify-center" style={{ minHeight: 36 * sectorCount }}>
                                <DropdownMenu.Root>
                                  <DropdownMenu.Trigger asChild>
                                    <button type="button" title="จัดการรายการ"
                                      className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors text-[16px] font-bold leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
                                      ⋮
                                    </button>
                                  </DropdownMenu.Trigger>
                                  <DropdownMenu.Portal>
                                    <DropdownMenu.Content side="bottom" align="end" sideOffset={4}
                                      style={{ zIndex: 9200 }}
                                      className="bg-white border border-slate-200 rounded-xl shadow-2xl py-1 min-w-[148px] text-xs outline-none">
                                      {onDuplicate && (
                                        <DropdownMenu.Item onSelect={() => onDuplicate(r.rowId)}
                                          className="flex items-center gap-2 px-3 py-1.5 text-slate-600 cursor-pointer outline-none select-none data-[highlighted]:bg-slate-50">
                                          <Copy size={12} className="shrink-0" />คัดลอก PNR
                                        </DropdownMenu.Item>
                                      )}
                                      <DropdownMenu.Item onSelect={() => handleResetAllSectors(pnrIdx)}
                                        className="flex items-center gap-2 px-3 py-1.5 text-slate-600 cursor-pointer outline-none select-none data-[highlighted]:bg-slate-50">
                                        <RotateCcw size={12} className="shrink-0" />คืนค่าตาม Flight Set
                                      </DropdownMenu.Item>
                                      <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
                                      <DropdownMenu.Item onSelect={() => onDelete(r.rowId)}
                                        className="flex items-center gap-2 px-3 py-1.5 text-red-600 cursor-pointer outline-none select-none data-[highlighted]:bg-red-50">
                                        <Trash2 size={12} className="shrink-0" />ลบ PNR
                                      </DropdownMenu.Item>
                                    </DropdownMenu.Content>
                                  </DropdownMenu.Portal>
                                </DropdownMenu.Root>
                              </div>
                            </td>}
                          </>
                        )}
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
