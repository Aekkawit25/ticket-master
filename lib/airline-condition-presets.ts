/**
 * Airline Condition Presets
 * ─────────────────────────────────────────────────────────────────────────────
 * ค่าตั้งต้น (preset) ของเงื่อนไขการชำระเงิน + condition rules แยกตามสายการบิน
 *
 * แนวคิด: เมื่อผู้ใช้เลือกสายการบินใน Condition Template form ระบบจะเสนอ
 * payment stages และ condition rules มาตรฐานของสายการบินนั้นให้อัตโนมัติ
 * (auto-fill) แต่ทุกค่ายังแก้ไขต่อได้ — ไม่ใช่การ lock
 *
 * ไฟล์นี้เป็น "data/logic layer" ล้วน ไม่มี React/DOM — เรียกใช้ได้ทั้งฝั่ง
 * client และ server และ unit-test ได้ง่าย
 */

import type { PaymentType, ConditionStatus } from '@/types'
import {
  generateStageId,
  type DemoConditionTemplateStage,
  type TemplateAmountType,
  type CalculationType,
  type CalculationBase,
  type DueCalculationType,
  type TemplateTicketType,
} from '@/lib/template-storage'
import {
  emptyRule,
  type ConditionRule,
  type RuleType,
} from '@/lib/condition-rules'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * เมล็ดพันธุ์ของ payment stage — เก็บเฉพาะค่าที่ต่างจาก default
 * stageId / stageNo จะถูกสร้างตอน build เพื่อให้ไม่ชนกัน
 */
export interface StageSeed {
  stageName: string
  paymentType: PaymentType | ''
  /** v3 calc — ระบุวิธีคิดเงินหลัก */
  calculationType: CalculationType
  /** มูลค่า: จำนวนเงินคงที่ หรือ % (เมื่อ calculationType = PERCENT_OF_BASE) */
  amountValue: number
  /** ฐานคำนวณ — ใช้เมื่อ calculationType = PERCENT_OF_BASE */
  calculationBase?: CalculationBase | null
  /** วิธีคิดวันครบกำหนด (default: travel_minus_days) */
  dueCalculationType?: DueCalculationType
  /** จำนวนวัน offset (เช่น 14 = ก่อนเดินทาง 14 วัน) */
  dayOffset: number
  dueTime?: string
  creditTowardFare?: boolean
  refundable?: boolean
  remark?: string
}

/**
 * เมล็ดพันธุ์ของ condition rule — ใช้ emptyRule(type) เป็นฐาน
 * แล้ว merge overrides ทับ พร้อมตั้งชื่อ ruleName
 */
export interface RuleSeed {
  ruleType: RuleType
  ruleName: string
  /** ค่าที่จะ override ทับ default ของ emptyRule */
  overrides?: Record<string, unknown>
}

export interface AirlineConditionPreset {
  airlineCode: string
  airlineName: string
  /** ประเภท ticket ที่ preset นี้ออกแบบมาเพื่อ (default ของ template) */
  defaultTicketType: TemplateTicketType
  currency: string
  /** ชื่อ template ที่แนะนำ — ใช้เติมช่อง templateName ตอน apply */
  suggestedTemplateName: string
  description: string
  /** payment stages มาตรฐาน */
  stageSeeds: StageSeed[]
  /** condition rules มาตรฐาน (group booking) */
  ruleSeeds: RuleSeed[]
  /** หมายเหตุภายในเกี่ยวกับ policy ของสายการบินนี้ */
  internalNote: string
}

// ─── Stage seed builders ──────────────────────────────────────────────────────

/** มัดจำจำนวนเงินคงที่ต่อ Series */
function depositFixed(name: string, amount: number, dayOffset: number, remark = ''): StageSeed {
  return {
    stageName: name,
    paymentType: 'DEPOSIT',
    calculationType: 'FIXED_PER_SERIES',
    amountValue: amount,
    dueCalculationType: 'travel_minus_days',
    dayOffset,
    creditTowardFare: true,
    refundable: false,
    remark,
  }
}

