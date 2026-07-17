/**
 * Unified Condition Schema — 7 sections
 * Single source of truth for both template and stock conditions.
 */

// ─── Payment Stage ─────────────────────────────────────────────────────────────

export type CondPaymentType = 'RSVN_FEE' | 'DEPOSIT' | 'BALANCE' | 'FULL_PAYMENT' | 'TICKET_ISSUE_DATE' | 'FEE' | 'OTHER'

export const COND_PAYMENT_TYPE_LABELS: Record<CondPaymentType, string> = {
  RSVN_FEE:          'ค่าจองที่นั่ง (RSVN Fee)',
  DEPOSIT:           'มัดจำ (Deposit)',
  BALANCE:           'ส่วนที่เหลือ (Balance)',
  FULL_PAYMENT:      'ชำระเต็มจำนวน (Full Payment)',
  TICKET_ISSUE_DATE: 'ชำระเงินวันออกตั๋ว',
  FEE:               'ค่าธรรมเนียม (Fee)',
  OTHER:             'อื่น ๆ (Other)',
}

export type CondCalcType =
  | 'PER_SEAT'              // ต่อ Seat
  | 'FIXED_PER_PNR'         // ต่อ PNR
  | 'FIXED_PER_SERIES'      // ต่อ Series
  | 'PERCENT_OF_FARE'       // % จาก Fare
  | 'PERCENT_OF_NET_FARE'   // % จาก Net Fare
  | 'PERCENT_OF_ALLIN'      // % จาก All-in
  | 'FIXED_AMOUNT'          // จำนวนเงิน Fix (คงที่รวม)
  | 'REMAINING_BALANCE'     // ชำระยอดคงเหลือ
  | 'PERCENT_OF_BASE'       // legacy — backward-compat only

export const COND_CALC_TYPE_LABELS: Record<CondCalcType, string> = {
  PER_SEAT:            'ต่อ Seat',
  FIXED_PER_PNR:       'ต่อ PNR',
  FIXED_PER_SERIES:    'ต่อ Series',
  PERCENT_OF_FARE:     '% จาก Fare',
  PERCENT_OF_NET_FARE: '% จาก Net Fare',
  PERCENT_OF_ALLIN:    '% จาก All-in',
  FIXED_AMOUNT:        'จำนวนเงิน Fix',
  REMAINING_BALANCE:   'ชำระยอดคงเหลือ',
  PERCENT_OF_BASE:     '% ของยอด (legacy)',
}

export type CondCalcBase = 'FARE' | 'FARE_TAX' | 'FARE_YQ' | 'TOTAL_TICKET'

export const COND_CALC_BASE_LABELS: Record<CondCalcBase, string> = {
  FARE:         'FARE',
  FARE_TAX:     'FARE + TAX (ALL IN)',
  FARE_YQ:      'FARE + YQ',
  TOTAL_TICKET: 'ยอดรวมทั้งหมด',
}

export type CondQuantityBasis =
  | 'INITIAL_SEAT'    // Seat เริ่มต้น
  | 'REMAINING_SEAT'  // Seat คงเหลือ
  | 'ACTUAL_ISSUED'   // legacy — kept for backward compat, not shown in UI
  | 'PNR_COUNT'       // จำนวน PNR (auto-set for FIXED_PER_PNR)
  | 'SERIES_COUNT'    // จำนวน Series (auto-set for FIXED_PER_SERIES)

export const COND_QUANTITY_BASIS_LABELS: Record<CondQuantityBasis, string> = {
  INITIAL_SEAT:   'Seat เริ่มต้น',
  REMAINING_SEAT: 'Seat คงเหลือ',
  ACTUAL_ISSUED:  'Seat ที่ออกตั๋วจริง',
  PNR_COUNT:      'จำนวน PNR',
  SERIES_COUNT:   'จำนวน Series',
}

export type CondRefundableType = 'NON_REFUNDABLE' | 'REFUNDABLE' | 'UNSPECIFIED' | 'AS_SEAT_RETURN'

export const COND_REFUNDABLE_LABELS: Record<CondRefundableType, string> = {
  UNSPECIFIED:    'ยังไม่ระบุ',
  REFUNDABLE:     'คืนเงินได้',
  NON_REFUNDABLE: 'คืนเงินไม่ได้',
  AS_SEAT_RETURN: 'ตามเงื่อนไขคืนที่นั่ง',
}

export type CondDueType =
  | 'TRAVEL_MINUS_DAYS'
  | 'SEAT_CONFIRMED_PLUS_DAYS'
  | 'NAME_DEADLINE_MINUS_DAYS'
  | 'TICKET_ISSUE_MINUS_DAYS'
  | 'CREATED_PLUS_DAYS'
  | 'PREV_DUE_PLUS_DAYS'
  | 'PREV_PAID_PLUS_DAYS'
  | 'CUSTOM_DATE'
  | 'TBD'

export const COND_DUE_TYPE_LABELS: Record<CondDueType, string> = {
  TRAVEL_MINUS_DAYS:        'ก่อนวันเดินทาง N วัน',
  SEAT_CONFIRMED_PLUS_DAYS: 'หลังวันที่ Confirm ที่นั่ง N วัน',
  NAME_DEADLINE_MINUS_DAYS: 'ก่อนวันส่งชื่อ (TTL) N วัน',
  TICKET_ISSUE_MINUS_DAYS:  'ก่อนวันออกตั๋ว N วัน',
  CREATED_PLUS_DAYS:        'หลังสร้าง Series N วัน',
  PREV_DUE_PLUS_DAYS:       'หลังครบกำหนดงวดก่อน N วัน',
  PREV_PAID_PLUS_DAYS:      'หลังชำระงวดก่อน N วัน',
  CUSTOM_DATE:              'วันที่กำหนดเอง',
  TBD:                      'กำหนดภายหลัง (TBD)',
}

export const DAY_BASED_DUE_TYPES: CondDueType[] = [
  'TRAVEL_MINUS_DAYS', 'SEAT_CONFIRMED_PLUS_DAYS',
  'NAME_DEADLINE_MINUS_DAYS', 'TICKET_ISSUE_MINUS_DAYS',
  'CREATED_PLUS_DAYS', 'PREV_DUE_PLUS_DAYS', 'PREV_PAID_PLUS_DAYS',
]

export interface CondStage {
  stageId: string
  stageNo: number
  stageName: string
  paymentType: CondPaymentType | ''
  customPaymentName: string
  calcType: CondCalcType
  amount: number
  percent: number
  calcBase: CondCalcBase | null
  quantityBasis: CondQuantityBasis
  dueType: CondDueType
  dueDays: number
  dueTime: string
  dueTimeUnspecified?: boolean   // true = no specific time (omit time from display)
  dueDate: string
  creditTowardFare: boolean
  refundable: CondRefundableType
  nonRefundable: boolean          // legacy — use refundable going forward
  remark: string
}

// ─── TTL Rule ─────────────────────────────────────────────────────────────────

export type CondTtlCalcType = 'TRAVEL_MINUS_DAYS' | 'CONFIRM_PLUS_DAYS' | 'MANUAL_DATE' | 'NOT_SET'

export interface CondTtlRule {
  calcType: CondTtlCalcType
  daysBefore: number
  time: string
  fixedDate: string
  remark: string
}

/** How name submission and ticket issuance are timed relative to each other */
export type CondIssuanceMode = 'SIMULTANEOUS' | 'SEPARATE'

// ─── Baggage Policy (Section 3) ───────────────────────────────────────────────

export type CondBaggageStatus = 'UNSPECIFIED' | 'INCLUDED' | 'NOT_INCLUDED'
export type CondBaggageType   = 'PC' | 'KG' | 'NONE'
export type CondBaggageAllowanceMode = 'SAME_WEIGHT_PER_PIECE' | 'TOTAL_WEIGHT' | 'CUSTOM_PER_PIECE' | 'TEXT_ONLY'
export type CondAncillaryYN   = 'UNSPECIFIED' | 'YES' | 'NO'

