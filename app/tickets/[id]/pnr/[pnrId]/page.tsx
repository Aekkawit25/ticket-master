'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layout/AppLayout'
import {
  getDemoStockById, getDemoStockByCode, saveDemoStock,
  buildPaymentSchedule, deriveScheduleWithTransactions, calcPNRFinancialSummary,
  type DemoStock,
} from '@/lib/demo-storage'
import { getPendingRequests } from '@/lib/financial-requests-storage'
import { getDemoRole, setDemoRole, ALL_USER_ROLES, USER_ROLE_LABELS, type UserRole } from '@/lib/auth'
import {
  buildPnrRow, getConditionTag, getDeadlineInfo, getRowStatusTag,
  getNextPaymentItem, formatDateDMY, formatDateTimeDMY,
} from '@/lib/pnr-display'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge, TicketTypeBadge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, Th, Td, TableRow } from '@/components/ui/table'
import { TonePill } from '@/components/pnr-detail/badges'
import { PnrPaymentPanel } from '@/components/pnr-detail/PnrPaymentPanel'
import { FlightSegmentsCard } from '@/components/pnr-detail/FlightSegmentsCard'
import { ConditionSummaryCard } from '@/components/pnr-detail/ConditionSummaryCard'
import {
  ChevronRight, Download, Pencil, Copy, Check, AlertTriangle, RotateCcw,
  Hash, MapPin, CalendarRange, Users2, ShieldAlert, Clock, CheckCircle2,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import * as XLSX from 'xlsx'

const TABS = ['Summary', 'Allocation', 'Conditions', 'Payment', 'Logs'] as const
type Tab = typeof TABS[number]

const TAB_LABEL: Record<Tab, string> = {
  Summary: 'Summary', Allocation: 'Allocation', Conditions: 'Conditions', Payment: 'Payment', Logs: 'Logs',
}

function SummaryCard({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-col gap-1.5 min-h-[92px]">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-400">{label}</p>
        <span className="text-slate-300">{icon}</span>
      </div>
      {children}
    </div>
  )
}

function AllocationEmptyState() {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">C</span>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">การจัดสรรไปยังกรุ๊ปทัวร์</p>
      </div>
      <div className="bg-slate-50 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-500">ยังไม่มีข้อมูลการจัดสรร</p>
        <p className="text-xs text-slate-400 mt-1">ระบบยังไม่รองรับการเชื่อมโยง PNR กับกรุ๊ปทัวร์ในขณะนี้</p>
      </div>
    </section>
  )
}

export default function PnrDetailPage() {
  return (
    <Suspense fallback={<AppLayout title="กำลังโหลด..."><div className="p-6 text-sm text-slate-400">กำลังโหลด...</div></AppLayout>}>
      <PnrDetailPageInner />
    </Suspense>
  )
}

