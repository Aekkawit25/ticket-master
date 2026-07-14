'use client'

import { useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { TicketTypeBadge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import { formatDate, buildRouteText } from '@/lib/utils'
import { formatDateTimeThai } from '@/lib/utils'
import { getStockTypeConfigSafe } from '@/lib/stock-type-config'
import { checkPNRDuplicatesInSystem, type PNRConflictDetail } from '@/lib/demo-storage'
import { CheckCircle2, Plane, Users, FileText, AlertTriangle, ArrowLeft } from 'lucide-react'
import type { WizardState, FlightPNRFormData, FlightSectorFormData } from '@/types'
import { PNRSeatsTable } from '@/components/shared/PNRSeatsTable'
import type { PNRRecord, ScheduleTemplate } from '@/lib/pnr-record'

interface Step5Props {
  state: WizardState
  excludeStockId?: string
  onGoToStep?: (step: number) => void
}

const SECTOR_TYPE_COLOR: Record<string, string> = {
  Departure: 'text-green-600',
  Arrival:   'text-purple-600',
  Transit:   'text-amber-600',
}

export default function Step5Review({ state, excludeStockId, onGoToStep }: Step5Props) {
  const { stockInfo, schedules, pnrs } = state
  const stockTypeCfg = getStockTypeConfigSafe(stockInfo.ticket_type, stockInfo.group_type)

  const mainSchedule = schedules.find(s => s.isMain) ?? schedules[0]
  const mainSectors  = mainSchedule?.sectors ?? []

  const route = buildRouteText(
    mainSectors.map(s => ({ dep_airport_code: s.dep_airport_code, arr_airport_code: s.arr_airport_code })),
    '→',
  )

  const getPnrSectors = (p: FlightPNRFormData): FlightSectorFormData[] => {
    if (!p.schedule_id) return mainSectors
    return schedules.find(s => s.scheduleId === p.schedule_id)?.sectors ?? mainSectors
  }

  const totalSeats  = pnrs.reduce((s, p) => s + (p.seat_total || 0), 0)
  const totalAmount = pnrs.reduce((s, p) => s + (p.total_amount || 0) * (p.seat_total || 0), 0)

  // Period: from actual sector_dates (not template), taking first dep of first PNR and last arr of last sector
  const travelDates = pnrs.filter(p => p.travel_start).map(p => {
    const lastSd = p.sector_dates?.[p.sector_dates.length - 1]
    const travelEnd = lastSd?.arr_date || p.travel_end || ''
    return { start: p.travel_start!, end: travelEnd }
  })
  const periodStart = travelDates.length > 0
    ? travelDates.reduce((a, b) => a.start < b.start ? a : b).start
    : null
  const periodEnd = travelDates.length > 0
    ? travelDates.reduce((a, b) => (a.end || '') > (b.end || '') ? a : b).end || null
    : null

  // Duplicate check
  const pnrsToCheck = pnrs.map(p => ({ pnr_code: p.pnr_code, dummy_pnr: p.dummy_pnr }))
  const dupResult   = checkPNRDuplicatesInSystem(pnrsToCheck, excludeStockId)

  // Conditions derived from PNR condition_ids (state.conditions is always [] in Add wizard)
  const conditionsUsed = useMemo(() => {
    const seen = new Set<string>()
    const list: { id: string; count: number }[] = []
    pnrs.forEach(p => {
      if (p.condition_id && !seen.has(p.condition_id)) {
        seen.add(p.condition_id)
        list.push({ id: p.condition_id, count: pnrs.filter(q => q.condition_id === p.condition_id).length })
      }
    })
    return list
  }, [pnrs])

  // Build ScheduleTemplates for PNRSeatsTable
  const scheduleTemplates = useMemo((): ScheduleTemplate[] =>
    schedules.map(sch => ({
      scheduleId:   sch.scheduleId,
      scheduleName: sch.scheduleName,
      isMain:       sch.isMain,
      sectors: sch.sectors.map(s => ({
        sectorType:     s.sector_type,
        dayOffset:      s.day_offset,
        arrDayOffset:   s.arr_day_offset ?? 0,
        depAirportCode: s.dep_airport_code ?? '',
        arrAirportCode: s.arr_airport_code ?? '',
        depTime:        s.dep_time ?? '',
        arrTime:        s.arr_time ?? '',
      })),
    }))
  , [schedules])

  // Condition list for PNRSeatsTable (ID as name since we have no lookup in Add wizard)
  const conditionsForTable = useMemo(() =>
    conditionsUsed.map(c => ({ conditionId: c.id, conditionName: c.id }))
  , [conditionsUsed])

  // Convert FlightPNRFormData → PNRRecord for read-only table
  const pnrRecords = useMemo((): PNRRecord[] =>
    pnrs.map((p, idx) => {
      const sects = getPnrSectors(p)
      return {
        rowId:           String(idx),
        seq:             idx + 1,
        pnrCode:         p.pnr_code,
        dummyPnr:        p.dummy_pnr,
        activeScheduleId: p.schedule_id,
        seatTotal:       p.seat_total,
        priceFormat:     (p.price_format ?? 'FARE') as 'FARE' | 'FARE_YQ' | 'ALL_IN',
        fare:            p.fare,
        yq:              p.yq ?? null,
        tax:             p.tax ?? null,
        taxType:         (p.tax_type ?? 'separate') as 'separate' | 'included' | 'pending',
        totalAmount:     p.total_amount,
        currency:        p.currency || stockInfo.currency,
        conditionId:     p.condition_id || '',
        remark:          p.remark || '',
        ttlType:         (p.ttl_type ?? 'NONE') as 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE',
        ttlDate:         p.ttl_date ?? null,
        ttlTime:         p.ttl_time ?? null,
        ttlDaysBefore:   p.ttl_days_before ?? null,
        sectors: sects.map((s, sIdx) => {
          const sd = p.sector_dates?.[sIdx]
          return {
            sectorType:     s.sector_type,
            dayOffset:      s.day_offset,
            arrDayOffset:   s.arr_day_offset ?? 0,
            depAirportCode: s.dep_airport_code ?? '',
            arrAirportCode: s.arr_airport_code ?? '',
            depDate:        sd?.travel_date ?? '',
            depTime:        sd?.dep_time ?? s.dep_time ?? '',
            arrDate:        sd?.arr_date ?? '',
            arrTime:        sd?.arr_time ?? s.arr_time ?? '',
            depManual:      sd?.dep_manual ?? false,
            arrManual:      sd?.arr_manual ?? false,
            timeOverride:   sd?.time_override ?? false,
            tmplDepTime:    s.dep_time ?? '',
            tmplArrTime:    s.arr_time ?? '',
          }
        }),
      }
    })
  , [pnrs, schedules]) // eslint-disable-line react-hooks/exhaustive-deps

  const GoBackBtn = ({ toStep, label }: { toStep: number; label: string }) =>
    onGoToStep ? (
      <button type="button" onClick={() => onGoToStep(toStep)}
        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#05a94f] transition-colors ml-auto">
        <ArrowLeft size={10} />{label}
      </button>
    ) : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
        <div className="w-10 h-10 bg-[#05a94f] rounded-full flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={20} className="text-white" />
        </div>
        <div>
          <p className="font-semibold text-green-800">ตรวจสอบข้อมูลก่อนบันทึก</p>
          <p className="text-xs text-green-600">กรุณาตรวจสอบข้อมูลทั้งหมดให้ถูกต้องก่อนกด Confirm &amp; Save</p>
        </div>
      </div>

      {/* PNR Duplicate Warning */}
      {dupResult.hasConflicts && (
        <div className="flex gap-3 p-4 bg-red-50 border border-red-300 rounded-xl">
          <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-700 text-sm mb-2">
              พบ PNR ซ้ำ {dupResult.conflicts.length} รายการ — กรุณาแก้ไขก่อนบันทึก
            </p>
            <ul className="space-y-1">
              {dupResult.conflicts.map((d: PNRConflictDetail) => (
                <li key={d.pnrCode} className="text-xs text-red-600 flex items-start gap-1">
                  <span className="font-mono font-bold">{d.pnrCode}</span>
                  <span>
                    {d.rowIndices.length > 1 && ` — ซ้ำที่แถว ${d.rowIndices.map(i => i + 1).join(' และ ')}`}
                    {d.conflictingStock && ` — ซ้ำใน Stock ${d.conflictingStock.stockCode} · ${d.conflictingStock.groupName}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Stock Summary ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText size={14} />
            ข้อมูล Stock
          </CardTitle>
          <div className="flex items-center gap-2">
            <TicketTypeBadge type={stockInfo.ticket_type} groupType={stockInfo.group_type} />
            <GoBackBtn toStep={1} label="แก้ไข Stock Info" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">{stockTypeCfg.codeLabel}</p>
              <p className="font-mono font-bold text-slate-800">{stockInfo.stock_code || '—'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-400">{stockTypeCfg.nameLabel}</p>
              <p className="font-semibold text-slate-800">{stockInfo.group_name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Airline</p>
              <p className="font-bold">{stockInfo.airline_code || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Ticket Type</p>
              <p className="font-medium">{stockInfo.ticket_type}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Route</p>
              <p className="font-mono font-bold text-[#05a94f]">{route || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Trip Type</p>
              <p className="font-medium">{stockInfo.trip_type || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Period (จาก PNR)</p>
              <p className="font-medium">
                {periodStart
                  ? !periodEnd || periodStart === periodEnd
                    ? formatDate(periodStart)
                    : `${formatDate(periodStart)} – ${formatDate(periodEnd)}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Currency</p>
              <p className="font-medium">{stockInfo.currency}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Flight Sets / PNR / Seat</p>
              <p className="font-medium">{schedules.length} ชุด / {pnrs.length} PNR / {totalSeats} ที่นั่ง</p>
            </div>
          </div>
          {stockInfo.remark && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-1">Remark</p>
              <p className="text-sm text-slate-600">{stockInfo.remark}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Flight Sets — all schedules ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane size={14} />
            Flight Sets ({schedules.length})
          </CardTitle>
          <GoBackBtn toStep={2} label="แก้ไข Flight Sets" />
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {schedules.map((sch, schIdx) => {
            const schRoute = buildRouteText(
              sch.sectors.map(s => ({ dep_airport_code: s.dep_airport_code, arr_airport_code: s.arr_airport_code })),
              '→',
            )
            return (
              <div key={schIdx} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                  <span className="font-semibold text-slate-800 text-sm">{sch.scheduleName}</span>
                  {sch.isMain && (
                    <span className="text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">ชุดหลัก</span>
                  )}
                  <span className="font-mono text-xs text-[#05a94f]">{schRoute || '—'}</span>
                  <span className="text-xs text-slate-400 ml-auto">{sch.sectors.length} Sector</span>
                </div>
                <Table>
                  <TableHead>
                    <tr>
                      <Th>#</Th>
                      <Th>Type</Th>
                      <Th>Flight</Th>
                      <Th>From</Th>
                      <Th>To</Th>
                      <Th>Dep Time</Th>
                      <Th>Arr Time</Th>
                      <Th>+Day</Th>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {sch.sectors.length === 0 ? (
                      <EmptyRow cols={8} message="ไม่มี Sector" />
                    ) : (
                      sch.sectors.map((s, i) => (
                        <TableRow key={i}>
                          <Td className="text-xs text-slate-400">{s.seq ?? i + 1}</Td>
                          <Td>
                            <span className={`text-xs font-medium ${SECTOR_TYPE_COLOR[s.sector_type] ?? 'text-slate-600'}`}>
                              {s.sector_type}
                            </span>
                          </Td>
                          <Td className="font-mono text-xs">
                            {s.airline_code || ''}{s.flight_no || ''}
                            {!s.airline_code && !s.flight_no && <span className="text-slate-300">—</span>}
                          </Td>
                          <Td className="font-mono text-xs font-bold">{s.dep_airport_code || '—'}</Td>
                          <Td className="font-mono text-xs font-bold">{s.arr_airport_code || '—'}</Td>
                          <Td className="text-xs">{s.dep_time || '—'}</Td>
                          <Td className="text-xs">{s.arr_time || '—'}</Td>
                          <Td className="text-xs text-center">
                            {(s.arr_day_offset ?? 0) > 0
                              ? <span className="font-semibold text-amber-600">+{s.arr_day_offset}</span>
                              : <span className="text-slate-400">—</span>}
                          </Td>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* ── PNR & Seats ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users size={14} />
            PNR &amp; Seats ({pnrs.length} รายการ)
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Seat รวม: <strong>{totalSeats}</strong></span>
            <span>Total: <strong className="text-[#05a94f]">{totalAmount.toLocaleString()} {stockInfo.currency}</strong></span>
            <GoBackBtn toStep={3} label="แก้ไข PNR" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <PNRSeatsTable
            mode="review"
            readOnly
            records={pnrRecords}
            scheduleTemplates={scheduleTemplates}
            conditions={conditionsForTable}
            currency={stockInfo.currency}
            onChange={() => {}}
            onDelete={() => {}}
          />
        </CardContent>
      </Card>

      {/* ── Conditions used by PNRs ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            Conditions ที่ใช้ใน PNR
          </CardTitle>
        </CardHeader>
        <CardContent>
          {conditionsUsed.length === 0 ? (
            <p className="text-sm text-slate-400">ไม่มี Condition — PNR ทั้งหมดไม่ระบุเงื่อนไข</p>
          ) : (
            <div className="space-y-2">
              {conditionsUsed.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2 border border-slate-200 rounded-lg text-sm">
                  <span className="font-mono text-xs text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">{c.id}</span>
                  <span className="text-slate-700">{c.id}</span>
                  <span className="ml-auto text-xs text-slate-400">{c.count} PNR</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Summary ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-400">Seat Total</p>
          <p className="text-xl font-bold text-slate-800">{totalSeats}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <p className="text-xs text-green-600">ราคารวมทั้งหมด ({stockInfo.currency})</p>
          <p className="text-xl font-bold text-[#05a94f]">{totalAmount.toLocaleString()}</p>
        </div>
      </div>
    </div>
  )
}
