/**
 * Condition Template Storage
 * Replaces lib/template-storage.ts for condition data.
 * Storage key: 'app_condition_templates' (new, separate from old key).
 */

import {
  type AppConditionTemplate, type AppCondition, type CondCalcType, type CondDueType, type CondTtlCalcType, type CondRefundableType, type CondCancelGroupTerms,
  defaultTemplate,
  newTemplateId,
  generateTemplateCode,
  defaultCondition,
  defaultTtlRule,
  defaultRefundPolicy,
  defaultBaggagePolicy,
  migrateBaggagePolicy,
  defaultSeatReductionPolicy,
  migrateSeatReductionPolicy,
  defaultSeatReturnPolicy,
  migrateRefundTerms,
  defaultCancelGroupTerms,
} from '@/lib/condition-schema'

const STORAGE_KEY = 'app_condition_templates'

function migrateCalcType(ct: string | undefined): CondCalcType {
  switch (ct) {
    case 'PER_SEAT': case 'FIXED_PER_PNR': case 'FIXED_PER_SERIES': return ct
    case 'FIXED_AMOUNT': return 'FIXED_PER_SERIES'
    default: return 'PER_SEAT'
  }
}

function migrateDueType(dt: string | undefined): CondDueType {
  if (dt === 'CUSTOM_DATE') return 'CUSTOM_DATE'
  return 'TRAVEL_MINUS_DAYS'
}

function migrateTtlCalcType(ct: string | undefined): CondTtlCalcType {
  if (ct === 'MANUAL_DATE') return 'MANUAL_DATE'
  return 'TRAVEL_MINUS_DAYS'
}

function migrateRefundable(r: string | undefined): CondRefundableType {
  if (r === 'REFUNDABLE' || r === 'NON_REFUNDABLE') return r
  return 'UNSPECIFIED'
}

// Fill missing fields for conditions stored before schema revisions
function migrateCancelGroupTerms(raw: any): CondCancelGroupTerms {
  if (raw == null) return defaultCancelGroupTerms()
  const def = defaultCancelGroupTerms()
  const VALID_POLICY = ['UNSPECIFIED', 'ALLOW', 'NOT_ALLOW', 'REQUIRE_APPROVAL']
  const VALID_BASE   = ['DEPARTURE_DATE', 'TICKET_ISSUE', 'SEAT_CONFIRMED', 'CUSTOM_DATE']
  const VALID_OVER   = ['UNSPECIFIED', 'NO_FORFEIT', 'FORFEIT', 'PENALTY', 'REQUIRE_APPROVAL']
  const VALID_FORFEIT= ['DEPOSIT', 'RSVN_FEE', 'ALL']
  const VALID_PEN    = ['NONE', 'FIXED', 'PERCENT', 'FORFEIT_ALL']
  const VALID_CALC   = ['GROUP_PRICE', 'FARE', 'ALLIN', 'NET_FARE', 'DEPOSIT', 'AMOUNT_PAID']
  const VALID_REF    = ['UNSPECIFIED', 'NON_REFUNDABLE', 'PARTIAL_REFUND', 'FULL_REFUND']
  return {
    ...def, ...raw,
    policy:             VALID_POLICY.includes(raw.policy)           ? raw.policy   : 'UNSPECIFIED',
    deadlineBase:       VALID_BASE.includes(raw.deadlineBase)       ? raw.deadlineBase : 'DEPARTURE_DATE',
    overLimitAction:    VALID_OVER.includes(raw.overLimitAction)    ? raw.overLimitAction : 'UNSPECIFIED',
    forfeitSource:      VALID_FORFEIT.includes(raw.forfeitSource)   ? raw.forfeitSource   : null,
    penaltyType:        VALID_PEN.includes(raw.penaltyType)         ? raw.penaltyType     : 'NONE',
    penaltyCalcBase:    VALID_CALC.includes(raw.penaltyCalcBase)    ? raw.penaltyCalcBase : 'GROUP_PRICE',
    refundable:         VALID_REF.includes(raw.refundable)          ? raw.refundable      : 'UNSPECIFIED',
  }
}

