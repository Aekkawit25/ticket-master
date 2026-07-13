'use client'

import { useMemo, type Dispatch, type SetStateAction } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { StockStatusBadge, TicketTypeBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Lock, Pencil, X, ArrowRight } from 'lucide-react'
import { formatDate, formatDateTime, formatNumber } from '@/lib/utils'

import { getStockTypeConfigSafe } from '@/lib/stock-type-config'
import type { DemoStock, DemoFlightSet, PaymentScheduleItem } from '@/lib/demo-storage'
import { REOPEN_SECTIONS } from './ReopenStockModal'

const CURRENCY_OPTIONS = ['THB', 'USD', 'JPY', 'EUR', 'SGD', 'KRW', 'CNY', 'AUD', 'GBP', 'HKD']
const STATUS_OPTIONS   = ['Draft', 'Active', 'Closed', 'Cancelled']

interface StockForm {
  group_name: string
  airline_code: string
  currency: string
  status: string
  remark: string
}

export interface SummaryTabProps {
  liveStock: DemoStock
  paymentSchedule: PaymentScheduleItem[]
  stockCode: string
  stockPeriod: string
  routeText: string
  ticketType: string
  groupType?: string
  tripType: string
  createdAt: string
  updatedAt: string
  status: string
  currency: string
  summaryEditMode: boolean
  stockForm: StockForm
  stockSaving: boolean
  canEditSummary: boolean
  showSummaryEditBtn: boolean
  isReopened: boolean
  isClosed: boolean
  onOpenSummaryEdit: () => void
  onCancelSummaryEdit: () => void
  onSaveStock: () => void
  onStockFormChange: Dispatch<SetStateAction<StockForm>>
  onOpenExtend: (sections: string[]) => void
  onNavigateTab: (tab: string) => void
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Compact key–value row used inside summary cards */
function SR({ label, value, hi }: { label: string; value: string | number; hi?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${hi ? 'text-[#05a94f]' : 'text-slate-800'}`}>{value}</span>
    </div>
  )
}

/** Wrapper card for each summary section */
function SCard({
  title, onNavigate, children, empty, emptyText,
}: {
  title: string
  onNavigate?: () => void
  children?: React.ReactNode
  empty?: boolean
  emptyText?: string
}) {
  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {onNavigate && (
          <button type="button" onClick={onNavigate}
            className="flex items-center gap-1 text-xs font-medium text-[#05a94f] hover:text-emerald-700 transition">
            ดูรายละเอียด <ArrowRight size={11} />
          </button>
        )}
      </div>
      <CardContent className="px-4 py-3">
        {empty
          ? <p className="py-4 text-center text-xs text-slate-400">{emptyText}</p>
          : children}
      </CardContent>
    </Card>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function SummaryTab({
  liveStock,
  paymentSchedule,
  stockCode,
  stockPeriod,
  routeText,
  ticketType,
  groupType,
  tripType,
  createdAt,
  updatedAt,
  status,
  currency,
  summaryEditMode,
  stockForm,
  stockSaving,
  canEditSummary,
  showSummaryEditBtn,
  isReopened,
  isClosed,
  onOpenSummaryEdit,
  onCancelSummaryEdit,
  onSaveStock,
  onStockFormChange,
  onOpenExtend,
  onNavigateTab,
}: SummaryTabProps) {
  const stockTypeCfg = getStockTypeConfigSafe(ticketType, groupType)
  const pnrs = liveStock.pnrs

  // ── PNR stats ────────────────────────────────────────────────
  const pnrStats = useMemo(() => {
    const real  = pnrs.filter(p => p.pnrType === 'real').length
    const dummy = pnrs.filter(p => p.pnrType === 'dummy').length
    const statusMap: Record<string, number> = {}
    pnrs.forEach(p => { statusMap[p.status] = (statusMap[p.status] || 0) + 1 })
    const dominant = Object.entries(statusMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return {
      total: pnrs.length, real, dummy,
      seatTotal:   liveStock.summary.seatTotal,
      seatUsed:    liveStock.summary.seatUsed,
      seatBalance: liveStock.summary.seatBalance,
      dominant,
    }
  }, [pnrs, liveStock.summary])

  // ── Flight Set stats ─────────────────────────────────────────
  const flightSets = useMemo<DemoFlightSet[]>(() =>
    liveStock.flightSets?.length
      ? liveStock.flightSets
      : [{ flightSetId: 'fset-default', flightSetName: 'Default', sectors: liveStock.sectors }],
  [liveStock])

  const fsStats = useMemo(() => {
    const defaultCount = flightSets.filter(fs => !fs.isCustom).length
    const customCount  = flightSets.filter(fs => !!fs.isCustom).length
    const fsPnrCount: Record<string, number> = {}
    pnrs.forEach(p => {
      if (p.flightSetId) fsPnrCount[p.flightSetId] = (fsPnrCount[p.flightSetId] || 0) + 1
    })
    const usedCount = Object.keys(fsPnrCount).length
    const items = flightSets.map(fs => {
      const secs = fs.sectors
      const airports: string[] = []
      secs.forEach(s => {
        if (!airports.length) airports.push(s.depAirportCode)
        airports.push(s.arrAirportCode)
      })
      return {
        flightSetId:   fs.flightSetId,
        flightSetName: fs.flightSetName,
        isCustom:      !!fs.isCustom,
        segmentCount:  secs.length,
        route:         airports.length ? airports.join('–') : '—',
        pnrCount:      fsPnrCount[fs.flightSetId] ?? 0,
      }
    })
    return { total: flightSets.length, defaultCount, customCount, usedCount, items }
  }, [flightSets, pnrs])

  // ── Condition stats ──────────────────────────────────────────
  const condStats = useMemo(() => {
    const total    = liveStock.conditions.length
    const inUse    = new Set(pnrs.map(p => p.conditionCode).filter(Boolean)).size
    const noCond   = pnrs.filter(p => !p.conditionCode).length
    return { total, inUse, noCond }
  }, [pnrs, liveStock.conditions])

  // ── Payment stats ────────────────────────────────────────────
  const payStats = useMemo(() => {
    if (!paymentSchedule.length) return null
    const paid     = paymentSchedule.filter(p => p.paymentStatus === 'PAID').length
    const unpaid   = paymentSchedule.filter(p => p.paymentStatus !== 'PAID').length
    const overdue  = paymentSchedule.filter(p => p.timingStatus === 'OVERDUE').length
    const remaining = paymentSchedule.reduce((s, p) => s + p.remainingForStage, 0)
    const nextDue   = [...paymentSchedule]
      .filter(p => p.dueDate && p.paymentStatus !== 'PAID')
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0]
    return { total: paymentSchedule.length, paid, unpaid, overdue, remaining, nextDue }
  }, [paymentSchedule])

  // ── Seat (from stored summary — seatUsed/Balance managed by PNRTab actions) ─
  const { seatTotal, seatUsed, seatBalance } = liveStock.summary
  const seatPct = seatTotal > 0 ? Math.round((seatUsed / seatTotal) * 100) : 0

  // ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Edit toolbar */}
      {summaryEditMode && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <Pencil size={14} />
            <span className="font-medium">กำลังแก้ไขข้อมูล Stock</span>
            {isReopened && <span className="text-xs text-blue-500">(Reopen mode)</span>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={onCancelSummaryEdit}>ยกเลิก</Button>
            <Button size="sm" onClick={onSaveStock} disabled={stockSaving}>
              {stockSaving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
            </Button>
          </div>
        </div>
      )}

      {/* ── 1. ข้อมูล Stock ─────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">ข้อมูล Stock</h3>
          {showSummaryEditBtn && (
            <Button size="sm" variant="outline" icon={<Pencil size={13} />} onClick={onOpenSummaryEdit}>
              แก้ไข
            </Button>
          )}
          {isClosed && (
            <span className="flex items-center gap-1 text-xs text-slate-400"><Lock size={11} /> Read-only</span>
          )}
          {isReopened && !canEditSummary && (
            <button type="button" onClick={() => onOpenExtend(['stock-info'])}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-700 transition">
              <Lock size={11} /> ขอเปิดสิทธิ์
            </button>
          )}
        </div>

        <CardContent className="px-4 py-3">
          {summaryEditMode && canEditSummary ? (
            /* ── Edit form ─────────────────────────────────── */
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                <p className="font-medium text-slate-500 mb-2">ข้อมูลที่ไม่สามารถเปลี่ยนแปลงได้</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div><span className="text-slate-400">{stockTypeCfg.codeLabel}: </span><span className="font-mono font-bold">{stockCode}</span></div>
                  <div><span className="text-slate-400">Ticket Type: </span><span>{ticketType}</span></div>
                  <div><span className="text-slate-400">Route: </span><span className="font-mono font-medium text-[#05a94f]">{routeText || '—'}</span></div>
                  <div><span className="text-slate-400">Period: </span><span>{stockPeriod || '—'}</span></div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Input label={stockTypeCfg.nameLabel} value={stockForm.group_name}
                    onChange={e => onStockFormChange(f => ({ ...f, group_name: e.target.value }))} required />
                </div>
                <Input label="Airline Code" value={stockForm.airline_code}
                  onChange={e => onStockFormChange(f => ({ ...f, airline_code: e.target.value.toUpperCase() }))}
                  placeholder="เช่น TG" helper="รหัส IATA 2–3 ตัวอักษร" />
                <Select label="Currency" value={stockForm.currency}
                  onChange={e => onStockFormChange(f => ({ ...f, currency: e.target.value }))}
                  options={CURRENCY_OPTIONS.map(c => ({ value: c, label: c }))} />
                {!isReopened && (
                  <div className="sm:col-span-2">
                    <Select label="Status" value={stockForm.status}
                      onChange={e => onStockFormChange(f => ({ ...f, status: e.target.value }))}
                      options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))} />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <Textarea label="Remark" value={stockForm.remark}
                    onChange={e => onStockFormChange(f => ({ ...f, remark: e.target.value }))}
                    rows={2} placeholder="บันทึกเพิ่มเติม" />
                </div>
              </div>
            </div>
          ) : (
            /* ── View mode ─────────────────────────────────── */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <div>
                <p className="text-[10px] text-slate-400 mb-0.5">{stockTypeCfg.codeLabel}</p>
                <p className="font-mono font-bold text-slate-800">{stockCode}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 mb-0.5">Ticket Type</p>
                <TicketTypeBadge type={ticketType} groupType={groupType} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 mb-0.5">Status</p>
                <StockStatusBadge status={status} />
              </div>
              <div className="sm:col-span-2">
                <p className="text-[10px] text-slate-400 mb-0.5">{stockTypeCfg.nameLabel}</p>
                <p className="font-semibold text-slate-800">{liveStock.groupName}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 mb-0.5">Airline · Currency</p>
                <p className="font-bold">{liveStock.airlineCode} · {currency}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 mb-0.5">Route</p>
                <p className="font-mono font-bold text-[#05a94f]">{routeText || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 mb-0.5">Period</p>
                <p className="text-slate-700">{stockPeriod || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 mb-0.5">Trip Type</p>
                <p className="text-slate-700">{tripType}</p>
              </div>

              {liveStock.remark && (
                <div className="col-span-2 sm:col-span-3 pt-2 border-t border-slate-100">
                  <p className="text-[10px] text-slate-400 mb-0.5">Remark</p>
                  <p className="text-xs text-slate-600">{liveStock.remark}</p>
                </div>
              )}
              {liveStock.reopenedAt && (
                <div className="col-span-2 sm:col-span-3 pt-2 border-t border-slate-100 text-xs text-amber-700">
                  <span className="font-medium">Reopened</span> โดย {liveStock.reopenedBy} เมื่อ {formatDateTime(liveStock.reopenedAt)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Summary grid (2 col) ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* 2. PNR Summary */}
        <SCard
          title="PNR Summary"
          onNavigate={() => onNavigateTab('PNR')}
          empty={pnrStats.total === 0}
          emptyText="ยังไม่มี PNR"
        >
          <SR label="PNR ทั้งหมด" value={pnrStats.total} hi />
          <SR label="Real / Dummy" value={`${pnrStats.real} / ${pnrStats.dummy}`} />
          <SR label="Seat Total" value={pnrStats.seatTotal} />
          <SR label="Used / Balance" value={`${pnrStats.seatUsed} / ${pnrStats.seatBalance}`} />
          {pnrStats.dominant && (
            <SR label="สถานะหลัก" value={pnrStats.dominant} />
          )}
        </SCard>

        {/* 3. Flight Set Summary */}
        <SCard
          title="Flight Set Summary"
          onNavigate={() => onNavigateTab('Flight Segments')}
          empty={fsStats.total === 0}
          emptyText="ยังไม่มี Flight Set"
        >
          {/* Summary line */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs mb-3 pb-3 border-b border-slate-100">
            <span className="text-slate-500">ทั้งหมด <span className="font-bold text-slate-800">{fsStats.total}</span></span>
            <span className="text-slate-200">|</span>
            <span className="text-slate-500">Default <span className="font-bold text-slate-800">{fsStats.defaultCount}</span></span>
            <span className="text-slate-200">|</span>
            <span className="text-slate-500">Custom <span className="font-bold text-slate-800">{fsStats.customCount}</span></span>
            <span className="text-slate-200">|</span>
            <span className="text-slate-500">ใช้งานอยู่ <span className="font-bold text-[#05a94f]">{fsStats.usedCount}</span></span>
          </div>

          {/* FS list (max 4 items) */}
          <div>
            {fsStats.items.slice(0, 4).map((fs, idx) => (
              <div key={fs.flightSetId}
                className={`flex items-center justify-between gap-2 py-2 ${idx < Math.min(fsStats.items.length, 4) - 1 ? 'border-b border-slate-50' : ''}`}>
                {/* Left: badge + name */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`shrink-0 inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold leading-tight ${
                    fs.isCustom ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {fs.isCustom ? 'Custom' : 'Default'}
                  </span>
                  <span className="text-xs font-medium text-slate-700 truncate" title={fs.flightSetName}>
                    {fs.flightSetName}
                  </span>
                </div>
                {/* Right: route · seg · PNR */}
                <div className="shrink-0 flex items-center gap-1 text-[10px] text-slate-400 whitespace-nowrap">
                  <span className="font-mono text-slate-600">{fs.route}</span>
                  <span className="text-slate-200">·</span>
                  <span>{fs.segmentCount} seg</span>
                  {fs.pnrCount > 0 && (
                    <>
                      <span className="text-slate-200">·</span>
                      <span className="text-[#05a94f] font-medium">{fs.pnrCount} PNR</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Show-more link */}
          {fsStats.total > 4 && (
            <button type="button" onClick={() => onNavigateTab('Flight Segments')}
              className="mt-2 w-full pt-2 border-t border-slate-50 text-center text-xs text-[#05a94f] hover:text-emerald-700 transition">
              ดูเพิ่มเติมอีก {fsStats.total - 4} Flight Set →
            </button>
          )}
        </SCard>

        {/* 4. Condition Summary */}
        <SCard
          title="Condition Summary"
          onNavigate={() => onNavigateTab('Conditions')}
          empty={condStats.total === 0}
          emptyText="ยังไม่ได้กำหนด Conditions"
        >
          <SR label="Conditions ทั้งหมด" value={condStats.total} hi />
          <SR label="ที่ใช้งานอยู่" value={condStats.inUse} />
          <SR label="PNR ที่มี Condition" value={pnrs.length - condStats.noCond} />
          <SR label="PNR ไม่มี Condition" value={condStats.noCond} />
        </SCard>

        {/* 5. Payment Summary */}
        <SCard
          title="Payment Summary"
          onNavigate={() => onNavigateTab('Payment Schedule')}
          empty={!payStats}
          emptyText="ยังไม่มี Payment Schedule"
        >
          {payStats && (
            <>
              <SR label="รอบชำระทั้งหมด" value={payStats.total} hi />
              <SR label="ชำระแล้ว" value={payStats.paid} />
              <SR label="ค้างชำระ" value={payStats.unpaid} />
              {payStats.overdue > 0 && (
                <SR label="เกินกำหนด" value={payStats.overdue} />
              )}
              <SR label="Due Date ถัดไป" value={payStats.nextDue?.dueDate ? formatDate(payStats.nextDue.dueDate) : '—'} />
              <SR label={`ยอดคงเหลือ (${currency})`} value={formatNumber(payStats.remaining, 0)} />
            </>
          )}
        </SCard>

        {/* 6. Seat Summary */}
        <SCard title="Seat Summary">
          <SR label="Total"   value={seatTotal} />
          <SR label="Used"    value={seatUsed} />
          <SR label="Balance" value={seatBalance} hi />
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1 text-[10px] text-slate-400">
              <span>การใช้งาน</span><span>{seatPct}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-2 rounded-full transition-all" style={{
                width: `${seatPct}%`,
                background: seatPct >= 80 ? '#ef4444' : seatPct >= 60 ? '#f59e0b' : '#05a94f',
              }} />
            </div>
          </div>
        </SCard>

      </div>


    </div>
  )
}
