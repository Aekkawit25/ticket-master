'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Badge, PnrConfirmationStatusBadge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import {
  PlusCircle, Pencil, Trash2, X, CheckCircle2, AlertTriangle, PlusSquare, ChevronDown,
} from 'lucide-react'
import { PnrActionMenu } from '@/components/tickets/PnrActionMenu'
import { BulkPnrBuilder } from '@/components/shared/BulkPnrBuilder'
import type { BulkPnrFlightSet, BulkPnrCondition } from '@/components/shared/BulkPnrBuilder'
import { SinglePnrModal } from '@/components/shared/SinglePnrModal'
import { formatDate, formatDateTime, formatNumber, buildRouteText } from '@/lib/utils'
import { formatTtlDisplay, type TtlType } from '@/lib/ttl-utils'
import {
  saveDemoStock, calculateStockSummary, getStockFlightSets,
  getPnrOperationalStatus, getPnrConfirmationStatus, checkPNRDuplicatesInSystem,
} from '@/lib/demo-storage'
import type { DemoStock, DemoPNR, DemoLog, DemoFlightSet, PnrSectorSchedule } from '@/lib/demo-storage'
import { getPnrSectorSchedules } from '@/lib/schedule-resolver'
import { MASTER_AIRLINE_CODE_SET } from '@/lib/master-data'
import { AirlineCell } from '@/components/shared/AirlineCell'
import { TtlField } from '@/components/shared/TtlField'
import type { ConditionTtlInfo } from '@/components/shared/TtlField'
import { buildDemoPnrFromForm, generateDummyPnrCode, pnrToFormValues } from '@/lib/pnr-shared-utils'
import type { PnrFormValues, PnrModalCondition } from '@/lib/pnr-shared-utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PNRRow {
  id: string
  pnr_code: string | null
  dummy_pnr: string | null
  pnr_type: string
  route: string | null
  travel_start: string
  travel_end: string
  seat_total: number
  seat_used: number
  seat_balance: number
  fare: number
  yq: number
  tax_type: string
  tax: number
  total_amount: number
  price_format: 'FARE' | 'FARE_YQ' | 'ALL_IN'
  breakdown: boolean
  condition: string | null
  condition_code: string | null
  next_ttl: string | null
  ttl_type: TtlType | null
  ttl_days_before: number | null
  ttl_date: string | null
  ttl_time: string | null
  status: string
}

