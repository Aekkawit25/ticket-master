'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2, AlertTriangle, Lock, Info,
  ChevronRight, ChevronLeft, ArrowRight,
} from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import WizardLayout from '@/components/wizard/WizardLayout'
import Step1StockInfo from '@/components/wizard/Step1StockInfo'
import Step2Sectors from '@/components/wizard/Step2Sectors'
import Step3Conditions from '@/components/wizard/Step3Conditions'
import Step4PNR from '@/components/wizard/Step4PNR'
import Step5Review from '@/components/wizard/Step5Review'
import {
  UnsavedWarningModal,
  StockStatusManagementModal,
  DraftToActiveModal,
  ActiveToClosedModal,
  ClosedToActiveModal,
  CancelStockModal,
} from '@/components/wizard/StockStatusModals'
import type { DraftToActiveResult, ClosedToActiveResult } from '@/components/wizard/StockStatusModals'
import {
  validateSectors, generateDummyPnrs, formatDate,
  calcTravelEndFromSectors, calcSectorDate,
} from '@/lib/utils'
import { MASTER_AIRLINE_CODE_SET } from '@/lib/master-data'
import {
  getDemoStockById, getDemoStockByCode, getDemoStocks,
  demoStockToWizardState, wizardStateToDemoStock,
  saveDemoStock, calculateStockSummary,
  checkPNRDuplicatesInSystem, formatPNRConflictMessage,
  getPnrOperationalStatus,
} from '@/lib/demo-storage'
import type { WizardState, FlightSeriesFormData, FlightSectorFormData, FlightScheduleFormData, TripType, TicketType } from '@/types'
import type { DemoStock, DemoLog } from '@/lib/demo-storage'
import { getStockTypeConfig } from '@/lib/stock-type-config'

const CURRENT_DEMO_USER = { userId: 'u-admin', name: 'Admin User', role: 'Admin' }

// ─── Change tracking ──────────────────────────────────────────────────────────

interface ChangeItem {
  category: string
  field: string
  oldValue: string
  newValue: string
}

function computeChanges(original: DemoStock, state: WizardState): ChangeItem[] {
  const changes: ChangeItem[] = []
  const { stockInfo, schedules, conditions, pnrs } = state
  const mainSectors = schedules.find(s => s.isMain)?.sectors ?? schedules[0]?.sectors ?? []

  // ── Stock Info
  const infoMap: [string, string, string][] = [
    ['Series Name',  original.groupName,   stockInfo.group_name],
    ['Airline',      original.airlineCode, stockInfo.airline_code],
    ['Currency',     original.currency,    stockInfo.currency],
    ['Destination',  original.destination, stockInfo.destination],
    ['Remark',       original.remark,      stockInfo.remark],
  ]
  for (const [field, oldVal, newVal] of infoMap) {
    if ((oldVal ?? '') !== (newVal ?? '')) {
      changes.push({ category: 'Stock Info', field, oldValue: oldVal || '—', newValue: newVal || '—' })
    }
  }

  // ── Sectors (compare main schedule sectors vs original)
  if (original.sectors.length !== mainSectors.length) {
    changes.push({
      category: 'Flight Segments',
      field: 'จำนวน Sector',
      oldValue: `${original.sectors.length}`,
      newValue: `${mainSectors.length}`,
    })
  }
  original.sectors.forEach((os, i) => {
    const ns = mainSectors[i]
    if (!ns) return
    if (os.flightNo !== ns.flight_no)
      changes.push({ category: 'Flight Segments', field: `Sector ${i + 1} Flight No`, oldValue: os.flightNo, newValue: ns.flight_no })
    if (os.depTime !== ns.dep_time || os.arrTime !== ns.arr_time)
      changes.push({ category: 'Flight Segments', field: `Sector ${i + 1} Time`, oldValue: `${os.depTime}–${os.arrTime}`, newValue: `${ns.dep_time}–${ns.arr_time}` })
    if (os.dayOffset !== ns.day_offset)
      changes.push({ category: 'Flight Segments', field: `Sector ${i + 1} Travel Day`, oldValue: String(os.dayOffset), newValue: String(ns.day_offset) })
    if (os.depAirportCode !== ns.dep_airport_code || os.arrAirportCode !== ns.arr_airport_code)
      changes.push({ category: 'Flight Segments', field: `Sector ${i + 1} Route`, oldValue: `${os.depAirportCode}→${os.arrAirportCode}`, newValue: `${ns.dep_airport_code}→${ns.arr_airport_code}` })
  })

  // ── Conditions
  if (original.conditions.length !== conditions.length) {
    changes.push({
      category: 'Conditions',
      field: 'จำนวน Condition',
      oldValue: `${original.conditions.length}`,
      newValue: `${conditions.length}`,
    })
  }

  // ── PNRs
  if (original.pnrs.length !== pnrs.length) {
    changes.push({
      category: 'PNR',
      field: 'จำนวน PNR',
      oldValue: `${original.pnrs.length}`,
      newValue: `${pnrs.length}`,
    })
  }
  original.pnrs.forEach(op => {
    const np = pnrs.find(p =>
      (op.pnrCode && p.pnr_code === op.pnrCode) ||
      (op.dummyPnr && p.dummy_pnr === op.dummyPnr)
    )
    if (!np) return
    const label = op.pnrCode || op.dummyPnr || `PNR`
    if (op.seatTotal !== np.seat_total)
      changes.push({ category: 'PNR', field: `${label} Seat Total`, oldValue: String(op.seatTotal), newValue: String(np.seat_total) })
    if (op.fare !== np.fare)
      changes.push({ category: 'PNR', field: `${label} Fare`, oldValue: String(op.fare), newValue: String(np.fare) })
    if (op.tax !== np.tax)
      changes.push({ category: 'PNR', field: `${label} Tax`, oldValue: op.tax != null ? String(op.tax) : '—', newValue: np.tax != null ? String(np.tax) : '—' })
  })

  return changes
}