function ensureNewPolicies(cond: AppCondition): AppCondition {
  return {
    ...cond,
    stages: cond.stages.map(s => ({ ...s, calcType: migrateCalcType((s as any).calcType), dueType: migrateDueType((s as any).dueType), refundable: migrateRefundable((s as any).refundable) })),
    ttlRule: { ...(cond.ttlRule ?? defaultTtlRule()), calcType: migrateTtlCalcType((cond.ttlRule as any)?.calcType) },
    issuanceMode: (cond as any).issuanceMode ?? 'SEPARATE',
    ticketDlRule: { ...((cond as any).ticketDlRule ?? defaultTtlRule()), calcType: migrateTtlCalcType((cond as any).ticketDlRule?.calcType) },
    // § 1 Extended — added 2026-07
    airline:             (cond as any).airline          ?? '',
    currency:            (cond as any).currency         ?? 'THB',
    conditionType:       (cond as any).conditionType    ?? 'Custom',
    applyScope:          (cond as any).applyScope       ?? 'ALL',
    applyRoutes:         (cond as any).applyRoutes      ?? [],
    applyCountries:      (cond as any).applyCountries   ?? [],
    effectiveDate:       (cond as any).effectiveDate    ?? '',
    version:             (cond as any).version          ?? 'V1',
    // Policies
    baggagePolicy:       migrateBaggagePolicy((cond as any).baggagePolicy ?? null) ?? defaultBaggagePolicy(),
    seatReductionPolicy: migrateSeatReductionPolicy((cond as any).seatReductionPolicy ?? null),
    cancelGroupTerms:    migrateCancelGroupTerms((cond as any).cancelGroupTerms ?? null),
    seatReturnPolicy:    cond.seatReturnPolicy     ?? defaultSeatReturnPolicy(),
    refundPolicy:        cond.refundPolicy         ?? defaultRefundPolicy(),
    refundTerms:         migrateRefundTerms((cond as any).refundTerms ?? null),
    freeTextCondition:   cond.freeTextCondition    ?? '',
    freeTextHtml:        (cond as any).freeTextHtml ?? '',
    internalNote:        cond.internalNote         ?? '',
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function getConditionTemplates(): AppConditionTemplate[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AppConditionTemplate[]
    return parsed.map(t => ({ ...t, condition: ensureNewPolicies(t.condition) }))
  } catch {
    return []
  }
}

export function getConditionTemplateById(id: string): AppConditionTemplate | null {
  return getConditionTemplates().find(t => t.templateId === id) ?? null
}

export function saveConditionTemplate(template: AppConditionTemplate): void {
  if (typeof window === 'undefined') return
  const all = getConditionTemplates()
  const idx = all.findIndex(t => t.templateId === template.templateId)
  if (idx >= 0) {
    all[idx] = template
  } else {
    all.unshift(template)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function deleteConditionTemplate(id: string): void {
  if (typeof window === 'undefined') return
  const all = getConditionTemplates().filter(t => t.templateId !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function duplicateConditionTemplate(id: string): AppConditionTemplate | null {
  const src = getConditionTemplateById(id)
  if (!src) return null
  const now = new Date().toISOString()
  const existing = getConditionTemplates().map(t => t.condition.conditionCode)
  const dup: AppConditionTemplate = {
    ...src,
    templateId: newTemplateId(),
    version: 1,
    createdAt: now,
    updatedAt: now,
    condition: {
      ...src.condition,
      conditionId:   `CON-${Date.now()}-copy`,
      conditionCode: generateTemplateCode(existing),
      conditionName: src.condition.conditionName + ' (Copy)',
      stages:        src.condition.stages.map(s => ({ ...s, stageId: `STG-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` })),
    },
  }
  saveConditionTemplate(dup)
  return dup
}

export function toggleConditionTemplateStatus(id: string): void {
  const t = getConditionTemplateById(id)
  if (!t) return
  const updated: AppConditionTemplate = {
    ...t,
    condition: {
      ...t.condition,
      status: t.condition.status === 'Active' ? 'Inactive' : 'Active',
    },
    updatedAt: new Date().toISOString(),
  }
  saveConditionTemplate(updated)
}

// ─── Template → Stock Condition snapshot ─────────────────────────────────────

export function snapshotTemplateToCondition(template: AppConditionTemplate) {
  return {
    source: 'template' as const,
    sourceTemplateId:       template.templateId,
    sourceTemplateName:     template.condition.conditionName,
    sourceTemplateVersion:  template.version,
    appliedAt:              new Date().toISOString(),
    locallyModified:        false,
    condition: {
      ...template.condition,
      // New conditionId for the stock copy (template ID stays in sourceTemplateId)
      conditionId: `CON-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    },
  }
}

// ─── Seed (optional demo data) ────────────────────────────────────────────────

const SEEDED_KEY = 'app_condition_templates_seeded'

export function seedTemplatesIfEmpty(): void {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(SEEDED_KEY)) return
  const existing = getConditionTemplates()
  if (existing.length > 0) { localStorage.setItem(SEEDED_KEY, '1'); return }

  const now = new Date().toISOString()
  const seeds: AppConditionTemplate[] = [
    {
      templateId:   'CTMPL-DEMO-001',
      version:      1,
      createdAt:    now,
      updatedAt:    now,
      templateType: 'PAYMENT',
      airlineCode:  'TG',
      airlines:     ['TG'],
      ticketType:   'Group',
      currency:     'THB',
      condition: {
        ...defaultCondition(),
        conditionId:   'CON-DEMO-001',
        conditionCode: 'CT001',
        conditionName: 'ชำระ 2 งวด (มัดจำ + Balance)',
        description:   'มัดจำ 5,000 บาท/PNR ก่อนเดินทาง 60 วัน และชำระยอดคงเหลือ 30 วัน',
        status:        'Active',
        stages: [
          {
            stageId:          'STG-DEMO-001-1',
            stageNo:          1,
            stageName:        'มัดจำ',
            paymentType:      'DEPOSIT',
            customPaymentName:'',
            calcType:         'FIXED_PER_PNR',
            amount:           5000,
            percent:          0,
            calcBase:         null,
            quantityBasis:    'REMAINING_SEAT',
            dueType:          'TRAVEL_MINUS_DAYS',
            dueDays:          60,
            dueTime:          '18:00',
            dueDate:          '',
            creditTowardFare: true,
            refundable:       'AS_SEAT_RETURN',
            nonRefundable:    false,
            remark:           '',
          },
          {
            stageId:          'STG-DEMO-001-2',
            stageNo:          2,
            stageName:        'ชำระยอดคงเหลือ',
            paymentType:      'BALANCE',
            customPaymentName:'',
            calcType:         'REMAINING_BALANCE',
            amount:           0,
            percent:          0,
            calcBase:         null,
            quantityBasis:    'ACTUAL_ISSUED',
            dueType:          'TRAVEL_MINUS_DAYS',
            dueDays:          30,
            dueTime:          '18:00',
            dueDate:          '',
            creditTowardFare: true,
            refundable:       'AS_SEAT_RETURN',
            nonRefundable:    false,
            remark:           '',
          },
        ],
        ttlRule: {
          calcType:   'TRAVEL_MINUS_DAYS',
          daysBefore: 21,
          time:       '18:00',
          fixedDate:  '',
          remark:     '',
        },
        refundPolicy: defaultRefundPolicy(),
      },
    },
    {
      templateId:   'CTMPL-DEMO-002',
      version:      1,
      createdAt:    now,
      updatedAt:    now,
      templateType: 'PAYMENT',
      airlineCode:  null,
      airlines:     null,
      ticketType:   'All',
      currency:     'THB',
      condition: {
        ...defaultCondition(),
        conditionId:   'CON-DEMO-002',
        conditionCode: 'CT002',
        conditionName: 'ชำระเต็มจำนวน',
        description:   'ชำระเต็มจำนวนก่อนเดินทาง 45 วัน',
        status:        'Active',
        stages: [
          {
            stageId:          'STG-DEMO-002-1',
            stageNo:          1,
            stageName:        'ชำระเต็มจำนวน',
            paymentType:      'FULL_PAYMENT',
            customPaymentName:'',
            calcType:         'PER_SEAT',
            amount:           0,
            percent:          0,
            calcBase:         null,
            quantityBasis:    'ACTUAL_ISSUED',
            dueType:          'TRAVEL_MINUS_DAYS',
            dueDays:          45,
            dueTime:          '18:00',
            dueDate:          '',
            creditTowardFare: true,
            refundable:       'REFUNDABLE',
            nonRefundable:    false,
            remark:           '',
          },
        ],
        ttlRule: {
          calcType:   'TRAVEL_MINUS_DAYS',
          daysBefore: 30,
          time:       '18:00',
          fixedDate:  '',
          remark:     '',
        },
        refundPolicy: {
          enabled:     true,
          refundType:  'NON_REFUNDABLE',
          description: 'ไม่สามารถคืนเงินได้หลังจากชำระแล้ว',
          tiers:       [],
        },
      },
    },
  ]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds))
  localStorage.setItem(SEEDED_KEY, '1')
}