const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  liveStock: DemoStock | null
  mockPNRs: PNRRow[]
  currency: string
  canEdit: boolean
  jumpToEdit: boolean
  onUpdate: (stock: DemoStock) => void
  onDirtyChange: (dirty: boolean) => void
  onJumpDone: () => void
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PNRCell({ code, dummy, route }: { code: string | null; dummy: string | null; type?: string; route?: string | null }) {
  const display = code || dummy
  const routeLabel = route ? `Route: ${route}` : null
  return (
    <div className="flex flex-col items-start" style={{ gap: 3, minWidth: 0 }}>
      {/* บรรทัด 1: PNR Code */}
      <span className="font-mono text-xs font-bold whitespace-nowrap" style={{ wordBreak: 'normal', overflowWrap: 'normal' }}>
        {display || <span className="text-slate-300 italic font-normal text-[10px]">ไม่ระบุ</span>}
      </span>
      {/* บรรทัด 2: Route */}
      <span
        className="text-[10px] text-slate-400 font-medium"
        style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
        title={routeLabel ?? undefined}
      >
        {routeLabel ?? <span className="italic text-slate-300">Route: ยังไม่ระบุ</span>}
      </span>
      {/* บรรทัด 3: Badge ประเภทรหัส */}
      {code ? (
        <span className="inline-flex w-fit px-1.5 py-px rounded text-[9px] font-medium bg-blue-50 text-blue-600 border border-blue-200 whitespace-nowrap">มี PNR แล้ว</span>
      ) : dummy ? (
        <span className="inline-flex w-fit px-1.5 py-px rounded text-[9px] font-medium bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">Dummy</span>
      ) : null}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PNRTab({ liveStock, mockPNRs, currency, canEdit, jumpToEdit, onUpdate, onDirtyChange, onJumpDone }: Props) {
  const [showSinglePnrModal, setShowSinglePnrModal] = useState(false)
  const [editingPnr, setEditingPnr]               = useState<DemoPNR | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingPnr, setDeletingPnr]    = useState<DemoPNR | null>(null)
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [convertingPnr, setConvertingPnr] = useState<DemoPNR | null>(null)
  const [convertCode, setConvertCode]    = useState('')
  const [convertError, setConvertError]  = useState('')
  const [showBulkAdd, setShowBulkAdd]    = useState(false)

  const [toast, setToast]   = useState('')

  const [selectedPnrIds, setSelectedPnrIds] = useState<Set<string>>(new Set())
  const [condChangeConfirm, setCondChangeConfirm] = useState<{ pnrIds: string[]; newCode: string } | null>(null)
  const [showBulkCond, setShowBulkCond]     = useState(false)
  const [bulkCondCode, setBulkCondCode]     = useState('')
  const [detailPnr, setDetailPnr]           = useState<PNRRow | null>(null)

  // PNR operational status modals
  const [closingPnr, setClosingPnr]             = useState<DemoPNR | null>(null)
  const [showClosePnrModal, setShowClosePnrModal] = useState(false)
  const [cancellingPnr, setCancellingPnr]       = useState<DemoPNR | null>(null)
  const [showCancelPnrModal, setShowCancelPnrModal] = useState(false)
  const [cancelReason, setCancelReason]         = useState('')
  const [cancelReasonError, setCancelReasonError] = useState('')
  const [showBulkCancel, setShowBulkCancel]     = useState(false)
  const [bulkCancelReason, setBulkCancelReason] = useState('')
  const [bulkCancelReasonError, setBulkCancelReasonError] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const openAdd = () => {
    setEditingPnr(null)
    setShowSinglePnrModal(true)
    onDirtyChange(true)
  }

  const openEdit = (pnr: DemoPNR) => {
    setEditingPnr(pnr)
    setShowSinglePnrModal(true)
    onDirtyChange(true)
  }

  // Jump to Add PNR when triggered from dropdown
  useEffect(() => {
    if (jumpToEdit && liveStock) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openAdd()
      onJumpDone()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToEdit])

  const closeSinglePnrModal = () => {
    setShowSinglePnrModal(false)
    setEditingPnr(null)
    onDirtyChange(false)
  }

  const executeSavePNR = (newPnr: DemoPNR, existingPnr: DemoPNR | undefined) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const isEdit = !!existingPnr

    const log: DemoLog = {
      logId: newId('LOG'),
      action: isEdit ? 'แก้ไข PNR' : 'เพิ่ม PNR',
      message: isEdit
        ? `แก้ไข PNR ${newPnr.pnrDisplay}: วันเดินทาง ${formatDate(newPnr.travelStart)}`
        : `เพิ่ม PNR ${newPnr.pnrDisplay}: วันเดินทาง ${formatDate(newPnr.travelStart)}, Seat ${newPnr.seatTotal}`,
      createdAt: now,
      createdBy: 'System',
      pnrDisplay: newPnr.pnrDisplay,
    }

    const newPnrs = isEdit
      ? liveStock.pnrs.map(p => p.pnrId === existingPnr!.pnrId ? newPnr : p)
      : [...liveStock.pnrs, newPnr]

    const updated: DemoStock = {
      ...liveStock,
      pnrs: newPnrs,
      summary: calculateStockSummary(newPnrs),
      updatedAt: now,
      logs: [log, ...liveStock.logs],
    }
    saveDemoStock(updated)
    onUpdate(updated)
    showToast(isEdit ? 'แก้ไข PNR สำเร็จ' : 'เพิ่ม PNR สำเร็จ')
  }

  const handleSinglePnrConfirm = async (vals: PnrFormValues) => {
    if (!liveStock) throw new Error('ไม่พบ Stock')
    const flightSet = liveFlightSets.find(fs => fs.flightSetId === vals.flightSetId) ?? liveFlightSets[0]
    if (!flightSet) throw new Error('ไม่พบ Flight Set')
    const newPnr = buildDemoPnrFromForm(vals, liveStock, flightSet, editingPnr ?? undefined)
    executeSavePNR(newPnr, editingPnr ?? undefined)
  }

  const handleDeletePNR = () => {
    if (!liveStock || !deletingPnr) return
    const now = new Date().toISOString()
    const log: DemoLog = {
      logId: newId('LOG'),
      action: 'ลบ PNR',
      message: `ลบ PNR: ${deletingPnr.pnrDisplay}, Seat: ${deletingPnr.seatTotal}`,
      createdAt: now,
      createdBy: 'System',
    }
    const newPnrs = liveStock.pnrs.filter(p => p.pnrId !== deletingPnr.pnrId)
    const updated: DemoStock = { ...liveStock, pnrs: newPnrs, summary: calculateStockSummary(newPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setShowDeleteModal(false)
    setDeletingPnr(null)
    showToast('ลบ PNR สำเร็จ')
  }

  const handleResetSchedule = (pnr: DemoPNR) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p =>
      p.pnrId === pnr.pnrId ? { ...p, sectorSchedules: [] as PnrSectorSchedule[] } : p
    )
    const log: DemoLog = { logId: newId('LOG'), action: 'คืนค่า Schedule', message: `คืนค่า Sector Schedule จาก Flight Set สำหรับ PNR ${pnr.pnrDisplay}`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    showToast('คืนค่า Schedule เรียบร้อยแล้ว')
  }

  const handleDuplicate = (pnr: DemoPNR) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const dup: DemoPNR = { ...pnr, pnrId: newId('PNR'), pnrCode: '', dummyPnr: generateDummyPnrCode(pnr.travelStart, liveStock), pnrType: 'dummy', pnrDisplay: '', seatUsed: 0, seatBalance: pnr.seatTotal, ttlDate: null, ttlTime: null, ttlDateTime: null }
    dup.pnrDisplay = dup.dummyPnr
    const log: DemoLog = { logId: newId('LOG'), action: 'Duplicate PNR', message: `Duplicate: ${pnr.pnrDisplay} → ${dup.pnrDisplay}`, createdAt: now, createdBy: 'System' }
    const newPnrs = [...liveStock.pnrs, dup]
    const updated: DemoStock = { ...liveStock, pnrs: newPnrs, summary: calculateStockSummary(newPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    showToast('Duplicate PNR สำเร็จ')
  }

  const handleClosePnr = () => {
    if (!liveStock || !closingPnr) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p =>
      p.pnrId !== closingPnr.pnrId ? p : { ...p, pnrStatus: 'CLOSED' as const, closedAt: now, closedBy: 'System' }
    )
    const log: DemoLog = { logId: newId('LOG'), action: 'ปิด PNR', message: `ปิด PNR ${closingPnr.pnrDisplay}`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setShowClosePnrModal(false)
    setClosingPnr(null)
    showToast('ปิด PNR สำเร็จ')
  }

  const handleCancelPnr = () => {
    if (!liveStock || !cancellingPnr) return
    if (!cancelReason.trim()) { setCancelReasonError('กรุณาระบุเหตุผลการยกเลิก'); return }
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p =>
      p.pnrId !== cancellingPnr.pnrId ? p : { ...p, pnrStatus: 'CANCELLED' as const, cancelledAt: now, cancelledBy: 'System', cancellationReason: cancelReason.trim() }
    )
    const log: DemoLog = { logId: newId('LOG'), action: 'ยกเลิก PNR', message: `ยกเลิก PNR ${cancellingPnr.pnrDisplay} — เหตุผล: ${cancelReason.trim()}`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setShowCancelPnrModal(false)
    setCancellingPnr(null)
    setCancelReason('')
    setCancelReasonError('')
    showToast('ยกเลิก PNR สำเร็จ')
  }

  const handleActivatePnr = (pnr: DemoPNR) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p =>
      p.pnrId !== pnr.pnrId ? p : { ...p, pnrStatus: 'ACTIVE' as const, activatedAt: now, activatedBy: 'System' }
    )
    const log: DemoLog = { logId: newId('LOG'), action: 'เปิดใช้งาน PNR', message: `เปิดใช้งาน PNR ${pnr.pnrDisplay}`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    showToast('เปิดใช้งาน PNR สำเร็จ')
  }

  const handleBulkActivatePnr = (pnrIds: Set<string>) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p => {
      if (!pnrIds.has(p.pnrId)) return p
      if (getPnrOperationalStatus(p) !== 'PENDING') return p
      return { ...p, pnrStatus: 'ACTIVE' as const, activatedAt: now, activatedBy: 'System' }
    })
    const log: DemoLog = { logId: newId('LOG'), action: 'เปิดใช้งาน PNR (bulk)', message: `เปิดใช้งาน ${pnrIds.size} PNR พร้อมกัน`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setSelectedPnrIds(new Set())
    showToast(`เปิดใช้งาน ${pnrIds.size} PNR สำเร็จ`)
  }

  const handleBulkClosePnr = (pnrIds: Set<string>) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p => {
      if (!pnrIds.has(p.pnrId)) return p
      if (getPnrOperationalStatus(p) !== 'ACTIVE') return p
      return { ...p, pnrStatus: 'CLOSED' as const, closedAt: now, closedBy: 'System' }
    })
    const log: DemoLog = { logId: newId('LOG'), action: 'ปิด PNR (bulk)', message: `ปิด ${pnrIds.size} PNR พร้อมกัน`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setSelectedPnrIds(new Set())
    showToast(`ปิด ${pnrIds.size} PNR สำเร็จ`)
  }

  const handleBulkCancelPnr = (pnrIds: Set<string>, reason: string) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p => {
      if (!pnrIds.has(p.pnrId)) return p
      const opStatus = getPnrOperationalStatus(p)
      if (opStatus !== 'PENDING' && opStatus !== 'ACTIVE') return p
      return { ...p, pnrStatus: 'CANCELLED' as const, cancelledAt: now, cancelledBy: 'System', cancellationReason: reason }
    })
    const log: DemoLog = { logId: newId('LOG'), action: 'ยกเลิก PNR (bulk)', message: `ยกเลิก ${pnrIds.size} PNR พร้อมกัน — เหตุผล: ${reason}`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setSelectedPnrIds(new Set())
    showToast(`ยกเลิก ${pnrIds.size} PNR สำเร็จ`)
  }

  const handleConvertToReal = () => {
    if (!liveStock || !convertingPnr) return
    if (!convertCode.trim()) { setConvertError('กรุณาระบุ PNR Code'); return }
    const dup = checkPNRDuplicatesInSystem([{ pnr_code: convertCode.trim() }])
    if (dup.hasConflicts) {
      const s = dup.conflicts[0]?.conflictingStock
      setConvertError(s ? `PNR "${convertCode}" มีอยู่ใน Stock ${s.stockCode}` : `PNR "${convertCode}" มีอยู่แล้วในระบบ`)
      return
    }
    const now = new Date().toISOString()
    const log: DemoLog = { logId: newId('LOG'), action: 'เปลี่ยน Dummy → PNR', message: `${convertingPnr.dummyPnr} → ${convertCode.trim()}`, createdAt: now, createdBy: 'System' }
    const updated_pnr: DemoPNR = { ...convertingPnr, pnrCode: convertCode.trim(), dummyPnr: '', pnrType: 'real', pnrDisplay: convertCode.trim() }
    const newPnrs = liveStock.pnrs.map(p => p.pnrId === convertingPnr.pnrId ? updated_pnr : p)
    const updated: DemoStock = { ...liveStock, pnrs: newPnrs, summary: calculateStockSummary(newPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setShowConvertModal(false)
    setConvertingPnr(null)
    setConvertCode('')
    setConvertError('')
    showToast('เปลี่ยนเป็น PNR สำเร็จ')
  }

  // Derive PNRRow[] display
  const liveFlightSets = liveStock ? getStockFlightSets(liveStock) : []

  // Build route text from flight set sectors → stock sectors → stock routeText
  const buildPnrRoute = (pnr: DemoPNR): string | null => {
    const fs = liveFlightSets.find(f => f.flightSetId === pnr.flightSetId) ?? liveFlightSets[0]
    const fsSectors = fs?.sectors
    if (fsSectors && fsSectors.length > 0) {
      const sorted = [...fsSectors].sort((a, b) => a.seq - b.seq)
      const route = buildRouteText(sorted.map(s => ({ dep_airport_code: s.depAirportCode, arr_airport_code: s.arrAirportCode })))
      if (route) return route
    }
    if (liveStock?.sectors && liveStock.sectors.length > 0) {
      const route = buildRouteText(liveStock.sectors.map(s => ({ dep_airport_code: s.depAirportCode, arr_airport_code: s.arrAirportCode })))
      if (route) return route
    }
    return liveStock?.routeText || null
  }

  const pnrRows: PNRRow[] = liveStock
    ? liveStock.pnrs.map(p => ({
        id: p.pnrId,
        pnr_code: p.pnrCode || null,
        dummy_pnr: p.dummyPnr || null,
        pnr_type: p.pnrType,
        route: buildPnrRoute(p),
        travel_start: p.travelStart,
        travel_end: p.travelEnd,
        seat_total: p.seatTotal,
        seat_used: p.seatUsed,
        seat_balance: p.seatBalance,
        price_format: p.priceFormat ?? 'FARE',
        breakdown: p.breakdown ?? false,
        fare: p.fare,
        yq: p.yq ?? 0,
        tax_type: p.taxType,
        tax: p.tax ?? 0,
        total_amount: p.total,
        condition: liveStock.conditions.find(c => c.condition.conditionCode === p.conditionCode)?.condition.conditionName || null,
        condition_code: p.conditionCode || null,
        next_ttl: p.ttlDateTime,
        ttl_type: p.ttlType ?? null,
        ttl_days_before: p.ttlDaysBefore ?? null,
        ttl_date: p.ttlDate,
        ttl_time: p.ttlTime,
        status: p.status,
      }))
    : mockPNRs

  const conditions = liveStock?.conditions ?? []
  const pnrStatuses = ['Pending', 'Confirmed']
  const pnrStatusLabels: Record<string, string> = { Pending: 'รอยืนยัน', Confirmed: 'ยืนยันแล้ว' }

  const activeConditions = conditions.filter(c => c.condition.status === 'Active')
  const noCond = (liveStock?.pnrs ?? []).filter(p => !p.conditionCode)

  const applyConditionChange = (pnrIds: string[], newCode: string) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const condName = conditions.find(c => c.condition.conditionCode === newCode)?.condition.conditionName ?? newCode
    const updatedPnrs = liveStock.pnrs.map(p => {
      if (!pnrIds.includes(p.pnrId)) return p
      return { ...p, conditionCode: newCode }
    })
    const log: DemoLog = {
      logId: newId('LOG'),
      action: 'เปลี่ยน Condition',
      message: newCode ? `เปลี่ยน Condition เป็น "${condName}" (${pnrIds.length} PNR)` : `ลบ Condition ออก (${pnrIds.length} PNR)`,
      createdAt: now, createdBy: 'System',
    }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setSelectedPnrIds(new Set())
    setCondChangeConfirm(null)
    setShowBulkCond(false)
    showToast(newCode ? `เปลี่ยน Condition เป็น "${condName}" (${pnrIds.length} PNR)` : `ลบ Condition ออก (${pnrIds.length} PNR)`)
  }

  // Build singlePnrConditions for the modal
  const singlePnrConditions: PnrModalCondition[] = (liveStock?.conditions ?? [])
    .filter(c => c.condition.status === 'Active')
    .map(c => ({
      code: c.condition.conditionCode,
      name: c.condition.conditionName,
      ttlRule: c.condition.ttlRule ? {
        calcType: c.condition.ttlRule.calcType as 'TRAVEL_MINUS_DAYS' | 'FIXED_DATE' | 'NONE',
        daysBefore: c.condition.ttlRule.daysBefore ?? null,
        fixedDate: c.condition.ttlRule.fixedDate ?? null,
        time: c.condition.ttlRule.time ?? null,
      } : undefined,
    }))

  const singlePnrDefaultCondCode = (() => {
    const active = (liveStock?.conditions ?? []).filter(c => c.condition.status === 'Active')
    if (active.length === 1) return active[0].condition.conditionCode
    return liveStock?.defaultConditionCode || ''
  })()

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2 text-sm text-[#05a94f] bg-green-50 border border-green-200 rounded-xl px-3 py-2">
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      {/* Action Bar */}
      {canEdit && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" icon={<PlusCircle size={13} />} onClick={openAdd}>เพิ่ม PNR</Button>
            <Button size="sm" variant="outline" icon={<PlusSquare size={13} />} onClick={() => setShowBulkAdd(true)}>เพิ่มหลาย PNR</Button>
            <Button size="sm" variant="outline" disabled title="Coming soon">Import PNR</Button>
            {selectedPnrIds.size > 0 && (
              <>
                <span className="text-xs text-slate-500 ml-1">เลือก {selectedPnrIds.size} PNR</span>
                <Button size="sm" variant="outline" onClick={() => { setBulkCondCode(''); setShowBulkCond(true) }}>
                  เปลี่ยน Condition
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => handleBulkActivatePnr(selectedPnrIds)}
                  className="border-green-300 text-green-700 hover:bg-green-50">
                  เปิดใช้งาน
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => handleBulkClosePnr(selectedPnrIds)}
                  className="border-slate-400 text-slate-600 hover:bg-slate-50">
                  ปิด PNR
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => { setBulkCancelReason(''); setBulkCancelReasonError(''); setShowBulkCancel(true) }}
                  className="border-red-300 text-red-600 hover:bg-red-50">
                  ยกเลิก PNR
                </Button>
                <button onClick={() => setSelectedPnrIds(new Set())} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                  <X size={12} />
                </button>
              </>
            )}
          </div>
          {noCond.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              <AlertTriangle size={12} />
              <span>{noCond.length} PNR ยังไม่ได้ระบุ Condition</span>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 h-9">
                {canEdit && (
                  <th className="sticky left-0 z-20 bg-slate-50 w-8 px-2 text-center border-r border-slate-100">
                    <input
                      type="checkbox"
                      checked={pnrRows.length > 0 && selectedPnrIds.size === pnrRows.length}
                      ref={el => { if (el) el.indeterminate = selectedPnrIds.size > 0 && selectedPnrIds.size < pnrRows.length }}
                      onChange={e => setSelectedPnrIds(e.target.checked ? new Set(pnrRows.map(r => r.id)) : new Set())}
                      className="rounded border-slate-300 accent-[#05a94f]"
                    />
                  </th>
                )}
                <th className={`${canEdit ? 'sticky left-8 z-20' : 'sticky left-0 z-20'} bg-slate-50 min-w-[190px] px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap border-r border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.04)]`}>PNR</th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[50px]">Sec</th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[48px]">Day</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[80px]">Dep Date</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[64px]">Dep Time</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[80px]">Arr Date</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[64px]">Arr Time</th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[48px]">+Day</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[48px]">Seat</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[48px]">Used</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[55px]">Bal.</th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[85px]">ประเภทราคา</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[75px]">ราคา</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[65px]">Tax</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[65px]">YQ</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[140px]">Condition</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[115px]">NAME DL</th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[90px]">การยืนยัน</th>
                {canEdit && (
                  <th className="sticky right-0 z-20 bg-slate-50 w-[64px] px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-l border-slate-200 shadow-[-2px_0_4px_rgba(0,0,0,0.04)]">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {pnrRows.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 20 : 18} className="px-4 py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูล PNR</td>
                </tr>
              ) : (
                pnrRows.map((p, pIdx) => {
                  const demoPnr = liveStock?.pnrs.find(dp => dp.pnrId === p.id)
                  const allFS = liveStock ? getStockFlightSets(liveStock) : []
                  const liveFS = allFS.find(f => f.flightSetId === demoPnr?.flightSetId) ?? allFS[0]
                  const sectSched = (demoPnr && liveFS) ? getPnrSectorSchedules(demoPnr, liveFS) : []
                  const rowCount = Math.max(sectSched.length, 1)
                  const isSelected = selectedPnrIds.has(p.id)
                  const bgClass = isSelected ? 'bg-emerald-50/40' : 'bg-white'
                  const sectorRows: (typeof sectSched[0] | null)[] = sectSched.length > 0 ? sectSched : [null]

                  return (
                    <Fragment key={p.id}>
                      {sectorRows.map((sc, si) => {
                        const isFirstRow = si === 0
                        const rowBorderClass = isFirstRow
                          ? (pIdx === 0 ? '' : 'border-t border-slate-200')
                          : 'border-t border-slate-100'

                        return (
                          <tr key={si} className={`${bgClass} hover:bg-slate-50/60 transition-colors ${rowBorderClass}`}>
                            {/* Checkbox (PNR-level, rowspan) */}
                            {isFirstRow && canEdit && (
                              <td rowSpan={rowCount} className="sticky left-0 z-10 bg-inherit w-8 px-2 text-center align-top pt-2 border-r border-slate-100">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={e => setSelectedPnrIds(prev => {
                                    const s = new Set(prev)
                                    if (e.target.checked) s.add(p.id); else s.delete(p.id)
                                    return s
                                  })}
                                  className="rounded border-slate-300 accent-[#05a94f]"
                                />
                              </td>
                            )}
                            {/* PNR cell (PNR-level, rowspan) */}
                            {isFirstRow && (
                              <td rowSpan={rowCount} className={`${canEdit ? 'sticky left-8 z-10' : 'sticky left-0 z-10'} bg-inherit min-w-[190px] px-2 py-1.5 align-top border-r border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.04)]`}>
                                <PNRCell code={p.pnr_code} dummy={p.dummy_pnr} type={p.pnr_type} route={p.route} />
                                {demoPnr?.sectorSchedules?.some(s => s.isTimeOverride || s.isDateOverride) && (
                                  <span className="inline-flex mt-1 w-fit px-1.5 py-px rounded text-[9px] font-medium bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">ปรับจาก FS</span>
                                )}
                              </td>
                            )}

                            {/* Sector badge */}
                            <td className="px-2 py-1.5 text-center">
                              {sc ? (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                  sc.sectorType === 'Departure' ? 'bg-green-100 text-green-700' :
                                  sc.sectorType === 'Arrival'   ? 'bg-purple-100 text-purple-700' :
                                                                  'bg-amber-100 text-amber-700'
                                }`}>S{sc.sequence}</span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            {/* Day */}
                            <td className="px-2 py-1.5 text-center font-semibold tracking-wide text-slate-600 whitespace-nowrap">
                              {sc?.departureDate ? (() => {
                                try {
                                  const [y, m, d] = sc.departureDate.split('-').map(Number)
                                  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(y, m - 1, d).getDay()]
                                } catch { return '—' }
                              })() : '—'}
                            </td>
                            {/* Dep Date */}
                            <td className={`px-2 py-1.5 whitespace-nowrap ${sc?.isDateOverride ? 'text-amber-700 font-medium' : ''}`} title={sc?.isDateOverride ? 'ปรับวันจาก Flight Set' : undefined}>
                              {sc?.departureDate ? formatDate(sc.departureDate) : '—'}
                              {sc?.isDateOverride && <span className="ml-0.5 text-[7px] text-amber-500 align-top leading-tight">●</span>}
                            </td>
                            {/* Dep Time */}
                            <td className={`px-2 py-1.5 whitespace-nowrap ${sc?.isTimeOverride ? 'text-amber-700 font-medium' : 'text-slate-600'}`} title={sc?.isTimeOverride ? 'ปรับเวลาจาก Flight Set' : undefined}>
                              {sc?.departureTime ? (
                                <>
                                  {sc.departureTime}
                                  {sc.isTimeOverride && <span className="ml-0.5 text-[7px] text-amber-500 align-top leading-tight">●</span>}
                                </>
                              ) : <span className="text-slate-300 italic text-[10px]">ยังไม่ระบุ</span>}
                            </td>
                            {/* Arr Date */}
                            <td className={`px-2 py-1.5 whitespace-nowrap ${sc?.isDateOverride ? 'text-amber-700 font-medium' : ''}`} title={sc?.isDateOverride ? 'ปรับวันจาก Flight Set' : undefined}>
                              {sc?.arrivalDate ? formatDate(sc.arrivalDate) : '—'}
                              {sc?.isDateOverride && <span className="ml-0.5 text-[7px] text-amber-500 align-top leading-tight">●</span>}
                            </td>
                            {/* Arr Time */}
                            <td className={`px-2 py-1.5 whitespace-nowrap ${sc?.isTimeOverride ? 'text-amber-700 font-medium' : 'text-slate-600'}`} title={sc?.isTimeOverride ? 'ปรับเวลาจาก Flight Set' : undefined}>
                              {sc?.arrivalTime ? (
                                <>
                                  {sc.arrivalTime}
                                  {sc.isTimeOverride && <span className="ml-0.5 text-[7px] text-amber-500 align-top leading-tight">●</span>}
                                </>
                              ) : <span className="text-slate-300 italic text-[10px]">ยังไม่ระบุ</span>}
                            </td>
                            {/* +Day */}
                            <td className="px-2 py-1.5 text-center whitespace-nowrap">
                              {sc
                                ? sc.plusDay > 0 ? <span className="text-amber-600 font-bold">+{sc.plusDay}</span> : <span className="text-slate-400">0</span>
                                : '—'}
                            </td>

                            {/* PNR-level cells (first row only, rowspan) */}
                            {isFirstRow && (
                              <>
                                {/* Seat */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right font-semibold align-top">{p.seat_total}</td>
                                {/* Used */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right text-slate-400 align-top">{p.seat_used}</td>
                                {/* Balance */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right align-top">
                                  <span className={`font-bold ${p.seat_balance === 0 ? 'text-red-500' : p.seat_balance / p.seat_total < 0.2 ? 'text-orange-500' : 'text-[#05a94f]'}`}>
                                    {p.seat_balance}
                                  </span>
                                </td>
                                {/* Price type */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-center align-top">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                    p.price_format === 'FARE_YQ' ? 'bg-amber-100 text-amber-700' :
                                    p.price_format === 'ALL_IN'  ? 'bg-blue-100 text-blue-700' :
                                                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {p.price_format === 'FARE_YQ' ? 'FARE+YQ' : p.price_format === 'ALL_IN' ? 'ALL IN' : 'FARE'}
                                  </span>
                                </td>
                                {/* ราคา (Fare for FARE/FARE_YQ, total_amount for ALL_IN) */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right font-semibold tabular-nums align-top">
                                  {p.price_format === 'ALL_IN'
                                    ? (p.total_amount > 0 ? formatNumber(p.total_amount) : <span className="text-slate-300">—</span>)
                                    : (p.fare > 0 ? formatNumber(p.fare) : <span className="text-slate-300">—</span>)}
                                </td>
                                {/* Tax */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right tabular-nums text-slate-600 align-top">
                                  {(p.price_format === 'ALL_IN' || p.price_format === 'FARE_YQ')
                                    ? <span className="text-slate-300">—</span>
                                    : p.tax > 0 ? formatNumber(p.tax) : <span className="text-slate-400">0</span>}
                                </td>
                                {/* YQ */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right tabular-nums text-slate-600 align-top">
                                  {p.price_format === 'ALL_IN'
                                    ? <span className="text-slate-300">—</span>
                                    : p.yq > 0 ? formatNumber(p.yq) : <span className="text-slate-400">0</span>}
                                </td>
                                {/* Condition */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 align-top">
                                  {canEdit ? (
                                    <div className="relative inline-block min-w-[110px]">
                                      <select
                                        value={p.condition_code ?? ''}
                                        onChange={e => {
                                          const v = e.target.value
                                          if (v !== (p.condition_code ?? ''))
                                            setCondChangeConfirm({ pnrIds: [p.id], newCode: v })
                                        }}
                                        className={`text-[10px] font-semibold rounded-full pl-2.5 pr-6 py-0.5 border appearance-none cursor-pointer w-full ${
                                          p.condition_code
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-400'
                                            : 'bg-slate-100 border-slate-200 text-slate-400 hover:border-slate-400'
                                        }`}
                                      >
                                        <option value="">— ไม่ระบุ —</option>
                                        {activeConditions.map(c => (
                                          <option key={c.condition.conditionCode} value={c.condition.conditionCode}>
                                            {c.condition.conditionName}
                                          </option>
                                        ))}
                                        {p.condition_code && !activeConditions.find(c => c.condition.conditionCode === p.condition_code) && (
                                          <option value={p.condition_code ?? ''}>{p.condition} (ปิดใช้งาน)</option>
                                        )}
                                      </select>
                                      <ChevronDown size={9} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                                    </div>
                                  ) : (
                                    p.condition ? <Badge variant="green">{p.condition}</Badge> : <span className="text-slate-300 italic text-[10px]">ไม่ระบุ</span>
                                  )}
                                </td>
                                {/* TTL Date — date first, then label */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-slate-700 align-top">
                                  {p.ttl_type === 'NONE' || (!p.ttl_type && !p.ttl_date) ? (
                                    <span className="text-slate-300">ไม่ระบุ</span>
                                  ) : (
                                    <div className="flex flex-col gap-0.5">
                                      {p.ttl_date && (
                                        <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">{formatTtlDisplay(p.ttl_date, p.ttl_time)}</span>
                                      )}
                                      {!p.ttl_date && p.next_ttl && (
                                        <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">{formatDateTime(p.next_ttl)}</span>
                                      )}
                                      {p.ttl_type === 'DAYS_BEFORE' && p.ttl_days_before != null && (
                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">ก่อนเดินทาง {p.ttl_days_before} วัน</span>
                                      )}
                                      {p.ttl_type === 'FIXED_DATE' && (
                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">วันที่กำหนดเอง</span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                {/* การยืนยัน */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-center align-top">
                                  <PnrConfirmationStatusBadge status={demoPnr ? getPnrConfirmationStatus(demoPnr) : 'PENDING_CONFIRMATION'} />
                                </td>
                                {/* Actions */}
                                {canEdit && (
                                  <td rowSpan={rowCount} className="sticky right-0 z-10 bg-inherit px-1.5 py-1.5 align-top border-l border-slate-200 shadow-[-2px_0_4px_rgba(0,0,0,0.04)]">
                                    {demoPnr ? (() => {
                                      const opStatus = getPnrOperationalStatus(demoPnr)
                                      const canOperate = opStatus === 'PENDING' || opStatus === 'ACTIVE'
                                      return (
                                        <div className="flex items-center gap-0.5 justify-center">
                                          {canOperate && (
                                            <button
                                              title="แก้ไข"
                                              onClick={() => openEdit(demoPnr)}
                                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                            >
                                              <Pencil size={12} />
                                            </button>
                                          )}
                                          <PnrActionMenu
                                            opStatus={opStatus}
                                            isDummy={demoPnr.pnrType === 'dummy'}
                                            canOperate={canOperate}
                                            onEditFlight={() => openEdit(demoPnr)}
                                            onDuplicate={() => handleDuplicate(demoPnr)}
                                            onConvert={() => { setConvertingPnr(demoPnr); setShowConvertModal(true) }}
                                            onResetSchedule={() => handleResetSchedule(demoPnr)}
                                            onActivate={() => handleActivatePnr(demoPnr)}
                                            onClose={() => { setClosingPnr(demoPnr); setShowClosePnrModal(true) }}
                                            onCancel={() => { setCancellingPnr(demoPnr); setCancelReason(''); setCancelReasonError(''); setShowCancelPnrModal(true) }}
                                            onDelete={() => { setDeletingPnr(demoPnr); setShowDeleteModal(true) }}
                                          />
                                        </div>
                                      )
                                    })() : <span className="text-slate-300 text-center block">—</span>}
                                  </td>
                                )}
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
      </div>

      {/* Single PNR Add/Edit Modal */}
      <SinglePnrModal
        open={showSinglePnrModal}
        onClose={closeSinglePnrModal}
        mode={editingPnr ? 'edit_pnr' : 'add_to_series'}
        flightSets={liveFlightSets}
        conditions={singlePnrConditions}
        currency={currency}
        defaultConditionCode={singlePnrDefaultCondCode}
        initialValues={editingPnr ? pnrToFormValues(editingPnr) : undefined}
        stock={liveStock ?? undefined}
        stockTitle={liveStock?.stockCode}
        onConfirm={handleSinglePnrConfirm}
      />

      {/* Delete Confirm Modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeletingPnr(null) }}
        title="ยืนยันการลบ PNR"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowDeleteModal(false); setDeletingPnr(null) }}>ยกเลิก</Button>
            <Button variant="danger" onClick={handleDeletePNR}>ยืนยันการลบ</Button>
          </>
        }
      >
        {deletingPnr && (
          <div className="space-y-3">
            <p className="text-sm">ต้องการลบ PNR <strong className="font-mono">{deletingPnr.pnrDisplay}</strong> หรือไม่?</p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs space-y-1">
              <p className="font-semibold text-red-700 flex items-center gap-1.5"><AlertTriangle size={12} /> ผลกระทบ</p>
              <ul className="space-y-0.5 text-red-600 list-disc list-inside">
                <li>ที่นั่งรวม: −{deletingPnr.seatTotal} ที่นั่ง</li>
                <li>Grand Total: −{formatNumber(deletingPnr.total, 0)} {currency}</li>
                <li>Payment Schedule ของ PNR นี้จะถูกลบทั้งหมด</li>
                <li>ประวัติ TTL และ Payment ของ PNR นี้จะไม่สามารถกู้คืนได้</li>
              </ul>
            </div>
          </div>
        )}
      </Modal>

      {/* Close PNR Modal */}
      <Modal
        open={showClosePnrModal}
        onClose={() => { setShowClosePnrModal(false); setClosingPnr(null) }}
        title="ยืนยันการปิด PNR"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowClosePnrModal(false); setClosingPnr(null) }}>ยกเลิก</Button>
            <Button onClick={handleClosePnr}>ยืนยันปิด PNR</Button>
          </>
        }
      >
        {closingPnr && (
          <div className="space-y-3">
            <p className="text-sm">ต้องการปิด PNR <strong className="font-mono">{closingPnr.pnrDisplay}</strong> หรือไม่?</p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">ผลของการปิด PNR</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>สถานะการใช้งานจะเปลี่ยนเป็น &ldquo;ปิดแล้ว&rdquo;</li>
                <li>PNR จะไม่สามารถใช้งานได้อีกจนกว่าจะเปิดใหม่</li>
                <li>ข้อมูลที่นั่งและราคายังคงบันทึกไว้</li>
              </ul>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel PNR Modal */}
      <Modal
        open={showCancelPnrModal}
        onClose={() => { setShowCancelPnrModal(false); setCancellingPnr(null); setCancelReason(''); setCancelReasonError('') }}
        title="ยกเลิก PNR"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowCancelPnrModal(false); setCancellingPnr(null); setCancelReason(''); setCancelReasonError('') }}>ปิด</Button>
            <Button variant="danger" onClick={handleCancelPnr}>ยืนยันยกเลิก PNR</Button>
          </>
        }
      >
        {cancellingPnr && (
          <div className="space-y-3">
            <p className="text-sm">ต้องการยกเลิก PNR <strong className="font-mono">{cancellingPnr.pnrDisplay}</strong> หรือไม่?</p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1">
              <p className="font-semibold flex items-center gap-1"><AlertTriangle size={11} /> คำเตือน</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>สถานะการใช้งานจะเปลี่ยนเป็น &ldquo;ยกเลิก&rdquo; ถาวร</li>
                <li>ที่นั่งที่ยังเหลืออยู่จะไม่นับในยอดรวม</li>
              </ul>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">เหตุผลการยกเลิก <span className="text-red-500">*</span></label>
              <textarea
                value={cancelReason}
                onChange={e => { setCancelReason(e.target.value); setCancelReasonError('') }}
                rows={3}
                placeholder="ระบุเหตุผลที่ยกเลิก PNR นี้..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400"
              />
              {cancelReasonError && <p className="text-xs text-red-500">{cancelReasonError}</p>}
            </div>
          </div>
        )}
      </Modal>

      {/* Convert Dummy to Real Modal */}
      <Modal
        open={showConvertModal}
        onClose={() => { setShowConvertModal(false); setConvertingPnr(null); setConvertCode(''); setConvertError('') }}
        title="เปลี่ยนเป็น PNR"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowConvertModal(false); setConvertingPnr(null); setConvertCode(''); setConvertError('') }}>ยกเลิก</Button>
            <Button onClick={handleConvertToReal}>บันทึก</Button>
          </>
        }
      >
        {convertingPnr && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">เปลี่ยน <strong className="font-mono text-amber-600">{convertingPnr.dummyPnr}</strong> เป็น PNR</p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">PNR Code <span className="text-red-500">*</span></label>
              <input
                type="text" placeholder="เช่น TG9999" value={convertCode}
                onChange={e => { setConvertCode(e.target.value); setConvertError('') }}
                className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${convertError ? 'border-red-400' : 'border-slate-300'}`}
              />
              {convertError && <p className="text-xs text-red-500 mt-1">{convertError}</p>}
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Condition Change */}
      {condChangeConfirm && (
        <Modal
          open={true}
          onClose={() => setCondChangeConfirm(null)}
          title="ยืนยันการเปลี่ยน Condition"
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setCondChangeConfirm(null)}>ยกเลิก</Button>
              <Button onClick={() => applyConditionChange(condChangeConfirm.pnrIds, condChangeConfirm.newCode)}>ดำเนินการต่อ</Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm">
              {condChangeConfirm.newCode
                ? <>เปลี่ยน Condition เป็น <strong>&ldquo;{conditions.find(c => c.condition.conditionCode === condChangeConfirm.newCode)?.condition.conditionName ?? condChangeConfirm.newCode}&rdquo;</strong> สำหรับ {condChangeConfirm.pnrIds.length} PNR</>
                : <>ลบ Condition ออกจาก {condChangeConfirm.pnrIds.length} PNR</>
              }
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-1">
              <p className="font-semibold text-amber-700 flex items-center gap-1.5"><AlertTriangle size={12} /> ผลกระทบ</p>
              <ul className="space-y-0.5 text-amber-600 list-disc list-inside">
                <li>Payment Schedule อาจเปลี่ยนแปลง</li>
                <li>เงื่อนไข Refund และ No-show จะใช้ตาม Condition ใหม่</li>
                <li>TTL ของแต่ละ PNR ยังคงเดิม — แก้ไขได้ในฟอร์ม PNR</li>
              </ul>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Condition Change Modal */}
      <Modal
        open={showBulkCond}
        onClose={() => setShowBulkCond(false)}
        title={`เปลี่ยน Condition — ${selectedPnrIds.size} PNR`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowBulkCond(false)}>ยกเลิก</Button>
            <Button
              disabled={bulkCondCode === ''}
              onClick={() => {
                setShowBulkCond(false)
                setCondChangeConfirm({ pnrIds: Array.from(selectedPnrIds), newCode: bulkCondCode })
              }}
            >
              ดำเนินการต่อ
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">เลือก Condition ที่ต้องการใช้กับ {selectedPnrIds.size} PNR ที่เลือกไว้</p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Condition <span className="text-red-500">*</span></label>
            <select
              value={bulkCondCode}
              onChange={e => setBulkCondCode(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
            >
              <option value="">— เลือก Condition —</option>
              {activeConditions.map(c => (
                <option key={c.condition.conditionCode} value={c.condition.conditionCode}>
                  {c.condition.conditionName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Bulk Cancel PNR Modal */}
      <Modal
        open={showBulkCancel}
        onClose={() => setShowBulkCancel(false)}
        title={`ยกเลิก PNR — ${selectedPnrIds.size} รายการ`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowBulkCancel(false)}>ยกเลิก</Button>
            <Button variant="danger" onClick={() => {
              if (!bulkCancelReason.trim()) { setBulkCancelReasonError('กรุณาระบุเหตุผล'); return }
              setShowBulkCancel(false)
              handleBulkCancelPnr(selectedPnrIds, bulkCancelReason.trim())
            }}>ยืนยันยกเลิก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">ยกเลิก PNR ที่เลือก <strong>{selectedPnrIds.size} รายการ</strong> หรือไม่?</p>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1">
            <p className="font-semibold flex items-center gap-1"><AlertTriangle size={11} /> ผลกระทบ</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>PNR ที่มีสถานะ PENDING หรือ ACTIVE จะถูกยกเลิกถาวร</li>
              <li>PNR ที่เป็น CLOSED/CANCELLED แล้วจะไม่ถูกกระทบ</li>
            </ul>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">เหตุผลการยกเลิก <span className="text-red-500">*</span></label>
            <textarea
              value={bulkCancelReason}
              onChange={e => { setBulkCancelReason(e.target.value); setBulkCancelReasonError('') }}
              rows={2}
              placeholder="ระบุเหตุผล..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400"
            />
            {bulkCancelReasonError && <p className="text-xs text-red-500">{bulkCancelReasonError}</p>}
          </div>
        </div>
      </Modal>

      {/* Bulk Add PNR — shared BulkPnrBuilder */}
      {liveStock && (() => {
        const builderFlightSets: BulkPnrFlightSet[] = getStockFlightSets(liveStock).map(fs => ({
          flightSetId:   fs.flightSetId,
          flightSetName: fs.flightSetName,
          sectors: fs.sectors.map(s => ({
            sectorType:     s.sectorType,
            dayOffset:      s.dayOffset,
            depAirportCode: s.depAirportCode,
            arrAirportCode: s.arrAirportCode,
            depTime:        s.depTime,
            arrTime:        s.arrTime,
            arrDayOffset:   s.arrDayOffset,
            airlineCode:    s.airlineCode,
            flightNo:       s.flightNo,
          })),
        }))
        const builderConditions: BulkPnrCondition[] = liveStock.conditions
          .filter(sc => sc.condition.status === 'Active')
          .map(sc => ({
            code:   sc.condition.conditionCode,
            name:   sc.condition.conditionName,
            stages: sc.condition.stages.map(st => ({
              paymentBaseDate:      st.dueType === 'TRAVEL_MINUS_DAYS' ? 'Travel Start' : 'Created Date',
              paymentDueDaysBefore: st.dueDays,
              paymentDueTime:       st.dueTime,
            })),
            ttlRule: {
              calcType:   sc.condition.ttlRule.calcType,
              baseDate:   'Travel Start',
              daysBefore: sc.condition.ttlRule.daysBefore,
              date:       sc.condition.ttlRule.fixedDate,
              time:       sc.condition.ttlRule.time,
            },
          }))
        return (
          <BulkPnrBuilder
            open={showBulkAdd}
            onClose={() => setShowBulkAdd(false)}
            mode="add_to_existing"
            flightSets={builderFlightSets}
            conditions={builderConditions}
            currency={currency}
            stock={liveStock}
            onSaved={(updated, count) => {
              onUpdate(updated)
              setShowBulkAdd(false)
              showToast(`เพิ่ม PNR จำนวน ${count} รายการสำเร็จ`)
            }}
          />
        )
      })()}

      {/* Price Breakdown Detail Modal */}
      <Modal
        open={!!detailPnr}
        onClose={() => setDetailPnr(null)}
        title="รายละเอียดราคา"
        size="sm"
        footer={<Button variant="ghost" onClick={() => setDetailPnr(null)}>ปิด</Button>}
      >
        {detailPnr && (() => {
          const p = detailPnr
          const fmt = p.price_format
          const sumFromDetail = p.fare + p.yq + p.tax
          const diff = Math.round(p.total_amount * 100) - Math.round(sumFromDetail * 100)
          const rows: { label: string; value: number; muted?: boolean }[] = fmt === 'FARE'
            ? [
                { label: 'Fare', value: p.fare },
                { label: 'YQ', value: p.yq },
                { label: 'Tax', value: p.tax },
              ]
            : fmt === 'FARE_YQ'
              ? [
                  { label: 'Fare + YQ (รวม)', value: p.fare },
                  { label: 'Tax', value: p.tax },
                ]
              : [
                  { label: 'Fare', value: p.fare },
                  { label: 'YQ', value: p.yq },
                  { label: 'Tax', value: p.tax },
                  { label: 'รวมจากรายละเอียด', value: sumFromDetail },
                ]
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  fmt === 'FARE' ? 'bg-slate-100 text-slate-600' : fmt === 'FARE_YQ' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {fmt === 'FARE' ? 'FARE' : fmt === 'FARE_YQ' ? 'FARE + YQ' : 'ALL IN'}
                </span>
                <span className="text-xs text-slate-500">PNR: {p.pnr_code ?? p.dummy_pnr ?? '—'}</span>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.label} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-500 text-xs">{r.label}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800 tabular-nums">
                          {formatNumber(r.value)} THB
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {fmt === 'ALL_IN' && p.breakdown && (
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                  diff === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                }`}>
                  <span>ส่วนต่าง (All In − รายละเอียด)</span>
                  <span className="font-bold tabular-nums">{diff === 0 ? '0' : (diff / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })} THB</span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                <span className="text-xs font-semibold text-slate-600">ยอดสุทธิ</span>
                <span className="text-base font-bold text-slate-800 tabular-nums">{formatNumber(p.total_amount)} THB</span>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