/** ชำระส่วนที่เหลือ */
function balanceRemaining(name: string, dayOffset: number, remark = ''): StageSeed {
  return {
    stageName: name,
    paymentType: 'BALANCE',
    calculationType: 'REMAINING_BALANCE',
    amountValue: 0,
    dueCalculationType: 'travel_minus_days',
    dayOffset,
    creditTowardFare: true,
    refundable: false,
    remark,
  }
}

/** ชำระเต็มจำนวนครั้งเดียว */
function fullPayment(name: string, dayOffset: number, remark = ''): StageSeed {
  return {
    stageName: name,
    paymentType: 'FULL_PAYMENT',
    calculationType: 'REMAINING_BALANCE',
    amountValue: 0,
    dueCalculationType: 'travel_minus_days',
    dayOffset,
    creditTowardFare: true,
    refundable: false,
    remark,
  }
}

// ─── Preset registry ──────────────────────────────────────────────────────────

export const AIRLINE_CONDITION_PRESETS: Record<string, AirlineConditionPreset> = {
  TG: {
    airlineCode: 'TG',
    airlineName: 'Thai Airways International',
    defaultTicketType: 'Group',
    currency: 'THB',
    suggestedTemplateName: 'TG Group — มัดจำ + ชำระส่วนที่เหลือ',
    description: 'มัดจำ 5,000 บาท/Series แล้วชำระส่วนที่เหลือก่อนเดินทาง 14 วัน',
    stageSeeds: [
      depositFixed('งวดที่ 1 — มัดจำ', 5000, 30, 'มัดจำยืนยันกรุ๊ป'),
      balanceRemaining('งวดที่ 2 — ชำระส่วนที่เหลือ', 14),
    ],
    ruleSeeds: [
      {
        ruleType: 'CANCEL_RESIZE',
        ruleName: 'ลดที่นั่งได้ไม่เกิน 10%',
        overrides: { description: 'ลดจำนวนที่นั่งได้ไม่เกิน 10% ของจำนวนที่จองไว้ หากลดเกินจะถูกยึดมัดจำตามจำนวนที่นั่งที่เกิน' },
      },
      {
        ruleType: 'NAME_CHANGE',
        ruleName: 'ข้อห้ามเปลี่ยนชื่อผู้โดยสาร',
        overrides: { description: 'ต้องส่งรายชื่อผู้โดยสารครบถ้วนก่อนวันเดินทาง 21 วัน (ชื่อต้องตรงกับหนังสือเดินทาง) ไม่สามารถเปลี่ยนชื่อหลังส่งรายชื่อแล้ว' },
      },
      {
        ruleType: 'FORFEIT',
        ruleName: 'ยึดมัดจำกรณีลดที่นั่งเกิน',
        overrides: { description: 'หากลดจำนวนที่นั่งเกิน 10% จะถูกยึดมัดจำตามจำนวนที่นั่งที่ขาด' },
      },
    ],
    internalNote: 'TG: มัดจำไม่คืน หากลดที่นั่งเกิน allowance จะยึดมัดจำตามจำนวนที่นั่งที่ขาด',
  },

  VZ: {
    airlineCode: 'VZ',
    airlineName: 'Thai VietJet',
    defaultTicketType: 'Group',
    currency: 'THB',
    suggestedTemplateName: 'VZ Group — มัดจำ + ชำระส่วนที่เหลือ',
    description: 'มัดจำ 5,000 บาท ชำระส่วนที่เหลือก่อนเดินทาง 21 วัน',
    stageSeeds: [
      depositFixed('งวดที่ 1 — มัดจำ', 5000, 45),
      balanceRemaining('งวดที่ 2 — ชำระส่วนที่เหลือ', 21),
    ],
    ruleSeeds: [
      {
        ruleType: 'CANCEL_RESIZE',
        ruleName: 'ลดที่นั่งได้ไม่เกิน 15%',
        overrides: { description: 'ลดจำนวนที่นั่งได้ไม่เกิน 15% ของจำนวนที่จองไว้ หากลดเกินจะมีค่าปรับตามที่ตกลง' },
      },
      {
        ruleType: 'NAME_CHANGE',
        ruleName: 'ข้อห้ามเปลี่ยนชื่อผู้โดยสาร (LCC)',
        overrides: { description: 'ต้องส่งรายชื่อผู้โดยสารก่อนวันเดินทาง 30 วัน ค่าธรรมเนียมเปลี่ยนชื่อ/แก้ไขสูงมาก' },
      },
    ],
    internalNote: 'VZ: LCC — ค่าธรรมเนียมเปลี่ยนชื่อ/แก้ไขสูง ตรวจสอบ ancillary แยกต่างหาก',
  },

  FD: {
    airlineCode: 'FD',
    airlineName: 'Thai AirAsia',
    defaultTicketType: 'Group',
    currency: 'THB',
    suggestedTemplateName: 'FD Group — มัดจำ + ชำระส่วนที่เหลือ',
    description: 'มัดจำ 3,000 บาท ชำระส่วนที่เหลือก่อนเดินทาง 30 วัน',
    stageSeeds: [
      depositFixed('งวดที่ 1 — มัดจำ', 3000, 60),
      balanceRemaining('งวดที่ 2 — ชำระส่วนที่เหลือ', 30),
    ],
    ruleSeeds: [
      {
        ruleType: 'CANCEL_RESIZE',
        ruleName: 'ลดที่นั่งได้ไม่เกิน 10%',
        overrides: { description: 'ลดจำนวนที่นั่งได้ไม่เกิน 10% ของจำนวนที่จองไว้ หากลดเกินจะถูกยึดมัดจำตามจำนวนที่นั่งที่เกิน' },
      },
      {
        ruleType: 'NAME_CHANGE',
        ruleName: 'ข้อห้ามเปลี่ยนชื่อผู้โดยสาร (LCC)',
        overrides: { description: 'ต้องส่งรายชื่อผู้โดยสารก่อนวันเดินทาง 35 วัน ค่าธรรมเนียมเปลี่ยนชื่อสูง' },
      },
    ],
    internalNote: 'FD: LCC — มัดจำต่ำ แต่ deadline ยาว ตรวจสอบ baggage/ancillary',
  },

  SQ: {
    airlineCode: 'SQ',
    airlineName: 'Singapore Airlines',
    defaultTicketType: 'Group',
    currency: 'THB',
    suggestedTemplateName: 'SQ Group — มัดจำ + ชำระส่วนที่เหลือ',
    description: 'มัดจำ 8,000 บาท ชำระส่วนที่เหลือก่อนเดินทาง 21 วัน',
    stageSeeds: [
      depositFixed('งวดที่ 1 — มัดจำ', 8000, 45),
      balanceRemaining('งวดที่ 2 — ชำระส่วนที่เหลือ', 21),
    ],
    ruleSeeds: [
      {
        ruleType: 'NAME_CHANGE',
        ruleName: 'ข้อห้ามเปลี่ยนชื่อผู้โดยสาร',
        overrides: { description: 'ต้องส่งรายชื่อผู้โดยสารครบถ้วนก่อนวันเดินทาง 28 วัน (ชื่อต้องตรงกับหนังสือเดินทาง) ไม่สามารถเปลี่ยนชื่อหลังส่งแล้ว' },
      },
      {
        ruleType: 'NON_REFUNDABLE',
        ruleName: 'ตั๋ว Non-refundable',
        overrides: { description: 'ต้องออกตั๋วขั้นต่ำ 100% ของจำนวนที่นั่งที่มัดจำไว้ ภายใน 21 วันก่อนวันเดินทาง ค่าโดยสารไม่คืนเงิน' },
      },
    ],
    internalNote: 'SQ: Full-service — มัดจำสูง, เงื่อนไขเข้มงวด ออกตั๋วเต็มจำนวนที่นั่งที่มัดจำ',
  },

  SL: {
    airlineCode: 'SL',
    airlineName: 'Thai Lion Air',
    defaultTicketType: 'Group',
    currency: 'THB',
    suggestedTemplateName: 'SL Group — มัดจำ + ชำระส่วนที่เหลือ',
    description: 'มัดจำ 3,000 บาท ชำระส่วนที่เหลือก่อนเดินทาง 21 วัน',
    stageSeeds: [
      depositFixed('งวดที่ 1 — มัดจำ', 3000, 45),
      balanceRemaining('งวดที่ 2 — ชำระส่วนที่เหลือ', 21),
    ],
    ruleSeeds: [
      {
        ruleType: 'NAME_CHANGE',
        ruleName: 'ข้อห้ามเปลี่ยนชื่อผู้โดยสาร',
        overrides: { description: 'ต้องส่งรายชื่อผู้โดยสารก่อนวันเดินทาง 30 วัน ไม่สามารถเปลี่ยนชื่อหลังส่งแล้ว' },
      },
    ],
    internalNote: 'SL: LCC — ตรวจสอบ ancillary/baggage แยก',
  },

  PG: {
    airlineCode: 'PG',
    airlineName: 'Bangkok Airways',
    defaultTicketType: 'Group',
    currency: 'THB',
    suggestedTemplateName: 'PG Group — มัดจำ + ชำระส่วนที่เหลือ',
    description: 'มัดจำ 5,000 บาท ชำระส่วนที่เหลือก่อนเดินทาง 21 วัน',
    stageSeeds: [
      depositFixed('งวดที่ 1 — มัดจำ', 5000, 45),
      balanceRemaining('งวดที่ 2 — ชำระส่วนที่เหลือ', 21),
    ],
    ruleSeeds: [
      {
        ruleType: 'NAME_CHANGE',
        ruleName: 'ข้อห้ามเปลี่ยนชื่อผู้โดยสาร',
        overrides: { description: 'ต้องส่งรายชื่อผู้โดยสารก่อนวันเดินทาง 25 วัน ไม่สามารถเปลี่ยนชื่อหลังส่งแล้ว' },
      },
    ],
    internalNote: 'PG: Full-service ภูมิภาค — เงื่อนไขปานกลาง',
  },
}

