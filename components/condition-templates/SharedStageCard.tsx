'use client'

/**
 * Shared Payment Stage Card — used by both ConditionTemplateForm and Step3Conditions.
 * Any UI/logic change here automatically applies to both pages.
 */

import { useState, useCallback, memo } from 'react'
import { PlusCircle, Trash2, AlertTriangle, ChevronDown, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  type DemoConditionTemplateStage,
  type TemplateAmountType,
  type RsvnFeeMode,
  type CalculationType,
  type CalculationBase,
  type DueCalculationType,
} from '@/lib/template-storage'
import type { PaymentType, PercentBase } from '@/types'
import { TimeInput } from '@/components/ui/time-input'

// ─── Exported constants ───────────────────────────────────────────────────────

export const PAYMENT_TYPE_OPTIONS = [
  { value: 'RSVN_FEE',    label: 'ค่าจองที่นั่ง (RSVN Fee)' },
  { value: 'DEPOSIT',     label: 'มัดจำ (Deposit)' },
  { value: 'BALANCE',     label: 'ชำระส่วนที่เหลือ (Balance)' },
  { value: 'FULL_PAYMENT',label: 'ชำระเต็มจำนวน (Full Payment)' },
  { value: 'FEE',         label: 'ชำระค่าธรรมเนียม (Fee)' },
] as const

export const CALC_TYPE_OPTIONS: { value: CalculationType; label: string; desc: string }[] = [
  { value: 'NOT_SPECIFIED',    label: 'ไม่ระบุ — กำหนดภายหลัง', desc: 'สามารถกำหนดวิธีคิดและจำนวนเงินตอนนำ Template ไปใช้กับ Series' },
  { value: 'FIXED_PER_PNR',   label: 'คงที่ต่อ PNR',             desc: 'ยอด × จำนวน PNR' },
  { value: 'PER_SEAT',        label: 'ต่อคน / ต่อ Seat',          desc: 'ยอด × จำนวนที่นั่ง' },
  { value: 'FIXED_PER_SERIES',label: 'คงที่ต่อ Series',            desc: 'คิด 1 ครั้งต่อ Series' },
  { value: 'PERCENT_OF_BASE', label: 'เปอร์เซ็นต์ (%)',            desc: '% ของฐานที่เลือก' },
  { value: 'REMAINING_BALANCE',label:'ยอดคงเหลือ',                 desc: 'ยอดรวม − งวดที่นับ Credit' },
]

export const VALID_CALC: Record<string, CalculationType[]> = {
  RSVN_FEE:    ['NOT_SPECIFIED', 'FIXED_PER_PNR', 'PER_SEAT', 'FIXED_PER_SERIES'],
  DEPOSIT:     ['NOT_SPECIFIED', 'FIXED_PER_PNR', 'PER_SEAT', 'FIXED_PER_SERIES', 'PERCENT_OF_BASE'],
  BALANCE:     ['NOT_SPECIFIED', 'REMAINING_BALANCE', 'PERCENT_OF_BASE', 'FIXED_PER_PNR', 'PER_SEAT'],
  FULL_PAYMENT:['NOT_SPECIFIED', 'REMAINING_BALANCE', 'PERCENT_OF_BASE', 'FIXED_PER_PNR', 'PER_SEAT', 'FIXED_PER_SERIES'],
  FEE:         ['NOT_SPECIFIED', 'FIXED_PER_PNR', 'PER_SEAT', 'FIXED_PER_SERIES', 'PERCENT_OF_BASE'],
}

export const DEFAULT_CALC: Record<string, CalculationType> = {
  RSVN_FEE:    'PER_SEAT',
  DEPOSIT:     'FIXED_PER_PNR',
  BALANCE:     'REMAINING_BALANCE',
  FULL_PAYMENT:'REMAINING_BALANCE',
  FEE:         'FIXED_PER_PNR',
}

export const DEFAULT_CREDIT: Record<string, boolean> = {
  RSVN_FEE: false, DEPOSIT: true, BALANCE: true, FULL_PAYMENT: true, FEE: false,
}