export interface CondBaggagePiece {
  pieceNo: number
  weight: number
  weightUnit: 'KG' | 'LB'
}

export interface CondBaggagePolicy {
  // Checked baggage
  checkedBagStatus: CondBaggageStatus
  baggageType: CondBaggageType
  pieceCount: number | null
  weightPerPiece: number | null
  totalWeight: number | null
  weightUnit: 'KG' | 'LB'
  // Carry-on
  carryOnStatus: CondBaggageStatus
  carryOnPieces: number | null
  carryOnWeight: number | null
  carryOnWeightUnit: 'KG' | 'LB'
  // Ancillaries
  canBuyExtraBaggage: CondAncillaryYN
  canBuySeat: CondAncillaryYN
  canBuyAfterTicketIssued: CondAncillaryYN
  ancillaryDetail: string
  // General remark
  remark: string
  // v2 — unified allowance mode
  checkedMode: CondBaggageAllowanceMode
  checkedPieceList: CondBaggagePiece[]
  checkedText: string
  carryOnMode: CondBaggageAllowanceMode
  carryOnTotalWeight: number | null
  carryOnPieceList: CondBaggagePiece[]
  carryOnText: string
}

// ─── Fee Type (shared for seat policies) ──────────────────────────────────────

export type CondFeeType = 'NONE' | 'FIXED' | 'PERCENT'

export const COND_FEE_TYPE_LABELS: Record<CondFeeType, string> = {
  NONE:    'ไม่มีค่าธรรมเนียม',
  FIXED:   'คงที่ (บาท/ที่นั่ง)',
  PERCENT: 'เปอร์เซ็นต์ของค่าตั๋ว (%)',
}

// ─── Seat Reduction Policy (Section 4) ────────────────────────────────────────

export type CondSeatReductionAllow  = 'ALLOW' | 'UNSPECIFIED'
export type CondSeatBasis           = 'INITIAL_SEAT' | 'REMAINING_SEAT'
export type CondSeatNoticeDaysBase  = 'DEPARTURE_DATE' | 'TICKET_ISSUE' | 'SEAT_CONFIRMED'
export type CondSeatReductionMode   = 'SINGLE' | 'STEP_RULE'
export type CondSeatRangeType       = 'FROM_DAY_UP' | 'BETWEEN' | 'UNTIL_DAY'
export type CondSingleOverLimit     = 'UNSPECIFIED' | 'NO_FORFEIT' | 'FORFEIT' | 'PENALTY' | 'REQUIRE_APPROVAL'
export type CondRuleOverLimitAction = 'UNSPECIFIED' | 'NO_FORFEIT' | 'FORFEIT' | 'PENALTY' | 'REQUIRE_APPROVAL'
export type CondForfeitSource       = 'DEPOSIT' | 'RSVN_FEE' | 'ALL'
export type CondStepPenaltyType     = 'NONE' | 'FIXED' | 'PERCENT' | 'FORFEIT_ALL'
export type CondStepCalcBase        = 'GROUP_PRICE' | 'FARE' | 'ALLIN' | 'NET_FARE' | 'DEPOSIT' | 'AMOUNT_PAID'

// ─── Cancel Group Policy ──────────────────────────────────────────────────────
export type CondCancelGroupPolicy       = 'UNSPECIFIED' | 'ALLOW' | 'NOT_ALLOW' | 'REQUIRE_APPROVAL'
export type CondCancelGroupDeadlineBase = 'DEPARTURE_DATE' | 'TICKET_ISSUE' | 'SEAT_CONFIRMED' | 'CUSTOM_DATE'
export type CondCancelGroupRefundable   = 'UNSPECIFIED' | 'NON_REFUNDABLE' | 'PARTIAL_REFUND' | 'FULL_REFUND'

export interface CondCancelGroupTerms {
  enabled: boolean
  policy: CondCancelGroupPolicy
  noticeDays: number | null
  deadlineBase: CondCancelGroupDeadlineBase
  deadlineCustomDate: string
  overLimitAction: CondSingleOverLimit
  forfeitSource: CondForfeitSource | null
  penaltyType: CondStepPenaltyType
  penaltyAmount: number | null
  penaltyPercent: number | null
  penaltyCurrency: string
  penaltyCalcBase: CondStepCalcBase
  refundable: CondCancelGroupRefundable
  remark: string
}

export interface CondSeatReductionRule {
  id: string
  rangeType: CondSeatRangeType
  fromDays: number | null
  toDays: number | null
  maxReducePercent: number | null
  ruleOverLimitAction: CondRuleOverLimitAction
  forfeitSource: CondForfeitSource | null  // when ruleOverLimitAction === 'FORFEIT'
  penaltyType: CondStepPenaltyType
  penaltyPercent: number | null
  penaltyAmount: number | null
  currency: string
  calcBase: CondStepCalcBase
  remark: string
}

export interface CondSeatReductionPolicy {
  enabled: boolean
  mode: CondSeatReductionMode
  allowReduction: CondSeatReductionAllow
  maxReducePercent: number | null
  basis: CondSeatBasis
  noticeDays: number | null
  noticeDaysBase: CondSeatNoticeDaysBase
  singleOverLimitAction: CondSingleOverLimit
  singleForfeitSource: CondForfeitSource | null  // SINGLE + FORFEIT only
  singlePenaltyType: CondStepPenaltyType
  singlePenaltyPercent: number | null
  singlePenaltyAmount: number | null
  singlePenaltyCurrency: string                  // SINGLE + PENALTY + FIXED
  singleCalcBase: CondStepCalcBase
  rules: CondSeatReductionRule[]
  remark: string
}

// ─── Seat Return Policy (Section 5 — kept for backward compat) ────────────────

export interface CondSeatReturnPolicy {
  allowed: boolean
  deadlineDays: number
  feeType: CondFeeType
  feeAmount: number
  feePercent: number
  note: string
}

// ─── Refund Policy (legacy — kept for backward compat) ────────────────────────

export type CondRefundType = 'FULL_REFUND' | 'PARTIAL_REFUND' | 'CONDITIONAL_REFUND' | 'NON_REFUNDABLE'

export const COND_REFUND_TYPE_LABELS: Record<CondRefundType, string> = {
  FULL_REFUND:        'คืนได้เต็มจำนวน',
  PARTIAL_REFUND:     'คืนได้บางส่วน',
  CONDITIONAL_REFUND: 'มีเงื่อนไขการคืน',
  NON_REFUNDABLE:     'คืนเงินไม่ได้',
}

export const COND_REFUND_TYPE_COLORS: Record<CondRefundType, string> = {
  FULL_REFUND:        'bg-green-100 text-green-700',
  PARTIAL_REFUND:     'bg-yellow-100 text-yellow-700',
  CONDITIONAL_REFUND: 'bg-blue-100 text-blue-700',
  NON_REFUNDABLE:     'bg-red-100 text-red-700',
}

export interface CondRefundTier {
  tierId: string
  seqNo: number
  name: string
  minDays: number | null
  maxDays: number | null
  refundPercent: number
  deductPercent: number
  remark: string
}

export interface CondRefundPolicy {
  enabled: boolean
  refundType: CondRefundType | null
  description: string
  tiers: CondRefundTier[]
}

// ─── Refund Terms (Section 5 combined — replaces seatReturnPolicy + refundPolicy in UI) ──