// ─── Helper functions ─────────────────────────────────────────────────────────

/**
 * คืน preset *ค่าตั้งต้น* ของสายการบิน (case-insensitive) หรือ null ถ้าไม่มี
 * หมายเหตุ: อ่านจาก built-in defaults เท่านั้น — ถ้าต้องการรวม preset ที่ผู้ใช้
 * แก้/เพิ่มเอง ให้ใช้ getAirlinePreset ใน lib/airline-preset-storage.ts
 */
export function getDefaultAirlinePreset(airlineCode: string | null | undefined): AirlineConditionPreset | null {
  if (!airlineCode) return null
  return AIRLINE_CONDITION_PRESETS[airlineCode.toUpperCase()] ?? null
}

/** @deprecated ใช้ getDefaultAirlinePreset — คงไว้เพื่อ backward-compat */
export const getAirlinePreset = getDefaultAirlinePreset

/** resolve แหล่งข้อมูล: รับได้ทั้ง preset object หรือ code (ค่าตั้งต้น) */
function resolvePreset(
  source: AirlineConditionPreset | string | null | undefined,
): AirlineConditionPreset | null {
  if (!source) return null
  if (typeof source === 'string') return getDefaultAirlinePreset(source)
  return source
}

/** มี preset ค่าตั้งต้นสำหรับสายการบินนี้หรือไม่ */
export function hasAirlinePreset(airlineCode: string | null | undefined): boolean {
  return getDefaultAirlinePreset(airlineCode) !== null
}

