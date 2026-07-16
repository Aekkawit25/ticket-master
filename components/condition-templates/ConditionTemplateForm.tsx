'use client'

import { useState, useCallback, useRef } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { AirlineCombobox } from '@/components/shared/AirlineCombobox'
import { MASTER_AIRLINES } from '@/lib/master-data'
import { cn } from '@/lib/utils'
import {
  isTemplateCodeTaken,
  canGeneratePaymentRounds,
  type DemoConditionTemplate, type TemplateType,
  TEMPLATE_TYPE_LABELS, TEMPLATE_TYPE_COLORS,
  type BaggageCondition, type BaggageStatus, type BaggageWeightMode,
  BAGGAGE_STATUS_LABELS, BAGGAGE_STATUS_EMPTY, BAGGAGE_WEIGHT_MODE_LABELS, formatBaggageSummary,
  type SeatReductionCondition, type SeatReductionPolicy, type SeatNoticeType,
  type SeatCalcBase, type ReductionPercentType,
  SEAT_POLICY_LABELS, SEAT_BASE_LABELS, REDUCTION_PERCENT_PRESETS,
  formatSeatReductionSummary, deriveReductionPercentType,
  type SeatReductionMode, type SeatReductionTier,
  type TierDayConditionType, type TierReductionCondType, type TierPenaltyType, type TierCalcBase,
  TIER_REDUCTION_COND_LABELS, TIER_PENALTY_LABELS, TIER_CALC_BASE_LABELS,
  createEmptySeatReductionTier, formatSeatReductionTierLine,
  type TicketRefundCondition, type RefundConditionType, type RefundDeadlineType,
  type RefundPart, type RefundFeeType, type AfterTicketIssueRefund,
  EMPTY_TICKET_REFUND_CONDITION, formatTicketRefundConditionSummary,
  type SeatReturnCondition, type SeatReturnType, type SeatReturnForfeitType,
  type SeatReturnForfeitItem, type SeatReturnPercentPreset, type SeatReturnDeadlineType,
  type SeatReturnRefundFormat, type SeatReturnRefundBase, type SeatReturnExcessRefund,
  type SeatReturnRefundFeeType,
  EMPTY_SEAT_RETURN_CONDITION, normalizeSeatReturnCondition,
} from '@/lib/template-storage'
import {
  type PaymentRound, type PaymentRoundType, type PaymentRoundCalcType,
  type PaymentDueRuleType, type PaymentQuantityBase,
  emptyPaymentRound, genId,
} from '@/lib/condition-rules'
import {
  Save, X, Lock, PlusCircle, GripVertical, ChevronUp, ChevronDown,
  Copy, Trash2, Pencil, AlertCircle, CheckCircle2, ToggleLeft, ToggleRight,
  CreditCard, Ticket, UserCheck, FileText, ChevronDown as ChevronDownIcon, Eye,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────


const CURRENCY_OPTIONS = ['THB', 'USD', 'EUR', 'JPY', 'SGD', 'HKD', 'AUD', 'GBP']

const BORDER_LEFT: Record<string, string> = {
  blue:   'border-l-blue-400',
  amber:  'border-l-amber-400',
  orange: 'border-l-orange-400',
  green:  'border-l-green-400',
  teal:   'border-l-teal-400',
  violet: 'border-l-violet-400',
  cyan:   'border-l-cyan-400',
  rose:   'border-l-rose-400',
  indigo: 'border-l-indigo-400',
  slate:  'border-l-slate-400',
}

// ─── Payment Schedule constants ───────────────────────────────────────────────

const PAYMENT_TYPE_LABELS: Record<PaymentRoundType, string> = {
  RSVN_FEE:     'ค่าจองที่นั่ง / RSVN Fee',
  DEPOSIT:      'มัดจำ / Deposit',
  BALANCE:      'ชำระส่วนที่เหลือ / Balance',
  FULL_PAYMENT: 'ชำระเต็มจำนวน / Full Payment',
  FEE:          'ค่าธรรมเนียม / Fee',
  OTHER:        'อื่น ๆ',
}

const PAYMENT_TYPE_COLORS: Record<PaymentRoundType, string> = {
  RSVN_FEE:     'bg-purple-100 text-purple-700 border-purple-200',
  DEPOSIT:      'bg-blue-100 text-blue-700 border-blue-200',
  BALANCE:      'bg-teal-100 text-teal-700 border-teal-200',
  FULL_PAYMENT: 'bg-green-100 text-green-700 border-green-200',
  FEE:          'bg-orange-100 text-orange-700 border-orange-200',
  OTHER:        'bg-slate-100 text-slate-600 border-slate-200',
}

function effectiveRefundStatus(r: PaymentRound): 'unspecified' | 'refundable' | 'non_refundable' {
  if (r.refundStatus) return r.refundStatus
  if (r.refundable === true) return 'refundable'
  return 'unspecified'
}

const SAMPLE_INITIAL_SEAT = 32
const SAMPLE_CURRENT_SEAT = 30
const SAMPLE_SEATS = SAMPLE_INITIAL_SEAT  // alias used in legacy PER_SEAT example
const SAMPLE_NET_FARE = 10000
const SAMPLE_GROUP_FARE = 950000

function roundSummary(r: PaymentRound): string {
  const parts: string[] = []
  if (r.calcType === 'PER_PNR')    parts.push(`${r.amount.toLocaleString()} ${r.currency}/PNR`)
  else if (r.calcType === 'PER_SEAT')   parts.push(`${r.amount.toLocaleString()} ${r.currency}/ที่นั่ง`)
  else if (r.calcType === 'PER_SERIES') parts.push(`${r.amount.toLocaleString()} ${r.currency}/Series`)

  const QBL: Record<string, string> = {
    initial_seat: '× ที่นั่งเริ่มต้น (Seat)',
    current_seat: '× ที่นั่งปัจจุบัน (Seat)',
    book:         '× การจอง (Book)',
    // backward compat for old stored values
    seat: '× ที่นั่ง (Seat)',
    CONFIRMED_SEATS: '× ที่นั่งที่ยืนยัน', CURRENT_SEATS: '× ที่นั่งปัจจุบัน',
    REMAINING_SEATS: '× ที่นั่งคงเหลือ',   ISSUED_PAX: '× ผู้โดยสารออกตั๋ว',
    MANUAL_QUANTITY: '× ระบุจำนวนเอง',
  }
  if (r.quantityBase && QBL[r.quantityBase]) parts.push(QBL[r.quantityBase])

  if (r.dueRuleType === 'AFTER_CONFIRM')       parts.push(`— หลังยืนยัน +${r.dueDays} วัน`)
  else if (r.dueRuleType === 'BEFORE_DEPARTURE') parts.push(`— ก่อนเดินทาง ${r.dueDays} วัน`)
  else if (r.dueRuleType === 'FIXED_DATE')     parts.push(`— ${r.fixedDueDate}`)
  return parts.filter(Boolean).join(' ')
}

function calcRoundExample(r: PaymentRound): string {
  if (!r.amount || r.amount <= 0) return ''
  const amt = r.amount.toLocaleString()
  const qb = r.quantityBase as string
  // quantityBase overrides the multiplier display when set
  if (qb === 'initial_seat') {
    const v = r.amount * SAMPLE_INITIAL_SEAT
    return `${amt} × ${SAMPLE_INITIAL_SEAT} Seat = ${v.toLocaleString()} ${r.currency}`
  }
  if (qb === 'current_seat') {
    const v = r.amount * SAMPLE_CURRENT_SEAT
    return `${amt} × ${SAMPLE_CURRENT_SEAT} Seat = ${v.toLocaleString()} ${r.currency}`
  }
  if (qb === 'book') {
    return `${amt} × 1 Book = ${amt} ${r.currency}`
  }
  // backward compat for old 'seat' value
  if (qb === 'seat') {
    const v = r.amount * SAMPLE_INITIAL_SEAT
    return `${amt} × ${SAMPLE_INITIAL_SEAT} Seat = ${v.toLocaleString()} ${r.currency}`
  }
  // fallback: calcType-driven
  switch (r.calcType) {
    case 'PER_SERIES': return `${amt} ${r.currency}/Series`
    case 'PER_PNR':    return `${amt} ${r.currency}/PNR`
    case 'PER_SEAT': {
      const v = r.amount * SAMPLE_INITIAL_SEAT
      return `${amt} × ${SAMPLE_INITIAL_SEAT} ที่นั่ง = ${v.toLocaleString()} ${r.currency}`
    }
    default: return r.amount > 0 ? `${amt} ${r.currency}` : ''
  }
}

// ─── Form Helpers ─────────────────────────────────────────────────────────────

const inp = 'w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#05a94f]/30 focus:border-[#05a94f]'
const sel = inp + ' appearance-none cursor-pointer'
const inpErr = 'border-red-400 focus:border-red-400 focus:ring-red-200/40'
const inpDisabled = 'bg-slate-50 text-slate-400 cursor-not-allowed'

function F({
  label, required, error, col2, children,
}: {
  label: string; required?: boolean; error?: string; col2?: boolean; children: React.ReactNode
}) {
  return (
    <div className={col2 ? 'col-span-2' : ''}>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
        {label}{required && <span className="text-red-500 ml-0.5 normal-case">*</span>}
      </label>
      {children}
      {error && <p className="mt-0.5 text-[11px] text-red-500">{error}</p>}
    </div>
  )
}

function G({ children, cols = 2 }: { children: React.ReactNode; cols?: 3 | 2 | 4 }) {
  return (
    <div className={cn('grid gap-2.5', cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4')}>
      {children}
    </div>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="h-px flex-1 bg-slate-200" />
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  )
}


// ─── Payment Round Modal ──────────────────────────────────────────────────────

function PaymentRoundModal({ round: init, defaultCurrency, onSave, onClose }: {
  round: PaymentRound
  defaultCurrency: string
  onSave: (r: PaymentRound) => void
  onClose: () => void
}) {
  const [v, setV] = useState(false)

  const [round, setRound] = useState<PaymentRound>(() => {
    const base = { ...init, currency: init.currency || defaultCurrency }
    // migrate old boolean refundable → refundStatus
    if (!base.refundStatus) {
      base.refundStatus = base.refundable === true ? 'refundable' : 'unspecified'
    }
    // migrate old creditTowardFare without deductBase
    if (!base.deductBase) {
      base.deductBase = base.creditTowardFare ? 'fare' : 'unspecified'
    }
    return base
  })

  const p = useCallback((patch: Partial<PaymentRound>) => {
    setRound(prev => {
      const next = { ...prev, ...patch }
      if (patch.paymentType === 'RSVN_FEE') {
        next.creditTowardFare = false
        next.deductBase = 'unspecified'
        next.refundStatus = 'non_refundable'
      } else if (patch.paymentType === 'DEPOSIT') {
        next.creditTowardFare = true
        if (!next.deductBase || next.deductBase === 'unspecified') next.deductBase = 'fare'
      }
      // sync deductBase when creditTowardFare toggled
      if ('creditTowardFare' in patch) {
        if (patch.creditTowardFare) {
          if (!next.deductBase || next.deductBase === 'unspecified') next.deductBase = 'fare'
        } else {
          next.deductBase = 'unspecified'
        }
      }
      return next
    })
  }, [])

  const needsAmount = !!(round.calcType && ['PER_PNR', 'PER_SEAT', 'PER_SERIES'].includes(round.calcType))
  const needsDays   = !!(round.dueRuleType && ['AFTER_CONFIRM', 'BEFORE_DEPARTURE'].includes(round.dueRuleType))
  const needsDate   = round.dueRuleType === 'FIXED_DATE'
  const showQtyBase = needsAmount

  const handleSave = () => {
    setV(true)
    if (!round.calcType) return
    if (needsAmount && round.amount <= 0) return
    if (needsDays && round.dueDays <= 0) return
    if (needsDate && !round.fixedDueDate) return
    // auto-set roundName from paymentType label
    const autoName = round.paymentType
      ? (PAYMENT_TYPE_LABELS[round.paymentType as PaymentRoundType] ?? round.paymentType)
      : 'ไม่ระบุ'
    onSave({ ...round, roundName: autoName })
  }

  const isNew = !init.paymentType

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-100 rounded-lg"><CreditCard size={15} className="text-blue-700" /></span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {isNew ? 'ประเภทการชำระเงิน' : `แก้ไขรอบชำระเงิน`}
              </h3>
              <p className="text-[11px] text-slate-400">กำหนดเงื่อนไขการชำระเงิน</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {/* Row 1: Payment Type | Calc Type */}
          <div className="grid grid-cols-2 gap-2.5">
            <F label="ประเภทการชำระเงิน">
              <select className={sel} value={round.paymentType}
                onChange={ev => p({ paymentType: ev.target.value as PaymentRoundType })}>
                <option value="">ไม่ระบุ</option>
                <option value="RSVN_FEE">ค่าจองที่นั่ง / RSVN Fee</option>
                <option value="DEPOSIT">มัดจำ / Deposit</option>
                <option value="BALANCE">ชำระส่วนที่เหลือ / Balance</option>
                <option value="FULL_PAYMENT">ชำระเต็มจำนวน / Full Payment</option>
                <option value="FEE">ค่าธรรมเนียม / Fee</option>
                <option value="OTHER">อื่น ๆ</option>
              </select>
            </F>
            <F label="วิธีคำนวณ" required error={v && !round.calcType ? 'กรุณาเลือกวิธีคำนวณ' : ''}>
              <select className={cn(sel, v && !round.calcType && inpErr)} value={round.calcType}
                onChange={ev => p({ calcType: ev.target.value as PaymentRoundCalcType })}>
                <option value="">ไม่ระบุ</option>
                <option value="PER_SEAT">ต่อที่นั่ง / Per Seat</option>
                <option value="PER_PNR">ต่อ PNR / Per PNR</option>
                <option value="PER_SERIES">ต่อ Series / Per Series</option>
              </select>
            </F>
          </div>

          <G cols={3}>
            {needsAmount && (
              <F label="จำนวนเงิน" required error={v && round.amount <= 0 ? 'จำเป็น' : ''}>
                <input type="number" className={cn(inp, v && round.amount <= 0 && inpErr)}
                  min={0} step="any" value={round.amount}
                  onChange={ev => p({ amount: +ev.target.value })} />
              </F>
            )}
            <F label="สกุลเงิน">
              <select className={sel} value={round.currency} onChange={ev => p({ currency: ev.target.value })}>
                {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </F>
            {showQtyBase && (
              <F label="ฐานการนับจำนวน">
                <select className={sel} value={round.quantityBase}
                  onChange={ev => p({ quantityBase: ev.target.value as PaymentQuantityBase })}>
                  <option value="">ไม่ระบุ</option>
                  <option value="initial_seat">จำนวนที่นั่ง (Seat) เริ่มต้น</option>
                  <option value="current_seat">จำนวนที่นั่ง (Seat) ปัจจุบัน</option>
                  <option value="book">จำนวนการจอง (Book)</option>
                </select>
              </F>
            )}
          </G>

          {/* Preview calculation example */}
          {round.calcType && (
            <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-[11px] text-blue-700 font-mono">
              ตัวอย่าง: {calcRoundExample(round)}
            </div>
          )}

          <Divider label="กำหนดชำระ" />

          <G cols={3}>
            <F label="กำหนดการชำระ">
              <select className={sel} value={round.dueRuleType}
                onChange={ev => p({ dueRuleType: ev.target.value as PaymentDueRuleType })}>
                <option value="">ไม่ระบุ</option>
                <option value="BEFORE_DEPARTURE">ก่อนวันเดินทางกี่วัน</option>
                <option value="FIXED_DATE">ภายในวันที่กำหนด</option>
                <option value="AFTER_CONFIRM">หลังยืนยันที่นั่งกี่วัน</option>
              </select>
            </F>
            {needsDays && (
              <F label="จำนวนวัน" required error={v && round.dueDays <= 0 ? 'จำเป็น' : ''}>
                <input type="number" className={cn(inp, v && round.dueDays <= 0 && inpErr)}
                  min={0} value={round.dueDays}
                  onChange={ev => p({ dueDays: +ev.target.value })} />
              </F>
            )}
            {needsDate && (
              <F label="วันชำระคงที่" required error={v && !round.fixedDueDate ? 'จำเป็น' : ''}>
                <input type="date" className={cn(inp, v && !round.fixedDueDate && inpErr)}
                  value={round.fixedDueDate}
                  onChange={ev => p({ fixedDueDate: ev.target.value })} />
              </F>
            )}
          </G>

          <Divider label="เงื่อนไขเพิ่มเติม" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {/* Col 1: หักจากราคาตั๋ว */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">หักจากราคาตั๋ว</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer w-fit">
                  <input type="checkbox" id="ctf" checked={round.creditTowardFare}
                    onChange={ev => p({ creditTowardFare: ev.target.checked })}
                    className="accent-[#05a94f]" />
                  <span className="text-sm text-slate-700">หักจากราคาตั๋ว</span>
                </label>
                {round.creditTowardFare && (
                  <div className="ml-6 flex flex-col gap-3">
                    {(['fare', 'fare_tax'] as const).map(val => {
                      const label = val === 'fare' ? 'ค่า Fare' : 'ค่า Fare + Tax'
                      const selected = round.deductBase === val
                      return (
                        <button key={val} type="button"
                          onClick={() => p({ deductBase: val })}
                          className={cn('flex items-center gap-1.5 text-sm transition-colors',
                            selected ? 'text-[#05a94f] font-semibold' : 'text-slate-500 hover:text-slate-700')}>
                          <span className={cn(
                            'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                            selected ? 'border-[#05a94f]' : 'border-slate-300')}>
                            {selected && <span className="w-2 h-2 rounded-full bg-[#05a94f]" />}
                          </span>
                          {label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Col 2: สถานะการคืนเงิน */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">สถานะการคืนเงิน</p>
              <div className="flex flex-col gap-3">
                {(['refundable', 'non_refundable'] as const).map(val => {
                  const label = val === 'refundable' ? 'คืนเงินได้' : 'คืนเงินไม่ได้'
                  const selected = round.refundStatus === val
                  return (
                    <button key={val} type="button"
                      onClick={() => p({ refundStatus: selected ? 'unspecified' : val })}
                      className={cn('flex items-center gap-1.5 text-sm transition-colors',
                        selected ? 'text-[#05a94f] font-semibold' : 'text-slate-500 hover:text-slate-700')}>
                      <span className={cn(
                        'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                        selected ? 'border-[#05a94f]' : 'border-slate-300')}>
                        {selected && <span className="w-2 h-2 rounded-full bg-[#05a94f]" />}
                      </span>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <F label="หมายเหตุ">
            <input className={inp} value={round.remark} onChange={ev => p({ remark: ev.target.value })} />
          </F>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-200 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>ยกเลิก</Button>
          <Button size="sm" icon={<Save size={13} />} onClick={handleSave}>บันทึก</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Payment Round Card ───────────────────────────────────────────────────────

function PaymentRoundCard({
  round, idx, total, onEdit, onDelete, onMoveUp, onMoveDown,
  isDragging, dragOver, onDragStart, onDragOver, onDragLeave, onDrop,
}: {
  round: PaymentRound; idx: number; total: number
  onEdit: () => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void
  isDragging: boolean; dragOver: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
}) {
  const summary = roundSummary(round)
  const ptColor = round.paymentType ? (PAYMENT_TYPE_COLORS[round.paymentType as PaymentRoundType] ?? '') : 'bg-slate-100 text-slate-500 border-slate-200'

  return (
    <div
      draggable onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      className={cn(
        'group flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-white transition-all hover:shadow-sm',
        isDragging && 'opacity-50 shadow-lg scale-[0.98]',
        dragOver && 'ring-2 ring-[#05a94f]/50 ring-offset-1',
      )}>
      <div className="cursor-grab text-slate-300 hover:text-slate-400 shrink-0"><GripVertical size={14} /></div>

      <span className="shrink-0 w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white bg-[#05a94f] rounded-full">
        {round.roundNo}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded border leading-tight', ptColor)}>
            {round.paymentType ? (PAYMENT_TYPE_LABELS[round.paymentType as PaymentRoundType] ?? round.paymentType) : <span className="italic font-normal">ไม่ระบุประเภท</span>}
          </span>
        </div>
        {summary && <p className="text-[11px] text-slate-500 truncate mt-0.5">{summary}</p>}
      </div>

      <div className="shrink-0 hidden sm:flex gap-1">
        {round.creditTowardFare && (
          <span className="text-[10px] font-medium text-blue-600 border border-blue-200 rounded px-1.5 py-0.5">
            หักจาก{round.deductBase === 'fare_tax' ? 'Fare+Tax' : 'Fare'}
          </span>
        )}
        {effectiveRefundStatus(round) === 'refundable' && (
          <span className="text-[10px] font-medium text-[#05a94f] border border-green-200 rounded px-1.5 py-0.5">คืนเงินได้</span>
        )}
        {effectiveRefundStatus(round) === 'non_refundable' && (
          <span className="text-[10px] font-medium text-red-600 border border-red-200 rounded px-1.5 py-0.5">คืนเงินไม่ได้</span>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" disabled={idx === 0} onClick={onMoveUp}
          className="p-1 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronUp size={13} />
        </button>
        <button type="button" disabled={idx === total - 1} onClick={onMoveDown}
          className="p-1 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronDown size={13} />
        </button>
        <button type="button" onClick={onEdit} className="p-1 rounded text-slate-400 hover:text-blue-600">
          <Pencil size={13} />
        </button>
        <button type="button" onClick={onDelete} className="p-1 rounded text-slate-400 hover:text-red-500">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Payment Schedule Section ─────────────────────────────────────────────────

function PaymentScheduleSection({ schedule, onChangeSchedule, currency }: {
  schedule: PaymentRound[]
  onChangeSchedule: (rounds: PaymentRound[]) => void
  currency: string
}) {
  const [editing,  setEditing]  = useState<PaymentRound | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const handleAdd = () => setEditing(emptyPaymentRound(schedule.length + 1, currency))

  const handleSaveRound = (round: PaymentRound) => {
    const exists = schedule.some(r => r.roundId === round.roundId)
    if (exists) {
      onChangeSchedule(schedule.map(r => r.roundId === round.roundId ? round : r))
    } else {
      onChangeSchedule([...schedule, round])
    }
    setEditing(null)
  }

  const handleDeleteRound = (roundId: string) => {
    onChangeSchedule(
      schedule.filter(r => r.roundId !== roundId).map((r, i) => ({ ...r, roundNo: i + 1 }))
    )
    setDeleting(null)
  }

  const handleMoveRound = (roundId: string, dir: 'up' | 'down') => {
    const idx = schedule.findIndex(r => r.roundId === roundId)
    if (idx < 0) return
    const nxt = dir === 'up' ? idx - 1 : idx + 1
    if (nxt < 0 || nxt >= schedule.length) return
    const arr = [...schedule]
    ;[arr[idx], arr[nxt]] = [arr[nxt], arr[idx]]
    onChangeSchedule(arr.map((r, i) => ({ ...r, roundNo: i + 1 })))
  }

  const dsDragStart = (e: React.DragEvent, roundId: string) => { e.dataTransfer.effectAllowed = 'move'; setDragging(roundId) }
  const dsDragOver  = (e: React.DragEvent, roundId: string) => { e.preventDefault(); setDragOver(roundId) }
  const dsDrop      = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const from = dragging
    if (!from || from === targetId) { setDragging(null); setDragOver(null); return }
    const arr = [...schedule]
    const fi = arr.findIndex(r => r.roundId === from)
    const ti = arr.findIndex(r => r.roundId === targetId)
    if (fi >= 0 && ti >= 0) {
      const [rem] = arr.splice(fi, 1)
      arr.splice(ti, 0, rem)
      onChangeSchedule(arr.map((r, i) => ({ ...r, roundNo: i + 1 })))
    }
    setDragging(null); setDragOver(null)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm">Payment Schedule / รอบการชำระเงิน</CardTitle>
            {schedule.length > 0 && (
              <p className="text-[11px] text-slate-400 mt-0.5">{schedule.length} รอบ</p>
            )}
          </div>
          <Button size="sm" icon={<PlusCircle size={13} />} onClick={handleAdd} className="shrink-0">
            + เพิ่มรอบชำระเงิน
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {schedule.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div className="p-3 rounded-xl bg-slate-100">
              <CreditCard size={22} className="text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600">ยังไม่มีรอบการชำระเงิน</p>
              <p className="text-xs text-slate-400 mt-0.5">กดปุ่ม &quot;+ เพิ่มรอบชำระเงิน&quot; ด้านบน เพื่อกำหนด RSVN Fee, Deposit, Balance</p>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {schedule.map((round, idx) => (
              <PaymentRoundCard
                key={round.roundId} round={round} idx={idx} total={schedule.length}
                onEdit={() => setEditing(round)}
                onDelete={() => setDeleting(round.roundId)}
                onMoveUp={() => handleMoveRound(round.roundId, 'up')}
                onMoveDown={() => handleMoveRound(round.roundId, 'down')}
                isDragging={dragging === round.roundId}
                dragOver={dragOver === round.roundId}
                onDragStart={e => dsDragStart(e, round.roundId)}
                onDragOver={e => dsDragOver(e, round.roundId)}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => dsDrop(e, round.roundId)}
              />
            ))}
          </div>
        )}
      </CardContent>

      {editing && (
        <PaymentRoundModal
          round={editing}
          defaultCurrency={currency}
          onSave={handleSaveRound} onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleting(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-xl"><Trash2 size={18} className="text-red-600" /></div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">ลบรอบนี้?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {(() => { const r = schedule.find(r => r.roundId === deleting); return r?.paymentType ? (PAYMENT_TYPE_LABELS[r.paymentType as PaymentRoundType] ?? r.paymentType) : 'รอบนี้' })()} จะถูกลบออก
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>ยกเลิก</Button>
              <Button size="sm" icon={<Trash2 size={13} />}
                className="bg-red-500 hover:bg-red-600 border-red-500"
                onClick={() => handleDeleteRound(deleting)}>ลบ</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Ticket Refund Condition Section ─────────────────────────────────────────

const REFUND_COND_OPTIONS: { val: RefundConditionType; label: string }[] = [
  { val: 'unspecified',    label: 'ไม่ระบุ' },
  { val: 'non_refundable', label: 'คืนเงินไม่ได้' },
  { val: 'refundable',     label: 'คืนเงินได้' },
  { val: 'partial_refund', label: 'คืนได้บางส่วน' },
  { val: 'airline_policy', label: 'ตามเงื่อนไขสายการบิน' },
]

function RefundSegBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap',
        active
          ? 'bg-[#05a94f] text-white border-[#05a94f]'
          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
      )}>
      {label}
    </button>
  )
}

function RefundSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">{children}</p>
  )
}

function RefundConditionSection({
  value,
  onChange,
}: {
  value: TicketRefundCondition
  onChange: (v: TicketRefundCondition) => void
}) {
  const p = (patch: Partial<TicketRefundCondition>) => onChange({ ...value, ...patch })
  const ct = value.conditionType
  const showExtra = ct !== 'unspecified'
  const showDeadline = ct === 'refundable' || ct === 'partial_refund'
  const showPart = ct === 'refundable' || ct === 'partial_refund'
  const showFee = ct === 'refundable' || ct === 'partial_refund'

  const refundPartOptions: { val: RefundPart; label: string }[] = ct === 'partial_refund'
    ? [
        { val: 'fare',            label: 'ค่า Fare บางส่วน' },
        { val: 'tax_only',        label: 'Tax Only' },
        { val: 'fuel_charge_only',label: 'Fuel Charge Only' },
        { val: 'tax_fuel_charge', label: 'Tax + Fuel Charge' },
        { val: 'custom',          label: 'ระบุเอง' },
      ]
    : [
        { val: 'fare',     label: 'ค่า Fare' },
        { val: 'fare_tax', label: 'ค่า Fare + Tax' },
        { val: 'tax_only', label: 'Tax Only' },
        { val: 'custom',   label: 'ระบุเอง' },
      ]

  const feeOptions: { val: RefundFeeType; label: string }[] = ct === 'partial_refund'
    ? [
        { val: 'fixed_amount',   label: 'ระบุจำนวนเงิน' },
        { val: 'percent',        label: 'ระบุเป็น %' },
        { val: 'actual',         label: 'ตามจริง' },
        { val: 'airline_policy', label: 'ตามเงื่อนไขสายการบิน' },
      ]
    : [
        { val: 'none',           label: 'ไม่มี' },
        { val: 'fixed_amount',   label: 'ระบุจำนวนเงิน' },
        { val: 'percent',        label: 'ระบุเป็น %' },
        { val: 'airline_policy', label: 'ตามเงื่อนไขสายการบิน' },
      ]

  const afterOptions: { val: AfterTicketIssueRefund; label: string }[] = [
    { val: 'unspecified',    label: 'ไม่ระบุ' },
    { val: 'non_refundable', label: 'คืนไม่ได้' },
    { val: 'tax_only',       label: 'คืนได้เฉพาะ Tax' },
    { val: 'tax_fuel_charge',label: 'คืนได้เฉพาะ Tax + Fuel Charge' },
    { val: 'airline_policy', label: 'ตามเงื่อนไขสายการบิน' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">เงื่อนไขการคืนตั๋ว / Refund Condition</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* ── ประเภทเงื่อนไขการคืนตั๋ว ── */}
        <div>
          <RefundSectionLabel>เงื่อนไขการคืนตั๋ว</RefundSectionLabel>
          <div className="flex flex-wrap gap-2">
            {REFUND_COND_OPTIONS.map(({ val, label }) => (
              <RefundSegBtn key={val} active={ct === val} label={label}
                onClick={() => p({ conditionType: val })} />
            ))}
          </div>
        </div>

        {/* ── non_refundable: remark only ── */}
        {ct === 'non_refundable' && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">รายละเอียดเพิ่มเติม</label>
            <textarea rows={2} value={value.refundRemark ?? ''}
              onChange={ev => p({ refundRemark: ev.target.value })}
              placeholder="เช่น หลังออกตั๋วแล้วไม่สามารถคืนเงินได้ทุกกรณี"
              className={inp + ' resize-none'} />
          </div>
        )}

        {/* ── airline_policy: remark only ── */}
        {ct === 'airline_policy' && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">รายละเอียดเงื่อนไขสายการบิน</label>
            <textarea rows={2} value={value.refundRemark ?? ''}
              onChange={ev => p({ refundRemark: ev.target.value })}
              placeholder="เช่น การคืนเงินเป็นไปตามเงื่อนไขของสายการบิน ณ วันที่ออกตั๋ว / ต้องตรวจสอบกับสายการบินก่อนดำเนินการคืน"
              className={inp + ' resize-none'} />
          </div>
        )}

        {/* ── Refund Deadline (refundable / partial_refund) ── */}
        {showDeadline && (
          <div>
            <RefundSectionLabel>Refund Deadline</RefundSectionLabel>
            <div className="flex flex-wrap gap-2">
              {([
                { val: 'unspecified' as RefundDeadlineType,         label: 'ไม่ระบุ' },
                { val: 'days_before_departure' as RefundDeadlineType, label: 'ก่อนวันเดินทางกี่วัน' },
                { val: 'fixed_date' as RefundDeadlineType,           label: 'ภายในวันที่กำหนด' },
              ]).map(({ val, label }) => (
                <RefundSegBtn key={val} active={value.refundDeadlineType === val} label={label}
                  onClick={() => p({ refundDeadlineType: val })} />
              ))}
            </div>
            {value.refundDeadlineType === 'days_before_departure' && (
              <div className="flex items-center gap-2 mt-2">
                <input type="number" min={1} value={value.refundDeadlineDays ?? ''}
                  onChange={ev => p({ refundDeadlineDays: ev.target.value ? Number(ev.target.value) : null })}
                  placeholder="จำนวนวัน"
                  className={cn(inp, 'w-28 text-center')} />
                <span className="text-sm text-slate-500">วัน ก่อนวันเดินทาง</span>
              </div>
            )}
            {value.refundDeadlineType === 'fixed_date' && (
              <input type="date" value={value.refundDeadlineDate ?? ''}
                onChange={ev => p({ refundDeadlineDate: ev.target.value || null })}
                className={cn(inp, 'w-44 mt-2')} />
            )}
          </div>
        )}

        {/* ── คืนส่วนใด ── */}
        {showPart && (
          <div>
            <RefundSectionLabel>คืนส่วนใด</RefundSectionLabel>
            <div className="flex flex-wrap gap-2">
              {refundPartOptions.map(({ val, label }) => (
                <RefundSegBtn key={val} active={value.refundPart === val} label={label}
                  onClick={() => p({ refundPart: val })} />
              ))}
            </div>
            {value.refundPart === 'custom' && (
              <input type="text" value={value.refundPartCustomText ?? ''}
                onChange={ev => p({ refundPartCustomText: ev.target.value })}
                placeholder="ระบุส่วนที่คืนเงิน"
                className={cn(inp, 'mt-2')} />
            )}
          </div>
        )}

        {/* ── ค่าธรรมเนียม / จำนวนที่คืนได้ ── */}
        {showFee && (
          <div>
            <RefundSectionLabel>
              {ct === 'partial_refund' ? 'จำนวนที่คืนได้' : 'ค่าธรรมเนียมการคืน'}
            </RefundSectionLabel>
            <div className="flex flex-wrap gap-2">
              {feeOptions.map(({ val, label }) => (
                <RefundSegBtn key={val} active={value.refundFeeType === val} label={label}
                  onClick={() => p({ refundFeeType: val })} />
              ))}
            </div>
            {value.refundFeeType === 'fixed_amount' && (
              <div className="flex items-center gap-2 mt-2">
                <input type="number" min={0} value={value.refundFeeAmount ?? ''}
                  onChange={ev => p({ refundFeeAmount: ev.target.value ? Number(ev.target.value) : null })}
                  placeholder="จำนวนเงิน"
                  className={cn(inp, 'w-36')} />
                <span className="text-sm text-slate-500">THB ต่อท่าน</span>
              </div>
            )}
            {value.refundFeeType === 'percent' && (
              <div className="flex items-center gap-2 mt-2">
                <input type="number" min={0} max={100} step={0.1} value={value.refundFeePercent ?? ''}
                  onChange={ev => p({ refundFeePercent: ev.target.value ? Number(ev.target.value) : null })}
                  placeholder="เปอร์เซ็นต์"
                  className={cn(inp, 'w-24')} />
                <span className="text-sm text-slate-500">%</span>
              </div>
            )}
          </div>
        )}

        {/* ── รายละเอียดเพิ่มเติม (refundable / partial_refund) ── */}
        {(ct === 'refundable' || ct === 'partial_refund') && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">รายละเอียดเพิ่มเติม</label>
            <textarea rows={2} value={value.refundRemark ?? ''}
              onChange={ev => p({ refundRemark: ev.target.value })}
              placeholder="รายละเอียดเพิ่มเติม"
              className={inp + ' resize-none'} />
          </div>
        )}

        {/* ── หลังออกตั๋วแล้ว ── */}
        {showExtra && (
          <div>
            <RefundSectionLabel>หลังออกตั๋วแล้ว</RefundSectionLabel>
            <div className="flex flex-wrap gap-2">
              {afterOptions.map(({ val, label }) => (
                <RefundSegBtn key={val} active={value.afterTicketIssueRefund === val} label={label}
                  onClick={() => p({ afterTicketIssueRefund: val })} />
              ))}
            </div>
          </div>
        )}

        {/* ── ข้อยกเว้น / Exception ── */}
        {showExtra && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ข้อยกเว้น / Exception</label>
            <textarea rows={2} value={value.refundExceptionText ?? ''}
              onChange={ev => p({ refundExceptionText: ev.target.value })}
              placeholder="เช่น กรณี No-show ไม่สามารถคืนเงินได้ / หลังส่งรายชื่อไม่สามารถเปลี่ยนผู้โดยสาร / YR ไม่สามารถคืนได้"
              className={inp + ' resize-none'} />
          </div>
        )}

      </CardContent>
    </Card>
  )
}

// ─── Seat Return Condition Section ────────────────────────────────────────────

const SR_MAIN_OPTIONS: { val: SeatReturnType; label: string; desc: string }[] = [
  { val: 'non_refundable', label: 'คืนไม่ได้',       desc: 'ไม่อนุญาตให้คืนที่นั่ง' },
  { val: 'partial_refund', label: 'คืนได้บางส่วน',   desc: 'คืนได้ตามเงื่อนไขที่กำหนด' },
  { val: 'full_refund',    label: 'คืนได้ทั้งหมด',   desc: 'คืนได้เต็มจำนวนตามเงื่อนไข' },
]

const SR_FORFEIT_OPTIONS: { val: SeatReturnForfeitType; label: string }[] = [
  { val: 'no_forfeit',          label: 'ไม่ยึดเงิน' },
  { val: 'forfeit_all',         label: 'ยึดทั้งหมด' },
  { val: 'forfeit_rsvn',        label: 'ยึดเฉพาะ RSVN' },
  { val: 'forfeit_deposit',     label: 'ยึดเฉพาะมัดจำ' },
  { val: 'forfeit_paid_amount', label: 'ยึดเฉพาะเท่าที่จ่าย' },
  { val: 'forfeit_selected',    label: 'ยึดบางรายการ' },
  { val: 'custom',              label: 'ระบุเอง' },
]

const SR_ITEM_OPTIONS: { val: SeatReturnForfeitItem; label: string }[] = [
  { val: 'rsvn_fee',     label: 'RSVN Fee' },
  { val: 'deposit',      label: 'Deposit' },
  { val: 'fee',          label: 'Fee' },
  { val: 'fare',         label: 'Fare' },
  { val: 'tax',          label: 'Tax' },
  { val: 'fuel_charge',  label: 'Fuel Charge' },
  { val: 'yr',           label: 'YR' },
  { val: 'other',        label: 'อื่น ๆ' },
]

const SR_REFUND_FORMAT_OPTIONS: { val: SeatReturnRefundFormat; label: string }[] = [
  { val: 'percent',      label: 'คืนเป็น %' },
  { val: 'fixed_amount', label: 'คืนเป็นจำนวนเงิน' },
  { val: 'actual',       label: 'คืนตามจริง' },
  { val: 'custom',       label: 'ระบุเอง' },
]

const SR_REFUND_BASE_OPTIONS: { val: SeatReturnRefundBase; label: string }[] = [
  { val: 'paid_amount', label: 'จากยอดที่ชำระแล้ว' },
  { val: 'deposit',     label: 'จากค่ามัดจำ' },
  { val: 'fare',        label: 'จากค่า Fare' },
  { val: 'fare_tax',    label: 'จากค่า Fare + Tax' },
  { val: 'tax_only',    label: 'จาก Tax เท่านั้น' },
  { val: 'custom',      label: 'ระบุเอง' },
]

const SR_EXCESS_OPTIONS: { val: SeatReturnExcessRefund; label: string }[] = [
  { val: 'not_exceed_paid',    label: 'คืนไม่เกินยอดที่ชำระจริง' },
  { val: 'not_exceed_deposit', label: 'คืนไม่เกินยอดมัดจำ' },
  { val: 'credit',             label: 'คืนส่วนเกินเป็น Credit' },
  { val: 'requires_approval',  label: 'ต้องขออนุมัติก่อนคืนส่วนเกิน' },
  { val: 'custom',             label: 'ระบุเอง' },
]

const SR_FEE_OPTIONS: { val: SeatReturnRefundFeeType; label: string }[] = [
  { val: 'none',           label: 'ไม่มี' },
  { val: 'fixed_amount',   label: 'ระบุจำนวนเงิน' },
  { val: 'percent',        label: 'ระบุเป็น %' },
  { val: 'airline_policy', label: 'ตามเงื่อนไขสายการบิน' },
  { val: 'custom',         label: 'ระบุเอง' },
]

const SR_PCT_PRESETS: { val: SeatReturnPercentPreset; label: string }[] = [
  { val: 10, label: '10%' }, { val: 20, label: '20%' }, { val: 30, label: '30%' },
  { val: 40, label: '40%' }, { val: 50, label: '50%' }, { val: 'custom', label: 'กำหนดเอง' },
]

function toggleSrItem<T>(item: T, arr: T[]): T[] {
  return arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item]
}

function SrForfeitItemsBox({
  items, otherText,
  onItemsChange, onOtherTextChange,
}: {
  items: SeatReturnForfeitItem[]
  otherText: string | null
  onItemsChange: (v: SeatReturnForfeitItem[]) => void
  onOtherTextChange: (v: string) => void
}) {
  return (
    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
      <p className="text-xs font-medium text-slate-500 mb-1">เลือกรายการที่ยึด</p>
      <div className="flex flex-wrap gap-2">
        {SR_ITEM_OPTIONS.map(({ val, label }) => (
          <label key={val} className="flex items-center gap-1.5 cursor-pointer select-none text-sm text-slate-700">
            <input type="checkbox" checked={items.includes(val)}
              onChange={() => onItemsChange(toggleSrItem(val, items))}
              className="w-3.5 h-3.5 rounded border-slate-300 accent-[#05a94f]" />
            {label}
          </label>
        ))}
      </div>
      {items.includes('other') && (
        <input type="text" value={otherText ?? ''}
          onChange={e => onOtherTextChange(e.target.value)}
          placeholder="ระบุรายการอื่น ๆ"
          className={inp} />
      )}
    </div>
  )
}

function SeatReturnCalcBox({ pct }: { pct: number | null | undefined }) {
  const [paxCount, setPaxCount] = useState(10)
  const [pricePerPax, setPricePerPax] = useState(5000)
  const effective = typeof pct === 'number' && pct >= 0 && pct <= 100 ? pct : null
  const refund = effective !== null ? Math.round(paxCount * pricePerPax * effective / 100) : null
  return (
    <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">ทดสอบคำนวณการคืนเงิน</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">จำนวน Pax ที่คืน</label>
          <input type="number" min={1} value={paxCount}
            onChange={e => setPaxCount(Math.max(1, Number(e.target.value)))}
            className={cn(inp, 'text-sm')} />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">ราคาต่อ Pax (บาท)</label>
          <input type="number" min={0} value={pricePerPax}
            onChange={e => setPricePerPax(Math.max(0, Number(e.target.value)))}
            className={cn(inp, 'text-sm')} />
        </div>
      </div>
      {effective !== null ? (
        <div className="flex items-center justify-between bg-white border border-blue-200 rounded-lg px-3 py-2">
          <span className="text-xs text-slate-500">ยอดคืน ({paxCount} Pax × {pricePerPax.toLocaleString()} × {effective}%)</span>
          <span className="text-sm font-bold text-blue-700">{refund!.toLocaleString()} บาท</span>
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">กำหนด % เพื่อดูการคำนวณ</p>
      )}
    </div>
  )
}

// sub-component: forfeit selector block (reused for non_refundable + over-deadline)
function SrForfeitBlock({
  label,
  forfeitType, forfeitItems, forfeitOtherText, forfeitCustomText,
  onForfeitTypeChange, onForfeitItemsChange, onForfeitOtherTextChange, onForfeitCustomTextChange,
}: {
  label?: string
  forfeitType: SeatReturnForfeitType | null
  forfeitItems: SeatReturnForfeitItem[]
  forfeitOtherText: string | null
  forfeitCustomText: string | null
  onForfeitTypeChange: (v: SeatReturnForfeitType) => void
  onForfeitItemsChange: (v: SeatReturnForfeitItem[]) => void
  onForfeitOtherTextChange: (v: string) => void
  onForfeitCustomTextChange: (v: string) => void
}) {
  return (
    <div className="space-y-2.5">
      {label && <p className="text-xs font-medium text-slate-600">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {SR_FORFEIT_OPTIONS.map(({ val, label: optLabel }) => (
          <button key={val} type="button"
            onClick={() => onForfeitTypeChange(val)}
            className={cn(
              'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
              forfeitType === val
                ? 'bg-[#05a94f] border-[#05a94f] text-white shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 hover:border-[#05a94f]/50',
            )}>
            {optLabel}
          </button>
        ))}
      </div>
      {forfeitType === 'forfeit_selected' && (
        <SrForfeitItemsBox items={forfeitItems} otherText={forfeitOtherText}
          onItemsChange={onForfeitItemsChange} onOtherTextChange={onForfeitOtherTextChange} />
      )}
      {forfeitType === 'custom' && (
        <textarea rows={2} value={forfeitCustomText ?? ''}
          onChange={e => onForfeitCustomTextChange(e.target.value)}
          placeholder="ระบุรายละเอียดเงื่อนไขการยึดเงิน..."
          className={cn(inp, 'resize-none w-full mt-1')} />
      )}
    </div>
  )
}

function SeatReturnConditionSection({ value, onChange }: {
  value: SeatReturnCondition
  onChange: (v: SeatReturnCondition) => void
}) {
  const p = (patch: Partial<SeatReturnCondition>) => onChange({ ...value, ...patch })
  const rt = value.seatReturnType

  // partial_refund effective percent
  const effectivePct: number | null =
    rt === 'partial_refund'
      ? value.seatReturnPercentPreset === 'custom'
        ? value.seatReturnPercentValue
        : (value.seatReturnPercentPreset ?? null)
      : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">เงื่อนไขการคืนที่นั่ง / Seat Return Condition</CardTitle>
        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
          ใช้สำหรับกำหนดจำนวนที่นั่งที่สามารถคืน/ยกเลิกได้ และเงื่อนไขการถูกยึดเงิน
        </p>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">

        {/* ─── Main type selector ─────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {SR_MAIN_OPTIONS.map(({ val, label, desc }) => (
            <button key={val} type="button"
              onClick={() => p({ seatReturnType: val })}
              className={cn(
                'flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left',
                rt === val
                  ? 'bg-[#05a94f] border-[#05a94f] text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-[#05a94f]/50',
              )}>
              <span>{label}</span>
              <span className={cn('text-[11px] font-normal leading-tight', rt === val ? 'text-white/75' : 'text-slate-400')}>
                {desc}
              </span>
            </button>
          ))}
        </div>

        {/* ─── NON_REFUNDABLE ─────────────────────────────────────────── */}
        {rt === 'non_refundable' && (
          <>
            <div className="flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              <p className="text-sm text-red-700 font-medium">ไม่อนุญาตให้คืนที่นั่ง</p>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">เงื่อนไขการยึดเงิน</p>
              <SrForfeitBlock
                forfeitType={value.seatReturnForfeitType}
                forfeitItems={value.seatReturnForfeitItems}
                forfeitOtherText={value.seatReturnForfeitOtherText}
                forfeitCustomText={value.seatReturnForfeitCustomText}
                onForfeitTypeChange={v => p({ seatReturnForfeitType: v })}
                onForfeitItemsChange={v => p({ seatReturnForfeitItems: v })}
                onForfeitOtherTextChange={v => p({ seatReturnForfeitOtherText: v })}
                onForfeitCustomTextChange={v => p({ seatReturnForfeitCustomText: v })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">รายละเอียดเพิ่มเติม</label>
              <textarea rows={2} value={value.seatReturnRemark ?? ''}
                onChange={e => p({ seatReturnRemark: e.target.value || null })}
                placeholder="เช่น เงื่อนไขเพิ่มเติมของสายการบิน..."
                className={cn(inp, 'resize-none w-full')} />
            </div>
          </>
        )}

        {/* ─── PARTIAL_REFUND ─────────────────────────────────────────── */}
        {rt === 'partial_refund' && (
          <>
            {/* % + Deadline row: lg:grid-cols-12 → 2+4+3+3 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">
              {/* % */}
              <div className="lg:col-span-2 space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">% ที่คืนได้</label>
                <select value={String(value.seatReturnPercentPreset ?? '')}
                  onChange={e => {
                    const v = e.target.value
                    if (v === 'custom') p({ seatReturnPercentPreset: 'custom' })
                    else p({ seatReturnPercentPreset: Number(v) as SeatReturnPercentPreset, seatReturnPercentValue: null })
                  }}
                  className={cn(inp, 'text-sm')}>
                  <option value="">เลือก %</option>
                  {SR_PCT_PRESETS.map(o => <option key={String(o.val)} value={String(o.val)}>{o.label}</option>)}
                </select>
                {value.seatReturnPercentPreset === 'custom' && (
                  <input type="number" min={0} max={100} value={value.seatReturnPercentValue ?? ''}
                    onChange={e => p({ seatReturnPercentValue: e.target.value ? Number(e.target.value) : null })}
                    placeholder="0–100" className={cn(inp, 'text-sm mt-1')} />
                )}
              </div>

              {/* Deadline Type */}
              <div className="lg:col-span-4 space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">ประเภท Deadline</label>
                <div className="flex gap-2">
                  {([
                    { val: 'days_before_departure', label: 'ก่อนวันเดินทาง' },
                    { val: 'fixed_date',             label: 'ภายในวันที่กำหนด' },
                  ] as { val: SeatReturnDeadlineType; label: string }[]).map(o => (
                    <button key={o.val} type="button"
                      onClick={() => p({ seatReturnDeadlineType: o.val, seatReturnDeadlineDays: null, seatReturnDeadlineDate: null })}
                      className={cn(
                        'flex-1 px-2 py-2 rounded-lg border text-xs font-medium transition-all text-center',
                        value.seatReturnDeadlineType === o.val
                          ? 'bg-[#05a94f] border-[#05a94f] text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-[#05a94f]/50',
                      )}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Deadline value */}
              <div className="lg:col-span-3 space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">
                  {value.seatReturnDeadlineType === 'fixed_date' ? 'วันที่กำหนด' : 'จำนวนวัน'}
                </label>
                {value.seatReturnDeadlineType === 'fixed_date' ? (
                  <input type="date" value={value.seatReturnDeadlineDate ?? ''}
                    onChange={e => p({ seatReturnDeadlineDate: e.target.value || null })}
                    className={cn(inp, 'text-sm')} />
                ) : (
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} value={value.seatReturnDeadlineDays ?? ''}
                      onChange={e => p({ seatReturnDeadlineDays: e.target.value ? Number(e.target.value) : null })}
                      placeholder="วัน" className={cn(inp, 'text-sm')} />
                    <span className="text-xs text-slate-500 whitespace-nowrap">วันก่อน</span>
                  </div>
                )}
              </div>

              {/* Calc base (read-only) */}
              <div className="lg:col-span-3 space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">ฐานคำนวณ</label>
                <div className={cn(inp, 'text-sm bg-slate-50 text-slate-500 cursor-default')}>
                  Confirm Seat ใน PNR
                </div>
              </div>
            </div>

            {/* Calc box */}
            <SeatReturnCalcBox pct={effectivePct} />

            {/* Refund format */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">รูปแบบการคืนเงิน</label>
              <div className="flex flex-wrap gap-2">
                {SR_REFUND_FORMAT_OPTIONS.map(({ val, label }) => (
                  <button key={val} type="button"
                    onClick={() => p({ seatReturnRefundFormat: val })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                      value.seatReturnRefundFormat === val
                        ? 'bg-[#05a94f] border-[#05a94f] text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-[#05a94f]/50',
                    )}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Refund base */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">ฐานคำนวณยอดคืน</label>
              <div className="flex flex-wrap gap-2">
                {SR_REFUND_BASE_OPTIONS.map(({ val, label }) => (
                  <button key={val} type="button"
                    onClick={() => p({ seatReturnRefundBase: val, seatReturnRefundBaseCustomText: val !== 'custom' ? null : value.seatReturnRefundBaseCustomText })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                      value.seatReturnRefundBase === val
                        ? 'bg-[#05a94f] border-[#05a94f] text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-[#05a94f]/50',
                    )}>
                    {label}
                  </button>
                ))}
              </div>
              {value.seatReturnRefundBase === 'custom' && (
                <input type="text" value={value.seatReturnRefundBaseCustomText ?? ''}
                  onChange={e => p({ seatReturnRefundBaseCustomText: e.target.value || null })}
                  placeholder="ระบุฐานคำนวณยอดคืน..." className={cn(inp, 'text-sm')} />
              )}
            </div>

            {/* Excess refund */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">กรณียอดคืนเกิน</label>
              <div className="flex flex-wrap gap-2">
                {SR_EXCESS_OPTIONS.map(({ val, label }) => (
                  <button key={val} type="button"
                    onClick={() => p({ seatReturnExcessRefund: val, seatReturnExcessRefundCustomText: val !== 'custom' ? null : value.seatReturnExcessRefundCustomText })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                      value.seatReturnExcessRefund === val
                        ? 'bg-[#05a94f] border-[#05a94f] text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-[#05a94f]/50',
                    )}>
                    {label}
                  </button>
                ))}
              </div>
              {value.seatReturnExcessRefund === 'custom' && (
                <input type="text" value={value.seatReturnExcessRefundCustomText ?? ''}
                  onChange={e => p({ seatReturnExcessRefundCustomText: e.target.value || null })}
                  placeholder="ระบุเงื่อนไขกรณียอดคืนเกิน..." className={cn(inp, 'text-sm')} />
              )}
            </div>

            {/* Over-deadline forfeit */}
            <div className="border-t pt-4 space-y-2.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">หากคืนเกินกำหนด</p>
              <SrForfeitBlock
                forfeitType={value.seatReturnOverForfeitType}
                forfeitItems={value.seatReturnOverForfeitItems}
                forfeitOtherText={value.seatReturnOverForfeitOtherText}
                forfeitCustomText={value.seatReturnOverForfeitCustomText}
                onForfeitTypeChange={v => p({ seatReturnOverForfeitType: v })}
                onForfeitItemsChange={v => p({ seatReturnOverForfeitItems: v })}
                onForfeitOtherTextChange={v => p({ seatReturnOverForfeitOtherText: v })}
                onForfeitCustomTextChange={v => p({ seatReturnOverForfeitCustomText: v })}
              />
            </div>

            {/* Remark */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">รายละเอียดเพิ่มเติม</label>
              <textarea rows={2} value={value.seatReturnRemark ?? ''}
                onChange={e => p({ seatReturnRemark: e.target.value || null })}
                placeholder="เช่น เงื่อนไขเพิ่มเติมของสายการบิน..."
                className={cn(inp, 'resize-none w-full')} />
            </div>
          </>
        )}

        {/* ─── FULL_REFUND ─────────────────────────────────────────────── */}
        {rt === 'full_refund' && (
          <>
            {/* Deadline */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">Dateline วันคืนที่</label>
              <div className="flex flex-wrap gap-2">
                {([
                  { val: 'unspecified',          label: 'ไม่ระบุ' },
                  { val: 'days_before_departure', label: 'ก่อนวันเดินทาง' },
                  { val: 'fixed_date',            label: 'ภายในวันที่กำหนด' },
                ] as { val: SeatReturnDeadlineType; label: string }[]).map(o => (
                  <button key={o.val} type="button"
                    onClick={() => p({ seatReturnFullDeadlineType: o.val, seatReturnFullDeadlineDays: null, seatReturnFullDeadlineDate: null })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                      value.seatReturnFullDeadlineType === o.val
                        ? 'bg-[#05a94f] border-[#05a94f] text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-[#05a94f]/50',
                    )}>
                    {o.label}
                  </button>
                ))}
              </div>
              {value.seatReturnFullDeadlineType === 'days_before_departure' && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="number" min={1} value={value.seatReturnFullDeadlineDays ?? ''}
                    onChange={e => p({ seatReturnFullDeadlineDays: e.target.value ? Number(e.target.value) : null })}
                    placeholder="จำนวนวัน" className={cn(inp, 'text-sm w-36')} />
                  <span className="text-xs text-slate-500">วันก่อนวันเดินทาง</span>
                </div>
              )}
              {value.seatReturnFullDeadlineType === 'fixed_date' && (
                <input type="date" value={value.seatReturnFullDeadlineDate ?? ''}
                  onChange={e => p({ seatReturnFullDeadlineDate: e.target.value || null })}
                  className={cn(inp, 'text-sm w-48 mt-2')} />
              )}
            </div>

            {/* Refund base */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">ฐานคำนวณยอดคืน</label>
              <div className="flex flex-wrap gap-2">
                {SR_REFUND_BASE_OPTIONS.map(({ val, label }) => (
                  <button key={val} type="button"
                    onClick={() => p({ seatReturnFullRefundBase: val, seatReturnFullRefundBaseCustomText: val !== 'custom' ? null : value.seatReturnFullRefundBaseCustomText })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                      value.seatReturnFullRefundBase === val
                        ? 'bg-[#05a94f] border-[#05a94f] text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-[#05a94f]/50',
                    )}>
                    {label}
                  </button>
                ))}
              </div>
              {value.seatReturnFullRefundBase === 'custom' && (
                <input type="text" value={value.seatReturnFullRefundBaseCustomText ?? ''}
                  onChange={e => p({ seatReturnFullRefundBaseCustomText: e.target.value || null })}
                  placeholder="ระบุฐานคำนวณยอดคืน..." className={cn(inp, 'text-sm')} />
              )}
            </div>

            {/* Refund fee */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">ค่าธรรมเนียมการคืน</label>
              <div className="flex flex-wrap gap-2">
                {SR_FEE_OPTIONS.map(({ val, label }) => (
                  <button key={val} type="button"
                    onClick={() => p({ seatReturnFullRefundFeeType: val, seatReturnFullRefundFeeAmount: null, seatReturnFullRefundFeePercent: null, seatReturnFullRefundFeeCustomText: null })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                      value.seatReturnFullRefundFeeType === val
                        ? 'bg-[#05a94f] border-[#05a94f] text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-[#05a94f]/50',
                    )}>
                    {label}
                  </button>
                ))}
              </div>
              {value.seatReturnFullRefundFeeType === 'fixed_amount' && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="number" min={0} value={value.seatReturnFullRefundFeeAmount ?? ''}
                    onChange={e => p({ seatReturnFullRefundFeeAmount: e.target.value ? Number(e.target.value) : null })}
                    placeholder="จำนวนเงิน" className={cn(inp, 'text-sm w-48')} />
                  <span className="text-xs text-slate-500">บาท</span>
                </div>
              )}
              {value.seatReturnFullRefundFeeType === 'percent' && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="number" min={0} max={100} value={value.seatReturnFullRefundFeePercent ?? ''}
                    onChange={e => p({ seatReturnFullRefundFeePercent: e.target.value ? Number(e.target.value) : null })}
                    placeholder="%" className={cn(inp, 'text-sm w-32')} />
                  <span className="text-xs text-slate-500">% ของยอดที่ชำระ</span>
                </div>
              )}
              {value.seatReturnFullRefundFeeType === 'custom' && (
                <input type="text" value={value.seatReturnFullRefundFeeCustomText ?? ''}
                  onChange={e => p({ seatReturnFullRefundFeeCustomText: e.target.value || null })}
                  placeholder="ระบุค่าธรรมเนียมการคืน..." className={cn(inp, 'text-sm mt-2')} />
              )}
            </div>

            {/* Excess refund */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">กรณียอดคืนเกิน</label>
              <div className="flex flex-wrap gap-2">
                {SR_EXCESS_OPTIONS.map(({ val, label }) => (
                  <button key={val} type="button"
                    onClick={() => p({ seatReturnFullExcessRefund: val, seatReturnFullExcessRefundCustomText: val !== 'custom' ? null : value.seatReturnFullExcessRefundCustomText })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                      value.seatReturnFullExcessRefund === val
                        ? 'bg-[#05a94f] border-[#05a94f] text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-[#05a94f]/50',
                    )}>
                    {label}
                  </button>
                ))}
              </div>
              {value.seatReturnFullExcessRefund === 'custom' && (
                <input type="text" value={value.seatReturnFullExcessRefundCustomText ?? ''}
                  onChange={e => p({ seatReturnFullExcessRefundCustomText: e.target.value || null })}
                  placeholder="ระบุเงื่อนไขกรณียอดคืนเกิน..." className={cn(inp, 'text-sm')} />
              )}
            </div>

            {/* Remark */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">รายละเอียดเพิ่มเติม</label>
              <textarea rows={2} value={value.seatReturnRemark ?? ''}
                onChange={e => p({ seatReturnRemark: e.target.value || null })}
                placeholder="เช่น เงื่อนไขเพิ่มเติมของสายการบิน..."
                className={cn(inp, 'resize-none w-full')} />
            </div>
          </>
        )}

      </CardContent>
    </Card>
  )
}

// ─── Seat Reduction Step / Tier Table ─────────────────────────────────────────

/** Returns a list of validation error messages for a single tier (empty = valid). */
export function validateSeatReductionTier(t: SeatReductionTier): string[] {
  const errs: string[] = []
  if (t.dayConditionType === 'days_before_departure') {
    if (!t.daysBeforeDeparture || t.daysBeforeDeparture <= 0) errs.push('ระบุจำนวนวันก่อนเดินทางมากกว่า 0')
  } else if (t.dayConditionType === 'day_range') {
    if (t.dayRangeFrom == null || t.dayRangeTo == null) errs.push('ระบุช่วงวัน จาก–ถึง')
    else if (t.dayRangeFrom <= t.dayRangeTo) errs.push('จากวันต้องมากกว่าถึงวัน (เช่น 44–30)')
  }
  if (t.reductionConditionType === 'over_percent' || t.reductionConditionType === 'max_percent') {
    if (t.reductionPercentValue == null || t.reductionPercentValue <= 0 || t.reductionPercentValue > 100)
      errs.push('ระบุเปอร์เซ็นต์ 1–100')
  }
  if (t.penaltyType === 'percent_fee') {
    if (t.penaltyPercentValue == null || t.penaltyPercentValue <= 0 || t.penaltyPercentValue > 100)
      errs.push('ระบุเปอร์เซ็นต์ค่าปรับ 1–100')
  } else if (t.penaltyType === 'fixed_fee') {
    if (t.penaltyAmountValue == null || t.penaltyAmountValue <= 0) errs.push('ระบุจำนวนเงินค่าปรับ')
  } else if (t.penaltyType === 'custom') {
    if (!t.penaltyCustomText?.trim()) errs.push('ระบุรายละเอียดค่าปรับ')
  }
  if (t.calculationBase === 'custom' && !t.calculationBaseCustomText?.trim())
    errs.push('ระบุรายละเอียดฐานคำนวณ')
  return errs
}

function SeatReductionTierTable({ tiers, currency, showValidation, onChange }: {
  tiers: SeatReductionTier[]
  currency: string
  showValidation: boolean
  onChange: (tiers: SeatReductionTier[]) => void
}) {
  const renumber = (list: SeatReductionTier[]) => list.map((t, i) => ({ ...t, order: i + 1 }))
  const add    = () => onChange(renumber([...tiers, createEmptySeatReductionTier(tiers.length + 1)]))
  const remove = (idx: number) => onChange(renumber(tiers.filter((_, i) => i !== idx)))
  const update = (idx: number, patch: Partial<SeatReductionTier>) =>
    onChange(tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= tiers.length) return
    const next = [...tiers]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onChange(renumber(next))
  }

  const lbl = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Step เงื่อนไขการลดที่นั่ง</p>
        <span className="text-[11px] text-slate-400">{tiers.length} Step</span>
      </div>

      {showValidation && tiers.length === 0 && (
        <p className="text-xs text-red-600">ต้องมีอย่างน้อย 1 Step</p>
      )}

      {tiers.map((t, idx) => {
        const errs = showValidation ? validateSeatReductionTier(t) : []
        const summary = formatSeatReductionTierLine(t)
        return (
          <div key={idx} className="border border-slate-200 rounded-xl p-4 space-y-4 bg-white">
            {/* Header: order + move/delete + summary */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#05a94f]/10 text-[#05a94f] text-xs font-bold">
                  {idx + 1}
                </span>
                <span className="text-sm font-medium text-slate-700">Step {idx + 1}</span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="เลื่อนขึ้น">
                  <ChevronUp size={15} />
                </button>
                <button type="button" onClick={() => move(idx, 1)} disabled={idx === tiers.length - 1}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="เลื่อนลง">
                  <ChevronDown size={15} />
                </button>
                <button type="button" onClick={() => remove(idx)}
                  className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                  title="ลบ Step">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* ช่วงวันก่อนเดินทาง */}
              <div>
                <label className={lbl}>ช่วงวันก่อนเดินทาง</label>
                <select className={cn(inp, 'appearance-none')}
                  value={t.dayConditionType}
                  onChange={e => update(idx, {
                    dayConditionType: e.target.value as TierDayConditionType,
                    daysBeforeDeparture: null, dayRangeFrom: null, dayRangeTo: null,
                  })}>
                  <option value="none">ไม่ระบุ</option>
                  <option value="days_before_departure">ก่อนวันเดินทางกี่วัน</option>
                  <option value="day_range">ช่วงวันก่อนเดินทาง</option>
                </select>
                {t.dayConditionType === 'days_before_departure' && (
                  <div className="relative mt-2">
                    <input type="number" min={1} placeholder="เช่น 45"
                      className={cn(inp, 'pr-10')}
                      value={t.daysBeforeDeparture ?? ''}
                      onChange={e => update(idx, { daysBeforeDeparture: e.target.value ? Number(e.target.value) : null })} />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">วัน</span>
                  </div>
                )}
                {t.dayConditionType === 'day_range' && (
                  <div className="flex items-center gap-2 mt-2">
                    <input type="number" min={0} placeholder="จาก เช่น 44"
                      className={inp}
                      value={t.dayRangeFrom ?? ''}
                      onChange={e => update(idx, { dayRangeFrom: e.target.value ? Number(e.target.value) : null })} />
                    <span className="text-slate-400 text-xs">–</span>
                    <input type="number" min={0} placeholder="ถึง เช่น 30"
                      className={inp}
                      value={t.dayRangeTo ?? ''}
                      onChange={e => update(idx, { dayRangeTo: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                )}
              </div>

              {/* เงื่อนไขจำนวนที่ลด */}
              <div>
                <label className={lbl}>เงื่อนไขจำนวนที่ลด</label>
                <select className={cn(inp, 'appearance-none')}
                  value={t.reductionConditionType}
                  onChange={e => update(idx, {
                    reductionConditionType: e.target.value as TierReductionCondType,
                    reductionPercentValue: null, reductionConditionCustomText: null,
                  })}>
                  {(Object.keys(TIER_REDUCTION_COND_LABELS) as TierReductionCondType[]).map(k => (
                    <option key={k} value={k}>{TIER_REDUCTION_COND_LABELS[k]}</option>
                  ))}
                </select>
                {(t.reductionConditionType === 'over_percent' || t.reductionConditionType === 'max_percent') && (
                  <div className="relative mt-2">
                    <input type="number" min={1} max={100} placeholder="เช่น 20"
                      className={cn(inp, 'pr-7')}
                      value={t.reductionPercentValue ?? ''}
                      onChange={e => update(idx, { reductionPercentValue: e.target.value ? Number(e.target.value) : null })} />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                  </div>
                )}
                {t.reductionConditionType === 'custom' && (
                  <textarea rows={2} placeholder="ระบุเงื่อนไขจำนวนที่ลด..."
                    className={cn(inp, 'resize-none mt-2')}
                    value={t.reductionConditionCustomText ?? ''}
                    onChange={e => update(idx, { reductionConditionCustomText: e.target.value || null })} />
                )}
              </div>

              {/* รูปแบบค่าปรับ / การยึด */}
              <div>
                <label className={lbl}>รูปแบบค่าปรับ / การยึด</label>
                <select className={cn(inp, 'appearance-none')}
                  value={t.penaltyType}
                  onChange={e => update(idx, {
                    penaltyType: e.target.value as TierPenaltyType,
                    penaltyPercentValue: null, penaltyAmountValue: null, penaltyCustomText: null,
                  })}>
                  {(Object.keys(TIER_PENALTY_LABELS) as TierPenaltyType[]).map(k => (
                    <option key={k} value={k}>{TIER_PENALTY_LABELS[k]}</option>
                  ))}
                </select>
              </div>

              {/* มูลค่า */}
              <div>
                <label className={lbl}>มูลค่า</label>
                {t.penaltyType === 'percent_fee' ? (
                  <div className="relative">
                    <input type="number" min={1} max={100} placeholder="เช่น 15"
                      className={cn(inp, 'pr-7')}
                      value={t.penaltyPercentValue ?? ''}
                      onChange={e => update(idx, { penaltyPercentValue: e.target.value ? Number(e.target.value) : null })} />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                  </div>
                ) : t.penaltyType === 'fixed_fee' ? (
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} placeholder="จำนวนเงิน"
                      className={inp}
                      value={t.penaltyAmountValue ?? ''}
                      onChange={e => update(idx, { penaltyAmountValue: e.target.value ? Number(e.target.value) : null })} />
                    <input type="text" placeholder="THB"
                      className={cn(inp, 'w-20 text-center')}
                      value={t.penaltyCurrency || currency || 'THB'}
                      onChange={e => update(idx, { penaltyCurrency: e.target.value })} />
                  </div>
                ) : t.penaltyType === 'custom' ? (
                  <textarea rows={2} placeholder="ระบุรายละเอียดค่าปรับ..."
                    className={cn(inp, 'resize-none')}
                    value={t.penaltyCustomText ?? ''}
                    onChange={e => update(idx, { penaltyCustomText: e.target.value || null })} />
                ) : (
                  <div className={cn(inp, 'bg-slate-50 text-slate-400 cursor-default select-none')}>—</div>
                )}
              </div>

              {/* ฐานคำนวณ */}
              <div>
                <label className={lbl}>ฐานคำนวณ</label>
                <select className={cn(inp, 'appearance-none')}
                  value={t.calculationBase ?? ''}
                  onChange={e => update(idx, {
                    calculationBase: (e.target.value || null) as TierCalcBase | null,
                    calculationBaseCustomText: e.target.value === 'custom' ? t.calculationBaseCustomText : null,
                  })}>
                  <option value="">ไม่ระบุ</option>
                  {(Object.keys(TIER_CALC_BASE_LABELS) as TierCalcBase[]).map(k => (
                    <option key={k} value={k}>{TIER_CALC_BASE_LABELS[k]}</option>
                  ))}
                </select>
                {t.calculationBase === 'custom' && (
                  <input type="text" placeholder="ระบุฐานคำนวณ..."
                    className={cn(inp, 'mt-2')}
                    value={t.calculationBaseCustomText ?? ''}
                    onChange={e => update(idx, { calculationBaseCustomText: e.target.value || null })} />
                )}
              </div>

              {/* หมายเหตุ */}
              <div>
                <label className={lbl}>หมายเหตุ</label>
                <textarea rows={2} placeholder="หมายเหตุ (ไม่บังคับ)"
                  className={cn(inp, 'resize-none')}
                  value={t.remark ?? ''}
                  onChange={e => update(idx, { remark: e.target.value || null })} />
              </div>
            </div>

            {/* Per-step summary + errors */}
            {summary && (
              <div className="flex items-start gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide shrink-0 mt-0.5">Summary</span>
                <p className="text-xs text-slate-700 font-medium">{summary}</p>
              </div>
            )}
            {errs.length > 0 && (
              <ul className="text-[11px] text-red-600 space-y-0.5 list-disc list-inside">
                {errs.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )
      })}

      <button type="button" onClick={add}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[#05a94f]/40 text-[#05a94f] text-sm font-medium hover:bg-[#05a94f]/5 transition-colors">
        <PlusCircle size={15} /> เพิ่ม Step
      </button>
    </div>
  )
}

function PreviewSection({ schedule, templateName, airlineCode, currency, templateType }: {
  schedule: PaymentRound[]; templateName: string; airlineCode: string; currency: string
  templateType: TemplateType
}) {
  const [open, setOpen] = useState(true)
  const airlineFound = MASTER_AIRLINES.find(a => a.code === airlineCode)
  const airlineLabel = airlineFound ? `${airlineFound.code} — ${airlineFound.name}` : airlineCode

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors">
        <div className="flex items-center gap-2">
          <Eye size={15} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">ตัวอย่างแสดงผล</span>
          {schedule.length > 0 && (
            <span className="text-[11px] px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full">
              {schedule.length} รอบชำระเงิน
            </span>
          )}
        </div>
        {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDownIcon size={15} className="text-slate-400" />}
      </button>

      {open && (
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
            <div className="text-xs text-slate-500 mb-1">แม่แบบ</div>
            <div className="font-semibold text-slate-800">{templateName || '(ยังไม่ระบุชื่อ)'}</div>
            <div className="flex gap-4 mt-2 text-xs text-slate-500">
              <span>สายการบิน: <b className="text-slate-700">{airlineLabel || '—'}</b></span>
              <span>ประเภทตั๋ว: <b className="text-slate-700">Group</b></span>
              <span>สกุลเงิน: <b className="text-slate-700">{currency}</b></span>
            </div>
          </div>

          {/* Template flags */}
          <div className="grid grid-cols-3 gap-2">
            {([
              ['สร้างรอบชำระเงิน',  canGeneratePaymentRounds({ templateType })],
              ['ใช้คำนวณยอดเงิน',   canGeneratePaymentRounds({ templateType })],
              ['ใช้เป็นเงื่อนไขประกอบ', true],
            ] as [string, boolean][]).map(([label, yes]) => (
              <div key={label} className={cn(
                'flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-[11px] font-medium',
                yes ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'
              )}>
                <span>{yes ? '✓' : '—'}</span>
                <span>{label}: <b>{yes ? 'ใช่' : 'ไม่ใช่'}</b></span>
              </div>
            ))}
          </div>

          {/* Sample params */}
          <div className="text-[11px] text-slate-400 flex flex-wrap gap-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <span>ตัวอย่างคำนวณ:</span>
            <span>Seat เริ่มต้น = <b>{SAMPLE_INITIAL_SEAT}</b></span>
            <span>Seat ปัจจุบัน = <b>{SAMPLE_CURRENT_SEAT}</b></span>
            <span>Book = <b>1</b></span>
            <span>Net Fare = <b>{SAMPLE_NET_FARE.toLocaleString()} {currency}</b></span>
            <span>Group Fare = <b>{SAMPLE_GROUP_FARE.toLocaleString()} {currency}</b></span>
          </div>

          {/* Payment Schedule */}
          {schedule.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีรอบการชำระเงิน</p>
          ) : (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5 flex items-center gap-1.5">
                <CreditCard size={11} /> รอบการชำระเงิน
              </div>
              {schedule.map((r) => {
                const ptColor = r.paymentType ? (PAYMENT_TYPE_COLORS[r.paymentType as PaymentRoundType] ?? '') : ''
                const ex = calcRoundExample(r)
                return (
                  <div key={r.roundId} className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-slate-200 bg-white">
                    <span className="shrink-0 w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white bg-[#05a94f] rounded-full mt-0.5">
                      {r.roundNo}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border', ptColor)}>
                          {r.paymentType ? (PAYMENT_TYPE_LABELS[r.paymentType as PaymentRoundType] ?? r.paymentType) : '—'}
                        </span>
                        <span className="text-xs font-medium text-slate-800">{r.roundName}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{roundSummary(r)}</p>
                      {ex && <p className="text-[11px] text-blue-600 font-mono mt-0.5">{ex}</p>}
                    </div>
                    <div className="shrink-0 flex gap-1 text-[10px]">
                      {r.creditTowardFare && <span className="text-blue-600 border border-blue-200 rounded px-1">หักจาก{r.deductBase === 'fare_tax' ? 'Fare+Tax' : 'Fare'}</span>}
                      {effectiveRefundStatus(r) === 'refundable' && <span className="text-[#05a94f] border border-green-200 rounded px-1">คืนเงินได้</span>}
                      {effectiveRefundStatus(r) === 'non_refundable' && <span className="text-red-600 border border-red-200 rounded px-1">คืนเงินไม่ได้</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────



interface Props {
  mode: 'add' | 'edit'
  template?: DemoConditionTemplate
  initialCode?: string
  onSave: (data: DemoConditionTemplate) => void
  onCancel: () => void
}

// ─── Main Form ────────────────────────────────────────────────────────────────

export default function ConditionTemplateForm({ mode, template, initialCode = '', onSave, onCancel }: Props) {
  // Basic info state
  const [code,         setCode]         = useState(template?.templateCode ?? initialCode)
  const [name,         setName]         = useState(template?.templateName ?? '')
  // templateType is not user-editable — preserve existing value or default to 'PAYMENT'
  const templateType: TemplateType = template?.templateType ?? 'PAYMENT'
  const [airlineCode,  setAirlineCode]  = useState<string>(template?.airlineCode ?? template?.airlines?.[0] ?? '')
  const [currency,     setCurrency]     = useState(template?.currency ?? 'THB')
  const [status,       setStatus]       = useState<'Active' | 'Inactive'>(template?.status ?? 'Active')
  const [desc,         setDesc]         = useState(template?.description ?? '')
  const [noteHtml,   setNoteHtml]   = useState(template?.internalConditionNoteHtml ?? '')

  // Payment Schedule
  const [schedule, setSchedule] = useState<PaymentRound[]>(template?.paymentSchedule ?? [])

  // ── Baggage Condition ────────────────────────────────────────────────────
  const [baggage, setBaggage] = useState<BaggageCondition>(() => {
    const raw = template?.baggageCondition
    if (!raw) return BAGGAGE_STATUS_EMPTY
    // migrate old format (had pieces/weightKg fields, no weightMode)
    const r = raw as unknown as Record<string, unknown>
    if (!r.weightMode) {
      const status: BaggageStatus =
        r.status === 'NO_BAGGAGE' ? 'NO_BAGGAGE'
        : r.status === 'INCLUDED' ? 'INCLUDED'
        : 'UNSPECIFIED'
      if (status !== 'INCLUDED') return { ...BAGGAGE_STATUS_EMPTY, status }
      return {
        ...BAGGAGE_STATUS_EMPTY,
        status: 'INCLUDED',
        baggagePieceType: r.pieces != null ? 'preset' : (r.piecesCustom ? 'custom' : 'unspecified'),
        baggagePieceValue: typeof r.pieces === 'number' ? r.pieces : null,
        baggagePieceCustom: typeof r.piecesCustom === 'string' ? r.piecesCustom : '',
        baggageWeightPerPieceType: r.weightKg != null ? 'preset' : (r.weightCustom ? 'custom' : 'unspecified'),
        baggageWeightPerPieceValue: typeof r.weightKg === 'number' ? r.weightKg : null,
        baggageWeightPerPieceCustom: typeof r.weightCustom === 'string' ? r.weightCustom : '',
        baggageRemark: typeof r.remark === 'string' ? r.remark : '',
      }
    }
    return raw as BaggageCondition
  })

  const selectBaggageStatus = (s: BaggageStatus) => {
    if (s === 'INCLUDED') {
      setBaggage(prev =>
        prev.status === 'INCLUDED'
          ? prev
          : { ...BAGGAGE_STATUS_EMPTY, status: 'INCLUDED' },
      )
    } else {
      setBaggage(prev =>
        prev.status === s ? prev : { ...BAGGAGE_STATUS_EMPTY, status: s },
      )
    }
  }

  const selectWeightMode = (m: BaggageWeightMode) => {
    setBaggage(prev => prev.weightMode === m ? prev : { ...prev, weightMode: m })
  }

  const resizePieceWeights = (current: string[], count: number): string[] => {
    if (count <= current.length) return current.slice(0, count)
    return [...current, ...Array(count - current.length).fill('')]
  }

  // ── Seat Reduction Condition ─────────────────────────────────────────────
  const defaultSeatReduction: SeatReductionCondition = {
    policy: 'NOT_ALLOWED', maxPercent: 0,
    noticeType: 'DAYS_BEFORE', noticeDays: 0, noticeFixedDate: '',
    calcBase: '', penalty: '', penaltyCustom: '', overReductionConditionText: '',
    seatReductionMode: 'single', seatReductionTiers: [],
  }
  const [seatReduction, setSeatReduction] = useState<SeatReductionCondition>(() => {
    const raw = template?.seatReductionCondition
    if (!raw) return defaultSeatReduction
    // back-compat: default mode to 'single' and ensure tiers array exists
    return {
      ...raw,
      seatReductionMode: raw.seatReductionMode ?? 'single',
      seatReductionTiers: raw.seatReductionTiers ?? [],
    }
  })

  // Seat Reduction — mode switch (tier rows are managed by SeatReductionTierTable)
  const setSeatReductionMode = (mode: SeatReductionMode) =>
    setSeatReduction(prev => ({
      ...prev,
      seatReductionMode: mode,
      // seed one empty tier when switching to tier with none yet
      seatReductionTiers:
        mode === 'tier' && (prev.seatReductionTiers ?? []).length === 0
          ? [createEmptySeatReductionTier(1)]
          : prev.seatReductionTiers ?? [],
    }))
  const setSeatTiers = (next: SeatReductionTier[]) =>
    setSeatReduction(prev => ({ ...prev, seatReductionTiers: next }))

  // ── Seat Return Condition ────────────────────────────────────────────────
  // Migration lives in normalizeSeatReturnCondition() (single source of truth);
  // applied here defensively in case a non-normalized template is ever passed in.
  const [seatReturn, setSeatReturn] = useState<SeatReturnCondition>(
    () => normalizeSeatReturnCondition(template?.seatReturnCondition) ?? EMPTY_SEAT_RETURN_CONDITION,
  )

  // ── Ticket Refund Condition ──────────────────────────────────────────────
  const [ticketRefund, setTicketRefund] = useState<TicketRefundCondition>(
    template?.ticketRefundCondition ?? EMPTY_TICKET_REFUND_CONDITION,
  )
  const [testSeats, setTestSeats] = useState('')
  const selectSeatPolicy = (p: SeatReductionPolicy) => {
    if (p === 'ALLOWED') {
      setSeatReduction(prev =>
        prev.policy === 'ALLOWED'
          ? prev
          : {
              policy: 'ALLOWED', reductionPercentType: 10, maxPercent: 10,
              noticeType: 'DAYS_BEFORE', noticeDays: 45, noticeFixedDate: '',
              calcBase: 'CONFIRMED_SEATS', penalty: '', penaltyCustom: '',
              overReductionConditionText: prev.overReductionConditionText ?? '',
              seatReductionMode: prev.seatReductionMode ?? 'single',
              seatReductionTiers: prev.seatReductionTiers ?? [],
            },
      )
    } else {
      setSeatReduction(prev => ({
        policy: p, maxPercent: 0,
        noticeType: 'DAYS_BEFORE', noticeDays: 0, noticeFixedDate: '',
        calcBase: '', penalty: '', penaltyCustom: '',
        overReductionConditionText: prev.overReductionConditionText ?? '',
        seatReductionMode: prev.seatReductionMode ?? 'single',
        seatReductionTiers: prev.seatReductionTiers ?? [],
      }))
    }
  }

  // Validation
  const [showValidation, setShowValidation] = useState(false)
  const [codeError,      setCodeError]      = useState('')

  // Submit
  const handleSubmit = useCallback(() => {
    setShowValidation(true)
    if (!name.trim() || !code.trim() || !airlineCode.trim()) return

    if (isTemplateCodeTaken(code.trim(), template?.templateId)) {
      setCodeError('Template Code นี้ถูกใช้แล้ว')
      return
    }
    setCodeError('')

    // Seat Reduction — tier mode validation
    if (seatReduction.policy === 'ALLOWED' && seatReduction.seatReductionMode === 'tier') {
      const tiers = seatReduction.seatReductionTiers ?? []
      if (tiers.length === 0) return
      if (tiers.some(t => validateSeatReductionTier(t).length > 0)) return
    }

    onSave({
      templateId:               template?.templateId ?? '',
      templateCode:             code.trim(),
      templateName:             name.trim(),
      templateType,
      airlineCode:              airlineCode,
      airlines:                 [airlineCode],
      ticketType:               'Group',
      currency,
      description:              template?.description ?? '',
      status,
      version:                  template?.version ?? 1,
      createdAt:                template?.createdAt ?? new Date().toISOString(),
      updatedAt:                new Date().toISOString(),
      stages:                   [],
      freeTextCondition:        template?.freeTextCondition ?? '',
      internalNote:             '',
      internalConditionNoteHtml: noteHtml,
      refundPolicyEnabled:      false,
      refundType:               'NON_REFUNDABLE',
      refundDescription:        '',
      requireApproval:          false,
      refundNote:               '',
      refundConditions:         [],
      rules:                    template?.rules ?? [],
      paymentSchedule:          schedule,
      baggageCondition:         baggage,
      seatReductionCondition:   seatReduction,
      seatReturnCondition:      seatReturn,
      ticketRefundCondition:    ticketRefund,
    })
  }, [name, code, airlineCode, currency, status, noteHtml, schedule, baggage, seatReduction, seatReturn, ticketRefund, template, onSave])

  // Derived errors
  const nameErr     = showValidation && !name.trim()       ? 'กรุณาระบุชื่อ Template'   : undefined
  const codeErr     = (showValidation && !code.trim() ? 'กรุณาระบุ Template Code' : undefined) ?? (codeError ? codeError : undefined)
  const airlineErr  = showValidation && !airlineCode.trim() ? 'กรุณาเลือกสายการบิน'    : undefined

  // iCls for basic info inputs
  const iCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#05a94f]/30 focus:border-[#05a94f] bg-white'

  return (
    <div className="w-full space-y-4">
      {/* ── Sticky action bar ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 -mx-6 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">
            {mode === 'add' ? 'สร้าง Template Condition' : 'แก้ไข Template Condition'}
          </span>
          {template && (
            <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
              v{template.version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={onCancel}>ยกเลิก</Button>
          <Button size="sm" icon={<Save size={14} />} onClick={handleSubmit}>
            {mode === 'add' ? 'สร้าง Template' : 'บันทึกการแก้ไข'}
          </Button>
        </div>
      </div>

      {/* ── Edit mode banner ──────────────────────────────────────────────── */}
      {mode === 'edit' && (
        <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>การแก้ไข Template จะไม่ส่งผลต่อ Series ที่ใช้ Template นี้แล้ว — หากต้องการอัปเดต Series ให้กดยืนยันแยก</span>
        </div>
      )}

      {/* ── Basic Info ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">ข้อมูลพื้นฐาน Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Row 1: Code | Name | Ticket Type (locked) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {/* Template Code */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Condition Code<span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                className={cn(iCls, codeErr && 'border-red-400')}
                value={code}
                onChange={e => { setCode(e.target.value); setCodeError('') }}
                placeholder="เช่น TG-GROUP-2026"
              />
              {codeErr && <p className="mt-0.5 text-[11px] text-red-500">{codeErr}</p>}
            </div>

            {/* Template Name */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Condition Name<span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                className={cn(iCls, nameErr && 'border-red-400')}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="เช่น TG Group Standard 2026"
              />
              {nameErr && <p className="mt-0.5 text-[11px] text-red-500">{nameErr}</p>}
            </div>

            {/* Ticket Type — locked */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">ประเภทตั๋ว</label>
              <div className={cn(iCls, 'bg-slate-50 text-slate-500 cursor-not-allowed select-none flex items-center gap-1.5')}>
                <Lock size={11} className="text-slate-400 shrink-0" />
                Group
              </div>
            </div>

          </div>

          {/* Row 2: Airline | Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 items-start">
            <div className="sm:col-span-2">
              <AirlineCombobox
                label="สายการบิน"
                required
                showAllOption={false}
                value={airlineCode}
                onChange={setAirlineCode}
                error={airlineErr}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">สกุลเงิน</label>
              <select className={cn(iCls, 'appearance-none cursor-pointer')} value={currency}
                onChange={e => setCurrency(e.target.value)}>
                {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Baggage Condition ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-sm">เงื่อนไขสัมภาระ / Baggage Condition</CardTitle>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                ใช้สำหรับกำหนดน้ำหนักและเงื่อนไขสัมภาระที่รวมในราคาตั๋ว
              </p>
            </div>
            {baggage.status !== 'UNSPECIFIED' && (
              <button type="button" onClick={() => setBaggage(BAGGAGE_STATUS_EMPTY)}
                className="text-[11px] text-slate-400 hover:text-red-500 transition-colors shrink-0 mt-0.5">
                ล้างค่า
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-4">
          {/* Status selector — 3 options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['UNSPECIFIED', 'NO_BAGGAGE', 'INCLUDED'] as BaggageStatus[]).map(s => (
              <button key={s} type="button" onClick={() => selectBaggageStatus(s)}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all',
                  baggage.status === s
                    ? 'border-[#05a94f] bg-[#05a94f]/5 text-[#05a94f]'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                )}>
                <span className={cn(
                  'w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                  baggage.status === s ? 'border-[#05a94f]' : 'border-slate-300',
                )}>
                  {baggage.status === s && <span className="w-2 h-2 rounded-full bg-[#05a94f]" />}
                </span>
                {BAGGAGE_STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {/* NO_BAGGAGE: compact notice */}
          {baggage.status === 'NO_BAGGAGE' && (
            <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <p className="text-sm text-amber-700 font-medium">ไม่มีน้ำหนักกระเป๋า (No Baggage Included)</p>
            </div>
          )}

          {/* Conditional fields — INCLUDED */}
          {baggage.status === 'INCLUDED' && (() => {
            const pillCls = (active: boolean) => cn(
              'px-3 py-1 rounded-lg border text-sm font-medium transition-all whitespace-nowrap',
              active ? 'border-[#05a94f] bg-[#05a94f]/5 text-[#05a94f]'
                     : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )
            const lbl = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5'

            // ── Piece count row (shared by same_per_piece / total_weight / different_per_piece)
            const pieceRow = (showUnspecified = true) => (
              <div>
                <label className={lbl}>จำนวนชิ้นกระเป๋า</label>
                <div className="flex flex-wrap gap-1.5">
                  {showUnspecified && (
                    <button type="button" className={pillCls(baggage.baggagePieceType === 'unspecified')}
                      onClick={() => setBaggage(prev => ({ ...prev, baggagePieceType: 'unspecified', baggagePieceValue: null, baggagePieceCustom: '' }))}>
                      ไม่ระบุ
                    </button>
                  )}
                  {([1, 2] as const).map(n => (
                    <button key={n} type="button"
                      className={pillCls(baggage.baggagePieceType === 'preset' && baggage.baggagePieceValue === n)}
                      onClick={() => setBaggage(prev => ({
                        ...prev,
                        baggagePieceType: 'preset', baggagePieceValue: n, baggagePieceCustom: '',
                        baggagePieceWeights: resizePieceWeights(prev.baggagePieceWeights, n),
                        baggageTotalPieceWeights: resizePieceWeights(prev.baggageTotalPieceWeights ?? [], n),
                      }))}>
                      {n} ชิ้น
                    </button>
                  ))}
                  <button type="button" className={pillCls(baggage.baggagePieceType === 'custom')}
                    onClick={() => setBaggage(prev => ({ ...prev, baggagePieceType: 'custom', baggagePieceValue: null }))}>
                    อื่นๆ
                  </button>
                  {baggage.baggagePieceType === 'custom' && (
                    <input type="number" min={1} className={cn(iCls, 'w-24 text-sm')}
                      placeholder="จำนวน" value={baggage.baggagePieceCustom}
                      onChange={e => {
                        const v = e.target.value
                        const n = parseInt(v) || 0
                        setBaggage(prev => ({
                          ...prev,
                          baggagePieceCustom: v,
                          baggagePieceWeights: resizePieceWeights(prev.baggagePieceWeights, n),
                          baggageTotalPieceWeights: resizePieceWeights(prev.baggageTotalPieceWeights ?? [], n),
                        }))
                      }} />
                  )}
                </div>
              </div>
            )

            // ── Remark row (shared)
            const remarkRow = (
              <div>
                <label className={lbl}>หมายเหตุเพิ่มเติม</label>
                <input className={cn(iCls, 'text-sm w-full')} placeholder="เช่น รวมสัมภาระในราคาตั๋ว"
                  value={baggage.baggageRemark}
                  onChange={e => setBaggage(prev => ({ ...prev, baggageRemark: e.target.value }))} />
              </div>
            )

            return (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                {/* Weight mode selector */}
                <div>
                  <label className={lbl}>รูปแบบน้ำหนักกระเป๋า</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(BAGGAGE_WEIGHT_MODE_LABELS) as BaggageWeightMode[]).map(m => (
                      <button key={m} type="button" onClick={() => selectWeightMode(m)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium text-left transition-all',
                          baggage.weightMode === m
                            ? 'border-[#05a94f] bg-[#05a94f]/5 text-[#05a94f]'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                        )}>
                        <span className={cn(
                          'w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                          baggage.weightMode === m ? 'border-[#05a94f]' : 'border-slate-300',
                        )}>
                          {baggage.weightMode === m && <span className="w-1.5 h-1.5 rounded-full bg-[#05a94f]" />}
                        </span>
                        {BAGGAGE_WEIGHT_MODE_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── same_per_piece ───────────────────────── */}
                {baggage.weightMode === 'same_per_piece' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {pieceRow(true)}
                      <div>
                        <label className={lbl}>น้ำหนักต่อชิ้น</label>
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" className={pillCls(baggage.baggageWeightPerPieceType === 'unspecified')}
                            onClick={() => setBaggage(prev => ({ ...prev, baggageWeightPerPieceType: 'unspecified', baggageWeightPerPieceValue: null, baggageWeightPerPieceCustom: '' }))}>
                            ไม่ระบุ
                          </button>
                          {([20, 23, 30] as const).map(kg => (
                            <button key={kg} type="button"
                              className={pillCls(baggage.baggageWeightPerPieceType === 'preset' && baggage.baggageWeightPerPieceValue === kg)}
                              onClick={() => setBaggage(prev => ({ ...prev, baggageWeightPerPieceType: 'preset', baggageWeightPerPieceValue: kg, baggageWeightPerPieceCustom: '' }))}>
                              {kg} กก.
                            </button>
                          ))}
                          <button type="button" className={pillCls(baggage.baggageWeightPerPieceType === 'custom')}
                            onClick={() => setBaggage(prev => ({ ...prev, baggageWeightPerPieceType: 'custom', baggageWeightPerPieceValue: null }))}>
                            อื่นๆ
                          </button>
                          {baggage.baggageWeightPerPieceType === 'custom' && (
                            <input type="number" min={0.1} step={0.1} className={cn(iCls, 'w-28 text-sm')}
                              placeholder="กก." value={baggage.baggageWeightPerPieceCustom}
                              onChange={e => setBaggage(prev => ({ ...prev, baggageWeightPerPieceCustom: e.target.value }))} />
                          )}
                        </div>
                      </div>
                    </div>
                    {remarkRow}
                  </div>
                )}

                {/* ── total_weight ─────────────────────────── */}
                {baggage.weightMode === 'total_weight' && (() => {
                  const effectiveCount =
                    baggage.baggagePieceType === 'preset' && baggage.baggagePieceValue != null
                      ? baggage.baggagePieceValue
                      : baggage.baggagePieceType === 'custom'
                        ? (parseInt(baggage.baggagePieceCustom) || 0)
                        : 0
                  const totalWeightNum =
                    baggage.baggageTotalWeightType === 'preset'
                      ? (baggage.baggageTotalWeightValue ?? 0)
                      : parseFloat(baggage.baggageTotalWeightCustom) || 0
                  const pieceWeightLimits = baggage.baggageTotalPieceWeights ?? []
                  const pieceWeightSum = pieceWeightLimits.reduce((s, w) => s + (parseFloat(w) || 0), 0)
                  const exceedsTotal = !!(baggage.hasPerPieceLimit && effectiveCount > 0 && totalWeightNum > 0 && pieceWeightSum > totalWeightNum)

                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {pieceRow(true)}
                        <div>
                          <label className={lbl}>น้ำหนักรวมไม่เกิน</label>
                          <div className="flex flex-wrap gap-1.5">
                            {([20, 23, 30, 40, 46] as const).map(kg => (
                              <button key={kg} type="button"
                                className={pillCls(baggage.baggageTotalWeightType === 'preset' && baggage.baggageTotalWeightValue === kg)}
                                onClick={() => setBaggage(prev => ({ ...prev, baggageTotalWeightType: 'preset', baggageTotalWeightValue: kg, baggageTotalWeightCustom: '' }))}>
                                {kg} กก.
                              </button>
                            ))}
                            <button type="button" className={pillCls(baggage.baggageTotalWeightType === 'custom')}
                              onClick={() => setBaggage(prev => ({ ...prev, baggageTotalWeightType: 'custom', baggageTotalWeightValue: null }))}>
                              อื่นๆ
                            </button>
                            {baggage.baggageTotalWeightType === 'custom' && (
                              <input type="number" min={0.1} step={0.1} className={cn(iCls, 'w-28 text-sm')}
                                placeholder="กก." value={baggage.baggageTotalWeightCustom}
                                onChange={e => setBaggage(prev => ({ ...prev, baggageTotalWeightCustom: e.target.value }))} />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Per-piece limit sub-option */}
                      <label className="flex items-center gap-2 cursor-pointer w-fit">
                        <input type="checkbox" className="accent-[#05a94f]"
                          checked={baggage.hasPerPieceLimit ?? false}
                          onChange={e => setBaggage(prev => ({
                            ...prev,
                            hasPerPieceLimit: e.target.checked,
                            baggageTotalPieceWeights: resizePieceWeights(prev.baggageTotalPieceWeights ?? [], effectiveCount),
                          }))} />
                        <span className="text-sm text-slate-700">มีการจำกัดน้ำหนักต่อใบ</span>
                      </label>

                      {baggage.hasPerPieceLimit && effectiveCount === 0 && (
                        <p className="text-[11px] text-amber-600">กรุณาเลือกจำนวนชิ้นกระเป๋าก่อน</p>
                      )}

                      {baggage.hasPerPieceLimit && effectiveCount > 0 && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Array.from({ length: effectiveCount }).map((_, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">ใบที่ {i + 1} ไม่เกิน</span>
                                <input type="number" min={0.1} step={0.1}
                                  className={cn(iCls, 'text-sm flex-1 min-w-0')}
                                  placeholder="กก."
                                  value={pieceWeightLimits[i] ?? ''}
                                  onChange={e => setBaggage(prev => {
                                    const w = [...(prev.baggageTotalPieceWeights ?? [])]
                                    w[i] = e.target.value
                                    return { ...prev, baggageTotalPieceWeights: w }
                                  })} />
                                <span className="text-xs text-slate-400 shrink-0">กก.</span>
                              </div>
                            ))}
                          </div>
                          {exceedsTotal && (
                            <p className="text-[11px] text-red-600 flex items-center gap-1">
                              <AlertCircle size={11} className="shrink-0" />
                              น้ำหนักต่อใบรวมกันเกินน้ำหนักรวมที่กำหนด กรุณาตรวจสอบอีกครั้ง
                            </p>
                          )}
                        </div>
                      )}

                      {remarkRow}
                    </div>
                  )
                })()}

                {/* ── different_per_piece ──────────────────── */}
                {baggage.weightMode === 'different_per_piece' && (() => {
                  const effectiveCount =
                    baggage.baggagePieceType === 'preset' && baggage.baggagePieceValue != null
                      ? baggage.baggagePieceValue
                      : baggage.baggagePieceType === 'custom'
                        ? (parseInt(baggage.baggagePieceCustom) || 0)
                        : 0
                  return (
                    <div className="space-y-3">
                      {pieceRow(false)}
                      {effectiveCount > 0 && (
                        <div>
                          <label className={lbl}>น้ำหนักแต่ละใบ</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Array.from({ length: effectiveCount }).map((_, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-500 whitespace-nowrap">ใบที่ {i + 1}</span>
                                <input type="number" min={0.1} step={0.1}
                                  className={cn(iCls, 'text-sm flex-1 min-w-0')}
                                  placeholder="กก."
                                  value={baggage.baggagePieceWeights[i] ?? ''}
                                  onChange={e => setBaggage(prev => {
                                    const w = [...prev.baggagePieceWeights]
                                    w[i] = e.target.value
                                    return { ...prev, baggagePieceWeights: w }
                                  })} />
                                <span className="text-xs text-slate-400">กก.</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {remarkRow}
                    </div>
                  )
                })()}

                {/* ── custom_text ──────────────────────────── */}
                {baggage.weightMode === 'custom_text' && (
                  <div className="space-y-3">
                    <div>
                      <label className={cn(lbl, 'flex items-center gap-1')}>
                        รายละเอียดน้ำหนักกระเป๋า
                        <span className="text-red-500 text-xs normal-case font-normal">*จำเป็น</span>
                      </label>
                      <textarea rows={3} maxLength={500}
                        placeholder="เช่น 2 ใบ น้ำหนักรวมไม่เกิน 46 กก. ต่อท่าน / ใบแรก 20 กก. ใบที่สอง 25 กก."
                        className={cn(iCls, 'text-sm resize-none w-full')}
                        value={baggage.baggageCustomText}
                        onChange={e => setBaggage(prev => ({ ...prev, baggageCustomText: e.target.value.slice(0, 500) }))} />
                      <p className="text-right text-[10px] text-slate-400 mt-0.5">
                        {baggage.baggageCustomText.length}/500
                      </p>
                    </div>
                    {remarkRow}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Summary — only when user has actively selected something */}
          {baggage.status === 'INCLUDED' && formatBaggageSummary(baggage) && (
            <div className="flex items-start gap-2.5 px-4 py-3.5 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle2 size={14} className="text-green-600 mt-0.5 shrink-0" />
              <p className="text-xs text-green-800 whitespace-pre-line leading-relaxed font-medium">
                {formatBaggageSummary(baggage)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Seat Reduction Condition ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">เงื่อนไขการลดที่นั่ง / Seat Reduction Condition</CardTitle>
          <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
            ใช้สำหรับกำหนดจำนวนที่นั่งที่สามารถลดได้จากยอด Confirm
          </p>
        </CardHeader>
        <CardContent className="space-y-5 pt-4">

          {/* Policy selector */}
          <div className="grid grid-cols-2 gap-3">
            {(['NOT_ALLOWED', 'ALLOWED'] as SeatReductionPolicy[]).map(p => (
              <button key={p} type="button" onClick={() => selectSeatPolicy(p)}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left',
                  seatReduction.policy === p
                    ? 'border-[#05a94f] bg-[#05a94f]/5 text-[#05a94f]'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                )}>
                <span className={cn(
                  'w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                  seatReduction.policy === p ? 'border-[#05a94f]' : 'border-slate-300',
                )}>
                  {seatReduction.policy === p && <span className="w-2 h-2 rounded-full bg-[#05a94f]" />}
                </span>
                {SEAT_POLICY_LABELS[p]}
              </button>
            ))}
          </div>

          {/* NOT_ALLOWED: compact notice */}
          {seatReduction.policy === 'NOT_ALLOWED' && (
            <div className="flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              <p className="text-sm text-red-700 font-medium">ไม่อนุญาตให้ลดที่นั่ง</p>
            </div>
          )}

          {/* ALLOWED: all detail fields */}
          {seatReduction.policy === 'ALLOWED' && (
            <div className="space-y-5">

              {/* รูปแบบเงื่อนไขการลดที่นั่ง: single / tier */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  รูปแบบเงื่อนไขการลดที่นั่ง
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { val: 'single', label: 'เงื่อนไขเดียว', desc: 'กำหนดเงื่อนไขลดที่นั่งแบบเดียว' },
                    { val: 'tier',   label: 'แบบ Step / Tier', desc: 'หลายเงื่อนไขตามช่วงวัน/เปอร์เซ็นต์' },
                  ] as { val: SeatReductionMode; label: string; desc: string }[]).map(o => (
                    <button key={o.val} type="button" onClick={() => setSeatReductionMode(o.val)}
                      className={cn(
                        'flex flex-col items-start gap-0.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left',
                        (seatReduction.seatReductionMode ?? 'single') === o.val
                          ? 'border-[#05a94f] bg-[#05a94f]/5 text-[#05a94f]'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                      )}>
                      <span>{o.label}</span>
                      <span className={cn('text-[11px] font-normal', (seatReduction.seatReductionMode ?? 'single') === o.val ? 'text-[#05a94f]/70' : 'text-slate-400')}>
                        {o.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ─── SINGLE mode ─────────────────────────────────────────── */}
              {(seatReduction.seatReductionMode ?? 'single') !== 'tier' && (
              <>

              {/* Main 4-col grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">

                {/* 1. ลดได้ไม่เกิน (%) — 2/12 cols */}
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    ลดได้ไม่เกิน (%)
                  </label>
                  <select
                    className={cn(iCls, 'appearance-none text-sm')}
                    value={String(deriveReductionPercentType(seatReduction))}
                    onChange={e => {
                      const val = e.target.value
                      if (val === 'custom') {
                        setSeatReduction(prev => ({ ...prev, reductionPercentType: 'custom' }))
                      } else {
                        const n = Number(val) as ReductionPercentType
                        setSeatReduction(prev => ({ ...prev, reductionPercentType: n, maxPercent: n as number }))
                      }
                    }}>
                    {REDUCTION_PERCENT_PRESETS.map(v => (
                      <option key={v} value={String(v)}>{v}%</option>
                    ))}
                    <option value="custom">ระบุเอง</option>
                  </select>
                  {deriveReductionPercentType(seatReduction) === 'custom' && (
                    <div className="relative mt-2">
                      <input type="number" min={0.1} max={100} step={0.1}
                        className={cn(iCls, 'pr-7 text-sm',
                          seatReduction.maxPercent <= 0 || seatReduction.maxPercent > 100
                            ? 'border-amber-300' : '')}
                        placeholder="เช่น 15"
                        value={seatReduction.maxPercent || ''}
                        onChange={e => setSeatReduction(prev => ({
                          ...prev,
                          maxPercent: Math.min(100, Math.max(0, Number(e.target.value))),
                        }))}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                    </div>
                  )}
                </div>

                {/* 2. Deadline Type — 4/12 cols */}
                <div className="lg:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Deadline Type
                  </label>
                  <select
                    className={cn(iCls, 'appearance-none text-sm')}
                    value={seatReduction.noticeType ?? 'DAYS_BEFORE'}
                    onChange={e => setSeatReduction(prev => ({
                      ...prev,
                      noticeType: e.target.value as SeatNoticeType,
                      noticeDays: 0,
                      noticeFixedDate: '',
                    }))}>
                    <option value="DAYS_BEFORE">ก่อนวันเดินทางกี่วัน</option>
                    <option value="FIXED_DATE">ภายในวันที่กำหนด</option>
                  </select>
                </div>

                {/* 3. Deadline Value — 3/12 cols */}
                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Deadline Value
                  </label>
                  {(seatReduction.noticeType ?? 'DAYS_BEFORE') === 'DAYS_BEFORE' ? (
                    <div className="relative">
                      <input type="number" min={1}
                        className={cn(iCls, 'pr-12 text-sm',
                          seatReduction.noticeDays <= 0 ? 'border-amber-300' : '')}
                        placeholder="เช่น 45"
                        value={seatReduction.noticeDays || ''}
                        onChange={e => setSeatReduction(prev => ({
                          ...prev, noticeDays: Number(e.target.value),
                        }))}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">วัน</span>
                    </div>
                  ) : (() => {
                    const today = new Date().toISOString().slice(0, 10)
                    const isPast = !!seatReduction.noticeFixedDate && seatReduction.noticeFixedDate < today
                    return (
                      <div>
                        <input type="date"
                          className={cn(iCls, 'text-sm w-full', isPast ? 'border-red-300 text-red-700' : '')}
                          value={seatReduction.noticeFixedDate}
                          onChange={e => setSeatReduction(prev => ({
                            ...prev, noticeFixedDate: e.target.value,
                          }))}
                        />
                        {isPast && (
                          <p className="flex items-center gap-1 mt-1 text-[11px] text-red-600 font-semibold">
                            <span>&#9888;</span> เกินกำหนดลดที่นั่ง
                          </p>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* 4. ฐานคำนวณ read-only — 3/12 cols */}
                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    ฐานคำนวณ
                  </label>
                  <div className={cn(
                    iCls,
                    'flex items-center gap-1.5 bg-slate-50 text-slate-600 text-sm cursor-default select-none',
                  )}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#05a94f] flex-shrink-0" />
                    Confirm Seat ใน PNR
                  </div>
                </div>
              </div>

              {/* เงื่อนไขหากลดเกินกำหนด */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  เงื่อนไขหากลดเกินกำหนด
                </label>
                <textarea rows={3}
                  maxLength={500}
                  placeholder="เช่น หากลดเกินจำนวนที่กำหนด สายการบินมีสิทธิ์ยึดมัดจำ / คิดค่าปรับตามเงื่อนไขสายการบิน / ไม่สามารถลดที่นั่งเพิ่มเติมได้"
                  className={cn(iCls, 'text-sm resize-none w-full')}
                  value={seatReduction.overReductionConditionText ?? ''}
                  onChange={e => setSeatReduction(prev => ({
                    ...prev,
                    overReductionConditionText: e.target.value.slice(0, 500),
                  }))}
                />
                <p className="text-right text-[10px] text-slate-400 mt-1">
                  {(seatReduction.overReductionConditionText ?? '').length}/500
                </p>
              </div>

              {/* Calc box */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  ทดสอบคำนวณจากจำนวนที่นั่ง Confirm ใน PNR
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="text-xs text-slate-600 shrink-0">จำนวนที่นั่ง Confirm:</label>
                  <div className="relative">
                    <input type="number" min={1} placeholder="เช่น 35"
                      className={cn(iCls, 'w-28 pr-12 text-sm')}
                      value={testSeats}
                      onChange={e => setTestSeats(e.target.value)} />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">ที่นั่ง</span>
                  </div>
                  {testSeats && Number(testSeats) > 0 && seatReduction.maxPercent > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#05a94f]/30 rounded-xl flex-wrap">
                      <span className="text-xs text-slate-500">ลดได้สูงสุด:</span>
                      <span className="text-sm font-bold text-[#05a94f]">
                        {Math.floor(Number(testSeats) * seatReduction.maxPercent / 100)} ที่นั่ง
                      </span>
                      <span className="text-[11px] text-slate-400">
                        ({seatReduction.maxPercent}% ของ {testSeats} &#8594; ปัดเศษลง)
                      </span>
                    </div>
                  )}
                </div>
                {testSeats && Number(testSeats) > 0 && seatReduction.maxPercent > 0 && (() => {
                  const seats = Number(testSeats)
                  const max = Math.floor(seats * seatReduction.maxPercent / 100)
                  const overText = seatReduction.overReductionConditionText?.trim()
                  return (
                    <div className="text-[11px] text-slate-500 border-t border-slate-200 pt-3 space-y-1">
                      <p>&#8226; ลดได้: {seats} &#215; {seatReduction.maxPercent}% = {(seats * seatReduction.maxPercent / 100).toFixed(1)} &#8594; <strong className="text-slate-700">{max} ที่นั่ง</strong></p>
                      {overText && (
                        <p className="text-amber-600">&#8226; ลดเกิน {max} ที่นั่ง &#8594; {overText}</p>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Summary */}
              {formatSeatReductionSummary(seatReduction) && (
                <div className="flex items-start gap-2.5 px-4 py-3.5 bg-green-50 border border-green-200 rounded-xl">
                  <CheckCircle2 size={14} className="text-green-600 mt-0.5 shrink-0" />
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs text-green-800 whitespace-pre-line leading-relaxed font-medium">
                      {formatSeatReductionSummary(seatReduction)}
                    </p>
                    {testSeats && Number(testSeats) > 0 && seatReduction.maxPercent > 0 && (
                      <p className="text-[11px] text-green-700 font-normal">
                        ตัวอย่าง: PNR Confirm {testSeats} ที่นั่ง &#8594; ลดได้สูงสุด {Math.floor(Number(testSeats) * seatReduction.maxPercent / 100)} ที่นั่ง
                      </p>
                    )}
                  </div>
                </div>
              )}
              </>
              )}

              {/* ─── TIER mode ───────────────────────────────────────────── */}
              {(seatReduction.seatReductionMode ?? 'single') === 'tier' && (
                <div className="space-y-5">
                  <SeatReductionTierTable
                    tiers={seatReduction.seatReductionTiers ?? []}
                    currency={currency}
                    showValidation={showValidation}
                    onChange={setSeatTiers}
                  />
                  {/* Tier summary */}
                  {formatSeatReductionSummary(seatReduction) && (
                    <div className="flex items-start gap-2.5 px-4 py-3.5 bg-green-50 border border-green-200 rounded-xl">
                      <CheckCircle2 size={14} className="text-green-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-green-800 whitespace-pre-line leading-relaxed font-medium">
                        {formatSeatReductionSummary(seatReduction)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </CardContent>
      </Card>

      {/* ── Seat Return Condition ─────────────────────────────────────────── */}
      <SeatReturnConditionSection value={seatReturn} onChange={setSeatReturn} />

      {/* ── Payment Schedule ──────────────────────────────────────────────── */}
      <PaymentScheduleSection schedule={schedule} onChangeSchedule={setSchedule} currency={currency} />

      {/* ── Ticket Refund Condition ───────────────────────────────────────── */}
      <RefundConditionSection value={ticketRefund} onChange={setTicketRefund} />

      {/* ── Additional Conditions (Rich Text) ────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">เงื่อนไขเพิ่มเติม (ข้อความ)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[11px] text-slate-400 mb-2">
            สำหรับเงื่อนไขทั่วไปที่ไม่ต้องคำนวณ — เงื่อนไขที่เกี่ยวกับจำนวนเงิน วันที่ หรือค่าปรับ ควรสร้างเป็น Rule แทน
          </p>
          <RichTextEditor value={noteHtml} onChange={setNoteHtml} />
        </CardContent>
      </Card>

      {/* ── Preview ───────────────────────────────────────────────────────── */}
      <PreviewSection
        schedule={schedule}
        templateName={name}
        airlineCode={airlineCode}
        currency={currency}
        templateType={templateType}
      />

    </div>
  )
}