export type CondMainRefundPolicy    = 'NON_REFUNDABLE' | 'PARTIAL_REFUND' | 'FULL_REFUND' | 'STEP_RULE' | 'REQUIRE_APPROVAL'
export type CondAfterDeadlineAction = 'NON_REFUNDABLE' | 'FORFEIT' | 'PENALTY' | 'REQUIRE_APPROVAL' | 'STEP_RULE'
export type CondPreMoneyType        = 'RSVN_FEE' | 'DEPOSIT' | 'BALANCE' | 'FULL_PAYMENT' | 'OTHER'
export type CondPreRefundPolicy     = 'NON_REFUNDABLE' | 'FULL_REFUND' | 'PARTIAL_REFUND' | 'STEP_RULE' | 'NO_FORFEITURE'
export type CondPreStepRefundType   = 'FULL_REFUND' | 'PERCENT' | 'FIXED_AMOUNT' | 'NON_REFUNDABLE' | 'NO_FORFEITURE'
export type CondPostRefundFeeType   = 'NONE' | 'FIX' | 'PERCENT'
export type CondPostRefundFeeBase   = 'FARE' | 'TAX' | 'FUEL' | 'REFUNDABLE_AMOUNT' | 'TOTAL_PAID'
export type CondPostDeadlineType    = 'NONE' | 'BEFORE_TRAVEL' | 'AFTER_TRAVEL' | 'FIXED_DATE'

// ─── Refund Tab v2 types ────────────────────────────────────────────────────
export type CondPostRefundApplyAfter =
  'AFTER_NAME_SUBMIT' | 'AFTER_TICKETING' | 'AFTER_DEPOSIT' | 'AFTER_DEADLINE' | 'AFTER_FULL_PAYMENT'

export type CondPostRefundMainPolicy =
  'UNSPECIFIED' | 'NON_REFUNDABLE' | 'PARTIAL_REFUND' | 'FULL_REFUND'

export type CondRefundItem    = 'FARE' | 'TAX' | 'YQ' | 'YR' | 'DEPOSIT' | 'OTHER'
export type CondRefundFeeUnit = 'PER_SEAT' | 'PER_PNR' | 'PER_GROUP'
export type CondRefundPenaltyMode = 'NONE' | 'SINGLE' | 'STEP_RULE'

export type CondNameChangePolicy = 'UNSPECIFIED' | 'ALLOW' | 'NOT_ALLOW' | 'REQUIRE_APPROVAL'

export interface CondRefundPenaltyStepRule {
  id: string
  fromDaysBefore: number | null
  toDaysBefore: number | null
  penaltyType: 'PERCENT' | 'FIXED'
  penaltyValue: number | null
  penaltyBase: string
  currency: string
  remark: string
}

// ─── Utilization types ──────────────────────────────────────────────────────
export type CondUtilizationBase    = 'INITIAL_SEAT' | 'DEPOSIT_SEAT' | 'LATEST_SEAT'
export type CondUtilizationMeasure = 'CURRENT_TICKET' | 'ISSUED_TICKET'
export type CondUtilizationAction      = 'NO_PENALTY' | 'PENALTY' | 'FORFEIT_DEPOSIT'
export type CondUtilizationPenaltyType = 'AMOUNT_PER_MISSING' | 'PERCENT_GROUP' | 'PERCENT_DEPOSIT' | 'FULL_FORFEIT'
export type CondUtilizationForfeitType = 'FULL' | 'PER_MISSING_SEAT' | 'PAID_AMOUNT'

export interface CondUtilization {
  enabled: boolean
  requiredPercent: number | null
  calcBase: CondUtilizationBase
  measureBy: CondUtilizationMeasure
  exceedAction: CondUtilizationAction
  penaltyType: CondUtilizationPenaltyType
  penaltyAmount: number | null
  penaltyPercent: number | null
  penaltyCurrency: string
  forfeitType: CondUtilizationForfeitType
  remark: string
}

export const COND_PRE_MONEY_TYPE_LABELS: Record<CondPreMoneyType, string> = {
  RSVN_FEE:     'RSVN Fee',
  DEPOSIT:      'Deposit',
  BALANCE:      'Balance',
  FULL_PAYMENT: 'Full Payment',
  OTHER:        'Fee อื่น ๆ',
}

export const COND_PRE_REFUND_POLICY_LABELS: Record<CondPreRefundPolicy, string> = {
  NON_REFUNDABLE: 'คืนไม่ได้',
  FULL_REFUND:    'คืนได้ทั้งหมด',
  PARTIAL_REFUND: 'คืนได้บางส่วน',
  STEP_RULE:      'ตาม Step Rule',
  NO_FORFEITURE:  'ไม่ยึดเงิน',
}

export const ALL_PRE_MONEY_TYPES: CondPreMoneyType[] = ['RSVN_FEE', 'DEPOSIT', 'BALANCE', 'FULL_PAYMENT', 'OTHER']

export interface CondPreMoneyRule {
  moneyType: CondPreMoneyType
  refundPolicy: CondPreRefundPolicy
  refundPercent: number | null
  refundAmount: number | null
  forfeitPercent: number | null
  forfeitAmount: number | null
  currency: string
  remark: string
}

export interface CondPreStepRule {
  id: string
  fromDays: number | null   // upper bound; null = no upper limit
  toDays: number | null     // lower bound; null = 0
  appliesToMoneyTypes: CondPreMoneyType[]
  refundType: CondPreStepRefundType
  refundPercent: number | null
  refundAmount: number | null
  forfeitPercent: number | null
  forfeitAmount: number | null
  currency: string
  remark: string
}

export interface CondPreTicketRefund {
  enabled: boolean
  moneyTypeRules: CondPreMoneyRule[]
  rules: CondPreStepRule[]
}

export interface CondPostTicketRefund {
  enabled: boolean
  ticketRefundable: boolean
  refundFare: boolean
  refundTax: boolean
  refundFuel: boolean
  refundYQ: boolean
  refundYR: boolean
  refundFeeType: CondPostRefundFeeType
  refundFeeAmount: number | null
  refundFeePercent: number | null
  refundFeeBase: CondPostRefundFeeBase
  noShowRefund: boolean
  voidAllowed: boolean
  changeNameAfterNameSubmit: boolean
  changePassenger: boolean
  deadlineType: CondPostDeadlineType
  deadlineDays: number | null
  deadlineFixedDate: string
  remark: string
  // v2 fields — new redesigned UI
  applyAfter: CondPostRefundApplyAfter | null
  refundMainPolicy: CondPostRefundMainPolicy
  refundableItems: CondRefundItem[]
  nonRefundableItems: CondRefundItem[]
  refundFeeUnit: CondRefundFeeUnit
  refundFeeCurrency: string
  penaltyMode: CondRefundPenaltyMode
  penaltySingleType: 'PERCENT' | 'FIXED' | 'FULL_FORFEIT'
  penaltySingleValue: number | null
  penaltySingleBase: string
  penaltyStepRules: CondRefundPenaltyStepRule[]
  nameChangePolicy: CondNameChangePolicy
}

export interface CondRefundTerms {
  enabled: boolean
  mainPolicy: CondMainRefundPolicy | null
  noticeDaysBeforeTravel: number | null
  afterDeadlineAction: CondAfterDeadlineAction | null
  preTicket: CondPreTicketRefund
  postTicket: CondPostTicketRefund
  remark: string
  utilization: CondUtilization
}

// ─── § 1 Extended header types ───────────────────────────────────────────────

export type CondApplyScope = 'ALL' | 'ROUTE' | 'COUNTRY'

export const COND_APPLY_SCOPE_LABELS: Record<CondApplyScope, string> = {
  ALL:     'ใช้กับทุกเส้นทาง',
  ROUTE:   'ใช้กับเฉพาะ Route',
  COUNTRY: 'ใช้กับเฉพาะ Country',
}

export type ConditionType = 'Custom' | 'Template'

// ─── Core AppCondition — 7 sections ───────────────────────────────────────────

export interface AppCondition {
  // § 1 รายละเอียดหัว
  conditionId: string
  conditionCode: string
  conditionName: string
  description: string
  status: 'Active' | 'Inactive' | 'Draft'
  // § 1 Extended
  airline: string           // airline code e.g. 'TG'
  currency: string          // e.g. 'THB'
  conditionType: ConditionType
  applyScope: CondApplyScope
  applyRoutes: string[]     // free-form e.g. ['BKK-NRT', 'BKK-OSA']
  applyCountries: string[]  // country names e.g. ['Japan', 'South Korea']
  effectiveDate: string     // ISO date string or ''
  version: string           // human version e.g. 'V1', 'V2'