// ─── Changes card (rendered in Step 5) ───────────────────────────────────────

function ChangesCard({ changes }: { changes: ChangeItem[] }) {
  const categories = [...new Set(changes.map(c => c.category))]
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
        <ArrowRight size={14} className="text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">
          สรุปการเปลี่ยนแปลง
        </span>
        {changes.length > 0 ? (
          <span className="ml-auto inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
            {changes.length} รายการ
          </span>
        ) : (
          <span className="ml-auto inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">
            ไม่มีการเปลี่ยนแปลง
          </span>
        )}
      </div>
      {changes.length === 0 ? (
        <div className="px-4 py-5 text-sm text-slate-400 text-center">
          ข้อมูลเหมือนเดิม — ไม่มีการแก้ไข
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {categories.map(cat => (
            <div key={cat} className="px-4 py-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{cat}</p>
              <div className="space-y-1.5">
                {changes.filter(c => c.category === cat).map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-medium text-slate-600 w-40 shrink-0">{c.field}</span>
                    <span className="line-through text-slate-400 shrink-0">{c.oldValue}</span>
                    <ChevronRight size={12} className="text-slate-300 shrink-0 mt-0.5" />
                    <span className="font-semibold text-amber-700">{c.newValue}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Lock banner ──────────────────────────────────────────────────────────────

function LockBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 mb-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
      <Lock size={15} className="shrink-0 mt-0.5 text-amber-600" />
      <span>{message}</span>
    </div>
  )
}

// ─── Sector-change check ──────────────────────────────────────────────────────

function sectorsChanged(stock: DemoStock, newSchedules: FlightScheduleFormData[]): boolean {
  const newSectors = newSchedules.find(s => s.isMain)?.sectors ?? newSchedules[0]?.sectors ?? []
  if (stock.sectors.length !== newSectors.length) return true
  return stock.sectors.some((os, i) => {
    const ns = newSectors[i]
    return (
      !ns ||
      os.flightNo !== ns.flight_no ||
      os.depTime !== ns.dep_time ||
      os.arrTime !== ns.arr_time ||
      os.dayOffset !== ns.day_offset ||
      os.depAirportCode !== ns.dep_airport_code ||
      os.arrAirportCode !== ns.arr_airport_code
    )
  })
}

// ─── Pre-review normalization ─────────────────────────────────────────────────

function normalizeForReview(state: WizardState, excludeStockCode?: string): WizardState {
  const { schedules, stockInfo, pnrs } = state
  const mainSectors = schedules.find(s => s.isMain)?.sectors ?? schedules[0]?.sectors ?? []
  const systemDummies = new Set(
    getDemoStocks()
      .filter(s => s.stockCode !== (excludeStockCode ?? stockInfo.stock_code))
      .flatMap(s => s.pnrs.map(p => p.dummyPnr).filter(Boolean)),
  )
  const normalizedPNRs = pnrs.map(p => {
    const pnrSectors = p.schedule_id
      ? schedules.find(s => s.scheduleId === p.schedule_id)?.sectors ?? mainSectors
      : mainSectors
    return {
      ...p,
      travel_end: p.travel_start
        ? calcTravelEndFromSectors(p.travel_start, pnrSectors) || p.travel_end || ''
        : p.travel_end || '',
      sector_dates: p.travel_start
        ? pnrSectors.map(s => ({
            sector_type: s.sector_type,
            day_offset: s.day_offset,
            travel_date: calcSectorDate(p.travel_start, s.day_offset) || '',
          }))
        : p.sector_dates ?? [],
      total_amount: (() => {
        const f = p.fare || 0; const fmt = p.price_format ?? 'FARE'
        return fmt === 'ALL_IN' ? f : fmt === 'FARE_YQ' ? f + (p.tax ?? 0) : f + (p.tax ?? 0) + (p.yq ?? 0)
      })(),
    }
  })
  return { ...state, pnrs: generateDummyPnrs(normalizedPNRs, stockInfo, systemDummies) }
}

// ─── Page steps config ────────────────────────────────────────────────────────

function getEditPageTitle(ticketType: TicketType, groupType?: string): string {
  const cfg = getStockTypeConfig(ticketType, groupType)
  return cfg?.editTitle ?? 'Edit Stock'
}

const STEP_SUBTITLES: Record<number, string> = {
  1: 'Stock Info',
  2: 'Flight Segments / Sectors',
  3: 'Conditions ของ Stock',
  4: 'PNR และ Seat',
  5: 'Review Changes & บันทึก',
}

// ─── PNR metadata merge helper ────────────────────────────────────────────────

function mergePnrMetadata(original: DemoStock, freshPnrs: DemoStock['pnrs']): DemoStock['pnrs'] {
  return freshPnrs.map((np, i) => {
    const orig = original.pnrs.find(
      op =>
        (op.pnrCode && op.pnrCode === np.pnrCode) ||
        (op.dummyPnr && op.dummyPnr === np.dummyPnr),
    ) ?? (i < original.pnrs.length ? original.pnrs[i] : null)

    if (!orig) return np
    return {
      ...np,
      pnrId: orig.pnrId,
      seatUsed: orig.seatUsed,
      seatBalance: Math.max(0, np.seatTotal - orig.seatUsed),
      pnrStatus: orig.pnrStatus ?? 'PENDING',
      confirmationStatus: orig.confirmationStatus ?? 'PENDING_CONFIRMATION',
      activatedAt: orig.activatedAt ?? null,
      activatedBy: orig.activatedBy ?? null,
      closedAt: orig.closedAt ?? null,
      closedBy: orig.closedBy ?? null,
      cancelledAt: orig.cancelledAt ?? null,
      cancelledBy: orig.cancelledBy ?? null,
      cancellationReason: orig.cancellationReason ?? null,
      stageSnapshots: orig.stageSnapshots ?? {},
    }
  })
}

// ─── Main page ────────────────────────────────────────────────────────────────

function EditStockPageInner() {
  const params = useParams()
  const router = useRouter()
  const id = String(params.id)

  const [isMounted, setIsMounted] = useState(false)
  const [originalStock, setOriginalStock] = useState<DemoStock | null>(null)
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveMsg, setSaveMsg] = useState('')
  const [saveError, setSaveError] = useState('')

  // Dirty detection
  const [savedStateStr, setSavedStateStr] = useState('')

  // Status management modal states
  const [showUnsavedWarning, setShowUnsavedWarning]   = useState(false)
  const [showStatusManage,   setShowStatusManage]     = useState(false)
  const [showDraftToActive,  setShowDraftToActive]    = useState(false)
  const [showActiveToClose,  setShowActiveToClose]    = useState(false)
  const [showClosedToActive, setShowClosedToActive]   = useState(false)
  const [showCancelStock,    setShowCancelStock]      = useState(false)

  const [state, setState] = useState<WizardState>({
    step: 1,
    stockInfo: {
      ticket_type: 'Group', trip_type: 'Round-trip', stock_code: '',
      group_name: '', destination: '', airline_code: '',
      currency: 'THB', status: 'Draft', remark: '',
    },
    schedules: [{ scheduleId: 'SCH-A', scheduleName: 'ชุดเที่ยวบินหลัก', isMain: true, remark: '', sectors: [] }],
    conditions: [],
    pnrs: [],
  })

  // Load stock from localStorage after mount
  useEffect(() => {
    const stock = getDemoStockById(id) ?? getDemoStockByCode(id)
    setOriginalStock(stock)
    if (stock) {
      try {
        const ws = demoStockToWizardState(stock)
        setState(ws)
        setSavedStateStr(JSON.stringify(ws))
      } catch {
        // conversion error — leave blank state; user will see form with defaults
      }
    }
    setIsMounted(true)
  }, [id])

  // Derived: dirty flag
  const isDirty = savedStateStr !== '' && JSON.stringify(state) !== savedStateStr

  // Derived: locking rules based on seatUsed
  const seatUsedTotal = originalStock?.summary.seatUsed ?? 0
  const sectorsLocked = seatUsedTotal > 0
  const lockedPNRCodes = useMemo(
    () => new Set(originalStock?.pnrs.filter(p => p.seatUsed > 0).map(p => p.pnrCode || p.dummyPnr).filter(Boolean) ?? []),
    [originalStock],
  )

  // Derived: duplicate PNR check (exclude this stock's own PNRs)
  const hasDuplicatePNRs = useMemo(() => {
    if (step !== 5) return false
    const pnrsToCheck = state.pnrs.map(p => ({ pnr_code: p.pnr_code, dummy_pnr: p.dummy_pnr }))
    return checkPNRDuplicatesInSystem(pnrsToCheck, originalStock?.stockId).hasConflicts
  }, [step, state.pnrs, originalStock])

  // Derived: changes for Review step
  const changes = useMemo(() => {
    if (!originalStock || step !== 5) return []
    return computeChanges(originalStock, state)
  }, [originalStock, state, step])

  // ── Stock info updater — must be above early returns (Rules of Hooks) ───────

  const updateStockInfo = useCallback((patch: Partial<FlightSeriesFormData>) => {
    setState(prev => {
      const updated = { ...prev.stockInfo, ...patch }
      if (patch.airline_code) {
        return {
          ...prev,
          stockInfo: updated,
          schedules: prev.schedules.map(sch => ({
            ...sch,
            sectors: sch.sectors.map(s => ({
              ...s,
              airline_code: patch.airline_code!,
            })),
          })),
        }
      }
      return { ...prev, stockInfo: updated }
    })
  }, [])

  // ── Loading / not-found states (early returns must come after all hooks) ────

  if (!isMounted) {
    return (
      <AppLayout title="กำลังโหลด...">
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">กำลังโหลด...</div>
      </AppLayout>
    )
  }

  if (!originalStock) {
    return (
      <AppLayout title="ไม่พบข้อมูล">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertTriangle size={40} className="text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">ไม่พบข้อมูล Stock</p>
          <p className="text-xs text-slate-400 mt-1">รหัส: {id}</p>
          <Link href="/tickets" className="mt-5 text-sm text-[#05a94f] hover:underline">← กลับหน้ารายการ</Link>
        </div>
      </AppLayout>
    )
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!state.stockInfo.stock_code.trim()) return 'กรุณากรอก Series Code'
      if (!state.stockInfo.group_name.trim()) return 'กรุณากรอก Series Name'
      if (!state.stockInfo.airline_code) return 'กรุณาเลือก Airline'
      return null
    }
    if (s === 2) {
      // Block sector changes when seats are used
      if (sectorsLocked && sectorsChanged(originalStock, state.schedules)) {
        return `ไม่สามารถแก้ไข Flight Segments ได้ เนื่องจากมีที่นั่งที่ถูกใช้แล้ว (${seatUsedTotal} ที่นั่ง)`
      }
      const mainSch = state.schedules.find(sch => sch.isMain) ?? state.schedules[0]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sectorErr = validateSectors(mainSch?.sectors as any, state.stockInfo.ticket_type, state.stockInfo.trip_type)
      if (sectorErr) return sectorErr
      const badAirline = mainSch?.sectors.find(sec => !sec.airline_code || !MASTER_AIRLINE_CODE_SET.has(sec.airline_code))
      if (badAirline) return `Airline "${badAirline.airline_code || '—'}" ไม่พบใน Master กรุณาเลือก Airline ที่ถูกต้อง`
      const dupFlight = (() => {
        const seen = new Map<string, number>()
        for (let i = 0; i < (mainSch?.sectors ?? []).length; i++) {
          const sec = mainSch!.sectors[i]
          if (sec.airline_code && sec.flight_no) {
            const key = `${sec.airline_code}${sec.flight_no}`
            if (seen.has(key)) return { key, row1: seen.get(key)! + 1, row2: i + 1 }
            seen.set(key, i)
          }
        }
        return null
      })()
      if (dupFlight) return `พบ Flight No ซ้ำ: ${dupFlight.key} (แถวที่ ${dupFlight.row1} และ ${dupFlight.row2}) — กรุณาตรวจสอบก่อนดำเนินการต่อ`
      return null
    }
    if (s === 4) {
      for (const pnr of state.pnrs) {
        const origPNR = originalStock.pnrs.find(
          op => (op.pnrCode && op.pnrCode === pnr.pnr_code) || (op.dummyPnr && op.dummyPnr === pnr.dummy_pnr)
        )
        if (origPNR && pnr.seat_total < origPNR.seatUsed) {
          return `${origPNR.pnrDisplay}: Seat Total (${pnr.seat_total}) ต้องไม่น้อยกว่า Used (${origPNR.seatUsed})`
        }
      }
      // Block removal of booked PNRs
      for (const op of originalStock.pnrs) {
        if (op.seatUsed > 0) {
          const stillPresent = state.pnrs.some(
            p => p.pnr_code === op.pnrCode || p.dummy_pnr === op.dummyPnr
          )
          if (!stillPresent) {
            return `ไม่สามารถลบ PNR ${op.pnrDisplay} ได้ เนื่องจากมีที่นั่งที่ถูกจองแล้ว (Used: ${op.seatUsed})`
          }
        }
      }
      return null
    }
    return null
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  const goNext = () => {
    const err = validateStep(step)
    if (err) { setErrors({ _: err }); return }
    setErrors({})
    if (step === 4) {
      setState(prev => normalizeForReview(prev, originalStock?.stockCode))
    }
    setStep(s => Math.min(s + 1, 5))
  }

  const goBack = () => {
    setErrors({})
    setStep(s => Math.max(s - 1, 1))
  }

  // ── Build updated stock from current form state ──────────────────────────────

  const buildUpdatedStock = (overrides?: Partial<DemoStock>): DemoStock => {
    const now = new Date().toISOString()
    const freshStock = wizardStateToDemoStock(state)
    const mergedPNRs = mergePnrMetadata(originalStock, freshStock.pnrs)

    const changeLog =
      changes.length > 0
        ? changes.map(c => `${c.field}: "${c.oldValue}" → "${c.newValue}"`).join(' | ')
        : 'แก้ไขข้อมูล Stock (ไม่มีการเปลี่ยนแปลงค่า)'

    const newLog: DemoLog = {
      logId: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action: 'Edit Stock',
      message: changeLog,
      createdAt: now,
      createdBy: CURRENT_DEMO_USER.name,
    }

    return {
      ...freshStock,
      ...overrides,
      stockId: originalStock.stockId,
      stockCode: originalStock.stockCode,
      status: originalStock.status,       // always preserve status from storage
      closedAt: originalStock.closedAt,
      closedBy: originalStock.closedBy,
      cancelledAt: (originalStock as DemoStock & { cancelledAt?: string }).cancelledAt,
      cancelledBy: (originalStock as DemoStock & { cancelledBy?: string }).cancelledBy,
      cancellationReason: (originalStock as DemoStock & { cancellationReason?: string }).cancellationReason,
      reopenedAt: (originalStock as DemoStock & { reopenedAt?: string }).reopenedAt,
      reopenedBy: (originalStock as DemoStock & { reopenedBy?: string }).reopenedBy,
      createdAt: originalStock.createdAt,
      updatedAt: now,
      pnrs: mergedPNRs,
      summary: calculateStockSummary(mergedPNRs),
      logs: [newLog, ...originalStock.logs],
      transactions: originalStock.transactions ?? [],
    }
  }

  // ── Quick save (header button — stays on page, updates originalStock) ────────

  const doQuickSave = () => {
    const pnrsToCheck = state.pnrs.map(p => ({ pnr_code: p.pnr_code, dummy_pnr: p.dummy_pnr }))
    const dupCheck = checkPNRDuplicatesInSystem(pnrsToCheck, originalStock.stockId)
    if (dupCheck.hasConflicts) {
      setSaveError(formatPNRConflictMessage(dupCheck.conflicts))
      setTimeout(() => setSaveError(''), 7000)
      return
    }
    setSaving(true)
    try {
      const updated = buildUpdatedStock()
      saveDemoStock(updated)
      setOriginalStock(updated)
      setSavedStateStr(JSON.stringify(state))
      setSaving(false)
      setSaveMsg('บันทึกการแก้ไขสำเร็จ')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch {
      setSaving(false)
      setSaveError('เกิดข้อผิดพลาดในการบันทึก')
    }
  }

  // ── Open status management (with dirty-check) ────────────────────────────────

  const openStatusManage = () => {
    if (isDirty) {
      setShowUnsavedWarning(true)
    } else {
      setShowStatusManage(true)
    }
  }

  // ── Status transition helpers ─────────────────────────────────────────────────

  const commitStatusChange = (overrides: Partial<DemoStock>, logMessage: string) => {
    const now = new Date().toISOString()
    const log: DemoLog = {
      logId: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action: overrides.status ?? 'Status Change',
      message: logMessage,
      createdAt: now,
      createdBy: CURRENT_DEMO_USER.name,
    }
    const updated: DemoStock = {
      ...originalStock,
      ...overrides,
      updatedAt: now,
      logs: [log, ...originalStock.logs],
    }
    saveDemoStock(updated)
    setOriginalStock(updated)
    // Keep form state's status in sync
    setState(prev => ({ ...prev, stockInfo: { ...prev.stockInfo, status: updated.status } }))
  }

  const handleDraftToActive = (result: DraftToActiveResult) => {
    const now = new Date().toISOString()
    const updatedPnrs = originalStock.pnrs.map(p => {
      const opStatus = getPnrOperationalStatus(p)
      let shouldActivate = false
      if (result.scope === 'ALL_READY') {
        shouldActivate = opStatus === 'PENDING' && !!p.travelStart && p.seatTotal > 0 && !!p.fare && !!p.conditionCode
      } else if (result.scope === 'SELECTED') {
        shouldActivate = result.selectedPnrIds.includes(p.pnrId) && opStatus === 'PENDING'
      }
      if (!shouldActivate) return p
      return { ...p, pnrStatus: 'ACTIVE' as const, activatedAt: now, activatedBy: CURRENT_DEMO_USER.name }
    })

    const log: DemoLog = {
      logId: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action: 'STOCK_ACTIVATED',
      message: `เปิดใช้งาน Stock ${originalStock.stockCode} (scope: ${result.scope})`,
      createdAt: now,
      createdBy: CURRENT_DEMO_USER.name,
    }
    const updated: DemoStock = {
      ...originalStock,
      status: 'Active',
      pnrs: updatedPnrs,
      summary: calculateStockSummary(updatedPnrs),
      updatedAt: now,
      logs: [log, ...originalStock.logs],
    }
    saveDemoStock(updated)
    setOriginalStock(updated)
    setState(prev => ({ ...prev, stockInfo: { ...prev.stockInfo, status: 'Active' } }))
    setShowDraftToActive(false)
    setShowStatusManage(false)
    setSaveMsg('เปิดใช้งาน Stock สำเร็จ')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const handleActiveToClose = () => {
    const now = new Date().toISOString()
    commitStatusChange(
      { status: 'Closed', closedAt: now, closedBy: CURRENT_DEMO_USER.name },
      `ปิด Stock ${originalStock.stockCode}`,
    )
    setShowActiveToClose(false)
    setShowStatusManage(false)
    setSaveMsg('ปิด Stock สำเร็จ')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const handleClosedToActive = (result: ClosedToActiveResult) => {
    const now = new Date().toISOString()
    const updatedPnrs = originalStock.pnrs.map(p => {
      if (result.scope === 'SELECTED' && result.selectedPnrIds.includes(p.pnrId) && getPnrOperationalStatus(p) === 'PENDING') {
        return { ...p, pnrStatus: 'ACTIVE' as const, activatedAt: now, activatedBy: CURRENT_DEMO_USER.name }
      }
      return p
    })
    const log: DemoLog = {
      logId: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action: 'STOCK_REOPENED',
      message: `เปิด Stock ${originalStock.stockCode} อีกครั้ง (scope: ${result.scope})`,
      createdAt: now,
      createdBy: CURRENT_DEMO_USER.name,
    }
    const updated: DemoStock = {
      ...originalStock,
      status: 'Active',
      pnrs: updatedPnrs,
      summary: calculateStockSummary(updatedPnrs),
      updatedAt: now,
      logs: [log, ...originalStock.logs],
    }
    saveDemoStock(updated)
    setOriginalStock(updated)
    setState(prev => ({ ...prev, stockInfo: { ...prev.stockInfo, status: 'Active' } }))
    setShowClosedToActive(false)
    setShowStatusManage(false)
    setSaveMsg('เปิดใช้งาน Stock อีกครั้งสำเร็จ')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const handleCancelStock = (reason: string) => {
    const now = new Date().toISOString()
    const extended = originalStock as DemoStock & { cancelledAt?: string; cancelledBy?: string; cancellationReason?: string }
    commitStatusChange(
      { status: 'Cancelled', ...{ cancelledAt: now, cancelledBy: CURRENT_DEMO_USER.name, cancellationReason: reason } } as Partial<DemoStock>,
      `ยกเลิก Stock ${originalStock.stockCode}: ${reason}`,
    )
    // Keep extended fields on in-memory originalStock
    setOriginalStock(prev => prev ? {
      ...prev,
      status: 'Cancelled',
      ...(({ cancelledAt: now, cancelledBy: CURRENT_DEMO_USER.name, cancellationReason: reason }) as object),
      updatedAt: now,
    } as DemoStock : prev)
    setShowCancelStock(false)
    setShowStatusManage(false)
    setSaveMsg('ยกเลิก Stock สำเร็จ')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  // ── Save (Confirm & Save — go to listing after) ──────────────────────────────

  const saveChangesHandler = () => {
    const pnrsToCheck = state.pnrs.map(p => ({ pnr_code: p.pnr_code, dummy_pnr: p.dummy_pnr }))
    const dupCheck = checkPNRDuplicatesInSystem(pnrsToCheck, originalStock.stockId)
    if (dupCheck.hasConflicts) {
      setSaveError(formatPNRConflictMessage(dupCheck.conflicts))
      setTimeout(() => setSaveError(''), 7000)
      return
    }

    setSaving(true)
    try {
      const updatedStock = buildUpdatedStock()
      saveDemoStock(updatedStock)
      setSaving(false)
      setSaveMsg('บันทึกการแก้ไขสำเร็จ')
      setTimeout(() => router.push(`/tickets/${originalStock.stockId}`), 900)
    } catch {
      setSaving(false)
      setSaveError('เกิดข้อผิดพลาดในการบันทึก')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const pageTitle = getEditPageTitle(state.stockInfo.ticket_type, state.stockInfo.group_type)

  return (
    <AppLayout title={pageTitle}>
      <WizardLayout
        step={step}
        totalSteps={5}
        pageTitle={pageTitle}
        subtitle={STEP_SUBTITLES[step]}
        stockStatus={state.stockInfo.status}
        error={errors._}
        saving={saving}
        isLastStep={step === 5}
        confirmDisabled={hasDuplicatePNRs}
        cancelHref={`/tickets/${originalStock.stockId}`}
        onBack={goBack}
        onNext={goNext}
        onSaveDraft={doQuickSave}
        onConfirm={saveChangesHandler}
        onManageStatus={openStatusManage}
      >
        {/* Success toast */}
        {saveMsg && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-[#05a94f] text-white text-sm font-medium shadow-lg flex items-center gap-2">
            <CheckCircle2 size={16} />
            {saveMsg}
          </div>
        )}
        {/* Error toast */}
        {saveError && (
          <div className="fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-medium shadow-lg flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="whitespace-pre-line">{saveError}</span>
          </div>
        )}

        {/* Step 1 — Stock Info */}
        {step === 1 && (
          <Step1StockInfo
            data={state.stockInfo}
            onChange={updateStockInfo}
            errors={{}}
            isTypeLocked
            typeConfirmed
            pnrStatusList={originalStock.pnrs}
            onManageStatus={openStatusManage}
          />
        )}

        {/* Step 2 — Flight Segments (with lock warning) */}
        {step === 2 && (
          <>
            {sectorsLocked && (
              <LockBanner
                message={`Flight Segments ถูกล็อค — มีที่นั่งที่ถูกใช้แล้ว ${seatUsedTotal} ที่นั่ง การแก้ไข Sector จะถูกปฏิเสธเมื่อกด ถัดไป`}
              />
            )}
            <Step2Sectors
              schedules={state.schedules}
              onChange={schedules => setState(prev => ({ ...prev, schedules }))}
              ticketType={state.stockInfo.ticket_type}
              tripType={state.stockInfo.trip_type}
              airlineCode={state.stockInfo.airline_code}
              onTripTypeChange={tripType =>
                setState(prev => ({ ...prev, stockInfo: { ...prev.stockInfo, trip_type: tripType } }))
              }
            />
          </>
        )}

        {/* Step 3 — Conditions */}
        {step === 3 && (() => {
          const mainSch = state.schedules.find((s: import('@/types').FlightScheduleFormData) => s.isMain) ?? state.schedules[0]
          const routes = (mainSch?.sectors ?? [])
            .filter((s: import('@/types').FlightSectorFormData) => s.dep_airport_code && s.arr_airport_code)
            .map((s: import('@/types').FlightSectorFormData) => `${s.dep_airport_code}-${s.arr_airport_code}`)
            .filter((r: string, i: number, arr: string[]) => arr.indexOf(r) === i)
          return (
            <Step3Conditions
              conditions={state.conditions}
              onChange={conditions => setState(prev => ({ ...prev, conditions }))}
              currency={state.stockInfo.currency}
              conditionMode="series"
              seriesInfo={{
                seriesCode:  state.stockInfo.stock_code,
                seriesName:  state.stockInfo.group_name,
                airlineCode: state.stockInfo.airline_code,
                currency:    state.stockInfo.currency,
                routes,
              }}
            />
          )
        })()}

        {/* Step 4 — PNR (with booked-PNR warning) */}
        {step === 4 && (
          <>
            {lockedPNRCodes.size > 0 && (
              <LockBanner
                message={`PNR ที่มีการจองแล้วไม่สามารถลบได้: ${[...lockedPNRCodes].join(', ')} — แก้ไขค่าอื่น ๆ ได้ตามปกติ`}
              />
            )}
            {seatUsedTotal > 0 && (
              <div className="flex items-start gap-2.5 mb-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                <Info size={15} className="shrink-0 mt-0.5 text-blue-600" />
                <span>
                  Seat Total ต้องไม่น้อยกว่า Used Seat ของแต่ละ PNR
                </span>
              </div>
            )}
            <Step4PNR
              pnrs={state.pnrs}
              schedules={state.schedules}
              conditions={state.conditions}
              currency={state.stockInfo.currency}
              onChange={pnrs => setState(prev => ({ ...prev, pnrs }))}
            />
          </>
        )}

        {/* Step 5 — Review Changes */}
        {step === 5 && (
          <div className="space-y-4">
            <ChangesCard changes={changes} />
            <Step5Review state={state} excludeStockId={originalStock.stockId} />
          </div>
        )}
      </WizardLayout>

      {/* ── Status Management Modals ── */}
      <UnsavedWarningModal
        open={showUnsavedWarning}
        onBack={() => setShowUnsavedWarning(false)}
        onSaveAndContinue={() => {
          setShowUnsavedWarning(false)
          doQuickSave()
          setShowStatusManage(true)
        }}
        onDiscardAndContinue={() => {
          setShowUnsavedWarning(false)
          setShowStatusManage(true)
        }}
      />
      <StockStatusManagementModal
        open={showStatusManage}
        onClose={() => setShowStatusManage(false)}
        stock={originalStock}
        onDraftToActive={() => { setShowStatusManage(false); setShowDraftToActive(true) }}
        onActiveToClose={() => { setShowStatusManage(false); setShowActiveToClose(true) }}
        onClosedToActive={() => { setShowStatusManage(false); setShowClosedToActive(true) }}
        onAnyToCancel={() => { setShowStatusManage(false); setShowCancelStock(true) }}
      />
      <DraftToActiveModal
        open={showDraftToActive}
        onClose={() => setShowDraftToActive(false)}
        stock={originalStock}
        onConfirm={handleDraftToActive}
      />
      <ActiveToClosedModal
        open={showActiveToClose}
        onClose={() => setShowActiveToClose(false)}
        stock={originalStock}
        onConfirm={handleActiveToClose}
      />
      <ClosedToActiveModal
        open={showClosedToActive}
        onClose={() => setShowClosedToActive(false)}
        stock={originalStock}
        onConfirm={handleClosedToActive}
      />
      <CancelStockModal
        open={showCancelStock}
        onClose={() => setShowCancelStock(false)}
        stock={originalStock}
        onConfirm={handleCancelStock}
      />
    </AppLayout>
  )
}

export default function EditStockPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24 text-slate-400 text-sm">กำลังโหลด...</div>}>
      <EditStockPageInner />
    </Suspense>
  )
}
