/**
 * Condition Template storage — localStorage key separate from stock data.
 * All interfaces mirror types/index.ts ConditionTemplate* but use camelCase
 * (consistent with demo-storage.ts conventions).
 */

import { getDemoStocks } from '@/lib/demo-storage'
import type { PaymentType, AmountType, PercentBase, ConditionStatus } from '@/types'
import type { ConditionRule, PaymentRound } from '@/lib/condition-rules'

const TEMPLATE_STORAGE_KEY = 'ticket_stock_condition_templates'
// Marks that seeding has already run once. Set after the first seed OR after an
// explicit clear, so clearing data stays empty instead of being auto-reseeded.
const TEMPLATE_SEEDED_KEY = 'ticket_stock_condition_templates_seeded'

// ─── Types ───────────────────────────────────────────────────────────────────

export type DueCalculationType =
  | 'travel_minus_days'              // วันเดินทาง − N วัน
  | 'series_created_plus_days'       // วันที่สร้าง Series + N วัน
  | 'template_applied_plus_days'     // วันที่นำ Template ไปใช้ + N วัน (new)
  | 'previous_stage_due_plus_days'   // วันครบกำหนดงวดก่อนหน้า + N วัน (new)
  | 'previous_stage_paid_plus_days'  // วันที่ชำระจริงงวดก่อนหน้า + N วัน (new)
  | 'previous_payment_plus_days'     // legacy alias for previous_stage_paid_plus_days
  | 'custom_date'                    // วันที่ระบุเอง
  | 'to_be_confirmed'                // กำหนดภายหลัง (new)

export type TemplateTicketType = 'Group' | 'FIT' | 'Ticket + Land' | 'All'

// ─── Template Type ─────────────────────────────────────────────────────────────

export type TemplateType =
  | 'PAYMENT'         // เงื่อนไขการชำระเงิน — มี Payment Schedule, สร้างรอบชำระเงินได้
  | 'BOOKING'         // เงื่อนไขการจอง — text only
  | 'REFUND'          // เงื่อนไขการคืนเงิน — text only
  | 'SEAT_REDUCTION'  // เงื่อนไขการลดที่นั่ง — text only
  | 'OTHER'           // เงื่อนไขเพิ่มเติม — text only
  | 'FULL'            // เงื่อนไขรวม — มีทั้ง Payment Schedule + rules

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  PAYMENT:        'Payment Template / เงื่อนไขการชำระเงิน',
  BOOKING:        'Booking Condition / เงื่อนไขการจอง',
  REFUND:         'Refund Condition / เงื่อนไขการคืนเงิน',
  SEAT_REDUCTION: 'Seat Reduction Condition / เงื่อนไขการลดที่นั่ง',
  OTHER:          'Other Condition / เงื่อนไขเพิ่มเติม',
  FULL:           'Full Condition Template / เงื่อนไขรวมทั้งหมด',
}

export const TEMPLATE_TYPE_SHORT: Record<TemplateType, string> = {
  PAYMENT:        'Payment',
  BOOKING:        'Booking',
  REFUND:         'Refund',
  SEAT_REDUCTION: 'Seat Reduction',
  OTHER:          'Other',
  FULL:           'Full',
}

export const TEMPLATE_TYPE_COLORS: Record<TemplateType, string> = {
  PAYMENT:        'bg-blue-100 text-blue-700 border-blue-200',
  BOOKING:        'bg-green-100 text-green-700 border-green-200',
  REFUND:         'bg-amber-100 text-amber-700 border-amber-200',
  SEAT_REDUCTION: 'bg-purple-100 text-purple-700 border-purple-200',
  OTHER:          'bg-slate-100 text-slate-600 border-slate-200',
  FULL:           'bg-emerald-100 text-emerald-700 border-emerald-200',
}

export function canGeneratePaymentRounds(t: { templateType?: TemplateType }): boolean {
  return t.templateType === 'PAYMENT' || t.templateType === 'FULL'
}

export function hasPaymentScheduleData(t: { stages?: unknown[]; paymentSchedule?: unknown[] }): boolean {
  return (t.stages?.length ?? 0) > 0 || (t.paymentSchedule?.length ?? 0) > 0
}

// New in v2 ──────────────────────────────────────────────────────────────────

export type RsvnFeeMode = 'per_pnr' | 'per_seat' | 'per_series'

// Superset of AmountType — adds PER_PNR, PER_SERIES for template stages
export type TemplateAmountType = AmountType | 'PER_PNR' | 'PER_SERIES'

// New in v3 — replaces amountType + rsvnFeeMode with a single clear enum ─────

export type CalculationType =
  | 'FIXED_PER_PNR'      // จำนวนเงินคงที่ต่อ PNR
  | 'PER_SEAT'           // จำนวนเงินต่อคน / ต่อ Seat
  | 'FIXED_PER_SERIES'   // จำนวนเงินคงที่ต่อ Series
  | 'PERCENT_OF_BASE'    // เปอร์เซ็นต์จากฐานคำนวณ
  | 'REMAINING_BALANCE'  // ยอดคงเหลือ
  | 'NOT_SPECIFIED'      // ไม่ระบุ — กำหนดภายหลัง (RSVN_FEE / FEE only)

export type CalculationBase =
  | 'FARE'         // Fare (ค่าโดยสาร)
  | 'FARE_TAX'     // Fare + Tax
  | 'TOTAL_TICKET' // ยอดรวมค่าตั๋ว
  | 'TOTAL_PAYABLE'// ยอดที่ต้องชำระทั้งหมด
  | 'REMAINING'    // ยอดคงเหลือ (หลังงวดก่อนหน้า)
  | 'PREV_STAGE'   // ยอดชำระของงวดก่อนหน้า

export type RefundDateType =
  | 'before_travel_days'
  | 'after_booking_days'
  | 'after_payment_days'
  | 'custom_date'
  | 'stage_deadline'

export type RefundType = 'FULL_REFUND' | 'PARTIAL_REFUND' | 'CONDITIONAL_REFUND' | 'NON_REFUNDABLE'
export type DeductionType = 'none' | 'percent' | 'amount'    // kept for legacy compat
export type RefundRangeType = 'from_days' | 'between_days' | 'less_than_days'
export type RefundCondCalcType = 'FULL_REFUND' | 'REFUND_PERCENT' | 'DEDUCT_PERCENT' | 'DEDUCT_AMOUNT' | 'NO_REFUND'
export type RefundCalcBase = 'TOTAL_PAID' | 'FARE' | 'FARE_TAX' | 'RSVN_FEE' | 'DEPOSIT' | 'STAGE_AMOUNT' | 'REMAINING'

export interface DemoRefundCondition {
  refundConditionId: string
  seq: number
  name: string
  rangeType: RefundRangeType
  minDaysBeforeTravel: number        // from_days: lower bound; between_days: min; less_than_days: 0
  maxDaysBeforeTravel: number | null // from_days: null (no upper limit); between_days: max; less_than_days: N
  refundCalcType: RefundCondCalcType
  refundPercent: number
  deductionPercent: number
  deductionAmount: number
  calculationBase: RefundCalcBase
  remark: string
}

// ─── Ticket Refund Condition (Section) ───────────────────────────────────────

export type RefundConditionType =
  | 'unspecified'
  | 'non_refundable'
  | 'refundable'
  | 'partial_refund'
  | 'airline_policy'

export type RefundDeadlineType = 'unspecified' | 'days_before_departure' | 'fixed_date'

export type RefundPart =
  | 'fare'
  | 'fare_tax'
  | 'tax_only'
  | 'fuel_charge_only'
  | 'tax_fuel_charge'
  | 'custom'

export type RefundFeeType = 'none' | 'fixed_amount' | 'percent' | 'actual' | 'airline_policy'

export type AfterTicketIssueRefund =
  | 'unspecified'
  | 'non_refundable'
  | 'tax_only'
  | 'tax_fuel_charge'
  | 'airline_policy'

export interface TicketRefundCondition {
  conditionType: RefundConditionType
  refundDeadlineType: RefundDeadlineType
  refundDeadlineDays: number | null
  refundDeadlineDate: string | null
  refundPart: RefundPart | null
  refundPartCustomText: string | null
  refundFeeType: RefundFeeType | null
  refundFeeAmount: number | null
  refundFeePercent: number | null
  afterTicketIssueRefund: AfterTicketIssueRefund
  refundExceptionText: string | null
  refundRemark: string | null
}

export const EMPTY_TICKET_REFUND_CONDITION: TicketRefundCondition = {
  conditionType: 'unspecified',
  refundDeadlineType: 'unspecified',
  refundDeadlineDays: null,
  refundDeadlineDate: null,
  refundPart: null,
  refundPartCustomText: null,
  refundFeeType: null,
  refundFeeAmount: null,
  refundFeePercent: null,
  afterTicketIssueRefund: 'unspecified',
  refundExceptionText: null,
  refundRemark: null,
}