  // § 2 งวดชำระเงิน
  stages: CondStage[]
  ttlRule: CondTtlRule
  issuanceMode: CondIssuanceMode
  ticketDlRule: CondTtlRule

  // § 3 สัมภาระ
  baggagePolicy: CondBaggagePolicy

  // § 4 ลดที่นั่ง / ยกเลิกกรุ๊ป
  seatReductionPolicy: CondSeatReductionPolicy
  cancelGroupTerms: CondCancelGroupTerms

  // § 5 คืนที่นั่ง (legacy — kept for migration)
  seatReturnPolicy: CondSeatReturnPolicy

  // § 6 คืนตั๋ว (legacy — kept for migration)
  refundPolicy: CondRefundPolicy

  // § 5 (new) เงื่อนไขการคืน — combines old seatReturn + refund
  refundTerms: CondRefundTerms

  // § 6 เงื่อนไขเพิ่มเติม
  freeTextCondition: string   // plain text (synced from editor)
  freeTextHtml: string        // rich text HTML
  internalNote: string        // legacy — no longer shown in UI
}

// ─── Template Wrapper ─────────────────────────────────────────────────────────

export type CondTemplateType = 'PAYMENT' | 'BOOKING' | 'REFUND' | 'SEAT' | 'FULL' | 'OTHER'

export const COND_TEMPLATE_TYPE_LABELS: Record<CondTemplateType, string> = {
  PAYMENT: 'เงื่อนไขการชำระเงิน',
  BOOKING: 'เงื่อนไขการจอง',
  REFUND:  'นโยบายคืนเงิน',
  SEAT:    'เงื่อนไขการลดที่นั่ง',
  FULL:    'เงื่อนไขครบชุด',
  OTHER:   'อื่น ๆ',
}

export const COND_TEMPLATE_TYPE_SHORT: Record<CondTemplateType, string> = {
  PAYMENT: 'PMT',
  BOOKING: 'BKG',
  REFUND:  'RFD',
  SEAT:    'SEAT',
  FULL:    'FULL',
  OTHER:   'OTH',
}

export const COND_TEMPLATE_TYPE_COLORS: Record<CondTemplateType, string> = {
  PAYMENT: 'bg-blue-100 text-blue-700',
  BOOKING: 'bg-emerald-100 text-emerald-700',
  REFUND:  'bg-amber-100 text-amber-700',
  SEAT:    'bg-purple-100 text-purple-700',
  FULL:    'bg-green-100 text-green-700',
  OTHER:   'bg-slate-100 text-slate-600',
}

export type CondTemplateTicketType = 'Group' | 'FIT' | 'Ticket+Land' | 'All'

export interface AppConditionTemplate {
  templateId: string
  version: number
  createdAt: string
  updatedAt: string
  templateType: CondTemplateType
  airlineCode: string | null
  airlines: string[] | null
  ticketType: CondTemplateTicketType
  currency: string
  condition: AppCondition
}

// ─── Stock Condition Wrapper ──────────────────────────────────────────────────

export interface AppStockCondition {
  source: 'custom' | 'template'
  sourceTemplateId?: string
  sourceTemplateName?: string
  sourceTemplateVersion?: number
  appliedAt?: string
  locallyModified?: boolean
  condition: AppCondition
}

// ─── ID generators ────────────────────────────────────────────────────────────

const _id = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

export function newConditionId()  { return _id('CON') }
export function newStageId()      { return _id('STG') }
export function newRefundTierId() { return _id('RTR') }
export function newTemplateId()   { return _id('CTMPL') }

// ─── Default factories ────────────────────────────────────────────────────────

export function defaultCondStage(stageNo = 1): CondStage {
  return {
    stageId: newStageId(), stageNo,
    stageName: '', paymentType: '', customPaymentName: '',
    calcType: 'PER_SEAT', amount: 0, percent: 0, calcBase: null,
    quantityBasis: 'INITIAL_SEAT',
    dueType: 'TRAVEL_MINUS_DAYS', dueDays: 30, dueTime: '18:00', dueDate: '',
    creditTowardFare: false, refundable: 'UNSPECIFIED', nonRefundable: false,
    remark: '',
  }
}

export function defaultTtlRule(): CondTtlRule {
  return { calcType: 'TRAVEL_MINUS_DAYS', daysBefore: 30, time: '18:00', fixedDate: '', remark: '' }
}

export function defaultBaggagePolicy(): CondBaggagePolicy {
  return {
    checkedBagStatus: 'INCLUDED',
    baggageType: 'PC',
    pieceCount: 1,
    weightPerPiece: 0,
    totalWeight: null,
    weightUnit: 'KG',
    carryOnStatus: 'INCLUDED',
    carryOnPieces: 1,
    carryOnWeight: 7,
    carryOnWeightUnit: 'KG',
    canBuyExtraBaggage: 'UNSPECIFIED',
    canBuySeat: 'UNSPECIFIED',
    canBuyAfterTicketIssued: 'UNSPECIFIED',
    ancillaryDetail: '',
    remark: '',
    checkedMode: 'SAME_WEIGHT_PER_PIECE',
    checkedPieceList: [],
    checkedText: '',
    carryOnMode: 'SAME_WEIGHT_PER_PIECE',
    carryOnTotalWeight: null,
    carryOnPieceList: [],
    carryOnText: '',
  }
}

export function migrateBaggagePolicy(raw: any): CondBaggagePolicy {
  let base: any
  if (raw?.checkedBagStatus !== undefined) {
    base = raw
  } else {
    // Migrate legacy { enabled, checkedBagKg, checkedBagPieces, cabinBagKg, note }
    const enabled = raw?.enabled ?? false
    const hasPieces = raw?.checkedBagPieces != null
    base = {
      checkedBagStatus: enabled ? 'INCLUDED' : 'UNSPECIFIED',
      baggageType:      hasPieces ? 'PC' : (raw?.checkedBagKg != null ? 'KG' : 'PC'),
      pieceCount:       raw?.checkedBagPieces ?? null,
      weightPerPiece:   hasPieces ? (raw?.checkedBagKg ?? null) : null,
      totalWeight:      !hasPieces ? (raw?.checkedBagKg ?? null) : null,
      weightUnit:       'KG',
      carryOnStatus:    raw?.cabinBagKg != null ? 'INCLUDED' : 'UNSPECIFIED',
      carryOnPieces:    null,
      carryOnWeight:    raw?.cabinBagKg ?? null,
      carryOnWeightUnit:'KG',
      canBuyExtraBaggage: 'UNSPECIFIED',
      canBuySeat:         'UNSPECIFIED',
      canBuyAfterTicketIssued: 'UNSPECIFIED',
      ancillaryDetail:  '',
      remark:           raw?.note ?? '',
    }
  }
  const modeFromType = (bt: string): CondBaggageAllowanceMode =>
    bt === 'KG' ? 'TOTAL_WEIGHT' : 'SAME_WEIGHT_PER_PIECE'
  return {
    ...base,
    checkedMode:        base.checkedMode        ?? modeFromType(base.baggageType ?? 'PC'),
    checkedPieceList:   base.checkedPieceList   ?? [],
    checkedText:        base.checkedText        ?? '',
    carryOnMode:        base.carryOnMode        ?? 'SAME_WEIGHT_PER_PIECE',
    carryOnTotalWeight: base.carryOnTotalWeight ?? null,
    carryOnPieceList:   base.carryOnPieceList   ?? [],
    carryOnText:        base.carryOnText        ?? '',
  } as CondBaggagePolicy
}

