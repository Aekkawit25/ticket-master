'use client'

import { Fragment, useRef, useState, useMemo, useEffect } from 'react'
import { PlusCircle, Trash2, Copy, Info, CalendarDays, FileUp, Download, AlertTriangle, RefreshCw, RotateCcw, Pencil } from 'lucide-react'
import { cn, formatTravelDate, calcTravelEndFromSectors, calcSectorDate, calculatePlusDay } from '@/lib/utils'
import { hasTtl, formatTtlDisplay as formatTtlDisplayUtil } from '@/lib/ttl-utils'
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
const STATUS_OPTIONS: PNRStatus[] = ['Pending', 'Confirmed']
const STATUS_LABELS: Record<string, string> = { Pending: 'รอยืนยัน', Confirmed: 'ยืนยันแล้ว' }
const STATUS_COLORS: Record<string, string> = { Pending: 'text-amber-600', Confirmed: 'text-green-600' }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emptyPNR(defaultCurrency = 'THB'): FlightPNRFormData {
  return {
    pnr_code: '',
    dummy_pnr: '',
    travel_start: '',
    travel_end: '',
    seat_total: 40,
    price_format: 'FARE',
    fare: 0,
    yq: null,
    tax_type: 'separate',
    tax: null,
    total_amount: 0,
    currency: defaultCurrency,
    condition_id: '',
    status: 'Pending',
    pnr_status: 'PENDING',
    confirmation_status: 'PENDING_CONFIRMATION',
    remark: '',
    sector_dates: [],
    ttl_status: 'UNSET',
    ttl_date: null,
    ttl_time: null,
    ttl_remark: '',
    ttl_type: 'NONE',
    ttl_days_before: null,
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
  return ttlTime ? `${d}, ${ttlTime}` : d
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

// ─── PriceCell ────────────────────────────────────────────────────────────────
function PriceCell({
  value,
  nullable = false,
  disabled = false,
  readOnly = false,
  hasError = false,
  errorTitle,
  rowIdx,
  colKey,
  rowSpan,
  onChange,
  onBlurRow,
}: {
  value: number | null
  nullable?: boolean
  disabled?: boolean
  readOnly?: boolean
  hasError?: boolean
  errorTitle?: string
  rowIdx: number
  colKey: string
  rowSpan?: number
  onChange: (v: number | null) => void
  onBlurRow?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState(() => value == null ? '' : String(value))

  useEffect(() => {
    if (inputRef.current !== document.activeElement) {
      setRaw(value == null ? '' : String(value))
    }
  }, [value])

  const preEditRef = useRef<number | null>(null)

  const fmtDisplay = (v: number | null): string => {
    if (v == null) return ''
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const parse = (s: string): number | null => {
    const t = s.trim()
    if (t === '') return null
    const n = Number(t)
    if (isNaN(n) || n < 0) return null
    return Math.round(n * 100) / 100
  }

  const commit = (rawStr: string) => {
    const v = parse(rawStr)
    onChange(v)
    setRaw(v == null ? '' : String(v))
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    preEditRef.current = value
    setFocused(true)
    setRaw(value == null ? '' : String(value))
    requestAnimationFrame(() => e.target.select())
  }

  const handleBlur = () => {
    setFocused(false)
    commit(raw)
    onBlurRow?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      const prev = preEditRef.current
      onChange(prev)
      setRaw(prev == null ? '' : String(prev))
      setFocused(false)
      inputRef.current?.blur()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      commit(raw)
      setFocused(false)
      inputRef.current?.blur()
      const nextCells = document.querySelectorAll<HTMLInputElement>(`[data-price-input-row="${rowIdx + 1}"]`)
      if (nextCells.length) nextCells[0].focus()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      commit(raw)
      setFocused(false)
      const allInputs = Array.from(
        document.querySelectorAll<HTMLInputElement>('[data-price-input]')
      ).filter(el => !el.disabled && el.type !== 'hidden')
      const ci = allInputs.indexOf(inputRef.current!)
      const target = e.shiftKey ? allInputs[ci - 1] : allInputs[ci + 1]
      if (target) target.focus()
    }
  }

  if (disabled) {
    return (
      <td rowSpan={rowSpan} className="border border-slate-200 bg-slate-50/60 text-center align-middle select-none cursor-default">
        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-100 rounded leading-none">ไม่ใช้</span>
      </td>
    )
  }

  if (readOnly) {
    const disp = value == null ? '—' : fmtDisplay(value)
    return (
      <td rowSpan={rowSpan} className={cn('border border-slate-200 text-right align-middle select-none', hasError ? 'bg-red-50/40' : 'bg-green-50/40')}>
        <span className={cn('px-2 text-xs font-bold tabular-nums', hasError ? 'text-red-400' : 'text-green-700')}>{disp}</span>
      </td>
    )
  }

  const displayVal = focused ? raw : fmtDisplay(value)
  const placeholder = focused ? (nullable ? 'ว่าง = ไม่ระบุ' : '0.00') : (value == null ? 'ยังไม่ระบุ' : '')

  return (
    <td
      rowSpan={rowSpan}
      className={cn('border p-0 align-middle', hasError ? 'border-red-400 bg-red-50/20' : focused ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-200')}
      title={hasError && errorTitle ? errorTitle : undefined}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={displayVal}
        placeholder={placeholder}
        data-price-input="true"
        data-price-input-row={rowIdx}
        data-price-input-col={colKey}
        className={cn('w-full px-2 py-[6px] text-right text-xs tabular-nums bg-transparent focus:outline-none', !focused && value == null ? 'placeholder:text-slate-400' : 'text-slate-800 font-semibold')}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={e => setRaw(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </td>
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

// ─── Cell input style ─────────────────────────────────────────────────────────
const xi = 'w-full px-2 py-[6px] text-xs bg-transparent outline-none focus:bg-blue-50 placeholder:text-slate-300'

// ─── addDaysToDate ────────────────────────────────────────────────────────────
function addDaysToDate(dateStr: string, days: number): string {
  if (!dateStr) return ''
  if (days === 0) return dateStr
  try {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  } catch { return dateStr }
}

// ─── TravelDatesPopover (kept but not rendered) ───────────────────────────────
function TravelDatesPopover({ pos, onClose }: { pos: { top: number; left: number; width: number }; travelStart: string; isOutdated: boolean; sectors: FlightSectorFormData[]; sectorDates?: Array<{ sector_type: string; day_offset: number; travel_date: string; arr_date?: string }>; onSave: (data: { travelStart: string; travelEnd: string; sectorDates: Array<{ sector_type: string; day_offset: number; travel_date: string; arr_date: string }> }) => void; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }} className="bg-white border border-slate-200 rounded-xl shadow-2xl">
      <button type="button" onClick={onClose} className="absolute top-2 right-2 text-slate-400">✕</button>
    </div>
  )
}


// ─── Main Component ───────────────────────────────────────────────────────────
export default function Step4PNR({ pnrs, schedules, conditions, currency, onChange, showValidation = false }: Step4Props) {
  const mainSectors = schedules.find(s => s.isMain)?.sectors ?? schedules[0]?.sectors ?? []
  const getPnrSectors = (pnr: FlightPNRFormData): FlightSectorFormData[] => {
    if (!pnr.schedule_id) return mainSectors
    return schedules.find(s => s.scheduleId === pnr.schedule_id)?.sectors ?? mainSectors
  }
  const sectors = mainSectors

  const [touchedRows, setTouchedRows] = useState<Set<number>>(new Set())
  const markTouched = (idx: number) => {
    setTouchedRows(prev => {
      if (prev.has(idx)) return prev
      const next = new Set(prev); next.add(idx); return next
    })
  }

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

  const currencyOptions = useMemo(() => getCurrencyOptions(), [])

  const existingPnrCodes = useMemo(() => {
    const draftCodes = pnrs.map(p => p.pnr_code).filter(Boolean)
    try {
      const systemCodes = getDemoStocks().flatMap(s => s.pnrs.flatMap(p => [p.pnrCode, p.dummyPnr].filter(Boolean) as string[]))
      return [...new Set([...draftCodes, ...systemCodes])]
    } catch { return draftCodes }
  }, [pnrs])

  // ─── getSectorDatesForPnr helper ──────────────────────────────────────────
  // Derives display-ready sector dates for a PNR.
  // Formula: Dep Date = travel_start + (day_offset − 1),  Arr Date = Dep Date + arr_day_offset
  // Manual flags (dep_manual / arr_manual) protect user-edited values from being overwritten.
  const getSectorDatesForPnr = (p: FlightPNRFormData, sects: FlightSectorFormData[]) => {
    if (p.sector_dates && p.sector_dates.length === sects.length) {
      return p.sector_dates.map((sd, i) => {
        const s = sects[i]
        // Recompute dep when: (1) Travel Day changed in Step 2 and not manually set, OR
        // (2) dep is empty but travel_start is set and not manually cleared (recovers from
        //     old data where only S1 was stored, leaving S2/S3 with empty travel_date).
        const dayOffsetChanged = s && sd.day_offset !== s.day_offset
        const shouldRecompute = !sd.dep_manual && !!p.travel_start && (!sd.travel_date || dayOffsetChanged)
        const dep = shouldRecompute
          ? (calcSectorDate(p.travel_start, s.day_offset) ?? '')
          : sd.travel_date
        // Always derive arr_date from dep + current +Day unless the user manually set it
        const arr = sd.arr_manual
          ? (sd.arr_date ?? '')
          : (dep ? addDaysToDate(dep, s?.arr_day_offset ?? 0) : '')
        // Times: use PNR-stored time if present, fall back to Flight Set template
        const dep_time = sd.dep_time !== undefined ? sd.dep_time : (s?.dep_time ?? '')
        const arr_time = sd.arr_time !== undefined ? sd.arr_time : (s?.arr_time ?? '')
        return { ...sd, day_offset: s?.day_offset ?? sd.day_offset, travel_date: dep, arr_date: arr, dep_time, arr_time }
      })
    }
    // No stored dates or sector count changed → compute everything from scratch
    return sects.map(s => {
      const dep = p.travel_start ? calcSectorDate(p.travel_start, s.day_offset) ?? '' : ''
      const arr = dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : ''
      return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep, arr_date: arr, dep_manual: false as const, arr_manual: false as const,
        dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
    })
  }

  // ─── Price handlers ───────────────────────────────────────────────────────
  const commitPriceTypeChange = (idx: number, newFmt: 'FARE' | 'FARE_YQ' | 'ALL_IN') => {
    const p = pnrs[idx]
    const newFare = p.fare
    let newTax: number | null = null
    let newYq: number | null = null
    if (newFmt === 'FARE') {
      // Open Tax + YQ — keep whatever was stored (null = not yet set)
      newTax = p.tax
      newYq = p.yq ?? null
    } else if (newFmt === 'FARE_YQ') {
      // Clear Tax, keep YQ
      newTax = null
      newYq = p.yq ?? null
    } else {
      // ALL_IN: clear Tax and YQ
      newTax = null
      newYq = null
    }
    update(idx, { price_format: newFmt, fare: newFare, tax: newTax, yq: newYq, total_amount: calcPnrTotal(newFmt, newFare, newTax, newYq) })
  }

  const handlePriceTypeChange = (idx: number, newFmt: 'FARE' | 'FARE_YQ' | 'ALL_IN') => {
    const p = pnrs[idx]
    const oldFmt = (p.price_format ?? 'FARE') as string
    if (newFmt === oldFmt) return
    // Confirm only when a value that has been set will be lost
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
    const hasPrices = (p.fare > 0) || ((p.yq ?? 0) > 0)
    if (hasPrices) { setCurrencyConfirm({ idx, newCurrency: newCode }); return }
    update(idx, { currency: newCode })
  }

  // ─── Sector date handlers ─────────────────────────────────────────────────
  const handleSectorDepChange = (pnrIdx: number, sIdx: number, newDep: string) => {
    const p = pnrs[pnrIdx]
    const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const currentDep = currentSDs[sIdx]?.travel_date ?? ''

    if (sIdx === 0) {
      if (currentDep && newDep !== currentDep) {
        // Already had a travel start → ask how to handle other sectors
        setShiftConfirm({ pnrIdx, origDep: currentDep, newDep })
        return
      }
      // First-time set (or same value) → compute ALL sectors from new travel start
      const newSDs = sects.map((s, i) => {
        const dep = newDep ? calcSectorDate(newDep, s.day_offset) ?? '' : ''
        const arr = dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : ''
        return { ...currentSDs[i], sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep, arr_date: arr, dep_manual: false as const, arr_manual: false as const }
      })
      const lastArr = newSDs[newSDs.length - 1]?.arr_date || ''
      markTouched(pnrIdx)
      onChange(pnrs.map((row, i) => i !== pnrIdx ? row : {
        ...row,
        travel_start: newDep,
        travel_end: lastArr,
        sector_dates: newSDs,
      }))
      return
    }

    // Non-S1 sector: update just that sector's dep date and mark as manually set
    const newSDs = currentSDs.map((sd, i) => i === sIdx
      ? { ...sd, travel_date: newDep, dep_manual: !!newDep }
      : sd)
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : {
      ...row,
      travel_start: row.travel_start || newDep,
      sector_dates: newSDs,
    }))
  }

  const handleSectorArrChange = (pnrIdx: number, sIdx: number, newArr: string) => {
    const p = pnrs[pnrIdx]
    const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const isLast = sIdx === currentSDs.length - 1
    const newSDs = currentSDs.map((sd, i) => i === sIdx
      ? { ...sd, arr_date: newArr, arr_manual: !!newArr }
      : sd)
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : {
      ...row,
      travel_end: isLast ? newArr : row.travel_end,
      sector_dates: newSDs,
    }))
  }

  const handleSectorDepTimeChange = (pnrIdx: number, sIdx: number, newTime: string) => {
    const p = pnrs[pnrIdx]
    const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const s = sects[sIdx]
    const templateDepTime = s?.dep_time ?? ''
    const newSDs = currentSDs.map((sd, i) => {
      if (i !== sIdx) return sd
      const arrTimeOverride = (sd.arr_time ?? '') !== (sects[i]?.arr_time ?? '')
      return { ...sd, dep_time: newTime, time_override: (newTime !== templateDepTime) || arrTimeOverride }
    })
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, sector_dates: newSDs }))
  }

  const handleSectorArrTimeChange = (pnrIdx: number, sIdx: number, newTime: string) => {
    const p = pnrs[pnrIdx]
    const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const s = sects[sIdx]
    const templateArrTime = s?.arr_time ?? ''
    const newSDs = currentSDs.map((sd, i) => {
      if (i !== sIdx) return sd
      const depTimeOverride = (sd.dep_time ?? '') !== (sects[i]?.dep_time ?? '')
      return { ...sd, arr_time: newTime, time_override: depTimeOverride || (newTime !== templateArrTime) }
    })
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, sector_dates: newSDs }))
  }

  // Recalculate ALL sector dates from new travel_start using day_offset formula (clears all manual flags)
  const confirmRecalcAll = () => {
    if (!shiftConfirm) return
    const { pnrIdx, newDep } = shiftConfirm
    const p = pnrs[pnrIdx]
    const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const newSDs = sects.map((s, i) => {
      const dep = calcSectorDate(newDep, s.day_offset) ?? ''
      const arr = dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : ''
      const sd = currentSDs[i]
      return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep, arr_date: arr, dep_manual: false as const, arr_manual: false as const,
        dep_time: sd?.dep_time ?? (s.dep_time ?? ''), arr_time: sd?.arr_time ?? (s.arr_time ?? ''), time_override: sd?.time_override ?? false }
    })
    const lastArr = newSDs[newSDs.length - 1]?.arr_date || ''
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_start: newDep, travel_end: lastArr, date_sync_status: 'SYNCED' as const, sector_dates: newSDs }))
    setShiftConfirm(null)
  }

  // Recalculate only sectors that the user has NOT manually edited; keep manual dep dates as-is
  const confirmRecalcNonManual = () => {
    if (!shiftConfirm) return
    const { pnrIdx, newDep } = shiftConfirm
    const p = pnrs[pnrIdx]
    const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const newSDs = sects.map((s, i) => {
      const sd = currentSDs[i]
      if (sd?.dep_manual) {
        // Keep user's manually set dep, but refresh arr from current +Day unless arr is also manual
        const arr = sd.arr_manual ? (sd.arr_date ?? '') : (sd.travel_date ? addDaysToDate(sd.travel_date, s.arr_day_offset ?? 0) : '')
        return { ...sd, day_offset: s.day_offset, arr_date: arr }
      }
      const dep = calcSectorDate(newDep, s.day_offset) ?? ''
      const arr = dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : ''
      return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep, arr_date: arr, dep_manual: false as const, arr_manual: false as const,
        dep_time: sd?.dep_time ?? (s.dep_time ?? ''), arr_time: sd?.arr_time ?? (s.arr_time ?? ''), time_override: sd?.time_override ?? false }
    })
    const lastArr = newSDs[newSDs.length - 1]?.arr_date || ''
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_start: newDep, travel_end: lastArr, date_sync_status: 'SYNCED' as const, sector_dates: newSDs }))
    setShiftConfirm(null)
  }

  // Keep all existing sector dates unchanged; only update travel_start and S1 dep date
  const confirmKeepManual = () => {
    if (!shiftConfirm) return
    const { pnrIdx, newDep } = shiftConfirm
    const p = pnrs[pnrIdx]
    const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const newSDs = currentSDs.map((sd, i) => i === 0 ? { ...sd, travel_date: newDep, dep_manual: false as const } : sd)
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_start: newDep, sector_dates: newSDs }))
    setShiftConfirm(null)
  }

  const handleResetSector = (pnrIdx: number, sIdx: number) => {
    const p = pnrs[pnrIdx]
    const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const s = sects[sIdx]
    if (!p.travel_start || !s) return
    const dep = calcSectorDate(p.travel_start, s.day_offset) ?? ''
    const arr = dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : ''
    const newSDs = currentSDs.map((sd, i) => i === sIdx
      ? { ...sd, travel_date: dep, arr_date: arr, dep_manual: false as const, arr_manual: false as const,
          dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
      : sd)
    const lastArr = newSDs[newSDs.length - 1]?.arr_date || ''
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_end: sIdx === sects.length - 1 ? lastArr : row.travel_end, sector_dates: newSDs }))
  }

  const handleResetAllSectors = (pnrIdx: number) => {
    const p = pnrs[pnrIdx]
    const sects = getPnrSectors(p)
    if (!p.travel_start) return
    const newSDs = sects.map(s => {
      const dep = calcSectorDate(p.travel_start!, s.day_offset) ?? ''
      const arr = dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : ''
      return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep, arr_date: arr, dep_manual: false as const, arr_manual: false as const,
        dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
    })
    const lastArr = newSDs[newSDs.length - 1]?.arr_date || ''
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_end: lastArr, date_sync_status: 'SYNCED' as const, sector_dates: newSDs }))
  }

  // ─── update ───────────────────────────────────────────────────────────────
  const update = (idx: number, patch: Partial<FlightPNRFormData>) => {
    onChange(pnrs.map((p, i) => {
      if (i !== idx) return p
      const base = { ...p, ...patch }
      const pnrSectors = getPnrSectors(base)
      const needsDateRecompute = patch.travel_start !== undefined || patch.schedule_id !== undefined
      const travelEndOverride = base.travel_end_override ?? false
      const travel_end = needsDateRecompute
        ? (travelEndOverride && base.travel_start ? base.travel_end : calcTravelEndFromSectors(base.travel_start, pnrSectors) || '')
        : base.travel_end
      const sector_dates = needsDateRecompute
        ? pnrSectors.map(s => {
            const dep = calcSectorDate(base.travel_start, s.day_offset) || ''
            return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep, arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
              dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
          })
        : base.sector_dates
      const dummy_pnr = patch.pnr_code !== undefined && patch.pnr_code.trim() ? '' : base.dummy_pnr
      return { ...base, travel_end, sector_dates, dummy_pnr }
    }))
  }

  const addRow = () => { onChange([...pnrs, emptyPNR(currency)]) }

  const addBulkPNRs = (rows: BulkPnrRow[]) => {
    const newPNRs: FlightPNRFormData[] = rows.map(row => {
      const pnr = emptyPNR(currency)
      pnr.pnr_code = row.pnrCode
      pnr.dummy_pnr = ''
      pnr.travel_start = row.travelStart
      pnr.travel_end = row.travelEnd || calcTravelEndFromSectors(row.travelStart, sectors) || ''
      pnr.sector_dates = sectors.map(s => {
        const dep = calcSectorDate(row.travelStart, s.day_offset) || ''
        return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep, arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
          dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
      })
      pnr.seat_total = row.seatTotal
      pnr.price_format = row.priceFormat as 'FARE' | 'FARE_YQ' | 'ALL_IN'
      pnr.fare = row.fare
      pnr.tax_type = row.taxType as TaxType
      pnr.tax = (row.priceFormat === 'FARE') ? (row.tax ?? null) : null
      pnr.yq = (row.priceFormat !== 'ALL_IN') ? (row.yq ?? null) : null
      pnr.total_amount = row.total
      pnr.condition_id = row.conditionCode
      pnr.status = (row.status || 'Pending') as PNRStatus
      pnr.remark = row.remark
      pnr.ttl_type = row.ttlType
      pnr.ttl_days_before = row.ttlDaysBefore
      pnr.ttl_status = (row.ttlType !== 'NONE' && row.ttlDate) ? 'SET' : 'UNSET'
      pnr.ttl_date = row.ttlDate ?? null
      pnr.ttl_time = row.ttlTime ?? null
      return pnr
    })
    onChange([...pnrs, ...newPNRs])
  }

  const addPastedPNRs = (rows: PastedExcelRow[]) => {
    const newPNRs: FlightPNRFormData[] = rows.map(row => {
      const pnr = emptyPNR(currency)
      pnr.pnr_code = row.pnrCode
      pnr.travel_start = row.outboundDate
      pnr.travel_end = row.returnDate || calcTravelEndFromSectors(row.outboundDate, sectors) || ''
      pnr.sector_dates = sectors.map(s => {
        const dep = calcSectorDate(row.outboundDate, s.day_offset) || ''
        return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep, arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
          dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
      })
      pnr.seat_total = row.seatCount
      pnr.fare = 0; pnr.tax_type = 'separate'; pnr.tax = null; pnr.total_amount = 0
      pnr.condition_id = conditions.length === 1 ? conditions[0].conditionId : ''
      pnr.status = 'Pending'
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

  const deleteRow = (idx: number) => { setDeleteConfirmIdx(idx) }

  const confirmDelete = () => {
    if (deleteConfirmIdx === null) return
    onChange(pnrs.filter((_, i) => i !== deleteConfirmIdx))
    setTouchedRows(new Set()); setDeleteConfirmIdx(null)
  }

  const duplicateRow = (idx: number) => {
    const src = pnrs[idx]
    const dup: FlightPNRFormData = { ...src, id: undefined, pnr_code: '', dummy_pnr: '' }
    onChange([...pnrs.slice(0, idx + 1), dup, ...pnrs.slice(idx + 1)])
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
      const ttlDate = computeTtlDateForPnr(updated[i])
      if (!ttlDate) continue
      const ttlType = bulkTtlMode === 'days_before' ? 'DAYS_BEFORE' : 'FIXED_DATE'
      const ttlDaysBefore = bulkTtlMode === 'days_before' ? parseInt(bulkTtlDays, 10) : null
      updated[i] = { ...updated[i], ttl_type: ttlType, ttl_days_before: ttlDaysBefore, ttl_status: 'SET', ttl_date: ttlDate, ttl_time: bulkTtlTime || null }
      changed = true
    }
    if (changed) onChange(updated)
    closeBulkTtl()
  }

  const handleBulkTtlConfirm = () => {
    const targets = getTargetPnrIndices()
    if (targets.length === 0) return
    const hasExisting = targets.some(i => hasTtl(pnrs[i]))
    if (hasExisting && bulkTtlScope !== 'no_ttl') { setBulkTtlInnerStep('overwrite_confirm'); return }
    commitBulkTtl('all')
  }

  const outdatedCount = pnrs.filter(p => p.date_sync_status === 'OUTDATED').length

  const updateOutdatedPNRs = () => {
    onChange(pnrs.map(p => {
      if (p.date_sync_status !== 'OUTDATED' || !p.travel_start) return p
      const pnrSectors = getPnrSectors(p)
      const currentSDs = getSectorDatesForPnr(p, pnrSectors)
      const newSDs = pnrSectors.map((s, i) => {
        const dep = calcSectorDate(p.travel_start!, s.day_offset) ?? ''
        const sd = currentSDs[i]
        return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep, arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
          dep_time: sd?.dep_time ?? (s.dep_time ?? ''), arr_time: sd?.arr_time ?? (s.arr_time ?? ''), time_override: sd?.time_override ?? false }
      })
      return { ...p, travel_end: calcTravelEndFromSectors(p.travel_start, pnrSectors) ?? p.travel_end, travel_end_override: false, sector_dates: newSDs, date_sync_status: 'SYNCED' as const }
    }))
  }

  const totals = pnrs.reduce((acc, p) => ({ seat: acc.seat + (p.seat_total || 0) }), { seat: 0 })

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

  return (
    <div className="space-y-3">

      {/* OUTDATED dates banner */}
      {outdatedCount > 0 && (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-amber-50 border border-amber-300 rounded-lg">
          <AlertTriangle size={13} className="text-amber-600 shrink-0" />
          <span className="text-xs text-amber-800 flex-1">มี {outdatedCount} PNR ที่ยังใช้วันที่จาก Flight Set เวอร์ชันเดิม</span>
          <button type="button" onClick={updateOutdatedPNRs}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 border border-amber-400 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap">
            <RefreshCw size={11} />อัปเดตทั้งหมด
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
        <div className="flex items-start gap-2 text-xs text-blue-700 min-w-0">
          <Info size={13} className="flex-shrink-0 mt-0.5" />
          <span>กรอกวันที่ขาไป (Travel Date) · <strong>PNR ว่างได้</strong> · ระบบคำนวณวันที่ Sector อื่น / Total / Dummy PNR ให้อัตโนมัติ</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#05a94f] hover:bg-[#048f43] rounded-lg transition-colors whitespace-nowrap shadow-sm">
            <PlusCircle size={13} />+ เพิ่ม PNR
          </button>
          <button type="button" onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-300 hover:bg-blue-50 rounded-lg transition-colors whitespace-nowrap">
            <FileUp size={13} />Import Excel
          </button>
          <button type="button" onClick={() => downloadPnrTemplate(sectors)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap">
            <Download size={13} />ดาวน์โหลด Template
          </button>
          <button type="button" onClick={() => setBulkOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#05a94f] border border-[#05a94f] hover:bg-green-50 rounded-lg transition-colors whitespace-nowrap">
            <CalendarDays size={13} />หลาย PNR
          </button>
          <button type="button" onClick={() => { setBulkTtlOpen(true); setBulkTtlInnerStep('config') }} disabled={pnrs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 border border-amber-400 hover:bg-amber-50 rounded-lg transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
            <CalendarDays size={13} />ตั้ง TTL ทุก PNR
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs w-full" style={{ minWidth: 1660 }}>

            <thead>
              <tr className="bg-slate-100 select-none h-9">
                <th className="border border-slate-300 px-2 text-center text-slate-500 font-medium whitespace-nowrap" style={{ width: 28 }}>#</th>
                <th className="border border-slate-300 px-2 text-left text-slate-600 font-semibold whitespace-nowrap" style={{ width: 120 }} title="PNR Code (ว่างได้ — ระบบสร้าง Dummy ตอน Review)">PNR</th>
                <th className="border border-slate-300 px-2 text-left text-slate-600 font-semibold whitespace-nowrap" style={{ width: 110 }}>Flight Set</th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 40 }}>Sector</th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 42 }}>Day</th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 120 }}>Dep Date <span className="text-red-400">*</span></th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 110, maxWidth: 110 }}>Dep Time</th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 120 }}>Arr Date</th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 110, maxWidth: 110 }}>Arr Time</th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 48 }} title="+Day = Arr Date − Dep Date">+Day</th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 60 }} title="Seat Total">Seat <span className="text-red-400">*</span></th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 90 }} title="FARE = Fare + Tax + YQ · FARE+YQ = Fare + YQ · ALL IN = ราคา All In (Fare เท่านั้น)">ประเภทราคา <span className="text-red-400">*</span></th>
                <th className="border border-slate-300 px-2 text-right text-slate-600 font-semibold whitespace-nowrap" style={{ width: 90 }}>Fare <span className="text-red-400">*</span></th>
                <th className="border border-slate-300 px-2 text-right text-slate-600 font-semibold whitespace-nowrap" style={{ width: 80 }}>Tax</th>
                <th className="border border-slate-300 px-2 text-right text-slate-600 font-semibold whitespace-nowrap" style={{ width: 80 }}>YQ</th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 56 }}>สกุลเงิน</th>
                <th className="border border-slate-300 px-2 text-left text-slate-600 font-semibold whitespace-nowrap" style={{ width: 120 }}>Condition</th>
                <th className="border border-slate-300 px-2 text-center text-amber-700 font-semibold whitespace-nowrap bg-amber-50/40" style={{ width: 150 }}>TTL</th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 80 }}>การยืนยัน</th>
                <th className="border border-slate-300 px-2 text-left text-slate-600 font-semibold whitespace-nowrap">Remark</th>
                <th className="border border-slate-300 px-2 text-center text-slate-500 font-medium whitespace-nowrap bg-slate-50" style={{ width: 52 }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {/* Empty state */}
              {pnrs.length === 0 && (
                <tr>
                  <td colSpan={21} className="border border-slate-200 py-12 px-4">
                    <div className="flex flex-col items-center gap-3">
                      <div className="text-slate-200"><PlusCircle size={36} strokeWidth={1} /></div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-500">ยังไม่มีรายการ PNR</p>
                        <p className="text-xs text-slate-400 mt-1">กรุณาเพิ่ม PNR อย่างน้อย 1 รายการก่อนดำเนินการต่อ</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <button type="button" onClick={addRow}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#05a94f] hover:bg-[#048f43] rounded-lg transition-colors shadow-sm">
                          <PlusCircle size={13} />+ เพิ่ม PNR
                        </button>
                        <button type="button" onClick={() => setBulkOpen(true)}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#05a94f] border border-[#05a94f] hover:bg-green-50 rounded-lg transition-colors">
                          <CalendarDays size={13} />หลาย PNR
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows — N sub-rows per PNR */}
              {pnrs.map((p, idx) => {
                const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                const touched = touchedRows.has(idx) || showValidation
                const missingSeat = touched && (!p.seat_total || p.seat_total <= 0)
                const fmt = (p.price_format ?? 'FARE') as 'FARE' | 'FARE_YQ' | 'ALL_IN'
                const fareErr = touched && !(p.fare > 0)
                const taxErr = touched && fmt === 'FARE' && p.tax == null
                const yqErr = touched && (fmt === 'FARE' || fmt === 'FARE_YQ') && p.yq == null
                const rowSectors = getPnrSectors(p)
                const sectorCount = Math.max(1, rowSectors.length)
                const sectorDates = getSectorDatesForPnr(p, rowSectors)
                const ttlSt = getTtlStatus(p.ttl_date ?? null, p.ttl_time ?? null)
                const missingDate = touched && !p.travel_start

                const sectorErrors: (string | null)[] = sectorDates.map((sd, i) => {
                  if (sd.travel_date && sd.arr_date && sd.arr_date < sd.travel_date) return 'Arr ต้องไม่ก่อน Dep'
                  if (i > 0) {
                    const prev = sectorDates[i - 1]
                    if (prev.arr_date && sd.travel_date && sd.travel_date < prev.arr_date) return `Dep ต้องไม่ก่อน Arr ของ S${i}`
                  }
                  return null
                })

                return (
                  <Fragment key={idx}>
                    {sectorDates.map((sd, sIdx) => {
                      const isFirst = sIdx === 0
                      const sectorErr = sectorErrors[sIdx]
                      const s = rowSectors[sIdx]

                      // isDepManual / isArrManual: use explicit flags when available (new data);
                      // fall back to date-comparison for records created before flags were added.
                      const expectedDep = p.travel_start && s ? calcSectorDate(p.travel_start, s.day_offset) ?? '' : ''
                      const expectedArr = expectedDep && s ? addDaysToDate(expectedDep, s.arr_day_offset ?? 0) : ''
                      const isDepManual = sd.dep_manual != null
                        ? !!sd.dep_manual
                        : !!(sd.travel_date && expectedDep && sd.travel_date !== expectedDep)
                      const isArrManual = sd.arr_manual != null
                        ? !!sd.arr_manual
                        : !!(sd.arr_date && expectedArr && sd.arr_date !== expectedArr)

                      const displayDep = (shiftConfirm?.pnrIdx === idx && sIdx === 0) ? shiftConfirm.newDep : (sd.travel_date || '')
                      const displayArr = sd.arr_date || ''

                      const sectorRowClass = cn(
                        'transition-colors',
                        isFirst ? 'border-t-2 border-t-slate-300' : 'border-t border-t-slate-100',
                        sectorErr ? 'bg-red-50/30' : rowBg,
                      )

                      return (
                        <tr key={sIdx} className={sectorRowClass}>
                          {isFirst && (
                            <>
                              {/* # */}
                              <td rowSpan={sectorCount} className="border border-slate-200 text-center text-slate-400 font-medium select-none bg-slate-50 text-[11px] align-middle">
                                {idx + 1}
                              </td>

                              {/* PNR Code */}
                              <td rowSpan={sectorCount} className="border border-slate-200 p-0 align-top">
                                <input value={p.pnr_code} onChange={e => update(idx, { pnr_code: e.target.value.toUpperCase() })}
                                  placeholder="ว่างได้" className={cn(xi, 'font-mono uppercase')} />
                                {p.dummy_pnr && (
                                  <div className="px-2 pb-1">
                                    <span className="text-[9px] text-slate-400 font-mono">{p.dummy_pnr}</span>
                                  </div>
                                )}
                              </td>

                              {/* Flight Set */}
                              <td rowSpan={sectorCount} className="border border-slate-200 p-0 align-top">
                                {schedules.length > 1 ? (
                                  <select value={p.schedule_id ?? schedules.find(sc => sc.isMain)?.scheduleId ?? schedules[0]?.scheduleId ?? ''}
                                    onChange={e => update(idx, { schedule_id: e.target.value || undefined })}
                                    className={cn(xi, 'appearance-none cursor-pointer text-slate-600')}>
                                    {schedules.map(sch => <option key={sch.scheduleId} value={sch.scheduleId}>{sch.scheduleName}{sch.isMain ? ' ★' : ''}</option>)}
                                  </select>
                                ) : (
                                  <div className={cn(xi, 'text-slate-600 cursor-default select-none')}>{schedules[0]?.scheduleName ?? 'Default'}</div>
                                )}
                              </td>
                            </>
                          )}

                          {/* Sector label */}
                          <td className="border border-slate-200 px-1 py-1 text-center align-middle">
                            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded',
                              s?.sector_type === 'Departure' ? 'bg-emerald-100 text-emerald-700' :
                              s?.sector_type === 'Arrival'   ? 'bg-blue-100 text-blue-700' :
                                                               'bg-slate-100 text-slate-600')}>
                              S{sIdx + 1}
                            </span>
                          </td>

                          {/* Day (day-of-week derived from Dep Date, read-only) */}
                          <td className="border border-slate-200 px-1 py-1 text-center align-middle">
                            <span className="text-[10px] font-semibold text-slate-500 tabular-nums">
                              {getDayLabel(displayDep)}
                            </span>
                          </td>

                          {/* Dep Date */}
                          <td className={cn('border border-slate-200 px-1 py-1 align-middle',
                            missingDate && isFirst ? 'bg-red-50/60' : sectorErr ? 'bg-red-50/20' : '')}>
                            <div className="flex items-center gap-1 group/dep">
                              <input type="date" value={displayDep}
                                onChange={e => handleSectorDepChange(idx, sIdx, e.target.value)}
                                onBlur={() => markTouched(idx)}
                                className={cn('flex-1 text-[11px] border rounded px-1.5 py-0.5 focus:outline-none min-w-0',
                                  sectorErr ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-blue-400',
                                  isDepManual ? 'border-orange-300' : '')} />
                              {isDepManual && (
                                <button type="button" onClick={() => handleResetSector(idx, sIdx)} title="คืนค่าตาม Flight Set"
                                  className="text-orange-400 hover:text-emerald-600 transition-colors shrink-0 opacity-0 group-hover/dep:opacity-100">
                                  <RotateCcw size={10} />
                                </button>
                              )}
                            </div>
                            {sectorErr && <p className="text-[9px] text-red-400 mt-0.5 px-0.5 leading-tight">{sectorErr}</p>}
                          </td>

                          {/* Dep Time */}
                          <td className="border border-slate-200 px-1 py-1 align-middle text-center">
                            <div style={{ width: 93, minWidth: 93, maxWidth: 93 }} className="mx-auto">
                              <TimeInput
                                value={sd.dep_time ?? ''}
                                onChange={v => handleSectorDepTimeChange(idx, sIdx, v)}
                                className={cn('border rounded w-full', sd.time_override ? 'border-orange-300' : 'border-slate-200')}
                                compact
                              />
                            </div>
                          </td>

                          {/* Arr Date */}
                          <td className={cn('border border-slate-200 px-1 py-1 align-middle', sectorErr ? 'bg-red-50/20' : '')}>
                            <div className="flex items-center gap-1 group/arr">
                              <input type="date" value={displayArr}
                                onChange={e => handleSectorArrChange(idx, sIdx, e.target.value)}
                                onBlur={() => markTouched(idx)}
                                className={cn('flex-1 text-[11px] border rounded px-1.5 py-0.5 focus:outline-none min-w-0',
                                  sectorErr ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-blue-400',
                                  isArrManual ? 'border-orange-300' : '')} />
                              {isArrManual && (
                                <button type="button" onClick={() => handleResetSector(idx, sIdx)} title="คืนค่าตาม Flight Set"
                                  className="text-orange-400 hover:text-emerald-600 transition-colors shrink-0 opacity-0 group-hover/arr:opacity-100">
                                  <RotateCcw size={10} />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Arr Time */}
                          <td className="border border-slate-200 px-1 py-1 align-middle text-center">
                            <div style={{ width: 93, minWidth: 93, maxWidth: 93 }} className="mx-auto">
                              <TimeInput
                                value={sd.arr_time ?? ''}
                                onChange={v => handleSectorArrTimeChange(idx, sIdx, v)}
                                className={cn('border rounded w-full', sd.time_override ? 'border-orange-300' : 'border-slate-200')}
                                compact
                              />
                            </div>
                          </td>

                          {/* +Day (read-only) */}
                          <td className="border border-slate-200 px-1 py-1 text-center align-middle select-none">
                            {(() => {
                              const pd = calculatePlusDay(sd.travel_date || null, sd.arr_date || null)
                              if (pd === null) return <span className="text-slate-300 text-[11px]">—</span>
                              if (pd < 0) return <span className="text-red-500 font-bold text-[11px]">{pd}</span>
                              if (pd === 0) return <span className="text-slate-400 text-[11px]">0</span>
                              return <span className="text-amber-600 font-bold text-[11px]">+{pd}</span>
                            })()}
                          </td>

                          {isFirst && (
                            <>
                              {/* Seat Total */}
                              <td rowSpan={sectorCount} className={cn('border border-slate-200 p-0 align-middle', missingSeat && 'bg-red-50/60')}
                                title={missingSeat ? 'กรุณาระบุจำนวน Seat' : undefined}>
                                <input type="number" min={1} value={p.seat_total || ''}
                                  onChange={e => update(idx, { seat_total: parseInt(e.target.value) || 0 })}
                                  onBlur={() => markTouched(idx)}
                                  className={cn(xi, 'text-center font-semibold')} />
                              </td>

                              {/* ประเภทราคา */}
                              <td rowSpan={sectorCount} className="border border-slate-200 p-0 align-middle">
                                <select value={p.price_format ?? 'FARE'}
                                  onChange={e => handlePriceTypeChange(idx, e.target.value as 'FARE' | 'FARE_YQ' | 'ALL_IN')}
                                  className={cn(xi, 'appearance-none cursor-pointer text-center font-semibold',
                                    (!p.price_format || p.price_format === 'FARE') ? 'text-slate-600' :
                                    p.price_format === 'FARE_YQ' ? 'text-amber-700' : 'text-blue-700')}>
                                  <option value="FARE">FARE</option>
                                  <option value="FARE_YQ">FARE+YQ</option>
                                  <option value="ALL_IN">ALL IN</option>
                                </select>
                              </td>

                              {/* Fare — แสดง tooltip "ราคา All In ต่อที่นั่ง" เมื่อเลือก ALL IN */}
                              <PriceCell rowSpan={sectorCount} value={p.fare > 0 ? p.fare : null} nullable={false}
                                hasError={fareErr}
                                errorTitle={fareErr ? 'กรุณาระบุ Fare' : (fmt === 'ALL_IN' ? 'ราคา All In ต่อที่นั่ง' : undefined)}
                                rowIdx={idx} colKey="fare" onChange={v => handleFareChange(idx, v)} onBlurRow={() => markTouched(idx)} />

                              {/* Tax — เปิดเฉพาะ FARE, ปิด (ไม่ใช้) สำหรับ FARE+YQ และ ALL IN */}
                              <PriceCell rowSpan={sectorCount}
                                value={fmt === 'FARE' ? (p.tax ?? null) : null}
                                disabled={fmt !== 'FARE'} nullable={fmt === 'FARE'}
                                hasError={taxErr} errorTitle={taxErr ? 'กรุณาระบุ Tax' : undefined}
                                rowIdx={idx} colKey="tax" onChange={v => handleTaxChange(idx, v)} onBlurRow={() => markTouched(idx)} />

                              {/* YQ — เปิดสำหรับ FARE และ FARE+YQ, ปิด (ไม่ใช้) สำหรับ ALL IN */}
                              <PriceCell rowSpan={sectorCount}
                                value={fmt !== 'ALL_IN' ? (p.yq ?? null) : null}
                                disabled={fmt === 'ALL_IN'} nullable={fmt !== 'ALL_IN'}
                                hasError={yqErr} errorTitle={yqErr ? 'กรุณาระบุ YQ' : undefined}
                                rowIdx={idx} colKey="yq" onChange={v => handleYqChange(idx, v)} onBlurRow={() => markTouched(idx)} />

                              {/* Currency */}
                              <td rowSpan={sectorCount} className="border border-slate-200 p-0 align-middle">
                                <CurrencyCombobox variant="inline" value={p.currency || currency} stockDefault={currency} currencies={currencyOptions}
                                  onChange={code => handleCurrencyChange(idx, code)} />
                              </td>

                              {/* Condition */}
                              <td rowSpan={sectorCount} className="border border-slate-200 p-0 align-middle">
                                <select value={p.condition_id || ''} onChange={e => update(idx, { condition_id: e.target.value })}
                                  className={cn(xi, 'appearance-none cursor-pointer text-slate-600')}>
                                  <option value="">ไม่ระบุ</option>
                                  {conditions.map(c => <option key={c.conditionId} value={c.conditionId}>{c.conditionName}</option>)}
                                </select>
                              </td>

                              {/* TTL */}
                              <td rowSpan={sectorCount} className={cn('border border-slate-200 p-0 align-middle bg-amber-50/20',
                                ttlSt === 'past' ? 'bg-red-50/40' : ttlSt === 'near' ? 'bg-amber-50/40' : '')}>
                                <div onClick={(e) => {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                  const vh = window.innerHeight; const pw = 400; const ph = 340
                                  const top = rect.bottom + 4 + ph > vh ? Math.max(4, rect.top - ph - 4) : rect.bottom + 4
                                  const left = Math.max(4, Math.min(rect.left, window.innerWidth - pw - 4))
                                  setTtlPopover({ idx, pos: { top, left, width: pw } })
                                }}
                                  title={ttlSt === 'past' ? 'TTL เลยกำหนดแล้ว — คลิกเพื่อแก้ไข' : ttlSt === 'near' ? 'TTL ใกล้ถึงกำหนด — คลิกเพื่อแก้ไข' : 'คลิกเพื่อแก้ไข TTL'}
                                  className="group flex items-center justify-between gap-1 px-2 py-[6px] cursor-pointer hover:bg-amber-50/60 transition-colors">
                                  {hasTtl(p) && p.ttl_date ? (
                                    <>
                                      {p.ttl_type === 'DAYS_BEFORE' ? (
                                        <div>
                                          <p className="text-[11px] font-semibold text-slate-700">ก่อนเดินทาง {p.ttl_days_before ?? '?'} วัน</p>
                                          {p.ttl_date && <p className="text-[10px] text-slate-500">{formatTtlDisplayUtil(p.ttl_date, p.ttl_time ?? null)}</p>}
                                        </div>
                                      ) : p.ttl_type === 'FIXED_DATE' ? (
                                        <div>
                                          <p className="text-[11px] font-semibold text-slate-700">วันที่กำหนดเอง</p>
                                          {p.ttl_date && <p className="text-[10px] text-slate-500">{formatTtlDisplayUtil(p.ttl_date, p.ttl_time ?? null)}</p>}
                                        </div>
                                      ) : (
                                        <span className={cn('text-[11px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis',
                                          ttlSt === 'past' ? 'text-red-600' : ttlSt === 'near' ? 'text-amber-600' : 'text-slate-700')}>
                                          {formatTtlDisplay(p.ttl_date, p.ttl_time ?? null)}
                                        </span>
                                      )}
                                      <Pencil size={10} className="text-slate-200 group-hover:text-slate-400 transition-colors shrink-0" />
                                    </>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 italic">ไม่ระบุ</span>
                                  )}
                                </div>
                              </td>

                              {/* Confirmation Status */}
                              <td rowSpan={sectorCount} className="border border-slate-200 p-0 align-middle">
                                <select value={p.status} onChange={e => {
                                  const s = e.target.value as PNRStatus
                                  update(idx, {
                                    status: s,
                                    confirmation_status: s === 'Confirmed' ? 'CONFIRMED' : 'PENDING_CONFIRMATION',
                                  })
                                }}
                                  className={cn(xi, 'appearance-none cursor-pointer text-center font-semibold', STATUS_COLORS[p.status] || 'text-slate-600')}>
                                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                </select>
                              </td>

                              {/* Remark */}
                              <td rowSpan={sectorCount} className="border border-slate-200 p-0 align-middle">
                                <input value={p.remark} onChange={e => update(idx, { remark: e.target.value })}
                                  placeholder="หมายเหตุ..." className={cn(xi, 'text-slate-500')} />
                              </td>

                              {/* Action */}
                              <td rowSpan={sectorCount} className="border border-slate-200 bg-slate-50 align-middle">
                                <div className="flex items-center justify-center gap-0.5 px-1 py-1">
                                  <button type="button" onClick={() => duplicateRow(idx)} title="Duplicate PNR"
                                    className="p-1.5 rounded text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                                    <Copy size={12} />
                                  </button>
                                  <button type="button" onClick={() => handleResetAllSectors(idx)} title="คืนค่าทุก Sector ตาม Flight Set"
                                    className="p-1.5 rounded text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors">
                                    <RotateCcw size={12} />
                                  </button>
                                  <button type="button" onClick={() => deleteRow(idx)} title="ลบ PNR นี้"
                                    className="p-1.5 rounded transition-colors text-slate-300 hover:text-red-500 hover:bg-red-50">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}

                    {/* S1 shift confirmation row */}
                    {shiftConfirm?.pnrIdx === idx && (
                      <tr>
                        <td colSpan={21} className="border border-blue-300 bg-blue-50/90 px-3 py-2">
                          <div className="flex items-center gap-3 text-xs text-blue-800 flex-wrap">
                            <CalendarDays size={13} className="shrink-0 text-blue-500" />
                            <span className="flex-1 min-w-0">
                              Travel Start เปลี่ยนเป็น <strong>{formatTravelDate(shiftConfirm.newDep)}</strong>
                              {' '}— ต้องการคำนวณวันที่ Sector อื่นใหม่อย่างไร?
                            </span>
                            <button type="button" onClick={confirmRecalcAll}
                              className="px-2.5 py-1 bg-blue-600 text-white rounded text-[10px] font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0">
                              คำนวณใหม่ทุก Sector
                            </button>
                            <button type="button" onClick={confirmRecalcNonManual}
                              className="px-2.5 py-1 bg-white border border-blue-300 text-blue-700 rounded text-[10px] hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0">
                              เฉพาะ Sector ที่ไม่ได้แก้เอง
                            </button>
                            <button type="button" onClick={confirmKeepManual}
                              className="px-2.5 py-1 bg-white border border-slate-300 text-slate-600 rounded text-[10px] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0">
                              คงค่าที่แก้เอง
                            </button>
                            <button type="button" onClick={() => setShiftConfirm(null)}
                              className="px-2.5 py-1 text-slate-400 hover:text-slate-600 text-[10px] transition-colors whitespace-nowrap shrink-0">
                              ยกเลิก
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Price type confirmation row */}
                    {priceTypeConfirm?.idx === idx && (
                      <tr>
                        <td colSpan={21} className="border border-amber-300 bg-amber-50/90 px-3 py-2">
                          <div className="flex items-center gap-3 text-xs text-amber-800">
                            <span className="shrink-0">⚠</span>
                            <span>
                              {(() => {
                                const pp = pnrs[priceTypeConfirm.idx]
                                const losingTax = (priceTypeConfirm.newFmt === 'FARE_YQ' || priceTypeConfirm.newFmt === 'ALL_IN') && (pp.tax ?? 0) > 0
                                const losingYq = priceTypeConfirm.newFmt === 'ALL_IN' && (pp.yq ?? 0) > 0
                                if (losingTax && losingYq) return 'ค่า Tax / YQ ที่กรอกไว้จะถูกล้างออก'
                                if (losingTax) return 'ค่า Tax ที่กรอกไว้จะถูกล้างออก'
                                return 'ค่า YQ ที่กรอกไว้จะถูกล้างออก'
                              })()}
                              {' '}— ต้องการเปลี่ยนประเภทราคาหรือไม่?
                            </span>
                            <button type="button" onClick={() => { commitPriceTypeChange(priceTypeConfirm.idx, priceTypeConfirm.newFmt); setPriceTypeConfirm(null) }}
                              className="px-2.5 py-1 bg-amber-600 text-white rounded text-[10px] font-semibold hover:bg-amber-700 transition-colors whitespace-nowrap shrink-0">
                              ล้างและเปลี่ยน
                            </button>
                            <button type="button" onClick={() => setPriceTypeConfirm(null)}
                              className="px-2.5 py-1 bg-white border border-amber-300 text-amber-700 rounded text-[10px] hover:bg-amber-50 transition-colors whitespace-nowrap shrink-0">
                              ยกเลิก
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Currency confirmation row */}
                    {currencyConfirm?.idx === idx && (
                      <tr>
                        <td colSpan={21} className="border border-amber-300 bg-amber-50/90 px-3 py-2">
                          <div className="flex items-center gap-3 text-xs text-amber-800">
                            <span className="shrink-0">⚠</span>
                            <span className="flex-1 min-w-0">
                              เปลี่ยนสกุลเงิน PNR จาก{' '}
                              <strong className="font-mono">{p.currency || currency}</strong>{' '}
                              เป็น <strong className="font-mono">{currencyConfirm.newCurrency}</strong>
                              {' '}— ราคาที่กรอกไว้จะไม่ถูกแปลงอัตโนมัติ ต้องการเปลี่ยนหรือไม่?
                            </span>
                            <button type="button" onClick={() => { update(currencyConfirm.idx, { currency: currencyConfirm.newCurrency }); setCurrencyConfirm(null) }}
                              className="px-2.5 py-1 bg-amber-600 text-white rounded text-[10px] font-semibold hover:bg-amber-700 transition-colors whitespace-nowrap shrink-0">
                              เปลี่ยนสกุลเงิน
                            </button>
                            <button type="button" onClick={() => setCurrencyConfirm(null)}
                              className="px-2.5 py-1 bg-white border border-amber-300 text-amber-700 rounded text-[10px] hover:bg-amber-50 transition-colors whitespace-nowrap shrink-0">
                              ยกเลิก
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}

              {/* Summary footer */}
              {pnrs.length > 0 && (
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold select-none">
                  <td colSpan={10} className="border border-slate-300 px-3 py-1.5 text-xs text-slate-600 text-right">
                    รวม {pnrs.length} PNR
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-center text-slate-800 font-bold">
                    {totals.seat.toLocaleString('en-US')}
                  </td>
                  <td colSpan={10} className="border border-slate-300" />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-3 py-2 bg-slate-50 border-t border-slate-200 flex-wrap text-[11px] text-slate-500">
          <span>Dep/Arr Date ของแต่ละ Sector แก้ไขได้โดยตรง · วันที่ที่แก้เองจะแสดงขอบสีส้ม · คลิก ↺ เพื่อคืนค่าตาม Flight Set</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300" />
            <span>{'TTL = กำหนดส่ง NAME — กรอกเองต่อ PNR หรือใช้ปุ่ม "ตั้ง TTL ทุก PNR"'}</span>
          </div>
          <span className="text-slate-400 shrink-0">FARE = ระบุ Fare, Tax และ YQ · FARE+YQ = ระบุ Fare และ YQ · ALL IN = ระบุราคา All In ในช่อง Fare</span>
          <span className="text-slate-400 shrink-0">ยังไม่ระบุ = ยังไม่ได้กรอก · 0.00 = ยืนยันว่าเป็นศูนย์ · ไม่ใช้ = ไม่เกี่ยวข้องกับประเภทราคานี้</span>
          <span className="text-slate-400 shrink-0">PNR ว่างได้ · Dummy PNR สร้างอัตโนมัติตอน Review</span>
          <span className="ml-auto text-slate-400 shrink-0">
            <span className="text-red-400">*</span>{' '}หมายถึงข้อมูลที่จำเป็นต้องกรอกทุก PNR · ช่อง Fare Tax และ YQ จะบังคับตามประเภทราคาที่เลือก
          </span>
        </div>
      </div>

      {/* ─── Bulk TTL Modal ─────────────────────────────────────────── */}
      <Modal open={bulkTtlOpen} onClose={closeBulkTtl} title="ตั้งค่า TTL" size="lg"
        footer={
          bulkTtlInnerStep === 'config' ? (
            <div className="flex w-full items-center justify-between gap-2">
              <Button variant="ghost" onClick={closeBulkTtl}>ยกเลิก</Button>
              <Button disabled={!ttlCanApply} onClick={handleBulkTtlConfirm}>ยืนยัน ({ttlTargetIndices.length} PNR)</Button>
            </div>
          ) : (
            <div className="flex w-full items-center justify-start">
              <Button variant="ghost" size="sm" onClick={() => setBulkTtlInnerStep('config')}>กลับแก้ไข</Button>
            </div>
          )
        }>
        {bulkTtlInnerStep === 'config' ? (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2.5">วิธีกำหนด TTL</p>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="radio" name="ttl_mode" checked={bulkTtlMode === 'days_before'} onChange={() => setBulkTtlMode('days_before')} className="accent-[#05a94f]" />
                  <span className="text-sm text-slate-700">ก่อนวันเดินทาง</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="radio" name="ttl_mode" checked={bulkTtlMode === 'fixed_date'} onChange={() => setBulkTtlMode('fixed_date')} className="accent-[#05a94f]" />
                  <span className="text-sm text-slate-700">เลือกวันที่เอง</span>
                </label>
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
                    <span className="text-sm text-slate-700 flex-1">
                      {scope === 'no_ttl' ? 'เฉพาะ PNR ที่ยังไม่มี TTL' : scope === 'all' ? 'ทุก PNR' : 'เฉพาะ PNR ที่เลือก'}
                    </span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                      {scope === 'no_ttl' ? pnrs.filter(p => !hasTtl(p)).length :
                       scope === 'all' ? pnrs.length : bulkTtlSelectedPnrs.size}
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
                        <input type="checkbox" checked={bulkTtlSelectedPnrs.has(i)} onChange={() => { const next = new Set(bulkTtlSelectedPnrs); if (next.has(i)) next.delete(i); else next.add(i); setBulkTtlSelectedPnrs(next) }} className="accent-[#05a94f]" />
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
                <p className="text-xs font-semibold text-slate-700 mb-2">ตัวอย่าง TTL ที่จะตั้ง ({ttlTargetIndices.length} PNR)</p>
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
                              {computedDate ? (
                                <span className={cn('font-semibold', st === 'past' ? 'text-red-600' : st === 'near' ? 'text-amber-700' : 'text-green-700')}>
                                  {formatTtlDisplay(computedDate, bulkTtlTime)}
                                </span>
                              ) : <span className="text-slate-300 italic">ไม่สามารถคำนวณ</span>}
                            </td>
                          </tr>
                        )
                      })}
                      {ttlTargetIndices.length > 4 && (
                        <tr><td colSpan={bulkTtlMode === 'days_before' ? 4 : 3} className="px-3 py-1.5 text-center text-[11px] text-slate-400 italic border-t border-slate-100">และอีก {ttlTargetIndices.length - 4} PNR ที่เหลือ</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {ttlNoDepsCount > 0 && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-amber-700">{ttlNoDepsCount} PNR ยังไม่มีวันเดินทาง — รายการเหล่านั้นจะถูกข้ามไป</p>
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
                <p className="text-sm font-semibold text-amber-800 mb-1">มี {ttlExistingTtlCount} PNR ที่มี TTL อยู่แล้วในขอบเขตนี้</p>
                <p className="text-xs text-amber-700">จาก {ttlTargetIndices.length} PNR ที่เลือก ต้องการจัดการอย่างไร?</p>
              </div>
            </div>
            <div className="space-y-2.5">
              <button type="button" onClick={() => commitBulkTtl('all')}
                className="w-full flex items-center justify-between px-4 py-3 border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors text-left">
                <div>
                  <p className="text-sm font-semibold text-amber-800">เขียนทับทั้งหมด</p>
                  <p className="text-xs text-amber-600 mt-0.5">อัปเดต TTL ทุก PNR ในขอบเขต ({ttlTargetIndices.length} รายการ)</p>
                </div>
                <span className="text-amber-400 text-xl font-light ml-3">→</span>
              </button>
              <button type="button" onClick={() => commitBulkTtl('skip_existing')}
                className="w-full flex items-center justify-between px-4 py-3 border-2 border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition-colors text-left">
                <div>
                  <p className="text-sm font-semibold text-slate-700">อัปเดตเฉพาะที่ยังไม่มี TTL</p>
                  <p className="text-xs text-slate-500 mt-0.5">ข้าม {ttlExistingTtlCount} รายการที่มี TTL แล้ว — ตั้ง TTL ให้ {ttlNoTtlCount} รายการ</p>
                </div>
                <span className="text-slate-300 text-xl font-light ml-3">→</span>
              </button>
              <button type="button" onClick={() => setBulkTtlInnerStep('config')}
                className="w-full px-4 py-2.5 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors text-sm text-slate-500">
                ยกเลิก — กลับไปแก้ไข
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Delete Confirm Modal ────────────────────────────────────── */}
      <Modal open={deleteConfirmIdx !== null} onClose={() => setDeleteConfirmIdx(null)} title="ยืนยันการลบ PNR" size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirmIdx(null)}>ยกเลิก</Button>
            <Button variant="danger" onClick={confirmDelete}>ลบ PNR นี้</Button>
          </div>
        }>
        <p className="text-sm text-slate-600">
          คุณต้องการลบ PNR รายการที่ <strong>{deleteConfirmIdx !== null ? deleteConfirmIdx + 1 : ''}</strong> ออกจากรายการหรือไม่?
        </p>
        {pnrs.length === 1 && (
          <p className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">นี่คือ PNR รายการสุดท้าย หากลบแล้วจะต้องเพิ่ม PNR ใหม่ก่อนดำเนินการต่อ</p>
        )}
      </Modal>

      <ImportExcelModal open={importOpen} onClose={() => setImportOpen(false)} onConfirm={addPastedPNRs} existingPnrCodes={existingPnrCodes} sectors={sectors} />

      <BulkPnrBuilder open={bulkOpen} onClose={() => setBulkOpen(false)} mode="create_stock" sectors={builderSectors} conditions={builderConditions} currency={currency} onConfirm={addBulkPNRs} />

      {/* TTL row-level Editor */}
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
            onSave={(val) => {
              update(ttlPopover.idx, {
                ttl_type: val.ttlType,
                ttl_days_before: val.ttlDaysBefore,
                ttl_status: val.ttlType !== 'NONE' ? 'SET' : 'UNSET',
                ttl_date: val.ttlDate,
                ttl_time: val.ttlTime,
              })
              setTtlPopover(null)
            }}
            onClose={() => setTtlPopover(null)}
          />
        </>
      )}
    </div>
  )
}
