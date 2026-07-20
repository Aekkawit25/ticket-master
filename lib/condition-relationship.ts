/**
 * lib/condition-relationship.ts
 * Single-source-of-truth for all Condition relationship logic.
 *
 * Used by: Template list, Template detail, Series ConditionsTab,
 * PNR detail, Dashboard, Export Excel, and API routes.
 * All pages MUST derive relationship data from this module —
 * never compute it in-component.
 */

import type { AppConditionTemplate, AppStockCondition, AppCondition } from './condition-schema'
import type { DemoStock, DemoPNR } from './demo-storage'
import { formatStageAmount, formatBaggageSummary, formatTtlRule } from './condition-schema'

// ─── Status types ─────────────────────────────────────────────────────────────

/**
 * Relationship status of a Series condition snapshot vs its source template.
 *
 *  SYNCED       — Template assigned; snapshot version = current template version.
 *  NEW_VERSION  — Template assigned; template has a higher version than snapshot.
 *  CUSTOM       — Template assigned; Series has locally modified the snapshot.
 *  UNLINKED     — Template was assigned but template no longer exists or is archived.
 *  NONE         — No template association (custom condition or standalone).
 */
export type SeriesConditionStatus = 'SYNCED' | 'NEW_VERSION' | 'CUSTOM' | 'UNLINKED' | 'NONE'

export const SERIES_CONDITION_STATUS_LABEL: Record<SeriesConditionStatus, string> = {
  SYNCED:      'ตรงกับ Template',
  NEW_VERSION: 'มี Version ใหม่',
  CUSTOM:      'ปรับเฉพาะ Series',
  UNLINKED:    'เลิกเชื่อมโยง',
  NONE:        'กำหนดเอง',
}

export const SERIES_CONDITION_STATUS_COLOR: Record<SeriesConditionStatus, string> = {
  SYNCED:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  NEW_VERSION: 'bg-blue-100 text-blue-700 border-blue-200',
  CUSTOM:      'bg-amber-100 text-amber-700 border-amber-200',
  UNLINKED:    'bg-slate-100 text-slate-500 border-slate-200',
  NONE:        'bg-slate-100 text-slate-500 border-slate-200',
}

// ─── Relationship info (full detail) ─────────────────────────────────────────

export interface ConditionRelationshipInfo {
  status: SeriesConditionStatus
  templateId?: string
  templateCode?: string
  templateName?: string
  usedVersion?: number       // version stored in the snapshot
  currentVersion?: number    // version of the live template
  appliedAt?: string
  appliedBy?: string
  overrideFields?: string[]  // section keys that differ from template
  overrideCount: number
  overrideAt?: string
  overrideBy?: string
  isTemplateArchived?: boolean
}

// ─── Diff types ───────────────────────────────────────────────────────────────

export interface ConditionDiffSection {
  section: string
  label: string
  isDiff: boolean
  snapshotSummary: string   // what the Series currently has
  templateSummary: string   // what the live template says
}

// ─── Template validation ──────────────────────────────────────────────────────

export interface TemplateValidationResult {
  valid: boolean
  errors: string[]     // blocking (airline mismatch, inactive, archived)
  warnings: string[]   // non-blocking (currency mismatch)
}

// ─── Core status computation ──────────────────────────────────────────────────

export function getSeriesConditionStatus(
  sc: AppStockCondition,
  allTemplates: AppConditionTemplate[],
): SeriesConditionStatus {
  if (sc.source !== 'template' || !sc.sourceTemplateId) return 'NONE'

  const template = allTemplates.find(t => t.templateId === sc.sourceTemplateId)
  if (!template || template.isArchived) return 'UNLINKED'

  if ((sc.overrideFields && sc.overrideFields.length > 0) || sc.locallyModified) return 'CUSTOM'

  const snapshotVersion = sc.sourceTemplateVersion ?? 1
  if (template.version > snapshotVersion) return 'NEW_VERSION'

  return 'SYNCED'
}