/** รายชื่อรหัสสายการบินทั้งหมดที่มี preset */
export function listAirlinesWithPreset(): string[] {
  return Object.keys(AIRLINE_CONDITION_PRESETS).sort()
}

/**
 * แปลง stageSeeds → DemoConditionTemplateStage[] พร้อม id และ stageNo จริง
 * เติม legacy fields (amountType/percentBase/rsvnFeeMode) ให้สอดคล้องกับ
 * calculationType เพื่อ backward-compat
 */
export function buildStagesFromPreset(
  source: AirlineConditionPreset | string | null | undefined,
): DemoConditionTemplateStage[] {
  const preset = resolvePreset(source)
  if (!preset) return []
  return preset.stageSeeds.map((seed, i) => seedToStage(seed, i + 1))
}

/** map calculationType → legacy amountType (เพื่อ backward-compat) */
function legacyAmountType(calc: CalculationType): TemplateAmountType {
  switch (calc) {
    case 'REMAINING_BALANCE': return 'Remaining'
    case 'PERCENT_OF_BASE':   return 'Percent'
    case 'PER_SEAT':          return 'PER_SEAT_FIXED'
    case 'FIXED_PER_PNR':     return 'PER_PNR'
    case 'FIXED_PER_SERIES':  return 'PER_SERIES'
    case 'NOT_SPECIFIED':     return 'FIXED_TOTAL'
    default:                  return 'FIXED_TOTAL'
  }
}

