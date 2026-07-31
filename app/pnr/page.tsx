'use client'

import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { getDemoStocks, saveDemoStock, buildPaymentSchedule, deriveScheduleWithTransactions, calcPNRFinancialSummary, type DemoStock, type DemoLog, type PaymentScheduleItem, type FinancialTransaction, type PNRFinancialSummary, type StageStatus } from '@/lib/demo-storage'
import { formatDate, formatDateTime, formatCurrency, formatNumber, cn, PAYMENT_TYPE_LABELS } from '@/lib/utils'
import { getDemoRole, setDemoRole, USER_ROLE_LABELS, ALL_USER_ROLES, type UserRole } from '@/lib/auth'
import { getPendingRequests } from '@/lib/financial-requests-storage'
import { getCountries } from '@/lib/country-storage'
import {
  type PnrListRow as PNRRow, buildPnrListRows as buildRows, mappingVariant,
  formatDateDMY, formatDateTimeDMY, getDeadlineInfo, getRowStatusTag, getPnrLastUpdate,
  computePaymentStatus,
} from '@/lib/pnr-display'
import { TonePill, formatPaymentMethod, TxTypeBadge, TxStatusBadge, PaymentStatusBadge, TimingStatusBadge, PaymentSummaryCell } from '@/components/pnr-detail/badges'
import { Button } from '@/components/ui/button'
import { Badge, TicketTypeBadge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, Th, Td, TableRow } from '@/components/ui/table'
import { Modal } from '@/components/ui/modal'
import {
  Search, X, Link2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Download, SlidersHorizontal, MoreVertical, RotateCcw, Calendar,
  Globe, Plane, Package,
  CheckCircle2, AlertCircle, AlertTriangle, Hash, Users, CreditCard,
  FileText, Info, ClipboardList,
} from 'lucide-react'
import Link from 'next/link'
import * as XLSX from 'xlsx'

// ─── Types ───────────────────────────────────────────────────────────────────
// หมายเหตุ: PNRRow/buildRows และ helper การนำเสนออื่น ๆ (formatDateDMY, getDeadlineInfo,
// getConditionTag, getRowStatusTag, mappingVariant ฯลฯ) ย้ายไปอยู่ที่ lib/pnr-display.ts
// (import ด้านบนภายใต้ชื่อเดิม) เพื่อใช้ร่วมกับหน้า PNR Detail (app/tickets/[id]/pnr/[pnrId])

interface FilterState {
  ticketType: string
  pnrType: string
  airline: string
  country: string
  status: string
  mappingStatus: string
  seatFilter: string
  travelFrom: string
  travelTo: string
  condition: string
}