export function formatTicketRefundConditionSummary(r: TicketRefundCondition | null | undefined): string {
  if (!r || r.conditionType === 'unspecified') return ''
  const COND_LABELS: Record<RefundConditionType, string> = {
    unspecified: 'ไม่ระบุ',
    non_refundable: 'คืนเงินไม่ได้',
    refundable: 'คืนเงินได้',
    partial_refund: 'คืนได้บางส่วน',
    airline_policy: 'ตามเงื่อนไขสายการบิน',
  }
  const PART_LABELS: Record<RefundPart, string> = {
    fare: 'ค่า Fare', fare_tax: 'ค่า Fare + Tax', tax_only: 'Tax Only',
    fuel_charge_only: 'Fuel Charge Only', tax_fuel_charge: 'Tax + Fuel Charge',
    custom: '',
  }
  const AFTER_LABELS: Record<AfterTicketIssueRefund, string> = {
    unspecified: '', non_refundable: 'คืนไม่ได้',
    tax_only: 'คืนได้เฉพาะ Tax', tax_fuel_charge: 'คืนได้เฉพาะ Tax + Fuel Charge',
    airline_policy: 'ตามเงื่อนไขสายการบิน',
  }
  const lines: string[] = [`เงื่อนไขการคืนตั๋ว: ${COND_LABELS[r.conditionType]}`]
  const hasDeadline = r.conditionType === 'refundable' || r.conditionType === 'partial_refund'
  if (hasDeadline) {
    if (r.refundDeadlineType === 'days_before_departure' && r.refundDeadlineDays != null) {
      lines.push(`Deadline วันคืนที่: ก่อนวันเดินทาง ${r.refundDeadlineDays} วัน`)
    } else if (r.refundDeadlineType === 'fixed_date' && r.refundDeadlineDate) {
      lines.push(`Deadline วันคืนที่: ภายในวันที่ ${_fmtDMY(r.refundDeadlineDate)}`)
    }
    if (r.refundPart) {
      const partLabel = r.refundPart === 'custom'
        ? (r.refundPartCustomText?.trim() || 'ระบุเอง')
        : PART_LABELS[r.refundPart]
      lines.push(`คืนส่วนที่ได้: ${partLabel}`)
    }
  }
  if (r.conditionType === 'refundable') {
    if (r.refundFeeType === 'fixed_amount' && r.refundFeeAmount != null) {
      lines.push(`ค่าธรรมเนียมการคืน: ${r.refundFeeAmount.toLocaleString()} THB ต่อท่าน`)
    } else if (r.refundFeeType === 'percent' && r.refundFeePercent != null) {
      lines.push(`ค่าธรรมเนียมการคืน: ${r.refundFeePercent}%`)
    } else if (r.refundFeeType === 'airline_policy') {
      lines.push('ค่าธรรมเนียมการคืน: ตามเงื่อนไขสายการบิน')
    }
  }
  if (r.conditionType === 'partial_refund') {
    if (r.refundFeeType === 'fixed_amount' && r.refundFeeAmount != null) {
      lines.push(`จำนวนที่คืนได้: ${r.refundFeeAmount.toLocaleString()} THB ต่อท่าน`)
    } else if (r.refundFeeType === 'percent' && r.refundFeePercent != null) {
      lines.push(`จำนวนที่คืนได้: ${r.refundFeePercent}%`)
    } else if (r.refundFeeType === 'actual') {
      lines.push('จำนวนที่คืนได้: ตามจริง')
    } else if (r.refundFeeType === 'airline_policy') {
      lines.push('จำนวนที่คืนได้: ตามเงื่อนไขสายการบิน')
    }
  }
  const afterLabel = AFTER_LABELS[r.afterTicketIssueRefund]
  if (afterLabel) lines.push(`หลังออกตั๋วแล้ว: ${afterLabel}`)
  if (r.refundExceptionText?.trim()) lines.push(`ข้อยกเว้น: ${r.refundExceptionText.trim()}`)
  if (r.refundRemark?.trim()) lines.push(`รายละเอียด: ${r.refundRemark.trim()}`)
  return lines.join('\n')
}

// ─── Baggage Condition ────────────────────────────────────────────────────────

export type BaggageStatus = 'UNSPECIFIED' | 'NO_BAGGAGE' | 'INCLUDED'
export type BaggageWeightMode = 'same_per_piece' | 'total_weight' | 'different_per_piece' | 'custom_text'

export const BAGGAGE_STATUS_LABELS: Record<BaggageStatus, string> = {
  UNSPECIFIED: 'ไม่ระบุ',
  NO_BAGGAGE:  'ไม่มีน้ำหนักกระเป๋า',
  INCLUDED:    'มีน้ำหนักกระเป๋ารวมในตั๋ว',
}

export const BAGGAGE_WEIGHT_MODE_LABELS: Record<BaggageWeightMode, string> = {
  same_per_piece:      'น้ำหนักต่อใบเท่ากัน',
  total_weight:        'น้ำหนักรวมทุกใบ',
  different_per_piece: 'น้ำหนักแต่ละใบไม่เท่ากัน',
  custom_text:         'ระบุเอง',
}

export interface BaggageCondition {
  status: BaggageStatus
  weightMode: BaggageWeightMode

  // piece count — same_per_piece / total_weight / different_per_piece
  baggagePieceType: 'unspecified' | 'preset' | 'custom'
  baggagePieceValue: number | null    // 1, 2
  baggagePieceCustom: string

  // weight per piece — same_per_piece
  baggageWeightPerPieceType: 'unspecified' | 'preset' | 'custom'
  baggageWeightPerPieceValue: number | null   // 20, 23, 30
  baggageWeightPerPieceCustom: string

  // total weight — total_weight
  baggageTotalWeightType: 'preset' | 'custom'
  baggageTotalWeightValue: number | null      // 20, 23, 30, 40, 46
  baggageTotalWeightCustom: string
  // optional per-piece limit sub-mode inside total_weight
  hasPerPieceLimit?: boolean
  baggageTotalPieceWeights?: string[]          // length = piece count

  // per-piece weights — different_per_piece (array length = piece count)
  baggagePieceWeights: string[]

  // free text — custom_text (required)
  baggageCustomText: string

  baggageRemark: string
}

export const BAGGAGE_STATUS_EMPTY: BaggageCondition = {
  status: 'UNSPECIFIED',
  weightMode: 'same_per_piece',
  baggagePieceType: 'unspecified',
  baggagePieceValue: null,
  baggagePieceCustom: '',
  baggageWeightPerPieceType: 'unspecified',
  baggageWeightPerPieceValue: null,
  baggageWeightPerPieceCustom: '',
  baggageTotalWeightType: 'preset',
  baggageTotalWeightValue: null,
  baggageTotalWeightCustom: '',
  hasPerPieceLimit: false,
  baggageTotalPieceWeights: [],
  baggagePieceWeights: ['', ''],
  baggageCustomText: '',
  baggageRemark: '',
}

export function formatBaggageSummary(b: BaggageCondition | null | undefined): string {
  if (!b) return ''
  // fallback: old localStorage data with removed statuses
  const s = b.status as string
  if (s === 'PURCHASABLE' || s === 'PER_AIRLINE') return 'เงื่อนไขสัมภาระ: ไม่ระบุ'
  if (b.status === 'UNSPECIFIED') return 'เงื่อนไขสัมภาระ: ไม่ระบุ'
  if (b.status === 'NO_BAGGAGE') return 'ไม่มีน้ำหนักกระเป๋า (No Baggage Included)'

  // INCLUDED — branch by weightMode
  const mode = b.weightMode ?? 'same_per_piece'
  const remark = b.baggageRemark?.trim()
  const remarkLine = remark ? `\nหมายเหตุ: ${remark}` : ''

  // piece count label helper
  const pieceLabel = (() => {
    if (b.baggagePieceType === 'preset' && b.baggagePieceValue != null) return `${b.baggagePieceValue} ชิ้น`
    if (b.baggagePieceType === 'custom' && b.baggagePieceCustom?.trim()) return `${b.baggagePieceCustom.trim()} ชิ้น`
    return ''
  })()

  if (mode === 'custom_text') {
    const text = b.baggageCustomText?.trim()
    if (!text) return ''
    return `น้ำหนักกระเป๋า: ${text}${remarkLine}`
  }

  if (mode === 'same_per_piece') {
    const wLabel = (() => {
      if (b.baggageWeightPerPieceType === 'preset' && b.baggageWeightPerPieceValue != null) return `${b.baggageWeightPerPieceValue} กก.`
      if (b.baggageWeightPerPieceType === 'custom' && b.baggageWeightPerPieceCustom?.trim()) return b.baggageWeightPerPieceCustom.trim()
      return ''
    })()
    if (!pieceLabel && !wLabel) return `น้ำหนักกระเป๋ารวมในตั๋ว${remarkLine}`
    const parts = [pieceLabel, wLabel ? `${wLabel} ต่อชิ้น` : ''].filter(Boolean)
    return `น้ำหนักกระเป๋า: ${parts.join(' / ')} ต่อท่าน${remarkLine}`
  }

  if (mode === 'total_weight') {
    const tLabel = (() => {
      if (b.baggageTotalWeightType === 'preset' && b.baggageTotalWeightValue != null) return `${b.baggageTotalWeightValue} กก.`
      if (b.baggageTotalWeightType === 'custom' && b.baggageTotalWeightCustom?.trim()) return b.baggageTotalWeightCustom.trim()
      return ''
    })()
    if (!pieceLabel && !tLabel) return `น้ำหนักกระเป๋ารวมในตั๋ว${remarkLine}`
    const piecePart = pieceLabel ? `${pieceLabel} ` : ''
    const totalPart = tLabel ? `น้ำหนักรวมไม่เกิน ${tLabel}` : ''
    let result = `น้ำหนักกระเป๋า: ${piecePart}${totalPart} ต่อท่าน`.replace(/\s+/g, ' ').trim()
    if (b.hasPerPieceLimit) {
      const limits = b.baggageTotalPieceWeights ?? []
      limits.forEach((w, i) => { if (w?.trim()) result += `\nใบที่ ${i + 1} ไม่เกิน ${w.trim()} กก.` })
    }
    return result + remarkLine
  }

  if (mode === 'different_per_piece') {
    const weights = b.baggagePieceWeights ?? []
    if (weights.length === 0) return `น้ำหนักกระเป๋ารวมในตั๋ว${remarkLine}`
    const countLabel = pieceLabel || `${weights.length} ชิ้น`
    let text = `น้ำหนักกระเป๋า: ${countLabel} ต่อท่าน`
    weights.forEach((w, i) => { if (w?.trim()) text += `\nใบที่ ${i + 1} ไม่เกิน ${w.trim()} กก.` })
    return text + remarkLine
  }

  return `น้ำหนักกระเป๋ารวมในตั๋ว${remarkLine}`
}