export function getSeriesConditionRelationship(
  sc: AppStockCondition,
  allTemplates: AppConditionTemplate[],
): ConditionRelationshipInfo {
  const status = getSeriesConditionStatus(sc, allTemplates)
  const template = sc.sourceTemplateId
    ? allTemplates.find(t => t.templateId === sc.sourceTemplateId)
    : undefined

  return {
    status,
    templateId:          sc.sourceTemplateId,
    templateCode:        template?.condition.conditionCode,
    templateName:        sc.sourceTemplateName ?? template?.condition.conditionName,
    usedVersion:         sc.sourceTemplateVersion,
    currentVersion:      template?.version,
    appliedAt:           sc.appliedAt,
    appliedBy:           sc.appliedBy,
    overrideFields:      sc.overrideFields,
    overrideCount:       sc.overrideFields?.length ?? 0,
    overrideAt:          sc.overrideAt,
    overrideBy:          sc.overrideBy,
    isTemplateArchived:  template?.isArchived,
  }
}

// ─── Diff computation ─────────────────────────────────────────────────────────

const DIFF_SECTIONS: {
  key: string
  label: string
  summarize: (c: AppCondition, currency: string) => string
}[] = [
  {
    key: 'payment',
    label: 'งวดชำระเงิน',
    summarize: (c, currency) => {
      if (!c.stages.length) return 'ไม่มีงวด'
      return `${c.stages.length} งวด: ${c.stages.map(s => formatStageAmount(s, currency)).join(', ')}`
    },
  },
  {
    key: 'ttl',
    label: 'NAME DL / Issue Deadline',
    summarize: c => `NAME: ${formatTtlRule(c.ttlRule)} · TICKET: ${formatTtlRule(c.ticketDlRule)}`,
  },
  {
    key: 'baggage',
    label: 'สัมภาระ',
    summarize: c => formatBaggageSummary(c.baggagePolicy),
  },
  {
    key: 'seatReduction',
    label: 'การลดที่นั่ง',
    summarize: c => {
      const sp = c.seatReductionPolicy
      if (!sp?.enabled) return 'ไม่มีนโยบาย'
      return `${sp.mode ?? 'SINGLE'} · ${sp.rules?.length ?? 0} step`
    },
  },
  {
    key: 'cancel',
    label: 'การยกเลิกกรุ๊ป (No Sell)',
    summarize: c => {
      const cgt = c.cancelGroupTerms
      if (!cgt?.enabled) return 'ไม่มีเงื่อนไข'
      if (cgt.cancelType === 'STEP')
        return `STEP: ${cgt.stepCancels?.length ?? 0} ขั้น`
      if (cgt.cancelType === 'PAYMENT_STAGE')
        return `ตามงวดชำระ: ${cgt.paymentCancels?.length ?? 0} งวด`
      return 'ค่าปรับ'
    },
  },
  {
    key: 'change',
    label: 'การเปลี่ยนแปลง',
    summarize: c => {
      const ct = c.changeTerms
      if (!ct?.enabled) return 'ไม่มีเงื่อนไข'
      const parts = [
        ct.dateChange?.policy === 'ALLOW'   ? 'วันที่: อนุญาต'    : null,
        ct.nameChange?.policy === 'ALLOW'   ? 'ชื่อ: อนุญาต'      : null,
        ct.flightChange?.policy === 'ALLOW' ? 'เที่ยวบิน: อนุญาต' : null,
      ].filter(Boolean)
      return parts.length ? parts.join(' · ') : 'ไม่อนุญาตทุกรายการ'
    },
  },
  {
    key: 'refund',
    label: 'Refund',
    summarize: c => {
      const rt = c.refundTerms
      if (!rt?.enabled) return 'ไม่มีเงื่อนไข'
      return rt.mainPolicy ?? 'ยังไม่ระบุ'
    },
  },
  {
    key: 'freeText',
    label: 'เงื่อนไขเพิ่มเติม',
    summarize: c => {
      const txt = c.freeTextCondition?.trim()
      if (!txt) return 'ไม่มี'
      return txt.length > 60 ? txt.slice(0, 60) + '…' : txt
    },
  },
]

export function computeConditionDiff(
  snapshotCond: AppCondition,
  templateCond: AppCondition,
  currency = 'THB',
): ConditionDiffSection[] {
  return DIFF_SECTIONS.map(sec => {
    const snapshotSummary = sec.summarize(snapshotCond, currency)
    const templateSummary = sec.summarize(templateCond, currency)
    return {
      section: sec.key,
      label: sec.label,
      isDiff: snapshotSummary !== templateSummary,
      snapshotSummary,
      templateSummary,
    }
  })
}

