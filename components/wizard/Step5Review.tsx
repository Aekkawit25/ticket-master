'use client'

import { useState, Fragment } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge, TicketTypeBadge, PNRStatusBadge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import { formatDate, formatDateTime, calcTravelEndFromSectors, buildRouteText } from '@/lib/utils'
import { getStockTypeConfigSafe } from '@/lib/stock-type-config'
import { calcCondTtlDate } from '@/lib/condition-schema'
import { resolvePnrFormTtl } from '@/lib/ttl-utils'
import { checkPNRDuplicatesInSystem, type PNRConflictDetail } from '@/lib/demo-storage'
import { CheckCircle2, Plane, Users, FileText, CreditCard, ArrowRight, AlertTriangle, ChevronDown } from 'lucide-react'
import type { WizardState, FlightPNRFormData } from '@/types'

interface Step5Props {
  state: WizardState
  excludeStockId?: string
}

export default function Step5Review({ state, excludeStockId }: Step5Props) {
  const [expandedPnrIds, setExpandedPnrIds] = useState<Set<number>>(new Set())
  const { stockInfo, schedules, conditions, pnrs } = state
  const stockTypeCfg = getStockTypeConfigSafe(stockInfo.ticket_type, stockInfo.group_type)

  const mainSchedule = schedules.find(s => s.isMain) ?? schedules[0]
  const mainSectors = mainSchedule?.sectors ?? []

  const route = buildRouteText(mainSectors.map(s => ({
    dep_airport_code: s.dep_airport_code,
    arr_airport_code: s.arr_airport_code,
  })))

  const getPnrSectors = (p: FlightPNRFormData) => {
    if (!p.schedule_id) return mainSectors
    return schedules.find(s => s.scheduleId === p.schedule_id)?.sectors ?? mainSectors
  }

  const totalSeats = pnrs.reduce((s, p) => s + (p.seat_total || 0), 0)
  const totalAmount = pnrs.reduce((s, p) => s + (p.total_amount || 0) * (p.seat_total || 0), 0)

  // Always recompute travelEnd from current sectors so Period reflects the latest sector edits,
  // not the stale travel_end stored in the PNR when sectors were unchanged in Step 4.
  const travelDates = pnrs
    .filter(p => p.travel_start)
    .map(p => ({
      start: p.travel_start,
      end: calcTravelEndFromSectors(p.travel_start, getPnrSectors(p)) || p.travel_end || '',
    }))

  const periodStart = travelDates.length > 0
    ? travelDates.reduce((a, b) => a.start! < b.start! ? a : b).start
    : null
  // periodEnd = latest return date across all PNRs
  const periodEnd = travelDates.length > 0
    ? travelDates.reduce((a, b) => (a.end || '') > (b.end || '') ? a : b).end || null
    : null

  const getConditionName = (id: string) => {
    if (!id) return 'ไม่ระบุ'
    return conditions.find(c => c.conditionId === id)?.conditionName || 'ไม่ระบุ'
  }

  const pnrsToCheck = pnrs.map(p => ({ pnr_code: p.pnr_code, dummy_pnr: p.dummy_pnr }))
  const dupResult = checkPNRDuplicatesInSystem(pnrsToCheck, excludeStockId)
  const hasDuplicates = dupResult.hasConflicts

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
        <div className="w-10 h-10 bg-[#05a94f] rounded-full flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={20} className="text-white" />
        </div>
        <div>
          <p className="font-semibold text-green-800">ตรวจสอบข้อมูลก่อนบันทึก</p>
          <p className="text-xs text-green-600">กรุณาตรวจสอบข้อมูลทั้งหมดให้ถูกต้องก่อนกด Confirm & Save</p>
        </div>
      </div>

      {/* PNR Duplicate Warning */}
      {hasDuplicates && (
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
                    {d.conflictingStock && ` — ซ้ำใน Stock ${d.conflictingStock.stockCode} · ${d.conflictingStock.groupName} (${d.conflictingStock.ticketType})`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Stock Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText size={14} />
            ข้อมูล Stock
          </CardTitle>
          <TicketTypeBadge type={stockInfo.ticket_type} groupType={stockInfo.group_type} />
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
              <p className="text-xs text-slate-400">Route (จาก Sector)</p>
              <p className="font-mono font-bold text-[#05a94f]">{route || '—'}</p>
            </div>
            {mainSchedule?.countryName && (
              <div>
                <p className="text-xs text-slate-400">Country</p>
                <p className="font-medium text-blue-700">{mainSchedule.countryName} ({mainSchedule.countryCode})</p>
              </div>
            )}
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
          </div>
          {stockInfo.remark && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-1">Remark</p>
              <p className="text-sm text-slate-600">{stockInfo.remark}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flight Schedules summary (when multiple schedules) */}
      {schedules.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plane size={14} />
              Flight Schedules ({schedules.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {schedules.map((sch, i) => {
              const schRoute = buildRouteText(sch.sectors.map(s => ({ dep_airport_code: s.dep_airport_code, arr_airport_code: s.arr_airport_code })))
              return (
                <div key={i} className="flex items-center gap-3 text-sm border border-slate-100 rounded-lg px-3 py-2">
                  <span className="font-semibold text-slate-700">{sch.scheduleName}</span>
                  {sch.isMain && <span className="text-[10px] text-amber-500 font-bold bg-amber-50 px-1.5 py-0.5 rounded">ชุดหลัก</span>}
                  <span className="font-mono text-xs text-[#05a94f]">{schRoute || '—'}</span>
                  <span className="text-xs text-slate-400">{sch.sectors.length} Sector</span>
                  {sch.countryName && <span className="text-xs text-blue-600">{sch.countryName}</span>}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Flight Sectors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane size={14} />
            Flight Sectors — {mainSchedule?.scheduleName ?? 'ชุดหลัก'} ({mainSectors.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Trip Type:</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              stockInfo.trip_type === 'One-way' ? 'bg-blue-100 text-blue-700' :
              stockInfo.trip_type === 'Round-trip' ? 'bg-purple-100 text-purple-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {stockInfo.trip_type}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHead>
              <tr>
                <Th>#</Th>
                <Th>Type</Th>
                <Th>Flight</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th>Dep</Th>
                <Th>Arr</Th>
                <Th>+Day</Th>
              </tr>
            </TableHead>
            <TableBody>
              {mainSectors.length === 0 ? (
                <EmptyRow cols={8} message="ไม่มี Sector" />
              ) : (
                mainSectors.map((s, i) => (
                  <TableRow key={i}>
                    <Td className="text-xs text-slate-400">{s.seq}</Td>
                    <Td>
                      <span className={`text-xs font-medium ${
                        s.sector_type === 'Departure' ? 'text-green-600' :
                        s.sector_type === 'Arrival' ? 'text-purple-600' :
                        s.sector_type === 'Transit' ? 'text-amber-600' :
                        'text-slate-600'
                      }`}>{s.sector_type}</span>
                    </Td>
                    <Td className="font-mono text-xs">{s.airline_code}{s.flight_no}</Td>
                    <Td className="font-mono text-xs font-bold">{s.dep_airport_code}</Td>
                    <Td className="font-mono text-xs font-bold">{s.arr_airport_code}</Td>
                    <Td className="text-xs">{s.dep_time}</Td>
                    <Td className="text-xs">{s.arr_time}</Td>
                    <Td className="text-xs text-center">
                      {(s.arr_day_offset ?? 0) > 0
                        ? <span className="font-semibold text-amber-600">+{s.arr_day_offset}</span>
                        : <span className="text-slate-400">0</span>}
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Conditions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard size={14} />
            Conditions ({conditions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {conditions.length === 0 ? (
            <p className="text-sm text-slate-400">ไม่มี Condition — PNR จะแสดงเป็น "ไม่ระบุ"</p>
          ) : (
            conditions.map((c, i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-xs text-slate-400">{c.conditionCode}</span>
                  <span className="font-semibold text-slate-800 text-sm">{c.conditionName}</span>
                  <Badge variant={c.status === 'Active' ? 'green' : 'gray'}>{c.status}</Badge>
                </div>
                <div className="space-y-1.5">
                  {c.stages.map((s, si) => (
                    <div key={si} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[11px] font-bold text-slate-400 shrink-0 mt-0.5">
                        {s.stageNo}
                      </span>
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-700">{s.stageName}</span>
                          <ArrowRight size={10} className="text-slate-300" />
                          <span className="font-medium">
                            {s.calcType === 'FIXED_PER_PNR' ? `${s.amount.toLocaleString()} THB/PNR`
                              : s.calcType === 'PER_SEAT' ? `${s.amount.toLocaleString()} THB/ที่นั่ง`
                              : s.calcType === 'PERCENT_OF_BASE' ? `${s.percent}%`
                              : 'Remaining'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-400 flex-wrap">
                          <span>Due <strong className="text-slate-600">{s.dueDays} วัน</strong>{s.dueType === 'TRAVEL_MINUS_DAYS' ? ' ก่อนเดินทาง' : ''}</span>
                          <span>·</span>
                          <span>เวลา: <strong className="text-slate-600">{s.dueTime}</strong></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* PNR List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users size={14} />
            PNR ({pnrs.length} รายการ)
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Seat รวม: <strong>{totalSeats}</strong></span>
            <span>Total: <strong className="text-[#05a94f]">{totalAmount.toLocaleString()} {stockInfo.currency}</strong></span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHead>
              <tr>
                <Th>PNR</Th>
                <Th>Dep Date</Th>
                <Th>Arr Date</Th>
                <Th className="text-right">Seat</Th>
                <Th className="text-right">Fare</Th>
                <Th className="text-right">Tax</Th>
                <Th className="text-right">YQ</Th>
                <Th className="text-right">Total/Seat</Th>
                <Th>Condition</Th>
                <Th className="text-purple-700">Name TTL</Th>
                <Th>Status</Th>
              </tr>
            </TableHead>
            <TableBody>
              {pnrs.length === 0 ? (
                <EmptyRow cols={11} message="ไม่มี PNR" />
              ) : (
                pnrs.map((p, i) => {
                  const travelEnd = calcTravelEndFromSectors(p.travel_start, getPnrSectors(p)) || p.travel_end || ''
                  const cond = conditions.find(c => c.conditionId === p.condition_id)
                  const condTtl = (cond && p.travel_start)
                    ? calcCondTtlDate(cond.ttlRule, p.travel_start)
                    : null
                  const resolvedTtl = resolvePnrFormTtl(p, condTtl)
                  const isDup = dupResult.duplicateIndices.has(i)
                  return (
                    <Fragment key={i}>
                    <TableRow className={isDup ? 'bg-red-50' : ''}>
                      <Td>
                        <div className="flex items-start gap-1">
                          <button
                            onClick={() => setExpandedPnrIds(prev => {
                              const s = new Set(prev)
                              s.has(i) ? s.delete(i) : s.add(i)
                              return s
                            })}
                            className="p-0.5 mt-0.5 rounded text-slate-300 hover:text-slate-600 transition-colors flex-shrink-0"
                            title="แสดง/ซ่อน Sector Schedule"
                          >
                            <ChevronDown size={12} className={expandedPnrIds.has(i) ? 'rotate-180 transition-transform' : 'transition-transform'} />
                          </button>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs font-bold">
                              {p.pnr_code || p.dummy_pnr || <span className="text-slate-300 italic font-normal">ไม่ระบุ</span>}
                            </span>
                            {p.pnr_code ? (
                              <span className="inline-flex w-fit px-1.5 py-px rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200 whitespace-nowrap">
                                PNR จริง
                              </span>
                            ) : p.dummy_pnr ? (
                              <span className="inline-flex w-fit px-1.5 py-px rounded text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">
                                Dummy
                              </span>
                            ) : null}
                            {isDup && p.pnr_code && (
                              <span className="inline-flex w-fit px-1.5 py-px rounded text-[10px] font-medium bg-red-100 text-red-600 border border-red-300 whitespace-nowrap">
                                PNR ซ้ำ
                              </span>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td className="text-xs">{p.travel_start ? formatDate(p.travel_start) : '—'}</Td>
                      <Td className="text-xs">{travelEnd ? formatDate(travelEnd) : '—'}</Td>
                      <Td className="text-right text-sm">{p.seat_total}</Td>
                      <Td className="text-right text-xs">{p.fare > 0 ? p.fare.toLocaleString() : '—'}</Td>
                      <Td className="text-right text-xs">
                        {p.price_format === 'FARE' ? ((p.tax ?? 0) > 0 ? (p.tax ?? 0).toLocaleString() : (p.tax == null ? <span className="text-slate-300 italic text-[10px]">ยังไม่ระบุ</span> : '0.00')) : <span className="text-slate-300 text-[10px]">ไม่ใช้</span>}
                      </Td>
                      <Td className="text-right text-xs">
                        {p.price_format !== 'ALL_IN' ? ((p.yq ?? 0) > 0 ? (p.yq ?? 0).toLocaleString() : (p.yq == null ? <span className="text-slate-300 italic text-[10px]">ยังไม่ระบุ</span> : '0.00')) : <span className="text-slate-300 text-[10px]">ไม่ใช้</span>}
                      </Td>
                      <Td className="text-right text-xs font-bold">{(p.total_amount || 0) > 0 ? (p.total_amount || 0).toLocaleString() : '—'}</Td>
                      <Td className="text-xs">{getConditionName(p.condition_id)}</Td>
                      <Td className="text-xs whitespace-nowrap">
                        {resolvedTtl ? (
                          <div className="space-y-0.5">
                            {p.ttl_type === 'DAYS_BEFORE' && p.ttl_days_before != null && (
                              <p className="text-[10px] text-slate-400">ก่อนเดินทาง {p.ttl_days_before} วัน</p>
                            )}
                            <p className="font-medium text-amber-600">{formatDate(resolvedTtl)}</p>
                          </div>
                        ) : '—'}
                      </Td>
                      <Td><PNRStatusBadge status={p.status} /></Td>
                    </TableRow>
                    {expandedPnrIds.has(i) && (() => {
                      const sectors = getPnrSectors(p)
                      return (
                        <TableRow className="bg-slate-50/70">
                          <Td colSpan={11} className="py-2 px-4">
                            <div className="overflow-x-auto">
                              <table className="text-xs border-collapse">
                                <thead>
                                  <tr>
                                    {['Sector', 'Dep Date', 'Dep Time', 'Arr Date', 'Arr Time', '+Day'].map(h => (
                                      <th key={h} className="text-left text-slate-400 font-medium pb-1 pr-6 whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {sectors.map((sec, si) => {
                                    const sd = p.sector_dates?.[si]
                                    const depDate = sd?.travel_date || ''
                                    const plusDay = sec.arr_day_offset ?? 0
                                    const arrDate = sd?.arr_date || (depDate && plusDay > 0 ? (() => {
                                      try {
                                        const [y, m, d] = depDate.split('-').map(Number)
                                        const local = new Date(y, m - 1, d)
                                        local.setDate(local.getDate() + plusDay)
                                        return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
                                      } catch { return depDate }
                                    })() : depDate)
                                    return (
                                      <tr key={si}>
                                        <td className="pr-6 pb-0.5">
                                          <span className={sec.sector_type === 'Departure' ? 'text-green-600 font-medium' : sec.sector_type === 'Arrival' ? 'text-purple-600 font-medium' : 'text-amber-600 font-medium'}>{sec.sector_type}</span>
                                        </td>
                                        <td className="pr-6 pb-0.5 font-mono text-slate-700">{depDate ? formatDate(depDate) : '—'}</td>
                                        <td className="pr-6 pb-0.5 text-slate-500">{sd?.dep_time || sec.dep_time || '—'}</td>
                                        <td className="pr-6 pb-0.5 font-mono text-slate-700">{arrDate ? formatDate(arrDate) : '—'}</td>
                                        <td className="pr-6 pb-0.5 text-slate-500">{sd?.arr_time || sec.arr_time || '—'}</td>
                                        <td className="pb-0.5">{plusDay > 0 ? <span className="text-amber-600 font-semibold">+{plusDay}</span> : <span className="text-slate-400">—</span>}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </Td>
                        </TableRow>
                      )
                    })()}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Seat Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-400">Seat Total</p>
          <p className="text-xl font-bold text-slate-800">{totalSeats}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <p className="text-xs text-green-600">Total/Seat (รวมทุก PNR)</p>
          <p className="text-xl font-bold text-[#05a94f]">{totalAmount.toLocaleString()}</p>
        </div>
      </div>
    </div>
  )
}
