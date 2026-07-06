'use client'

import { useRef, useState, useMemo } from 'react'
import { PlusCircle, Trash2, Copy, Info, CalendarDays, FileUp, Download } from 'lucide-react'
import { cn, formatTravelDate, formatDateTime, calcTravelEndFromSectors, calcSectorDate, calcTTLDatetime } from '@/lib/utils'
import { BulkPnrBuilder } from '@/components/shared/BulkPnrBuilder'
import type { BulkPnrRow, BulkPnrSector, BulkPnrCondition } from '@/components/shared/BulkPnrBuilder'
import type { FlightPNRFormData, FlightSectorFormData, FlightScheduleFormData, SectorType, PNRStatus, TaxType } from '@/types'
import type { AppCondition } from '@/lib/condition-schema'
import ImportExcelModal from '@/components/wizard/ImportExcelModal'
import type { PastedExcelRow } from '@/lib/paste-excel'
import { downloadPnrTemplate } from '@/lib/excel-template'
import { getDemoStocks } from '@/lib/demo-storage'

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_OPTIONS: PNRStatus[] = ['Pending', 'Confirmed', 'Cancelled', 'Closed']

const STATUS_COLORS: Record<string, string> = {
  Pending: 'text-amber-600',
  Confirmed: 'text-blue-600',
  Cancelled: 'text-red-500',
  Closed: 'text-slate-500',
}