// ─── Seat Reduction Condition ─────────────────────────────────────────────────

export type SeatReductionPolicy = 'NOT_ALLOWED' | 'ALLOWED'

export const SEAT_POLICY_LABELS: Record<SeatReductionPolicy, string> = {
  NOT_ALLOWED: 'ไม่อนุญาตให้ลดที่นั่ง',
  ALLOWED:     'อนุญาตให้ลดที่นั่ง',
}

export type SeatCalcBase = 'TOTAL_SEATS' | 'LATEST_SEATS' | 'CONFIRMED_SEATS'

export const SEAT_BASE_LABELS: Record<SeatCalcBase, string> = {
  TOTAL_SEATS:     'จำนวนที่นั่งทั้งหมดของกรุ๊ป',
  LATEST_SEATS:    'จำนวนที่นั่งล่าสุด',
  CONFIRMED_SEATS: 'จำนวนที่นั่ง Confirm ใน PNR',
}

export type SeatPenaltyType = 'FORFEIT_DEPOSIT' | 'CHARGE_FEE' | 'NOT_ALLOWED' | 'CUSTOM'

export const SEAT_PENALTY_LABELS: Record<SeatPenaltyType, string> = {
  FORFEIT_DEPOSIT: 'ยึดมัดจำ (Forfeit Deposit)',
  CHARGE_FEE:      'คิดค่าปรับ (Charge Fee)',
  NOT_ALLOWED:     'ไม่อนุญาต (Not Allowed)',
  CUSTOM:          'ระบุเอง (Custom)',
}

export type SeatNoticeType = 'DAYS_BEFORE' | 'FIXED_DATE'

export const REDUCTION_PERCENT_PRESETS = [10, 20, 30, 40, 50] as const
export type ReductionPercentType = (typeof REDUCTION_PERCENT_PRESETS)[number] | 'custom'

// ─── Seat Reduction — Step / Tier model ───────────────────────────────────────

export type SeatReductionMode = 'single' | 'tier'

export type TierDayConditionType = 'none' | 'days_before_departure' | 'day_range'
export type TierReductionCondType = 'unspecified' | 'over_percent' | 'max_percent' | 'custom'
export type TierPenaltyType =
  | 'unspecified' | 'forfeit_all' | 'percent_fee' | 'fixed_fee' | 'airline_policy' | 'custom'
export type TierCalcBase =
  | 'group_price' | 'fare' | 'fare_tax' | 'deposit' | 'paid_amount' | 'per_seat' | 'per_pnr' | 'custom'

export const TIER_DAY_TYPE_LABELS: Record<TierDayConditionType, string> = {
  none:                  'ไม่ระบุ',
  days_before_departure: 'ก่อนวันเดินทางกี่วัน',
  day_range:             'ช่วงวันก่อนเดินทาง',
}
export const TIER_REDUCTION_COND_LABELS: Record<TierReductionCondType, string> = {
  unspecified:  'ไม่ระบุ',
  over_percent: 'หากลดเกิน %',
  max_percent:  'ลดได้ไม่เกิน %',
  custom:       'ระบุเอง',
}
export const TIER_PENALTY_LABELS: Record<TierPenaltyType, string> = {
  unspecified:    'ไม่ระบุ',
  forfeit_all:    'ยึดทั้งหมด',
  percent_fee:    'คิดค่าปรับเป็น %',
  fixed_fee:      'คิดค่าปรับเป็นจำนวนเงิน',
  airline_policy: 'ตามเงื่อนไขสายการบิน',
  custom:         'ระบุเอง',
}
export const TIER_CALC_BASE_LABELS: Record<TierCalcBase, string> = {
  group_price: 'ราคากรุ๊ป',
  fare:        'ค่า Fare',
  fare_tax:    'ค่า Fare + Tax',
  deposit:     'ค่ามัดจำ',
  paid_amount: 'ยอดที่ชำระแล้ว',
  per_seat:    'ต่อที่นั่ง',
  per_pnr:     'ต่อ PNR',
  custom:      'ระบุเอง',
}

export interface SeatReductionTier {
  order: number
  dayConditionType: TierDayConditionType
  daysBeforeDeparture: number | null
  dayRangeFrom: number | null
  dayRangeTo: number | null
  reductionConditionType: TierReductionCondType
  reductionPercentValue: number | null
  reductionConditionCustomText: string | null
  penaltyType: TierPenaltyType
  penaltyPercentValue: number | null
  penaltyAmountValue: number | null
  penaltyCurrency: string
  penaltyCustomText: string | null
  calculationBase: TierCalcBase | null
  calculationBaseCustomText: string | null
  remark: string | null
  calcType?: 'UNLIMITED' | 'PERCENT' | 'SEAT_COUNT' | null
  scope?: 'PER_PNR' | 'PER_SERIES' | null
  maxReduceSeat?: number | null
}

export function createEmptySeatReductionTier(order: number): SeatReductionTier {
  return {
    order,
    dayConditionType: 'none',
    daysBeforeDeparture: null,
    dayRangeFrom: null,
    dayRangeTo: null,
    reductionConditionType: 'unspecified',
    reductionPercentValue: null,
    reductionConditionCustomText: null,
    penaltyType: 'unspecified',
    penaltyPercentValue: null,
    penaltyAmountValue: null,
    penaltyCurrency: 'THB',
    penaltyCustomText: null,
    calculationBase: null,
    calculationBaseCustomText: null,
    remark: null,
    calcType: 'PERCENT',
    scope: 'PER_PNR',
    maxReduceSeat: null,
  }
}

export interface SeatReductionCondition {
  policy: SeatReductionPolicy
  reductionPercentType?: ReductionPercentType  // preset value or 'custom'; undefined = back-compat
  maxPercent: number                            // actual value used for calculations
  noticeType: SeatNoticeType   // default 'DAYS_BEFORE' for back-compat
  noticeDays: number
  noticeFixedDate: string      // ISO date string (YYYY-MM-DD) when noticeType === 'FIXED_DATE'
  calcBase: SeatCalcBase | ''
  penalty: SeatPenaltyType | ''
  penaltyCustom: string
  overReductionConditionText: string // free-text penalty/condition if reduction exceeds limit (max 500 chars)
  // Step / Tier model — only meaningful when policy === 'ALLOWED'
  seatReductionMode?: SeatReductionMode      // default 'single' (undefined = single for back-compat)
  seatReductionTiers?: SeatReductionTier[]   // used when seatReductionMode === 'tier'
  // New fields: how reduction limit is specified
  calcType?: 'UNLIMITED' | 'PERCENT' | 'SEAT_COUNT' | null
  scope?: 'PER_PNR' | 'PER_SERIES' | null
  maxReduceSeat?: number | null
}

/** Derive reductionPercentType from maxPercent for backward compat */
export function deriveReductionPercentType(s: SeatReductionCondition): ReductionPercentType {
  if (s.reductionPercentType !== undefined) return s.reductionPercentType
  return (REDUCTION_PERCENT_PRESETS as readonly number[]).includes(s.maxPercent)
    ? (s.maxPercent as (typeof REDUCTION_PERCENT_PRESETS)[number])
    : 'custom'
}

