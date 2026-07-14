'use client'

import { useRef, useState, useMemo, useEffect } from 'react'
import { PlusCircle, Trash2, Copy, Info, CalendarDays, FileUp, Download, AlertTriangle, RefreshCw, RotateCcw, Pencil, MoreVertical } from 'lucide-react'
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
const STATUS_LABELS: Record<string, string> = { Pending: 'รอยืนยัน', Confirmed: 'ยืนยันแล้ว' }

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

function addDaysToDate(dateStr: string, days: number): string {
  if (!dateStr) return ''
  if (days === 0) return dateStr
  try {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  } catch { return dateStr }
}


// ─── PriceInput (form-grid variant of price cell) ─────────────────────────────
function PriceInput({
  value,
  nullable = false,
  disabled = false,
  hasError = false,
  errorTitle,
  onChange,
  onBlur,
}: {
  value: number | null
  nullable?: boolean
  disabled?: boolean
  hasError?: boolean
  errorTitle?: string
  onChange: (v: number | null) => void
  onBlur?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState(() => (value == null ? '' : String(value)))
  const preEditRef = useRef<number | null>(null)

  useEffect(() => {
    if (inputRef.current !== document.activeElement) {
      setRaw(value == null ? '' : String(value))
    }
  }, [value])

  const fmtDisplay = (v: number | null) =>
    v == null ? '' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

  if (disabled) {
    return (
      <div className="w-full px-2.5 py-1.5 text-xs border border-slate-100 rounded-lg bg-slate-50 text-center text-slate-300 select-none">
        ไม่ใช้
      </div>
    )
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={focused ? raw : fmtDisplay(value)}
      placeholder={focused ? (nullable ? 'ว่าง = ไม่ระบุ' : '0.00') : (value == null ? 'ยังไม่ระบุ' : '')}
      title={hasError && errorTitle ? errorTitle : undefined}
      className={cn(
        'w-full px-2.5 py-1.5 text-right text-xs tabular-nums border rounded-lg focus:outline-none transition-colors',
        hasError
          ? 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-1 focus:ring-red-300/30'
          : focused
          ? 'border-[#05a94f] bg-emerald-50/20 focus:ring-1 focus:ring-[#05a94f]/20'
          : 'border-slate-200 focus:border-[#05a94f] focus:ring-1 focus:ring-[#05a94f]/20',
        !focused && value == null ? 'placeholder:text-slate-300' : 'text-slate-800 font-semibold',
      )}
      onFocus={e => {
        preEditRef.current = value
        setFocused(true)
        setRaw(value == null ? '' : String(value))
        requestAnimationFrame(() => e.target.select())
      }}
      onBlur={() => {
        setFocused(false)
        commit(raw)
        onBlur?.()
      }}
      onChange={e => setRaw(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault()
          const prev = preEditRef.current
          onChange(prev)
          setRaw(prev == null ? '' : String(prev))
          setFocused(false)
          inputRef.current?.blur()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          commit(raw)
          setFocused(false)
          inputRef.current?.blur()
        }
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

// ─── Field style constants ────────────────────────────────────────────────────
const FL = 'block text-[10px] font-medium text-slate-500 mb-0.5'
const FI = 'w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#05a94f] focus:ring-1 focus:ring-[#05a94f]/20 bg-white transition-colors'

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
  const [openMenuIdx, setOpenMenuIdx] = useState<number | null>(null)
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
      const systemCodes = getDemoStocks().flatMap(s => s.pnrs.flatMap(p => [p.pnrCode, p.dummyPnr].filter(Boolean) as string[]))
      return [...new Set([...draftCodes, ...systemCodes])]
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
        const dep_time = sd.dep_time !== undefined ? sd.dep_time : (s?.dep_time ?? '')
        const arr_time = sd.arr_time !== undefined ? sd.arr_time : (s?.arr_time ?? '')
        return { ...sd, day_offset: s?.day_offset ?? sd.day_offset, travel_date: dep, arr_date: arr, dep_time, arr_time }
      })
    }
    return sects.map(s => {
      const dep = p.travel_start ? calcSectorDate(p.travel_start, s.day_offset) ?? '' : ''
      const arr = dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : ''
      return {
        sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep, arr_date: arr,
        dep_manual: false as const, arr_manual: false as const,
        dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const,
      }
    })
  }

  // ─── Price handlers ────────────────────────────────────────────────────────
  const commitPriceTypeChange = (idx: number, newFmt: 'FARE' | 'FARE_YQ' | 'ALL_IN') => {
    const p = pnrs[idx]
    let newTax: number | null = null
    let newYq: number | null = null
    if (newFmt === 'FARE') { newTax = p.tax; newYq = p.yq ?? null }
    else if (newFmt === 'FARE_YQ') { newTax = null; newYq = p.yq ?? null }
    update(idx, { price_format: newFmt, fare: p.fare, tax: newTax, yq: newYq, total_amount: calcPnrTotal(newFmt, p.fare, newTax, newYq) })
  }

  const handlePriceTypeChange = (idx: number, newFmt: 'FARE' | 'FARE_YQ' | 'ALL_IN') => {
    const p = pnrs[idx]
    const oldFmt = (p.price_format ?? 'FARE') as string
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
    const hasPrices = (p.fare > 0) || ((p.yq ?? 0) > 0)
    if (hasPrices) { setCurrencyConfirm({ idx, newCurrency: newCode }); return }
    update(idx, { currency: newCode })
  }

  // ─── Sector date handlers ──────────────────────────────────────────────────
  const handleSectorDepChange = (pnrIdx: number, sIdx: number, newDep: string) => {
    const p = pnrs[pnrIdx]
    const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const currentDep = currentSDs[sIdx]?.travel_date ?? ''
    if (sIdx === 0) {
      if (currentDep && newDep !== currentDep) { setShiftConfirm({ pnrIdx, origDep: currentDep, newDep }); return }
      const newSDs = sects.map((s, i) => {
        const dep = newDep ? calcSectorDate(newDep, s.day_offset) ?? '' : ''
        const arr = dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : ''
        return { ...currentSDs[i], sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep, arr_date: arr, dep_manual: false as const, arr_manual: false as const }
      })
      const lastArr = newSDs[newSDs.length - 1]?.arr_date || ''
      markTouched(pnrIdx)
      onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_start: newDep, travel_end: lastArr, sector_dates: newSDs }))
      return
    }
    const newSDs = currentSDs.map((sd, i) => i === sIdx ? { ...sd, travel_date: newDep, dep_manual: !!newDep } : sd)
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_start: row.travel_start || newDep, sector_dates: newSDs }))
  }

  const handleSectorArrChange = (pnrIdx: number, sIdx: number, newArr: string) => {
    const p = pnrs[pnrIdx]
    const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const isLast = sIdx === currentSDs.length - 1
    const newSDs = currentSDs.map((sd, i) => i === sIdx ? { ...sd, arr_date: newArr, arr_manual: !!newArr } : sd)
    markTouched(pnrIdx)
    onChange(pnrs.map((row, i) => i !== pnrIdx ? row : { ...row, travel_end: isLast ? newArr : row.travel_end, sector_dates: newSDs }))
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

  const confirmRecalcNonManual = () => {
    if (!shiftConfirm) return
    const { pnrIdx, newDep } = shiftConfirm
    const p = pnrs[pnrIdx]
    const sects = getPnrSectors(p)
    const currentSDs = getSectorDatesForPnr(p, sects)
    const newSDs = sects.map((s, i) => {
      const sd = currentSDs[i]
      if (sd?.dep_manual) {
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
      ? { ...sd, travel_date: dep, arr_date: arr, dep_manual: false as const, arr_manual: false as const, dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
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

  // ─── update ────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-slate-800/95 text-white text-xs px-4 py-2 rounded-full shadow-xl pointer-events-none">
          {toastMsg}
        </div>
      )}

      {/* OUTDATED banner */}
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
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
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

      {/* Empty state */}
      {pnrs.length === 0 && (
        <div className="border border-slate-200 rounded-xl py-12 px-4 bg-white">
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
        </div>
      )}

      {/* PNR Cards */}
      {pnrs.map((p, idx) => {
        const rowSectors = getPnrSectors(p)
        const sectorDates = getSectorDatesForPnr(p, rowSectors)
        const fmt = (p.price_format ?? 'FARE') as 'FARE' | 'FARE_YQ' | 'ALL_IN'
        const touched = touchedRows.has(idx) || showValidation
        const missingSeat = touched && (!p.seat_total || p.seat_total <= 0)
        const fareErr = touched && !(p.fare > 0)
        const taxErr = touched && fmt === 'FARE' && p.tax == null
        const yqErr = touched && (fmt === 'FARE' || fmt === 'FARE_YQ') && p.yq == null
        const missingDate = touched && !p.travel_start
        const ttlSt = getTtlStatus(p.ttl_date ?? null, p.ttl_time ?? null)
        const activeScheduleId = p.schedule_id ?? schedules.find(s => s.isMain)?.scheduleId ?? schedules[0]?.scheduleId ?? ''
        const fsName = schedules.find(s => s.scheduleId === activeScheduleId)?.scheduleName ?? schedules[0]?.scheduleName ?? 'Default'

        const sectorErrors: (string | null)[] = sectorDates.map((sd, i) => {
          if (sd.travel_date && sd.arr_date && sd.arr_date < sd.travel_date) return 'Arr ต้องไม่ก่อน Dep'
          if (i > 0) {
            const prev = sectorDates[i - 1]
            if (prev.arr_date && sd.travel_date && sd.travel_date < prev.arr_date) return `Dep ต้องไม่ก่อน Arr ของ S${i}`
          }
          return null
        })

        return (
          <div key={idx} className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-visible">

            {/* ── Card Header ──────────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 rounded-t-xl min-w-0">
              <span className="text-[11px] font-medium text-slate-400 w-5 text-center shrink-0">{idx + 1}</span>
              <span className="font-mono text-xs font-bold text-slate-700 truncate">
                {p.pnr_code || p.dummy_pnr || <span className="text-slate-300 italic font-normal text-[11px]">ยังไม่ระบุ PNR</span>}
              </span>
              <span className="text-slate-300 shrink-0 text-xs">·</span>
              <span className="text-[11px] text-slate-500 truncate min-w-0">{fsName}</span>
              <span className="ml-auto text-[11px] text-slate-500 shrink-0 whitespace-nowrap">{p.seat_total || 0} ที่นั่ง</span>

              {/* Confirmation Switch */}
              <div className="flex items-center gap-1.5 shrink-0 pl-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.status === 'Confirmed'}
                  aria-label={`การยืนยัน PNR ${idx + 1}: ${STATUS_LABELS[p.status] ?? 'รอยืนยัน'}`}
                  onClick={() => {
                    const ns: PNRStatus = p.status === 'Confirmed' ? 'Pending' : 'Confirmed'
                    update(idx, { status: ns, confirmation_status: ns === 'Confirmed' ? 'CONFIRMED' : 'PENDING_CONFIRMATION' })
                    showToast(`เปลี่ยนสถานะเป็น ${STATUS_LABELS[ns]}`)
                  }}
                  onKeyDown={e => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      const ns: PNRStatus = p.status === 'Confirmed' ? 'Pending' : 'Confirmed'
                      update(idx, { status: ns, confirmation_status: ns === 'Confirmed' ? 'CONFIRMED' : 'PENDING_CONFIRMATION' })
                      showToast(`เปลี่ยนสถานะเป็น ${STATUS_LABELS[ns]}`)
                    }
                  }}
                  className={cn(
                    'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#05a94f]/40 focus-visible:ring-offset-1',
                    p.status === 'Confirmed' ? 'bg-[#05a94f]' : 'bg-slate-300',
                  )}
                >
                  <span className={cn(
                    'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200',
                    p.status === 'Confirmed' ? 'translate-x-4' : 'translate-x-0.5',
                  )} />
                </button>
                <span className={cn('text-xs font-medium whitespace-nowrap', p.status === 'Confirmed' ? 'text-green-600' : 'text-slate-400')}>
                  {STATUS_LABELS[p.status] ?? 'รอยืนยัน'}
                </span>
              </div>

              {/* 3-dot menu */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setOpenMenuIdx(openMenuIdx === idx ? null : idx)}
                  aria-label="เมนูเพิ่มเติม"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  <MoreVertical size={14} />
                </button>
                {openMenuIdx === idx && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpenMenuIdx(null)} />
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                      <button type="button"
                        onClick={() => { duplicateRow(idx); setOpenMenuIdx(null) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors text-left">
                        <Copy size={12} className="shrink-0" /> คัดลอก PNR
                      </button>
                      <button type="button"
                        onClick={() => { handleResetAllSectors(idx); setOpenMenuIdx(null) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors text-left">
                        <RotateCcw size={12} className="shrink-0" /> คืนค่าตาม Flight Set
                      </button>
                      <div className="my-1 border-t border-slate-100" />
                      <button type="button"
                        onClick={() => { deleteRow(idx); setOpenMenuIdx(null) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors text-left">
                        <Trash2 size={12} className="shrink-0" /> ลบ PNR
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Form Grid ─────────────────────────────────────────────── */}
            <div className="p-3 border-b border-slate-100">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2.5">

                {/* PNR Code */}
                <div className="col-span-2 md:col-span-1 xl:col-span-2">
                  <label className={FL}>PNR Code</label>
                  <input
                    value={p.pnr_code}
                    onChange={e => update(idx, { pnr_code: e.target.value.toUpperCase() })}
                    placeholder="ว่างได้"
                    className={cn(FI, 'font-mono uppercase')}
                  />
                  {p.dummy_pnr && <p className="text-[10px] text-slate-400 mt-0.5 font-mono truncate">{p.dummy_pnr}</p>}
                </div>

                {/* Flight Set */}
                <div className="col-span-2 md:col-span-1 xl:col-span-2">
                  <label className={FL}>Flight Set</label>
                  {schedules.length > 1 ? (
                    <select
                      value={activeScheduleId}
                      onChange={e => update(idx, { schedule_id: e.target.value || undefined })}
                      className={cn(FI, 'appearance-none cursor-pointer')}
                    >
                      {schedules.map(sch => (
                        <option key={sch.scheduleId} value={sch.scheduleId}>{sch.scheduleName}{sch.isMain ? ' ★' : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <div className={cn(FI, 'text-slate-600 cursor-default select-none bg-slate-50')}>{schedules[0]?.scheduleName ?? 'Default'}</div>
                  )}
                </div>

                {/* Seat */}
                <div>
                  <label className={FL}>Seat <span className="text-red-400">*</span></label>
                  <input
                    type="number" min={1}
                    value={p.seat_total || ''}
                    onChange={e => update(idx, { seat_total: parseInt(e.target.value) || 0 })}
                    onBlur={() => markTouched(idx)}
                    title={missingSeat ? 'กรุณาระบุจำนวน Seat' : undefined}
                    className={cn(FI, 'text-center font-semibold', missingSeat && 'border-red-300 bg-red-50')}
                  />
                </div>

                {/* Price Type */}
                <div>
                  <label className={FL}>ประเภทราคา <span className="text-red-400">*</span></label>
                  <select
                    value={fmt}
                    onChange={e => handlePriceTypeChange(idx, e.target.value as 'FARE' | 'FARE_YQ' | 'ALL_IN')}
                    className={cn(FI, 'appearance-none cursor-pointer font-semibold',
                      fmt === 'FARE_YQ' ? 'text-amber-700' : fmt === 'ALL_IN' ? 'text-blue-700' : 'text-slate-700')}
                  >
                    <option value="FARE">FARE</option>
                    <option value="FARE_YQ">FARE+YQ</option>
                    <option value="ALL_IN">ALL IN</option>
                  </select>
                </div>

                {/* Fare */}
                <div>
                  <label className={FL}>Fare <span className="text-red-400">*</span></label>
                  <PriceInput
                    value={p.fare > 0 ? p.fare : null}
                    hasError={fareErr}
                    errorTitle={fareErr ? 'กรุณาระบุ Fare' : (fmt === 'ALL_IN' ? 'ราคา All In ต่อที่นั่ง' : undefined)}
                    onChange={v => handleFareChange(idx, v)}
                    onBlur={() => markTouched(idx)}
                  />
                </div>

                {/* Tax */}
                <div>
                  <label className={FL}>Tax</label>
                  <PriceInput
                    value={fmt === 'FARE' ? (p.tax ?? null) : null}
                    disabled={fmt !== 'FARE'}
                    nullable={fmt === 'FARE'}
                    hasError={taxErr}
                    errorTitle={taxErr ? 'กรุณาระบุ Tax' : undefined}
                    onChange={v => handleTaxChange(idx, v)}
                    onBlur={() => markTouched(idx)}
                  />
                </div>

                {/* YQ */}
                <div>
                  <label className={FL}>YQ</label>
                  <PriceInput
                    value={fmt !== 'ALL_IN' ? (p.yq ?? null) : null}
                    disabled={fmt === 'ALL_IN'}
                    nullable={fmt !== 'ALL_IN'}
                    hasError={yqErr}
                    errorTitle={yqErr ? 'กรุณาระบุ YQ' : undefined}
                    onChange={v => handleYqChange(idx, v)}
                    onBlur={() => markTouched(idx)}
                  />
                </div>

                {/* Currency */}
                <div>
                  <label className={FL}>สกุลเงิน</label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <CurrencyCombobox
                      variant="inline"
                      value={p.currency || currency}
                      stockDefault={currency}
                      currencies={currencyOptions}
                      onChange={code => handleCurrencyChange(idx, code)}
                    />
                  </div>
                </div>

                {/* Condition */}
                <div className="col-span-2">
                  <label className={FL}>Condition</label>
                  <select
                    value={p.condition_id || ''}
                    onChange={e => update(idx, { condition_id: e.target.value })}
                    className={cn(FI, 'appearance-none cursor-pointer')}
                  >
                    <option value="">ไม่ระบุ</option>
                    {conditions.map(c => <option key={c.conditionId} value={c.conditionId}>{c.conditionName}</option>)}
                  </select>
                </div>

                {/* TTL */}
                <div className="col-span-2 xl:col-span-3">
                  <label className={cn(FL, 'text-amber-600')}>TTL — กำหนดส่ง NAME</label>
                  <button
                    type="button"
                    onClick={e => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      const vh = window.innerHeight; const pw = 400; const ph = 340
                      const top = rect.bottom + 4 + ph > vh ? Math.max(4, rect.top - ph - 4) : rect.bottom + 4
                      const left = Math.max(4, Math.min(rect.left, window.innerWidth - pw - 4))
                      setTtlPopover({ idx, pos: { top, left, width: pw } })
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-1.5 text-xs border rounded-lg text-left cursor-pointer transition-colors',
                      ttlSt === 'past' ? 'border-red-300 bg-red-50/40 hover:bg-red-50/60' :
                      ttlSt === 'near' ? 'border-amber-300 bg-amber-50/40 hover:bg-amber-50/60' :
                      hasTtl(p) ? 'border-amber-200 bg-amber-50/20 hover:bg-amber-50/40' :
                      'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    {hasTtl(p) && p.ttl_date ? (
                      <>
                        <span>
                          {p.ttl_type === 'DAYS_BEFORE' ? (
                            <span className={cn('font-semibold', ttlSt === 'past' ? 'text-red-600' : ttlSt === 'near' ? 'text-amber-700' : 'text-slate-700')}>
                              ก่อนเดินทาง {p.ttl_days_before ?? '?'} วัน
                              <span className="ml-1.5 text-slate-400 font-normal">({formatTtlDisplayUtil(p.ttl_date, p.ttl_time ?? null)})</span>
                            </span>
                          ) : (
                            <span className={cn('font-semibold', ttlSt === 'past' ? 'text-red-600' : ttlSt === 'near' ? 'text-amber-700' : 'text-slate-700')}>
                              {formatTtlDisplay(p.ttl_date, p.ttl_time ?? null)}
                            </span>
                          )}
                        </span>
                        <Pencil size={11} className="text-slate-300 shrink-0 ml-2" />
                      </>
                    ) : (
                      <span className="text-slate-300 italic">คลิกเพื่อตั้ง TTL...</span>
                    )}
                  </button>
                </div>

                {/* Remark */}
                <div className="col-span-2 md:col-span-4 xl:col-span-3">
                  <label className={FL}>Remark</label>
                  <input
                    value={p.remark}
                    onChange={e => update(idx, { remark: e.target.value })}
                    placeholder="หมายเหตุ..."
                    className={cn(FI, 'text-slate-600')}
                  />
                </div>
              </div>

              {/* Inline confirmation banners */}
              {shiftConfirm?.pnrIdx === idx && (
                <div className="mt-3 flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex-wrap">
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
              )}

              {priceTypeConfirm?.idx === idx && (
                <div className="mt-3 flex items-center gap-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex-wrap">
                  <span className="shrink-0">⚠</span>
                  <span className="flex-1 min-w-0">
                    {(() => {
                      const pp = pnrs[priceTypeConfirm.idx]
                      const losingTax = (priceTypeConfirm.newFmt === 'FARE_YQ' || priceTypeConfirm.newFmt === 'ALL_IN') && (pp.tax ?? 0) > 0
                      const losingYq = priceTypeConfirm.newFmt === 'ALL_IN' && (pp.yq ?? 0) > 0
                      if (losingTax && losingYq) return 'ค่า Tax / YQ จะถูกล้างออก'
                      if (losingTax) return 'ค่า Tax จะถูกล้างออก'
                      return 'ค่า YQ จะถูกล้างออก'
                    })()} — ต้องการเปลี่ยนประเภทราคาหรือไม่?
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
              )}

              {currencyConfirm?.idx === idx && (
                <div className="mt-3 flex items-center gap-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex-wrap">
                  <span className="shrink-0">⚠</span>
                  <span className="flex-1 min-w-0">
                    เปลี่ยนสกุลเงิน PNR จาก{' '}
                    <strong className="font-mono">{p.currency || currency}</strong>{' '}
                    เป็น <strong className="font-mono">{currencyConfirm.newCurrency}</strong>
                    {' '}— ราคาที่กรอกไว้จะไม่ถูกแปลงอัตโนมัติ
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
              )}
            </div>

            {/* ── Sector Table ──────────────────────────────────────────── */}
            <div className="p-3">
              {missingDate && (
                <p className="text-[10px] text-red-500 mb-1.5 flex items-center gap-1">
                  <AlertTriangle size={11} /> กรุณาระบุวันเดินทาง (Dep Date ของ S1)
                </p>
              )}
              <table className="w-full text-xs border-collapse table-fixed">
                <colgroup>
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '21%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '21%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-500 text-center">Sector</th>
                    <th className="border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-500 text-center">Day</th>
                    <th className="border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-500 text-center">Dep Date <span className="text-red-400">*</span></th>
                    <th className="border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-500 text-center">Dep Time</th>
                    <th className="border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-500 text-center">Arr Date</th>
                    <th className="border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-500 text-center">Arr Time</th>
                    <th className="border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-500 text-center">+Day</th>
                  </tr>
                </thead>
                <tbody>
                  {sectorDates.map((sd, sIdx) => {
                    const s = rowSectors[sIdx]
                    const sectorErr = sectorErrors[sIdx]
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

                    return (
                      <tr key={sIdx} className={cn(
                        'transition-colors',
                        sectorErr ? 'bg-red-50/20' : sIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40',
                      )}>
                        {/* Sector label */}
                        <td className="border border-slate-200 px-1 py-1 text-center">
                          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded',
                            s?.sector_type === 'Departure' ? 'bg-emerald-100 text-emerald-700' :
                            s?.sector_type === 'Arrival'   ? 'bg-blue-100 text-blue-700' :
                                                             'bg-slate-100 text-slate-600')}>
                            S{sIdx + 1}
                          </span>
                        </td>

                        {/* Day */}
                        <td className="border border-slate-200 px-1 py-1 text-center select-none">
                          <span className="text-[10px] font-semibold text-slate-500">{getDayLabel(displayDep)}</span>
                        </td>

                        {/* Dep Date */}
                        <td className={cn('border border-slate-200 px-1.5 py-1', sectorErr ? 'bg-red-50/20' : '')}>
                          <div className="flex items-center gap-1 group/dep">
                            <input
                              type="date"
                              value={displayDep}
                              onChange={e => handleSectorDepChange(idx, sIdx, e.target.value)}
                              onBlur={() => markTouched(idx)}
                              className={cn(
                                'flex-1 w-0 min-w-0 text-[11px] border rounded px-1.5 py-0.5 focus:outline-none bg-white',
                                sectorErr ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-blue-400',
                                isDepManual ? 'border-orange-300' : '',
                              )}
                            />
                            {isDepManual && (
                              <button type="button" onClick={() => handleResetSector(idx, sIdx)} title="คืนค่าตาม Flight Set"
                                className="text-orange-400 hover:text-emerald-600 transition-colors shrink-0 opacity-0 group-hover/dep:opacity-100">
                                <RotateCcw size={10} />
                              </button>
                            )}
                          </div>
                          {sectorErr && <p className="text-[9px] text-red-400 mt-0.5 leading-tight">{sectorErr}</p>}
                        </td>

                        {/* Dep Time */}
                        <td className="border border-slate-200 px-1 py-1 text-center">
                          <TimeInput
                            value={sd.dep_time ?? ''}
                            onChange={v => handleSectorDepTimeChange(idx, sIdx, v)}
                            className={cn('border rounded w-full', sd.time_override ? 'border-orange-300' : 'border-slate-200')}
                            compact
                          />
                        </td>

                        {/* Arr Date */}
                        <td className={cn('border border-slate-200 px-1.5 py-1', sectorErr ? 'bg-red-50/20' : '')}>
                          <div className="flex items-center gap-1 group/arr">
                            <input
                              type="date"
                              value={displayArr}
                              onChange={e => handleSectorArrChange(idx, sIdx, e.target.value)}
                              onBlur={() => markTouched(idx)}
                              className={cn(
                                'flex-1 w-0 min-w-0 text-[11px] border rounded px-1.5 py-0.5 focus:outline-none bg-white',
                                sectorErr ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-blue-400',
                                isArrManual ? 'border-orange-300' : '',
                              )}
                            />
                            {isArrManual && (
                              <button type="button" onClick={() => handleResetSector(idx, sIdx)} title="คืนค่าตาม Flight Set"
                                className="text-orange-400 hover:text-emerald-600 transition-colors shrink-0 opacity-0 group-hover/arr:opacity-100">
                                <RotateCcw size={10} />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Arr Time */}
                        <td className="border border-slate-200 px-1 py-1 text-center">
                          <TimeInput
                            value={sd.arr_time ?? ''}
                            onChange={v => handleSectorArrTimeChange(idx, sIdx, v)}
                            className={cn('border rounded w-full', sd.time_override ? 'border-orange-300' : 'border-slate-200')}
                            compact
                          />
                        </td>

                        {/* +Day */}
                        <td className="border border-slate-200 px-1 py-1 text-center select-none">
                          {(() => {
                            const pd = calculatePlusDay(sd.travel_date || null, sd.arr_date || null)
                            if (pd === null) return <span className="text-slate-300 text-[11px]">—</span>
                            if (pd < 0) return <span className="text-red-500 font-bold text-[11px]">{pd}</span>
                            if (pd === 0) return <span className="text-slate-400 text-[11px]">0</span>
                            return <span className="text-amber-600 font-bold text-[11px]">+{pd}</span>
                          })()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-1.5 text-[10px] text-slate-400">
                วันที่แก้เองจะแสดงขอบสีส้ม · คลิก ↺ เพื่อคืนค่าตาม Flight Set · เวลาสีส้ม = แก้ต่างจาก Flight Set
              </p>
            </div>
          </div>
        )
      })}

      {/* Summary */}
      {pnrs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 bg-white border border-slate-200 rounded-xl">
          {([
            { label: 'PNR รวม',       value: summaryStats.totalPnr,       cls: 'text-slate-700' },
            { label: 'Seat รวม',      value: summaryStats.totalSeats.toLocaleString('en-US'), cls: 'text-slate-700' },
            { label: 'รอยืนยัน',     value: summaryStats.pendingCount,    cls: 'text-amber-600' },
            { label: 'ยืนยันแล้ว',   value: summaryStats.confirmedCount,  cls: 'text-green-600' },
            { label: 'ยังไม่มี TTL', value: summaryStats.noTtlCount,      cls: 'text-slate-500' },
          ] as const).map(stat => (
            <div key={stat.label} className="text-center px-2 py-1.5 rounded-lg bg-slate-50">
              <p className="text-[10px] text-slate-400 mb-0.5">{stat.label}</p>
              <p className={cn('text-base font-bold tabular-nums', stat.cls)}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ─── Bulk TTL Modal ─────────────────────────────────────────────────── */}
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
                          onChange={() => { const next = new Set(bulkTtlSelectedPnrs); if (next.has(i)) next.delete(i); else next.add(i); setBulkTtlSelectedPnrs(next) }}
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
                        <tr>
                          <td colSpan={bulkTtlMode === 'days_before' ? 4 : 3} className="px-3 py-1.5 text-center text-[11px] text-slate-400 italic border-t border-slate-100">
                            และอีก {ttlTargetIndices.length - 4} PNR ที่เหลือ
                          </td>
                        </tr>
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

      {/* ─── Delete Confirm Modal ────────────────────────────────────────────── */}
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
            onSave={val => {
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
