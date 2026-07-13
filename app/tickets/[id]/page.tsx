'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layout/AppLayout'
import { Badge, StockStatusBadge, TicketTypeBadge, PnrOperationalStatusBadge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatDate, formatDateTime, formatNumber, formatStockPeriod, PAYMENT_TYPE_LABELS } from '@/lib/utils'
import {
  ChevronLeft, Pencil, FileDown, Lock, AlertCircle, X, CheckCircle2,
  RefreshCw, History, PlusCircle,
} from 'lucide-react'
import {
  getDemoStockById, getDemoStockByCode, exportStockJSON,
  buildPaymentSchedule, saveDemoStock, getNextTTL, getPnrOperationalStatus, getPnrConfirmationStatus,
} from '@/lib/demo-storage'
import type { DemoStock, DemoLog, PaymentScheduleItem } from '@/lib/demo-storage'
import { PNRTab }        from '@/components/tickets/detail/PNRTab'
import { SegmentsTab }   from '@/components/tickets/detail/SegmentsTab'
import { ConditionsTab } from '@/components/tickets/detail/ConditionsTab'
import { ReopenStockModal, REOPEN_SECTIONS, CURRENT_DEMO_USER } from '@/components/tickets/detail/ReopenStockModal'
import { ExtendScopeModal } from '@/components/tickets/detail/ExtendScopeModal'
import { SummaryTab } from '@/components/tickets/detail/SummaryTab'
import {
  DraftToActiveModal, ActiveToClosedModal, CancelStockModal,
} from '@/components/wizard/StockStatusModals'
import type { DraftToActiveResult, ActiveToClosedResult } from '@/components/wizard/StockStatusModals'


const TABS = ['Summary', 'PNR', 'Flight Segments', 'Conditions', 'Payment Schedule', 'Logs']
const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ─── Locked Tab Banner ────────────────────────────────────────────────────────

function LockedTabBanner({ sectionIds, onRequest }: {
  sectionIds: string[]
  onRequest: (sections: string[]) => void
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Lock size={14} className="shrink-0 text-slate-400" />
        <span>Tab นี้เป็น <strong className="text-slate-700">Read-only</strong> — ไม่ได้รับอนุญาตใน Reopen ปัจจุบัน</span>
      </div>
      <button
        type="button"
        onClick={() => onRequest(sectionIds)}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition">
        <PlusCircle size={12} /> ขอเปิดสิทธิ์แก้ไข Tab นี้
      </button>
    </div>
  )
}

// ─── Close Again Modal ────────────────────────────────────────────────────────

interface CloseAgainModalProps {
  open: boolean
  stock: DemoStock
  onClose: () => void
  onConfirm: () => void
}

