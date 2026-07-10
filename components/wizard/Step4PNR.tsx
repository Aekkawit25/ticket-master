'use client'

import { useRef, useState, useMemo } from 'react'
import { PlusCircle, Trash2, Copy, Info, CalendarDays, FileUp, Download } from 'lucide-react'
import { cn, formatTravelDate, calcTravelEndFromSectors, calcSectorDate } from '@/lib/utils'
import { BulkPnrBuilder } from '@/components/shared/BulkPnrBuilder'
import type { BulkPnrRow, BulkPnrSector, BulkPnrCondition } from '@/components/shared/BulkPnrBuilder'
import type { FlightPNRFormData, FlightSectorFormData, FlightScheduleFormData, SectorType, PNRStatus, TaxType } from '@/types'
import type { AppCondition } from '@/lib/condition-schema'
import { TimeInput } from '@/components/ui/time-input'
import ImportExcelModal from '@/components/wizard/ImportExcelModal'
import type { PastedExcelRow } from '@/lib/paste-excel'
import { downloadPnrTemplate } from '@/lib/excel-template'
import { getDemoStocks } from '@/lib/demo-storage'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_OPTIONS: PNRStatus[] = ['Pending', 'Confirmed', 'Cancelled', 'Closed']

const STATUS_COLORS: Record<string, string> = {
  Pending: 'text-amber-600',
  Confirmed: 'text-blue-600',
  Cancelled: 'text-red-500',
  Closed: 'text-slate-500',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emptyPNR(): FlightPNRFormData {
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
    condition_id: '',
    status: 'Pending',
    remark: '',
    sector_dates: [],
    ttl_status: 'UNSET',
    ttl_date: null,
    ttl_time: null,
    ttl_remark: '',
  }
}

function calcPnrTotal(fmt: string, fare: number, tax: number | null, yq: number | null): number {
  if (fmt === 'ALL_IN') return fare
  if (fmt === 'FARE_YQ') return fare + (tax ?? 0)
  return fare + (tax ?? 0) + (yq ?? 0)
}

const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function dayAbbr(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr + 'T12:00:00')
    if (isNaN(d.getTime())) return '—'
    return DAY_ABBR[d.getDay()]
  } catch { return '—' }
}