function PnrDetailPageInner() {
  const params = useParams<{ id: string; pnrId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  // URL ต้นทาง (path + query ของหน้า List PNR ที่พาเข้ามา) — ถูกส่งมาจาก app/pnr/page.tsx
  // ตอนกด "ดูรายละเอียด" เพื่อให้กลับไปพร้อม Search/Filter/Pagination เดิมได้จริง
  const fromUrl = searchParams.get('from')
  const [currentRole, setCurrentRole] = useState<UserRole>(() => getDemoRole())
  const [loading, setLoading] = useState(true)
  const [stock, setStock] = useState<DemoStock | null>(null)
  const [tab, setTab] = useState<Tab>('Summary')
  const [toast, setToast] = useState('')
  const [copied, setCopied] = useState(false)

  const loadStock = () => {
    const found = getDemoStockById(params.id) ?? getDemoStockByCode(params.id)
    setStock(found ?? null)
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, params.pnrId])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleTransactionSave = (updated: DemoStock) => {
    saveDemoStock(updated)
    loadStock()
    showToast('บันทึกสำเร็จ')
  }

  const pnr = stock?.pnrs.find(p => p.pnrId === params.pnrId)
  const row = useMemo(() => (stock && pnr ? buildPnrRow(stock, pnr) : null), [stock, pnr])

  const condition = stock?.conditions.find(sc => sc.condition.conditionCode === row?.conditionCode)?.condition

  const scheduleItems = useMemo(() => {
    if (!stock || !row) return []
    const raw = buildPaymentSchedule(stock).filter(i => i.pnrId === row.pnrId)
    return deriveScheduleWithTransactions(raw, stock.transactions ?? [])
  }, [stock, row])

  const requiredAmount = useMemo(() => {
    if (!row) return 0
    return scheduleItems.reduce((s, i) => s + (i.confirmedAmount ?? i.amount), 0) || row.total
  }, [scheduleItems, row])

  const financialSummary = useMemo(() => {
    if (!stock || !row) return null
    return calcPNRFinancialSummary(row.pnrId, stock.transactions ?? [], requiredAmount, scheduleItems)
  }, [stock, row, requiredAmount, scheduleItems])

  const nextPaymentDue = useMemo(() =>
    getNextPaymentItem(scheduleItems.filter(si => si.paymentStatus !== 'PAID')),
    [scheduleItems])

  const hasPendingReview = useMemo(() =>
    row ? getPendingRequests().some(r => r.pnrId === row.pnrId) : false,
    [row])

  const handleExport = () => {
    if (!row) return
    const data = [{
      'PNR': row.pnrDisplay,
      'Series Code': row.stockCode,
      'Series Name': row.groupName,
      'Ticket Type': row.ticketType,
      'Airline': row.airlineCode,
      'Route': row.routeText,
      'Travel Start': row.travelStart ? formatDateDMY(row.travelStart) : '',
      'Travel End': row.travelEnd ? formatDateDMY(row.travelEnd) : '',
      'Seat Total': row.seatTotal,
      'Seat Used': row.seatUsed,
      'Seat Balance': row.seatBalance,
      'NAME DL': row.ttlDateTime ? formatDateTimeDMY(row.ttlDateTime) : '',
      'Condition': row.conditionCode,
      'Mapping Status': row.mappingStatus,
      'PNR Status': row.status,
      'Currency': row.currency,
      'Fare': row.fare,
      'Tax': row.tax,
      'Total': row.total,
    }]
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PNR')
    XLSX.writeFile(wb, `pnr-${row.pnrDisplay}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const handleCopyPnr = async () => {
    if (!row) return
    try {
      await navigator.clipboard.writeText(row.pnrDisplay)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable — ignore */ }
  }

  // ─── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppLayout title="กำลังโหลด...">
        <div className="space-y-5">
          <div className="h-16 bg-white border border-slate-200 rounded-2xl animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[92px] bg-white border border-slate-200 rounded-xl animate-pulse" />)}
          </div>
          <div className="h-96 bg-white border border-slate-200 rounded-2xl animate-pulse" />
        </div>
      </AppLayout>
    )
  }

  // ─── Not found ─────────────────────────────────────────────────────────
  if (!stock || !pnr || !row) {
    return (
      <AppLayout title="ไม่พบ PNR">
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <AlertTriangle size={28} className="mx-auto text-amber-400 mb-3" />
          <p className="text-sm font-medium text-slate-600 mb-1">ไม่พบข้อมูล PNR ที่ต้องการ</p>
          <p className="text-xs text-slate-400 mb-4">PNR อาจถูกลบ หรือ URL ไม่ถูกต้อง</p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" icon={<RotateCcw size={14} />} onClick={loadStock}>ลองใหม่</Button>
            <Link href={fromUrl || '/pnr'} className="text-xs text-[#0F5EF7] hover:underline px-3 py-2">← กลับไปหน้ารายการ PNR</Link>
          </div>
        </div>
      </AppLayout>
    )
  }

  const deadline = getDeadlineInfo(row.ttlDateTime)
  const conditionTag = getConditionTag(row)
  const statusTag = getRowStatusTag(row, hasPendingReview)
  const outstanding = financialSummary?.outstandingAmount ?? 0

  const issues: string[] = []
  if (!row.conditionCode) issues.push('ยังไม่ได้กำหนด Condition')
  if (deadline?.tone === 'red') issues.push('NAME DL เลยกำหนดแล้ว')
  else if (deadline?.tone === 'orange') issues.push('ใกล้ครบกำหนด NAME DL')
  if (outstanding > 0) issues.push(`มียอดค้างชำระ ${formatCurrency(outstanding, row.currency)}`)

  const seatChartData = row.seatTotal > 0
    ? [
        { name: 'ใช้แล้ว', value: row.seatUsed, color: '#3b82f6' },
        { name: 'คงเหลือ', value: Math.max(row.seatBalance, 0), color: row.seatBalance >= 0 ? '#16a34a' : '#ef4444' },
      ]
    : []

  // แหล่งที่มาจริงของ Breadcrumb — อ่านจาก fromUrl (ไม่ Hardcode): ถ้า path ต้นทางตรงกับหน้า
  // Series Detail ของ stock นี้พอดี ถือว่าเข้ามาจาก Series, นอกนั้นถือว่าเข้ามาจาก List PNR
  // (ครอบคลุมทั้งกรณีเข้าจาก List PNR จริง และกรณีเปิด URL ตรง/ไม่มีต้นทาง ซึ่งใช้ List PNR เป็น fallback)
  const fromPath = fromUrl?.split('?')[0]
  const fromSeries = fromPath === `/tickets/${stock.stockId}`

  return (
    <AppLayout title={`PNR ${row.pnrDisplay}`}>
      {toast && (
        <div className="fixed top-4 right-4 z-[9999] bg-[#05a94f] text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 pointer-events-none">
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}

      {/* Breadcrumb — โครงสร้างสัมพันธ์กับหน้าต้นทางจริง (fromSeries คำนวณจาก fromUrl ไม่ Hardcode) */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3 flex-wrap">
        <Link href="/tickets" className="hover:text-[#0F5EF7]">Stock Ticket</Link>
        <ChevronRight size={12} className="text-slate-300" />
        {fromSeries ? (
          <>
            <Link href="/tickets" className="hover:text-[#0F5EF7]">Series</Link>
            <ChevronRight size={12} className="text-slate-300" />
            <Link href={`/tickets/${stock.stockId}`} className="hover:text-[#0F5EF7] font-mono">{stock.stockCode}</Link>
          </>
        ) : (
          <Link href={fromUrl || '/pnr'} className="hover:text-[#0F5EF7]">List PNR</Link>
        )}
        <ChevronRight size={12} className="text-slate-300" />
        <span className="text-slate-700 font-medium font-mono">{row.pnrDisplay}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-[#0F2557]">ภาพรวม PNR</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={handleExport}>Export</Button>
          <Button variant="outline" size="sm" icon={<Pencil size={14} />} onClick={() => router.push(`/tickets/${stock.stockId}`)}>แก้ไข PNR</Button>
        </div>
      </div>

      {/* Badge strip */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        {row.pnrType === 'dummy' && <Badge variant="orange">Dummy PNR</Badge>}
        {row.pnrType === 'real' && <Badge variant="blue">PNR จริง</Badge>}
        <TicketTypeBadge type={row.ticketType} groupType={row.groupType} />
        <TonePill tone={statusTag.tone}>{statusTag.label}</TonePill>
        {row.airlineCode && <Badge variant="gray">{row.airlineCode}</Badge>}
        {row.routeText && <Badge variant="gray">{row.routeText}</Badge>}
        {row.travelStart && (
          <Badge variant="gray">{formatDateDMY(row.travelStart)} – {formatDateDMY(row.travelEnd)}</Badge>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <SummaryCard label="PNR No." icon={<Hash size={14} />}>
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-slate-800 text-sm truncate">{row.pnrDisplay}</span>
            <button onClick={handleCopyPnr} title="คัดลอก" className="text-slate-300 hover:text-slate-500 flex-shrink-0">
              {copied ? <Check size={13} className="text-[#16a34a]" /> : <Copy size={13} />}
            </button>
          </div>
        </SummaryCard>
        <SummaryCard label="Route" icon={<MapPin size={14} />}>
          <span className="font-mono font-bold text-slate-800 text-sm truncate">{row.routeText || '—'}</span>
        </SummaryCard>
        <SummaryCard label="Travel Period" icon={<CalendarRange size={14} />}>
          <span className="text-sm font-medium text-slate-700 leading-snug">
            {row.travelStart ? `${formatDateDMY(row.travelStart)} – ${formatDateDMY(row.travelEnd)}` : '—'}
          </span>
        </SummaryCard>
        <SummaryCard label="Seat Summary" icon={<Users2 size={14} />}>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-slate-800">{row.seatTotal}</span>
            <span className="text-[10px] text-slate-400">ทั้งหมด</span>
            <span className={cn('text-xs font-semibold ml-1', row.seatBalance > 0 ? 'text-[#16a34a]' : row.seatBalance === 0 ? 'text-orange-500' : 'text-red-600')}>
              เหลือ {row.seatBalance}
            </span>
          </div>
        </SummaryCard>
        <SummaryCard label="Condition Status" icon={<ShieldAlert size={14} />}>
          <TonePill tone={conditionTag.tone}>{conditionTag.label}</TonePill>
        </SummaryCard>
        <SummaryCard label="Next Deadline" icon={<Clock size={14} />}>
          {deadline ? (
            <div>
              <p className="text-sm font-bold text-slate-800 leading-none">{deadline.dateLabel}</p>
              <p className={cn('text-[11px] font-medium mt-0.5', deadline.tone === 'red' ? 'text-red-600' : deadline.tone === 'orange' ? 'text-orange-600' : 'text-emerald-600')}>
                {deadline.relLabel}
              </p>
            </div>
          ) : <span className="text-sm text-slate-400">—</span>}
        </SummaryCard>
      </div>

      {/* Alert Bar */}
      {issues.length > 0 && (
        <div className="flex items-start gap-2.5 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-5">
          <AlertTriangle size={16} className="text-orange-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-orange-700">
            <span className="font-semibold">ต้องตรวจสอบ {issues.length} รายการ:</span> {issues.join(' · ')}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="overflow-x-auto mb-4">
        <div className="flex border-b border-slate-200 min-w-max">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                tab === t ? 'border-[#05a94f] text-[#05a94f]' : 'border-transparent text-slate-500 hover:text-slate-700'
              )}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'Summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left column ~60% */}
          <div className="lg:col-span-3 space-y-4">
            {/* Card A — PNR Information */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">A</span>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">ข้อมูล PNR</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                {[
                  { label: 'PNR', value: row.pnrDisplay },
                  { label: 'Series Code', value: row.stockCode },
                  { label: 'Ticket Type', value: null, badge: <TicketTypeBadge type={row.ticketType} groupType={row.groupType} /> },
                  { label: 'Airline', value: row.airlineCode || '—' },
                  { label: 'Currency', value: row.currency },
                  { label: 'Route', value: row.routeText || '—' },
                  { label: 'Travel Start', value: row.travelStart ? formatDateDMY(row.travelStart) : '—' },
                  { label: 'Travel End', value: row.travelEnd ? formatDateDMY(row.travelEnd) : '—' },
                  { label: 'PNR Status', value: null, badge: <TonePill tone={statusTag.tone}>{statusTag.label}</TonePill> },
                  { label: 'Mapping Status', value: null, badge: <Badge variant={row.mappingStatus === 'Mapped' ? 'green' : row.mappingStatus === 'Partially Mapped' ? 'yellow' : 'gray'}>{row.mappingStatus === 'Mapped' ? 'เชื่อมโยงแล้ว' : row.mappingStatus === 'Partially Mapped' ? 'เชื่อมโยงบางส่วน' : 'ยังไม่เชื่อมโยง'}</Badge> },
                ].map(({ label, value, badge }) => (
                  <div key={label}>
                    <p className="text-[10px] text-slate-400">{label}</p>
                    <div className="mt-0.5">{badge ?? <p className="text-sm font-medium text-slate-700">{value}</p>}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Card B — Flight Segments */}
            <FlightSegmentsCard stock={stock} pnr={pnr} label="B" />

            {/* Card C — Allocation (empty state, no real data source) */}
            <AllocationEmptyState />
          </div>

          {/* Right column ~40% */}
          <div className="lg:col-span-2 space-y-4">
            {/* Card D — Seat summary chart */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">D</span>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">สรุปจำนวนที่นั่ง</p>
              </div>
              {seatChartData.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">ยังไม่มีข้อมูลที่นั่ง</div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-32 h-32 flex-shrink-0 relative">
                    <PieChart width={128} height={128}>
                      <Pie data={seatChartData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={58} paddingAngle={2} strokeWidth={0}>
                        {seatChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => `${formatNumber(Number(v))} ที่นั่ง`} />
                    </PieChart>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-xl font-bold text-slate-800">{row.seatTotal}</span>
                      <span className="text-[10px] text-slate-400">ทั้งหมด</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />ทั้งหมด</span>
                      <span className="font-semibold text-slate-800">{row.seatTotal}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />ใช้แล้ว</span>
                      <span className="font-semibold text-slate-800">{row.seatUsed}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <span className={cn('w-2 h-2 rounded-full inline-block', row.seatBalance >= 0 ? 'bg-[#16a34a]' : 'bg-red-500')} />คงเหลือ
                      </span>
                      <span className={cn('font-semibold', row.seatBalance >= 0 ? 'text-[#16a34a]' : 'text-red-600')}>{row.seatBalance}</span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Card E — Condition & Deadline */}
            <ConditionSummaryCard
              row={row} condition={condition} nextPaymentDue={nextPaymentDue}
              hasOutstanding={outstanding > 0} stockId={stock.stockId} label="E" variant="compact"
            />

            {/* Card F — Fare */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">F</span>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">ต้นทุนต่อที่นั่ง</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Fare', value: row.fare },
                  { label: 'Tax', value: row.tax },
                  { label: 'Total', value: row.total },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-center">
                    <p className="text-[11px] text-slate-400">{label}</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{formatCurrency(value, row.currency)}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Card G — Recent activity */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">G</span>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">ประวัติทำรายการล่าสุด</p>
                </div>
                {stock.logs.length > 0 && (
                  <button onClick={() => setTab('Logs')} className="text-[11px] text-[#0F5EF7] hover:underline">ดูทั้งหมด</button>
                )}
              </div>
              {stock.logs.length === 0 ? (
                <div className="bg-slate-50 rounded-xl p-6 text-center text-xs text-slate-400">ยังไม่มีประวัติรายการ</div>
              ) : (
                <div className="space-y-2">
                  {[...stock.logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6).map((log, i) => (
                    <div key={log.logId ?? i} className="flex items-start justify-between gap-2 text-xs border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                      <div className="min-w-0">
                        <Badge variant="blue" className="mb-0.5">{log.action}</Badge>
                        <p className="text-slate-500 truncate">{log.message}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-slate-400 whitespace-nowrap">{formatDateTimeDMY(log.createdAt)}</p>
                        <p className="text-slate-400">{log.createdBy}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === 'Allocation' && <AllocationEmptyState />}

      {tab === 'Conditions' && (
        <ConditionSummaryCard
          row={row} condition={condition} nextPaymentDue={nextPaymentDue}
          hasOutstanding={outstanding > 0} stockId={stock.stockId} variant="full"
        />
      )}

      {tab === 'Payment' && (
        <PnrPaymentPanel row={row} stock={stock} currentRole={currentRole} onTransactionSave={handleTransactionSave} />
      )}

      {tab === 'Logs' && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {stock.logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">ยังไม่มีประวัติรายการ</div>
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <Th>วันที่/เวลา</Th>
                  <Th>ผู้ใช้</Th>
                  <Th>การดำเนินการ</Th>
                  <Th>รายละเอียด</Th>
                </tr>
              </TableHead>
              <TableBody>
                {[...stock.logs]
                  .filter(l => !l.pnrDisplay || l.pnrDisplay === row.pnrDisplay)
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((log, i) => (
                    <TableRow key={log.logId ?? i}>
                      <Td className="whitespace-nowrap text-slate-500">{formatDateTimeDMY(log.createdAt)}</Td>
                      <Td className="font-medium text-slate-700">{log.createdBy}</Td>
                      <Td><Badge variant="blue">{log.action}</Badge></Td>
                      <Td className="text-slate-600">{log.message}</Td>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}

      {/* Demo role switcher (dev-only, kept from the List PNR page's own control) */}
      <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
        <span>สิทธิ์ (Demo):</span>
        <select
          value={currentRole}
          onChange={e => { const r = e.target.value as UserRole; setCurrentRole(r); setDemoRole(r) }}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-[#05a94f]">
          {ALL_USER_ROLES.map(r => (
            <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>
          ))}
        </select>
      </div>
    </AppLayout>
  )
}