export function formatBaggageSummary(bp: CondBaggagePolicy): string {
  const checkedPart = (): string => {
    if (bp.checkedBagStatus === 'NOT_INCLUDED') return 'ไม่รวมสัมภาระ'
    if (bp.checkedBagStatus === 'INCLUDED') {
      switch (bp.checkedMode) {
        case 'SAME_WEIGHT_PER_PIECE':
          if (bp.pieceCount && bp.weightPerPiece != null)
            return `โหลดใต้ท้องเครื่อง ${bp.pieceCount} ใบ น้ำหนักไม่เกิน ${bp.weightPerPiece} กก./ใบ`
          if (bp.pieceCount)
            return `โหลดใต้ท้องเครื่อง ${bp.pieceCount} ใบ`
          break
        case 'TOTAL_WEIGHT':
          if (bp.totalWeight)
            return `โหลดใต้ท้องเครื่อง${bp.pieceCount ? ` ${bp.pieceCount} ใบ` : ''} น้ำหนักรวมไม่เกิน ${bp.totalWeight} ${bp.weightUnit}`
          break
        case 'CUSTOM_PER_PIECE':
          if (bp.checkedPieceList.length)
            return `โหลดใต้ท้องเครื่อง ${bp.checkedPieceList.length} ใบ (${bp.checkedPieceList.map(p => `ใบที่ ${p.pieceNo}: ${p.weight} กก`).join(', ')})`
          break
        case 'TEXT_ONLY':
          return bp.checkedText.trim() ? `โหลดใต้ท้องเครื่อง: ${bp.checkedText.trim()}` : 'โหลดใต้ท้องเครื่อง (รอระบุรายละเอียด)'
      }
      return 'โหลดใต้ท้องเครื่อง (ยังไม่ครบ)'
    }
    return ''
  }
  const carryPart = (): string => {
    if (bp.carryOnStatus === 'NOT_INCLUDED') return 'ไม่รวมกระเป๋าถือขึ้นเครื่อง'
    if (bp.carryOnStatus === 'INCLUDED') {
      switch (bp.carryOnMode) {
        case 'SAME_WEIGHT_PER_PIECE':
          if (bp.carryOnPieces && bp.carryOnWeight != null)
            return `ถือขึ้นเครื่อง ${bp.carryOnPieces} ใบ น้ำหนักไม่เกิน ${bp.carryOnWeight} กก.`
          if (bp.carryOnPieces)
            return `ถือขึ้นเครื่อง ${bp.carryOnPieces} ใบ`
          break
        case 'TOTAL_WEIGHT':
          if (bp.carryOnTotalWeight)
            return `ถือขึ้นเครื่อง${bp.carryOnPieces ? ` ${bp.carryOnPieces} ใบ` : ''} น้ำหนักรวมไม่เกิน ${bp.carryOnTotalWeight} ${bp.carryOnWeightUnit}`
          break
        case 'CUSTOM_PER_PIECE':
          if (bp.carryOnPieceList.length)
            return `ถือขึ้นเครื่อง ${bp.carryOnPieceList.length} ใบ (${bp.carryOnPieceList.map(p => `ใบที่ ${p.pieceNo}: ${p.weight} กก`).join(', ')})`
          break
        case 'TEXT_ONLY':
          return bp.carryOnText.trim() ? `ถือขึ้นเครื่อง: ${bp.carryOnText.trim()}` : 'ถือขึ้นเครื่อง (รอระบุรายละเอียด)'
      }
      return 'ถือขึ้นเครื่อง (ยังไม่ครบ)'
    }
    return ''
  }
  const parts = [checkedPart(), carryPart()].filter(Boolean)
  return parts.join(' · ') || 'ยังไม่ระบุสัมภาระ'
}

export function newSeatReductionRuleId(): string { return _id('SRR') }

export function defaultSeatReductionRule(): CondSeatReductionRule {
  return {
    id: newSeatReductionRuleId(),
    rangeType: 'FROM_DAY_UP',
    fromDays: null, toDays: null,
    maxReducePercent: null,
    ruleOverLimitAction: 'UNSPECIFIED',
    forfeitSource: null,
    penaltyType: 'NONE',
    penaltyPercent: null, penaltyAmount: null,
    currency: 'THB',
    calcBase: 'GROUP_PRICE',
    remark: '',
  }
}

export function defaultCancelGroupTerms(): CondCancelGroupTerms {
  return {
    enabled: false,
    policy: 'UNSPECIFIED',
    noticeDays: null,
    deadlineBase: 'DEPARTURE_DATE',
    deadlineCustomDate: '',
    overLimitAction: 'UNSPECIFIED',
    forfeitSource: null,
    penaltyType: 'NONE',
    penaltyAmount: null,
    penaltyPercent: null,
    penaltyCurrency: '',
    penaltyCalcBase: 'GROUP_PRICE',
    refundable: 'UNSPECIFIED',
    remark: '',
  }
}

export function defaultSeatReductionPolicy(): CondSeatReductionPolicy {
  return {
    enabled: false,
    mode: 'SINGLE',
    allowReduction: 'UNSPECIFIED',
    maxReducePercent: null,
    basis: 'INITIAL_SEAT',
    noticeDays: null,
    noticeDaysBase: 'DEPARTURE_DATE',
    singleOverLimitAction: 'UNSPECIFIED',
    singleForfeitSource: null,
    singlePenaltyType: 'NONE',
    singlePenaltyPercent: null,
    singlePenaltyAmount: null,
    singlePenaltyCurrency: '',
    singleCalcBase: 'GROUP_PRICE',
    rules: [],
    remark: '',
  }
}

