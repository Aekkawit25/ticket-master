'use client'

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { StockStatusBadge, TicketTypeBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Lock, Pencil, X, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDate, formatDateTime, formatNumber } from '@/lib/utils'
import { computeStockFinancials } from '@/lib/demo-storage'
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

function formatPriceType(priceFormat?: string): string {
  if (priceFormat === 'ALL_IN')  return 'All In'
  if (priceFormat === 'FARE_YQ') return 'Fare+YQ'
  if (priceFormat === 'FARE')    return 'Fare'
  return '—'
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

  // ── Financial (from PNRs directly — immune to stale stored summary) ─────────
  const finStats = useMemo(() => computeStockFinancials(pnrs), [pnrs])
  const [showPnrBreakdown, setShowPnrBreakdown] = useState(false)

  // Price tiers: group active PNRs with same fare/tax/yq/total/format
  const priceTiers = useMemo(() => {
    const active = pnrs.filter(p => p.status !== 'Cancelled')
    const map = new Map<string, {
      key: string; fare: number; tax: number; yq: number; total: number
      priceFormat: string; taxType: string; pnrCount: number; seatCount: number; tierTotal: number
    }>()
    for (const p of active) {
      const key = `${p.fare}|${p.tax}|${p.yq ?? 0}|${p.total}|${p.priceFormat ?? ''}|${p.taxType}`
      const ex = map.get(key)
      if (ex) { ex.pnrCount++; ex.seatCount += p.seatTotal; ex.tierTotal += p.total * p.seatTotal }
      else map.set(key, {
        key, fare: p.fare, tax: p.tax, yq: p.yq ?? 0, total: p.total,
        priceFormat: p.priceFormat ?? '', taxType: p.taxType,
        pnrCount: 1, seatCount: p.seatTotal, tierTotal: p.total * p.seatTotal,
      })
    }
    return Array.from(map.values()).sort((a, b) => a.total - b.total)
  }, [pnrs])

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

      {/* ── 7. สรุปราคาและมูลค่า Stock ── full width ───────────── */}
      <Card>
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">
            สรุปราคาและมูลค่า Stock ({currency})
          </h3>
          {!finStats.isUniform && finStats.pnrCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-700">
              มี {priceTiers.length} ระดับราคา
            </span>
          )}
        </div>

        <CardContent className="px-4 py-4">
          {finStats.pnrCount === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">ยังไม่มีข้อมูลราคา</p>
          ) : (
            <div className="space-y-5">

              {/* A: 3 highlight boxes */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-emerald-600 mb-1">
                    {finStats.isUniform ? 'ราคาสุทธิต่อที่นั่ง' : 'ราคาเฉลี่ยต่อที่นั่ง'}
                  </p>
                  <p className="text-xl font-bold text-[#05a94f]">{formatNumber(finStats.totalPerSeat, 2)}</p>
                  <p className="text-[10px] text-emerald-500 mt-0.5">{currency}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-500 mb-1">จำนวนที่นั่งทั้งหมด</p>
                  <p className="text-xl font-bold text-slate-800">{finStats.totalSeats}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{finStats.pnrCount} PNR</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-amber-700 mb-1">มูลค่ารวมทั้งหมด</p>
                  <p className="text-xl font-bold text-amber-700">{formatNumber(finStats.grandTotal, 2)}</p>
                  <p className="text-[10px] text-amber-500 mt-0.5">{currency}</p>
                </div>
              </div>

              {/* B (non-uniform): ข้อมูลราคาหลายระดับ */}
              {!finStats.isUniform && (
                <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5 text-xs">
                    <div>
                      <p className="text-[10px] text-violet-400 mb-0.5">จำนวน PNR</p>
                      <p className="font-semibold text-slate-700">{finStats.pnrCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-violet-400 mb-0.5">จำนวนที่นั่ง</p>
                      <p className="font-semibold text-slate-700">{finStats.totalSeats}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-violet-400 mb-0.5">จำนวนระดับราคา</p>
                      <p className="font-semibold text-violet-700">{priceTiers.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-violet-400 mb-0.5">ราคาเฉลี่ยถ่วงน้ำหนัก</p>
                      <p className="font-bold text-[#05a94f]">{formatNumber(finStats.totalPerSeat, 2)} {currency}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-violet-400 mb-0.5">ราคาต่ำสุด/ที่นั่ง</p>
                      <p className="font-semibold text-slate-700">{formatNumber(finStats.minTotalPerSeat, 2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-violet-400 mb-0.5">ราคาสูงสุด/ที่นั่ง</p>
                      <p className="font-semibold text-slate-700">{formatNumber(finStats.maxTotalPerSeat, 2)}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] text-violet-400 mb-0.5">มูลค่ารวม Stock</p>
                      <p className="font-bold text-amber-700">{formatNumber(finStats.grandTotal, 2)} {currency}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* C: Fare/Tax/YQ breakdown table */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">สรุปราคาต่อที่นั่ง</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="py-2 text-left font-medium text-slate-400 w-28">รายการ</th>
                        <th className="py-2 text-right font-medium text-slate-400">
                          {finStats.isUniform ? 'ราคาต่อที่นั่ง' : 'ราคาเฉลี่ย/ที่นั่ง'}
                        </th>
                        <th className="py-2 text-right font-medium text-slate-400 w-24">จำนวนที่นั่ง</th>
                        <th className="py-2 text-right font-medium text-slate-400 w-36">รวมทั้งหมด</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-50">
                        <td className="py-2 text-slate-600">Fare</td>
                        <td className="py-2 text-right text-slate-700">{formatNumber(finStats.farePerSeat, 2)}</td>
                        <td className="py-2 text-right text-slate-400">{finStats.totalSeats}</td>
                        <td className="py-2 text-right text-slate-700">{formatNumber(finStats.fareTotal, 2)}</td>
                      </tr>
                      {finStats.hasTax && (
                        <tr className="border-b border-slate-50">
                          <td className="py-2 text-slate-600">Tax</td>
                          <td className="py-2 text-right text-slate-700">{formatNumber(finStats.taxPerSeat, 2)}</td>
                          <td className="py-2 text-right text-slate-400">{finStats.totalSeats}</td>
                          <td className="py-2 text-right text-slate-700">{formatNumber(finStats.taxTotal, 2)}</td>
                        </tr>
                      )}
                      {finStats.hasYQ && (
                        <tr className="border-b border-slate-50">
                          <td className="py-2 text-slate-600">YQ</td>
                          <td className="py-2 text-right text-slate-700">{formatNumber(finStats.yqPerSeat, 2)}</td>
                          <td className="py-2 text-right text-slate-400">{finStats.totalSeats}</td>
                          <td className="py-2 text-right text-slate-700">{formatNumber(finStats.yqTotal, 2)}</td>
                        </tr>
                      )}
                      <tr className="border-t-2 border-emerald-100">
                        <td className="py-2.5 font-bold text-[#05a94f]">ราคาสุทธิ</td>
                        <td className="py-2.5 text-right font-bold text-[#05a94f]">{formatNumber(finStats.totalPerSeat, 2)}</td>
                        <td className="py-2.5 text-right text-slate-400">{finStats.totalSeats}</td>
                        <td className="py-2.5 text-right font-bold text-[#05a94f]">{formatNumber(finStats.grandTotal, 2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {!finStats.isUniform && (
                  <p className="mt-1 text-[10px] text-slate-400">
                    * ราคาเฉลี่ยถ่วงน้ำหนัก = SUM(ราคาสุทธิ/ที่นั่ง × จำนวนที่นั่ง) ÷ จำนวนที่นั่งทั้งหมด
                  </p>
                )}
              </div>

              {/* D (non-uniform): สรุปตามระดับราคา */}
              {!finStats.isUniform && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">สรุปตามระดับราคา</p>
                  <div className="overflow-x-auto border border-slate-100 rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-3 py-2 text-left font-medium text-slate-400">ประเภทราคา</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-400">ราคาสุทธิ/ที่นั่ง</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-400">จำนวน PNR</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-400">จำนวนที่นั่ง</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-400">มูลค่ารวม</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceTiers.map((tier, i) => (
                          <tr key={tier.key} className={`border-b border-slate-50 last:border-0 ${i % 2 === 1 ? 'bg-slate-50/40' : ''}`}>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
                                {formatPriceType(tier.priceFormat)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(tier.total, 2)}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{tier.pnrCount}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{tier.seatCount}</td>
                            <td className="px-3 py-2 text-right font-bold text-[#05a94f]">{formatNumber(tier.tierTotal, 2)}</td>
                          </tr>
                        ))}
                        {/* Total row */}
                        <tr className="border-t-2 border-emerald-100 bg-emerald-50/30">
                          <td className="px-3 py-2 font-semibold text-slate-600">รวมทั้งหมด</td>
                          <td className="px-3 py-2 text-right font-bold text-[#05a94f]">{formatNumber(finStats.totalPerSeat, 2)}<span className="font-normal text-slate-400 ml-1">(เฉลี่ย)</span></td>
                          <td className="px-3 py-2 text-right font-bold text-slate-700">{finStats.pnrCount}</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-700">{finStats.totalSeats}</td>
                          <td className="px-3 py-2 text-right font-bold text-amber-700">{formatNumber(finStats.grandTotal, 2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* E: ดูรายละเอียดตาม PNR (always visible) */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowPnrBreakdown(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#05a94f] hover:text-emerald-700 transition"
                >
                  {showPnrBreakdown ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showPnrBreakdown ? 'ซ่อนรายละเอียดตาม PNR' : 'ดูรายละเอียดตาม PNR'}
                </button>
                {showPnrBreakdown && (
                  <div className="mt-2 overflow-x-auto border border-slate-100 rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-3 py-2 text-left font-medium text-slate-400">PNR</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-400">Seat</th>
                          <th className="px-3 py-2 text-center font-medium text-slate-400">ประเภทราคา</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-400">Fare/ที่นั่ง</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-400">Tax/ที่นั่ง</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-400">YQ/ที่นั่ง</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-400">สุทธิ/ที่นั่ง</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-400">มูลค่ารวม PNR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pnrs.filter(p => p.status !== 'Cancelled').map((p, i) => (
                          <tr key={i} className="border-b border-slate-50 last:border-0">
                            <td className="px-3 py-1.5 font-mono text-slate-700">{p.pnrDisplay}</td>
                            <td className="px-3 py-1.5 text-right text-slate-600">{p.seatTotal}</td>
                            <td className="px-3 py-1.5 text-center">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
                                {formatPriceType(p.priceFormat)}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right text-slate-700">{formatNumber(p.fare, 2)}</td>
                            <td className="px-3 py-1.5 text-right">
                              {p.taxType === 'separate'
                                ? <span className="text-slate-700">{formatNumber(p.tax, 2)}</span>
                                : <span className="text-slate-300">ไม่ใช้</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              {p.priceFormat !== 'ALL_IN'
                                ? <span className="text-slate-700">{formatNumber(p.yq ?? 0, 2)}</span>
                                : <span className="text-slate-300">ไม่ใช้</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right font-semibold text-slate-800">{formatNumber(p.total, 2)}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-[#05a94f]">
                              {formatNumber(p.total * p.seatTotal, 2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