export const CALC_BASE_OPTIONS: { value: CalculationBase; label: string }[] = [
  { value: 'FARE',         label: 'Fare (ค่าโดยสาร)' },
  { value: 'FARE_TAX',     label: 'Fare + Tax' },
  { value: 'TOTAL_TICKET', label: 'ยอดรวมค่าตั๋ว' },
  { value: 'TOTAL_PAYABLE',label: 'ยอดที่ต้องชำระทั้งหมด' },
  { value: 'REMAINING',    label: 'ยอดคงเหลือ' },
  { value: 'PREV_STAGE',   label: 'ยอดชำระของงวดก่อนหน้า' },
]

export const DUE_CALC_OPTIONS: { value: DueCalculationType; label: string; desc: string }[] = [
  {
    value: 'travel_minus_days',
    label: 'ก่อนวันเดินทาง N วัน',
    desc:  'นำวันเดินทางลบจำนวนวันที่ระบุ — คำนวณแยกตามวันเดินทางของแต่ละ PNR',
  },
  {
    value: 'custom_date',
    label: 'กำหนดวันเอง',
    desc:  'เลือกวันที่ครบกำหนดโดยตรง — เหมาะกับ Deadline ตายตัวหรือคิดต่อ Series',
  },
  {
    value: 'to_be_confirmed',
    label: 'กำหนดภายหลัง',
    desc:  'ระบบจะให้กำหนดวันเมื่อใช้ Template กับ Series',
  },
]

export const PT_TITLE: Record<string, string> = {
  RSVN_FEE:    'ค่าจองที่นั่ง',
  DEPOSIT:     'มัดจำ',
  BALANCE:     'ชำระส่วนที่เหลือ',
  FULL_PAYMENT:'ชำระเต็มจำนวน',
  FEE:         'ชำระค่าธรรมเนียม',
  REMAINING_PAYMENT:  'ชำระส่วนที่เหลือ',
  ADDITIONAL_PAYMENT: 'ชำระเพิ่ม',
  OTHER:              'อื่น ๆ',
}

// ─── Exported helpers ─────────────────────────────────────────────────────────

export function stageCardTitle(no: number, paymentType: string): string {
  const typeName = PT_TITLE[paymentType] ?? 'กรุณาเลือกประเภทการชำระเงิน'
  return `งวดที่ ${no} — ${typeName}`
}

export function legacyToCalcType(amountType: TemplateAmountType, rsvnFeeMode: RsvnFeeMode | null): CalculationType {
  if (amountType === 'Remaining') return 'REMAINING_BALANCE'
  if (amountType === 'Percent')   return 'PERCENT_OF_BASE'
  if (amountType === 'PER_PNR'   || rsvnFeeMode === 'per_pnr')    return 'FIXED_PER_PNR'
  if (amountType === 'PER_SERIES'|| rsvnFeeMode === 'per_series') return 'FIXED_PER_SERIES'
  if (amountType === 'PER_SEAT_FIXED' || rsvnFeeMode === 'per_seat') return 'PER_SEAT'
  return 'FIXED_PER_PNR'
}

export function calcTypeToLegacy(ct: CalculationType | ''): { amountType: TemplateAmountType; rsvnFeeMode: RsvnFeeMode | null } {
  switch (ct) {
    case 'PER_SEAT':          return { amountType: 'PER_SEAT_FIXED', rsvnFeeMode: 'per_seat' }
    case 'FIXED_PER_SERIES':  return { amountType: 'FIXED_TOTAL',    rsvnFeeMode: 'per_series' }
    case 'PERCENT_OF_BASE':   return { amountType: 'Percent',         rsvnFeeMode: null }
    case 'REMAINING_BALANCE': return { amountType: 'Remaining',       rsvnFeeMode: null }
    case 'NOT_SPECIFIED':     return { amountType: 'FIXED_TOTAL',     rsvnFeeMode: null }
    default:                  return { amountType: 'FIXED_TOTAL',     rsvnFeeMode: null }
  }
}

export function legacyPercentBase(pb: PercentBase | undefined): CalculationBase {
  switch (pb) {
    case 'FARE_ONLY':            return 'FARE'
    case 'REMAINING_AFTER_PREV': return 'REMAINING'
    default:                     return 'FARE_TAX'
  }
}