function seedToStage(seed: StageSeed, stageNo: number): DemoConditionTemplateStage {
  const status: ConditionStatus = 'Active'
  return {
    stageId: generateStageId(),
    stageNo,
    stageName: seed.stageName,
    paymentType: seed.paymentType,
    customPaymentName: null,
    // v3
    calculationType: seed.calculationType,
    percentValue: seed.calculationType === 'PERCENT_OF_BASE' ? seed.amountValue : 0,
    calculationBase: seed.calculationBase ?? null,
    pricingPending: seed.calculationType === 'NOT_SPECIFIED',
    // legacy
    rsvnFeeMode: null,
    amountType: legacyAmountType(seed.calculationType),
    amountValue: seed.amountValue,
    percentBase: 'TOTAL_AMOUNT',
    dueCalculationType: seed.dueCalculationType ?? 'travel_minus_days',
    dayOffset: seed.dayOffset,
    dueTime: seed.dueTime ?? '18:00',
    dueCustomDate: null,
    creditTowardFare: seed.creditTowardFare ?? true,
    refundable: seed.refundable ?? false,
    autoCalculate: false,
    remark: seed.remark ?? '',
    status,
  }
}

/**
 * แปลง ruleSeeds → ConditionRule[] พร้อม id จริง
 * ใช้ emptyRule(type) เป็นฐาน แล้ว merge overrides + ruleName
 */
export function buildRulesFromPreset(
  source: AirlineConditionPreset | string | null | undefined,
): ConditionRule[] {
  const preset = resolvePreset(source)
  if (!preset) return []
  return preset.ruleSeeds.map((seed, i) => {
    const base = emptyRule(seed.ruleType, i)
    return {
      ...base,
      ...(seed.overrides ?? {}),
      ruleName: seed.ruleName,
      sortOrder: i,
    } as ConditionRule
  })
}

/**
 * ผลลัพธ์จากการเตรียม preset — นำไป merge เข้า template ที่ form ถืออยู่
 */
export interface AppliedPreset {
  airlineCode: string
  airlines: string[]
  ticketType: TemplateTicketType
  currency: string
  suggestedTemplateName: string
  description: string
  internalNote: string
  stages: DemoConditionTemplateStage[]
  rules: ConditionRule[]
}

/**
 * สร้างชุดข้อมูล preset พร้อม id จริง สำหรับนำไปเติมลงใน form
 * คืน null ถ้าไม่มี preset ของสายการบินนั้น
 *
 * หมายเหตุ: ฟังก์ชันนี้ไม่ mutate template เดิม — แค่คืนค่าที่ caller
 * จะเลือก merge เอง (เช่น ทับ stages ทั้งหมด หรือต่อท้าย)
 */
export function applyAirlinePreset(
  source: AirlineConditionPreset | string | null | undefined,
): AppliedPreset | null {
  const preset = resolvePreset(source)
  if (!preset) return null
  return {
    airlineCode: preset.airlineCode,
    airlines: [preset.airlineCode],
    ticketType: preset.defaultTicketType,
    currency: preset.currency,
    suggestedTemplateName: preset.suggestedTemplateName,
    description: preset.description,
    internalNote: preset.internalNote,
    stages: buildStagesFromPreset(preset),
    rules: buildRulesFromPreset(preset),
  }
}
