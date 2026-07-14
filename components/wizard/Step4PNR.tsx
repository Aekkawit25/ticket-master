'use client'

import { useRef, useState, useMemo, useEffect, Fragment } from 'react'
import { PlusCircle, Trash2, Copy, Info, CalendarDays, FileUp, Download, AlertTriangle, RefreshCw, RotateCcw, Pencil } from 'lucide-react'
import { cn, formatTravelDate, calcTravelEndFromSectors, calcSectorDate, calculatePlusDay } from '@/lib/utils'
import { hasTtl } from '@/lib/ttl-utils'
import { TtlEditor } from '@/components/shared/TtlEditor'
import { BulkPnrBuilder } from '@/components/shared/BulkPnrBuilder'
import type { BulkPnrRow, BulkPnrSector, BulkPnrCondition } from '@/components/shared/BulkPnrBuilder'
import type { FlightPNRFormData, FlightSectorFormData, FlightScheduleFormData, PNRStatus, TaxType } from '@/types'
import type { AppCondition } from '@/lib/condition-schema'
import { TimeInput } from '@/components/ui/time-input'
import ImportExcelModal from '@/components/wizard/ImportExcelModal'
import type { PastedExcelRow } from '@/lib/paste-excel'
import { downloadPnrTemplate } from '@/lib/excel-template'
import { getDemoStocks } from '@/lib/demo-storage'
import { getCurrencyOptions } from '@/lib/currency-storage'
import { CurrencyCombobox } from '@/components/shared/CurrencyCombobox'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = { Pending: 'รอยืนยัน', Confirmed: 'ยืนยันแล้ว' }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emptyPNR(defaultCurrency = 'THB'): FlightPNRFormData {
  return {
    pnr_code: '', dummy_pnr: '', travel_start: '', travel_end: '',
    seat_total: 40, price_format: 'FARE', fare: 0, yq: null, tax_type: 'separate',
    tax: null, total_amount: 0, currency: defaultCurrency, condition_id: '',
    status: 'Pending', pnr_status: 'PENDING', confirmation_status: 'PENDING_CONFIRMATION',
    remark: '', sector_dates: [], ttl_status: 'UNSET', ttl_date: null,
    ttl_time: null, ttl_remark: '', ttl_type: 'NONE', ttl_days_before: null,
  }
}

function calcPnrTotal(fmt: string, fare: number, tax: number | null, yq: number | null): number {
  if (fmt === 'ALL_IN') return fare
  if (fmt === 'FARE_YQ') return fare + (yq ?? 0)
  return fare + (tax ?? 0) + (yq ?? 0)
}

const TTL_NEAR_DAYS = 7
function getTtlStatus(ttlDate: string | null, ttlTime: string | null): 'unset' | 'past' | 'near' | 'ok' {
  if (!ttlDate) return 'unset'
  const now = new Date()
  const ttlDt = new Date(`${ttlDate}T${ttlTime || '00:00'}:00`)
  if (isNaN(ttlDt.getTime())) return 'unset'
  if (ttlDt < now) return 'past'
  if (ttlDt.getTime() - now.getTime() <= TTL_NEAR_DAYS * 86400000) return 'near'
  return 'ok'
}

function formatTtlDisplay(ttlDate: string | null, ttlTime: string | null): string {
  if (!ttlDate) return '—'
  const d = formatTravelDate(ttlDate)
  return ttlTime ? `${d} ${ttlTime}` : d
}

function subtractDaysFromDate(dateStr: string, days: number): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() - days)
    return d.toISOString().split('T')[0]
  } catch { return '' }
}

const DOW_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
function getDayLabel(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr + 'T12:00:00')
    if (isNaN(d.getTime())) return '—'
    return DOW_LABELS[d.getDay()]
  } catch { return '—' }
}

function addDaysToDate(dateStr: string, days: number): string {
  if (!dateStr) return ''
  if (days === 0) return dateStr
  try {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  } catch { return dateStr }
}

