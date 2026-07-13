'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, XCircle, Archive, ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { StockStatusBadge, PnrOperationalStatusBadge } from '@/components/ui/badge'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { DemoStock, DemoPNR } from '@/lib/demo-storage'
import { getPnrOperationalStatus } from '@/lib/demo-storage'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPnrCodeTypeLabel(pnr: DemoPNR): string {
  if (pnr.pnrCode?.trim()) return 'Real PNR'
  if (pnr.dummyPnr?.trim()) return 'Dummy PNR'
  return 'รอ PNR'
}

function checkPnrReadiness(pnr: DemoPNR): {
  isAlreadyActive: boolean
  ready: boolean
  reasons: string[]
} {
  const opStatus = getPnrOperationalStatus(pnr)
  if (opStatus === 'ACTIVE')    return { isAlreadyActive: true,  ready: false, reasons: [] }
  if (opStatus === 'CLOSED')    return { isAlreadyActive: false, ready: false, reasons: ['PNR ถูกปิดแล้ว'] }
  if (opStatus === 'CANCELLED') return { isAlreadyActive: false, ready: false, reasons: ['PNR ถูกยกเลิกแล้ว'] }

  const reasons: string[] = []
  if (!pnr.travelStart)      reasons.push('ไม่มีวันเดินทาง')
  if (pnr.seatTotal <= 0)    reasons.push('ที่นั่ง = 0')
  if (!pnr.fare)             reasons.push('ไม่มีราคา Fare')
  if (!pnr.conditionCode)    reasons.push('ไม่ระบุ Condition')
  return { isAlreadyActive: false, ready: reasons.length === 0, reasons }
}

// ─── Unsaved Warning Modal ─────────────────────────────────────────────────────

interface UnsavedWarningModalProps {
  open: boolean
  onBack: () => void
  onSaveAndContinue: () => void
  onDiscardAndContinue: () => void
}