// ─── PriceForm ────────────────────────────────────────────────────────────────
interface PriceForm {
  priceType: 'FARE' | 'FARE_YQ' | 'ALL_IN'
  fare: string   // required; '' treated as 0
  tax: string    // '' = null; disabled when ALL_IN
  yq: string     // '' = null; disabled when FARE_YQ or ALL_IN
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Step4Props {
  pnrs: FlightPNRFormData[]
  schedules: FlightScheduleFormData[]
  conditions: AppCondition[]
  currency: string
  onChange: (pnrs: FlightPNRFormData[]) => void
}

// ─── Cell input style ─────────────────────────────────────────────────────────
const xi = 'w-full px-2 py-[6px] text-xs bg-transparent outline-none focus:bg-blue-50 placeholder:text-slate-300'

// ─── SectorDateRow ────────────────────────────────────────────────────────────
function SectorDateRow({
  value, isEditable, onChange,
}: {
  value: string
  isEditable: boolean
  onChange?: (v: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className={cn('flex items-center h-[26px]', !isEditable && 'bg-slate-50/60 select-none')}>
      <span className={cn(
        'flex-1 text-[11px] text-center px-2 truncate',
        isEditable ? 'font-medium text-slate-700' : 'text-slate-600'
      )}>
        {value
          ? formatTravelDate(value)
          : <span className="text-slate-300">{isEditable ? 'เลือกวัน...' : '—'}</span>
        }
      </span>
      <div className="relative w-6 flex items-center justify-center shrink-0 self-stretch">
        {isEditable ? (
          <>
            <button
              type="button"
              onClick={() => ref.current?.showPicker?.()}
              title="เลือกวันที่"
              className="text-slate-400 hover:text-blue-500 transition-colors"
            >
              <CalendarDays size={11} />
            </button>
            <input
              ref={ref}
              type="date"
              value={value}
              onChange={e => onChange?.(e.target.value)}
              style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
              tabIndex={-1}
            />
          </>
        ) : (
          <CalendarDays size={11} className="invisible" aria-hidden />
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Step4PNR({ pnrs, schedules, conditions, currency, onChange }: Step4Props) {
  const mainSectors = schedules.find(s => s.isMain)?.sectors ?? schedules[0]?.sectors ?? []
  const getPnrSectors = (pnr: FlightPNRFormData): FlightSectorFormData[] => {
    if (!pnr.schedule_id) return mainSectors
    return schedules.find(s => s.scheduleId === pnr.schedule_id)?.sectors ?? mainSectors
  }
  // For backward compat: use mainSectors as the default sectors reference
  const sectors = mainSectors
  const [bulkOpen, setBulkOpen]     = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [priceEditIdx, setPriceEditIdx] = useState<number | null>(null)
  const [priceForm, setPriceForm] = useState<PriceForm | null>(null)
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null)
  const [bulkTtlOpen, setBulkTtlOpen] = useState(false)
  const [bulkTtlDate, setBulkTtlDate] = useState('')
  const [bulkTtlTime, setBulkTtlTime] = useState('')

  // Collect all existing PNR codes for duplicate check (current draft + system)
  const existingPnrCodes = useMemo(() => {
    const draftCodes = pnrs.map(p => p.pnr_code).filter(Boolean)
    try {
      const systemCodes = getDemoStocks().flatMap(s =>
        s.pnrs.flatMap(p => [p.pnrCode, p.dummyPnr].filter(Boolean) as string[])
      )
      return [...new Set([...draftCodes, ...systemCodes])]
    } catch {
      return draftCodes
    }
  }, [pnrs])

  const openPriceEdit = (idx: number) => {
    const p = pnrs[idx]
    const fmt = (p.price_format ?? 'FARE') as 'FARE' | 'FARE_YQ' | 'ALL_IN'
    setPriceEditIdx(idx)
    setPriceForm({
      priceType: fmt,
      fare: p.fare > 0 ? String(p.fare) : '',
      tax:  (fmt !== 'ALL_IN' && p.tax != null) ? String(p.tax) : '',
      yq:   (fmt === 'FARE' && p.yq != null) ? String(p.yq) : '',
    })
  }

  const closePriceEdit = () => {
    setPriceEditIdx(null)
    setPriceForm(null)
  }

  const applyPriceEdit = () => {
    if (priceEditIdx === null || !priceForm) return
    const fmt = priceForm.priceType
    const fareAmt = Math.max(0, Number(priceForm.fare) || 0)
    const taxAmt: number | null = fmt === 'ALL_IN'
      ? null
      : priceForm.tax.trim() === '' ? null : Math.max(0, Number(priceForm.tax) || 0)
    const yqAmt: number | null = (fmt === 'FARE_YQ' || fmt === 'ALL_IN')
      ? null
      : priceForm.yq.trim() === '' ? null : Math.max(0, Number(priceForm.yq) || 0)
    update(priceEditIdx, {
      price_format: fmt,
      fare: fareAmt, tax: taxAmt, yq: yqAmt,
      tax_type: 'separate',
      total_amount: calcPnrTotal(fmt, fareAmt, taxAmt, yqAmt),
    })
    closePriceEdit()
  }

  const handlePriceTypeChange = (idx: number, newFmt: 'FARE' | 'FARE_YQ' | 'ALL_IN') => {
    const p = pnrs[idx]
    const newYq: number | null = (newFmt === 'FARE_YQ' || newFmt === 'ALL_IN') ? null : (p.yq ?? null)
    const newTax: number | null = newFmt === 'ALL_IN' ? null : p.tax
    update(idx, {
      price_format: newFmt,
      yq: newYq,
      tax: newTax,
      total_amount: calcPnrTotal(newFmt, p.fare, newTax, newYq),
    })
  }

  const update = (idx: number, patch: Partial<FlightPNRFormData>) => {
    onChange(
      pnrs.map((p, i) => {
        if (i !== idx) return p
        const base = { ...p, ...patch }
        const pnrSectors = getPnrSectors(base)

        // Recompute travel_end + sector_dates when travel_start or schedule_id changes
        const needsDateRecompute = patch.travel_start !== undefined || patch.schedule_id !== undefined
        const travel_end = needsDateRecompute
          ? calcTravelEndFromSectors(base.travel_start, pnrSectors) || ''
          : base.travel_end

        const sector_dates = needsDateRecompute
          ? pnrSectors.map(s => ({
              sector_type: s.sector_type,
              day_offset: s.day_offset,
              travel_date: calcSectorDate(base.travel_start, s.day_offset) || '',
            }))
          : base.sector_dates

        // Clear dummy PNR when a real code is entered
        const dummy_pnr =
          patch.pnr_code !== undefined && patch.pnr_code.trim() ? '' : base.dummy_pnr

        return { ...base, travel_end, sector_dates, dummy_pnr }
      })
    )
  }

  const addRow = () => {
    onChange([...pnrs, emptyPNR()])
  }

  const addBulkPNRs = (rows: BulkPnrRow[]) => {
    const newPNRs: FlightPNRFormData[] = rows.map(row => {
      const pnr = emptyPNR()
      pnr.pnr_code    = row.pnrCode
      pnr.dummy_pnr   = ''  // assigned at Step 5
      pnr.travel_start = row.travelStart
      pnr.travel_end  = row.travelEnd || calcTravelEndFromSectors(row.travelStart, sectors) || ''
      pnr.sector_dates = sectors.map(s => ({
        sector_type: s.sector_type,
        day_offset:  s.day_offset,
        travel_date: calcSectorDate(row.travelStart, s.day_offset) || '',
      }))
      pnr.seat_total   = row.seatTotal
      pnr.price_format = row.priceFormat as 'FARE' | 'FARE_YQ' | 'ALL_IN'
      pnr.fare         = row.fare
      pnr.tax_type     = row.taxType as TaxType
      pnr.tax          = (row.priceFormat === 'ALL_IN') ? null : row.tax
      pnr.yq           = (row.priceFormat === 'FARE_YQ' || row.priceFormat === 'ALL_IN') ? null : row.yq
      pnr.total_amount = row.total
      pnr.condition_id = row.conditionCode
      pnr.status       = (row.status || 'Pending') as PNRStatus
      pnr.remark       = row.remark
      return pnr
    })
    onChange([...pnrs, ...newPNRs])
  }

  // Convert PastedExcelRow[] → FlightPNRFormData[] using same logic as addBulkPNRs
  const addPastedPNRs = (rows: PastedExcelRow[]) => {
    const newPNRs: FlightPNRFormData[] = rows.map(row => {
      const pnr = emptyPNR()
      pnr.pnr_code     = row.pnrCode
      pnr.travel_start = row.outboundDate
      // Use explicit return date from Excel; fall back to sector-computed value
      pnr.travel_end   = row.returnDate || calcTravelEndFromSectors(row.outboundDate, sectors) || ''
      pnr.sector_dates = sectors.map(s => ({
        sector_type: s.sector_type,
        day_offset:  s.day_offset,
        travel_date: calcSectorDate(row.outboundDate, s.day_offset) || '',
      }))
      pnr.seat_total   = row.seatCount
      pnr.fare         = 0
      pnr.tax_type     = 'separate'
      pnr.total_amount = 0
      // Auto-assign condition if there is exactly one
      pnr.condition_id = conditions.length === 1 ? conditions[0].conditionId : ''
      pnr.status       = 'Pending'
      return pnr
    })
    onChange([...pnrs, ...newPNRs])
  }

  // Adapters: convert wizard types → BulkPnrBuilder normalized types
  const builderSectors: BulkPnrSector[] = sectors.map(s => ({
    sectorType: s.sector_type,
    dayOffset:  s.day_offset,
  }))

  const builderConditions: BulkPnrCondition[] = conditions.map(c => ({
    code:   c.conditionId,
    name:   c.conditionName,
    stages: c.stages.map(st => ({
      paymentBaseDate:      st.dueType === 'TRAVEL_MINUS_DAYS' ? 'Travel Start' : 'Created Date',
      paymentDueDaysBefore: st.dueDays,
      paymentDueTime:       st.dueTime,
    })),
    ttlRule: {
      calcType:   c.ttlRule?.calcType ?? 'NOT_SET',
      baseDate:   'Travel Start',
      daysBefore: c.ttlRule?.daysBefore ?? 0,
      date:       c.ttlRule?.fixedDate,
      time:       c.ttlRule?.time,
    },
  }))

  const deleteRow = (idx: number) => {
    setDeleteConfirmIdx(idx)
  }

  const confirmDelete = () => {
    if (deleteConfirmIdx === null) return
    onChange(pnrs.filter((_, i) => i !== deleteConfirmIdx))
    setDeleteConfirmIdx(null)
  }

  const duplicateRow = (idx: number) => {
    const src = pnrs[idx]
    // dup gets empty pnr_code + empty dummy_pnr; dummy assigned at Step 5 entry
    const dup: FlightPNRFormData = { ...src, id: undefined, pnr_code: '', dummy_pnr: '' }
    onChange([...pnrs.slice(0, idx + 1), dup, ...pnrs.slice(idx + 1)])
  }

  const applyBulkTtl = () => {
    if (!bulkTtlDate) return
    onChange(pnrs.map(p => ({
      ...p,
      ttl_status: 'SET' as const,
      ttl_date: bulkTtlDate,
      ttl_time: bulkTtlTime || null,
    })))
    setBulkTtlOpen(false)
  }

  // Summary totals
  const totals = pnrs.reduce(
    (acc, p) => ({
      seat:  acc.seat  + (p.seat_total    || 0),
      total: acc.total + (p.total_amount  || 0),
    }),
    { seat: 0, total: 0 }
  )

  return (
    <div className="space-y-3">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
        <div className="flex items-start gap-2 text-xs text-blue-700 min-w-0">
          <Info size={13} className="flex-shrink-0 mt-0.5" />
          <span>
            กรอกวันที่ขาไป (Travel Date) · <strong>PNR ว่างได้</strong> ·
            ระบบคำนวณวันที่ Sector อื่น / Total / Dummy PNR ให้อัตโนมัติ
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#05a94f] hover:bg-[#048f43] rounded-lg transition-colors whitespace-nowrap shadow-sm"
          >
            <PlusCircle size={13} />
            + เพิ่ม PNR
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-300 hover:bg-blue-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <FileUp size={13} />
            Import Excel
          </button>
          <button
            type="button"
            onClick={() => downloadPnrTemplate(sectors)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download size={13} />
            ดาวน์โหลด Template
          </button>
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#05a94f] border border-[#05a94f] hover:bg-green-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <CalendarDays size={13} />
            หลาย PNR
          </button>
          <button
            type="button"
            onClick={() => setBulkTtlOpen(v => !v)}
            disabled={pnrs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 border border-amber-400 hover:bg-amber-50 rounded-lg transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CalendarDays size={13} />
            ตั้ง TTL ทุก PNR
          </button>
        </div>
      </div>

      {/* Bulk TTL Panel */}
      {bulkTtlOpen && (
        <div className="flex flex-wrap items-end gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 text-xs text-amber-700 font-semibold shrink-0">
            <CalendarDays size={13} />
            ตั้ง TTL ให้ทุก PNR
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-[10px] text-amber-600 mb-0.5">TTL Date</label>
              <input
                type="date"
                value={bulkTtlDate}
                onChange={e => setBulkTtlDate(e.target.value)}
                className="border border-amber-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] text-amber-600 mb-0.5">TTL Time</label>
              <TimeInput
                value={bulkTtlTime}
                onChange={setBulkTtlTime}
                compact
                placeholder="HH:mm"
                className="border border-amber-300 rounded bg-white w-20"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={applyBulkTtl}
            disabled={!bulkTtlDate}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            ใช้กับทุก PNR ({pnrs.length})
          </button>
          <button
            type="button"
            onClick={() => setBulkTtlOpen(false)}
            className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            ยกเลิก
          </button>
        </div>
      )}

      {/* Table */}
      <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs w-full" style={{ minWidth: 1200 }}>

            {/* Header — all cells whitespace-nowrap so nothing wraps to 2 lines */}
            <thead>
              <tr className="bg-slate-100 select-none h-9">
                <th className="border border-slate-300 px-2 text-center text-slate-500 font-medium whitespace-nowrap" style={{ width: 28 }}>#</th>
                <th className="border border-slate-300 px-2 text-left text-slate-600 font-semibold whitespace-nowrap" style={{ width: 120 }} title="PNR Code (ว่างได้ — ระบบสร้าง Dummy ตอน Review)">PNR</th>
                <th className="border border-slate-300 px-2 text-left text-slate-600 font-semibold whitespace-nowrap" style={{ width: 110 }}>Flight Set</th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 52 }}>Day</th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 110 }}>
                  Dep Date <span className="text-red-400">*</span>
                </th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 110 }}>Arr Date</th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 60 }} title="Seat Total">
                  Seat <span className="text-red-400">*</span>
                </th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 90 }}
                    title="FARE = แยก Tax+YQ / FARE+YQ = รวม YQ ใน Fare / ALL IN = รวมทุกอย่าง">
                  ประเภทราคา
                </th>
                <th className="border border-slate-300 px-2 text-right text-slate-600 font-semibold whitespace-nowrap" style={{ width: 90 }}>
                  Fare <span className="text-red-400">*</span>
                </th>
                <th className="border border-slate-300 px-2 text-right text-slate-600 font-semibold whitespace-nowrap" style={{ width: 80 }}
                    title="Tax — ว่าง = ยังไม่ระบุ (—)">Tax</th>
                <th className="border border-slate-300 px-2 text-right text-slate-600 font-semibold whitespace-nowrap" style={{ width: 80 }}
                    title="YQ — ว่าง = ยังไม่ระบุ (—)">YQ</th>
                <th className="border border-slate-300 px-2 text-right text-green-700 font-semibold whitespace-nowrap bg-green-50/60" style={{ width: 90 }}
                    title={`ยอดสุทธิ (${currency})`}>
                  ยอดสุทธิ ✦
                </th>
                <th className="border border-slate-300 px-2 text-left text-slate-600 font-semibold whitespace-nowrap" style={{ width: 120 }}>Condition</th>
                <th className="border border-slate-300 px-2 text-center text-amber-700 font-semibold whitespace-nowrap bg-amber-50/40" style={{ width: 150 }}
                    title="กำหนดส่ง Name (TTL) — กรอกโดยผู้ใช้">
                  TTL
                </th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 80 }}>Status</th>
                <th className="border border-slate-300 px-2 text-left text-slate-600 font-semibold whitespace-nowrap">Remark</th>
                <th className="border border-slate-300 px-2 text-center text-slate-500 font-medium whitespace-nowrap bg-slate-50" style={{ width: 52 }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {/* Empty state */}
              {pnrs.length === 0 && (
                <tr>
                  <td colSpan={17} className="border border-slate-200 py-12 px-4">
                    <div className="flex flex-col items-center gap-3">
                      <div className="text-slate-200">
                        <PlusCircle size={36} strokeWidth={1} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-500">ยังไม่มีรายการ PNR</p>
                        <p className="text-xs text-slate-400 mt-1">กรุณาเพิ่ม PNR อย่างน้อย 1 รายการก่อนดำเนินการต่อ</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <button type="button" onClick={addRow}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#05a94f] hover:bg-[#048f43] rounded-lg transition-colors shadow-sm">
                          <PlusCircle size={13} />
                          + เพิ่ม PNR
                        </button>
                        <button type="button" onClick={() => setBulkOpen(true)}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#05a94f] border border-[#05a94f] hover:bg-green-50 rounded-lg transition-colors">
                          <CalendarDays size={13} />
                          หลาย PNR
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {pnrs.map((p, idx) => {
                const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                const missingDate = !p.travel_start
                const missingSeat = !p.seat_total || p.seat_total <= 0

                return (
                  <tr key={idx} className={cn('group hover:bg-blue-50/20 transition-colors', rowBg)}>

                    {/* # */}
                    <td className="border border-slate-200 text-center text-slate-400 font-medium select-none bg-slate-50 text-[11px] align-middle">
                      {idx + 1}
                    </td>

                    {/* PNR Code */}
                    <td className="border border-slate-200 p-0 align-middle">
                      <input
                        value={p.pnr_code}
                        onChange={e => update(idx, { pnr_code: e.target.value.toUpperCase() })}
                        placeholder="ว่างได้"
                        className={cn(xi, 'font-mono uppercase')}
                      />
                    </td>

                    {/* Flight Set */}
                    <td className="border border-slate-200 p-0 align-middle">
                      {schedules.length > 1 ? (
                        <select
                          value={p.schedule_id ?? schedules.find(s => s.isMain)?.scheduleId ?? schedules[0]?.scheduleId ?? ''}
                          onChange={e => update(idx, { schedule_id: e.target.value || undefined })}
                          className={cn(xi, 'appearance-none cursor-pointer text-slate-600')}
                        >
                          {schedules.map(sch => (
                            <option key={sch.scheduleId} value={sch.scheduleId}>
                              {sch.scheduleName}{sch.isMain ? ' ★' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className={cn(xi, 'text-slate-600 cursor-default select-none')}>
                          {schedules[0]?.scheduleName ?? 'Default'}
                        </div>
                      )}
                    </td>

                    {/* Day */}
                    <td className="border border-slate-200 align-middle select-none">
                      <div className="flex items-center justify-center px-2 py-[6px]">
                        <span className="text-[11px] font-semibold tracking-wide text-slate-600">
                          {dayAbbr(p.travel_start)}
                        </span>
                      </div>
                    </td>

                    {/* Dep Date (travel_start — editable) */}
                    <td className={cn('border border-slate-200 p-0 align-middle', missingDate && 'bg-red-50/60')}>
                      <SectorDateRow
                        value={p.travel_start}
                        isEditable={true}
                        onChange={v => update(idx, { travel_start: v })}
                      />
                    </td>

                    {/* Arr Date (travel_end — auto-computed) */}
                    <td className="border border-slate-200 align-middle select-none">
                      <div className="flex items-center px-2 py-[6px]">
                        <span className={cn('text-[11px]', p.travel_end ? 'text-slate-600' : 'text-slate-300 italic')}>
                          {p.travel_end ? formatTravelDate(p.travel_end) : '—'}
                        </span>
                      </div>
                    </td>

                    {/* Seat Total */}
                    <td className={cn('border border-slate-200 p-0 align-middle', missingSeat && 'bg-red-50/60')}>
                      <input
                        type="number" min={1}
                        value={p.seat_total || ''}
                        onChange={e => update(idx, { seat_total: parseInt(e.target.value) || 0 })}
                        className={cn(xi, 'text-center font-semibold')}
                      />
                    </td>

                    {/* ประเภทราคา */}
                    <td className="border border-slate-200 p-0 align-middle">
                      <select
                        value={p.price_format ?? 'FARE'}
                        onChange={e => handlePriceTypeChange(idx, e.target.value as 'FARE' | 'FARE_YQ' | 'ALL_IN')}
                        className={cn(xi, 'appearance-none cursor-pointer text-center font-semibold',
                          (!p.price_format || p.price_format === 'FARE') ? 'text-slate-600' :
                          p.price_format === 'FARE_YQ' ? 'text-amber-700' : 'text-blue-700'
                        )}
                      >
                        <option value="FARE">FARE</option>
                        <option value="FARE_YQ">FARE+YQ</option>
                        <option value="ALL_IN">ALL IN</option>
                      </select>
                    </td>

                    {/* Fare */}
                    <td
                      className="border border-slate-200 text-right cursor-pointer hover:bg-blue-50/40 transition-colors align-middle select-none"
                      onClick={() => openPriceEdit(idx)}
                      title="คลิกเพื่อแก้ไขราคา"
                    >
                      <span className={cn('px-2 text-xs font-semibold tabular-nums', p.fare > 0 ? 'text-slate-700' : 'text-slate-300')}>
                        {p.fare > 0 ? p.fare.toLocaleString('en-US') : '—'}
                      </span>
                    </td>

                    {/* Tax */}
                    {p.price_format === 'ALL_IN' ? (
                      <td className="border border-slate-200 text-center bg-slate-50/70 align-middle select-none">
                        <span className="px-2 text-[10px] text-slate-400 italic">รวมแล้ว</span>
                      </td>
                    ) : (
                      <td
                        className="border border-slate-200 text-right cursor-pointer hover:bg-blue-50/40 transition-colors align-middle select-none"
                        onClick={() => openPriceEdit(idx)}
                        title="คลิกเพื่อแก้ไขราคา"
                      >
                        <span className={cn('px-2 text-xs tabular-nums', p.tax != null ? 'text-slate-600' : 'text-slate-300 italic')}>
                          {p.tax == null ? '—' : p.tax === 0 ? '0' : p.tax.toLocaleString('en-US')}
                        </span>
                      </td>
                    )}

                    {/* YQ */}
                    {(p.price_format === 'FARE_YQ' || p.price_format === 'ALL_IN') ? (
                      <td className="border border-slate-200 text-center bg-slate-50/70 align-middle select-none">
                        <span className="px-2 text-[10px] text-slate-400 italic">รวมแล้ว</span>
                      </td>
                    ) : (
                      <td
                        className="border border-slate-200 text-right cursor-pointer hover:bg-blue-50/40 transition-colors align-middle select-none"
                        onClick={() => openPriceEdit(idx)}
                        title="คลิกเพื่อแก้ไขราคา"
                      >
                        <span className={cn('px-2 text-xs tabular-nums', p.yq != null ? 'text-slate-600' : 'text-slate-300 italic')}>
                          {p.yq == null ? '—' : p.yq === 0 ? '0' : p.yq.toLocaleString('en-US')}
                        </span>
                      </td>
                    )}

                    {/* ยอดสุทธิ — computed readonly */}
                    <td className={cn(
                      'border border-slate-200 bg-green-50/50 text-right select-none align-middle',
                      p.total_amount <= 0 && 'bg-red-50/40'
                    )}>
                      <span className={cn(
                        'px-2 text-xs font-bold tabular-nums',
                        p.total_amount > 0 ? 'text-green-700' : 'text-red-400'
                      )}>
                        {p.total_amount > 0 ? p.total_amount.toLocaleString('en-US') : '—'}
                      </span>
                    </td>

                    {/* Condition */}
                    <td className="border border-slate-200 p-0 align-middle">
                      <select
                        value={p.condition_id}
                        onChange={e => update(idx, { condition_id: e.target.value })}
                        className={cn(xi, 'appearance-none cursor-pointer text-slate-600')}
                      >
                        <option value="">ไม่ระบุ</option>
                        {conditions.map(c => (
                          <option key={c.conditionId} value={c.conditionId}>{c.conditionName}</option>
                        ))}
                      </select>
                    </td>

                    {/* TTL — user-entered per PNR */}
                    <td className="border border-slate-200 bg-amber-50/20 p-0 align-middle">
                      <div className="flex flex-col gap-0.5 px-1.5 py-1">
                        <select
                          value={p.ttl_status || 'UNSET'}
                          onChange={e => update(idx, { ttl_status: e.target.value as 'UNSET' | 'SET', ttl_date: e.target.value === 'UNSET' ? null : p.ttl_date, ttl_time: e.target.value === 'UNSET' ? null : p.ttl_time })}
                          className="w-full text-[10px] px-1 py-0.5 rounded border border-amber-200 bg-white text-amber-700 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-400"
                        >
                          <option value="UNSET">ยังไม่ระบุ</option>
                          <option value="SET">ระบุแล้ว</option>
                        </select>
                        {p.ttl_status === 'SET' && (
                          <div className="flex flex-col gap-0.5">
                            <input
                              type="date"
                              value={p.ttl_date || ''}
                              onChange={e => update(idx, { ttl_date: e.target.value || null })}
                              className="w-full text-[10px] px-1 py-0.5 rounded border border-amber-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                            <TimeInput
                              value={p.ttl_time || ''}
                              onChange={v => update(idx, { ttl_time: v || null })}
                              compact
                              placeholder="HH:mm"
                              className="border border-amber-200 rounded bg-white w-full"
                            />
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="border border-slate-200 p-0 align-middle">
                      <select
                        value={p.status}
                        onChange={e => update(idx, { status: e.target.value as PNRStatus })}
                        className={cn(
                          xi, 'appearance-none cursor-pointer text-center font-semibold',
                          STATUS_COLORS[p.status] || 'text-slate-600'
                        )}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>

                    {/* Remark */}
                    <td className="border border-slate-200 p-0 align-middle">
                      <input
                        value={p.remark}
                        onChange={e => update(idx, { remark: e.target.value })}
                        placeholder="หมายเหตุ..."
                        className={cn(xi, 'text-slate-500')}
                      />
                    </td>

                    {/* Action */}
                    <td className="border border-slate-200 bg-slate-50 align-middle">
                      <div className="flex items-center justify-center gap-0.5 px-1 py-1">
                        <button type="button" onClick={() => duplicateRow(idx)} title="Duplicate PNR"
                          className="p-1.5 rounded text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                          <Copy size={12} />
                        </button>
                        <button type="button" onClick={() => deleteRow(idx)}
                          title="ลบ PNR นี้"
                          className="p-1.5 rounded transition-colors text-slate-300 hover:text-red-500 hover:bg-red-50">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {/* Summary footer */}
              {pnrs.length > 0 && (
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold select-none">
                  <td colSpan={6} className="border border-slate-300 px-3 py-1.5 text-xs text-slate-600 text-right">
                    รวม {pnrs.length} PNR
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-center text-slate-800 font-bold">
                    {totals.seat.toLocaleString('en-US')}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-slate-400" />
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-slate-400" />
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-slate-400" />
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-slate-400" />
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-right text-green-700 font-bold bg-green-50">
                    {totals.total.toLocaleString('en-US')}
                  </td>
                  <td colSpan={5} className="border border-slate-300 px-2 py-1.5 text-xs">
                    <span className="text-slate-400">({currency}) · ยอดสุทธิ ✦ = Fare + Tax + YQ · TTL = กรอกเองต่อ PNR หรือ ตั้ง TTL ทุก PNR · คลิกเซลล์ราคาเพื่อแก้ไข</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-3 py-2 bg-slate-50 border-t border-slate-200 flex-wrap text-[11px] text-slate-500">
          <span>Dep Date = วันออกเดินทาง (กรอกได้) · Arr Date คำนวณจาก Flight Set อัตโนมัติ</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-sm bg-green-100 border border-green-300" />
            <span>ยอดสุทธิ ✦ = คำนวณตามประเภทราคา · คลิกเซลล์ราคาเพื่อแก้ไข</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300" />
            <span>TTL = กำหนดส่ง NAME — กรอกเองต่อ PNR หรือใช้ปุ่ม "ตั้ง TTL ทุก PNR"</span>
          </div>
          <span className="text-slate-400 shrink-0">ประเภทราคา: FARE = Fare+Tax+YQ · FARE+YQ = YQ รวมใน Fare · ALL IN = รวมทุกอย่าง</span>
          <span className="text-slate-400 shrink-0">— = ยังไม่ระบุ · 0 = ระบุแล้วว่าเป็นศูนย์ · รวมแล้ว = รวมอยู่ในราคาที่ได้รับ</span>
          <span className="text-slate-400 shrink-0">สกุลเงิน: <strong className="text-slate-600">{currency}</strong></span>
          <span className="text-slate-400 shrink-0">PNR ว่างได้ · Dummy PNR สร้างอัตโนมัติตอน Review</span>
          <span className="ml-auto text-slate-300 shrink-0">* จำเป็นต้องกรอก</span>
        </div>
      </div>

      {/* ─── Delete Confirm Modal ────────────────────────────────────── */}
      <Modal
        open={deleteConfirmIdx !== null}
        onClose={() => setDeleteConfirmIdx(null)}
        title="ยืนยันการลบ PNR"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirmIdx(null)}>ยกเลิก</Button>
            <Button variant="danger" onClick={confirmDelete}>ลบ PNR นี้</Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          คุณต้องการลบ PNR รายการที่ <strong>{deleteConfirmIdx !== null ? deleteConfirmIdx + 1 : ''}</strong> ออกจากรายการหรือไม่?
        </p>
        {pnrs.length === 1 && (
          <p className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            นี่คือ PNR รายการสุดท้าย หากลบแล้วจะต้องเพิ่ม PNR ใหม่ก่อนดำเนินการต่อ
          </p>
        )}
      </Modal>

      {/* ─── Price Edit Modal ─────────────────────────────────────────── */}
      {priceEditIdx !== null && priceForm && (() => {
        const fmt = priceForm.priceType
        const pfFare = Number(priceForm.fare) || 0
        const pfTax  = fmt === 'ALL_IN' ? null : (priceForm.tax.trim() === '' ? null : (Number(priceForm.tax) || 0))
        const pfYq   = (fmt === 'FARE_YQ' || fmt === 'ALL_IN') ? null : (priceForm.yq.trim() === '' ? null : (Number(priceForm.yq) || 0))
        const pfTotal = calcPnrTotal(fmt, pfFare, pfTax, pfYq)
        const mCls = 'w-full h-9 border border-slate-300 rounded-lg px-3 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400'
        const mDisCls = 'w-full h-9 flex items-center px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400 italic'
        return (
          <Modal
            open={true}
            onClose={closePriceEdit}
            title={`แก้ไขราคา — PNR ${priceEditIdx + 1}`}
            size="sm"
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={closePriceEdit}>ยกเลิก</Button>
                <Button disabled={pfFare <= 0} onClick={applyPriceEdit}>บันทึกราคา</Button>
              </div>
            }
          >
            <div className="space-y-4">
              {/* ประเภทราคา selector */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">ประเภทราคาที่ได้รับ</p>
                <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200">
                  {(['FARE', 'FARE_YQ', 'ALL_IN'] as const).map((f, i) => (
                    <button key={f} type="button"
                      onClick={() => setPriceForm(pf => pf ? {
                        ...pf, priceType: f,
                        yq:  (f === 'FARE_YQ' || f === 'ALL_IN') ? '' : pf.yq,
                        tax: f === 'ALL_IN' ? '' : pf.tax,
                      } : pf)}
                      className={cn(
                        'h-9 text-xs font-medium transition',
                        i < 2 && 'border-r border-slate-200',
                        priceForm.priceType === f ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                      )}>
                      {f === 'FARE' ? 'FARE' : f === 'FARE_YQ' ? 'FARE + YQ' : 'ALL IN'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {fmt === 'FARE' ? 'Total = Fare + Tax + YQ' : fmt === 'FARE_YQ' ? 'YQ รวมอยู่ใน Fare — Total = Fare + Tax' : 'รวมทุกอย่างแล้ว — Total = Fare (All In)'}
                </p>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    {fmt === 'FARE' ? 'Fare' : fmt === 'FARE_YQ' ? 'Fare + YQ' : 'All In'} ({currency})<span className="text-red-400 ml-0.5">*</span>
                  </label>
                  <input type="number" min={0} placeholder="0" value={priceForm.fare}
                    onChange={e => setPriceForm(pf => pf ? { ...pf, fare: e.target.value } : pf)}
                    className={mCls} />
                </div>
                <div>
                  {fmt === 'ALL_IN' ? (
                    <>
                      <label className="block text-xs text-slate-500 mb-1">Tax ({currency})</label>
                      <div className={mDisCls}>รวมอยู่ใน All In แล้ว</div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-slate-500">Tax ({currency})</label>
                        <div className="flex rounded overflow-hidden border border-slate-200 text-[10px]">
                          <button type="button"
                            onClick={() => setPriceForm(pf => pf ? { ...pf, tax: '' } : pf)}
                            className={cn('px-2.5 py-1 transition-colors', priceForm.tax === '' ? 'bg-slate-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}>
                            ไม่ระบุ
                          </button>
                          <button type="button"
                            onClick={() => setPriceForm(pf => pf ? { ...pf, tax: pf.tax !== '' ? pf.tax : '0' } : pf)}
                            className={cn('px-2.5 py-1 transition-colors border-l border-slate-200', priceForm.tax !== '' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}>
                            ระบุ Tax
                          </button>
                        </div>
                      </div>
                      {priceForm.tax === ''
                        ? <div className={cn(mDisCls, 'justify-end text-slate-300')}>—</div>
                        : <input type="number" min={0} placeholder="0" value={priceForm.tax}
                            onChange={e => setPriceForm(pf => pf ? { ...pf, tax: e.target.value } : pf)}
                            className={mCls} />
                      }
                    </>
                  )}
                </div>
                <div>
                  {(fmt === 'FARE_YQ' || fmt === 'ALL_IN') ? (
                    <>
                      <label className="block text-xs text-slate-500 mb-1">YQ ({currency})</label>
                      <div className={mDisCls}>{fmt === 'FARE_YQ' ? 'รวมอยู่ใน Fare แล้ว' : 'รวมอยู่ใน All In แล้ว'}</div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-slate-500">YQ ({currency})</label>
                        <div className="flex rounded overflow-hidden border border-slate-200 text-[10px]">
                          <button type="button"
                            onClick={() => setPriceForm(pf => pf ? { ...pf, yq: '' } : pf)}
                            className={cn('px-2.5 py-1 transition-colors', priceForm.yq === '' ? 'bg-slate-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}>
                            ไม่ระบุ
                          </button>
                          <button type="button"
                            onClick={() => setPriceForm(pf => pf ? { ...pf, yq: pf.yq !== '' ? pf.yq : '0' } : pf)}
                            className={cn('px-2.5 py-1 transition-colors border-l border-slate-200', priceForm.yq !== '' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}>
                            ระบุ YQ
                          </button>
                        </div>
                      </div>
                      {priceForm.yq === ''
                        ? <div className={cn(mDisCls, 'justify-end text-slate-300')}>—</div>
                        : <input type="number" min={0} placeholder="0" value={priceForm.yq}
                            onChange={e => setPriceForm(pf => pf ? { ...pf, yq: e.target.value } : pf)}
                            className={mCls} />
                      }
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">ยอดสุทธิ ({currency})</label>
                  <div className="h-9 flex items-center justify-end px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700 tabular-nums">
                    {pfTotal > 0 ? pfTotal.toLocaleString('en-US') : '—'}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400">— = ยังไม่ได้ระบุ · 0 = ระบุแล้วว่าเป็นศูนย์ · รวมแล้ว = รวมอยู่ในราคาที่ได้รับ</p>
              {pfFare <= 0 && <p className="text-xs text-red-500">กรุณาระบุ Fare (มากกว่า 0)</p>}
            </div>
          </Modal>
        )
      })()}

      <ImportExcelModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onConfirm={addPastedPNRs}
        existingPnrCodes={existingPnrCodes}
        sectors={sectors}
      />

      <BulkPnrBuilder
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        mode="create_stock"
        sectors={builderSectors}
        conditions={builderConditions}
        currency={currency}
        onConfirm={addBulkPNRs}
      />
    </div>
  )
}