// ─── PriceInput ───────────────────────────────────────────────────────────────
function PriceInput({
  value, nullable = false, disabled = false, hasError = false, errorTitle,
  onChange, onBlur, cell = false,
}: {
  value: number | null; nullable?: boolean; disabled?: boolean
  hasError?: boolean; errorTitle?: string; cell?: boolean
  onChange: (v: number | null) => void; onBlur?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState(() => (value == null ? '' : String(value)))
  const preEditRef = useRef<number | null>(null)

  useEffect(() => {
    if (inputRef.current !== document.activeElement) setRaw(value == null ? '' : String(value))
  }, [value])

  const fmtDisplay = (v: number | null) =>
    v == null ? '' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const parse = (s: string): number | null => {
    const t = s.trim()
    if (t === '') return null
    const n = Number(t)
    return (isNaN(n) || n < 0) ? null : Math.round(n * 100) / 100
  }
  const commit = (rawStr: string) => { const v = parse(rawStr); onChange(v); setRaw(v == null ? '' : String(v)) }

  if (disabled) {
    return <span className="text-slate-300 select-none text-[12px] block text-right pr-1">—</span>
  }

  return (
    <input ref={inputRef} type="text" inputMode="decimal"
      value={focused ? raw : fmtDisplay(value)}
      placeholder={focused ? (nullable ? '—' : '0.00') : (value == null ? 'ยังไม่ระบุ' : '')}
      title={hasError && errorTitle ? errorTitle : undefined}
      className={cn(
        'w-full bg-transparent focus:outline-none tabular-nums transition-colors',
        cell
          ? cn('text-[12px] h-7 border-0 text-right px-1 py-0',
              hasError ? 'text-red-500' : '',
              !focused && value == null ? 'placeholder:text-slate-300' : 'text-slate-800 font-medium')
          : cn('text-xs px-2.5 py-1.5 border rounded-lg',
              hasError ? 'border-red-300 bg-red-50/40 focus:border-red-400' :
              focused ? 'border-[#05a94f] bg-emerald-50/20' : 'border-slate-200 focus:border-[#05a94f]',
              !focused && value == null ? 'placeholder:text-slate-300' : 'text-slate-800 font-semibold'),
      )}
      onFocus={e => { preEditRef.current = value; setFocused(true); setRaw(value == null ? '' : String(value)); requestAnimationFrame(() => e.target.select()) }}
      onBlur={() => { setFocused(false); commit(raw); onBlur?.() }}
      onChange={e => setRaw(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); const p = preEditRef.current; onChange(p); setRaw(p == null ? '' : String(p)); setFocused(false); inputRef.current?.blur() }
        else if (e.key === 'Enter') { e.preventDefault(); commit(raw); setFocused(false); inputRef.current?.blur() }
      }}
    />
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Step4Props {
  pnrs: FlightPNRFormData[]
  schedules: FlightScheduleFormData[]
  conditions: AppCondition[]
  currency: string
  onChange: (pnrs: FlightPNRFormData[]) => void
  showValidation?: boolean
}

// ─── Frozen column offsets: # 42 | PNR 110 | FS 145 ────────────────────────────
const L0 = 0    // #
const L1 = 42   // PNR
const L2 = 152  // FlightSet  (42+110)

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Step4PNR({ pnrs, schedules, conditions, currency, onChange, showValidation = false }: Step4Props) {
  const mainSectors = schedules.find(s => s.isMain)?.sectors ?? schedules[0]?.sectors ?? []
  const getPnrSectors = (pnr: FlightPNRFormData): FlightSectorFormData[] => {
    if (!pnr.schedule_id) return mainSectors
    return schedules.find(s => s.scheduleId === pnr.schedule_id)?.sectors ?? mainSectors
  }
  const sectors = mainSectors

  const [touchedRows, setTouchedRows] = useState<Set<number>>(new Set())
  const markTouched = (idx: number) => setTouchedRows(prev => { if (prev.has(idx)) return prev; const n = new Set(prev); n.add(idx); return n })

  const [hoveredPnrIdx, setHoveredPnrIdx] = useState<number | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null)
  const [bulkTtlOpen, setBulkTtlOpen] = useState(false)
  const [bulkTtlMode, setBulkTtlMode] = useState<'days_before' | 'fixed_date'>('days_before')
  const [bulkTtlDays, setBulkTtlDays] = useState('14')
  const [bulkTtlFixedDate, setBulkTtlFixedDate] = useState('')
  const [bulkTtlTime, setBulkTtlTime] = useState('17:00')
  const [bulkTtlScope, setBulkTtlScope] = useState<'no_ttl' | 'all' | 'selected'>('no_ttl')
  const [bulkTtlSelectedPnrs, setBulkTtlSelectedPnrs] = useState<Set<number>>(new Set())
  const [bulkTtlInnerStep, setBulkTtlInnerStep] = useState<'config' | 'overwrite_confirm'>('config')
  const [priceTypeConfirm, setPriceTypeConfirm] = useState<{ idx: number; newFmt: 'FARE' | 'FARE_YQ' | 'ALL_IN' } | null>(null)
  const [currencyConfirm, setCurrencyConfirm] = useState<{ idx: number; newCurrency: string } | null>(null)
  const [ttlPopover, setTtlPopover] = useState<{ idx: number; pos: { top: number; left: number; width: number } } | null>(null)
  const [shiftConfirm, setShiftConfirm] = useState<{ pnrIdx: number; origDep: string; newDep: string } | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2500)
  }

  const currencyOptions = useMemo(() => getCurrencyOptions(), [])
  const existingPnrCodes = useMemo(() => {
    const draftCodes = pnrs.map(p => p.pnr_code).filter(Boolean)
    try {
      const sysCodes = getDemoStocks().flatMap(s => s.pnrs.flatMap(p => [p.pnrCode, p.dummyPnr].filter(Boolean) as string[]))
      return [...new Set([...draftCodes, ...sysCodes])]
    } catch { return draftCodes }
  }, [pnrs])

  // ─── getSectorDatesForPnr ────────────────────────────────────────────────
  const getSectorDatesForPnr = (p: FlightPNRFormData, sects: FlightSectorFormData[]) => {
    if (p.sector_dates && p.sector_dates.length === sects.length) {
      return p.sector_dates.map((sd, i) => {
        const s = sects[i]
        const dayOffsetChanged = s && sd.day_offset !== s.day_offset
        const shouldRecompute = !sd.dep_manual && !!p.travel_start && (!sd.travel_date || dayOffsetChanged)
        const dep = shouldRecompute ? (calcSectorDate(p.travel_start, s.day_offset) ?? '') : sd.travel_date
        const arr = sd.arr_manual ? (sd.arr_date ?? '') : (dep ? addDaysToDate(dep, s?.arr_day_offset ?? 0) : '')
        return { ...sd, day_offset: s?.day_offset ?? sd.day_offset, travel_date: dep, arr_date: arr,
          dep_time: sd.dep_time !== undefined ? sd.dep_time : (s?.dep_time ?? ''),
          arr_time: sd.arr_time !== undefined ? sd.arr_time : (s?.arr_time ?? '') }
      })
    }
    return sects.map(s => {
      const dep = p.travel_start ? calcSectorDate(p.travel_start, s.day_offset) ?? '' : ''
      return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
        arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '',
        dep_manual: false as const, arr_manual: false as const,
        dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
    })
  }

  // ─── Price handlers ────────────────────────────────────────────────────────
  const commitPriceTypeChange = (idx: number, newFmt: 'FARE' | 'FARE_YQ' | 'ALL_IN') => {
    const p = pnrs[idx]
    const newTax = newFmt === 'FARE' ? p.tax : null
    const newYq = newFmt !== 'ALL_IN' ? p.yq ?? null : null
    update(idx, { price_format: newFmt, fare: p.fare, tax: newTax, yq: newYq, total_amount: calcPnrTotal(newFmt, p.fare, newTax, newYq) })
  }
  const handlePriceTypeChange = (idx: number, newFmt: 'FARE' | 'FARE_YQ' | 'ALL_IN') => {
    const p = pnrs[idx]; const oldFmt = (p.price_format ?? 'FARE') as string
    if (newFmt === oldFmt) return
    const losingTax = (newFmt === 'FARE_YQ' || newFmt === 'ALL_IN') && (p.tax ?? 0) > 0
    const losingYq = newFmt === 'ALL_IN' && (p.yq ?? 0) > 0
    if (losingTax || losingYq) { setPriceTypeConfirm({ idx, newFmt }); return }
    commitPriceTypeChange(idx, newFmt)
  }
  const handleFareChange = (idx: number, v: number | null) => {
    const p = pnrs[idx]; const fmt = p.price_format ?? 'FARE'; const fareVal = v ?? 0
    update(idx, { fare: fareVal, total_amount: calcPnrTotal(fmt, fareVal, p.tax ?? null, p.yq ?? null) })
  }
  const handleTaxChange = (idx: number, v: number | null) => {
    const p = pnrs[idx]; const fmt = p.price_format ?? 'FARE'
    update(idx, { tax: v, total_amount: calcPnrTotal(fmt, p.fare, v, p.yq ?? null) })
  }
  const handleYqChange = (idx: number, v: number | null) => {
    const p = pnrs[idx]; const fmt = p.price_format ?? 'FARE'
    update(idx, { yq: v, total_amount: calcPnrTotal(fmt, p.fare, p.tax, v) })
  }
  const handleCurrencyChange = (idx: number, newCode: string) => {
    const p = pnrs[idx]
    if ((p.fare > 0) || ((p.yq ?? 0) > 0)) { setCurrencyConfirm({ idx, newCurrency: newCode }); return }
    update(idx, { currency: newCode })
  }

  // ─── Sector date handlers ──────────────────────────────────────────────────
  const handleSectorDepChange = (pnrIdx: number, sIdx: number, newDep: string) => {
    const p = pnrs[pnrIdx]; const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const currentDep = currentSDs[sIdx]?.travel_date ?? ''
    if (sIdx === 0) {
      if (currentDep && newDep !== currentDep) { setShiftConfirm({ pnrIdx, origDep: currentDep, newDep }); return }
      const newSDs = sects.map((s, i) => {
        const dep = newDep ? calcSectorDate(newDep, s.day_offset) ?? '' : ''
        return { ...currentSDs[i], sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
          arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const }
      })
      markTouched(pnrIdx)
      onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_start: newDep, travel_end: newSDs[newSDs.length - 1]?.arr_date || '', sector_dates: newSDs }))
      return
    }
    const newSDs = currentSDs.map((sd, i) => i === sIdx ? { ...sd, travel_date: newDep, dep_manual: !!newDep } : sd)
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_start: row.travel_start || newDep, sector_dates: newSDs }))
  }
  const handleSectorArrChange = (pnrIdx: number, sIdx: number, newArr: string) => {
    const p = pnrs[pnrIdx]; const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const newSDs = currentSDs.map((sd, i) => i === sIdx ? { ...sd, arr_date: newArr, arr_manual: !!newArr } : sd)
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_end: sIdx === currentSDs.length - 1 ? newArr : row.travel_end, sector_dates: newSDs }))
  }
  const handleSectorDepTimeChange = (pnrIdx: number, sIdx: number, newTime: string) => {
    const p = pnrs[pnrIdx]; const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const tmpl = sects[sIdx]?.dep_time ?? ''
    const newSDs = currentSDs.map((sd, i) => i !== sIdx ? sd : {
      ...sd, dep_time: newTime,
      time_override: (newTime !== tmpl) || ((sd.arr_time ?? '') !== (sects[i]?.arr_time ?? ''))
    })
    markTouched(pnrIdx); onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, sector_dates: newSDs }))
  }
  const handleSectorArrTimeChange = (pnrIdx: number, sIdx: number, newTime: string) => {
    const p = pnrs[pnrIdx]; const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const tmpl = sects[sIdx]?.arr_time ?? ''
    const newSDs = currentSDs.map((sd, i) => i !== sIdx ? sd : {
      ...sd, arr_time: newTime,
      time_override: ((sd.dep_time ?? '') !== (sects[i]?.dep_time ?? '')) || (newTime !== tmpl)
    })
    markTouched(pnrIdx); onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, sector_dates: newSDs }))
  }

  const confirmRecalcAll = () => {
    if (!shiftConfirm) return
    const { pnrIdx, newDep } = shiftConfirm; const p = pnrs[pnrIdx]; const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const newSDs = sects.map((s, i) => {
      const dep = calcSectorDate(newDep, s.day_offset) ?? ''; const sd = currentSDs[i]
      return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
        arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
        dep_time: sd?.dep_time ?? (s.dep_time ?? ''), arr_time: sd?.arr_time ?? (s.arr_time ?? ''), time_override: sd?.time_override ?? false }
    })
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_start: newDep, travel_end: newSDs[newSDs.length - 1]?.arr_date || '', date_sync_status: 'SYNCED' as const, sector_dates: newSDs }))
    setShiftConfirm(null)
  }
  const confirmRecalcNonManual = () => {
    if (!shiftConfirm) return
    const { pnrIdx, newDep } = shiftConfirm; const p = pnrs[pnrIdx]; const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const newSDs = sects.map((s, i) => {
      const sd = currentSDs[i]
      if (sd?.dep_manual) {
        return { ...sd, day_offset: s.day_offset, arr_date: sd.arr_manual ? (sd.arr_date ?? '') : (sd.travel_date ? addDaysToDate(sd.travel_date, s.arr_day_offset ?? 0) : '') }
      }
      const dep = calcSectorDate(newDep, s.day_offset) ?? ''
      return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
        arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
        dep_time: sd?.dep_time ?? (s.dep_time ?? ''), arr_time: sd?.arr_time ?? (s.arr_time ?? ''), time_override: sd?.time_override ?? false }
    })
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_start: newDep, travel_end: newSDs[newSDs.length - 1]?.arr_date || '', date_sync_status: 'SYNCED' as const, sector_dates: newSDs }))
    setShiftConfirm(null)
  }
  const confirmKeepManual = () => {
    if (!shiftConfirm) return
    const { pnrIdx, newDep } = shiftConfirm; const p = pnrs[pnrIdx]; const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const newSDs = currentSDs.map((sd, i) => i === 0 ? { ...sd, travel_date: newDep, dep_manual: false as const } : sd)
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_start: newDep, sector_dates: newSDs }))
    setShiftConfirm(null)
  }

  const handleResetSector = (pnrIdx: number, sIdx: number) => {
    const p = pnrs[pnrIdx]; const sects = getPnrSectors(p); const s = sects[sIdx]
    if (!p.travel_start || !s) return
    const currentSDs = getSectorDatesForPnr(p, sects)
    const dep = calcSectorDate(p.travel_start, s.day_offset) ?? ''
    const arr = dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : ''
    const newSDs = currentSDs.map((sd, i) => i === sIdx
      ? { ...sd, travel_date: dep, arr_date: arr, dep_manual: false as const, arr_manual: false as const, dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
      : sd)
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_end: sIdx === sects.length - 1 ? arr : row.travel_end, sector_dates: newSDs }))
  }
  const handleResetAllSectors = (pnrIdx: number) => {
    const p = pnrs[pnrIdx]; const sects = getPnrSectors(p); if (!p.travel_start) return
    const newSDs = sects.map(s => {
      const dep = calcSectorDate(p.travel_start!, s.day_offset) ?? ''
      return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
        arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
        dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
    })
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_end: newSDs[newSDs.length - 1]?.arr_date || '', date_sync_status: 'SYNCED' as const, sector_dates: newSDs }))
  }

  const update = (idx: number, patch: Partial<FlightPNRFormData>) => {
    onChange(pnrs.map((p, i) => {
      if (i !== idx) return p
      const base = { ...p, ...patch }
      const pnrSectors = getPnrSectors(base)
      const needsDateRecompute = patch.travel_start !== undefined || patch.schedule_id !== undefined
      const travel_end = needsDateRecompute
        ? ((base.travel_end_override && base.travel_start) ? base.travel_end : calcTravelEndFromSectors(base.travel_start, pnrSectors) || '')
        : base.travel_end
      const sector_dates = needsDateRecompute
        ? pnrSectors.map(s => {
            const dep = calcSectorDate(base.travel_start, s.day_offset) || ''
            return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
              arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
              dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
          })
        : base.sector_dates
      const dummy_pnr = patch.pnr_code !== undefined && patch.pnr_code.trim() ? '' : base.dummy_pnr
      return { ...base, travel_end, sector_dates, dummy_pnr }
    }))
  }

  const addRow = () => onChange([...pnrs, emptyPNR(currency)])

  const addBulkPNRs = (rows: BulkPnrRow[]) => {
    const newPNRs: FlightPNRFormData[] = rows.map(row => {
      const pnr = emptyPNR(currency)
      pnr.pnr_code = row.pnrCode; pnr.dummy_pnr = ''
      pnr.travel_start = row.travelStart
      pnr.travel_end = row.travelEnd || calcTravelEndFromSectors(row.travelStart, sectors) || ''
      pnr.sector_dates = sectors.map(s => {
        const dep = calcSectorDate(row.travelStart, s.day_offset) || ''
        return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
          arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
          dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
      })
      pnr.seat_total = row.seatTotal; pnr.price_format = row.priceFormat as 'FARE' | 'FARE_YQ' | 'ALL_IN'
      pnr.fare = row.fare; pnr.tax_type = row.taxType as TaxType
      pnr.tax = row.priceFormat === 'FARE' ? (row.tax ?? null) : null
      pnr.yq = row.priceFormat !== 'ALL_IN' ? (row.yq ?? null) : null
      pnr.total_amount = row.total; pnr.condition_id = row.conditionCode
      pnr.status = (row.status || 'Pending') as PNRStatus; pnr.remark = row.remark
      pnr.ttl_type = row.ttlType; pnr.ttl_days_before = row.ttlDaysBefore
      pnr.ttl_status = row.ttlType !== 'NONE' && row.ttlDate ? 'SET' : 'UNSET'
      pnr.ttl_date = row.ttlDate ?? null; pnr.ttl_time = row.ttlTime ?? null
      return pnr
    })
    onChange([...pnrs, ...newPNRs])
  }

  const addPastedPNRs = (rows: PastedExcelRow[]) => {
    const newPNRs: FlightPNRFormData[] = rows.map(row => {
      const pnr = emptyPNR(currency)
      pnr.pnr_code = row.pnrCode; pnr.travel_start = row.outboundDate
      pnr.travel_end = row.returnDate || calcTravelEndFromSectors(row.outboundDate, sectors) || ''
      pnr.sector_dates = sectors.map(s => {
        const dep = calcSectorDate(row.outboundDate, s.day_offset) || ''
        return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
          arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
          dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
      })
      pnr.seat_total = row.seatCount; pnr.fare = 0; pnr.tax_type = 'separate'; pnr.tax = null; pnr.total_amount = 0
      pnr.condition_id = conditions.length === 1 ? conditions[0].conditionId : ''; pnr.status = 'Pending'
      return pnr
    })
    onChange([...pnrs, ...newPNRs])
  }

  const builderSectors: BulkPnrSector[] = sectors.map(s => ({ sectorType: s.sector_type, dayOffset: s.day_offset }))
  const builderConditions: BulkPnrCondition[] = conditions.map(c => ({
    code: c.conditionId, name: c.conditionName,
    stages: c.stages.map(st => ({ paymentBaseDate: st.dueType === 'TRAVEL_MINUS_DAYS' ? 'Travel Start' : 'Created Date', paymentDueDaysBefore: st.dueDays, paymentDueTime: st.dueTime })),
    ttlRule: { calcType: c.ttlRule?.calcType ?? 'NOT_SET', baseDate: 'Travel Start', daysBefore: c.ttlRule?.daysBefore ?? 0, date: c.ttlRule?.fixedDate, time: c.ttlRule?.time },
  }))

  const deleteRow = (idx: number) => setDeleteConfirmIdx(idx)
  const confirmDelete = () => {
    if (deleteConfirmIdx === null) return
    onChange(pnrs.filter((_, i) => i !== deleteConfirmIdx))
    setTouchedRows(new Set()); setDeleteConfirmIdx(null)
  }
  const duplicateRow = (idx: number) => {
    const src = pnrs[idx]
    onChange([...pnrs.slice(0, idx + 1), { ...src, id: undefined, pnr_code: '', dummy_pnr: '' }, ...pnrs.slice(idx + 1)])
  }

  const getTargetPnrIndices = (): number[] => {
    if (bulkTtlScope === 'all') return pnrs.map((_, i) => i)
    if (bulkTtlScope === 'selected') return [...bulkTtlSelectedPnrs].sort((a, b) => a - b)
    return pnrs.reduce<number[]>((acc, p, i) => { if (!hasTtl(p)) acc.push(i); return acc }, [])
  }
  const computeTtlDateForPnr = (pnr: FlightPNRFormData): string | null => {
    if (bulkTtlMode === 'fixed_date') return bulkTtlFixedDate || null
    const days = parseInt(bulkTtlDays, 10)
    if (isNaN(days) || days < 0 || !pnr.travel_start) return null
    return subtractDaysFromDate(pnr.travel_start, days)
  }
  const closeBulkTtl = () => { setBulkTtlOpen(false); setBulkTtlInnerStep('config') }
  const commitBulkTtl = (mode: 'all' | 'skip_existing') => {
    const targets = getTargetPnrIndices(); const updated = [...pnrs]; let changed = false
    for (const i of targets) {
      if (mode === 'skip_existing' && hasTtl(updated[i])) continue
      const ttlDate = computeTtlDateForPnr(updated[i]); if (!ttlDate) continue
      const ttlType = bulkTtlMode === 'days_before' ? 'DAYS_BEFORE' : 'FIXED_DATE'
      const ttlDaysBefore = bulkTtlMode === 'days_before' ? parseInt(bulkTtlDays, 10) : null
      updated[i] = { ...updated[i], ttl_type: ttlType, ttl_days_before: ttlDaysBefore, ttl_status: 'SET', ttl_date: ttlDate, ttl_time: bulkTtlTime || null }
      changed = true
    }
    if (changed) onChange(updated)
    closeBulkTtl()
  }
  const handleBulkTtlConfirm = () => {
    const targets = getTargetPnrIndices(); if (targets.length === 0) return
    if (targets.some(i => hasTtl(pnrs[i])) && bulkTtlScope !== 'no_ttl') { setBulkTtlInnerStep('overwrite_confirm'); return }
    commitBulkTtl('all')
  }

  const outdatedCount = pnrs.filter(p => p.date_sync_status === 'OUTDATED').length
  const updateOutdatedPNRs = () => {
    onChange(pnrs.map(p => {
      if (p.date_sync_status !== 'OUTDATED' || !p.travel_start) return p
      const pnrSectors = getPnrSectors(p); const currentSDs = getSectorDatesForPnr(p, pnrSectors)
      const newSDs = pnrSectors.map((s, i) => {
        const dep = calcSectorDate(p.travel_start!, s.day_offset) ?? ''; const sd = currentSDs[i]
        return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
          arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
          dep_time: sd?.dep_time ?? (s.dep_time ?? ''), arr_time: sd?.arr_time ?? (s.arr_time ?? ''), time_override: sd?.time_override ?? false }
      })
      return { ...p, travel_end: calcTravelEndFromSectors(p.travel_start, pnrSectors) ?? p.travel_end, travel_end_override: false, sector_dates: newSDs, date_sync_status: 'SYNCED' as const }
    }))
  }

  const ttlTargetIndices = bulkTtlOpen ? getTargetPnrIndices() : []
  const ttlExistingTtlCount = ttlTargetIndices.filter(i => hasTtl(pnrs[i])).length
  const ttlNoTtlCount = ttlTargetIndices.filter(i => !hasTtl(pnrs[i])).length
  const ttlDaysNum = parseInt(bulkTtlDays, 10)
  const ttlDaysValid = !isNaN(ttlDaysNum) && ttlDaysNum >= 0
  const ttlTimeValid = /^\d{2}:\d{2}$/.test(bulkTtlTime)
  const ttlCanApply = (bulkTtlMode === 'days_before' ? ttlDaysValid : !!bulkTtlFixedDate) && ttlTimeValid && ttlTargetIndices.length > 0
  const ttlPreviewRows = ttlTargetIndices.slice(0, 4).map(i => {
    const pnr = pnrs[i]
    const computedDate = bulkTtlMode === 'days_before' ? (ttlDaysValid && pnr.travel_start ? subtractDaysFromDate(pnr.travel_start, ttlDaysNum) : null) : (bulkTtlFixedDate || null)
    return { index: i, pnr, computedDate }
  })
  const ttlNoDepsCount = bulkTtlMode === 'days_before' ? ttlTargetIndices.filter(i => !pnrs[i].travel_start).length : 0
  const ttlPastWarning = ttlPreviewRows.some(r => r.computedDate ? getTtlStatus(r.computedDate, bulkTtlTime) === 'past' : false)

  const summaryStats = useMemo(() => {
    const totalPnr = pnrs.length
    const totalSeats = pnrs.reduce((acc, p) => acc + (p.seat_total || 0), 0)
    const confirmedCount = pnrs.filter(p => p.status === 'Confirmed').length
    const pendingCount = totalPnr - confirmedCount
    const noTtlCount = pnrs.filter(p => !hasTtl(p)).length
    return { totalPnr, totalSeats, confirmedCount, pendingCount, noTtlCount }
  }, [pnrs])

  const activeConfirmBanner = shiftConfirm ? 'shift' : priceTypeConfirm ? 'priceType' : currencyConfirm ? 'currency' : null

  // ─────────────────────────────────────────────────────────────────────────────
  // Shared class builders (scoped inside component to access isHovered per row)
  const GH = 'border-r border-b border-[#E5EAF0] px-1.5 py-0 h-[34px] align-middle text-[11px] font-medium text-slate-600 whitespace-nowrap select-none bg-[#F0F4F8]'
  const GH_C = cn(GH, 'text-center')
  const GH_R = cn(GH, 'text-right')

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-1.5">

      {/* Global focus-within highlight for table cells */}
      <style>{`.s4grid td:focus-within{outline:1.5px solid #05a94f;outline-offset:-1px;position:relative;z-index:1}.s4grid th{vertical-align:middle}`}</style>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-slate-800/95 text-white text-xs px-4 py-2 rounded-full shadow-xl pointer-events-none">
          {toastMsg}
        </div>
      )}

      {/* OUTDATED banner */}
      {outdatedCount > 0 && (
        <div className="flex items-center gap-2.5 px-3 py-1.5 bg-amber-50 border border-amber-300 rounded-lg">
          <AlertTriangle size={12} className="text-amber-600 shrink-0" />
          <span className="text-[12px] text-amber-800 flex-1">มี {outdatedCount} PNR ที่ใช้วันที่จาก Flight Set เวอร์ชันเดิม</span>
          <button type="button" onClick={updateOutdatedPNRs}
            className="flex items-center gap-1 text-[11px] font-semibold text-amber-800 border border-amber-400 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded transition-colors whitespace-nowrap">
            <RefreshCw size={11} />อัปเดตทั้งหมด
          </button>
        </div>
      )}

      {/* Confirmation banners */}
      {activeConfirmBanner === 'shift' && shiftConfirm && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-800 flex-wrap">
          <CalendarDays size={12} className="shrink-0 text-blue-500" />
          <span className="flex-1 min-w-0">Travel Start เปลี่ยนเป็น <strong>{formatTravelDate(shiftConfirm.newDep)}</strong> — คำนวณวันที่ Sector อื่นใหม่อย่างไร?</span>
          <button type="button" onClick={confirmRecalcAll} className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-semibold hover:bg-blue-700 whitespace-nowrap shrink-0">คำนวณใหม่ทุก Sector</button>
          <button type="button" onClick={confirmRecalcNonManual} className="px-2 py-0.5 bg-white border border-blue-300 text-blue-700 rounded text-[10px] hover:bg-blue-50 whitespace-nowrap shrink-0">เฉพาะที่ไม่ได้แก้เอง</button>
          <button type="button" onClick={confirmKeepManual} className="px-2 py-0.5 bg-white border border-slate-300 text-slate-600 rounded text-[10px] hover:bg-slate-50 whitespace-nowrap shrink-0">คงค่าที่แก้เอง</button>
          <button type="button" onClick={() => setShiftConfirm(null)} className="text-slate-400 hover:text-slate-600 text-[10px] whitespace-nowrap shrink-0 px-1">ยกเลิก</button>
        </div>
      )}
      {activeConfirmBanner === 'priceType' && priceTypeConfirm && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex-wrap">
          <span className="shrink-0">⚠</span>
          <span className="flex-1 min-w-0">
            {(() => { const pp = pnrs[priceTypeConfirm.idx]; const lt = (priceTypeConfirm.newFmt === 'FARE_YQ' || priceTypeConfirm.newFmt === 'ALL_IN') && (pp.tax ?? 0) > 0; const ly = priceTypeConfirm.newFmt === 'ALL_IN' && (pp.yq ?? 0) > 0; return lt && ly ? 'ค่า Tax / YQ จะถูกล้าง' : lt ? 'ค่า Tax จะถูกล้าง' : 'ค่า YQ จะถูกล้าง' })()} — PNR #{priceTypeConfirm.idx + 1}
          </span>
          <button type="button" onClick={() => { commitPriceTypeChange(priceTypeConfirm.idx, priceTypeConfirm.newFmt); setPriceTypeConfirm(null) }} className="px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-semibold hover:bg-amber-700 whitespace-nowrap shrink-0">ล้างและเปลี่ยน</button>
          <button type="button" onClick={() => setPriceTypeConfirm(null)} className="px-2 py-0.5 bg-white border border-amber-300 text-amber-700 rounded text-[10px] hover:bg-amber-50 whitespace-nowrap shrink-0">ยกเลิก</button>
        </div>
      )}
      {activeConfirmBanner === 'currency' && currencyConfirm && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex-wrap">
          <span className="shrink-0">⚠</span>
          <span className="flex-1 min-w-0">เปลี่ยนสกุลเงิน PNR #{currencyConfirm.idx + 1} เป็น <strong className="font-mono">{currencyConfirm.newCurrency}</strong> — ราคาไม่ถูกแปลงอัตโนมัติ</span>
          <button type="button" onClick={() => { update(currencyConfirm.idx, { currency: currencyConfirm.newCurrency }); setCurrencyConfirm(null) }} className="px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-semibold hover:bg-amber-700 whitespace-nowrap shrink-0">เปลี่ยน</button>
          <button type="button" onClick={() => setCurrencyConfirm(null)} className="px-2 py-0.5 bg-white border border-amber-300 text-amber-700 rounded text-[10px] hover:bg-amber-50 whitespace-nowrap shrink-0">ยกเลิก</button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5 flex-wrap px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg min-h-[38px]">
        <div className="flex items-center gap-1 text-[11px] text-slate-400 flex-1 min-w-0">
          <Info size={11} className="text-blue-400 shrink-0" />
          <span className="truncate">PNR ว่างได้ · ระบบคำนวณวันที่ Sector ให้อัตโนมัติ</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {([
            { label: '+ เพิ่ม PNR', onClick: addRow, cls: 'text-white bg-[#05a94f] hover:bg-[#048f43] border-[#05a94f]' },
            { label: 'Import', onClick: () => setImportOpen(true), cls: 'text-blue-600 border-blue-300 hover:bg-blue-50', icon: <FileUp size={11} /> },
            { label: 'Template', onClick: () => downloadPnrTemplate(sectors), cls: 'text-slate-600 border-slate-300 hover:bg-slate-100', icon: <Download size={11} /> },
            { label: 'หลาย PNR', onClick: () => setBulkOpen(true), cls: 'text-[#05a94f] border-[#05a94f] hover:bg-green-50', icon: <CalendarDays size={11} /> },
            { label: 'ตั้ง TTL', onClick: () => { setBulkTtlOpen(true); setBulkTtlInnerStep('config') }, cls: 'text-amber-700 border-amber-400 hover:bg-amber-50', disabled: pnrs.length === 0, icon: <CalendarDays size={11} /> },
          ] as const).map(btn => (
            <button key={btn.label} type="button" onClick={btn.onClick} disabled={'disabled' in btn ? btn.disabled : false}
              className={cn('h-[30px] flex items-center gap-1 px-2.5 text-[12px] font-medium border rounded-md transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed', btn.cls)}>
              {'icon' in btn && btn.icon}{btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Excel Grid ── */}
      <div className="overflow-auto border border-slate-200 rounded-xl bg-white shadow-sm"
        style={{ maxHeight: pnrs.length > 10 ? 'calc(100vh - 260px)' : undefined }}>
        <table className="s4grid text-[12px]" style={{ minWidth: 1769, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
          <colgroup>
            <col style={{ width: 42 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 145 }} />
            <col style={{ width: 54 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 52 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 82 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 105 }} />
            <col style={{ width: 94 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 64 }} />
          </colgroup>

          {/* ── Header ── */}
          <thead className="sticky top-0 z-30">
            <tr>
              {/* Frozen — z-40 so they sit above scrolling body AND above non-frozen header cells */}
              <th className={cn(GH_C, 'sticky z-40')} style={{ left: L0 }}>#</th>
              <th className={cn(GH, 'sticky z-40 text-left')} style={{ left: L1 }}>PNR</th>
              <th className={cn(GH, 'sticky z-40 text-left border-r-[2px] border-r-slate-300')} style={{ left: L2, boxShadow: '4px 0 6px -6px rgba(15,23,42,0.35)' }}>Flight Set</th>
              {/* Sector columns — solid bg so scrolled content doesn't bleed through */}
              <th className={cn(GH_C, 'bg-[#EDF5FF]')}>Sector</th>
              <th className={cn(GH_C, 'bg-[#EDF5FF]')}>Day</th>
              <th className={cn(GH_C, 'bg-[#EDF5FF]')}>Dep Date</th>
              <th className={cn(GH_C, 'bg-[#EDF5FF]')}>Dep Time</th>
              <th className={cn(GH_C, 'bg-[#EDF5FF]')}>Arr Date</th>
              <th className={cn(GH_C, 'bg-[#EDF5FF]')}>Arr Time</th>
              <th className={cn(GH_C, 'bg-[#EDF5FF]')}>+Day</th>
              {/* PNR columns */}
              <th className={GH_C}>Seat</th>
              <th className={GH_C}>ประเภทราคา</th>
              <th className={GH_R}>Fare</th>
              <th className={GH_R}>Tax</th>
              <th className={GH_R}>YQ</th>
              <th className={GH_C}>สกุลเงิน</th>
              <th className={cn(GH, 'text-left')}>Condition</th>
              <th className={cn(GH, 'text-left')}>TTL</th>
              <th className={GH_C}>การยืนยัน</th>
              <th className={cn(GH, 'text-left')}>Remark</th>
              <th className={GH_C}>Action</th>
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody>
            {pnrs.length === 0 && (
              <tr>
                <td colSpan={21} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <PlusCircle size={28} className="text-slate-200" strokeWidth={1} />
                    <p className="text-[13px] text-slate-400">ยังไม่มีรายการ PNR</p>
                    <p className="text-[11px] text-slate-300">กดปุ่ม &quot;+ เพิ่ม PNR&quot; หรือ &quot;หลาย PNR&quot; ด้านบน</p>
                  </div>
                </td>
              </tr>
            )}

            {pnrs.map((p, pnrIdx) => {
              const rowSectors = getPnrSectors(p)
              const sectorDates = getSectorDatesForPnr(p, rowSectors)
              const sectorCount = Math.max(sectorDates.length, 1)
              const isHovered = hoveredPnrIdx === pnrIdx
              const touched = touchedRows.has(pnrIdx) || showValidation
              const fmt = (p.price_format ?? 'FARE') as 'FARE' | 'FARE_YQ' | 'ALL_IN'
              const missingSeat = touched && (!p.seat_total || p.seat_total <= 0)
              const fareErr = touched && !(p.fare > 0)
              const taxErr = touched && fmt === 'FARE' && p.tax == null
              const yqErr = touched && (fmt === 'FARE' || fmt === 'FARE_YQ') && p.yq == null
              const missingDate = touched && !p.travel_start
              const ttlSt = getTtlStatus(p.ttl_date ?? null, p.ttl_time ?? null)
              const activeScheduleId = p.schedule_id ?? schedules.find(s => s.isMain)?.scheduleId ?? schedules[0]?.scheduleId ?? ''
              const fsName = schedules.find(s => s.scheduleId === activeScheduleId)?.scheduleName ?? schedules[0]?.scheduleName ?? 'Default'
              const hv = isHovered ? '#EFF6FF' : '#FFFFFF'  // always opaque for frozen sticky cols
              const hvRow = isHovered ? 'bg-[#F0F7FF]' : ''  // solid hover for non-frozen cells
              // With border-separate: use border-b only (no border-t to avoid double lines).
              // Rowspan cells' border-b lands at the PNR group boundary — make it thicker.
              const isLastPnr = pnrIdx === pnrs.length - 1
              const groupBorderB = isLastPnr ? 'border-b border-b-[#E5EAF0]' : 'border-b-2 border-b-slate-300'
              const G = 'border-r border-[#E5EAF0] overflow-hidden px-1.5 align-middle'  // base cell
              const GC = cn(G, 'text-center')
              const GR = cn(G, 'text-right')
              // Rowspan cells span the entire PNR group — border-b lands after the last sector.
              // Use groupBorderB (PNR-level separator) instead of per-sector rowBorderB.
              const GRowSpan  = cn(G, groupBorderB, hvRow)
              const GCRowSpan = cn(GC, groupBorderB, hvRow)
              const GRRowSpan = cn(GR, groupBorderB, hvRow)
              const taxDisabled = fmt !== 'FARE'
              const yqDisabled = fmt === 'ALL_IN'

              const sectorErrors: (string | null)[] = sectorDates.map((sd, i) => {
                if (sd.travel_date && sd.arr_date && sd.arr_date < sd.travel_date) return 'Arr ก่อน Dep'
                if (i > 0) { const prev = sectorDates[i - 1]; if (prev.arr_date && sd.travel_date && sd.travel_date < prev.arr_date) return `Dep ก่อน Arr S${i}` }
                return null
              })

              return (
                <Fragment key={pnrIdx}>
                  {sectorDates.map((sd, sIdx) => {
                    const isFirstRow = sIdx === 0
                    const s = rowSectors[sIdx]
                    const sectorErr = sectorErrors[sIdx]
                    const expectedDep = p.travel_start && s ? calcSectorDate(p.travel_start, s.day_offset) ?? '' : ''
                    const expectedArr = expectedDep && s ? addDaysToDate(expectedDep, s.arr_day_offset ?? 0) : ''
                    const isDepManual = sd.dep_manual != null ? !!sd.dep_manual : !!(sd.travel_date && expectedDep && sd.travel_date !== expectedDep)
                    const isArrManual = sd.arr_manual != null ? !!sd.arr_manual : !!(sd.arr_date && expectedArr && sd.arr_date !== expectedArr)
                    const displayDep = shiftConfirm?.pnrIdx === pnrIdx && sIdx === 0 ? shiftConfirm.newDep : (sd.travel_date || '')
                    const displayArr = sd.arr_date || ''
                    // sector row: last sector row of a PNR group gets the thick border-b separator
                    const isLastSector = sIdx === sectorDates.length - 1
                    const rowBorderB = isLastSector ? groupBorderB : 'border-b border-b-[#E5EAF0]'
                    const GCRow = cn(GC, rowBorderB, hvRow)
                    const GSec = cn(G, 'bg-[#F8FAFC]', rowBorderB, hvRow) // sector col solid tint

                    return (
                      <tr key={`${pnrIdx}-${sIdx}`} style={{ height: 36 }}
                        onMouseEnter={() => setHoveredPnrIdx(pnrIdx)}
                        onMouseLeave={() => setHoveredPnrIdx(null)}>

                        {/* ── FROZEN LEFT (rowspan) — opaque bg hides content scrolling behind ── */}
                        {isFirstRow && (
                          <>
                            <td rowSpan={sectorCount}
                              className={cn('sticky z-20 border-r border-[#E5EAF0] text-center align-middle overflow-hidden', groupBorderB)}
                              style={{ left: L0, backgroundColor: hv }}>
                              <span className="text-[11px] text-slate-400">{pnrIdx + 1}</span>
                            </td>
                            <td rowSpan={sectorCount}
                              className={cn('sticky z-20 border-r border-[#E5EAF0] px-1.5 align-top pt-1 overflow-hidden', groupBorderB)}
                              style={{ left: L1, backgroundColor: hv }}>
                              <input value={p.pnr_code}
                                onChange={e => update(pnrIdx, { pnr_code: e.target.value.toUpperCase() })}
                                placeholder="ว่างได้"
                                className="w-full min-w-0 h-7 text-[12px] font-mono uppercase bg-transparent border-0 focus:outline-none text-slate-800 placeholder:text-slate-300"
                              />
                              {p.dummy_pnr && <div className="text-[9px] text-slate-300 font-mono truncate leading-none">{p.dummy_pnr}</div>}
                            </td>
                            <td rowSpan={sectorCount}
                              className={cn('sticky z-20 border-r-[2px] border-r-slate-300 border-[#E5EAF0] px-1.5 align-middle overflow-hidden', groupBorderB)}
                              style={{ left: L2, backgroundColor: hv, boxShadow: '4px 0 6px -6px rgba(15,23,42,0.35)' }}>
                              {schedules.length > 1 ? (
                                <select value={activeScheduleId}
                                  onChange={e => update(pnrIdx, { schedule_id: e.target.value || undefined })}
                                  className="w-full min-w-0 h-7 text-[12px] bg-transparent border-0 focus:outline-none cursor-pointer text-slate-700">
                                  {schedules.map(sch => <option key={sch.scheduleId} value={sch.scheduleId}>{sch.scheduleName}{sch.isMain ? ' ★' : ''}</option>)}
                                </select>
                              ) : (
                                <span className="text-[12px] text-slate-600 block overflow-hidden text-ellipsis whitespace-nowrap" title={fsName}>{fsName}</span>
                              )}
                            </td>
                          </>
                        )}

                        {/* ── SECTOR columns ── */}
                        <td className={cn(GCRow, 'bg-slate-50/50')}>
                          <span className={cn('inline-block text-[10px] font-bold px-1 py-0.5 rounded leading-none',
                            s?.sector_type === 'Departure' ? 'text-emerald-700 bg-emerald-100' :
                            s?.sector_type === 'Arrival'   ? 'text-blue-700 bg-blue-100' : 'text-slate-600 bg-slate-100')}>
                            S{sIdx + 1}
                          </span>
                        </td>

                        {/* Day (read-only) */}
                        <td className={cn(GSec, 'text-center text-[11px] text-slate-500 font-medium')}>
                          {getDayLabel(displayDep)}
                        </td>

                        {/* Dep Date */}
                        <td className={cn(GSec, sectorErr ? 'bg-red-50/30' : '', missingDate && sIdx === 0 ? 'bg-red-50/30' : '')}>
                          <div className="flex items-center gap-0.5 group/dep h-7">
                            <input type="date" value={displayDep}
                              onChange={e => handleSectorDepChange(pnrIdx, sIdx, e.target.value)}
                              onBlur={() => markTouched(pnrIdx)}
                              className={cn('flex-1 min-w-0 h-7 text-[12px] bg-transparent border-0 focus:outline-none tabular-nums',
                                isDepManual ? 'text-orange-600 font-medium' : 'text-slate-700',
                                missingDate && sIdx === 0 ? 'text-red-400' : '')}
                            />
                            {isDepManual && (
                              <button type="button" onClick={() => handleResetSector(pnrIdx, sIdx)} title="คืนค่าตาม Flight Set"
                                className="opacity-0 group-hover/dep:opacity-100 text-orange-400 hover:text-emerald-600 transition-all shrink-0">
                                <RotateCcw size={11} />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Dep Time */}
                        <td className={cn(GSec, 'text-center px-0.5')}>
                          <TimeInput value={sd.dep_time ?? ''} onChange={v => handleSectorDepTimeChange(pnrIdx, sIdx, v)}
                            compact
                            className={cn('border-0 bg-transparent focus:outline-none text-center w-full h-7 text-[12px]',
                              sd.time_override ? 'text-orange-600 font-medium' : 'text-slate-700')}
                          />
                        </td>

                        {/* Arr Date */}
                        <td className={cn(GSec, sectorErr ? 'bg-red-50/30' : '')}>
                          <div className="flex items-center gap-0.5 group/arr h-7">
                            <input type="date" value={displayArr}
                              onChange={e => handleSectorArrChange(pnrIdx, sIdx, e.target.value)}
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
                        </td>

                        {/* Arr Time */}
                        <td className={cn(GSec, 'text-center px-0.5')}>
                          <TimeInput value={sd.arr_time ?? ''} onChange={v => handleSectorArrTimeChange(pnrIdx, sIdx, v)}
                            compact
                            className={cn('border-0 bg-transparent focus:outline-none text-center w-full h-7 text-[12px]',
                              sd.time_override ? 'text-orange-600 font-medium' : 'text-slate-700')}
                          />
                        </td>

                        {/* +Day (read-only) */}
                        <td className={cn(GCRow, 'bg-[#F8FAFC] select-none text-[12px]')}>
                          {(() => {
                            const pd = calculatePlusDay(sd.travel_date || null, sd.arr_date || null)
                            if (pd === null) return <span className="text-slate-200">—</span>
                            if (pd < 0) return <span className="text-red-500 font-bold">{pd}</span>
                            if (pd === 0) return <span className="text-slate-300">0</span>
                            return <span className="text-amber-600 font-semibold">+{pd}</span>
                          })()}
                        </td>

                        {/* ── PNR-LEVEL columns (rowspan) — border-b lands at end of last sector ── */}
                        {isFirstRow && (
                          <>
                            {/* Seat */}
                            <td rowSpan={sectorCount} className={cn(GCRowSpan, missingSeat ? 'bg-red-50' : '')}>
                              <input type="number" min={1} value={p.seat_total || ''}
                                onChange={e => update(pnrIdx, { seat_total: parseInt(e.target.value) || 0 })}
                                onBlur={() => markTouched(pnrIdx)}
                                className={cn('w-full min-w-0 h-7 text-center text-[12px] font-medium bg-transparent border-0 focus:outline-none',
                                  missingSeat ? 'text-red-500' : 'text-slate-800')}
                              />
                            </td>

                            {/* Price Type */}
                            <td rowSpan={sectorCount} className={GCRowSpan}>
                              <select value={fmt}
                                onChange={e => handlePriceTypeChange(pnrIdx, e.target.value as 'FARE' | 'FARE_YQ' | 'ALL_IN')}
                                className={cn('w-full min-w-0 h-7 text-center text-[12px] bg-transparent border-0 focus:outline-none cursor-pointer font-medium',
                                  fmt === 'FARE_YQ' ? 'text-amber-700' : fmt === 'ALL_IN' ? 'text-blue-700' : 'text-slate-700')}>
                                <option value="FARE">FARE</option>
                                <option value="FARE_YQ">FARE+YQ</option>
                                <option value="ALL_IN">ALL IN</option>
                              </select>
                            </td>

                            {/* Fare */}
                            <td rowSpan={sectorCount} className={cn(GRRowSpan, fareErr ? 'bg-red-50' : '')}>
                              <PriceInput value={p.fare > 0 ? p.fare : null} cell hasError={fareErr}
                                onChange={v => handleFareChange(pnrIdx, v)} onBlur={() => markTouched(pnrIdx)} />
                            </td>

                            {/* Tax */}
                            <td rowSpan={sectorCount} className={cn(GRRowSpan, taxDisabled ? 'bg-slate-50' : taxErr ? 'bg-red-50' : '')}>
                              <PriceInput value={!taxDisabled ? (p.tax ?? null) : null} cell disabled={taxDisabled} nullable={!taxDisabled} hasError={taxErr}
                                onChange={v => handleTaxChange(pnrIdx, v)} onBlur={() => markTouched(pnrIdx)} />
                            </td>

                            {/* YQ */}
                            <td rowSpan={sectorCount} className={cn(GRRowSpan, yqDisabled ? 'bg-slate-50' : yqErr ? 'bg-red-50' : '')}>
                              <PriceInput value={!yqDisabled ? (p.yq ?? null) : null} cell disabled={yqDisabled} nullable={!yqDisabled} hasError={yqErr}
                                onChange={v => handleYqChange(pnrIdx, v)} onBlur={() => markTouched(pnrIdx)} />
                            </td>

                            {/* Currency */}
                            <td rowSpan={sectorCount} className={cn('border-r border-[#E5EAF0] align-middle overflow-hidden p-0', groupBorderB, hvRow)}>
                              <CurrencyCombobox variant="inline" value={p.currency || currency} stockDefault={currency}
                                currencies={currencyOptions} onChange={code => handleCurrencyChange(pnrIdx, code)} />
                            </td>

                            {/* Condition */}
                            <td rowSpan={sectorCount} className={GRowSpan}>
                              <select value={p.condition_id || ''}
                                onChange={e => update(pnrIdx, { condition_id: e.target.value })}
                                className="w-full min-w-0 h-7 text-[12px] bg-transparent border-0 focus:outline-none cursor-pointer text-slate-600">
                                <option value="">ไม่ระบุ</option>
                                {conditions.map(c => <option key={c.conditionId} value={c.conditionId}>{c.conditionName}</option>)}
                              </select>
                            </td>

                            {/* TTL */}
                            <td rowSpan={sectorCount} className={GRowSpan}>
                              <button type="button"
                                onClick={e => {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                  const vh = window.innerHeight; const pw = 400; const ph = 340
                                  const top = rect.bottom + 4 + ph > vh ? Math.max(4, rect.top - ph - 4) : rect.bottom + 4
                                  const left = Math.max(4, Math.min(rect.left, window.innerWidth - pw - 4))
                                  setTtlPopover({ idx: pnrIdx, pos: { top, left, width: pw } })
                                }}
                                className={cn('w-full h-7 flex items-center justify-between gap-1 px-1 rounded text-left transition-colors text-[11px]',
                                  ttlSt === 'past' ? 'text-red-600 hover:bg-red-50' :
                                  ttlSt === 'near' ? 'text-amber-700 hover:bg-amber-50' :
                                  hasTtl(p) ? 'text-slate-700 hover:bg-slate-50' : 'hover:bg-slate-50')}>
                                {hasTtl(p) && p.ttl_date ? (
                                  <>
                                    <span className="font-medium truncate text-[11px]">
                                      {p.ttl_type === 'DAYS_BEFORE' ? `−${p.ttl_days_before}d · ${formatTtlDisplay(p.ttl_date, p.ttl_time ?? null)}` : formatTtlDisplay(p.ttl_date, p.ttl_time ?? null)}
                                    </span>
                                    <Pencil size={9} className="text-slate-300 shrink-0" />
                                  </>
                                ) : (
                                  <span className="text-slate-300 italic text-[10px]">ตั้ง TTL...</span>
                                )}
                              </button>
                            </td>

                            {/* การยืนยัน (Switch) */}
                            <td rowSpan={sectorCount} className={GCRowSpan}>
                              <div className="flex flex-col items-center gap-0.5">
                                <button type="button" role="switch" aria-checked={p.status === 'Confirmed'}
                                  aria-label={`การยืนยัน PNR ${pnrIdx + 1}`}
                                  onClick={() => {
                                    const ns: PNRStatus = p.status === 'Confirmed' ? 'Pending' : 'Confirmed'
                                    update(pnrIdx, { status: ns, confirmation_status: ns === 'Confirmed' ? 'CONFIRMED' : 'PENDING_CONFIRMATION' })
                                    showToast(`PNR ${pnrIdx + 1}: ${STATUS_LABELS[ns]}`)
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === ' ' || e.key === 'Enter') {
                                      e.preventDefault()
                                      const ns: PNRStatus = p.status === 'Confirmed' ? 'Pending' : 'Confirmed'
                                      update(pnrIdx, { status: ns, confirmation_status: ns === 'Confirmed' ? 'CONFIRMED' : 'PENDING_CONFIRMATION' })
                                      showToast(`PNR ${pnrIdx + 1}: ${STATUS_LABELS[ns]}`)
                                    }
                                  }}
                                  className={cn('relative inline-flex h-[14px] w-[26px] flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#05a94f]/40',
                                    p.status === 'Confirmed' ? 'bg-[#05a94f]' : 'bg-slate-300')}>
                                  <span className={cn('inline-block h-[10px] w-[10px] transform rounded-full bg-white shadow-sm transition-transform duration-200',
                                    p.status === 'Confirmed' ? 'translate-x-[13px]' : 'translate-x-[2px]')} />
                                </button>
                                <span className={cn('text-[9px] font-medium whitespace-nowrap leading-tight',
                                  p.status === 'Confirmed' ? 'text-green-600' : 'text-slate-400')}>
                                  {STATUS_LABELS[p.status] ?? 'รอยืนยัน'}
                                </span>
                              </div>
                            </td>

                            {/* Remark */}
                            <td rowSpan={sectorCount} className={GRowSpan}>
                              <input value={p.remark}
                                onChange={e => update(pnrIdx, { remark: e.target.value })}
                                placeholder="หมายเหตุ..."
                                className="w-full min-w-0 h-7 text-[12px] bg-transparent border-0 focus:outline-none text-slate-600 placeholder:text-slate-300"
                              />
                            </td>

                            {/* Action */}
                            <td rowSpan={sectorCount} className={cn(GCRowSpan, 'border-r-0')}>
                              <div className="flex items-center justify-center gap-0.5">
                                <button type="button" onClick={() => duplicateRow(pnrIdx)} title="คัดลอก PNR"
                                  className="p-1 rounded text-slate-400 hover:text-[#05a94f] hover:bg-slate-100 transition-colors">
                                  <Copy size={13} />
                                </button>
                                <button type="button" onClick={() => handleResetAllSectors(pnrIdx)} title="คืนค่า Flight Set"
                                  className="p-1 rounded text-slate-400 hover:text-blue-500 hover:bg-slate-100 transition-colors">
                                  <RotateCcw size={13} />
                                </button>
                                <button type="button" onClick={() => deleteRow(pnrIdx)} title="ลบ PNR"
                                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
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

      {/* ── Summary bar ── */}
      {pnrs.length > 0 && (
        <div className="flex items-center gap-0 h-[34px] px-3 bg-white border border-slate-200 rounded-lg text-[12px] overflow-hidden">
          {[
            { label: 'PNR รวม', value: summaryStats.totalPnr, cls: 'text-slate-700' },
            { label: 'Seat รวม', value: summaryStats.totalSeats.toLocaleString('en-US'), cls: 'text-slate-700' },
            { label: 'รอยืนยัน', value: summaryStats.pendingCount, cls: 'text-amber-600' },
            { label: 'ยืนยันแล้ว', value: summaryStats.confirmedCount, cls: 'text-green-600' },
            ...(summaryStats.noTtlCount > 0 ? [{ label: 'ยังไม่มี TTL', value: summaryStats.noTtlCount, cls: 'text-slate-400' }] : []),
          ].map((item, i) => (
            <Fragment key={item.label}>
              {i > 0 && <span className="text-slate-200 mx-2.5 text-[13px]">|</span>}
              <span className="text-slate-400 whitespace-nowrap">{item.label}</span>
              <span className={cn('ml-1.5 font-bold tabular-nums whitespace-nowrap', item.cls)}>{item.value}</span>
            </Fragment>
          ))}
        </div>
      )}

      {/* ── Bulk TTL Modal ── */}
      <Modal open={bulkTtlOpen} onClose={closeBulkTtl} title="ตั้งค่า TTL" size="lg"
        footer={
          bulkTtlInnerStep === 'config'
            ? <div className="flex w-full items-center justify-between gap-2"><Button variant="ghost" onClick={closeBulkTtl}>ยกเลิก</Button><Button disabled={!ttlCanApply} onClick={handleBulkTtlConfirm}>ยืนยัน ({ttlTargetIndices.length} PNR)</Button></div>
            : <div className="flex w-full items-center justify-start"><Button variant="ghost" size="sm" onClick={() => setBulkTtlInnerStep('config')}>กลับแก้ไข</Button></div>
        }>
        {bulkTtlInnerStep === 'config' ? (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2.5">วิธีกำหนด TTL</p>
              <div className="flex gap-6">
                {(['days_before', 'fixed_date'] as const).map(m => (
                  <label key={m} className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="radio" name="ttl_mode" checked={bulkTtlMode === m} onChange={() => setBulkTtlMode(m)} className="accent-[#05a94f]" />
                    <span className="text-sm text-slate-700">{m === 'days_before' ? 'ก่อนวันเดินทาง' : 'เลือกวันที่เอง'}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
              {bulkTtlMode === 'days_before' ? (
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">ก่อนวันเดินทาง <span className="text-red-400">*</span></label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={365} value={bulkTtlDays} onChange={e => setBulkTtlDays(e.target.value)}
                      className="w-20 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]" />
                    <span className="text-sm text-slate-500">วัน</span>
                  </div>
                  {bulkTtlDays !== '' && !ttlDaysValid && <p className="text-[11px] text-red-500 mt-1">ต้องเป็นตัวเลข ≥ 0</p>}
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">วันที่ TTL <span className="text-red-400">*</span></label>
                  <input type="date" value={bulkTtlFixedDate} onChange={e => setBulkTtlFixedDate(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]" />
                </div>
              )}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">เวลา <span className="text-red-400">*</span></label>
                <TimeInput value={bulkTtlTime} onChange={setBulkTtlTime} compact placeholder="HH:mm" className="border border-slate-300 rounded-lg bg-white" />
                {bulkTtlTime && !ttlTimeValid && <p className="text-[11px] text-red-500 mt-1">รูปแบบ HH:mm</p>}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2.5">ขอบเขต</p>
              <div className="flex flex-col gap-2">
                {(['no_ttl', 'all', 'selected'] as const).map(scope => (
                  <label key={scope} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer select-none transition-colors',
                    bulkTtlScope === scope ? 'border-[#05a94f] bg-green-50/50' : 'border-slate-200 hover:bg-slate-50')}>
                    <input type="radio" name="ttl_scope" checked={bulkTtlScope === scope} onChange={() => setBulkTtlScope(scope)} className="accent-[#05a94f]" />
                    <span className="text-sm text-slate-700 flex-1">{scope === 'no_ttl' ? 'เฉพาะ PNR ที่ยังไม่มี TTL' : scope === 'all' ? 'ทุก PNR' : 'เฉพาะ PNR ที่เลือก'}</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                      {scope === 'no_ttl' ? pnrs.filter(p => !hasTtl(p)).length : scope === 'all' ? pnrs.length : bulkTtlSelectedPnrs.size}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {bulkTtlScope === 'selected' && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">เลือก PNR</span>
                  <div className="flex gap-3">
                    <button type="button" className="text-[11px] text-[#05a94f] hover:underline" onClick={() => setBulkTtlSelectedPnrs(new Set(pnrs.map((_, i) => i)))}>เลือกทั้งหมด</button>
                    <button type="button" className="text-[11px] text-slate-400 hover:underline" onClick={() => setBulkTtlSelectedPnrs(new Set())}>ยกเลิกทั้งหมด</button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {pnrs.map((p, i) => {
                    const pSt = getTtlStatus(p.ttl_date ?? null, p.ttl_time ?? null)
                    return (
                      <label key={i} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 select-none">
                        <input type="checkbox" checked={bulkTtlSelectedPnrs.has(i)}
                          onChange={() => { const nx = new Set(bulkTtlSelectedPnrs); if (nx.has(i)) nx.delete(i); else nx.add(i); setBulkTtlSelectedPnrs(nx) }}
                          className="accent-[#05a94f]" />
                        <span className="text-xs font-mono text-slate-700 w-24 truncate shrink-0">{p.pnr_code || p.dummy_pnr || `PNR #${i + 1}`}</span>
                        <span className="text-xs text-slate-400 shrink-0">{p.travel_start ? formatTravelDate(p.travel_start) : '—'}</span>
                        {hasTtl(p) && p.ttl_date && (
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded ml-auto shrink-0',
                            pSt === 'past' ? 'text-red-600 bg-red-50' : pSt === 'near' ? 'text-amber-700 bg-amber-50' : 'text-green-700 bg-green-50')}>
                            {formatTtlDisplay(p.ttl_date, p.ttl_time ?? null)}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            {ttlTargetIndices.length > 0 && ttlCanApply ? (
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">ตัวอย่าง TTL ({ttlTargetIndices.length} PNR)</p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-500 border-b border-slate-200">PNR</th>
                        <th className="px-3 py-2 text-center font-medium text-slate-500 border-b border-slate-200">Dep Date</th>
                        {bulkTtlMode === 'days_before' && <th className="px-3 py-2 text-center font-medium text-slate-500 border-b border-slate-200">−{bulkTtlDays} วัน</th>}
                        <th className="px-3 py-2 text-center font-medium text-slate-500 border-b border-slate-200">TTL ที่จะตั้ง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ttlPreviewRows.map(({ index, pnr, computedDate }, i) => {
                        const st = computedDate ? getTtlStatus(computedDate, bulkTtlTime) : 'unset'
                        const noDep = bulkTtlMode === 'days_before' && !pnr.travel_start
                        return (
                          <tr key={i} className={noDep ? 'opacity-50' : ''}>
                            <td className="px-3 py-2 font-mono text-slate-700">{pnr.pnr_code || pnr.dummy_pnr || `PNR #${index + 1}`}</td>
                            <td className="px-3 py-2 text-center text-slate-500">{pnr.travel_start ? formatTravelDate(pnr.travel_start) : <span className="text-slate-300">—</span>}</td>
                            {bulkTtlMode === 'days_before' && <td className="px-3 py-2 text-center text-slate-400">{noDep ? '—' : `−${bulkTtlDays} วัน`}</td>}
                            <td className="px-3 py-2 text-center">
                              {computedDate
                                ? <span className={cn('font-semibold', st === 'past' ? 'text-red-600' : st === 'near' ? 'text-amber-700' : 'text-green-700')}>{formatTtlDisplay(computedDate, bulkTtlTime)}</span>
                                : <span className="text-slate-300 italic">ไม่สามารถคำนวณ</span>}
                            </td>
                          </tr>
                        )
                      })}
                      {ttlTargetIndices.length > 4 && <tr><td colSpan={bulkTtlMode === 'days_before' ? 4 : 3} className="px-3 py-1.5 text-center text-[11px] text-slate-400 italic">และอีก {ttlTargetIndices.length - 4} PNR</td></tr>}
                    </tbody>
                  </table>
                </div>
                {ttlNoDepsCount > 0 && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-amber-700">{ttlNoDepsCount} PNR ยังไม่มีวันเดินทาง — จะถูกข้ามไป</p>
                  </div>
                )}
                {ttlPastWarning && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-red-600">TTL ที่คำนวณได้ผ่านไปแล้ว — กรุณาตรวจสอบก่อนยืนยัน</p>
                  </div>
                )}
              </div>
            ) : ttlTargetIndices.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-3 bg-slate-50 border border-slate-200 rounded-lg">
                <Info size={13} className="text-slate-400 shrink-0" />
                <p className="text-xs text-slate-400">ไม่มี PNR ในขอบเขตนี้</p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 mb-1">มี {ttlExistingTtlCount} PNR ที่มี TTL อยู่แล้ว</p>
                <p className="text-xs text-amber-700">จาก {ttlTargetIndices.length} PNR ที่เลือก</p>
              </div>
            </div>
            <div className="space-y-2.5">
              <button type="button" onClick={() => commitBulkTtl('all')} className="w-full flex items-center justify-between px-4 py-3 border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors text-left">
                <div><p className="text-sm font-semibold text-amber-800">เขียนทับทั้งหมด</p><p className="text-xs text-amber-600 mt-0.5">อัปเดต {ttlTargetIndices.length} รายการ</p></div>
                <span className="text-amber-400 text-xl font-light ml-3">→</span>
              </button>
              <button type="button" onClick={() => commitBulkTtl('skip_existing')} className="w-full flex items-center justify-between px-4 py-3 border-2 border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition-colors text-left">
                <div><p className="text-sm font-semibold text-slate-700">อัปเดตเฉพาะที่ยังไม่มี TTL</p><p className="text-xs text-slate-500 mt-0.5">ตั้ง TTL ให้ {ttlNoTtlCount} รายการ</p></div>
                <span className="text-slate-300 text-xl font-light ml-3">→</span>
              </button>
              <button type="button" onClick={() => setBulkTtlInnerStep('config')} className="w-full px-4 py-2.5 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors text-sm text-slate-500">ยกเลิก — กลับไปแก้ไข</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirm */}
      <Modal open={deleteConfirmIdx !== null} onClose={() => setDeleteConfirmIdx(null)} title="ยืนยันการลบ PNR" size="sm"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteConfirmIdx(null)}>ยกเลิก</Button><Button variant="danger" onClick={confirmDelete}>ลบ PNR นี้</Button></div>}>
        <p className="text-sm text-slate-600">คุณต้องการลบ PNR รายการที่ <strong>{deleteConfirmIdx !== null ? deleteConfirmIdx + 1 : ''}</strong> ออกจากรายการหรือไม่?</p>
        {pnrs.length === 1 && <p className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">นี่คือ PNR รายการสุดท้าย</p>}
      </Modal>

      <ImportExcelModal open={importOpen} onClose={() => setImportOpen(false)} onConfirm={addPastedPNRs} existingPnrCodes={existingPnrCodes} sectors={sectors} />
      <BulkPnrBuilder open={bulkOpen} onClose={() => setBulkOpen(false)} mode="create_stock" sectors={builderSectors} conditions={builderConditions} currency={currency} onConfirm={addBulkPNRs} />

      {ttlPopover !== null && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setTtlPopover(null)} />
          <TtlEditor
            pos={ttlPopover.pos}
            travelDate={pnrs[ttlPopover.idx]?.travel_start ?? null}
            ttlType={pnrs[ttlPopover.idx]?.ttl_type ?? 'NONE'}
            ttlDaysBefore={pnrs[ttlPopover.idx]?.ttl_days_before ?? null}
            ttlDate={pnrs[ttlPopover.idx]?.ttl_date ?? null}
            ttlTime={pnrs[ttlPopover.idx]?.ttl_time ?? null}
            onSave={val => {
              update(ttlPopover.idx, { ttl_type: val.ttlType, ttl_days_before: val.ttlDaysBefore,
                ttl_status: val.ttlType !== 'NONE' ? 'SET' : 'UNSET', ttl_date: val.ttlDate, ttl_time: val.ttlTime })
              setTtlPopover(null)
            }}
            onClose={() => setTtlPopover(null)}
          />
        </>
      )}
    </div>
  )
}