export function calcPreview(stage: DemoConditionTemplateStage, currency: string): string | null {
  const ct = stage.calculationType
  if (!ct || !stage.paymentType || ct === 'NOT_SPECIFIED') return null
  const fmt = stage.amountValue > 0 ? stage.amountValue.toLocaleString('en-US') : '—'
  const pct = stage.percentValue ?? stage.amountValue
  const baseLabel = CALC_BASE_OPTIONS.find(o => o.value === (stage.calculationBase ?? 'FARE_TAX'))?.label ?? ''
  switch (ct) {
    case 'FIXED_PER_PNR':     return `${fmt} ${currency} × จำนวน PNR`
    case 'PER_SEAT':          return `${fmt} ${currency} × จำนวนที่นั่ง`
    case 'FIXED_PER_SERIES':  return `${fmt} ${currency} × 1 Series`
    case 'PERCENT_OF_BASE':   return `${baseLabel} × ${pct}%`
    case 'REMAINING_BALANCE': return 'ยอดค่าตั๋ว − ยอดที่ชำระแล้ว (Credit toward Fare)'
    default: return null
  }
}

// ─── ID generator ─────────────────────────────────────────────────────────────

let _seq = 0
export function newStageId() { return `id-${++_seq}-${Math.random().toString(36).slice(2, 5)}` }