const SECTOR_TEXT_COLOR: Record<string, string> = {
  Departure: 'text-green-600',
  Transit: 'text-amber-600',
  Arrival: 'text-purple-600',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emptyPNR(): FlightPNRFormData {
  return {
    pnr_code: '',
    dummy_pnr: '',   // generated at Step 5 entry, not here
    travel_start: '',
    travel_end: '',
    seat_total: 40,
    fare: 0,
    tax_type: 'separate',
    tax: 0,
    total_amount: 0,
    condition_id: '',
    status: 'Pending',
    remark: '',
    sector_dates: [],
  }
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

  const update = (idx: number, patch: Partial<FlightPNRFormData>) => {
    onChange(
      pnrs.map((p, i) => {
        if (i !== idx) return p

        // Immutable base — never mutate p or u directly
        const base = { ...p, ...patch }
        const pnrSectors = getPnrSectors(base)

        // Recompute travel_end + sector_dates when travel_start changes
        const travel_end = patch.travel_start !== undefined
          ? calcTravelEndFromSectors(base.travel_start, pnrSectors) || ''
          : base.travel_end

        const sector_dates = patch.travel_start !== undefined
          ? pnrSectors.map(s => ({
              sector_type: s.sector_type,
              day_offset: s.day_offset,
              travel_date: calcSectorDate(base.travel_start, s.day_offset) || '',
            }))
          : base.sector_dates

        // Clear tax when switching away from 'separate'
        const tax =
          patch.tax_type !== undefined && patch.tax_type !== 'separate' ? 0 : base.tax

        // Recompute total from latest fare + effective tax
        const total_amount =
          patch.fare !== undefined || patch.tax !== undefined || patch.tax_type !== undefined
            ? (base.fare || 0) + (tax || 0)
            : base.total_amount

        // Clear dummy PNR when a real code is entered
        const dummy_pnr =
          patch.pnr_code !== undefined && patch.pnr_code.trim() ? '' : base.dummy_pnr

        return { ...base, travel_end, sector_dates, tax, total_amount, dummy_pnr }
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
      seat: acc.seat + (p.seat_total || 0),
      fare: acc.fare + (p.fare || 0),
      tax: acc.tax + (p.tax || 0),
      total: acc.total + ((p.fare || 0) + (p.tax || 0)),
    }),
    { seat: 0, fare: 0, tax: 0, total: 0 }
  )
  const pendingTaxCount = pnrs.filter(p => p.tax_type === 'pending').length

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
                {schedules.length > 1 && (
                  <th className="border border-slate-300 px-2 text-left text-slate-600 font-semibold whitespace-nowrap" style={{ width: 110 }}>Flight Schedule</th>
                )}
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 76 }} title="Sector Type">
                  Sector <span className="text-red-400">*</span>
                </th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 110 }} title="Travel Date">
                  Date <span className="text-red-400">*</span>
                </th>
                <th className="border border-slate-300 px-2 text-center text-slate-600 font-semibold whitespace-nowrap" style={{ width: 60 }} title="Seat Total">
                  Seat <span className="text-red-400">*</span>
                </th>
                <th className="border border-slate-300 px-2 text-right text-slate-600 font-semibold whitespace-nowrap" style={{ width: 90 }} title={`Fare (${currency})`}>Fare</th>
                <th className="border border-slate-300 px-2 text-right text-slate-600 font-semibold whitespace-nowrap" style={{ width: 90 }} title={`Tax (${currency}) — คลิก Cell เพื่อเปลี่ยนประเภท`}>Tax</th>
                <th className="border border-slate-300 px-2 text-right text-green-700 font-semibold whitespace-nowrap bg-green-50/60" style={{ width: 90 }}
                    title={`Total (${currency}) = Fare + Tax (คำนวณอัตโนมัติ)`}>
                  Total ✦
                </th>
                <th className="border border-slate-300 px-2 text-left text-slate-600 font-semibold whitespace-nowrap" style={{ width: 120 }}>Condition</th>
                <th className="border border-slate-300 px-2 text-center text-blue-700 font-semibold whitespace-nowrap bg-blue-50/40" style={{ width: 128 }}
                    title="Payment Due Date/Time = Payment Base Date − Payment Due Days Before + Payment Due Time">
                  Payment Due ✦
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
                  <td colSpan={schedules.length > 1 ? 14 : 13} className="border border-slate-200 text-center py-10 text-slate-400">
                    ยังไม่มี PNR — กดปุ่ม &ldquo;เพิ่ม PNR&rdquo; ด้านบน
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {pnrs.map((p, idx) => {
                const total = (p.fare || 0) + (p.tax || 0)
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

                    {/* Flight Schedule (only if multiple schedules) */}
                    {schedules.length > 1 && (
                      <td className="border border-slate-200 p-0 align-middle">
                        <select
                          value={p.schedule_id ?? ''}
                          onChange={e => update(idx, { schedule_id: e.target.value || undefined })}
                          className="w-full px-1 py-[5px] text-xs bg-transparent outline-none"
                        >
                          {schedules.map(sch => (
                            <option key={sch.scheduleId} value={sch.scheduleId}>
                              {sch.scheduleName}{sch.isMain ? ' (ชุดหลัก)' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}

                    {/* Sector Type */}
                    <td className="border border-slate-200 p-0 align-top">
                      {getPnrSectors(p).length === 0 ? (
                        <div className="flex items-center h-[26px] px-2 text-[11px] text-slate-300 italic">—</div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {getPnrSectors(p).map((s, si) => (
                            <div key={si} className={cn(
                              'flex items-center h-[26px] px-2 text-[11px] font-semibold whitespace-nowrap select-none',
                              SECTOR_TEXT_COLOR[s.sector_type] || 'text-slate-600'
                            )}>
                              {s.sector_type}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Travel Date */}
                    <td className={cn('border border-slate-200 p-0 align-top', missingDate && getPnrSectors(p).length > 0 && 'bg-red-50/60')}>
                      {getPnrSectors(p).length === 0 ? (
                        <div className="flex items-center h-[26px] px-2 text-[11px] text-slate-300 italic">—</div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {getPnrSectors(p).map((s, si) => {
                            const date = si === 0 ? p.travel_start : (calcSectorDate(p.travel_start, s.day_offset) || '')
                            return (
                              <SectorDateRow
                                key={si}
                                value={date}
                                isEditable={si === 0}
                                onChange={si === 0 ? v => update(idx, { travel_start: v }) : undefined}
                              />
                            )
                          })}
                        </div>
                      )}
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

                    {/* Fare */}
                    <td className="border border-slate-200 p-0 align-middle">
                      <input
                        type="number" min={0}
                        value={p.fare || ''}
                        onChange={e => update(idx, { fare: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className={cn(xi, 'text-right')}
                      />
                    </td>

                    {/* Tax — single value only; included/pending use invisible select overlay so user can still change type */}
                    <td className="border border-slate-200 p-0 align-middle">
                      {p.tax_type === 'included' ? (
                        <div className="relative">
                          <div className="px-2 py-[6px] text-[11px] text-emerald-600 italic text-center select-none pointer-events-none">
                            รวมใน Fare
                          </div>
                          <select
                            value={p.tax_type}
                            onChange={e => update(idx, { tax_type: e.target.value as TaxType })}
                            title="คลิกเพื่อเปลี่ยน Tax Type"
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                          >
                            <option value="separate">แยก Tax</option>
                            <option value="included">รวมใน Fare</option>
                            <option value="pending">รอระบุ</option>
                          </select>
                        </div>
                      ) : p.tax_type === 'pending' ? (
                        <div className="relative">
                          <div className="px-2 py-[6px] text-[11px] text-amber-500 font-medium text-center select-none pointer-events-none">
                            รอระบุ
                          </div>
                          <select
                            value={p.tax_type}
                            onChange={e => update(idx, { tax_type: e.target.value as TaxType })}
                            title="คลิกเพื่อเปลี่ยน Tax Type"
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                          >
                            <option value="separate">แยก Tax</option>
                            <option value="included">รวมใน Fare</option>
                            <option value="pending">รอระบุ</option>
                          </select>
                        </div>
                      ) : (
                        <input
                          type="number" min={0}
                          value={p.tax || ''}
                          onChange={e => update(idx, { tax: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          className={cn(xi, 'text-right')}
                        />
                      )}
                    </td>

                    {/* Total — computed readonly */}
                    <td className="border border-slate-200 bg-green-50/50 text-right select-none align-middle">
                      <span className="px-2 text-xs font-bold text-green-700">
                        {total > 0 ? total.toLocaleString('en-US') : '—'}
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

                    {/* TTL Date/Time */}
                    <td className="border border-slate-200 bg-amber-50/20 p-0 align-top select-none">
                      {!selectedCond || !p.travel_start ? (
                        <div className="flex items-center h-[26px] px-2 text-[11px] text-slate-300">—</div>
                      ) : (
                        <div className="divide-y divide-amber-100/60">
                          {selectedCond.stages.map((stage, si) => {
                            const baseDateType = stage.dueType === 'TRAVEL_MINUS_DAYS' ? 'Travel Start' : 'Created Date'
                            const ttlDt = calcTTLDatetime(p.travel_start, baseDateType, stage.dueDays, stage.dueTime)
                            return (
                              <div key={si} className="flex items-center h-[26px] px-2 text-[11px] font-medium whitespace-nowrap text-amber-700">
                                {ttlDt
                                  ? formatDateTime(ttlDt)
                                  : <span className="text-slate-300 italic text-[10px]">{baseDateType}</span>
                                }
                              </div>
                            )
                          })}
                        </div>
                      )}
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
                  <td colSpan={5} className="border border-slate-300 px-3 py-1.5 text-xs text-slate-600 text-right">
                    รวม {pnrs.length} PNR
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-center text-slate-800 font-bold">
                    {totals.seat.toLocaleString('en-US')}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-right text-slate-800 font-bold">
                    {totals.fare.toLocaleString('en-US')}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-right text-slate-800 font-bold">
                    {totals.tax.toLocaleString('en-US')}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-right text-green-700 font-bold bg-green-50">
                    {totals.total.toLocaleString('en-US')}
                  </td>
                  <td colSpan={5} className="border border-slate-300 px-2 py-1.5 text-xs">
                    <span className="text-slate-400">({currency}) · Payment Due ✦ = Payment Base Date − Payment Due Days Before + Payment Due Time</span>
                    {pendingTaxCount > 0 && (
                      <span className="ml-2 text-amber-500 font-semibold">
                        · มี {pendingTaxCount} PNR รอระบุ Tax
                      </span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-3 py-2 bg-slate-50 border-t border-slate-200 flex-wrap text-[11px] text-slate-500">
          <span>Sector Type อ้างอิงจาก Step 2 · วันที่ Sector คำนวณอัตโนมัติ (Travel Start + (Travel Day − 1))</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-sm bg-green-100 border border-green-300" />
            <span>Total ✦ = Fare + Tax คำนวณอัตโนมัติ</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300" />
            <span>Payment Due ✦ = Payment Base Date − Payment Due Days Before (คำนวณต่อ Stage)</span>
          </div>
          <span className="text-slate-400 shrink-0">Tax: แยก Tax / <span className="text-emerald-600">รวมใน Fare</span> / <span className="text-amber-500">รอระบุ</span> — คลิกเพื่อเปลี่ยนประเภท</span>
          <span className="text-slate-400 shrink-0">สกุลเงิน: <strong className="text-slate-600">{currency}</strong></span>
          <span className="text-slate-400 shrink-0">PNR ว่างได้ · ระบบจะสร้าง Dummy PNR ให้อัตโนมัติตอนกด Review</span>
          <span className="ml-auto text-slate-300 shrink-0">* จำเป็นต้องกรอก</span>
        </div>
      </div>

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