function CloseAgainModal({ open, stock, onClose, onConfirm }: CloseAgainModalProps) {
  if (!open) return null

  const allowedSections = (stock.reopenAllowedSections ?? [])
    .map(s => REOPEN_SECTIONS.find(r => r.id === s)?.label ?? s)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-[calc(100vw-32px)] max-w-[520px] rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
              <Lock size={18} className="text-slate-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Close Stock อีกครั้ง</h2>
          </div>
          <button type="button" onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-700">
            ตรวจสอบการเปลี่ยนแปลงก่อนปิด Stock ทบทวนให้เรียบร้อยก่อนยืนยัน
          </p>

          {/* Reopen summary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
            <p className="font-semibold text-slate-800 text-xs uppercase tracking-wide text-slate-500">สรุปการ Reopen</p>
            {stock.reopenedBy && (
              <div className="flex justify-between">
                <span className="text-slate-500">เปิดโดย</span>
                <span className="font-medium">{stock.reopenedBy} ({stock.reopenedByRole})</span>
              </div>
            )}
            {stock.reopenedAt && (
              <div className="flex justify-between">
                <span className="text-slate-500">เปิดเมื่อ</span>
                <span>{formatDateTime(stock.reopenedAt)}</span>
              </div>
            )}
            {stock.reopenReason && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 shrink-0">เหตุผล</span>
                <span className="text-right">{stock.reopenReason}</span>
              </div>
            )}
            {allowedSections.length > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 shrink-0">ส่วนที่แก้ไข</span>
                <span className="text-right">{allowedSections.join(', ')}</span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium mb-1">ข้อควรทราบ</p>
            <ul className="text-xs space-y-1 text-amber-700 list-disc list-inside">
              <li>ข้อมูลที่แก้ไขจะถูกบันทึกและไม่สามารถย้อนกลับได้</li>
              <li>ข้อมูล Snapshot เดิมยังคงอยู่ใน Logs</li>
              <li>หลังปิด Stock จะไม่สามารถแก้ไขได้อีก</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            ยกเลิก
          </button>
          <Button onClick={onConfirm} variant="secondary" className="bg-slate-700 hover:bg-slate-800 text-white">
            <Lock size={14} />
            ยืนยัน Close Stock
          </Button>
        </div>
      </div>
    </div>
  )
}

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
  const [stockForm, setStockForm]             = useState({ group_name: '', airline_code: '', currency: '', status: '', remark: '' })
  const [stockSaving, setStockSaving]         = useState(false)

  // Reopen
  const [showReopenModal, setShowReopenModal]   = useState(false)
  const [showCloseAgain, setShowCloseAgain]     = useState(false)
  const [showExtendScope, setShowExtendScope]   = useState(false)
  const [extendPreSections, setExtendPreSections] = useState<string[]>([])

  // Stock status modals
  const [showActivateModal, setShowActivateModal] = useState(false)
  const [showCloseModal, setShowCloseModal]       = useState(false)
  const [showCancelModal, setShowCancelModal]     = useState(false)

  // Toast
  const [toast, setToast]                     = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => { setLiveStock(getDemoStockById(id) ?? getDemoStockByCode(id)); setIsMounted(true) }, [id])

  useEffect(() => {
    const handle = () => setLiveStock(getDemoStockById(id) ?? getDemoStockByCode(id))
    window.addEventListener('demo_stock_updated', handle)
    return () => window.removeEventListener('demo_stock_updated', handle)
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
      status:        liveStock.status,
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
    if (stockForm.status        !== liveStock.status)              changes.push(`Status: ${liveStock.status} → ${stockForm.status}`)
    if (stockForm.remark        !== (liveStock.remark || ''))      changes.push(`Remark: แก้ไข`)
    const log: DemoLog = {
      logId: newId('LOG'),
      action: 'STOCK_UPDATED_AFTER_REOPEN',
      message: changes.length > 0 ? `[${liveStock.stockCode}] ${changes.join(' | ')}` : `[${liveStock.stockCode}] ไม่มีการเปลี่ยนแปลง`,
      createdAt: now, createdBy: CURRENT_DEMO_USER.name,
    }
    const updated: DemoStock = {
      ...liveStock,
      groupName:    stockForm.group_name,
      airlineCode:  stockForm.airline_code,
      currency:     stockForm.currency,
      status:       liveStock.status,  // don't allow manual status change while Reopened
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

  // Activate stock (Draft → Active) — scope via DraftToActiveModal
  const handleActivateStock = (result: DraftToActiveResult) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    let updatedPnrs = liveStock.pnrs
    if (result.scope === 'ALL_READY') {
      updatedPnrs = liveStock.pnrs.map(p => {
        if (getPnrOperationalStatus(p) !== 'PENDING') return p
        const isReady = !!(p.travelStart && p.seatTotal > 0 && p.fare && p.conditionCode)
        if (!isReady) return p
        return { ...p, pnrStatus: 'ACTIVE' as const, activatedAt: now, activatedBy: CURRENT_DEMO_USER.name }
      })
    } else if (result.scope === 'SELECTED') {
      updatedPnrs = liveStock.pnrs.map(p => {
        if (!result.selectedPnrIds.includes(p.pnrId)) return p
        if (getPnrOperationalStatus(p) !== 'PENDING') return p
        return { ...p, pnrStatus: 'ACTIVE' as const, activatedAt: now, activatedBy: CURRENT_DEMO_USER.name }
      })
    }
    const activatedCount = updatedPnrs.filter(p => p.pnrStatus === 'ACTIVE').length
    const log: DemoLog = {
      logId: newId('LOG'),
      action: 'Activate Stock',
      message: `เปิดใช้งาน Stock ${liveStock.stockCode} (scope: ${result.scope}) — เปิดใช้งาน PNR ${activatedCount} รายการ`,
      createdAt: now, createdBy: CURRENT_DEMO_USER.name,
    }
    const updated: DemoStock = {
      ...liveStock,
      status: 'Active',
      pnrs: updatedPnrs,
      updatedAt: now,
      logs: [log, ...liveStock.logs],
    }
    saveDemoStock(updated)
    setLiveStock(updated)
    setShowActivateModal(false)
    showToast('เปิดใช้งาน Stock สำเร็จ', 'success')
  }

  // Close stock — via ActiveToClosedModal, enforces PNR closure
  const handleCloseStock = (result: ActiveToClosedResult) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    let updatedPnrs = liveStock.pnrs
    if (result.closeOpenPnrs) {
      updatedPnrs = liveStock.pnrs.map(p => {
        const s = getPnrOperationalStatus(p)
        if (s !== 'PENDING' && s !== 'ACTIVE') return p
        return { ...p, pnrStatus: 'CLOSED' as const, closedAt: now, closedBy: CURRENT_DEMO_USER.name }
      })
    }
    const closedPnrCount = updatedPnrs.filter(p => p.pnrStatus === 'CLOSED').length
    const log: DemoLog = {
      logId: newId('LOG'),
      action: 'Close Stock',
      message: `ปิด Stock ${liveStock.stockCode}${result.closeOpenPnrs ? ` — ปิด PNR ที่ค้างทั้งหมด (${closedPnrCount} รายการ)` : ''}`,
      createdAt: now, createdBy: CURRENT_DEMO_USER.name,
    }
    const updated: DemoStock = {
      ...liveStock,
      status: 'Closed',
      pnrs: updatedPnrs,
      closedAt: now,
      closedBy: CURRENT_DEMO_USER.name,
      updatedAt: now,
      logs: [log, ...liveStock.logs],
    }
    saveDemoStock(updated)
    setLiveStock(updated)
    setShowCloseModal(false)
    showToast('Stock ถูกปิดแล้ว', 'success')
  }

  // Cancel stock — auto-cancel PENDING/ACTIVE PNRs
  const handleCancelStock = (reason: string) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p => {
      const s = getPnrOperationalStatus(p)
      if (s !== 'PENDING' && s !== 'ACTIVE') return p
      return { ...p, pnrStatus: 'CANCELLED' as const, cancelledAt: now, cancelledBy: CURRENT_DEMO_USER.name, cancellationReason: reason }
    })
    const cancelledCount = updatedPnrs.filter(p => p.pnrStatus === 'CANCELLED').length
    const log: DemoLog = {
      logId: newId('LOG'),
      action: 'Cancel Stock',
      message: `ยกเลิก Stock ${liveStock.stockCode} — เหตุผล: ${reason}${cancelledCount > 0 ? ` — ยกเลิก PNR ${cancelledCount} รายการอัตโนมัติ` : ''}`,
      createdAt: now, createdBy: CURRENT_DEMO_USER.name,
    }
    const updated: DemoStock = {
      ...liveStock,
      status: 'Cancelled',
      pnrs: updatedPnrs,
      cancelledAt: now,
      cancelledBy: CURRENT_DEMO_USER.name,
      cancellationReason: reason,
      updatedAt: now,
      logs: [log, ...liveStock.logs],
    }
    saveDemoStock(updated)
    setLiveStock(updated)
    setShowCancelModal(false)
    showToast('Stock ถูกยกเลิกแล้ว', 'success')
  }

  // Reopen confirmed
  const handleReopened = (updated: DemoStock) => {
    saveDemoStock(updated)
    setLiveStock(updated)
    setShowReopenModal(false)
    showToast(`Stock "${updated.stockCode}" เปิดกลับมาแก้ไขแล้ว`, 'success')
  }

  // Extend scope confirmed
  const handleExtended = (updated: DemoStock) => {
    saveDemoStock(updated)
    setLiveStock(updated)
    setShowExtendScope(false)
    showToast('เพิ่มขอบเขตการแก้ไขสำเร็จ', 'success')
  }

  const openExtend = (preSelectSections: string[] = []) => {
    setExtendPreSections(preSelectSections)
    setShowExtendScope(true)
  }

  // Close Again (after Reopen)
  const handleCloseAgainConfirm = () => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const reopenEvent = {
      eventId: `EVT-${Date.now()}`,
      eventType: 'STOCK_RECLOSED' as const,
      actor: CURRENT_DEMO_USER.name,
      role: CURRENT_DEMO_USER.role,
      timestamp: now,
      details: `ปิดกลับหลังแก้ไข — เหตุผลเดิม: ${liveStock.reopenReason ?? '—'}`,
    }
    const log: DemoLog = {
      logId: newId('LOG'),
      action: 'STOCK_RECLOSED',
      message: `[${liveStock.stockCode}] ปิด Stock อีกครั้งโดย ${CURRENT_DEMO_USER.name} หลังแก้ไขส่วน: ${(liveStock.reopenAllowedSections ?? []).map(s => REOPEN_SECTIONS.find(r => r.id === s)?.label).join(', ')}`,
      createdAt: now, createdBy: CURRENT_DEMO_USER.name,
    }
    const updated: DemoStock = {
      ...liveStock,
      status: 'Closed',
      closedAt: now,
      closedBy: CURRENT_DEMO_USER.name,
      reopenEvents: [reopenEvent, ...(liveStock.reopenEvents ?? [])],
      updatedAt: now,
      logs: [log, ...liveStock.logs],
    }
    saveDemoStock(updated)
    setLiveStock(updated)
    setShowCloseAgain(false)
    showToast('Stock ถูกปิดอีกครั้งแล้ว', 'success')
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
    currency: liveStock.currency, status: liveStock.status, remark: liveStock.remark,
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

  const logs = liveStock.logs.map(l => ({ logId: l.logId, created_at: l.createdAt, created_by: l.createdBy, action: l.action, message: l.message }))

  const depDates    = pnrRows.map(p => p.travel_start).filter(Boolean).sort()
  const stockPeriod = formatStockPeriod(depDates[0] ?? null, depDates[depDates.length - 1] ?? null)

  // ── Permission helpers ──
  const isDraft     = !!liveStock && liveStock.status === 'Draft'
  const isClosed    = !!liveStock && liveStock.status === 'Closed'
  const isReopened  = !!liveStock && liveStock.status === 'Reopened'
  const isCancelled = !!liveStock && liveStock.status === 'Cancelled'

  // Section-level edit permission — active as long as status is Reopened
  const sectionAllowed = (sectionId: string) =>
    isReopened && !!(liveStock?.reopenAllowedSections?.includes(sectionId))

  const canEditSummary    = (!!liveStock && !isClosed && !isCancelled && !isReopened)
                         || sectionAllowed('stock-info')
  const canEditPNR        = (!!liveStock && !isClosed && !isCancelled && !isReopened)
                         || sectionAllowed('pnr') || sectionAllowed('price') || sectionAllowed('seats')
  const canEditSegments   = (!!liveStock && !isClosed && !isCancelled && !isReopened)
                         || sectionAllowed('flight-segments')
  const canEditConditions = (!!liveStock && !isClosed && !isCancelled && !isReopened)
                         || sectionAllowed('conditions')

  // Summary edit button: only show if not Closed/Cancelled and section allowed
  const showSummaryEditBtn = canEditSummary && !summaryEditMode

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
              <StockStatusBadge status={stock.status} />
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

          {/* Activate Stock — show for Draft only */}
          {isDraft && (
            <Button size="sm" icon={<CheckCircle2 size={14} />}
              onClick={() => setShowActivateModal(true)} disabled={!liveStock}
              className="bg-[#05a94f] hover:bg-[#048f43] text-white">
              เปิดใช้งาน Stock
            </Button>
          )}

          {/* Close Stock — show for Active only */}
          {!isClosed && !isCancelled && !isReopened && !isDraft && (
            <Button variant="outline" size="sm" icon={<Lock size={14} />}
              onClick={() => setShowCloseModal(true)} disabled={!liveStock}>
              Close Stock
            </Button>
          )}

          {/* Cancel Stock — show when not already Cancelled */}
          {!isCancelled && !isReopened && (
            <Button variant="outline" size="sm" icon={<X size={14} />}
              onClick={() => setShowCancelModal(true)} disabled={!liveStock}
              className="border-red-300 text-red-600 hover:bg-red-50">
              ยกเลิก Stock
            </Button>
          )}

          {/* Close Stock Again — after Reopen */}
          {isReopened && (
            <Button variant="outline" size="sm" icon={<Lock size={14} />}
              onClick={() => setShowCloseAgain(true)}
              className="border-slate-600 text-slate-700 hover:bg-slate-50">
              Close Stock อีกครั้ง
            </Button>
          )}
        </div>
      </div>

      {/* ── Status Banners ── */}

      {/* Closed banner */}
      {isClosed && (
        <div className="mb-4 rounded-xl border border-slate-300 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <Lock size={16} className="mt-0.5 shrink-0 text-slate-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">
                Stock นี้ถูกปิดแล้ว ไม่สามารถแก้ไขข้อมูลได้ หากจำเป็นต้องแก้ไข กรุณาเปิดกลับมาด้วยรหัสยืนยัน 4 หลัก
              </p>
              {liveStock?.closedAt && (
                <p className="mt-1 text-xs text-slate-500">
                  ปิดเมื่อ {formatDateTime(liveStock.closedAt)}
                  {liveStock.closedBy && ` โดย ${liveStock.closedBy}`}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTab('Logs')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition">
                  <History size={12} /> ดูประวัติการปิด
                </button>
                <button
                  type="button"
                  onClick={() => setShowReopenModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition">
                  <RefreshCw size={12} /> Reopen Stock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reopened banner */}
      {isReopened && (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <RefreshCw size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800">Reopened — เปิดกลับมาแก้ไข</p>
              {liveStock?.reopenedBy && (
                <p className="mt-1 text-xs text-emerald-700">
                  เปิดกลับมาแก้ไขโดย {liveStock.reopenedBy}
                  {liveStock.reopenedAt && ` เมื่อ ${formatDateTime(liveStock.reopenedAt)}`}
                  {liveStock.reopenReason && ` — เหตุผล: ${liveStock.reopenReason}`}
                </p>
              )}
              {liveStock?.reopenAllowedSections && liveStock.reopenAllowedSections.length > 0 && (
                <p className="mt-1 text-xs text-emerald-600">
                  ส่วนที่อนุญาต: {liveStock.reopenAllowedSections.map(s => REOPEN_SECTIONS.find(r => r.id === s)?.label ?? s).join(', ')}
                </p>
              )}
              <button
                type="button"
                onClick={() => openExtend()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition">
                <PlusCircle size={12} /> เพิ่มขอบเขตการแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-600">
          <AlertCircle size={14} />
          Stock นี้ถูกยกเลิกแล้ว — ไม่สามารถแก้ไขได้
        </div>
      )}

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
          <p className="text-xs text-slate-400">Period</p>
          <p className="text-sm font-medium">{stockPeriod}</p>
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
          routeText={stock.route_text}
          ticketType={stock.ticket_type}
          groupType={stock.group_type}
          tripType={stock.trip_type}
          createdAt={stock.created_at}
          updatedAt={stock.updated_at}
          status={stock.status}
          currency={stock.currency}
          summaryEditMode={summaryEditMode}
          stockForm={stockForm}
          stockSaving={stockSaving}
          canEditSummary={canEditSummary}
          showSummaryEditBtn={showSummaryEditBtn}
          isReopened={isReopened}
          isClosed={isClosed}
          onOpenSummaryEdit={openSummaryEdit}
          onCancelSummaryEdit={cancelSummaryEdit}
          onSaveStock={handleSaveStock}
          onStockFormChange={setStockForm}
          onOpenExtend={openExtend}
          onNavigateTab={trySetTab}
        />
      )}

      {/* ── PNR Tab ── */}
      {tab === 'PNR' && (
        <>
          {isReopened && !canEditPNR && (
            <LockedTabBanner
              sectionIds={['pnr', 'price', 'seats']}
              onRequest={openExtend}
            />
          )}
          <PNRTab
            liveStock={liveStock}
            mockPNRs={[]}
            currency={stock.currency}
            canEdit={canEditPNR}
            jumpToEdit={false}
            onUpdate={handleUpdate}
            onDirtyChange={setHasDirtyTab}
            onJumpDone={() => {}}
          />
        </>
      )}

      {/* ── Flight Segments Tab ── */}
      {tab === 'Flight Segments' && (
        <>
          {isReopened && !canEditSegments && (
            <LockedTabBanner
              sectionIds={['flight-segments']}
              onRequest={openExtend}
            />
          )}
          <SegmentsTab
            liveStock={liveStock}
            mockSectors={sectors}
            ticketType={stock.ticket_type}
            canEdit={canEditSegments}
            jumpToEdit={false}
            onUpdate={handleUpdate}
            onDirtyChange={setHasDirtyTab}
            onJumpDone={() => {}}
          />
        </>
      )}

      {/* ── Conditions Tab ── */}
      {tab === 'Conditions' && (
        <>
          {isReopened && !canEditConditions && (
            <LockedTabBanner
              sectionIds={['conditions']}
              onRequest={openExtend}
            />
          )}
          <ConditionsTab
            liveStock={liveStock}
            currency={stock.currency}
            canEdit={canEditConditions}
            jumpToEdit={false}
            onUpdate={handleUpdate}
            onDirtyChange={setHasDirtyTab}
            onJumpDone={() => {}}
          />
        </>
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
                          <Th>TTL Date/Time</Th>
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
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table>
            <TableHead>
              <tr><Th>Date/Time</Th><Th>User</Th><Th>Action</Th><Th>Detail</Th></tr>
            </TableHead>
            <TableBody>
              {logs.length === 0 ? (
                <EmptyRow cols={4} message="ยังไม่มี Logs" />
              ) : (
                logs.map((l, i) => (
                  <TableRow key={l.logId ?? i}>
                    <Td className="text-xs text-slate-500">{formatDateTime(l.created_at)}</Td>
                    <Td className="text-xs font-medium">{l.created_by}</Td>
                    <Td>
                      <Badge variant={
                        l.action.includes('SCOPE')  ? 'green' :
                        l.action.includes('REOPEN') ? 'yellow' :
                        l.action.includes('RECLOS') ? 'gray' :
                        'blue'
                      }>
                        {l.action}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-slate-600">{l.message}</Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
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

      {/* ── Reopen Modal ── */}
      {liveStock && (
        <ReopenStockModal
          open={showReopenModal}
          stock={liveStock}
          onClose={() => setShowReopenModal(false)}
          onReopened={handleReopened}
        />
      )}

      {/* ── Extend Scope Modal ── */}
      {liveStock && (
        <ExtendScopeModal
          open={showExtendScope}
          stock={liveStock}
          preSelectSections={extendPreSections}
          onClose={() => setShowExtendScope(false)}
          onExtended={handleExtended}
        />
      )}

      {/* ── Close Again Modal ── */}
      {liveStock && (
        <CloseAgainModal
          open={showCloseAgain}
          stock={liveStock}
          onClose={() => setShowCloseAgain(false)}
          onConfirm={handleCloseAgainConfirm}
        />
      )}

      {/* ── Draft → Active Modal ── */}
      {liveStock && (
        <DraftToActiveModal
          open={showActivateModal}
          onClose={() => setShowActivateModal(false)}
          stock={liveStock}
          onConfirm={handleActivateStock}
        />
      )}

      {/* ── Active → Closed Modal ── */}
      {liveStock && (
        <ActiveToClosedModal
          open={showCloseModal}
          onClose={() => setShowCloseModal(false)}
          stock={liveStock}
          onConfirm={handleCloseStock}
        />
      )}

      {/* ── Cancel Stock Modal ── */}
      {liveStock && (
        <CancelStockModal
          open={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          stock={liveStock}
          onConfirm={handleCancelStock}
        />
      )}
    </AppLayout>
  )
}