export function emptyStage(no: number): DemoConditionTemplateStage {
  return {
    stageId: newStageId(), stageNo: no, stageName: stageCardTitle(no, ''),
    paymentType: '', customPaymentName: null,
    calculationType: 'NOT_SPECIFIED', percentValue: 0, calculationBase: null, pricingPending: true,
    rsvnFeeMode: null, amountType: 'FIXED_TOTAL', amountValue: 0, percentBase: 'TOTAL_AMOUNT',
    dueCalculationType: 'travel_minus_days', dayOffset: 30, dueTime: '18:00',
    dueCustomDate: null, creditTowardFare: true, refundable: false,
    autoCalculate: false, remark: '', status: 'Active',
  }
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const base = 'w-full h-10 px-3 text-sm border rounded-lg transition-colors duration-150 text-slate-900 placeholder:text-slate-400'
const focusRing = 'focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]'
export const iCls  = `${base} ${focusRing} border-slate-300 bg-white`
export const sCls  = `${base} ${focusRing} border-slate-300 bg-white appearance-none`
export const iErr  = 'border-red-400 focus:border-red-400 focus:ring-red-200'
export const iDim  = 'bg-slate-100 border-slate-200 text-slate-500 cursor-default focus:ring-0 focus:border-slate-200'

// ─── Slot ─────────────────────────────────────────────────────────────────────

interface SlotProps {
  label?: string
  required?: boolean
  error?: string
  helper?: string
  gone?: boolean
  className?: string
  children: React.ReactNode
}

export function Slot({ label, required, error, helper, gone, className, children }: SlotProps) {
  return (
    <div className={cn('flex flex-col min-w-0', gone && 'invisible pointer-events-none select-none', className)}>
      <div className="h-5 mb-1 overflow-hidden">
        <span className="text-xs font-medium text-slate-700 leading-5 block truncate">
          {label ?? ' '}
          {required && label && <span className="text-red-500 ml-0.5">*</span>}
        </span>
      </div>
      <div className="h-10 flex">{children}</div>
      <div className="h-[18px] mt-0.5 overflow-hidden">
        <p className={cn(
          'text-xs leading-[18px] truncate',
          error ? 'text-red-500' : 'text-slate-400',
          !error && !helper && 'opacity-0 select-none',
        )}>
          {error ?? helper ?? ' '}
        </p>
      </div>
    </div>
  )
}

// ─── StageCard ────────────────────────────────────────────────────────────────

export interface StageCardProps {
  stage: DemoConditionTemplateStage
  onUpdate: (stageId: string, patch: Partial<DemoConditionTemplateStage>) => void
  onRequestDelete: (stageId: string) => void
  canDelete: boolean
  currency: string
  showValidation: boolean
}

export const StageCard = memo(function StageCard({
  stage, onUpdate, onRequestDelete, canDelete, currency, showValidation,
}: StageCardProps) {
  const [open, setOpen] = useState(true)

  const handleChange = useCallback(
    (patch: Partial<DemoConditionTemplateStage>) => onUpdate(stage.stageId, patch),
    [onUpdate, stage.stageId],
  )
  const handleDelete = useCallback(() => onRequestDelete(stage.stageId), [onRequestDelete, stage.stageId])

  const ct              = stage.calculationType ?? ''
  const isPercent       = ct === 'PERCENT_OF_BASE'
  const isRemain        = ct === 'REMAINING_BALANCE'
  const isNotSpecified  = ct === 'NOT_SPECIFIED'
  const noCalcType      = !ct
  const noType          = !stage.paymentType
  const dct             = stage.dueCalculationType
  const isCustomDate    = dct === 'custom_date'
  const isToBeConfirmed = dct === 'to_be_confirmed'
  const showDaysInput   = dct === 'travel_minus_days'
  const showDueTime     = !isToBeConfirmed

  const calcTypeErr   = showValidation && stage.paymentType && noCalcType
  const pctErr        = isPercent && ((stage.percentValue ?? 0) < 0 || (stage.percentValue ?? 0) > 100)
  const baseErr       = showValidation && isPercent && !stage.calculationBase
  const customDateErr = showValidation && isCustomDate && !stage.dueCustomDate

  const amtLabel = isPercent ? 'เปอร์เซ็นต์ (%)'
    : ct === 'FIXED_PER_PNR'    ? `จำนวนเงินต่อ PNR (${currency})`
    : ct === 'PER_SEAT'         ? `จำนวนเงินต่อคน / Seat (${currency})`
    : ct === 'FIXED_PER_SERIES' ? `จำนวนเงินต่อ Series (${currency})`
    : `จำนวนเงิน (${currency})`

  const dueOffsetHelper = showDaysInput ? `วันเดินทาง − ${stage.dayOffset} วัน` : ''
  const preview = calcPreview(stage, currency)

  const calcTypeOpts = stage.paymentType
    ? CALC_TYPE_OPTIONS.filter(o => (VALID_CALC[stage.paymentType] ?? []).includes(o.value))
    : []

  function handleTypeChange(newType: PaymentType | '') {
    const validCalcs = VALID_CALC[newType] ?? []
    const currentCtStillValid = ct && validCalcs.includes(ct as CalculationType)
    const patch: Partial<DemoConditionTemplateStage> = {
      paymentType: newType,
      customPaymentName: null,
    }
    if (!currentCtStillValid) {
      const suggested: CalculationType = newType === 'BALANCE' ? 'REMAINING_BALANCE' : 'NOT_SPECIFIED'
      const legacy = calcTypeToLegacy(suggested)
      patch.calculationType = suggested
      patch.amountValue = 0
      patch.percentValue = 0
      patch.calculationBase = null
      Object.assign(patch, legacy)
    }
    if (!stage.paymentType && newType) {
      patch.creditTowardFare = DEFAULT_CREDIT[newType] ?? true
    }
    handleChange(patch)
  }

  function handleCalcTypeChange(newCt: CalculationType | '') {
    const legacy = calcTypeToLegacy(newCt)
    handleChange({
      calculationType: newCt,
      amountValue: 0,
      percentValue: 0,
      calculationBase: null,
      ...legacy,
    })
  }

  return (
    <div className={cn('rounded-xl border', noType ? 'border-orange-200 bg-orange-50/30' : 'border-slate-200 bg-slate-50')}>

      {/* Header */}
      <div className="h-12 flex items-center px-4 gap-2 cursor-pointer select-none"
        onClick={() => setOpen(v => !v)}>
        <span className={cn(
          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
          noType ? 'bg-orange-200 text-orange-700' : 'bg-[#05a94f]/10 text-[#05a94f]',
        )}>
          {stage.stageNo}
        </span>
        <span className={cn('text-sm font-semibold truncate flex-1', noType ? 'text-orange-700 italic' : 'text-slate-800')}>
          {stageCardTitle(stage.stageNo, stage.paymentType)}
        </span>
        {ct && !isNotSpecified && (
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
            {CALC_TYPE_OPTIONS.find(o => o.value === ct)?.label ?? ct}
          </span>
        )}
        {isNotSpecified && (
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
            รอกำหนด
          </span>
        )}
        {calcTypeErr && <span className="text-[10px] text-red-500 shrink-0">⚠ เลือกวิธีคิดเงิน</span>}
        <button type="button"
          onClick={e => { e.stopPropagation(); handleDelete() }}
          disabled={!canDelete}
          className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-100 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          title="ลบงวดนี้">
          <Trash2 size={13} />
        </button>
        <ChevronDown size={14}
          className={cn('text-slate-400 shrink-0 transition-transform duration-[180ms] ease-[cubic-bezier(0.4,0,0.2,1)]', open && 'rotate-180')} />
      </div>

      {/* Accordion body */}
      <div
        className={cn('grid overflow-hidden', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
        style={{ transition: 'grid-template-rows 180ms cubic-bezier(0.4,0,0.2,1)' }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="border-t border-slate-200/60 px-4 pt-4 pb-5">

            {/* ─── กลุ่ม 1: ข้อมูลการชำระเงิน ── */}
            <div className="space-y-3">
              <Slot label="ประเภทการชำระเงิน" required error={showValidation && noType ? 'กรุณาเลือกประเภทการชำระเงิน' : undefined}>
                <select className={cn(sCls, showValidation && noType && iErr)}
                  value={stage.paymentType}
                  onChange={e => handleTypeChange(e.target.value as PaymentType | '')}>
                  <option value="">เลือกประเภท</option>
                  {PAYMENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Slot>

              <div className="grid grid-cols-4 gap-3">
                {/* วิธีคิดจำนวนเงิน */}
                <Slot label="วิธีคิดจำนวนเงิน" required
                  error={calcTypeErr ? 'กรุณาเลือกวิธีคิดจำนวนเงิน' : undefined}>
                  <select
                    disabled={noType}
                    className={cn(sCls, calcTypeErr && iErr, noType && iDim)}
                    value={ct}
                    onChange={e => handleCalcTypeChange(e.target.value as CalculationType | '')}>
                    {noType
                      ? <option value="">กรุณาเลือกประเภทการชำระเงินก่อน</option>
                      : calcTypeOpts.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))
                    }
                  </select>
                </Slot>

                {/* อัตราต่อหนึ่ง */}
                <Slot label={amtLabel} error={pctErr ? 'ต้องอยู่ 0–100' : undefined} gone={isRemain || isNotSpecified}>
                  <input
                    type="number" min={0} max={isPercent ? 100 : undefined}
                    disabled={noCalcType}
                    className={cn(iCls, pctErr && iErr, noCalcType && iDim)}
                    value={noCalcType ? '' : isPercent ? (stage.percentValue ?? stage.amountValue) : stage.amountValue}
                    placeholder={noCalcType ? 'เลือกวิธีคิดก่อน' : '0'}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0
                      isPercent
                        ? handleChange({ percentValue: v, amountValue: v })
                        : handleChange({ amountValue: v })
                    }}
                  />
                </Slot>

                {/* สกุลเงิน */}
                <Slot label="สกุลเงิน">
                  <div className="w-full h-10 flex items-center justify-center border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white">
                    {currency}
                  </div>
                </Slot>

                {/* ฐานคำนวณ หรือ ตัวอย่างการคำนวณ */}
                {isPercent ? (
                  <Slot label="ฐานคำนวณ" required error={baseErr ? 'กรุณาเลือกฐาน' : undefined}>
                    <select className={cn(sCls, baseErr && iErr)}
                      value={stage.calculationBase ?? ''}
                      onChange={e => handleChange({ calculationBase: e.target.value as CalculationBase })}>
                      <option value="">เลือกฐานคำนวณ</option>
                      {CALC_BASE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Slot>
                ) : (
                  <Slot label="ตัวอย่างการคำนวณ">
                    <div className={cn(
                      'w-full h-10 flex items-center px-3 rounded-lg text-xs font-medium border',
                      isNotSpecified
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : preview
                          ? 'bg-[#05a94f]/5 border-[#05a94f]/20 text-[#05a94f]'
                          : 'bg-slate-50 border-slate-200 text-slate-400',
                    )}>
                      <span className="truncate">
                        {isNotSpecified ? 'รอกำหนดภายหลัง' : preview ?? (ct ? '—' : 'เลือกวิธีคิดก่อน')}
                      </span>
                    </div>
                  </Slot>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 my-4" />

            {/* ─── กลุ่ม 2: การกำหนดวันครบชำระ ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide leading-none">การกำหนดวันครบชำระ</p>

              <div className="grid grid-cols-4 gap-3">
                {/* วิธีคำนวณวันครบกำหนด */}
                <div className="col-span-2">
                  <Slot label="วิธีคำนวณวันครบกำหนด"
                    helper={DUE_CALC_OPTIONS.find(o => o.value === dct)?.desc}>
                    <select className={sCls}
                      value={dct}
                      onChange={e => {
                        const newDct = e.target.value as DueCalculationType
                        handleChange({
                          dueCalculationType: newDct,
                          ...(newDct !== 'custom_date' ? { dueCustomDate: null } : {}),
                          ...(newDct === 'custom_date' ? { dayOffset: 0 } : {}),
                        })
                      }}>
                      {DUE_CALC_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Slot>
                </div>

                {/* จำนวนวันก่อนเดินทาง หรือ วันที่ครบกำหนด */}
                <Slot
                  label={isCustomDate ? 'วันที่ครบกำหนด' : 'จำนวนวันก่อนเดินทาง'}
                  required={isCustomDate || showDaysInput}
                  error={customDateErr ? 'กรุณาระบุวันที่' : undefined}
                  helper={showDaysInput ? dueOffsetHelper : undefined}
                  gone={isToBeConfirmed}
                >
                  {isCustomDate ? (
                    <input type="date"
                      className={cn(iCls, customDateErr && iErr)}
                      value={stage.dueCustomDate ?? ''}
                      onChange={e => handleChange({ dueCustomDate: e.target.value || null })} />
                  ) : (
                    <input type="number" min={0}
                      className={iCls}
                      value={stage.dayOffset}
                      onChange={e => handleChange({ dayOffset: parseInt(e.target.value) || 0 })} />
                  )}
                </Slot>

                {/* เวลา Deadline */}
                <Slot label="เวลา Deadline" gone={!showDueTime}>
                  <TimeInput
                    value={stage.dueTime ?? ''}
                    onChange={v => handleChange({ dueTime: v })}
                    className="h-10 border-slate-300 rounded-lg"
                  />
                </Slot>
              </div>

              {isToBeConfirmed && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                  <Info size={13} className="shrink-0" />
                  ระบบจะให้กำหนดวันเมื่อใช้ Template กับ Series
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 my-4" />

            {/* ─── กลุ่ม 3: ตัวเลือกเพิ่มเติม + หมายเหตุ ── */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  { key: 'creditTowardFare', label: 'นับเป็นส่วนหนึ่งของค่าตั๋ว', desc: 'ยอดนี้นำไปหักจากค่าตั๋ว',       val: stage.creditTowardFare },
                  { key: 'refundable',       label: 'สามารถคืนเงินได้',           desc: 'คืนเงินตามเงื่อนไข Refund',     val: stage.refundable },
                  { key: 'autoCalculate',    label: 'คำนวณยอดอัตโนมัติ',          desc: 'คำนวณจาก PNR / Seat / Series',  val: stage.autoCalculate },
                ] as const).map(({ key, label, desc, val }) => (
                  <label key={key} className={cn(
                    'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors duration-100',
                    val ? 'bg-[#05a94f]/5 border-[#05a94f]/30' : 'bg-white border-slate-200 hover:bg-slate-50',
                  )}>
                    <input type="checkbox" checked={val}
                      onChange={e => handleChange({ [key]: e.target.checked } as Partial<DemoConditionTemplateStage>)}
                      className="mt-0.5 w-4 h-4 rounded accent-[#05a94f] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 leading-tight">{label}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* หมายเหตุงวดนี้ */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">หมายเหตุงวดนี้</label>
                <textarea
                  rows={3}
                  className={cn('w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400', focusRing)}
                  value={stage.remark}
                  onChange={e => handleChange({ remark: e.target.value })}
                  placeholder="ระบุเงื่อนไขหรือหมายเหตุเพิ่มเติมของงวดนี้"
                />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
})

// ─── DeleteDialog ─────────────────────────────────────────────────────────────

export function DeleteStageDialog({
  stageName, onConfirm, onCancel,
}: { stageName: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 p-5 w-72 space-y-3 z-10">
        <p className="font-semibold text-slate-800 text-sm">ลบงวดนี้?</p>
        <p className="text-xs text-slate-500">งวด: <strong className="text-slate-700">{stageName}</strong></p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>ยกเลิก</Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>ลบ</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Stage Button ─────────────────────────────────────────────────────────

export function AddStageButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" icon={<PlusCircle size={13} />} onClick={onClick} className="w-full border-dashed">
      เพิ่มงวดชำระเงิน
    </Button>
  )
}