export function migrateSeatReductionPolicy(raw: any): CondSeatReductionPolicy {
  if (raw == null) return defaultSeatReductionPolicy()

  // New format detected — has `rules` array
  if (Array.isArray(raw.rules)) {
    const def = defaultSeatReductionPolicy()
    // Derive mode: prefer explicit mode; fall back to old overLimitAction
    const rawMode = raw.mode as string | undefined
    const oldOverLimit = raw.overLimitAction as string | undefined
    const mode: CondSeatReductionMode =
      rawMode === 'STEP_RULE' || rawMode === 'SINGLE' ? rawMode :
      oldOverLimit === 'STEP_RULE' ? 'STEP_RULE' : 'SINGLE'
    // Normalize singleOverLimitAction — accept all 5 valid values, preserve legacy NO_FORFEIT
    const rawSingle = raw.singleOverLimitAction as string | undefined
    const VALID_SINGLE: CondSingleOverLimit[] = ['UNSPECIFIED', 'NO_FORFEIT', 'FORFEIT', 'PENALTY', 'REQUIRE_APPROVAL']
    const singleOverLimitAction: CondSingleOverLimit =
      VALID_SINGLE.includes(rawSingle as CondSingleOverLimit) ? rawSingle as CondSingleOverLimit : 'NO_FORFEIT'
    // Normalize per-rule fields
    const VALID_RULE: CondRuleOverLimitAction[] = ['UNSPECIFIED', 'NO_FORFEIT', 'FORFEIT', 'PENALTY', 'REQUIRE_APPROVAL']
    const VALID_FORFEIT: CondForfeitSource[] = ['DEPOSIT', 'RSVN_FEE', 'ALL']
    const rules: CondSeatReductionRule[] = (raw.rules as any[]).map(r => {
      const rFrom = r.fromDays ?? null
      const rTo   = r.toDays   ?? null
      const rangeType: CondSeatRangeType =
        r.rangeType === 'FROM_DAY_UP' || r.rangeType === 'BETWEEN' || r.rangeType === 'UNTIL_DAY'
          ? r.rangeType
          : (rFrom !== null && rTo === null) ? 'FROM_DAY_UP'
          : (rFrom !== null && rTo !== null) ? 'BETWEEN'
          : 'UNTIL_DAY'
      return {
        ...defaultSeatReductionRule(), ...r,
        rangeType,
        maxReducePercent: r.maxReducePercent ?? null,
        ruleOverLimitAction: VALID_RULE.includes(r.ruleOverLimitAction as CondRuleOverLimitAction)
          ? r.ruleOverLimitAction as CondRuleOverLimitAction : 'NO_FORFEIT',
        forfeitSource: VALID_FORFEIT.includes(r.forfeitSource as CondForfeitSource)
          ? r.forfeitSource as CondForfeitSource : null,
      }
    })
    const rawPenType = raw.singlePenaltyType as string | undefined
    const singlePenaltyType: CondStepPenaltyType =
      rawPenType === 'FIXED' || rawPenType === 'PERCENT' || rawPenType === 'FORFEIT_ALL' ? rawPenType : 'NONE'
    return {
      ...def, ...raw,
      mode,
      allowReduction: raw.allowReduction === 'ALLOW' ? 'ALLOW' : 'UNSPECIFIED',
      basis: raw.basis === 'REMAINING_SEAT' ? 'REMAINING_SEAT' : 'INITIAL_SEAT',
      noticeDaysBase: (['DEPARTURE_DATE', 'TICKET_ISSUE', 'SEAT_CONFIRMED'] as CondSeatNoticeDaysBase[]).includes(raw.noticeDaysBase)
        ? raw.noticeDaysBase as CondSeatNoticeDaysBase : 'DEPARTURE_DATE',
      singleOverLimitAction,
      singleForfeitSource: VALID_FORFEIT.includes(raw.singleForfeitSource as CondForfeitSource)
        ? raw.singleForfeitSource as CondForfeitSource : null,
      singlePenaltyType,
      singlePenaltyPercent:  raw.singlePenaltyPercent  ?? null,
      singlePenaltyAmount:   raw.singlePenaltyAmount   ?? null,
      singlePenaltyCurrency: raw.singlePenaltyCurrency ?? '',
      singleCalcBase:        (raw.singleCalcBase as CondStepCalcBase | undefined) ?? 'GROUP_PRICE',
      rules,
    }
  }

  // Old format: { allowed, deadlineDays, feeType, feeAmount, feePercent, note }
  const oldAllowed: boolean = raw.allowed ?? false
  const oldFeeType: CondFeeType = raw.feeType ?? 'NONE'
  const rules: CondSeatReductionRule[] = []
  if (oldAllowed && oldFeeType !== 'NONE') {
    rules.push({
      ...defaultSeatReductionRule(),
      penaltyType: oldFeeType === 'FIXED' ? 'FIXED' : 'PERCENT',
      penaltyPercent: oldFeeType === 'PERCENT' ? (raw.feePercent ?? 0) : null,
      penaltyAmount:  oldFeeType === 'FIXED'   ? (raw.feeAmount ?? 0)  : null,
    })
  }
  return {
    ...defaultSeatReductionPolicy(),
    enabled: oldAllowed,
    mode: rules.length > 0 ? 'STEP_RULE' : 'SINGLE',
    allowReduction: oldAllowed ? 'ALLOW' : 'UNSPECIFIED',
    noticeDays: (raw.deadlineDays ?? 0) > 0 ? (raw.deadlineDays as number) : null,
    rules,
    remark: raw.note ?? '',
  }
}

export function formatSeatReductionSummary(sp: CondSeatReductionPolicy): string {
  if (!sp.enabled) return 'ลดที่นั่ง: ไม่ได้เปิดใช้งาน'
  const shortRemark = sp.remark?.trim()
    ? ' — ' + (sp.remark.trim().length > 80 ? sp.remark.trim().slice(0, 80) + '…' : sp.remark.trim())
    : ''

  if (sp.mode === 'STEP_RULE') {
    if (sp.rules.length === 0) return 'ลดที่นั่ง: อนุญาต · ใช้เงื่อนไข Step (ยังไม่มี Step)' + shortRemark
    const ruleShort = (r: CondSeatReductionRule): string => {
      const range =
        r.rangeType === 'FROM_DAY_UP' ? `${r.fromDays ?? '?'}+ วัน` :
        r.rangeType === 'UNTIL_DAY'   ? `≤${r.toDays ?? '?'} วัน` :
        `${r.fromDays ?? '?'}-${r.toDays ?? '?'} วัน`
      const pct = r.maxReducePercent != null ? ` ลด ${r.maxReducePercent}%` : ''
      const over =
        r.ruleOverLimitAction === 'FORFEIT'   ? ' ยึดเงิน' :
        r.ruleOverLimitAction === 'PENALTY'   ? ' คิดค่าปรับ' : ''
      return `${range}${pct}${over}`
    }
    const detail = sp.rules.map(ruleShort).join(' · ')
    return `ลดที่นั่ง: อนุญาต · ใช้เงื่อนไข Step ${sp.rules.length} ช่วง · ${detail}${shortRemark}`
  }
  const overLimitLabel: Record<CondSingleOverLimit, string> = {
    UNSPECIFIED: 'ยังไม่กำหนด', NO_FORFEIT: 'ไม่ยึดเงิน',
    FORFEIT: 'ยึดเงิน', PENALTY: 'คิดค่าปรับ', REQUIRE_APPROVAL: 'ต้องขออนุมัติ',
  }
  const parts: string[] = ['ลดที่นั่ง: อนุญาต']
  if (sp.maxReducePercent != null) parts.push(`ลดได้ ${sp.maxReducePercent}%`)
  if (sp.noticeDays != null) parts.push(`แจ้งลดไม่น้อยกว่า ${sp.noticeDays} วันก่อนเดินทาง`)
  parts.push(`เกินเงื่อนไข: ${overLimitLabel[sp.singleOverLimitAction]}`)
  if (sp.singleOverLimitAction === 'FORFEIT' && sp.singleForfeitSource) {
    const fl: Record<CondForfeitSource, string> = { DEPOSIT: 'Deposit', RSVN_FEE: 'RSVN Fee', ALL: 'ทั้งหมด' }
    parts.push(`(ยึด${fl[sp.singleForfeitSource]})`)
  }
  if (sp.singleOverLimitAction === 'PENALTY') {
    if (sp.singlePenaltyType === 'PERCENT' && sp.singlePenaltyPercent != null)
      parts.push(`ปรับ ${sp.singlePenaltyPercent}%`)
    else if (sp.singlePenaltyType === 'FIXED' && sp.singlePenaltyAmount != null)
      parts.push(`ปรับ ${sp.singlePenaltyAmount}`)
  }
  return parts.join(' · ') + shortRemark
}

export function defaultSeatReturnPolicy(): CondSeatReturnPolicy {
  return { allowed: false, deadlineDays: 30, feeType: 'NONE', feeAmount: 0, feePercent: 0, note: '' }
}

export function defaultRefundPolicy(): CondRefundPolicy {
  return { enabled: false, refundType: null, description: '', tiers: [] }
}

export function newPreStepRuleId(): string { return _id('PSR') }
export function newRefundPenaltyStepRuleId(): string { return _id('RPS') }

export function defaultUtilization(): CondUtilization {
  return {
    enabled: false, requiredPercent: null,
    calcBase: 'INITIAL_SEAT', measureBy: 'CURRENT_TICKET',
    exceedAction: 'NO_PENALTY', penaltyType: 'AMOUNT_PER_MISSING',
    penaltyAmount: null, penaltyPercent: null, penaltyCurrency: '',
    forfeitType: 'FULL', remark: '',
  }
}

export function defaultPreMoneyRules(): CondPreMoneyRule[] {
  const policies: Record<CondPreMoneyType, CondPreRefundPolicy> = {
    RSVN_FEE: 'NON_REFUNDABLE', DEPOSIT: 'STEP_RULE',
    BALANCE: 'FULL_REFUND', FULL_PAYMENT: 'STEP_RULE', OTHER: 'NON_REFUNDABLE',
  }
  return ALL_PRE_MONEY_TYPES.map(mt => ({
    moneyType: mt, refundPolicy: policies[mt],
    refundPercent: null, refundAmount: null,
    forfeitPercent: null, forfeitAmount: null,
    currency: 'THB', remark: '',
  }))
}

