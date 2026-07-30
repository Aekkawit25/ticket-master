'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layout/AppLayout'
import { Badge, TicketTypeBadge, PnrOperationalStatusBadge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatDate, formatDateTime, formatNumber, formatStockPeriod, formatPeriodDisplay, buildRouteText, PAYMENT_TYPE_LABELS } from '@/lib/utils'
import {
  ChevronLeft, Pencil, FileDown, AlertCircle, X, CheckCircle2,
} from 'lucide-react'
import {
  getDemoStockById, getDemoStockByCode, exportStockJSON,
  buildPaymentSchedule, saveDemoStock, getNextTTL, getPnrOperationalStatus, getPnrConfirmationStatus,
} from '@/lib/demo-storage'
import type { DemoStock, DemoLog, PaymentScheduleItem } from '@/lib/demo-storage'
import { PNRTab }        from '@/components/tickets/detail/PNRTab'
import { SegmentsTab }   from '@/components/tickets/detail/SegmentsTab'
import { ConditionsTab } from '@/components/tickets/detail/ConditionsTab'
import { SummaryTab }    from '@/components/tickets/detail/SummaryTab'
import { LogsTab }       from '@/components/tickets/detail/LogsTab'


const TABS = ['Summary', 'PNR', 'Flight Segments', 'Conditions', 'Payment Schedule', 'Logs']
const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const params = useParams()
  const id = String(params.id)

  const [isMounted, setIsMounted]             = useState(false)
  const [liveStock, setLiveStock]             = useState<DemoStock | null>(null)
  const [tab, setTab]                         = useState('Summary')
  const [hasDirtyTab, setHasDirtyTab]         = useState(false)
  const [pendingTab, setPendingTab]           = useState<string | null>(null)
  const [showUnsaved, setShowUnsaved]         = useState(false)

  // Summary inline edit mode
  const [summaryEditMode, setSummaryEditMode] = useState(false)
  const [stockForm, setStockForm]             = useState({ group_name: '', airline_code: '', currency: '', remark: '' })
  const [stockSaving, setStockSaving]         = useState(false)

  // Toast
  const [toast, setToast]                     = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Periods modal
  const [showPeriodsModal, setShowPeriodsModal] = useState(false)

  useEffect(() => { setLiveStock(getDemoStockById(id) ?? getDemoStockByCode(id)); setIsMounted(true) }, [id])

  useEffect(() => {
    const refetch = () => setLiveStock(getDemoStockById(id) ?? getDemoStockByCode(id))
    const handleUpdate = () => refetch()
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'ticket_stock_demo_data') refetch()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    window.addEventListener('demo_stock_updated', handleUpdate)
    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('demo_stock_updated', handleUpdate)
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [id])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleUpdate = (updated: DemoStock) => {
    setLiveStock(updated)
    showToast('บันทึกการเปลี่ยนแปลงสำเร็จ', 'success')
  }

  // Tab switching with dirty check
  const trySetTab = (newTab: string) => {
    if (hasDirtyTab && newTab !== tab) {
      setPendingTab(newTab)
      setShowUnsaved(true)
    } else {
      setTab(newTab)
    }
  }

  const confirmLeave = () => {
    if (pendingTab) { setTab(pendingTab); setPendingTab(null) }
    setHasDirtyTab(false)
    setSummaryEditMode(false)
    setShowUnsaved(false)
  }

  // Summary inline edit
  const openSummaryEdit = () => {
    if (!liveStock) return
    setStockForm({
      group_name:    liveStock.groupName,
      airline_code:  liveStock.airlineCode,
      currency:      liveStock.currency,
      remark:        liveStock.remark || '',
    })
    setSummaryEditMode(true)
    setHasDirtyTab(true)
  }

  const cancelSummaryEdit = () => {
    setSummaryEditMode(false)
    setHasDirtyTab(false)
  }

  const handleSaveStock = () => {
    if (!liveStock) return
    setStockSaving(true)
    const now = new Date().toISOString()
    const changes: string[] = []
    if (stockForm.group_name    !== liveStock.groupName)           changes.push(`Series Name: "${liveStock.groupName}" → "${stockForm.group_name}"`)
    if (stockForm.airline_code  !== liveStock.airlineCode)         changes.push(`Airline: ${liveStock.airlineCode} → ${stockForm.airline_code}`)
    if (stockForm.currency      !== liveStock.currency)            changes.push(`Currency: ${liveStock.currency} → ${stockForm.currency}`)
    if (stockForm.remark        !== (liveStock.remark || ''))      changes.push(`Remark: แก้ไข`)
    const log: DemoLog = {
      logId: newId('LOG'),
      action: 'STOCK_UPDATED',
      message: changes.length > 0 ? `[${liveStock.stockCode}] ${changes.join(' | ')}` : `[${liveStock.stockCode}] ไม่มีการเปลี่ยนแปลง`,
      createdAt: now, createdBy: 'Admin User',
    }
    const updated: DemoStock = {
      ...liveStock,
      groupName:    stockForm.group_name,
      airlineCode:  stockForm.airline_code,
      currency:     stockForm.currency,
      remark:       stockForm.remark,
      updatedAt:    now,
      logs:         [log, ...liveStock.logs],
    }
    saveDemoStock(updated)
    setLiveStock(updated)
    setStockSaving(false)
    setSummaryEditMode(false)
    setHasDirtyTab(false)
    showToast('บันทึกข้อมูล Stock สำเร็จ', 'success')
  }

  // Loading / Not found
  if (!isMounted) {
    return <AppLayout title="กำลังโหลด..."><div className="flex items-center justify-center py-24 text-slate-400 text-sm">กำลังโหลด...</div></AppLayout>
  }

  if (!liveStock) {
    return (
      <AppLayout title="ไม่พบข้อมูล">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertCircle size={40} className="text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">ไม่พบข้อมูล Stock</p>
          <p className="text-xs text-slate-400 mt-1">รหัส: {id}</p>
          <Link href="/tickets" className="mt-5 text-sm text-[#05a94f] hover:underline">← กลับหน้ารายการ</Link>
        </div>
      </AppLayout>
    )
  }

  // ── Derive display data ──
  const stock = {
    id: liveStock.stockId, stock_code: liveStock.stockCode, ticket_type: liveStock.ticketType, group_type: liveStock.groupType, trip_type: liveStock.tripType,
    group_name: liveStock.groupName, airline_code: liveStock.airlineCode, route_text: liveStock.routeText,
    currency: liveStock.currency, remark: liveStock.remark,
    created_at: liveStock.createdAt, updated_at: liveStock.updatedAt,
    seat_total: liveStock.summary.seatTotal, seat_used: liveStock.summary.seatUsed, seat_balance: liveStock.summary.seatBalance,
    pnr_count: liveStock.summary.pnrCount, fare_total: liveStock.summary.fareTotal,
    tax_total: liveStock.summary.taxTotal, total_amount: liveStock.summary.grandTotal,
    next_ttl: getNextTTL(liveStock.pnrs),
  }

  const pnrRows = liveStock.pnrs.map(p => ({
    id: p.pnrId, pnr_code: p.pnrCode || null, dummy_pnr: p.dummyPnr || null, pnr_type: p.pnrType,
    travel_start: p.travelStart, travel_end: p.travelEnd,
    seat_total: p.seatTotal, seat_used: p.seatUsed, seat_balance: p.seatBalance,
    fare: p.fare, tax_type: p.taxType, tax: p.tax, total_amount: p.total,
    condition: liveStock.conditions.find(sc => sc.condition.conditionCode === p.conditionCode)?.condition.conditionName || null,
    condition_code: p.conditionCode || null, next_ttl: p.ttlDateTime, status: p.status,
  }))

  const sectors = liveStock.sectors.map(s => ({
    seq: s.seq, sector_type: s.sectorType, airline_code: s.airlineCode, flight_no: s.flightNo,
    dep_airport_code: s.depAirportCode, arr_airport_code: s.arrAirportCode,
    dep_time: s.depTime, arr_time: s.arrTime, arr_day_offset: s.arrDayOffset, day_offset: s.dayOffset, remark: s.remark,
  }))

  const paymentSchedule: PaymentScheduleItem[] = buildPaymentSchedule(liveStock)

  const depDates    = pnrRows.map(p => p.travel_start).filter(Boolean).sort()
  const periodInfo  = formatPeriodDisplay(depDates)
  const stockPeriod = periodInfo.dateRange || formatStockPeriod(depDates[0] ?? null, depDates[depDates.length - 1] ?? null)

  // Periods modal rows — one row per unique travelStart, with return date derived from sectorSchedules
  const periodRows: { no: number; depDate: string; retDate: string | null; route: string }[] = (() => {
    const BKK = ['BKK', 'DMK']
    const byDep = new Map<string, typeof liveStock.pnrs[0]>()
    for (const pnr of liveStock.pnrs) {
      if (pnr.travelStart && !byDep.has(pnr.travelStart)) byDep.set(pnr.travelStart, pnr)
    }
    return Array.from(byDep.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([depDate, pnr], i) => {
        const flightSet = (liveStock.flightSets ?? []).find(fs => fs.flightSetId === pnr.flightSetId)
          ?? liveStock.flightSets?.[0]
        const fsSectors = flightSet?.sectors ?? liveStock.sectors
        const route = buildRouteText(fsSectors.map(s => ({ dep_airport_code: s.depAirportCode, arr_airport_code: s.arrAirportCode })))
        let retDate: string | null = null
        if (pnr.sectorSchedules && pnr.sectorSchedules.length > 0) {
          const arrivals = pnr.sectorSchedules.filter(ss => ss.sectorType === 'Arrival')
          let found: typeof arrivals[0] | null = null
          for (let j = arrivals.length - 1; j >= 0; j--) {
            const fsSec = fsSectors.find(s => s.sectorId === arrivals[j].flightSetSectorId)
            if (fsSec && BKK.includes(fsSec.arrAirportCode)) { found = arrivals[j]; break }
          }
          retDate = found
            ? found.departureDate
            : arrivals.length > 0
              ? arrivals[arrivals.length - 1].departureDate
              : pnr.sectorSchedules[pnr.sectorSchedules.length - 1].departureDate
        } else {
          retDate = pnr.travelEnd || null
        }
        return { no: i + 1, depDate, retDate, route }
      })
  })()

  // Summary edit button
  const showSummaryEditBtn = !summaryEditMode

  return (
    <AppLayout title={stock.stock_code}>
      {/* Global Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          ${toast.type === 'success' ? 'bg-[#05a94f] text-white' : 'bg-red-500 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Link href="/tickets" className="text-slate-400 hover:text-slate-600"><ChevronLeft size={18} /></Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900 font-mono">{stock.stock_code}</h1>
              <TicketTypeBadge type={stock.ticket_type} groupType={stock.group_type} />
              {liveStock && <span className="inline-flex items-center px-1.5 py-px text-[9px] font-bold bg-amber-100 text-amber-600 rounded">DEMO</span>}
            </div>
            <p className="text-sm text-slate-500">{stock.group_name}</p>
            {liveStock && liveStock.pnrs.length > 0 && (() => {
              const counts = liveStock.pnrs.reduce<Record<string, number>>((acc, p) => {
                const s = getPnrOperationalStatus(p); acc[s] = (acc[s] ?? 0) + 1; return acc
              }, {})
              return (
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  <span className="text-[10px] text-slate-400 font-medium">PNR:</span>
                  {(counts.PENDING  ?? 0) > 0 && <PnrOperationalStatusBadge status="PENDING"  label={`${counts.PENDING} Pending`}  />}
                  {(counts.ACTIVE   ?? 0) > 0 && <PnrOperationalStatusBadge status="ACTIVE"   label={`${counts.ACTIVE} Active`}    />}
                  {(counts.CLOSED   ?? 0) > 0 && <PnrOperationalStatusBadge status="CLOSED"   label={`${counts.CLOSED} Closed`}    />}
                  {(counts.CANCELLED ?? 0) > 0 && <PnrOperationalStatusBadge status="CANCELLED" label={`${counts.CANCELLED} Cancelled`} />}
                </div>
              )
            })()}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" icon={<FileDown size={14} />}
            onClick={() => liveStock && exportStockJSON(liveStock)} disabled={!liveStock}
            title={!liveStock ? 'Export ใช้ได้เฉพาะ Demo Stock' : 'Export JSON'}>
            Export
          </Button>
        </div>
      </div>

      {hasDirtyTab && (
        <div className="mb-4 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700">
          <Pencil size={14} />
          กำลังแก้ไขข้อมูล — บันทึกหรือยกเลิกก่อนเปลี่ยน Tab
        </div>
      )}

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400">Route</p>
          <p className="font-mono font-bold text-slate-800 text-sm">{stock.route_text || '—'}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400">ช่วงวันเดินทาง (Period)</p>
          {periodInfo.count === 0 ? (
            <p className="text-xs text-slate-400 italic mt-0.5">ยังไม่กำหนดวันเดินทาง</p>
          ) : (
            <>
              <p className="text-sm font-medium leading-snug">{periodInfo.dateRange}</p>
              <button onClick={() => setShowPeriodsModal(true)}
                className="text-[10px] text-[#05a94f] hover:underline mt-0.5">
                {periodInfo.count} Period{periodInfo.count > 1 ? 's' : ''}
              </button>
            </>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400">Seat (Bal / Total)</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-sm font-bold ${stock.seat_balance < stock.seat_total * 0.2 ? 'text-orange-500' : 'text-[#05a94f]'}`}>{stock.seat_balance}</span>
            <span className="text-xs text-slate-400">/ {stock.seat_total}</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400">Grand Total ({stock.currency})</p>
          <p className="text-sm font-bold text-[#05a94f]">{formatNumber(stock.total_amount, 0)}</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="overflow-x-auto scrollbar-thin mb-4">
        <div className="flex border-b border-slate-200 min-w-max">
          {TABS.map(t => (
            <button key={t} onClick={() => trySetTab(t)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t ? 'border-[#05a94f] text-[#05a94f]' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary ── */}
      {tab === 'Summary' && (
        <SummaryTab
          liveStock={liveStock}
          paymentSchedule={paymentSchedule}
          stockCode={stock.stock_code}
          stockPeriod={stockPeriod}
          periodCount={periodInfo.count}
          periodAllDates={periodInfo.allDates}
          onShowPeriods={() => setShowPeriodsModal(true)}
          routeText={stock.route_text}
          ticketType={stock.ticket_type}
          groupType={stock.group_type}
          tripType={stock.trip_type}
          createdAt={stock.created_at}
          updatedAt={stock.updated_at}
          currency={stock.currency}
          summaryEditMode={summaryEditMode}
          stockForm={stockForm}
          stockSaving={stockSaving}
          canEditSummary={true}
          showSummaryEditBtn={showSummaryEditBtn}
          isClosed={false}
          onOpenSummaryEdit={openSummaryEdit}
          onCancelSummaryEdit={cancelSummaryEdit}
          onSaveStock={handleSaveStock}
          onStockFormChange={setStockForm}
          onOpenExtend={() => {}}
          onNavigateTab={trySetTab}
        />
      )}

      {/* ── PNR Tab ── */}
      {tab === 'PNR' && (
        <PNRTab
          liveStock={liveStock}
          mockPNRs={[]}
          currency={stock.currency}
          canEdit={true}
          jumpToEdit={false}
          onUpdate={handleUpdate}
          onDirtyChange={setHasDirtyTab}
          onJumpDone={() => {}}
        />
      )}

      {/* ── Flight Segments Tab ── */}
      {tab === 'Flight Segments' && (
        <SegmentsTab
          liveStock={liveStock}
          mockSectors={sectors}
          ticketType={stock.ticket_type}
          canEdit={true}
          jumpToEdit={false}
          onUpdate={handleUpdate}
          onDirtyChange={setHasDirtyTab}
          onJumpDone={() => {}}
        />
      )}

      {/* ── Conditions Tab ── */}
      {tab === 'Conditions' && (
        <ConditionsTab
          liveStock={liveStock}
          currency={stock.currency}
          canEdit={true}
          jumpToEdit={false}
          onUpdate={handleUpdate}
          onDirtyChange={setHasDirtyTab}
          onJumpDone={() => {}}
        />
      )}

      {/* ── Payment Schedule ── */}
      {tab === 'Payment Schedule' && (
        paymentSchedule.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-sm text-slate-400">
            ยังไม่มี Payment Schedule
          </div>
        ) : (() => {
          // Group by PNR, preserve insertion order
          const pnrOrder: string[] = []
          const grouped: Record<string, PaymentScheduleItem[]> = {}
          for (const p of paymentSchedule) {
            if (!grouped[p.pnrId]) { grouped[p.pnrId] = []; pnrOrder.push(p.pnrId) }
            grouped[p.pnrId].push(p)
          }

          return (
            <div className="space-y-4">
              {pnrOrder.map(pnrId => {
                const items = grouped[pnrId]
                const first  = items[0]
                const pnrInfo = liveStock.pnrs.find(p => p.pnrId === pnrId)
                const totalAmt  = items.reduce((s, i) => s + i.amount, 0)
                const paidAmt   = items.reduce((s, i) => s + i.paid, 0)
                const hasOverdue = items.some(i => i.status === 'Overdue')
                const allPaid    = items.every(i => i.status === 'Paid')
                const isDummy    = pnrInfo?.pnrType === 'dummy'

                return (
                  <div key={pnrId} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {/* PNR Group Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-sm font-bold text-slate-800">{first.pnrDisplay || pnrId}</span>
                        {isDummy && (
                          <span className="px-1.5 py-px text-[10px] rounded-full font-medium bg-amber-100 text-amber-700">Dummy</span>
                        )}
                        {pnrInfo?.travelStart && (
                          <span className="text-xs text-slate-500">
                            {formatDate(pnrInfo.travelStart)}{pnrInfo.travelEnd ? ` – ${formatDate(pnrInfo.travelEnd)}` : ''}
                          </span>
                        )}
                        {pnrInfo && (
                          <span className="text-xs text-slate-400">{pnrInfo.seatTotal} ที่นั่ง</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-500">
                          รวม <span className="font-semibold text-slate-800">{formatNumber(totalAmt, 0)} {stock.currency}</span>
                        </span>
                        {paidAmt > 0 && (
                          <span className="text-[#05a94f] font-medium">ชำระแล้ว {formatNumber(paidAmt, 0)}</span>
                        )}
                        {hasOverdue && (
                          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-semibold">เกินกำหนด</span>
                        )}
                        {allPaid && (
                          <span className="px-2 py-0.5 rounded-full bg-[#05a94f]/10 text-[#05a94f] text-[10px] font-semibold">ชำระครบ</span>
                        )}
                      </div>
                    </div>

                    {/* Stages table */}
                    <Table>
                      <TableHead>
                        <tr>
                          <Th>#</Th>
                          <Th>งวดการชำระ</Th>
                          <Th>ประเภท</Th>
                          <Th className="text-right">ยอด ({stock.currency})</Th>
                          <Th>Due Date</Th>
                          <Th>NAME DL (Deadline)</Th>
                          <Th className="text-right">ชำระแล้ว</Th>
                          <Th>สถานะ</Th>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {items.map((p, i) => (
                          <TableRow key={i}>
                            <Td className="text-xs text-slate-400 w-8">{p.stageSeq}</Td>
                            <Td className="text-sm font-medium text-slate-800">{p.stageName}</Td>
                            <Td>
                              {p.paymentType ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 whitespace-nowrap">
                                  {PAYMENT_TYPE_LABELS[p.paymentType] ?? p.paymentType}
                                </span>
                              ) : '—'}
                            </Td>
                            <Td className="text-right font-semibold text-sm">{formatNumber(p.amount, 0)}</Td>
                            <Td className="text-xs text-slate-600 whitespace-nowrap">{p.dueDate ? formatDate(p.dueDate) : '—'}</Td>
                            <Td className={`text-xs font-medium whitespace-nowrap ${p.status === 'Overdue' ? 'text-red-500' : 'text-orange-600'}`}>
                              {p.ttlDatetime ? formatDateTime(p.ttlDatetime) : '—'}
                            </Td>
                            <Td className="text-right text-xs">{p.paid > 0 ? formatNumber(p.paid, 0) : '—'}</Td>
                            <Td>
                              <Badge variant={p.status === 'Paid' ? 'green' : p.status === 'Overdue' ? 'red' : 'yellow'}>
                                {p.status === 'Paid' ? 'ชำระแล้ว' : p.status === 'Overdue' ? 'เกินกำหนด' : 'รอชำระ'}
                              </Badge>
                            </Td>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              })}
            </div>
          )
        })()
      )}

      {/* ── Logs ── */}
      {tab === 'Logs' && (
        <LogsTab liveStock={liveStock} />
      )}

      {/* ── Unsaved Changes Warning ── */}
      <Modal
        open={showUnsaved}
        onClose={() => setShowUnsaved(false)}
        title="มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowUnsaved(false)}>กลับไปแก้ไข</Button>
            <Button variant="danger" onClick={confirmLeave}>ยกเลิกการเปลี่ยนแปลงและออก</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?</p>
        <p className="text-xs text-slate-500 mt-1.5">ข้อมูลที่แก้ไขจะสูญหาย</p>
      </Modal>

      {/* ── Periods Modal ── */}
      {showPeriodsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">วันเดินทางทั้งหมด</h3>
                <p className="text-xs text-slate-400 mt-0.5">{periodInfo.count} Period{periodInfo.count !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowPeriodsModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
                <X size={15} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Desktop table */}
              <table className="w-full text-sm hidden sm:table">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-[11px] font-medium text-slate-400 text-right px-4 py-2.5 w-8">#</th>
                    <th className="text-[11px] font-medium text-slate-500 text-left px-4 py-2.5">วันเดินทางขาไป</th>
                    <th className="text-[11px] font-medium text-slate-500 text-left px-4 py-2.5">วันเดินทางขากลับ</th>
                  </tr>
                </thead>
                <tbody>
                  {periodRows.map(row => (
                    <tr key={row.depDate} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="text-[11px] text-slate-400 text-right px-4 py-3 align-top">{row.no}</td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-slate-800 text-sm">{formatDate(row.depDate)}</div>
                        {row.route && <div className="text-[11px] text-slate-400 mt-0.5 font-mono tracking-wide">{row.route}</div>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {row.retDate
                          ? <span className="font-medium text-slate-800 text-sm">{formatDate(row.retDate)}</span>
                          : <span className="text-xs text-slate-400 italic">ยังไม่กำหนด</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {periodRows.map(row => (
                  <div key={row.depDate} className="px-4 py-3.5 flex items-start gap-3">
                    <span className="text-xs text-slate-400 w-5 text-right shrink-0 pt-0.5">{row.no}</span>
                    <div className="flex-1 min-w-0">
                      {row.route && <div className="text-[10px] text-slate-400 font-mono tracking-wide mb-1.5">{row.route}</div>}
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-[10px] text-slate-400 mb-0.5">ขาไป</div>
                          <div className="text-sm font-medium text-slate-800">{formatDate(row.depDate)}</div>
                        </div>
                        <div className="text-slate-300 pt-3 text-xs">→</div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400 mb-0.5">ขากลับ</div>
                          {row.retDate
                            ? <div className="text-sm font-medium text-slate-800">{formatDate(row.retDate)}</div>
                            : <div className="text-xs text-slate-400 italic">ยังไม่กำหนด</div>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowPeriodsModal(false)}
                className="w-full text-xs text-slate-500 hover:text-slate-700 transition py-1.5 rounded-lg hover:bg-slate-50">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  )
}