const INIT_FILTERS: FilterState = {
  ticketType: '', pnrType: '', airline: '', country: '', status: '',
  mappingStatus: '', seatFilter: '', travelFrom: '', travelTo: '', condition: '',
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
type KpiFilter = 'all' | 'seats' | 'pending' | 'nearDl' | 'notMapped' | 'abnormal'

const FILTER_KEYS = [
  'ticketType', 'pnrType', 'airline', 'country', 'status',
  'mappingStatus', 'seatFilter', 'travelFrom', 'travelTo', 'condition',
] as const satisfies readonly (keyof FilterState)[]

interface ListPnrUrlState {
  search: string
  filters: FilterState
  page: number
  pageSize: number
  kpiFilter: KpiFilter
}

/**
 * แปลงสถานะของหน้า List PNR (search/filter/page/pageSize/kpiFilter) เป็น URL Search Params
 * ใช้เพื่อ sync กับ URL จริง (ไม่ใช่แค่ React state) เพื่อให้ Browser Back/Forward และปุ่ม
 * "กลับไปรายการ PNR" จากหน้า Detail กลับมาพร้อม Search/Filter/Pagination เดิมได้จริง
 */
function buildListSearchParams(state: ListPnrUrlState): URLSearchParams {
  const sp = new URLSearchParams()
  if (state.search) sp.set('q', state.search)
  for (const k of FILTER_KEYS) {
    const v = state.filters[k]
    if (v) sp.set(k, v)
  }
  if (state.kpiFilter !== 'all') sp.set('kpi', state.kpiFilter)
  if (state.page !== 1) sp.set('page', String(state.page))
  if (state.pageSize !== 20) sp.set('pageSize', String(state.pageSize))
  return sp
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function NameDlCell({ ttlDateTime }: { ttlDateTime: string | null }) {
  const info = getDeadlineInfo(ttlDateTime)
  if (!info) return <span className="text-xs text-slate-400">—</span>
  const toneText = info.tone === 'red' ? 'text-red-600' : info.tone === 'orange' ? 'text-orange-600' : 'text-emerald-600'
  return (
    <div className="whitespace-nowrap leading-tight">
      <p className="text-xs font-medium text-slate-700">{info.dateLabel}</p>
      <p className={cn('text-[11px] font-medium', toneText)}>{info.relLabel}</p>
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: number
  unit: string
  icon: React.ReactNode
  color: string
  active: boolean
  clickable: boolean
  onClick?: () => void
}

/** KPI Card แบบวงกลมไอคอนซ้าย + Active state — แทนที่ StatCard เดิม (กล่องสีตันมุมขวา) เฉพาะหน้านี้ */
function KpiCard({ label, value, unit, icon, color, active, clickable, onClick }: KpiCardProps) {
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? onClick : undefined}
      className={cn(
        'text-left bg-white rounded-2xl border p-4 shadow-sm flex items-center gap-3 h-full transition-colors',
        clickable ? 'cursor-pointer hover:border-slate-300' : 'cursor-default',
        active ? 'ring-1' : 'border-slate-200'
      )}
      style={active ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : undefined}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}1A`, color }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-slate-800 leading-tight">{formatNumber(value)}</p>
        <p className="text-[11px] text-slate-400">{unit}</p>
      </div>
      {clickable && <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />}
    </button>
  )
}

interface RowActionsMenuProps {
  onView: () => void
  onCreateRequisition: () => void
  onEdit: () => void
  onReplaceDummy?: () => void
}

/** เมนู Action แบบจุดสามจุด (แทนไอคอนกระจาย) — ใช้ Action เดิมทั้งหมด, render ผ่าน Portal กัน overflow ตัด */
function RowActionsMenu({ onView, onCreateRequisition, onEdit, onReplaceDummy }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number; openUp: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const close = () => { setOpen(false); setPos(null) }
  const toggle = () => {
    if (open) { close(); return }
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    const openUp = window.innerHeight - rect.bottom < 220
    setPos({ top: openUp ? rect.top - 4 : rect.bottom + 4, right: window.innerWidth - rect.right, openUp })
    setOpen(true)
  }

  const items: { label: string; onClick: () => void }[] = [
    { label: 'ดูรายละเอียด', onClick: onView },
    { label: 'สร้างใบเบิก', onClick: onCreateRequisition },
    { label: 'แก้ไขใน Ticket Stock', onClick: onEdit },
  ]
  if (onReplaceDummy) items.push({ label: 'เปลี่ยน Dummy PNR', onClick: onReplaceDummy })

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="ตัวเลือกเพิ่มเติม"
        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700"
      >
        <MoreVertical size={16} />
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[999]" onClick={close} />
          <div
            className="fixed z-[1000] bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-[180px]"
            style={pos.openUp ? { bottom: window.innerHeight - pos.top, right: pos.right } : { top: pos.top, right: pos.right }}
          >
            {items.map(item => (
              <button
                key={item.label}
                onClick={() => { item.onClick(); close() }}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

interface PaymentDrawerState {
  pnrDisplay: string
  currency: string
  summary: PNRFinancialSummary
  transactions: FinancialTransaction[]
  scheduleItems: PaymentScheduleItem[]
}

function PaymentDrawer({ state, onClose }: { state: PaymentDrawerState | null; onClose: () => void }) {
  const [tab, setTab] = useState<'summary' | 'history'>('summary')
  if (!state) return null
  const { pnrDisplay, currency, summary, transactions, scheduleItems } = state

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#05a94f]/10 flex items-center justify-center flex-shrink-0">
              <CreditCard size={16} className="text-[#05a94f]" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-base">Payment & Transactions</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">{pnrDisplay}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-5 flex-shrink-0">
          {(['summary', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                'text-xs font-medium px-4 py-2.5 border-b-2 -mb-px transition-colors',
                tab === t ? 'border-[#05a94f] text-[#05a94f]' : 'border-transparent text-slate-500 hover:text-slate-700'
              )}>
              {t === 'summary' ? 'สรุป / Schedule' : `Transaction (${transactions.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'summary' && (
            <div className="space-y-4">
              {/* Financial Summary Grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'ยอดที่ต้องชำระ', value: summary.requiredAmount,    cls: 'text-slate-700' },
                  { label: 'ชำระแล้ว',        value: summary.paidAmount,        cls: 'text-[#05a94f]' },
                  { label: 'ได้รับเงินคืน',   value: summary.refundAmount,      cls: 'text-blue-600' },
                  { label: 'ถูกยึด',           value: summary.forfeitedAmount,   cls: 'text-orange-600' },
                  { label: 'ยอดค้างชำระ',     value: summary.outstandingAmount, cls: summary.outstandingAmount > 0 ? 'text-amber-600' : 'text-slate-400' },
                  { label: 'ยอดจ่ายสุทธิ',   value: summary.netCashPaid,       cls: 'text-slate-800 font-bold' },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
                    <p className={`text-sm ${cls}`}>{formatCurrency(value, currency)}</p>
                  </div>
                ))}
              </div>

              {/* Payment Schedule */}
              {scheduleItems.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Payment Schedule</p>
                  <div className="space-y-2">
                    {scheduleItems.map((si, i) => {
                      return (
                        <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                          {/* Stage name + badge */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="text-xs font-semibold text-slate-800 leading-snug">{si.stageName}</span>
                            <div className="shrink-0 mt-0.5 flex gap-1">
                              <PaymentStatusBadge status={si.paymentStatus} />
                              <TimingStatusBadge status={si.timingStatus} days={si.lateDays ?? si.overdueDays} />
                            </div>
                          </div>
                          {/* Amount + Due date */}
                          <div className="flex items-center gap-4 text-[11px] text-slate-500">
                            <span>
                              <span className="text-slate-400">ยอด: </span>
                              <span className="font-semibold text-slate-700">
                                {si.amountType === 'Percent' ? `${si.amount}%` : formatCurrency(si.amount, currency)}
                              </span>
                            </span>
                            {si.ttlDatetime && (
                              <span>
                                <span className="text-slate-400">ครบกำหนด: </span>
                                <span className={`font-medium ${si.timingStatus === 'OVERDUE' || si.timingStatus === 'PAID_LATE' ? 'text-red-500' : 'text-slate-700'}`}>
                                  {formatDateTime(si.ttlDatetime)}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            transactions.length === 0
              ? <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <CreditCard size={32} className="opacity-30" />
                  <p>ยังไม่มี Transaction</p>
                </div>
              : <div className="space-y-2">
                  {transactions.map(tx => (
                    <div key={tx.transactionId} className="border border-slate-200 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <TxTypeBadge type={tx.transactionType} />
                          <span className="text-sm font-bold text-slate-800">{formatCurrency(tx.amount, tx.currencyCode)}</span>
                          {tx.paymentMethod && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-px rounded-full">{formatPaymentMethod(tx)}</span>
                          )}
                        </div>
                        <TxStatusBadge type={tx.transactionType} status={tx.status} />
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                        <span className="text-slate-400">วันที่: <span className="text-slate-600">{tx.paymentDateTime ? formatDateTime(tx.paymentDateTime) : formatDate(tx.transactionDate)}</span></span>
                        {tx.feeAmount > 0 && <span className="text-slate-400">ค่าธรรมเนียม: <span className="text-slate-600">{formatCurrency(tx.feeAmount, tx.currencyCode)}</span></span>}
                        {tx.referenceNo && <span className="text-slate-400">Ref: <span className="text-slate-600">{tx.referenceNo}</span></span>}
                        {tx.creditNoteNo && <span className="text-slate-400">Credit Note: <span className="text-slate-600">{tx.creditNoteNo}</span></span>}
                        {tx.reasonCode && <span className="text-slate-400">Reason: <span className="text-slate-600">{tx.reasonCode}</span></span>}
                        {tx.createdBy && <span className="text-slate-400">By: <span className="text-slate-600">{tx.createdBy}</span></span>}
                      </div>
                      {tx.remark && <p className="text-[11px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-100">{tx.remark}</p>}
                    </div>
                  ))}
                </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Role Switcher (Demo only) ────────────────────────────────────────────────

function RoleSwitcher({ currentRole, onChange }: { currentRole: UserRole; onChange: (r: UserRole) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-400 whitespace-nowrap">สิทธิ์ (Demo):</span>
      <select
        value={currentRole}
        onChange={e => onChange(e.target.value as UserRole)}
        className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#05a94f]">
        {ALL_USER_ROLES.map(r => (
          <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Requisition Modal ────────────────────────────────────────────────────────

const BANK_OPTIONS = [
  'ธนาคารกรุงเทพ (BBL)',
  'ธนาคารกสิกรไทย (KBANK)',
  'ธนาคารไทยพาณิชย์ (SCB)',
  'ธนาคารกรุงไทย (KTB)',
  'ธนาคารกรุงศรีอยุธยา (BAY)',
  'ธนาคารทหารไทยธนชาต (TTB)',
  'ธนาคารออมสิน (GSB)',
  'ธนาคารอาคารสงเคราะห์ (GHB)',
]

const INIT_REQ_FORM = {
  stageId: '',
  payeeName: '',
  bankName: '',
  accountNo: '',
  branch: '',
  remark: '',
}

function RequisitionModal({
  row, stock, scheduleItems, open, onClose, onSave,
}: {
  row: PNRRow | null
  stock: DemoStock | null
  scheduleItems: PaymentScheduleItem[]
  open: boolean
  onClose: () => void
  onSave: (updated: DemoStock) => void
}) {
  const [form, setForm] = useState({ ...INIT_REQ_FORM })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const resetReqForm = () => { setForm({ ...INIT_REQ_FORM }); setError(''); setSaving(false) }

  if (!row || !stock) return null

  // Stages eligible for requisition: not yet REQUESTED/PARTIALLY_PAID/PAID/ADJUSTED
  const DONE_STATUSES = ['REQUESTED', 'PARTIALLY_PAID', 'PAID', 'ADJUSTED']
  const eligibleStages = scheduleItems.filter(s => {
    if (!s.stageStatus) return true  // legacy stage, always eligible
    return !DONE_STATUSES.includes(s.stageStatus)
  })

  const selectedStage = scheduleItems.find(s => s.stageId === form.stageId)

  const handleSubmit = () => {
    if (!form.stageId) { setError('กรุณาเลือกรอบชำระ'); return }
    if (!form.payeeName.trim()) { setError('กรุณาระบุชื่อบัญชีผู้รับเงิน'); return }
    if (!form.bankName) { setError('กรุณาเลือกธนาคาร'); return }
    if (!form.accountNo.trim()) { setError('กรุณาระบุเลขที่บัญชี'); return }
    setSaving(true)

    const now = new Date().toISOString()
    const reqId = `REQ-${Date.now().toString(36).toUpperCase()}`

    const updatedPnrs = stock.pnrs.map(p => {
      if (p.pnrId !== row.pnrId) return p
      const snapshots = { ...(p.stageSnapshots ?? {}) }
      if (snapshots[form.stageId]) {
        snapshots[form.stageId] = { ...snapshots[form.stageId], stageStatus: 'REQUESTED' as StageStatus }
      }
      return { ...p, stageSnapshots: snapshots }
    })

    const newLog: DemoLog = {
      logId: `LOG-${Date.now()}`,
      action: 'REQUISITION_CREATED',
      message: `สร้างใบเบิก ${reqId} — ${selectedStage?.stageName ?? form.stageId} | ยอด ${selectedStage ? formatCurrency(selectedStage.confirmedAmount ?? selectedStage.amount, row.currency) : ''} | โอนไป ${form.payeeName} ${form.bankName} ${form.accountNo}${form.remark ? ` | หมายเหตุ: ${form.remark}` : ''}`,
      createdAt: now,
      createdBy: 'Admin',
    }

    const updated: DemoStock = {
      ...stock,
      pnrs: updatedPnrs,
      logs: [...(stock.logs ?? []), newLog],
    }

    onSave(updated)
    resetReqForm()
    onClose()
  }

  const handleReqClose = () => { resetReqForm(); onClose() }

  return (
    <Modal
      open={open}
      onClose={handleReqClose}
      title="สร้างใบเบิก"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button
            variant="primary"
            icon={<FileText size={14} />}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'กำลังสร้าง...' : 'สร้างใบเบิก'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* PNR Info */}
        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200">
          <span className="font-mono text-sm font-bold text-slate-800">{row.pnrDisplay}</span>
          {row.pnrType === 'dummy' && (
            <span className="px-1.5 py-px text-[10px] rounded-full font-medium bg-amber-100 text-amber-700">Dummy</span>
          )}
          <span className="text-xs text-slate-500">{row.routeText}</span>
          {row.travelStart && (
            <span className="text-xs text-slate-400">
              {formatDate(row.travelStart)}{row.travelEnd ? ` – ${formatDate(row.travelEnd)}` : ''}
            </span>
          )}
          <span className="text-xs text-slate-400">{row.seatTotal} ที่นั่ง</span>
        </div>

        {/* Stage Selector */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-700">
            รอบชำระที่ต้องการเบิก <span className="text-red-500">*</span>
          </label>

          {eligibleStages.length === 0 ? (
            <div className="flex items-start gap-2 px-3 py-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-700">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>ไม่มีรอบชำระที่พร้อมสร้างใบเบิก — กรุณาล็อกยอดชำระก่อนในหน้า Payment Schedule</span>
            </div>
          ) : (
            <div className="space-y-2">
              {eligibleStages.map(s => {
                const isSelected = form.stageId === s.stageId
                const needsLock = s.amountMode && s.stageStatus === 'ESTIMATED'
                return (
                  <button
                    key={s.stageId}
                    type="button"
                    disabled={!!needsLock}
                    onClick={() => { setForm(f => ({ ...f, stageId: s.stageId })); setError('') }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                      needsLock
                        ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                        : isSelected
                        ? 'border-[#05a94f] bg-[#05a94f]/5 ring-1 ring-[#05a94f]/20'
                        : 'border-slate-200 bg-white hover:border-[#05a94f]/40 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                          isSelected ? 'border-[#05a94f] bg-[#05a94f]' : 'border-slate-300'
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className={`text-sm font-medium truncate ${isSelected ? 'text-[#05a94f]' : 'text-slate-800'}`}>
                          {s.stageName}
                        </span>
                        {s.paymentType && (
                          <span className="text-[10px] px-1.5 py-px rounded-full bg-slate-100 text-slate-500 shrink-0">
                            {PAYMENT_TYPE_LABELS[s.paymentType] ?? s.paymentType}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-slate-800">
                          {formatCurrency(s.confirmedAmount ?? s.amount, row.currency)}
                        </div>
                        {s.ttlDatetime && (
                          <div className={`text-[10px] ${computePaymentStatus(s.ttlDatetime) === 'Overdue' ? 'text-red-500' : 'text-slate-400'}`}>
                            ครบกำหนด {formatDate(s.ttlDatetime)}
                          </div>
                        )}
                      </div>
                    </div>
                    {needsLock && (
                      <p className="text-[10px] text-amber-600 mt-1 ml-6">ยังไม่ล็อกยอด — ต้องล็อกก่อนจึงสร้างใบเบิกได้</p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Bank Details */}
        {form.stageId && (
          <div className="space-y-3 pt-1">
            <p className="text-sm font-semibold text-slate-700">ข้อมูลบัญชีปลายทาง</p>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">
                ชื่อบัญชีผู้รับเงิน <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.payeeName}
                onChange={e => { setForm(f => ({ ...f, payeeName: e.target.value })); setError('') }}
                placeholder="เช่น บริษัท XX Airlines Co., Ltd."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">
                  ธนาคาร <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.bankName}
                  onChange={e => { setForm(f => ({ ...f, bankName: e.target.value })); setError('') }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
                >
                  <option value="">เลือกธนาคาร</option>
                  {BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">
                  เลขที่บัญชี <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.accountNo}
                  onChange={e => { setForm(f => ({ ...f, accountNo: e.target.value })); setError('') }}
                  placeholder="XXX-X-XXXXX-X"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">สาขา</label>
              <input
                type="text"
                value={form.branch}
                onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                placeholder="เช่น สาขาสุวรรณภูมิ (ไม่บังคับ)"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">หมายเหตุ</label>
              <textarea
                rows={2}
                value={form.remark}
                onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
                placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
              />
            </div>
          </div>
        )}

        {/* Summary row */}
        {selectedStage && (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#05a94f]/5 border border-[#05a94f]/20">
            <div>
              <p className="text-[11px] text-slate-500 mb-0.5">ยอดที่จะเบิก</p>
              <p className="text-lg font-bold text-[#05a94f]">
                {formatCurrency(selectedStage.confirmedAmount ?? selectedStage.amount, row.currency)}
              </p>
            </div>
            {selectedStage.ttlDatetime && (
              <div className="text-right">
                <p className="text-[11px] text-slate-500 mb-0.5">วันครบกำหนด</p>
                <p className={`text-sm font-semibold ${computePaymentStatus(selectedStage.ttlDatetime) === 'Overdue' ? 'text-red-500' : 'text-slate-700'}`}>
                  {formatDate(selectedStage.ttlDatetime)}
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1.5">
            <AlertCircle size={12} /> {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

// ─── Replace Dummy Modal ──────────────────────────────────────────────────────

function ReplaceDummyModal({
  row, allRows, open, onClose, onSave,
}: {
  row: PNRRow | null
  allRows: PNRRow[]
  open: boolean
  onClose: () => void
  onSave: (pnrId: string, stockId: string, newCode: string) => Promise<void>
}) {
  const [newPnr, setNewPnr] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const resetReplaceForm = () => { setNewPnr(''); setError('') }

  const validate = (code: string): string => {
    if (!code) return 'กรุณากรอก PNR ใหม่'
    if (code.length < 6) return 'PNR ต้องมีอย่างน้อย 6 ตัวอักษร'
    const dup = allRows.find(r =>
      r.pnrType === 'real' && r.pnrCode.toUpperCase() === code && r.pnrId !== row?.pnrId
    )
    if (dup) return `PNR "${code}" ซ้ำกับรายการ ${dup.stockCode} (${dup.pnrDisplay})`
    return ''
  }

  const handleSave = async () => {
    const code = newPnr.trim().toUpperCase()
    const err = validate(code)
    if (err) { setError(err); return }
    setSaving(true)
    try {
      await onSave(row!.pnrId, row!.stockId, code)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleReplaceClose = () => { resetReplaceForm(); onClose() }

  return (
    <Modal
      open={open}
      onClose={handleReplaceClose}
      title="เปลี่ยน Dummy PNR เป็น PNR"
      size="sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleReplaceClose}>ยกเลิก</Button>
          <Button size="sm" onClick={handleSave} loading={saving}>บันทึก</Button>
        </>
      }
    >
      {row && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-sm font-medium text-amber-800">Dummy PNR เดิม: <span className="font-mono">{row.dummyPnr || row.pnrDisplay}</span></p>
            <p className="text-xs text-amber-600 mt-1">{row.stockCode} — {row.groupName}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              PNR ใหม่ <span className="text-red-500">*</span>
            </label>
            <input
              value={newPnr}
              onChange={e => { setNewPnr(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="เช่น ABC123"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#05a94f]"
            />
            {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
          </div>
          <p className="text-xs text-slate-500">ระบบจะตรวจสอบ PNR ซ้ำจากทุก Ticket Type ก่อนบันทึก Dummy PNR เดิมจะยังเก็บไว้ใน History</p>
        </div>
      )}
    </Modal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ListPNRPage() {
  return (
    <Suspense fallback={<AppLayout title="List PNR"><div className="p-6 text-sm text-slate-400">กำลังโหลด...</div></AppLayout>}>
      <ListPNRPageInner />
    </Suspense>
  )
}

function ListPNRPageInner() {
  const router = useRouter()
  const pathname = usePathname()
  const initialSearchParams = useSearchParams()
  const [currentRole, setCurrentRole] = useState<UserRole>(() => getDemoRole())

  const handleRoleChange = (role: UserRole) => {
    setCurrentRole(role)
    setDemoRole(role)
  }

  const [stocks, setStocks] = useState<DemoStock[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // ค่าเริ่มต้นอ่านจาก URL Search Params เสมอ (รองรับ Refresh, เปิด URL ตรง และ Back/Forward
  // ที่ landing บน /pnr พร้อม query string ที่ต่างกัน)
  const [search, setSearch] = useState(() => initialSearchParams.get('q') ?? '')
  const [filters, setFilters] = useState<FilterState>(() => {
    const f = { ...INIT_FILTERS }
    for (const k of FILTER_KEYS) {
      const v = initialSearchParams.get(k)
      if (v) f[k] = v
    }
    return f
  })
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>(() => {
    const k = initialSearchParams.get('kpi')
    const valid: KpiFilter[] = ['all', 'seats', 'pending', 'nearDl', 'notMapped', 'abnormal']
    return valid.includes(k as KpiFilter) ? (k as KpiFilter) : 'all'
  })
  const [showFilter, setShowFilter] = useState(false)
  const [page, setPage] = useState(() => {
    const p = Number(initialSearchParams.get('page'))
    return Number.isFinite(p) && p > 0 ? p : 1
  })
  const [pageSize, setPageSize] = useState<number>(() => {
    const ps = Number(initialSearchParams.get('pageSize'))
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(ps) ? ps : 20
  })
  const [replaceRow, setReplaceRow] = useState<PNRRow | null>(null)
  const [paymentDrawer, setPaymentDrawer] = useState<PaymentDrawerState | null>(null)
  const [requisitionRow, setRequisitionRow] = useState<PNRRow | null>(null)
  const [toast, setToast] = useState('')

  const loadStocks = () => {
    try {
      setLoadError(null)
      setStocks(getDemoStocks())
    } catch (err) {
      console.error('โหลดข้อมูล List PNR ล้มเหลว', err)
      setLoadError('ไม่สามารถโหลดข้อมูล PNR ได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStocks()
  }, [])

  // Sync search/filter/page/pageSize/kpiFilter ไปยัง URL จริงเสมอ (router.replace เพื่อไม่ให้
  // ทุกครั้งที่พิมพ์/เปลี่ยน filter เพิ่ม History entry ใหม่) — เพื่อให้ Browser Back/Forward และ
  // ปุ่ม "กลับไปรายการ PNR" จากหน้า Detail restore ค่าที่เคยเลือกไว้ได้จริง แทนที่จะรีเซ็ต
  useEffect(() => {
    const qs = buildListSearchParams({ search, filters, page, pageSize, kpiFilter }).toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filters, page, pageSize, kpiFilter])

  const allRows = useMemo(() => buildRows(stocks), [stocks])

  const paymentMap = useMemo(() => {
    const map: Record<string, PaymentScheduleItem[]> = {}
    for (const stock of stocks) {
      const raw = buildPaymentSchedule(stock)
      const derived = deriveScheduleWithTransactions(raw, stock.transactions ?? [])
      for (const item of derived) {
        if (!map[item.pnrId]) map[item.pnrId] = []
        map[item.pnrId].push(item)
      }
    }
    return map
  }, [stocks])

  const transactionMap = useMemo(() => {
    const map: Record<string, FinancialTransaction[]> = {}
    for (const stock of stocks) {
      for (const tx of (stock.transactions ?? [])) {
        if (!map[tx.pnrId]) map[tx.pnrId] = []
        map[tx.pnrId].push(tx)
      }
    }
    return map
  }, [stocks])

  const financialSummaryMap = useMemo(() => {
    const map: Record<string, PNRFinancialSummary> = {}
    for (const pnr of allRows) {
      const schedule = paymentMap[pnr.pnrId] ?? []
      const required = schedule.reduce((s, i) => s + i.amount, 0) || pnr.total
      map[pnr.pnrId] = calcPNRFinancialSummary(pnr.pnrId, transactionMap[pnr.pnrId] ?? [], required)
    }
    return map
  }, [allRows, paymentMap, transactionMap])

  // อัปเดตล่าสุด/โดยใคร — มาจาก log จริงของ Series (ผูกกับ pnrDisplay ถ้ามี ไม่งั้น fallback เป็น log ล่าสุดของ Series)
  const lastUpdateMap = useMemo(() => {
    const map: Record<string, { at: string; by: string } | null> = {}
    for (const s of stocks) {
      for (const p of s.pnrs) map[p.pnrId] = getPnrLastUpdate(s, p.pnrDisplay)
    }
    return map
  }, [stocks])

  const lastDataUpdate = useMemo(() => {
    let latest: string | null = null
    for (const v of Object.values(lastUpdateMap)) {
      if (v && (!latest || new Date(v.at) > new Date(latest))) latest = v.at
    }
    return latest
  }, [lastUpdateMap])

  // รายการรอตรวจสอบจริงจากระบบใบเบิก/คำขอการเงิน (PENDING_ACCOUNTING_REVIEW / PENDING_MANAGER_APPROVAL)
  // รีเฟรชพร้อมกับ stocks (หลังบันทึก Transaction/ใบเบิก) — เพียงพอสำหรับหน้ารายการนี้
  const pendingReviewPnrIds = useMemo(() => new Set(getPendingRequests().map(r => r.pnrId)), [stocks])

  const countryNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const c of getCountries()) map[c.countryCode] = c.displayName || c.countryName
    return map
  }, [])

  const airlines = useMemo(() =>
    [...new Set(allRows.map(r => r.airlineCode).filter(Boolean))].sort(), [allRows])
  const conditions = useMemo(() =>
    [...new Set(allRows.map(r => r.conditionCode).filter(Boolean))].sort(), [allRows])
  const countryOptions = useMemo(() =>
    [...new Set(allRows.map(r => r.countryId).filter(Boolean))].sort(), [allRows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return allRows.filter(r => {
      if (q) {
        const haystack = [r.pnrDisplay, r.dummyPnr, r.pnrCode, r.stockCode, r.groupName, r.airlineCode, r.routeText]
          .map(v => (v || '').toLowerCase())
        if (!haystack.some(s => s.includes(q))) return false
      }
      if (filters.ticketType && r.ticketType !== filters.ticketType) return false
      if (filters.pnrType && r.pnrType !== filters.pnrType) return false
      if (filters.airline && r.airlineCode !== filters.airline) return false
      if (filters.country && r.countryId !== filters.country) return false
      if (filters.status && r.status !== filters.status) return false
      if (filters.mappingStatus && r.mappingStatus !== filters.mappingStatus) return false
      if (filters.condition && r.conditionCode !== filters.condition) return false
      if (filters.seatFilter === 'available' && r.available <= 0) return false
      if (filters.seatFilter === 'full' && r.available > 0) return false
      if (filters.travelFrom && r.travelStart && r.travelStart < filters.travelFrom) return false
      if (filters.travelTo && r.travelEnd && r.travelEnd > filters.travelTo) return false
      if (kpiFilter === 'seats' && r.available <= 0) return false
      if (kpiFilter === 'pending' && !pendingReviewPnrIds.has(r.pnrId)) return false
      if (kpiFilter === 'nearDl') {
        const dl = getDeadlineInfo(r.ttlDateTime)
        if (!dl || dl.tone === 'green') return false
      }
      if (kpiFilter === 'notMapped' && r.mappingStatus !== 'Not Mapped') return false
      if (kpiFilter === 'abnormal' && r.available >= 0) return false
      return true
    })
  }, [allRows, search, filters, kpiFilter, pendingReviewPnrIds])

  // KPI ทุกตัวคำนวณจาก allRows จริง (ไม่ Hardcode) — ดู lib/pnr KPI helpers ด้านบนสำหรับที่มาของแต่ละค่า
  const kpiCounts = useMemo(() => {
    let seatsRemaining = 0
    let nearDl = 0
    let abnormal = 0
    let pending = 0
    for (const r of allRows) {
      seatsRemaining += r.available
      const dl = getDeadlineInfo(r.ttlDateTime)
      if (dl && dl.tone !== 'green') nearDl++
      if (r.available < 0) abnormal++
      if (pendingReviewPnrIds.has(r.pnrId)) pending++
    }
    return {
      total: allRows.length,
      seatsRemaining,
      pending,
      nearDl,
      notMapped: allRows.filter(r => r.mappingStatus === 'Not Mapped').length,
      abnormal,
    }
  }, [allRows, pendingReviewPnrIds])

  // Footer สรุปผล — อิงตามผลลัพธ์ที่กรองแล้ว (filtered) เสมอ ไม่ใช่ allRows
  const footerTotals = useMemo(() => ({
    count: filtered.length,
    seatTotal: filtered.reduce((s, r) => s + r.seatTotal, 0),
    seatUsed: filtered.reduce((s, r) => s + r.seatUsed, 0),
    seatBalance: filtered.reduce((s, r) => s + r.seatBalance, 0),
  }), [filtered])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleView = (row: PNRRow) => {
    // ส่ง URL ต้นทาง (path + query ปัจจุบันของหน้า List PNR) ไปกับ Detail
    // เพื่อให้ปุ่ม "กลับไปรายการ PNR" ในหน้า Detail กลับมาพร้อม Search/Filter/Pagination เดิม
    const qs = buildListSearchParams({ search, filters, page, pageSize, kpiFilter }).toString()
    const from = qs ? `${pathname}?${qs}` : pathname
    router.push(`/tickets/${row.stockId}/pnr/${row.pnrId}?from=${encodeURIComponent(from)}`)
  }

  const handleEdit = (row: PNRRow) => {
    router.push(`/tickets/${row.stockId}`)
  }

  const handleReplaceSave = async (pnrId: string, stockId: string, newCode: string) => {
    const stock = stocks.find(s => s.stockId === stockId)
    if (!stock) return
    const updated: DemoStock = {
      ...stock,
      pnrs: stock.pnrs.map(p =>
        p.pnrId === pnrId
          ? { ...p, pnrCode: newCode, pnrType: 'real', pnrDisplay: newCode }
          : p
      ),
    }
    saveDemoStock(updated)
    const fresh = getDemoStocks()
    setStocks(fresh)
    showToast('เปลี่ยน PNR สำเร็จ')
  }

  const handleRequisitionSave = (updated: DemoStock) => {
    saveDemoStock(updated)
    const fresh = getDemoStocks()
    setStocks(fresh)
    showToast('สร้างใบเบิกสำเร็จ')
  }

  const handleExport = () => {
    const data = filtered.map(r => ({
      'PNR': r.pnrDisplay,
      'Dummy PNR': r.dummyPnr || '',
      'PNR Type': r.pnrType === 'real' ? 'PNR' : 'Dummy PNR',
      'Series Code': r.stockCode,
      'Series Name': r.groupName,
      'Ticket Type': r.ticketType,
      'Country': countryNameMap[r.countryId] ?? r.countryId,
      'Airline': r.airlineCode,
      'Route': r.routeText,
      'Travel Start': r.travelStart ? formatDate(r.travelStart) : '',
      'Travel End': r.travelEnd ? formatDate(r.travelEnd) : '',
      'Seat Used': r.seatUsed,
      'Seat Total': r.seatTotal,
      'Available': r.available,
      'Condition': r.conditionCode,
      'NAME DL': r.ttlDateTime ? formatDateTime(r.ttlDateTime) : '',
      'Program Count': r.programCount,
      'Mapping Status': r.mappingStatus,
      'PNR Status': r.status,
      'Currency': r.currency,
      'Fare': r.fare,
      'Tax': r.tax,
      'Total': r.total,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'List PNR')
    XLSX.writeFile(wb, `list-pnr-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const setFilter = <K extends keyof FilterState>(key: K, value: string) => {
    setFilters(f => ({ ...f, [key]: value }))
    setPage(1)
  }

  const setKpi = (k: KpiFilter) => {
    setKpiFilter(prev => (prev === k ? 'all' : k))
    setPage(1)
  }

  const hasActiveFilter = !!search || Object.values(filters).some(v => v)
  const activeFilterCount = Object.values(filters).filter(v => v).length + (kpiFilter !== 'all' ? 1 : 0)
  const clearAll = () => { setSearch(''); setFilters(INIT_FILTERS); setKpiFilter('all'); setPage(1) }

  // Build pagination items
  const paginationItems = useMemo(() => {
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
      .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
    const items: React.ReactNode[] = []
    for (let idx = 0; idx < pages.length; idx++) {
      if (idx > 0 && pages[idx - 1] !== pages[idx] - 1) {
        items.push(<span key={`e-${pages[idx]}`} className="text-slate-400 text-sm px-1">...</span>)
      }
      const p = pages[idx]
      items.push(
        <button
          key={p}
          onClick={() => setPage(p)}
          className={cn(
            'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
            p === page ? 'bg-[#0F5EF7] text-white' : 'hover:bg-slate-100 text-slate-600'
          )}
        >{p}</button>
      )
    }
    return items
  }, [totalPages, page])

  const selectClass = 'w-full text-sm border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F5EF7]'
  const TABLE_COLS = 14

  return (
    <AppLayout title="List PNR">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[9999] bg-[#05a94f] text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 pointer-events-none">
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}

      {/* Replace Dummy Modal */}
      <ReplaceDummyModal
        row={replaceRow}
        allRows={allRows}
        open={!!replaceRow}
        onClose={() => setReplaceRow(null)}
        onSave={handleReplaceSave}
      />

      {/* Requisition Modal */}
      <RequisitionModal
        row={requisitionRow}
        stock={requisitionRow ? (stocks.find(s => s.stockId === requisitionRow.stockId) ?? null) : null}
        scheduleItems={requisitionRow ? (paymentMap[requisitionRow.pnrId] ?? []) : []}
        open={!!requisitionRow}
        onClose={() => setRequisitionRow(null)}
        onSave={handleRequisitionSave}
      />

      {/* Payment Drawer */}
      <PaymentDrawer state={paymentDrawer} onClose={() => setPaymentDrawer(null)} />

      {/* Page Header: ไอคอน + ชื่อหน้า + เมนูลัด (เฉพาะเมนูที่มีอยู่จริงในระบบ) */}
      <div className="bg-white border border-slate-200 rounded-2xl px-4 sm:px-5 py-3.5 mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 justify-between min-h-[72px]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <ClipboardList size={20} className="text-[#0F5EF7]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F2557]">รายการ PNR</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          <Link href="/settings/countries"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-[#0F5EF7] px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
            <Globe size={16} className="text-[#0F5EF7]" /> กำหนดประเทศ
          </Link>
          <Link href="/settings/airlines"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-[#0F5EF7] px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
            <Plane size={16} className="text-[#0F5EF7]" /> กำหนดสายการบิน
          </Link>
          <Link href="/tickets"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-[#0F5EF7] px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
            <Package size={16} className="text-[#0F5EF7]" /> ดูสต็อก PNR
          </Link>
          <div className="w-px h-5 bg-slate-200 mx-1 hidden sm:block" />
          <RoleSwitcher currentRole={currentRole} onChange={handleRoleChange} />
        </div>
      </div>

      {/* KPI Summary Cards — ทุกค่าคำนวณจาก allRows จริง ไม่ Hardcode, กดเพื่อกรองตารางได้ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={`kpi-sk-${i}`} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 h-[86px] animate-pulse" />
          ))
        ) : (
          <>
            <KpiCard
              label="PNR ทั้งหมด" value={kpiCounts.total} unit="รายการ"
              icon={<Hash size={18} />} color="#0F5EF7"
              active={kpiFilter === 'all'} clickable={kpiFilter !== 'all'} onClick={() => setKpi('all')}
            />
            <KpiCard
              label="ที่นั่งคงเหลือ" value={kpiCounts.seatsRemaining} unit="ที่นั่ง"
              icon={<Users size={18} />} color="#16a34a"
              active={kpiFilter === 'seats'} clickable onClick={() => setKpi('seats')}
            />
            <KpiCard
              label="รอตรวจสอบ" value={kpiCounts.pending} unit="รายการ"
              icon={<AlertCircle size={18} />} color="#f59e0b"
              active={kpiFilter === 'pending'} clickable onClick={() => setKpi('pending')}
            />
            <KpiCard
              label="ใกล้ NAME DL" value={kpiCounts.nearDl} unit="รายการ"
              icon={<AlertTriangle size={18} />} color="#f97316"
              active={kpiFilter === 'nearDl'} clickable onClick={() => setKpi('nearDl')}
            />
            <KpiCard
              label="ยังไม่เชื่อมโยงระบบ" value={kpiCounts.notMapped} unit="รายการ"
              icon={<Link2 size={18} />} color="#8b5cf6"
              active={kpiFilter === 'notMapped'} clickable onClick={() => setKpi('notMapped')}
            />
            <KpiCard
              label="ยอดผิดปกติ" value={kpiCounts.abnormal} unit="รายการ"
              icon={<AlertCircle size={18} />} color="#ef4444"
              active={kpiFilter === 'abnormal'} clickable onClick={() => setKpi('abnormal')}
            />
          </>
        )}
      </div>

      {/* Search, ช่วงเวลาเดินทาง, Filter */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="ค้นหา PNR, Series Code, Series Name, Airline, Route..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5EF7]"
            />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-slate-500 whitespace-nowrap">ช่วงเวลาเดินทาง</span>
            <div className="relative">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="date" value={filters.travelFrom} onChange={e => setFilter('travelFrom', e.target.value)}
                className="pl-7 pr-2 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5EF7] w-[132px]" />
            </div>
            <span className="text-slate-300">→</span>
            <div className="relative">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="date" value={filters.travelTo} onChange={e => setFilter('travelTo', e.target.value)}
                className="pl-7 pr-2 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5EF7] w-[132px]" />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant={showFilter ? 'primary' : 'outline'}
              size="sm"
              icon={<SlidersHorizontal size={14} />}
              onClick={() => setShowFilter(v => !v)}
            >
              Filter{activeFilterCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/25 text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            {(hasActiveFilter || kpiFilter !== 'all') && (
              <Button variant="outline" size="sm" icon={<RotateCcw size={14} />} onClick={clearAll}>
                ล้างทั้งหมด
              </Button>
            )}
            <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={handleExport}>
              Export Excel
            </Button>
          </div>
        </div>

        {showFilter && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pt-3 mt-3 border-t border-slate-100">
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Ticket Type</label>
              <select value={filters.ticketType} onChange={e => setFilter('ticketType', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                <option value="Group">Group</option>
                <option value="FIT">FIT</option>
                <option value="Ticket + Land">Ticket + Land</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">PNR Type</label>
              <select value={filters.pnrType} onChange={e => setFilter('pnrType', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                <option value="real">PNR</option>
                <option value="dummy">Dummy PNR</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">ประเทศ</label>
              <select value={filters.country} onChange={e => setFilter('country', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                {countryOptions.map(c => <option key={c} value={c}>{countryNameMap[c] ?? c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Airline</label>
              <select value={filters.airline} onChange={e => setFilter('airline', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                {airlines.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">PNR Status</label>
              <select value={filters.status} onChange={e => setFilter('status', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                <option value="Pending">รอยืนยัน</option>
                <option value="Confirmed">ยืนยันแล้ว</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Mapping Status</label>
              <select value={filters.mappingStatus} onChange={e => setFilter('mappingStatus', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                {(['Not Mapped', 'Partially Mapped', 'Mapped'] as const).map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Condition</label>
              <select value={filters.condition} onChange={e => setFilter('condition', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                {conditions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">ที่นั่ง</label>
              <select value={filters.seatFilter} onChange={e => setFilter('seatFilter', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                <option value="available">มีที่นั่งคงเหลือ</option>
                <option value="full">ที่นั่งเต็ม</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Result count */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500">
          {hasActiveFilter || kpiFilter !== 'all'
            ? `ค้นพบ ${filtered.length} รายการ จากทั้งหมด ${allRows.length} PNR`
            : `ทั้งหมด ${allRows.length} PNR`}
        </p>
        <p className="text-xs text-slate-500">หน้า {page} / {totalPages}</p>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <Th className="text-[#0F2557]">#</Th>
                <Th className="text-[#0F2557]">PNR</Th>
                <Th className="text-[#0F2557] hidden lg:table-cell">ประเทศ</Th>
                <Th className="text-[#0F2557] hidden lg:table-cell">สายการบิน</Th>
                <Th className="text-[#0F2557] hidden md:table-cell">เส้นทาง</Th>
                <Th className="text-[#0F2557] hidden md:table-cell">ช่วงเดินทาง</Th>
                <Th className="text-[#0F2557] text-center hidden xl:table-cell">ทั้งหมด</Th>
                <Th className="text-[#0F2557] text-center hidden xl:table-cell">ใช้แล้ว</Th>
                <Th className="text-[#0F2557] text-center">คงเหลือ</Th>
                <Th className="text-[#0F2557] hidden lg:table-cell">NAME DL ใกล้สุด</Th>
                <Th className="text-[#0F2557] hidden xl:table-cell whitespace-nowrap">Mapping</Th>
                <Th className="text-[#0F2557]">สถานะ</Th>
                <Th className="text-[#0F2557] hidden 2xl:table-cell">Payment</Th>
                <Th className="text-[#0F2557] text-center w-[52px]">Action</Th>
              </tr>
            </TableHead>
            <TableBody>
              {loadError ? (
                <tr>
                  <td colSpan={TABLE_COLS} className="px-3 py-14 text-center">
                    <p className="text-sm text-red-500 mb-3">{loadError}</p>
                    <Button variant="outline" size="sm" onClick={loadStocks}>ลองใหม่</Button>
                  </td>
                </tr>
              ) : loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`row-sk-${i}`}>
                    <td colSpan={TABLE_COLS} className="px-3 py-2.5">
                      <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLS} className="px-3 py-14 text-center">
                    <p className="text-sm font-medium text-slate-500 mb-1">ไม่พบรายการ PNR</p>
                    <p className="text-xs text-slate-400 mb-3">
                      {hasActiveFilter || kpiFilter !== 'all'
                        ? 'ไม่มีรายการที่ตรงกับคำค้นหาหรือตัวกรองที่เลือก'
                        : 'ยังไม่มีข้อมูล PNR ในระบบ'}
                    </p>
                    {(hasActiveFilter || kpiFilter !== 'all') && (
                      <Button variant="outline" size="sm" icon={<RotateCcw size={14} />} onClick={clearAll}>
                        ล้างตัวกรอง
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                paginated.map((row, idx) => {
                  const statusTag = getRowStatusTag(row, pendingReviewPnrIds.has(row.pnrId))
                  const seatColor = row.available > 0 ? 'text-[#16a34a]' : row.available === 0 ? 'text-orange-500' : 'text-red-600'
                  return (
                    <TableRow key={row.pnrId} className="h-[72px]">
                      {/* # */}
                      <Td className="text-xs text-slate-400">{(page - 1) * pageSize + idx + 1}</Td>
                      {/* PNR */}
                      <Td className="max-w-[240px]">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleView(row)}
                            className="font-mono font-semibold text-sm text-[#0F5EF7] hover:underline whitespace-nowrap text-left"
                          >
                            {row.pnrDisplay}
                          </button>
                          {row.pnrType === 'dummy' && (
                            <Badge variant="orange" className="text-[10px] py-0 px-1.5 whitespace-nowrap flex-shrink-0">Dummy</Badge>
                          )}
                        </div>
                        {/* Series Code + Type Tag (ย้ายมาจากคอลัมน์ "ประเภท" เดิม) */}
                        {(row.stockCode || row.ticketType) && (
                          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                            {row.stockCode && (
                              <span className="text-[11px] text-slate-500 truncate" title={row.stockCode}>
                                {row.stockCode}
                              </span>
                            )}
                            {row.ticketType && (
                              <TicketTypeBadge
                                type={row.ticketType}
                                groupType={row.groupType}
                                className="flex-shrink-0 text-[10px] font-medium leading-none h-[18px] px-[7px] py-[2px] whitespace-nowrap"
                              />
                            )}
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400 truncate max-w-[220px]" title={row.groupName || undefined}>
                          {row.groupName || '–'}
                        </p>
                      </Td>
                      {/* ประเทศ */}
                      <Td className="hidden lg:table-cell text-xs text-slate-700 whitespace-nowrap">
                        {countryNameMap[row.countryId] ?? row.countryId ?? '—'}
                      </Td>
                      {/* สายการบิน */}
                      <Td className="hidden lg:table-cell text-xs font-medium text-slate-700">{row.airlineCode || '—'}</Td>
                      {/* เส้นทาง */}
                      <Td className="hidden md:table-cell text-xs text-slate-600 truncate max-w-[200px]" title={row.routeText || undefined}>
                        {row.routeText || '—'}
                      </Td>
                      {/* ช่วงเดินทาง */}
                      <Td className="hidden md:table-cell text-xs text-slate-600 whitespace-nowrap">
                        {row.travelStart
                          ? `${formatDateDMY(row.travelStart)} – ${formatDateDMY(row.travelEnd)}`
                          : '—'}
                      </Td>
                      {/* ทั้งหมด */}
                      <Td className="hidden xl:table-cell text-center text-xs font-medium text-slate-700">{row.seatTotal}</Td>
                      {/* ใช้แล้ว */}
                      <Td className="hidden xl:table-cell text-center text-xs font-medium text-slate-700">{row.seatUsed}</Td>
                      {/* คงเหลือ */}
                      <Td className="text-center">
                        <span className={cn('text-sm font-bold', seatColor)}>{row.available}</span>
                      </Td>
                      {/* NAME DL ใกล้สุด */}
                      <Td className="hidden lg:table-cell">
                        <NameDlCell ttlDateTime={row.ttlDateTime} />
                      </Td>
                      {/* Mapping */}
                      <Td className="hidden xl:table-cell whitespace-nowrap">
                        <Badge variant={mappingVariant(row.mappingStatus)} className="whitespace-nowrap">{row.mappingStatus}</Badge>
                      </Td>
                      {/* สถานะ */}
                      <Td>
                        <TonePill tone={statusTag.tone}>{statusTag.label}</TonePill>
                      </Td>
                      {/* Payment */}
                      <Td className="hidden 2xl:table-cell max-w-[160px]">
                        <PaymentSummaryCell
                          summary={financialSummaryMap[row.pnrId] ?? null}
                          txCount={(transactionMap[row.pnrId] ?? []).length}
                          currency={row.currency}
                          onClick={() => setPaymentDrawer({
                            pnrDisplay: row.pnrDisplay,
                            currency: row.currency,
                            summary: financialSummaryMap[row.pnrId] ?? { requiredAmount: 0, paidAmount: 0, refundAmount: 0, forfeitedAmount: 0, supplierHeldAmount: 0, outstandingAmount: 0, netCashPaid: 0 },
                            transactions: transactionMap[row.pnrId] ?? [],
                            scheduleItems: paymentMap[row.pnrId] ?? [],
                          })}
                        />
                        {row.programCount > 0 && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Program: {row.programCount}</p>
                        )}
                      </Td>
                      {/* Action */}
                      <Td className="text-right w-[52px]">
                        <div className="flex items-center justify-center">
                          <RowActionsMenu
                            onView={() => handleView(row)}
                            onCreateRequisition={() => router.push(`/requisitions/create?stockId=${row.stockId}&pnrId=${row.pnrId}`)}
                            onEdit={() => handleEdit(row)}
                            onReplaceDummy={row.pnrType === 'dummy' ? () => setReplaceRow(row) : undefined}
                          />
                        </div>
                      </Td>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary Footer — ตัวเลขอิงตามผลลัพธ์ที่กรอง/ค้นหาอยู่เสมอ */}
        {!loading && !loadError && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/60">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Info size={14} className="text-slate-400 flex-shrink-0" />
              <span>
                สรุป{hasActiveFilter || kpiFilter !== 'all' ? 'ตามผลลัพธ์ที่กรอง' : 'ภาพรวม'}
                {lastDataUpdate && <> (ข้อมูล ณ {formatDateTimeDMY(lastDataUpdate)})</>}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
              <span className="text-slate-500">ทั้งหมด <span className="font-semibold text-slate-800">{formatNumber(footerTotals.count)}</span> รายการ</span>
              <span className="text-slate-500">ใช้แล้ว <span className="font-semibold text-slate-800">{formatNumber(footerTotals.seatUsed)}</span> ที่นั่ง</span>
              <span className="text-slate-500">คงเหลือ <span className="font-semibold text-[#16a34a]">{formatNumber(footerTotals.seatBalance)}</span> ที่นั่ง</span>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && !loadError && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
          <p className="text-xs text-slate-500">
            แสดง {paginated.length ? (page - 1) * pageSize + 1 : 0}–{(page - 1) * pageSize + paginated.length} จาก {filtered.length} รายการ
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              title="ไปหน้าแรก"
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              title="หน้าก่อนหน้า"
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={16} />
            </button>
            {paginationItems}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              title="หน้าถัดไป"
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              title="ไปหน้าสุดท้าย"
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronsRight size={16} />
            </button>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
              className="ml-2 text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F5EF7]"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / หน้า</option>)}
            </select>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