export function computeOverrideFields(
  snapshotCond: AppCondition,
  templateCond: AppCondition,
  currency = 'THB',
): string[] {
  return computeConditionDiff(snapshotCond, templateCond, currency)
    .filter(d => d.isDiff)
    .map(d => d.section)
}

// ─── Template validation ──────────────────────────────────────────────────────

export function validateTemplateForSeries(
  template: AppConditionTemplate,
  stock: DemoStock,
): TemplateValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (template.isArchived) {
    errors.push('Template นี้ถูก Archive แล้ว ไม่สามารถใช้งานได้')
  }
  if (template.condition.status !== 'Active') {
    errors.push(`Template อยู่ในสถานะ "${template.condition.status}" — ต้องการ Active เท่านั้น`)
  }
  if (template.airlineCode && template.airlineCode !== stock.airlineCode) {
    errors.push(
      `สายการบินไม่ตรงกัน: Template (${template.airlineCode}) ≠ Series (${stock.airlineCode})`
    )
  }
  if (template.currency && template.currency !== stock.currency) {
    warnings.push(
      `สกุลเงินต่างกัน: Template ใช้ ${template.currency} แต่ Series ใช้ ${stock.currency}`
    )
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ─── Template readiness ───────────────────────────────────────────────────────

/**
 * Computed readiness status — NOT the user-settable status field.
 * Derived purely from Validation of the template's actual data.
 *
 *  ready      — All required fields present; safe to apply directly to Series.
 *  incomplete — Missing or unspecified required data; must be "copied to edit" only.
 *  inactive   — Archived or status !== Active; not selectable at all.
 */
export type TemplateReadinessStatus = 'ready' | 'incomplete' | 'inactive'

export interface TemplateReadinessResult {
  status: TemplateReadinessStatus
  missingFields: string[]
}

export function computeTemplateReadiness(template: AppConditionTemplate): TemplateReadinessResult {
  if (template.isArchived) {
    return { status: 'inactive', missingFields: ['Template ถูก Archive แล้ว'] }
  }
  if (template.condition.status !== 'Active') {
    return { status: 'inactive', missingFields: [`สถานะ: ${template.condition.status} (ต้องการ Active)`] }
  }

  const missing: string[] = []
  const c = template.condition

  if (!template.airlineCode) missing.push('ยังไม่ได้เลือกสายการบิน')
  if (!c.conditionName.trim()) missing.push('ยังไม่ได้ระบุชื่อ Condition')

  if (c.stages.length === 0) {
    missing.push('ยังไม่มีงวดชำระเงิน')
  } else {
    c.stages.forEach((s, i) => {
      if (s.refundable === 'UNSPECIFIED') {
        missing.push(`งวดชำระเงินที่ ${i + 1}: ยังไม่ได้ระบุว่าคืนเงินได้หรือไม่`)
      }
    })
  }

  if (c.cancelGroupTerms?.enabled) {
    const cg = c.cancelGroupTerms
    if (!cg.cancelType) {
      missing.push('เงื่อนไขการยกเลิกกรุ๊ป (No Sell): ยังไม่ได้ระบุประเภทการยกเลิก')
    } else if (cg.cancelType === 'STEP' && (!cg.stepCancels || cg.stepCancels.length === 0)) {
      missing.push('เงื่อนไขการยกเลิกกรุ๊ป (No Sell): ยังไม่มีข้อมูล Step ยกเลิก')
    } else if (cg.cancelType === 'PAYMENT_STAGE' && (!cg.paymentCancels || cg.paymentCancels.length === 0)) {
      missing.push('เงื่อนไขการยกเลิกกรุ๊ป (No Sell): ยังไม่มีข้อมูลงวดชำระที่เชื่อม')
    }
  }

  return {
    status: missing.length === 0 ? 'ready' : 'incomplete',
    missingFields: missing,
  }
}

// ─── PNR source type ──────────────────────────────────────────────────────────

export type PnrConditionSourceType = 'SERIES' | 'DIRECT' | 'NONE'

export function getPnrConditionSourceType(pnr: DemoPNR, stock: DemoStock): PnrConditionSourceType {
  if (pnr.conditionTemplateId) return 'DIRECT'
  if (stock.conditions.length > 0) return 'SERIES'
  return 'NONE'
}
