'use client'

import { useRef, useState, useMemo } from 'react'
import { PlusCircle, Trash2, Copy, Info, CalendarDays, FileUp, Download } from 'lucide-react'
import { cn, formatTravelDate, formatDateTime, calcTravelEndFromSectors, calcSectorDate } from '@/lib/utils'
import { BulkPnrBuilder } from '@/components/shared/BulkPnrBuilder'
import type { BulkPnrRow, BulkPnrSector, BulkPnrCondition } from '@/components/shared/BulkPnrBuilder'
import type { FlightPNRFormData, FlightSectorFormData, FlightScheduleFormData, SectorType, PNRStatus, TaxType } from '@/types'
import type { AppCondition } from '@/lib/condition-schema'
import { calcCondTtlDate } from '@/lib/condition-schema'
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
    yq: 0,
    breakdown: false,
    tax_type: 'separate',
    tax: 0,
    total_amount: 0,
    condition_id: '',
    status: 'Pending',
    remark: '',
    sector_dates: [],
  }
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
  priceFormat: 'FARE' | 'FARE_YQ' | 'ALL_IN'
  fare: string
  yq: string
  allIn: string
  breakdown: boolean
  tax: string
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
      priceFormat: fmt,
      fare:     fmt === 'ALL_IN' && !p.breakdown ? '' : p.fare > 0 ? String(p.fare) : '',
      yq:       p.yq && p.yq > 0 ? String(p.yq) : '',
      allIn:    fmt === 'ALL_IN' ? (p.total_amount > 0 ? String(p.total_amount) : '') : '',
      breakdown: p.breakdown ?? false,
      tax:      p.tax > 0 ? String(p.tax) : '',
    })
  }

  const closePriceEdit = () => {
    setPriceEditIdx(null)
    setPriceForm(null)
  }

  const applyPriceEdit = () => {
    if (priceEditIdx === null || !priceForm) return
    const fmt = priceForm.priceFormat
    let fareAmt: number, yqAmt: number, taxAmt: number, totalAmt: number
    let taxType: 'separate' | 'included' | 'pending'
    if (fmt === 'FARE') {
      fareAmt  = Math.max(0, Number(priceForm.fare)  || 0)
      yqAmt    = Math.max(0, Number(priceForm.yq)    || 0)
      taxAmt   = Math.max(0, Number(priceForm.tax)   || 0)
      taxType  = 'separate'
      totalAmt = fareAmt + yqAmt + taxAmt
    } else if (fmt === 'FARE_YQ') {
      fareAmt  = Math.max(0, Number(priceForm.fare)  || 0)
      yqAmt    = 0
      taxAmt   = Math.max(0, Number(priceForm.tax)   || 0)
      taxType  = 'separate'
      totalAmt = fareAmt + taxAmt
    } else {
      totalAmt = Math.max(0, Number(priceForm.allIn) || 0)
      if (priceForm.breakdown) {
        fareAmt = Math.max(0, Number(priceForm.fare) || 0)
        yqAmt   = Math.max(0, Number(priceForm.yq)  || 0)
        taxAmt  = Math.max(0, Number(priceForm.tax) || 0)
        taxType = 'separate'
      } else {
        fareAmt = 0; yqAmt = 0; taxAmt = 0; taxType = 'included'
      }
    }
    update(priceEditIdx, {
      price_format: fmt,
      fare: fareAmt, yq: yqAmt, tax: taxAmt,
      tax_type: taxType,
      breakdown: priceForm.breakdown,
      total_amount: totalAmt,
    })
    closePriceEdit()
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
      pnr.yq           = row.yq
      pnr.breakdown    = row.breakdown
      pnr.fare         = row.fare
      pnr.tax_type     = row.taxType as TaxType
      pnr.tax          = row.tax
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
      pnr.tax          = 0
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
    if (pnrs.length <= 1) return
    onChange(pnrs.filter((_, i) => i !== idx))
  }

  const duplicateRow = (idx: number) => {
    const src = pnrs[idx]
    // dup gets empty pnr_code + empty dummy_pnr; dummy assigned at Step 5 entry
    const dup: FlightPNRFormData = { ...src, id: undefined, pnr_code: '', dummy_pnr: '' }
    onChange([...pnrs.slice(0, idx + 1), dup, ...pnrs.slice(idx + 1)])
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
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs w-full" style={{ minWidth: 1080 }}>

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
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 84 }}>รูปแบบราคา</th>
                <th className="border border-slate-300 px-2 text-right text-slate-600 font-semibold whitespace-nowrap" style={{ width: 90 }}>Fare ที่ได้รับ</th>
                <th className="border border-slate-300 px-2 text-left text-slate-600 font-semibold whitespace-nowrap" style={{ width: 100 }}>YQ / Tax เพิ่มเติม</th>
                <th className="border border-slate-300 px-2 text-right text-green-700 font-semibold whitespace-nowrap bg-green-50/60" style={{ width: 90 }}
                    title={`ยอดสุทธิ (${currency}) คำนวณอัตโนมัติ`}>
                  ยอดสุทธิ ✦
                </th>
                <th className="border border-slate-300 px-2 text-left text-slate-600 font-semibold whitespace-nowrap" style={{ width: 120 }}>Condition</th>
                <th className="border border-slate-300 px-2 text-center text-amber-700 font-semibold whitespace-nowrap bg-amber-50/40" style={{ width: 128 }}
                    title="TTL Date คำนวณจาก Condition ที่เลือก">
                  TTL Date ✦
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
                  <td colSpan={16} className="border border-slate-200 text-center py-10 text-slate-400">
                    ยังไม่มี PNR — กดปุ่ม &ldquo;เพิ่ม PNR&rdquo; ด้านบน
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {pnrs.map((p, idx) => {
                const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                const missingDate = !p.travel_start
                const missingSeat = !p.seat_total || p.seat_total <= 0
                const selectedCond = conditions.find(c => c.conditionId === p.condition_id)

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

                    {/* รูปแบบราคา */}
                    <td
                      className="border border-slate-200 text-center cursor-pointer hover:bg-blue-50/40 transition-colors align-middle"
                      onClick={() => openPriceEdit(idx)}
                      title="คลิกเพื่อแก้ไขราคา"
                    >
                      <span className={cn(
                        'text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap select-none',
                        (!p.price_format || p.price_format === 'FARE')    ? 'bg-slate-100 text-slate-600' :
                        p.price_format === 'FARE_YQ' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-blue-100 text-blue-700'
                      )}>
                        {p.price_format === 'FARE_YQ' ? 'FARE+YQ' : p.price_format === 'ALL_IN' ? 'ALL IN' : 'FARE'}
                      </span>
                    </td>

                    {/* Fare ที่ได้รับ */}
                    <td
                      className="border border-slate-200 text-right cursor-pointer hover:bg-blue-50/40 transition-colors align-middle select-none"
                      onClick={() => openPriceEdit(idx)}
                      title="คลิกเพื่อแก้ไขราคา"
                    >
                      <span className="px-2 text-xs font-semibold tabular-nums text-slate-700">
                        {p.price_format === 'ALL_IN'
                          ? (p.total_amount > 0 ? p.total_amount.toLocaleString('en-US') : '—')
                          : (p.fare > 0 ? p.fare.toLocaleString('en-US') : '—')}
                      </span>
                    </td>

                    {/* YQ / Tax */}
                    <td
                      className="border border-slate-200 cursor-pointer hover:bg-blue-50/40 transition-colors align-middle select-none"
                      onClick={() => openPriceEdit(idx)}
                      title="คลิกเพื่อแก้ไขราคา"
                    >
                      <span className="px-2 text-[10px] text-slate-500 whitespace-nowrap">
                        {(!p.price_format || p.price_format === 'FARE') && (p.yq || 0) === 0 && (p.tax || 0) === 0 && (
                          <span className="italic text-slate-300">—</span>
                        )}
                        {(!p.price_format || p.price_format === 'FARE') && ((p.yq || 0) > 0 || (p.tax || 0) > 0) && (
                          `YQ ${(p.yq || 0).toLocaleString('en-US')} / Tax ${(p.tax || 0).toLocaleString('en-US')}`
                        )}
                        {p.price_format === 'FARE_YQ' && (p.tax || 0) === 0 && (
                          <span className="italic text-slate-300">—</span>
                        )}
                        {p.price_format === 'FARE_YQ' && (p.tax || 0) > 0 && (
                          `Tax ${(p.tax || 0).toLocaleString('en-US')}`
                        )}
                        {p.price_format === 'ALL_IN' && (
                          <span className="text-slate-400 italic">รวมทั้งหมด</span>
                        )}
                      </span>
                    </td>

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

                    {/* TTL Date */}
                    <td className="border border-slate-200 bg-amber-50/20 px-2 align-middle select-none">
                      {(() => {
                        if (!selectedCond || !p.travel_start) return (
                          <span className="text-[11px] text-slate-300">—</span>
                        )
                        const ttlDt = calcCondTtlDate(selectedCond.ttlRule, p.travel_start)
                        return ttlDt
                          ? <span className="text-[11px] font-medium whitespace-nowrap text-amber-700">{formatDateTime(ttlDt)}</span>
                          : <span className="text-[11px] text-slate-300 italic">ไม่ระบุ</span>
                      })()}
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
                          title={pnrs.length <= 1 ? 'ต้องมีอย่างน้อย 1 PNR' : 'ลบ PNR นี้'}
                          disabled={pnrs.length <= 1}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            pnrs.length <= 1 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
                          )}>
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
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-center text-slate-400">—</td>
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-slate-400" />
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-slate-400" />
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-right text-green-700 font-bold bg-green-50">
                    {totals.total.toLocaleString('en-US')}
                  </td>
                  <td colSpan={5} className="border border-slate-300 px-2 py-1.5 text-xs">
                    <span className="text-slate-400">({currency}) · ยอดสุทธิ ✦ = คำนวณอัตโนมัติ · TTL Date ✦ = คำนวณจาก Condition · คลิกเซลล์ราคาเพื่อแก้ไข</span>
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
            <span>ยอดสุทธิ ✦ = คำนวณอัตโนมัติ · คลิกเซลล์ราคาเพื่อแก้ไข</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300" />
            <span>TTL Date ✦ = คำนวณจาก Condition ที่เลือก</span>
          </div>
          <span className="text-slate-400 shrink-0">รูปแบบราคา: <span className="bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5 text-[10px] font-bold">FARE</span> / <span className="bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 text-[10px] font-bold">FARE+YQ</span> / <span className="bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 text-[10px] font-bold">ALL IN</span></span>
          <span className="text-slate-400 shrink-0">สกุลเงิน: <strong className="text-slate-600">{currency}</strong></span>
          <span className="text-slate-400 shrink-0">PNR ว่างได้ · Dummy PNR สร้างอัตโนมัติตอน Review</span>
          <span className="ml-auto text-slate-300 shrink-0">* จำเป็นต้องกรอก</span>
        </div>
      </div>

      {/* ─── Price Edit Modal ─────────────────────────────────────────── */}
      {priceEditIdx !== null && priceForm && (() => {
        const pfFare  = Number(priceForm.fare)  || 0
        const pfYq    = Number(priceForm.yq)    || 0
        const pfTax   = Number(priceForm.tax)   || 0
        const pfAllIn = Number(priceForm.allIn) || 0
        const pfTotal =
          priceForm.priceFormat === 'FARE'    ? pfFare + pfYq + pfTax :
          priceForm.priceFormat === 'FARE_YQ' ? pfFare + pfTax :
          pfAllIn
        const pfBreakdownMismatch = priceForm.priceFormat === 'ALL_IN' && priceForm.breakdown
          ? Math.round(pfFare*100) + Math.round(pfYq*100) + Math.round(pfTax*100) !== Math.round(pfAllIn*100)
          : false
        const mCls = 'w-full h-9 border border-slate-300 rounded-lg px-3 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400'
        return (
          <Modal
            open={true}
            onClose={closePriceEdit}
            title={`แก้ไขราคา — PNR ${priceEditIdx + 1}`}
            size="sm"
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={closePriceEdit}>ยกเลิก</Button>
                <Button
                  disabled={pfTotal <= 0 || pfBreakdownMismatch}
                  onClick={applyPriceEdit}
                >
                  บันทึกราคา
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Format selector */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">รูปแบบราคาที่ได้รับ</p>
                <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200">
                  {(['FARE', 'FARE_YQ', 'ALL_IN'] as const).map((fmt, i) => (
                    <button key={fmt} type="button"
                      onClick={() => setPriceForm(f => f ? { ...f, priceFormat: fmt, fare: '', yq: '', allIn: '', tax: '', breakdown: false } : f)}
                      className={cn(
                        'h-9 text-xs font-medium transition',
                        i < 2 && 'border-r border-slate-200',
                        priceForm.priceFormat === fmt
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 hover:bg-slate-50'
                      )}>
                      {fmt === 'FARE' ? 'FARE' : fmt === 'FARE_YQ' ? 'FARE + YQ' : 'ALL IN'}
                    </button>
                  ))}
                </div>
              </div>

              {/* FARE inputs */}
              {priceForm.priceFormat === 'FARE' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Fare ({currency})<span className="text-red-400 ml-0.5">*</span></label>
                    <input type="number" min={0} placeholder="0" value={priceForm.fare}
                      onChange={e => setPriceForm(f => f ? { ...f, fare: e.target.value } : f)}
                      className={mCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">YQ ({currency})</label>
                    <input type="number" min={0} placeholder="0" value={priceForm.yq}
                      onChange={e => setPriceForm(f => f ? { ...f, yq: e.target.value } : f)}
                      className={mCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tax ({currency})</label>
                    <input type="number" min={0} placeholder="0" value={priceForm.tax}
                      onChange={e => setPriceForm(f => f ? { ...f, tax: e.target.value } : f)}
                      className={mCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">ยอดสุทธิ ({currency})</label>
                    <div className="h-9 flex items-center justify-end px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700 tabular-nums">
                      {pfTotal > 0 ? pfTotal.toLocaleString('en-US') : '—'}
                    </div>
                  </div>
                </div>
              )}

              {/* FARE_YQ inputs */}
              {priceForm.priceFormat === 'FARE_YQ' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Fare + YQ ({currency})<span className="text-red-400 ml-0.5">*</span></label>
                    <input type="number" min={0} placeholder="0" value={priceForm.fare}
                      onChange={e => setPriceForm(f => f ? { ...f, fare: e.target.value } : f)}
                      className={mCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tax ({currency})</label>
                    <input type="number" min={0} placeholder="0" value={priceForm.tax}
                      onChange={e => setPriceForm(f => f ? { ...f, tax: e.target.value } : f)}
                      className={mCls} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">ยอดสุทธิ ({currency})</label>
                    <div className="h-9 flex items-center justify-end px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700 tabular-nums">
                      {pfTotal > 0 ? pfTotal.toLocaleString('en-US') : '—'}
                    </div>
                  </div>
                </div>
              )}

              {/* ALL_IN inputs */}
              {priceForm.priceFormat === 'ALL_IN' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">All In / Total ({currency})<span className="text-red-400 ml-0.5">*</span></label>
                    <input type="number" min={0} placeholder="0" value={priceForm.allIn}
                      onChange={e => setPriceForm(f => f ? { ...f, allIn: e.target.value } : f)}
                      className={cn(mCls, 'font-bold')} />
                  </div>
                  {!priceForm.breakdown ? (
                    <button type="button"
                      onClick={() => setPriceForm(f => f ? { ...f, breakdown: true } : f)}
                      className="text-xs text-[#05a94f] hover:text-[#048a40] hover:underline transition-colors">
                      + เพิ่มรายละเอียด Fare / YQ / Tax
                    </button>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-slate-600">รายละเอียด Fare / YQ / Tax</p>
                        <button type="button"
                          onClick={() => setPriceForm(f => f ? { ...f, breakdown: false, fare: '', yq: '', tax: '' } : f)}
                          className="text-[10px] text-slate-400 hover:text-red-500 transition-colors">
                          ✕ ยกเลิก
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Fare</label>
                          <input type="number" min={0} placeholder="0" value={priceForm.fare}
                            onChange={e => setPriceForm(f => f ? { ...f, fare: e.target.value } : f)}
                            className="w-full h-8 border border-slate-300 rounded-lg px-2 text-xs text-right focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">YQ</label>
                          <input type="number" min={0} placeholder="0" value={priceForm.yq}
                            onChange={e => setPriceForm(f => f ? { ...f, yq: e.target.value } : f)}
                            className="w-full h-8 border border-slate-300 rounded-lg px-2 text-xs text-right focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Tax</label>
                          <input type="number" min={0} placeholder="0" value={priceForm.tax}
                            onChange={e => setPriceForm(f => f ? { ...f, tax: e.target.value } : f)}
                            className="w-full h-8 border border-slate-300 rounded-lg px-2 text-xs text-right focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                        </div>
                      </div>
                      {(() => {
                        const detailSum = pfFare + pfYq + pfTax
                        const centDiff = Math.round(pfAllIn*100) - Math.round(pfFare*100) - Math.round(pfYq*100) - Math.round(pfTax*100)
                        return (
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                            <span className="text-slate-500">รวมรายละเอียด: <strong>{detailSum.toLocaleString('en-US')}</strong></span>
                            <span className={cn('font-semibold', centDiff === 0 ? 'text-emerald-600' : 'text-red-500')}>
                              ส่วนต่าง: {centDiff === 0 ? '0' : (pfAllIn - detailSum).toLocaleString('en-US')}{centDiff !== 0 && ' ⚠'}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Validation hint */}
              {pfTotal <= 0 && (
                <p className="text-xs text-red-500">กรุณาระบุราคา / ยอดสุทธิมากกว่า 0</p>
              )}
              {pfBreakdownMismatch && (
                <p className="text-xs text-red-500">Fare + YQ + Tax ไม่เท่ากับ All In / Total</p>
              )}
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