export function UnsavedWarningModal({
  open, onBack, onSaveAndContinue, onDiscardAndContinue,
}: UnsavedWarningModalProps) {
  return (
    <Modal open={open} onClose={onBack} title="มีการเปลี่ยนแปลงที่ยังไม่บันทึก" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800">
            มีการเปลี่ยนแปลงข้อมูลที่ยังไม่ได้บันทึก
            หากดำเนินการต่อโดยไม่บันทึก ข้อมูลที่แก้ไขจะหายไป
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="outline" className="w-full justify-center" onClick={onBack}>
            ย้อนกลับ (บันทึกก่อน)
          </Button>
          <Button className="w-full justify-center" onClick={onSaveAndContinue}>
            บันทึกแล้วดำเนินการต่อ
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-center text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={onDiscardAndContinue}
          >
            ดำเนินการต่อโดยไม่บันทึก
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Status Management (dispatch) Modal ───────────────────────────────────────

interface ManagementModalProps {
  open: boolean
  onClose: () => void
  stock: DemoStock
  onDraftToActive: () => void
  onActiveToClose: () => void
  onClosedToActive: () => void
  onAnyToCancel: () => void
}

type TransitionVariant = 'success' | 'outline' | 'danger'
interface Transition { label: string; action: string; variant: TransitionVariant }

const TRANSITION_MAP: Record<string, Transition[]> = {
  Draft: [
    { label: 'เปิดใช้งาน Stock',  action: 'activate', variant: 'success' },
    { label: 'ยกเลิก Stock',      action: 'cancel',   variant: 'danger'  },
  ],
  Active: [
    { label: 'ปิด Stock',         action: 'close',    variant: 'outline' },
    { label: 'ยกเลิก Stock',      action: 'cancel',   variant: 'danger'  },
  ],
  Closed: [
    { label: 'เปิดใช้งานอีกครั้ง', action: 'reopen',  variant: 'success' },
    { label: 'ยกเลิก Stock',      action: 'cancel',   variant: 'danger'  },
  ],
  Reopened: [
    { label: 'ปิด Stock',         action: 'close',    variant: 'outline' },
    { label: 'ยกเลิก Stock',      action: 'cancel',   variant: 'danger'  },
  ],
  Cancelled: [],
}

export function StockStatusManagementModal({
  open, onClose, stock,
  onDraftToActive, onActiveToClose, onClosedToActive, onAnyToCancel,
}: ManagementModalProps) {
  const transitions = TRANSITION_MAP[stock.status] ?? []

  const handleAction = (action: string) => {
    if (action === 'activate') onDraftToActive()
    else if (action === 'close')  onActiveToClose()
    else if (action === 'reopen') onClosedToActive()
    else if (action === 'cancel') onAnyToCancel()
  }

  return (
    <Modal open={open} onClose={onClose} title="จัดการสถานะ Stock" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>สถานะปัจจุบัน:</span>
          <StockStatusBadge status={stock.status} />
        </div>
        <div className="text-xs text-slate-500">
          <span className="font-medium text-slate-700">{stock.stockCode}</span>
          {' — '}{stock.groupName}
        </div>

        {transitions.length === 0 ? (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-4 text-sm text-slate-500 text-center">
            Stock ที่ถูกยกเลิกไม่สามารถเปลี่ยนสถานะได้อีก
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">เปลี่ยนสถานะ:</p>
            {transitions.map(t => (
              <button
                key={t.action}
                type="button"
                onClick={() => handleAction(t.action)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                  t.variant === 'success'
                    ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                    : t.variant === 'danger'
                      ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {t.label}
                <ChevronRight size={15} className="opacity-50" />
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>ปิด</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Draft → Active Modal ──────────────────────────────────────────────────────

export type PnrActivationScope = 'STOCK_ONLY' | 'ALL_READY' | 'SELECTED'

export interface DraftToActiveResult {
  scope: PnrActivationScope
  selectedPnrIds: string[]
}

interface DraftToActiveModalProps {
  open: boolean
  onClose: () => void
  stock: DemoStock
  onConfirm: (result: DraftToActiveResult) => void
}

export function DraftToActiveModal({ open, onClose, stock, onConfirm }: DraftToActiveModalProps) {
  const [scope, setScope] = useState<PnrActivationScope>('ALL_READY')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const pnrInfos = stock.pnrs.map(p => ({
    pnr: p,
    codeType: getPnrCodeTypeLabel(p),
    ...checkPnrReadiness(p),
  }))

  const readyCount       = pnrInfos.filter(pi => pi.ready && !pi.isAlreadyActive).length
  const alreadyActiveCount = pnrInfos.filter(pi => pi.isAlreadyActive).length

  const togglePnr = (pnrId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(pnrId)) next.delete(pnrId)
      else next.add(pnrId)
      return next
    })
  }

  const canConfirm =
    scope === 'STOCK_ONLY' ||
    (scope === 'ALL_READY'  && readyCount > 0) ||
    (scope === 'SELECTED'   && selectedIds.size > 0)

  const handleClose = () => {
    setScope('ALL_READY')
    setSelectedIds(new Set())
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="เปิดใช้งาน Stock" size="xl">
      <div className="space-y-4">
        <div className="text-sm text-slate-600">
          <span className="font-mono font-medium text-slate-800">{stock.stockCode}</span>
          {' — '}{stock.groupName}
        </div>

        {/* Scope selector */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-700">เลือกขอบเขตการเปิดใช้งาน:</p>
          {([
            {
              value: 'STOCK_ONLY' as const,
              label: 'เปลี่ยนสถานะ Stock เท่านั้น',
              desc: 'PNR ทั้งหมดยังคงสถานะเดิม (PENDING)',
            },
            {
              value: 'ALL_READY' as const,
              label: 'เปิดใช้งาน PNR ที่พร้อมทั้งหมด',
              desc: `PNR พร้อม ${readyCount} รายการ จาก ${stock.pnrs.length - alreadyActiveCount} รายการที่รอใช้งาน`,
            },
            {
              value: 'SELECTED' as const,
              label: 'เลือก PNR ที่ต้องการเปิดใช้งาน',
              desc: 'เลือกได้จากตารางด้านล่าง',
            },
          ] as const).map(opt => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                scope === opt.value
                  ? 'border-green-400 bg-green-50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="activation-scope"
                value={opt.value}
                checked={scope === opt.value}
                onChange={() => setScope(opt.value)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {/* PNR review table */}
        {scope !== 'STOCK_ONLY' && stock.pnrs.length > 0 && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr>
                    {scope === 'SELECTED' && <th className="px-3 py-2 text-left w-8"></th>}
                    <th className="px-3 py-2 text-left">PNR</th>
                    <th className="px-3 py-2 text-left">วันเดินทาง</th>
                    <th className="px-3 py-2 text-right">ที่นั่ง</th>
                    <th className="px-3 py-2 text-left">ประเภท</th>
                    <th className="px-3 py-2 text-left">สถานะ Op</th>
                    <th className="px-3 py-2 text-left">Condition</th>
                    <th className="px-3 py-2 text-left">ความพร้อม</th>
                    <th className="px-3 py-2 text-left">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {pnrInfos.map(({ pnr, isAlreadyActive, ready, reasons, codeType }) => (
                    <tr
                      key={pnr.pnrId}
                      className={`border-b border-slate-100 ${
                        isAlreadyActive ? 'bg-green-50/60 opacity-60' : !ready ? 'bg-red-50/30' : ''
                      }`}
                    >
                      {scope === 'SELECTED' && (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            disabled={isAlreadyActive || !ready}
                            checked={selectedIds.has(pnr.pnrId)}
                            onChange={() => togglePnr(pnr.pnrId)}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 font-mono">{pnr.pnrDisplay || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {pnr.travelStart ? formatDate(pnr.travelStart) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">{pnr.seatTotal}</td>
                      <td className="px-3 py-2 text-slate-500">{codeType}</td>
                      <td className="px-3 py-2">
                        {isAlreadyActive
                          ? <span className="text-green-600 font-medium">ใช้งานแล้ว</span>
                          : <PnrOperationalStatusBadge status={getPnrOperationalStatus(pnr)} />
                        }
                      </td>
                      <td className="px-3 py-2 text-slate-500">{pnr.conditionCode || '—'}</td>
                      <td className="px-3 py-2">
                        {isAlreadyActive
                          ? <span className="text-slate-400">—</span>
                          : ready
                            ? <span className="flex items-center gap-1 text-green-600 font-medium"><CheckCircle2 size={11} /> พร้อม</span>
                            : <span className="flex items-center gap-1 text-red-600 font-medium"><XCircle size={11} /> ไม่พร้อม</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-slate-400">{reasons.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="ghost" onClick={handleClose}>ยกเลิก</Button>
          <Button
            variant="success"
            disabled={!canConfirm}
            icon={<CheckCircle2 size={14} />}
            onClick={() => onConfirm({ scope, selectedPnrIds: Array.from(selectedIds) })}
          >
            ยืนยันเปิดใช้งาน
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Active → Closed Modal ─────────────────────────────────────────────────────

interface ActiveToClosedModalProps {
  open: boolean
  onClose: () => void
  stock: DemoStock
  onConfirm: () => void
}

export function ActiveToClosedModal({ open, onClose, stock, onConfirm }: ActiveToClosedModalProps) {
  const counts = stock.pnrs.reduce<Record<string, number>>((acc, p) => {
    const s = getPnrOperationalStatus(p)
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  return (
    <Modal open={open} onClose={onClose} title="ปิด Stock" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          ต้องการปิด Stock <strong className="font-mono">{stock.stockCode}</strong> หรือไม่?
          Stock ที่ถูกปิดจะไม่รับการจองใหม่
        </p>

        <div className="rounded-xl border border-slate-200 p-3 text-xs space-y-1.5">
          <p className="font-medium text-slate-700 mb-2">สรุป PNR ({stock.pnrs.length} รายการ):</p>
          {(counts.PENDING  ?? 0) > 0 && <p className="text-slate-600">• รอใช้งาน: {counts.PENDING} รายการ</p>}
          {(counts.ACTIVE   ?? 0) > 0 && <p className="text-slate-600">• ใช้งาน: {counts.ACTIVE} รายการ</p>}
          {(counts.CLOSED   ?? 0) > 0 && <p className="text-slate-600">• ปิดแล้ว: {counts.CLOSED} รายการ</p>}
          {(counts.CANCELLED ?? 0) > 0 && <p className="text-slate-600">• ยกเลิก: {counts.CANCELLED} รายการ</p>}
          {stock.pnrs.length === 0 && <p className="text-slate-400">ไม่มี PNR</p>}
          <p className="text-slate-400 mt-2 pt-2 border-t border-slate-100">
            สถานะของ PNR จะไม่ถูกเปลี่ยน — เฉพาะสถานะ Stock เท่านั้น
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button
            variant="outline"
            icon={<Archive size={14} />}
            onClick={onConfirm}
            className="border-slate-600 text-slate-700 hover:bg-slate-50"
          >
            ยืนยันปิด Stock
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Closed → Active Modal ─────────────────────────────────────────────────────

export interface ClosedToActiveResult {
  scope: 'STOCK_ONLY' | 'SELECTED'
  selectedPnrIds: string[]
}

interface ClosedToActiveModalProps {
  open: boolean
  onClose: () => void
  stock: DemoStock
  onConfirm: (result: ClosedToActiveResult) => void
}

export function ClosedToActiveModal({ open, onClose, stock, onConfirm }: ClosedToActiveModalProps) {
  const [scope, setScope]         = useState<'STOCK_ONLY' | 'SELECTED'>('STOCK_ONLY')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const pendingPnrs = stock.pnrs.filter(p => getPnrOperationalStatus(p) === 'PENDING')

  const togglePnr = (pnrId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(pnrId)) next.delete(pnrId)
      else next.add(pnrId)
      return next
    })
  }

  const handleClose = () => {
    setScope('STOCK_ONLY')
    setSelectedIds(new Set())
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="เปิดใช้งาน Stock อีกครั้ง" size="md">
      <div className="space-y-4">
        {stock.closedAt && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            ปิดเมื่อ {formatDateTime(stock.closedAt)}
            {stock.closedBy && ` โดย ${stock.closedBy}`}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-700">เลือกขอบเขต:</p>
          {([
            {
              value: 'STOCK_ONLY' as const,
              label: 'เปลี่ยนสถานะ Stock เท่านั้น',
              desc: 'PNR ที่ PENDING จะยังคงสถานะ PENDING',
            },
            {
              value: 'SELECTED' as const,
              label: 'เลือก PNR ที่ต้องการเปิดใช้งาน',
              desc: `${pendingPnrs.length} PNR ที่รอใช้งาน`,
            },
          ] as const).map(opt => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                scope === opt.value
                  ? 'border-green-400 bg-green-50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="reopen-scope"
                value={opt.value}
                checked={scope === opt.value}
                onChange={() => setScope(opt.value)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {scope === 'SELECTED' && pendingPnrs.length > 0 && (
          <div className="rounded-xl border border-slate-200 overflow-hidden max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left w-8"></th>
                  <th className="px-3 py-2 text-left">PNR</th>
                  <th className="px-3 py-2 text-left">วันเดินทาง</th>
                  <th className="px-3 py-2 text-right">ที่นั่ง</th>
                </tr>
              </thead>
              <tbody>
                {pendingPnrs.map(pnr => (
                  <tr key={pnr.pnrId} className="border-b border-slate-100">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(pnr.pnrId)}
                        onChange={() => togglePnr(pnr.pnrId)}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono">{pnr.pnrDisplay || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {pnr.travelStart ? formatDate(pnr.travelStart) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">{pnr.seatTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {scope === 'SELECTED' && pendingPnrs.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-2">ไม่มี PNR ที่รอใช้งาน</p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="ghost" onClick={handleClose}>ยกเลิก</Button>
          <Button
            variant="success"
            icon={<CheckCircle2 size={14} />}
            disabled={scope === 'SELECTED' && selectedIds.size === 0}
            onClick={() => onConfirm({ scope, selectedPnrIds: Array.from(selectedIds) })}
          >
            ยืนยันเปิดใช้งาน
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Cancel Stock Modal ────────────────────────────────────────────────────────

interface CancelStockModalProps {
  open: boolean
  onClose: () => void
  stock: DemoStock
  onConfirm: (reason: string) => void
}

export function CancelStockModal({ open, onClose, stock, onConfirm }: CancelStockModalProps) {
  const [reason, setReason] = useState('')
  const [error,  setError]  = useState('')

  const handleConfirm = () => {
    if (!reason.trim()) { setError('กรุณากรอกเหตุผลในการยกเลิก'); return }
    onConfirm(reason.trim())
  }

  const handleClose = () => { setReason(''); setError(''); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title="ยกเลิก Stock" size="sm">
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          <p className="font-medium mb-1">คำเตือน</p>
          <p>
            การยกเลิก Stock <strong className="font-mono">{stock.stockCode}</strong>{' '}
            ไม่สามารถย้อนกลับได้ Stock จะไม่สามารถเปิดใช้งานได้อีก
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            เหตุผลในการยกเลิก <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => { setReason(e.target.value); setError('') }}
            placeholder="กรุณาระบุเหตุผล..."
            rows={3}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 resize-none ${
              error
                ? 'border-red-400 focus:ring-red-200'
                : 'border-slate-300 focus:ring-green-200'
            }`}
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose}>ยกเลิก</Button>
          <Button
            variant="danger"
            icon={<XCircle size={14} />}
            onClick={handleConfirm}
          >
            ยืนยันยกเลิก Stock
          </Button>
        </div>
      </div>
    </Modal>
  )
}