export function defaultPreTicketRefund(): CondPreTicketRefund {
  return { enabled: false, moneyTypeRules: defaultPreMoneyRules(), rules: [] }
}

export function defaultPostTicketRefund(): CondPostTicketRefund {
  return {
    enabled: false, ticketRefundable: false,
    refundFare: false, refundTax: false, refundFuel: false, refundYQ: false, refundYR: false,
    refundFeeType: 'NONE', refundFeeAmount: null, refundFeePercent: null, refundFeeBase: 'REFUNDABLE_AMOUNT',
    noShowRefund: false, voidAllowed: false,
    changeNameAfterNameSubmit: false, changePassenger: false,
    deadlineType: 'NONE', deadlineDays: null, deadlineFixedDate: '', remark: '',
    // v2 fields
    applyAfter: null, refundMainPolicy: 'UNSPECIFIED',
    refundableItems: [], nonRefundableItems: [],
    refundFeeUnit: 'PER_SEAT', refundFeeCurrency: '',
    penaltyMode: 'NONE', penaltySingleType: 'PERCENT',
    penaltySingleValue: null, penaltySingleBase: 'GROUP_PRICE', penaltyStepRules: [],
    nameChangePolicy: 'UNSPECIFIED',
  }
}

export function defaultRefundTerms(): CondRefundTerms {
  return {
    enabled: false, mainPolicy: null,
    noticeDaysBeforeTravel: null, afterDeadlineAction: null,
    preTicket: defaultPreTicketRefund(),
    postTicket: defaultPostTicketRefund(),
    remark: '', utilization: defaultUtilization(),
  }
}

export function migrateRefundTerms(raw: any): CondRefundTerms {
  if (raw == null) return defaultRefundTerms()
  const def = defaultRefundTerms()
  const merged = {
    ...def, ...raw,
    postTicket: { ...def.postTicket, ...(raw.postTicket ?? {}) },
    preTicket:  { ...def.preTicket,  ...(raw.preTicket  ?? {}) },
    utilization: { ...def.utilization, ...(raw.utilization ?? {}) },
  } as CondRefundTerms
  if ((merged.postTicket.refundMainPolicy as string) === 'CHECK_WITH_AIRLINE')
    merged.postTicket.refundMainPolicy = 'UNSPECIFIED'
  if ((merged.postTicket.refundMainPolicy as string) === 'ONLY_TAX_FUEL') {
    merged.postTicket.refundMainPolicy = 'PARTIAL_REFUND'
    if (merged.postTicket.refundableItems.length === 0)
      merged.postTicket.refundableItems = ['TAX', 'YQ']
    if (merged.postTicket.nonRefundableItems.length === 0)
      merged.postTicket.nonRefundableItems = ['FARE', 'YR']
  }
  // Migrate legacy FUEL → YQ in item lists
  const migrateFuel = (items: string[]) =>
    items.map(i => i === 'FUEL' ? 'YQ' : i) as CondRefundItem[]
  merged.postTicket.refundableItems    = migrateFuel(merged.postTicket.refundableItems)
  merged.postTicket.nonRefundableItems = migrateFuel(merged.postTicket.nonRefundableItems)
  const oldAction = merged.utilization.exceedAction as string
  if (oldAction === 'REQUIRE_APPROVAL' || oldAction === 'CHECK_AIRLINE') {
    merged.utilization.exceedAction = 'NO_PENALTY'
    if (!merged.utilization.remark) {
      merged.utilization.remark = oldAction === 'REQUIRE_APPROVAL'
        ? 'เดิม: ต้องขออนุมัติ'
        : 'เดิม: ตามเงื่อนไขสายการบิน'
    }
  }
  if ((merged.utilization.penaltyType as string) === 'CUSTOM') {
    merged.utilization.penaltyType = (merged.utilization.penaltyAmount != null && merged.utilization.penaltyAmount > 0)
      ? 'AMOUNT_PER_MISSING'
      : 'FULL_FORFEIT'
    if (!merged.utilization.remark)
      merged.utilization.remark = 'เดิม: กำหนดเอง'
  }
  if ((merged.utilization.measureBy as string) === 'ACTUAL_TRAVEL' ||
      (merged.utilization.measureBy as string) === 'NAME_SUBMITTED' ||
      (merged.utilization.measureBy as string) === 'FULLY_PAID')
    merged.utilization.measureBy = 'CURRENT_TICKET'
  if ((merged.utilization.calcBase as string) === 'CONFIRM_SEAT')
    merged.utilization.calcBase = 'INITIAL_SEAT'
  return merged
}

export function formatRefundTermsSummary(rt: CondRefundTerms, currency = 'THB'): string {
  if (!rt.enabled) return 'ยังไม่ตั้งค่า'
  const parts: string[] = []
  if (rt.postTicket.enabled) {
    const policyLabels: Record<CondPostRefundMainPolicy, string> = {
      UNSPECIFIED: 'ยังไม่ระบุเงื่อนไขการคืน', NON_REFUNDABLE: 'Refund ไม่ได้',
      PARTIAL_REFUND: 'Refund ได้บางส่วน', FULL_REFUND: 'Refund ได้ทั้งหมด',
    }
    const policy = policyLabels[rt.postTicket.refundMainPolicy] ?? 'ตั้งค่าแล้ว'
    const canRefund = rt.postTicket.refundableItems.slice(0, 4).join('/')
    let line = `คืน: ${policy}`
    if (rt.postTicket.refundMainPolicy === 'PARTIAL_REFUND' && canRefund) line += ` เฉพาะ ${canRefund}`
    parts.push(line)
  }
  if (rt.utilization.enabled) {
    const actionLabels: Record<CondUtilizationAction, string> = {
      NO_PENALTY: 'ไม่มีค่าปรับ', PENALTY: 'คิดค่าปรับ', FORFEIT_DEPOSIT: 'ยึดเงินมัดจำ',
    }
    const pct = rt.utilization.requiredPercent != null ? `${rt.utilization.requiredPercent}%` : 'ยังไม่ระบุ%'
    parts.push(`ใช้ที่นั่งขั้นต่ำ: ${pct} · ${actionLabels[rt.utilization.exceedAction]}`)
  }
  if (parts.length === 0 && rt.mainPolicy) {
    const labels: Record<CondMainRefundPolicy, string> = {
      NON_REFUNDABLE: 'คืนไม่ได้', PARTIAL_REFUND: 'คืนบางส่วน',
      FULL_REFUND: 'คืนทั้งหมด', STEP_RULE: 'Step Rule', REQUIRE_APPROVAL: 'ต้องขออนุมัติ',
    }
    return labels[rt.mainPolicy]
  }
  return parts.join(' · ') || 'เปิดใช้งาน'
}

export function defaultCondition(partial?: Partial<AppCondition>): AppCondition {
  return {
    conditionId:         newConditionId(),
    conditionCode:       '',
    conditionName:       '',
    description:         '',
    status:              'Active',
    airline:             '',
    currency:            'THB',
    conditionType:       'Custom',
    applyScope:          'ALL',
    applyRoutes:         [],
    applyCountries:      [],
    effectiveDate:       '',
    version:             'V1',
    stages:              [defaultCondStage(1)],
    ttlRule:             defaultTtlRule(),
    issuanceMode:        'SEPARATE',
    ticketDlRule:        defaultTtlRule(),
    baggagePolicy:       defaultBaggagePolicy(),
    seatReductionPolicy: defaultSeatReductionPolicy(),
    cancelGroupTerms:    defaultCancelGroupTerms(),
    seatReturnPolicy:    defaultSeatReturnPolicy(),
    refundPolicy:        defaultRefundPolicy(),
    refundTerms:         defaultRefundTerms(),
    freeTextCondition:   '',
    freeTextHtml:        '',
    internalNote:        '',
    ...partial,
  }
}

