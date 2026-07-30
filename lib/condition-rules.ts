// Condition Rule system — simplified text-based conditions for Group Booking templates
// Payment-related rules (amounts, due dates) are handled separately in Payment Schedule.

export type RuleType =
  | 'DEPOSIT_DEDUCTION'
  | 'CANCEL_RESIZE'
  | 'NAME_CHANGE'
  | 'REFUND_TAX_FUEL'
  | 'NON_REFUNDABLE'
  | 'FORFEIT'
  | 'OTHER'

export const RULE_LABELS: Record<RuleType, string> = {
  DEPOSIT_DEDUCTION: 'Deposit Deduction',
  CANCEL_RESIZE:     'Cancel / Resize Deadline',
  NAME_CHANGE:       'Name Change Restriction',
  REFUND_TAX_FUEL:   'Refund Tax / Fuel Only',
  NON_REFUNDABLE:    'Non-refundable',
  FORFEIT:           'Forfeit / ยึดเงิน',
  OTHER:             'Other',
}

export const RULE_DESCS: Record<RuleType, string> = {
  DEPOSIT_DEDUCTION: 'การหัก Deposit ณ วันออกตั๋ว เงื่อนไขการใช้เงินมัดจำ',
  CANCEL_RESIZE:     'กำหนดการยกเลิกหรือลดที่นั่ง เงื่อนไขและระยะเวลา',
  NAME_CHANGE:       'ข้อห้ามการเปลี่ยนชื่อหลังส่งรายชื่อ และผลที่ตามมา',
  REFUND_TAX_FUEL:   'การคืนเฉพาะ Tax และ Fuel Surcharge (YQ/YR) ในกรณีที่ตั๋วไม่คืนเงิน',
  NON_REFUNDABLE:    'ค่าโดยสารที่ไม่สามารถคืนเงินได้ ตั๋วประเภท Non-refundable',
  FORFEIT:           'การยึดเงินมัดจำ เงื่อนไขการหักเงิน กรณีผิดสัญญาหรือเงื่อนไข',
  OTHER:             'เงื่อนไขการ Refund อื่น ๆ ที่ไม่อยู่ในหมวดข้างต้น',
}

export const RULE_COLORS: Record<RuleType, string> = {
  DEPOSIT_DEDUCTION: 'amber',
  CANCEL_RESIZE:     'orange',
  NAME_CHANGE:       'violet',
  REFUND_TAX_FUEL:   'cyan',
  NON_REFUNDABLE:    'rose',
  FORFEIT:           'indigo',
  OTHER:             'slate',
}

// ── Rule interface ─────────────────────────────────────────────────────────────

export interface ConditionRule {
  ruleId: string
  ruleType: RuleType
  ruleName: string     // หัวข้อ
  description: string  // รายละเอียด (text/HTML from rich-text editor)
  enabled: boolean
  sortOrder: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
}

export function emptyRule(ruleType: RuleType, sortOrder: number): ConditionRule {
  return {
    ruleId:      genId('RULE'),
    ruleType,
    ruleName:    '',
    description: '',
    enabled:     true,
    sortOrder,
  }
}

export function isRuleComplete(rule: ConditionRule): boolean {
  return !!rule.ruleName.trim() && !!rule.description.trim()
}

// ── Payment Schedule ──────────────────────────────────────────────────────────

export type PaymentRoundType = 'RSVN_FEE' | 'DEPOSIT' | 'BALANCE' | 'FULL_PAYMENT' | 'FEE' | 'OTHER'

export type PaymentRoundCalcType =
  | 'FIXED_AMOUNT' | 'PER_PNR' | 'PER_SEAT' | 'PER_SERIES'

export type PaymentQuantityBase = 'initial_seat' | 'current_seat' | 'book'

export type PaymentDueRuleType = 'AFTER_CONFIRM' | 'BEFORE_DEPARTURE' | 'FIXED_DATE'

export interface PaymentRound {
  roundId: string
  roundNo: number
  paymentType: PaymentRoundType | ''
  roundName: string
  calcType: PaymentRoundCalcType | ''
  amount: number
  percent: number
  currency: string
  quantityBase: PaymentQuantityBase | ''
  dueRuleType: PaymentDueRuleType | ''
  dueDays: number
  fixedDueDate: string
  creditTowardFare: boolean
  deductBase: 'unspecified' | 'fare' | 'fare_tax'
  refundStatus: 'unspecified' | 'refundable' | 'non_refundable'
  refundable?: boolean       // deprecated — use refundStatus; kept for old data compat
  forfeitIfUnpaid?: boolean  // deprecated — ignored in UI, kept for old data compat
  remark: string
}

export function emptyPaymentRound(roundNo: number, currency = 'THB'): PaymentRound {
  return {
    roundId: genId('PAY'),
    roundNo,
    paymentType: '',
    roundName: '',
    calcType: '',
    amount: 0,
    percent: 0,
    currency,
    quantityBase: '',
    dueRuleType: '',
    dueDays: 0,
    fixedDueDate: '',
    creditTowardFare: false,
    deductBase: 'unspecified',
    refundStatus: 'unspecified',
    remark: '',
  }
}