function _fmtDMY(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** Builds the "ของX" phrase for a tier's calculation base (per_seat/per_pnr use no "ของ"). */
function _tierBaseText(t: SeatReductionTier): string {
  if (!t.calculationBase) return ''
  if (t.calculationBase === 'custom') return t.calculationBaseCustomText?.trim() || ''
  return TIER_CALC_BASE_LABELS[t.calculationBase] ?? ''
}
function _tierBasePhrase(t: SeatReductionTier): string {
  const base = _tierBaseText(t)
  if (!base) return ''
  const noOf = t.calculationBase === 'per_seat' || t.calculationBase === 'per_pnr'
  return noOf ? ` ${base}` : ` ของ${base}`
}

/** One-line human summary for a single tier, e.g. "45 วันก่อนเดินทาง คิด 15% ของราคากรุ๊ป". */
export function formatSeatReductionTierLine(t: SeatReductionTier): string {
  const parts: string[] = []

  // 1) day condition
  if (t.dayConditionType === 'days_before_departure' && t.daysBeforeDeparture != null) {
    parts.push(`${t.daysBeforeDeparture} วันก่อนเดินทาง`)
  } else if (t.dayConditionType === 'day_range' && t.dayRangeFrom != null && t.dayRangeTo != null) {
    parts.push(`${t.dayRangeFrom}-${t.dayRangeTo} วันก่อนเดินทาง`)
  }

  // 2) reduction amount condition
  if (t.reductionConditionType === 'over_percent' && t.reductionPercentValue != null) {
    parts.push(`หากลดเกิน ${t.reductionPercentValue}%`)
  } else if (t.reductionConditionType === 'max_percent' && t.reductionPercentValue != null) {
    parts.push(`ลดได้ไม่เกิน ${t.reductionPercentValue}%`)
  } else if (t.reductionConditionType === 'custom' && t.reductionConditionCustomText?.trim()) {
    parts.push(t.reductionConditionCustomText.trim())
  }

  // 3) penalty / forfeit
  let penalty = ''
  switch (t.penaltyType) {
    case 'forfeit_all':
      penalty = 'ยึดทั้งหมด'; break
    case 'percent_fee':
      if (t.penaltyPercentValue != null) penalty = `คิด ${t.penaltyPercentValue}%${_tierBasePhrase(t)}`
      break
    case 'fixed_fee':
      if (t.penaltyAmountValue != null) {
        penalty = `คิดค่าปรับ ${t.penaltyAmountValue.toLocaleString()} ${t.penaltyCurrency || 'THB'}${_tierBasePhrase(t)}`
      }
      break
    case 'airline_policy':
      penalty = 'ตามเงื่อนไขสายการบิน'; break
    case 'custom':
      penalty = t.penaltyCustomText?.trim() || ''; break
  }
  if (penalty) parts.push(penalty)

  return parts.join(' ').trim()
}

/** Summary for the whole tier list, numbered per step. */
export function formatSeatReductionTierSummary(tiers: SeatReductionTier[] | null | undefined): string {
  const list = (tiers ?? []).slice().sort((a, b) => a.order - b.order)
  const lines = list.map(t => formatSeatReductionTierLine(t)).filter(Boolean)
  if (!lines.length) return ''
  return ['เงื่อนไขการลดที่นั่งแบบ Step / Tier', ...lines.map((l, i) => `${i + 1}. ${l}`)].join('\n')
}

export function formatSeatReductionSummary(s: SeatReductionCondition | null | undefined): string {
  if (!s) return ''
  // fallback: old localStorage data with removed PER_AIRLINE policy
  if ((s.policy as string) === 'PER_AIRLINE') return 'ไม่อนุญาตให้ลดที่นั่ง'
  if (s.policy === 'NOT_ALLOWED') return 'ไม่อนุญาตให้ลดที่นั่ง'
  // ALLOWED — tier mode
  if (s.seatReductionMode === 'tier') {
    return formatSeatReductionTierSummary(s.seatReductionTiers)
  }
  // ALLOWED — single (default)
  const baseLabel = s.calcBase ? SEAT_BASE_LABELS[s.calcBase as SeatCalcBase] ?? '' : ''
  const calcType = s.calcType
  const scope = s.scope
  const scopePart = scope === 'PER_PNR' ? ' ต่อ PNR' : scope === 'PER_SERIES' ? ' รวมต่อ Series' : ''
  let text: string
  if (calcType === 'UNLIMITED') {
    text = 'ลดที่นั่งได้ไม่จำกัด'
  } else if (calcType === 'SEAT_COUNT') {
    text = `ลดได้สูงสุด ${s.maxReduceSeat != null ? s.maxReduceSeat : 0} Seat${scopePart}`
  } else {
    // PERCENT or undefined (backward compat)
    text = `ลดที่นั่งได้ไม่เกิน ${s.maxPercent || 0}%`
    if (baseLabel) text += ` ของ${baseLabel}`
    if (scopePart) text += scopePart
    else if (!calcType) text += ' (ยังไม่ระบุขอบเขต)'
  }
  const noticeType = s.noticeType ?? 'DAYS_BEFORE'
  if (noticeType === 'FIXED_DATE' && s.noticeFixedDate) {
    text += `\nต้องแจ้งภายในวันที่ ${_fmtDMY(s.noticeFixedDate)}`
  } else if (s.noticeDays > 0) {
    text += `\nแจ้งลดไม่น้อยกว่า ${s.noticeDays} วันก่อนเดินทาง`
  }
  // prefer new free-text field; fall back to legacy penalty for old data
  const overText = s.overReductionConditionText?.trim()
  if (overText) {
    text += `\nเงื่อนไขหากลดเกินกำหนด: ${overText}`
  } else if (s.penalty) {
    const legacyLabel = s.penalty === 'CUSTOM'
      ? (s.penaltyCustom || 'ระบุเอง')
      : SEAT_PENALTY_LABELS[s.penalty as SeatPenaltyType] ?? ''
    if (legacyLabel) text += `\nหากลดเกินกำหนด: ${legacyLabel}`
  }
  return text
}

// ─── Seat Reduction Utilities ─────────────────────────────────────────────────

/** คำนวณจำนวนที่นั่งที่ลดได้สูงสุด ปัดเศษลงเสมอ */
export function calcMaxSeatReduction(confirmedSeats: number, maxPercent: number): number {
  return Math.floor(confirmedSeats * maxPercent / 100)
}

/** ตรวจสอบว่าลดเกินเงื่อนไขหรือไม่ คืนข้อความแจ้งเตือนหากเกิน */
export function seatReductionWarning(
  confirmedSeats: number,
  maxPercent: number,
  requestedReduction: number,
  penaltyLabel?: string,
): string | null {
  if (requestedReduction <= 0) return null
  const maxAllowed = calcMaxSeatReduction(confirmedSeats, maxPercent)
  if (requestedReduction <= maxAllowed) return null
  const penaltyHint = penaltyLabel ? `ให้ดำเนินการตามเงื่อนไข "${penaltyLabel}"` : 'ให้ดำเนินการตามเงื่อนไขที่กำหนด'
  return [
    'จำนวนที่นั่งที่ลดเกินเงื่อนไขที่กำหนด',
    `PNR นี้มีที่นั่ง Confirm ${confirmedSeats} ที่นั่ง ลดได้สูงสุด ${maxAllowed} ที่นั่งเท่านั้น`,
    `หากต้องการลดเกินกำหนด ${penaltyHint}`,
  ].join('\n')
}

// ─── Seat Return Condition ────────────────────────────────────────────────────

export type SeatReturnType = 'non_refundable' | 'partial_refund' | 'full_refund'

export type SeatReturnForfeitType =
  | 'no_forfeit'
  | 'forfeit_all'
  | 'forfeit_rsvn'
  | 'forfeit_deposit'
  | 'forfeit_paid_amount'
  | 'forfeit_selected'
  | 'custom'

export type SeatReturnForfeitItem =
  | 'rsvn_fee' | 'deposit' | 'fee' | 'fare' | 'tax' | 'fuel_charge' | 'yr' | 'other'

export type SeatReturnPercentPreset = 10 | 20 | 30 | 40 | 50 | 'custom'

export type SeatReturnDeadlineType = 'unspecified' | 'days_before_departure' | 'fixed_date'

export type SeatReturnRefundFormat = 'percent' | 'fixed_amount' | 'actual' | 'custom'

export type SeatReturnRefundBase =
  | 'paid_amount' | 'deposit' | 'fare' | 'fare_tax' | 'tax_only' | 'custom'

export type SeatReturnExcessRefund =
  | 'not_exceed_paid' | 'not_exceed_deposit' | 'credit' | 'requires_approval' | 'custom'

export type SeatReturnRefundFeeType = 'none' | 'fixed_amount' | 'percent' | 'airline_policy' | 'custom'

export interface SeatReturnCondition {
  seatReturnType: SeatReturnType
  // non_refundable: forfeit
  seatReturnForfeitType: SeatReturnForfeitType | null
  seatReturnForfeitItems: SeatReturnForfeitItem[]
  seatReturnForfeitOtherText: string | null
  seatReturnForfeitCustomText: string | null
  // partial_refund: percent + deadline
  seatReturnPercentPreset: SeatReturnPercentPreset | null
  seatReturnPercentValue: number | null
  seatReturnDeadlineType: SeatReturnDeadlineType | null
  seatReturnDeadlineDays: number | null
  seatReturnDeadlineDate: string | null
  // partial_refund: refund calc
  seatReturnRefundFormat: SeatReturnRefundFormat | null
  seatReturnRefundBase: SeatReturnRefundBase | null
  seatReturnRefundBaseCustomText: string | null
  seatReturnExcessRefund: SeatReturnExcessRefund | null
  seatReturnExcessRefundCustomText: string | null
  // partial_refund: over-deadline forfeit
  seatReturnOverForfeitType: SeatReturnForfeitType | null
  seatReturnOverForfeitItems: SeatReturnForfeitItem[]
  seatReturnOverForfeitOtherText: string | null
  seatReturnOverForfeitCustomText: string | null
  // full_refund: deadline
  seatReturnFullDeadlineType: SeatReturnDeadlineType
  seatReturnFullDeadlineDays: number | null
  seatReturnFullDeadlineDate: string | null
  // full_refund: refund calc
  seatReturnFullRefundBase: SeatReturnRefundBase | null
  seatReturnFullRefundBaseCustomText: string | null
  seatReturnFullRefundFeeType: SeatReturnRefundFeeType | null
  seatReturnFullRefundFeeAmount: number | null
  seatReturnFullRefundFeePercent: number | null
  seatReturnFullRefundFeeCustomText: string | null
  seatReturnFullExcessRefund: SeatReturnExcessRefund | null
  seatReturnFullExcessRefundCustomText: string | null
  // shared remark
  seatReturnRemark: string | null
}

export const EMPTY_SEAT_RETURN_CONDITION: SeatReturnCondition = {
  seatReturnType: 'non_refundable',
  seatReturnForfeitType: 'no_forfeit',
  seatReturnForfeitItems: [],
  seatReturnForfeitOtherText: null,
  seatReturnForfeitCustomText: null,
  seatReturnPercentPreset: null,
  seatReturnPercentValue: null,
  seatReturnDeadlineType: null,
  seatReturnDeadlineDays: null,
  seatReturnDeadlineDate: null,
  seatReturnRefundFormat: null,
  seatReturnRefundBase: null,
  seatReturnRefundBaseCustomText: null,
  seatReturnExcessRefund: null,
  seatReturnExcessRefundCustomText: null,
  seatReturnOverForfeitType: 'no_forfeit',
  seatReturnOverForfeitItems: [],
  seatReturnOverForfeitOtherText: null,
  seatReturnOverForfeitCustomText: null,
  seatReturnFullDeadlineType: 'unspecified',
  seatReturnFullDeadlineDays: null,
  seatReturnFullDeadlineDate: null,
  seatReturnFullRefundBase: null,
  seatReturnFullRefundBaseCustomText: null,
  seatReturnFullRefundFeeType: null,
  seatReturnFullRefundFeeAmount: null,
  seatReturnFullRefundFeePercent: null,
  seatReturnFullRefundFeeCustomText: null,
  seatReturnFullExcessRefund: null,
  seatReturnFullExcessRefundCustomText: null,
  seatReturnRemark: null,
}

const _SR_FORFEIT_LABELS: Record<SeatReturnForfeitType, string> = {
  no_forfeit:         'ไม่ยึดเงิน',
  forfeit_all:        'ยึดทั้งหมด',
  forfeit_rsvn:       'ยึดเฉพาะ RSVN',
  forfeit_deposit:    'ยึดเฉพาะมัดจำ',
  forfeit_paid_amount:'ยึดเฉพาะเท่าที่จ่าย',
  forfeit_selected:   'ยึดบางรายการ',
  custom:             'ระบุเอง',
}
const _SR_ITEM_LABELS: Record<SeatReturnForfeitItem, string> = {
  rsvn_fee: 'RSVN Fee', deposit: 'Deposit', fee: 'Fee', fare: 'Fare',
  tax: 'Tax', fuel_charge: 'Fuel Charge', yr: 'YR', other: '',
}
const _SR_REFUND_BASE_LABELS: Record<SeatReturnRefundBase, string> = {
  paid_amount: 'จากยอดที่ชำระแล้ว',
  deposit:     'จากค่ามัดจำ',
  fare:        'จากค่า Fare',
  fare_tax:    'จากค่า Fare + Tax',
  tax_only:    'จาก Tax เท่านั้น',
  custom:      'ระบุเอง',
}
const _SR_EXCESS_LABELS: Record<SeatReturnExcessRefund, string> = {
  not_exceed_paid:     'คืนไม่เกินยอดที่ชำระจริง',
  not_exceed_deposit:  'คืนไม่เกินยอดมัดจำ',
  credit:              'คืนส่วนเกินเป็น Credit',
  requires_approval:   'ต้องขออนุมัติก่อนคืนส่วนเกิน',
  custom:              'ระบุเอง',
}
const _SR_FEE_LABELS: Record<SeatReturnRefundFeeType, string> = {
  none:           'ไม่มี',
  fixed_amount:   'ระบุจำนวนเงิน',
  percent:        'ระบุเป็น %',
  airline_policy: 'ตามเงื่อนไขสายการบิน',
  custom:         'ระบุเอง',
}

function _srForfeitText(
  type: SeatReturnForfeitType | null,
  items: SeatReturnForfeitItem[],
  otherText: string | null,
  customText: string | null,
): string {
  if (!type) return ''
  if (type === 'forfeit_selected') {
    if (!items.length) return 'ยึดบางรายการ'
    return items.map(i => i === 'other' ? (otherText || 'อื่น ๆ') : _SR_ITEM_LABELS[i]).filter(Boolean).join(', ')
  }
  if (type === 'custom') return customText?.trim() || 'ระบุเอง'
  return _SR_FORFEIT_LABELS[type] ?? ''
}

export function formatSeatReturnConditionSummary(s: SeatReturnCondition | null | undefined): string {
  if (!s) return ''
  const lines: string[] = []

  if (s.seatReturnType === 'non_refundable') {
    lines.push('เงื่อนไขการคืนที่นั่ง: คืนไม่ได้')
    const f = _srForfeitText(s.seatReturnForfeitType, s.seatReturnForfeitItems, s.seatReturnForfeitOtherText, s.seatReturnForfeitCustomText)
    if (f) lines.push('เงื่อนไขการยึดเงิน: ' + f)
    if (s.seatReturnRemark?.trim()) lines.push('รายละเอียด: ' + s.seatReturnRemark.trim())
  }

  if (s.seatReturnType === 'partial_refund') {
    lines.push('เงื่อนไขการคืนที่นั่ง: คืนได้บางส่วน')
    const pct = s.seatReturnPercentPreset === 'custom' ? s.seatReturnPercentValue : s.seatReturnPercentPreset
    if (pct != null) lines.push('คืนได้ไม่เกิน ' + pct + '%')
    if (s.seatReturnDeadlineType === 'days_before_departure' && s.seatReturnDeadlineDays != null) {
      lines.push('แจ้งลดไม่น้อยกว่า ' + s.seatReturnDeadlineDays + ' วันก่อนเดินทาง')
    } else if (s.seatReturnDeadlineType === 'fixed_date' && s.seatReturnDeadlineDate) {
      lines.push('ต้องแจ้งภายในวันที่ ' + _fmtDMY(s.seatReturnDeadlineDate))
    }
    lines.push('ฐานคำนวณ: Confirm Seat ใน PNR')
    if (s.seatReturnRefundBase && s.seatReturnRefundBase !== 'custom') {
      lines.push('ฐานคำนวณยอดคืน: ' + (_SR_REFUND_BASE_LABELS[s.seatReturnRefundBase] ?? ''))
    } else if (s.seatReturnRefundBase === 'custom' && s.seatReturnRefundBaseCustomText?.trim()) {
      lines.push('ฐานคำนวณยอดคืน: ' + s.seatReturnRefundBaseCustomText.trim())
    }
    const overF = _srForfeitText(s.seatReturnOverForfeitType, s.seatReturnOverForfeitItems, s.seatReturnOverForfeitOtherText, s.seatReturnOverForfeitCustomText)
    if (overF && s.seatReturnOverForfeitType !== 'no_forfeit') lines.push('หากคืนเกินกำหนด: ' + overF)
    if (s.seatReturnRemark?.trim()) lines.push('รายละเอียด: ' + s.seatReturnRemark.trim())
  }

  if (s.seatReturnType === 'full_refund') {
    lines.push('เงื่อนไขการคืนที่นั่ง: คืนได้ทั้งหมด')
    if (s.seatReturnFullDeadlineType === 'days_before_departure' && s.seatReturnFullDeadlineDays != null) {
      lines.push('Dateline วันคืนที่: ก่อนวันเดินทาง ' + s.seatReturnFullDeadlineDays + ' วัน')
    } else if (s.seatReturnFullDeadlineType === 'fixed_date' && s.seatReturnFullDeadlineDate) {
      lines.push('Dateline วันคืนที่: ภายในวันที่ ' + _fmtDMY(s.seatReturnFullDeadlineDate))
    }
    if (s.seatReturnFullRefundBase && s.seatReturnFullRefundBase !== 'custom') {
      lines.push('ฐานคำนวณยอดคืน: ' + (_SR_REFUND_BASE_LABELS[s.seatReturnFullRefundBase] ?? ''))
    } else if (s.seatReturnFullRefundBase === 'custom' && s.seatReturnFullRefundBaseCustomText?.trim()) {
      lines.push('ฐานคำนวณยอดคืน: ' + s.seatReturnFullRefundBaseCustomText.trim())
    }
    if (s.seatReturnFullRefundFeeType && s.seatReturnFullRefundFeeType !== 'custom') {
      lines.push('ค่าธรรมเนียมการคืน: ' + (_SR_FEE_LABELS[s.seatReturnFullRefundFeeType] ?? ''))
    } else if (s.seatReturnFullRefundFeeType === 'custom' && s.seatReturnFullRefundFeeCustomText?.trim()) {
      lines.push('ค่าธรรมเนียมการคืน: ' + s.seatReturnFullRefundFeeCustomText.trim())
    }
    if (s.seatReturnFullExcessRefund && s.seatReturnFullExcessRefund !== 'custom') {
      lines.push('กรณียอดคืนเกิน: ' + (_SR_EXCESS_LABELS[s.seatReturnFullExcessRefund] ?? ''))
    } else if (s.seatReturnFullExcessRefund === 'custom' && s.seatReturnFullExcessRefundCustomText?.trim()) {
      lines.push('กรณียอดคืนเกิน: ' + s.seatReturnFullExcessRefundCustomText.trim())
    }
    if (s.seatReturnRemark?.trim()) lines.push('รายละเอียด: ' + s.seatReturnRemark.trim())
  }

  return lines.join('\n')
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DemoConditionTemplateStage {
  stageId: string
  stageNo: number
  stageName: string
  paymentType: PaymentType | ''
  customPaymentName: string | null
  // v3 calc fields (replace amountType + rsvnFeeMode)
  calculationType?: CalculationType | ''
  percentValue?: number              // used when calculationType = PERCENT_OF_BASE
  calculationBase?: CalculationBase | null // used when calculationType = PERCENT_OF_BASE
  pricingPending?: boolean           // true when calculationType = NOT_SPECIFIED
  // v2 legacy — kept for backward-compat (read-only in form, written from calculationType on save)
  rsvnFeeMode: RsvnFeeMode | null
  amountType: TemplateAmountType
  amountValue: number
  percentBase: PercentBase
  dueCalculationType: DueCalculationType
  dayOffset: number
  dueTime: string
  dueCustomDate: string | null
  creditTowardFare: boolean
  refundable: boolean
  autoCalculate: boolean
  remark: string
  status: ConditionStatus
}

export interface DemoConditionTemplate {
  templateId: string
  templateCode: string
  templateName: string
  templateType: TemplateType         // ประเภทของ Template
  airlineCode: string | null         // primary airline for grouping (= airlines[0] ?? null)
  airlines: string[] | null          // null = all airlines; string[] = specific airline codes
  ticketType: TemplateTicketType
  currency: string
  description: string
  status: ConditionStatus
  version: number
  createdAt: string
  updatedAt: string
  stages: DemoConditionTemplateStage[]
  // Free text / internal conditions
  freeTextCondition: string
  internalNote: string
  internalConditionNoteHtml: string
  // Refund policy
  refundPolicyEnabled: boolean
  refundType: RefundType
  refundDescription: string
  requireApproval: boolean
  refundNote: string
  refundConditions: DemoRefundCondition[]
  rules?: import('./condition-rules').ConditionRule[]
  paymentSchedule?: import('./condition-rules').PaymentRound[]
  baggageCondition?: BaggageCondition | null
  seatReductionCondition?: SeatReductionCondition | null
  seatReturnCondition?: SeatReturnCondition | null
  ticketRefundCondition?: TicketRefundCondition | null
}

// ─── Normalizers (backward-compat) ────────────────────────────────────────────

const LEGACY_REFUND_TYPE: Record<string, RefundType> = {
  full: 'FULL_REFUND', partial: 'PARTIAL_REFUND',
  conditional: 'CONDITIONAL_REFUND', none: 'NON_REFUNDABLE',
}

function normalizeRefundType(v: string | undefined): RefundType {
  if (!v) return 'CONDITIONAL_REFUND'
  return LEGACY_REFUND_TYPE[v] ?? (v as RefundType)
}

function normalizeRefundCondition(c: DemoRefundCondition | Record<string, unknown>): DemoRefundCondition {
  return {
    refundConditionId: (c.refundConditionId as string) || `rc-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
    seq: (c.seq as number) ?? 0,
    name: (c.name as string) ?? '',
    rangeType: (c.rangeType as RefundRangeType) ?? 'from_days',
    minDaysBeforeTravel: (c.minDaysBeforeTravel as number) ?? ((c as Record<string, unknown>).refundDayOffset as number) ?? 0,
    maxDaysBeforeTravel: (c.maxDaysBeforeTravel as number | null) ?? null,
    refundCalcType: (c.refundCalcType as RefundCondCalcType) ?? 'FULL_REFUND',
    refundPercent: (c.refundPercent as number) ?? 100,
    deductionPercent: (c.deductionPercent as number) ?? 0,
    deductionAmount: (c.deductionAmount as number) ?? 0,
    calculationBase: (c.calculationBase as RefundCalcBase) ?? 'TOTAL_PAID',
    remark: (c.remark as string) ?? '',
  }
}

const _SR_VALID_TYPES: string[] = ['non_refundable', 'partial_refund', 'full_refund']
const _SR_VALID_FORFEIT: string[] = [
  'no_forfeit', 'forfeit_all', 'forfeit_rsvn', 'forfeit_deposit',
  'forfeit_paid_amount', 'forfeit_selected', 'custom',
]

/**
 * Single source of truth for migrating a stored Seat Return Condition into the
 * current model. Consumed by getConditionTemplates() (so form, detail page and
 * summary all read the same normalized shape) and defensively by the form.
 *
 * Legacy values handled: type 'allowed' → 'partial_refund'; any other unknown
 * type (incl. old 'unspecified' / 'not_allowed') → 'non_refundable'. Old forfeit
 * value 'unspecified' (and anything unknown) → 'no_forfeit'.
 */
export function normalizeSeatReturnCondition(
  raw: SeatReturnCondition | null | undefined,
): SeatReturnCondition | null {
  if (!raw) return null
  const r = raw as Partial<SeatReturnCondition> & Record<string, unknown>

  const rawType = r.seatReturnType as string | undefined
  const seatReturnType: SeatReturnType =
    rawType && _SR_VALID_TYPES.includes(rawType) ? (rawType as SeatReturnType)
    : rawType === 'allowed' ? 'partial_refund'
    : 'non_refundable'

  const pickForfeit = (v: unknown): SeatReturnForfeitType =>
    typeof v === 'string' && _SR_VALID_FORFEIT.includes(v) ? (v as SeatReturnForfeitType) : 'no_forfeit'

  return {
    ...EMPTY_SEAT_RETURN_CONDITION,
    ...(raw as Partial<SeatReturnCondition>),
    seatReturnType,
    seatReturnForfeitType: pickForfeit(r.seatReturnForfeitType),
    seatReturnForfeitItems: Array.isArray(r.seatReturnForfeitItems) ? r.seatReturnForfeitItems as SeatReturnForfeitItem[] : [],
    seatReturnOverForfeitType: pickForfeit(r.seatReturnOverForfeitType),
    seatReturnOverForfeitItems: Array.isArray(r.seatReturnOverForfeitItems) ? r.seatReturnOverForfeitItems as SeatReturnForfeitItem[] : [],
    seatReturnFullDeadlineType: (r.seatReturnFullDeadlineType as SeatReturnDeadlineType) ?? 'unspecified',
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function getConditionTemplates(): DemoConditionTemplate[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DemoConditionTemplate[]
    return parsed.map(t => {
      const airlines = t.airlines ?? (t.airlineCode ? [t.airlineCode] : null)
      return {
        ...t,
        airlines,
        airlineCode: t.airlineCode ?? (airlines?.[0] ?? null),
        templateType: t.templateType ?? (hasPaymentScheduleData(t) ? 'PAYMENT' : 'BOOKING'),
        freeTextCondition: t.freeTextCondition ?? '',
        internalNote: t.internalNote ?? '',
        internalConditionNoteHtml: t.internalConditionNoteHtml ?? '',
        refundPolicyEnabled: t.refundPolicyEnabled ?? false,
        refundType: normalizeRefundType(t.refundType),
        refundDescription: t.refundDescription ?? '',
        requireApproval: false,
        refundNote: t.refundNote ?? t.refundDescription ?? '',
        refundConditions: (t.refundConditions ?? []).map(normalizeRefundCondition),
        seatReturnCondition: normalizeSeatReturnCondition(t.seatReturnCondition),
        stages: (t.stages ?? []).map(s => ({
          ...s,
          rsvnFeeMode: s.rsvnFeeMode ?? null,
          creditTowardFare: s.creditTowardFare ?? false,
          refundable: s.refundable ?? true,
          autoCalculate: s.autoCalculate ?? false,
        })),
      }
    })
  } catch {
    return []
  }
}

export function getConditionTemplateById(templateId: string): DemoConditionTemplate | null {
  return getConditionTemplates().find(t => t.templateId === templateId) ?? null
}

export function getConditionTemplateByCode(code: string): DemoConditionTemplate | null {
  return getConditionTemplates().find(t => t.templateCode === code) ?? null
}

export function saveConditionTemplate(template: DemoConditionTemplate): void {
  if (typeof window === 'undefined') return
  try {
    const templates = getConditionTemplates()
    const filtered = templates.filter(t => t.templateId !== template.templateId)
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify([template, ...filtered]))
    window.dispatchEvent(new CustomEvent('condition_template_updated', { detail: { templateId: template.templateId } }))
  } catch {
    // silently ignore quota errors
  }
}

export function deleteConditionTemplate(templateId: string): void {
  if (typeof window === 'undefined') return
  try {
    const templates = getConditionTemplates().filter(t => t.templateId !== templateId)
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates))
    window.dispatchEvent(new CustomEvent('condition_template_updated', { detail: { templateId } }))
  } catch {
    // silently ignore
  }
}

/**
 * Clears ALL condition templates from localStorage and marks storage as seeded
 * so seedTemplatesIfEmpty() won't auto-repopulate the sample data. Use this to
 * start from a clean slate and verify that newly created templates persist.
 */
export function clearAllConditionTemplates(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, '[]')
    window.localStorage.setItem(TEMPLATE_SEEDED_KEY, '1')
    window.dispatchEvent(new CustomEvent('condition_template_updated', { detail: {} }))
  } catch {
    // silently ignore
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function generateTemplateId(): string {
  return genId('CTMPL')
}

export function generateStageId(): string {
  return genId('CSTG')
}

/**
 * Auto-generates next template code in format CTMPL001, CTMPL002, etc.
 * Reads all existing templates and increments from the highest number found.
 */
export function generateTemplateCode(existing?: DemoConditionTemplate[]): string {
  const templates = existing ?? getConditionTemplates()
  let max = 0
  for (const t of templates) {
    const match = t.templateCode.match(/^CTMPL(\d+)$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > max) max = n
    }
  }
  return `CTMPL${String(max + 1).padStart(3, '0')}`
}

/**
 * Counts how many DemoStock conditions reference a template by its templateId.
 */
export function getTemplateUsageCount(templateId: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const stocks = getDemoStocks()
    let count = 0
    for (const stock of stocks) {
      for (const cond of stock.conditions) {
        if ((cond as { sourceTemplateId?: string }).sourceTemplateId === templateId) {
          count++
        }
      }
    }
    return count
  } catch {
    return 0
  }
}

/**
 * Checks if a templateCode is already in use (case-insensitive).
 */
export function isTemplateCodeTaken(code: string, excludeTemplateId?: string): boolean {
  const templates = getConditionTemplates()
  return templates.some(
    t => t.templateCode.toLowerCase() === code.toLowerCase() && t.templateId !== excludeTemplateId
  )
}

/**
 * Duplicates a template — assigns new ID, auto-generates new code, resets version to 1.
 */
export function duplicateTemplate(source: DemoConditionTemplate): DemoConditionTemplate {
  const now = new Date().toISOString()
  return {
    ...source,
    templateId: generateTemplateId(),
    templateCode: generateTemplateCode(),
    templateName: `${source.templateName} (Copy)`,
    version: 1,
    createdAt: now,
    updatedAt: now,
    stages: source.stages.map(s => ({
      ...s,
      stageId: generateStageId(),
    })),
  }
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

function makeStage(
  id: string, no: number, name: string,
  paymentType: PaymentType | '',
  amountType: TemplateAmountType, amountValue: number,
  dayOffset: number, dueTime = '18:00',
): DemoConditionTemplateStage {
  return {
    stageId: id, stageNo: no, stageName: name,
    paymentType, customPaymentName: null, rsvnFeeMode: null,
    amountType, amountValue, percentBase: 'TOTAL_AMOUNT',
    dueCalculationType: 'travel_minus_days', dayOffset, dueTime, dueCustomDate: null,
    creditTowardFare: true, refundable: false, autoCalculate: false, remark: '', status: 'Active',
  }
}

function templateDefaults(t: Omit<DemoConditionTemplate, 'airlines' | 'freeTextCondition' | 'internalNote' | 'internalConditionNoteHtml' | 'refundPolicyEnabled' | 'refundType' | 'refundDescription' | 'requireApproval' | 'refundNote' | 'refundConditions'>): DemoConditionTemplate {
  return {
    ...t,
    templateType: t.templateType ?? 'PAYMENT',
    airlines: t.airlineCode ? [t.airlineCode] : null,
    freeTextCondition: '', internalNote: '', internalConditionNoteHtml: '',
    refundPolicyEnabled: false, refundType: 'CONDITIONAL_REFUND',
    refundDescription: '', requireApproval: false, refundNote: '', refundConditions: [],
  }
}

const S = (id: string, no: number, name: string, pt: PaymentType | '', at: TemplateAmountType, av: number, day: number) =>
  makeStage(id, no, name, pt, at, av, day)

export const SEED_TEMPLATES: DemoConditionTemplate[] = [
  templateDefaults({ templateId: 'ctmpl-tg-001', templateCode: 'CTMPL-TG-001', airlineCode: 'TG',
    templateName: 'TG มัดจำ 5,000 + ชำระส่วนที่เหลือ', templateType: 'PAYMENT', ticketType: 'Group', currency: 'THB', status: 'Active', version: 2,
    description: 'มัดจำ 5,000 บาท แล้วชำระส่วนที่เหลือก่อนเดินทาง 14 วัน',
    createdAt: '2026-01-10T00:00:00.000Z', updatedAt: '2026-04-15T00:00:00.000Z',
    stages: [S('cstg-tg001-1',1,'งวดที่ 1 — มัดจำ','DEPOSIT','FIXED_TOTAL',5000,30), S('cstg-tg001-2',2,'งวดที่ 2 — ชำระส่วนที่เหลือ','BALANCE','Remaining',0,14)] }),
  templateDefaults({ templateId: 'ctmpl-tg-002', templateCode: 'CTMPL-TG-002', airlineCode: 'TG',
    templateName: 'TG มัดจำ 3 งวด + ชำระส่วนที่เหลือ', templateType: 'PAYMENT', ticketType: 'Group', currency: 'THB', status: 'Active', version: 3,
    description: 'แบ่งมัดจำ 3 งวด (60/45/30 วัน) แล้วชำระส่วนที่เหลือ 14 วันก่อนเดินทาง',
    createdAt: '2026-01-12T00:00:00.000Z', updatedAt: '2026-05-20T00:00:00.000Z',
    stages: [S('cstg-tg002-1',1,'งวดที่ 1 — มัดจำ','DEPOSIT','FIXED_TOTAL',3000,60), S('cstg-tg002-2',2,'งวดที่ 2 — มัดจำ','DEPOSIT','FIXED_TOTAL',3000,45), S('cstg-tg002-3',3,'งวดที่ 3 — มัดจำ','DEPOSIT','FIXED_TOTAL',4000,30), S('cstg-tg002-4',4,'งวดที่ 4 — ชำระส่วนที่เหลือ','BALANCE','Remaining',0,14)] }),
  templateDefaults({ templateId: 'ctmpl-tg-003', templateCode: 'CTMPL-TG-003', airlineCode: 'TG',
    templateName: 'TG ชำระเต็มจำนวน', templateType: 'PAYMENT', ticketType: 'FIT', currency: 'THB', status: 'Inactive', version: 1,
    description: 'ชำระเต็มจำนวนครั้งเดียวก่อนเดินทาง 21 วัน',
    createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
    stages: [S('cstg-tg003-1',1,'งวดที่ 1 — ชำระเต็มจำนวน','FULL_PAYMENT','Remaining',0,21)] }),
  templateDefaults({ templateId: 'ctmpl-vz-001', templateCode: 'CTMPL-VZ-001', airlineCode: 'VZ',
    templateName: 'VZ มัดจำ 5,000 + ชำระส่วนที่เหลือ', templateType: 'PAYMENT', ticketType: 'Group', currency: 'THB', status: 'Active', version: 1,
    description: 'มัดจำ 5,000 บาท ชำระส่วนที่เหลือ 21 วันก่อนเดินทาง',
    createdAt: '2026-02-10T00:00:00.000Z', updatedAt: '2026-02-10T00:00:00.000Z',
    stages: [S('cstg-vz001-1',1,'งวดที่ 1 — มัดจำ','DEPOSIT','FIXED_TOTAL',5000,45), S('cstg-vz001-2',2,'งวดที่ 2 — ชำระส่วนที่เหลือ','BALANCE','Remaining',0,21)] }),
  templateDefaults({ templateId: 'ctmpl-vz-002', templateCode: 'CTMPL-VZ-002', airlineCode: 'VZ',
    templateName: 'VZ ชำระเต็มจำนวน', templateType: 'PAYMENT', ticketType: 'FIT', currency: 'THB', status: 'Active', version: 1,
    description: 'ชำระเต็มจำนวนครั้งเดียวก่อนเดินทาง 14 วัน',
    createdAt: '2026-02-15T00:00:00.000Z', updatedAt: '2026-02-15T00:00:00.000Z',
    stages: [S('cstg-vz002-1',1,'งวดที่ 1 — ชำระเต็มจำนวน','FULL_PAYMENT','Remaining',0,14)] }),
  templateDefaults({ templateId: 'ctmpl-fd-001', templateCode: 'CTMPL-FD-001', airlineCode: 'FD',
    templateName: 'FD มัดจำ + ชำระส่วนที่เหลือ', templateType: 'PAYMENT', ticketType: 'Group', currency: 'THB', status: 'Active', version: 1,
    description: 'มัดจำ 3,000 บาท ชำระส่วนที่เหลือ 30 วันก่อนเดินทาง',
    createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z',
    stages: [S('cstg-fd001-1',1,'งวดที่ 1 — มัดจำ','DEPOSIT','FIXED_TOTAL',3000,60), S('cstg-fd001-2',2,'งวดที่ 2 — ชำระส่วนที่เหลือ','BALANCE','Remaining',0,30)] }),
  templateDefaults({ templateId: 'ctmpl-fd-002', templateCode: 'CTMPL-FD-002', airlineCode: 'FD',
    templateName: 'FD ชำระเต็มจำนวน', templateType: 'PAYMENT', ticketType: 'FIT', currency: 'THB', status: 'Inactive', version: 1,
    description: 'ชำระเต็มจำนวนก่อนเดินทาง 7 วัน',
    createdAt: '2026-03-05T00:00:00.000Z', updatedAt: '2026-03-05T00:00:00.000Z',
    stages: [S('cstg-fd002-1',1,'งวดที่ 1 — ชำระเต็มจำนวน','FULL_PAYMENT','Remaining',0,7)] }),
  templateDefaults({ templateId: 'ctmpl-sq-001', templateCode: 'CTMPL-SQ-001', airlineCode: 'SQ',
    templateName: 'SQ มัดจำ + ชำระส่วนที่เหลือ', templateType: 'PAYMENT', ticketType: 'Group', currency: 'THB', status: 'Active', version: 1,
    description: 'มัดจำ 8,000 บาท ชำระส่วนที่เหลือ 21 วันก่อนเดินทาง',
    createdAt: '2026-03-20T00:00:00.000Z', updatedAt: '2026-03-20T00:00:00.000Z',
    stages: [S('cstg-sq001-1',1,'งวดที่ 1 — มัดจำ','DEPOSIT','FIXED_TOTAL',8000,45), S('cstg-sq001-2',2,'งวดที่ 2 — ชำระส่วนที่เหลือ','BALANCE','Remaining',0,21)] }),
  templateDefaults({ templateId: 'ctmpl-sq-002', templateCode: 'CTMPL-SQ-002', airlineCode: 'SQ',
    templateName: 'SQ ชำระเต็มจำนวน', templateType: 'PAYMENT', ticketType: 'FIT', currency: 'THB', status: 'Active', version: 1,
    description: 'ชำระเต็มจำนวนครั้งเดียวก่อนเดินทาง 30 วัน',
    createdAt: '2026-03-25T00:00:00.000Z', updatedAt: '2026-03-25T00:00:00.000Z',
    stages: [S('cstg-sq002-1',1,'งวดที่ 1 — ชำระเต็มจำนวน','FULL_PAYMENT','Remaining',0,30)] }),
  {
    ...templateDefaults({
      templateId: 'ctmpl-ci-001', templateCode: 'CTMPCI001', airlineCode: 'CI',
      templateName: 'China Airlines Group Standard 2026', templateType: 'FULL',
      ticketType: 'Group', currency: 'THB', status: 'Active', version: 1,
      description: 'Conditions of group booking for China Airlines G-Class',
      createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
      stages: [],
    }),
    freeTextCondition: [
      'Conditions of group booking. (China Airlines)',
      '1. Deposit 3,000THB per pax (within 7 days after seats are confirmed)',
      '2. Baggage 1 pc (23kg) per pax',
      '3. Utilization of 90% of group seats',
      '4. Apply child fare 75% of adult fare',
      '5. Resize or cancel the group must be 45 days before the departure date.',
      '   The deposit has to be deducted on the issue ticket date',
      '6. Name input must be 30 days before the departure date',
      '7. Issue ticket must be 21 days before the departure date',
      '8. Group (G-Class) unable to count mileage or upgrade class',
      '9. After inputting pax name, the group cannot change pax.',
      '   In case the pax is unable to travel, the ticket can be refunded only taxes and fuel charge (except YR)',
      '10. Group seats will be arranged by CI airport\'s staff',
      '11. No free of charge (No FOC)',
    ].join('\n'),
    paymentSchedule: [{
      roundId: 'pay-ci001-1',
      roundNo: 1,
      paymentType: 'DEPOSIT' as const,
      roundName: 'Deposit 3,000 THB per pax',
      calcType: 'PER_SEAT' as const,
      amount: 3000,
      percent: 0,
      currency: 'THB',
      quantityBase: 'initial_seat' as const,
      dueRuleType: 'AFTER_CONFIRM' as const,
      dueDays: 7,
      fixedDueDate: '',
      creditTowardFare: true,
      deductBase: 'fare' as const,
      refundStatus: 'non_refundable' as const,
      remark: 'Deposit 3,000 THB per pax within 7 days after seats are confirmed.\nThe deposit has to be deducted on the issue ticket date.',
    } satisfies PaymentRound],
    rules: ([
      {
        ruleId: 'rule-ci-r01', ruleType: 'DEPOSIT_DEDUCTION', sortOrder: 1, enabled: true,
        ruleName: 'Deposit Deducted on Ticket Issue Date',
        description: 'The deposit has to be deducted on the issue ticket date.',
      },
      {
        ruleId: 'rule-ci-r02', ruleType: 'CANCEL_RESIZE', sortOrder: 2, enabled: true,
        ruleName: 'Resize or Cancel Before 45 Days',
        description: 'Resize or cancel the group must be 45 days before the departure date.',
      },
      {
        ruleId: 'rule-ci-r03', ruleType: 'NAME_CHANGE', sortOrder: 3, enabled: true,
        ruleName: 'No Passenger Change After Name Input',
        description: 'After inputting pax name, the group cannot change pax.',
      },
      {
        ruleId: 'rule-ci-r04', ruleType: 'REFUND_TAX_FUEL', sortOrder: 4, enabled: true,
        ruleName: 'Refund Only Taxes and Fuel Charge Except YR',
        description: 'In case the pax is unable to travel, the ticket can be refunded only taxes and fuel charge (except YR).',
      },
    ] satisfies ConditionRule[]),
    baggageCondition: {
      status: 'INCLUDED',
      weightMode: 'same_per_piece',
      baggagePieceType: 'preset', baggagePieceValue: 1, baggagePieceCustom: '',
      baggageWeightPerPieceType: 'preset', baggageWeightPerPieceValue: 23, baggageWeightPerPieceCustom: '',
      baggageTotalWeightType: 'preset', baggageTotalWeightValue: null, baggageTotalWeightCustom: '',
      baggagePieceWeights: [''],
      baggageCustomText: '',
      baggageRemark: 'Baggage 1 pc (23kg) per pax.',
    } satisfies BaggageCondition,
    seatReductionCondition: {
      policy: 'ALLOWED',
      reductionPercentType: 10,
      maxPercent: 10,
      noticeType: 'DAYS_BEFORE',
      noticeDays: 45,
      noticeFixedDate: '',
      calcBase: 'CONFIRMED_SEATS',
      penalty: '',
      penaltyCustom: '',
      overReductionConditionText: 'หากลดที่นั่งเกินจำนวนที่กำหนด สายการบินมีสิทธิ์ยึดมัดจำตามเงื่อนไข',
    } satisfies SeatReductionCondition,
  },
  {
    ...templateDefaults({
      templateId: 'ctmpl-tier-001', templateCode: 'CTMPL-TIER-001', airlineCode: 'TG',
      templateName: 'TG ลดที่นั่งแบบ Step / Tier', templateType: 'SEAT_REDUCTION',
      ticketType: 'Group', currency: 'THB', status: 'Active', version: 1,
      description: 'ตัวอย่างเงื่อนไขการลดที่นั่งแบบหลาย Step ตามช่วงวันก่อนเดินทาง',
      createdAt: '2026-06-10T00:00:00.000Z', updatedAt: '2026-06-10T00:00:00.000Z',
      stages: [],
    }),
    seatReductionCondition: {
      policy: 'ALLOWED',
      reductionPercentType: 10, maxPercent: 10,
      noticeType: 'DAYS_BEFORE', noticeDays: 45, noticeFixedDate: '',
      calcBase: 'CONFIRMED_SEATS', penalty: '', penaltyCustom: '',
      overReductionConditionText: '',
      seatReductionMode: 'tier',
      seatReductionTiers: [
        { order: 1, dayConditionType: 'none', daysBeforeDeparture: null, dayRangeFrom: null, dayRangeTo: null,
          reductionConditionType: 'over_percent', reductionPercentValue: 20, reductionConditionCustomText: null,
          penaltyType: 'forfeit_all', penaltyPercentValue: null, penaltyAmountValue: null, penaltyCurrency: 'THB', penaltyCustomText: null,
          calculationBase: null, calculationBaseCustomText: null, remark: null },
        { order: 2, dayConditionType: 'days_before_departure', daysBeforeDeparture: 45, dayRangeFrom: null, dayRangeTo: null,
          reductionConditionType: 'unspecified', reductionPercentValue: null, reductionConditionCustomText: null,
          penaltyType: 'percent_fee', penaltyPercentValue: 15, penaltyAmountValue: null, penaltyCurrency: 'THB', penaltyCustomText: null,
          calculationBase: 'group_price', calculationBaseCustomText: null, remark: null },
        { order: 3, dayConditionType: 'day_range', daysBeforeDeparture: null, dayRangeFrom: 44, dayRangeTo: 30,
          reductionConditionType: 'unspecified', reductionPercentValue: null, reductionConditionCustomText: null,
          penaltyType: 'percent_fee', penaltyPercentValue: 25, penaltyAmountValue: null, penaltyCurrency: 'THB', penaltyCustomText: null,
          calculationBase: 'group_price', calculationBaseCustomText: null, remark: null },
        { order: 4, dayConditionType: 'day_range', daysBeforeDeparture: null, dayRangeFrom: 29, dayRangeTo: 21,
          reductionConditionType: 'unspecified', reductionPercentValue: null, reductionConditionCustomText: null,
          penaltyType: 'percent_fee', penaltyPercentValue: 35, penaltyAmountValue: null, penaltyCurrency: 'THB', penaltyCustomText: null,
          calculationBase: 'group_price', calculationBaseCustomText: null, remark: null },
      ],
    } satisfies SeatReductionCondition,
  },
]

const OLD_SEED_IDS = new Set(['ctmpl-seed-01', 'ctmpl-seed-02', 'ctmpl-seed-03'])

/**
 * Seeds initial demo templates if none exist in storage.
 * Also migrates from old generic seeds (v1) to airline-specific seeds (v2).
 */
export function seedTemplatesIfEmpty(): void {
  if (typeof window === 'undefined') return
  try {
    const seeded = window.localStorage.getItem(TEMPLATE_SEEDED_KEY) === '1'
    const existing = getConditionTemplates()
    if (existing.length === 0) {
      // Respect an explicit clear — only auto-seed on the very first run.
      if (seeded) return
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(SEED_TEMPLATES))
      window.localStorage.setItem(TEMPLATE_SEEDED_KEY, '1')
      return
    }
    // Migrate: if all existing templates are old generic seeds, replace with new ones
    if (existing.every(t => OLD_SEED_IDS.has(t.templateId))) {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(SEED_TEMPLATES))
      return
    }
    // Merge: add any seed templates that are missing from localStorage (new seeds added in later versions)
    const existingIds = new Set(existing.map(t => t.templateId))
    const missingSeed = SEED_TEMPLATES.filter(t => !existingIds.has(t.templateId))
    if (missingSeed.length > 0) {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify([...existing, ...missingSeed]))
    }
  } catch {
    // silently ignore
  }
}