export function defaultTemplate(partial?: Partial<AppConditionTemplate>): AppConditionTemplate {
  const now = new Date().toISOString()
  return {
    templateId: newTemplateId(), version: 1, createdAt: now, updatedAt: now,
    templateType: 'PAYMENT', airlineCode: null, airlines: null,
    ticketType: 'All', currency: 'THB',
    condition: defaultCondition(),
    ...partial,
  }
}

// ─── Calculation helpers ──────────────────────────────────────────────────────

export function calcStageDueDate(
  stage: CondStage,
  travelStart: string,
  opts?: {
    seriesCreatedAt?: string
    prevStageDue?: string
    prevStagePaid?: string
    seatConfirmedDate?: string
    nameDeadline?: string
    ticketIssueDeadline?: string
  },
): string | null {
  const parseD = (s: string) => (s ? new Date(s) : null)
  const applyTime = (d: Date, t: string) => {
    const [h, m] = t.split(':').map(Number)
    d.setHours(h || 0, m || 0, 0, 0)
  }
  switch (stage.dueType) {
    case 'TRAVEL_MINUS_DAYS': {
      const d = parseD(travelStart); if (!d) return null
      d.setDate(d.getDate() - stage.dueDays); applyTime(d, stage.dueTime); return d.toISOString()
    }
    case 'SEAT_CONFIRMED_PLUS_DAYS': {
      // ถ้าไม่มีวันที่ Confirm ที่นั่ง → ห้ามคำนวณมั่ว → คืน null (แสดงสถานะ "รอวันที่ Confirm ที่นั่ง")
      const d = parseD(opts?.seatConfirmedDate ?? ''); if (!d) return null
      d.setDate(d.getDate() + stage.dueDays); applyTime(d, stage.dueTime); return d.toISOString()
    }
    case 'NAME_DEADLINE_MINUS_DAYS': {
      const d = parseD(opts?.nameDeadline ?? ''); if (!d) return null
      d.setDate(d.getDate() - stage.dueDays); applyTime(d, stage.dueTime); return d.toISOString()
    }
    case 'TICKET_ISSUE_MINUS_DAYS': {
      const d = parseD(opts?.ticketIssueDeadline ?? ''); if (!d) return null
      d.setDate(d.getDate() - stage.dueDays); applyTime(d, stage.dueTime); return d.toISOString()
    }
    case 'CREATED_PLUS_DAYS': {
      const d = parseD(opts?.seriesCreatedAt ?? new Date().toISOString()); if (!d) return null
      d.setDate(d.getDate() + stage.dueDays); applyTime(d, stage.dueTime); return d.toISOString()
    }
    case 'PREV_DUE_PLUS_DAYS': {
      const d = parseD(opts?.prevStageDue ?? ''); if (!d) return null
      d.setDate(d.getDate() + stage.dueDays); applyTime(d, stage.dueTime); return d.toISOString()
    }
    case 'PREV_PAID_PLUS_DAYS': {
      const d = parseD(opts?.prevStagePaid ?? ''); if (!d) return null
      d.setDate(d.getDate() + stage.dueDays); applyTime(d, stage.dueTime); return d.toISOString()
    }
    case 'CUSTOM_DATE': {
      const d = parseD(stage.dueDate); if (!d) return null
      applyTime(d, stage.dueTime); return d.toISOString()
    }
    default: return null
  }
}

export function calcCondTtlDate(rule: CondTtlRule, travelStart: string): string | null {
  if (rule.calcType === 'NOT_SET') return null
  const applyTime = (d: Date) => {
    const [h, m] = rule.time.split(':').map(Number)
    d.setHours(h || 0, m || 0, 0, 0)
  }
  if (rule.calcType === 'MANUAL_DATE') {
    if (!rule.fixedDate) return null
    const d = new Date(rule.fixedDate); applyTime(d); return d.toISOString()
  }
  if (!travelStart) return null
  const d = new Date(travelStart)
  d.setDate(d.getDate() - rule.daysBefore); applyTime(d); return d.toISOString()
}

export function calcStageAmount(
  stage: CondStage,
  ctx: { farePerPnr: number; netFarePerPnr?: number; allInPerPnr?: number; taxPerPnr: number; yqPerPnr?: number; seatCount: number },
): number {
  const seats = ctx.seatCount
  switch (stage.calcType) {
    case 'PER_SEAT':            return stage.amount * seats
    case 'FIXED_PER_PNR':      return stage.amount
    case 'FIXED_PER_SERIES':   return stage.amount
    case 'FIXED_AMOUNT':        return stage.amount
    case 'PERCENT_OF_FARE':     return Math.round((ctx.farePerPnr * stage.percent) / 100)
    case 'PERCENT_OF_NET_FARE': return Math.round(((ctx.netFarePerPnr ?? ctx.farePerPnr) * stage.percent) / 100)
    case 'PERCENT_OF_ALLIN':    return Math.round(((ctx.allInPerPnr ?? (ctx.farePerPnr + ctx.taxPerPnr)) * stage.percent) / 100)
    case 'PERCENT_OF_BASE': {
      const base =
        stage.calcBase === 'FARE'     ? ctx.farePerPnr :
        stage.calcBase === 'FARE_TAX' ? ctx.farePerPnr + ctx.taxPerPnr :
        stage.calcBase === 'FARE_YQ'  ? ctx.farePerPnr + (ctx.yqPerPnr ?? 0) :
                                        ctx.farePerPnr + ctx.taxPerPnr
      return Math.round((base * stage.percent) / 100)
    }
    default: return 0
  }
}

export function formatStageAmount(stage: CondStage, currency = 'THB'): string {
  switch (stage.calcType) {
    case 'PER_SEAT':            return `${stage.amount.toLocaleString()} ${currency}/Seat`
    case 'FIXED_PER_PNR':      return `${stage.amount.toLocaleString()} ${currency}/PNR`
    case 'FIXED_PER_SERIES':   return `${stage.amount.toLocaleString()} ${currency} (Series)`
    case 'FIXED_AMOUNT':        return `${stage.amount.toLocaleString()} ${currency} (Fix)`
    case 'PERCENT_OF_FARE':     return `${stage.percent}% จาก Fare`
    case 'PERCENT_OF_NET_FARE': return `${stage.percent}% จาก Net Fare`
    case 'PERCENT_OF_ALLIN':    return `${stage.percent}% จาก All-in`
    case 'REMAINING_BALANCE':   return 'ยอดคงเหลือ'
    case 'PERCENT_OF_BASE':     return `${stage.percent}% ของ ${COND_CALC_BASE_LABELS[stage.calcBase ?? 'FARE']}`
    default:                    return '—'
  }
}

export function formatTtlRule(rule: CondTtlRule): string {
  if (!rule || rule.calcType === 'NOT_SET') return 'ไม่ระบุ'
  if (rule.calcType === 'MANUAL_DATE') {
    if (!rule.fixedDate) return 'วันที่กำหนดเอง'
    const [y, m, d] = rule.fixedDate.split('-')
    return `${d}/${m}/${y} เวลา ${rule.time}`
  }
  return `ก่อนเดินทาง ${rule.daysBefore} วัน เวลา ${rule.time}`
}

export function autoStageName(type: CondPaymentType | '', custom: string, stageNo: number): string {
  if (type === 'OTHER') return custom || `งวดที่ ${stageNo}`
  if (type) return COND_PAYMENT_TYPE_LABELS[type] ?? `งวดที่ ${stageNo}`
  return `งวดที่ ${stageNo}`
}

export function generateTemplateCode(existing: string[] = []): string {
  for (let i = 1; i <= 999; i++) {
    const code = `CT${String(i).padStart(3, '0')}`
    if (!existing.includes(code)) return code
  }
  return `CT${Date.now()}`
}

export function generateConditionCode(existing: string[] = []): string {
  for (let i = 1; i <= 999; i++) {
    const code = `C${String(i).padStart(3, '0')}`
    if (!existing.includes(code)) return code
  }
  return `C${Date.now()}`
}
