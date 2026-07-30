/**
 * PNR-level Applied Condition — NAME DL lock + Template merge
 *
 * A PNR gets its own "Applied Condition" the instant a user sets NAME DL,
 * even before any Template Condition has been chosen for that PNR. The
 * NAME DL (ttlRule) inside it is then LOCKED: selecting a Template Condition
 * later only ever merges in the template's *other* sections
 * (payment/baggage/seat-reduction/cancel/change/refund/free-text) into
 * `otherConditionSnapshot` — it never silently overwrites the locked
 * ttlRule. If the template's own NAME DL differs from the locked value,
 * the caller must show a 3-option compare (see previewTemplateMergeForPnr)
 * and apply the user's explicit decision.
 *
 * Both `otherConditionSnapshot` and the locked `ttlRule` are frozen copies
 * (with `sourceTemplateVersion` pinned) — editing the source Template later
 * does not cascade into an already-merged PNR; a fresh call to
 * previewTemplateMergeForPnr (re-triggered by the user) is required to sync.
 */

import { parseISO, isValid, format } from 'date-fns'
import type { AppCondition, AppConditionTemplate, CondTtlRule } from '@/lib/condition-schema'
import { calcCondTtlDateAdjusted } from '@/lib/condition-schema'
import type { HolidayData } from '@/lib/holiday-storage'
import { calcTtlDateFromTravel } from '@/lib/ttl-utils'
import { adjustDateForHolidays } from '@/lib/holiday-utils'

export type PnrTtlHistoryAction =
  | 'LOCKED_ON_CREATE'            // user manually set NAME DL with no template chosen yet
  | 'TTL_UPDATED_MANUALLY'        // user changed the locked NAME DL on a later manual edit
  | 'LOCKED_FROM_TEMPLATE'        // no prior lock existed; template's NAME DL became the new locked baseline
  | 'MERGED_TEMPLATE_KEPT_TTL'    // conflict resolved by keeping the existing (locked) NAME DL
  | 'MERGED_TEMPLATE_CHANGED_TTL' // conflict resolved by switching to the template's NAME DL

export interface PnrTtlHistoryEntry {
  at: string
  by: string
  action: PnrTtlHistoryAction
  previousRule?: CondTtlRule | null
  newRule?: CondTtlRule | null
  templateId?: string | null
  templateName?: string | null
}

export interface PnrAppliedCondition {
  /** 'draft' = built purely from a manually-set NAME DL, no template merged in yet. */
  source: 'draft' | 'template'
  sourceTemplateId?: string | null
  sourceTemplateName?: string | null
  /** Template version pinned at merge time — later template edits don't cascade until re-merged. */
  sourceTemplateVersion?: number | null
  appliedAt: string
  appliedBy: string
  /** The locked NAME DL definition: calc method, days before, fixed date, time, holiday-shift metadata. */
  ttlRule: CondTtlRule
  ttlLocked: boolean
  ttlLockedAt?: string | null
  ttlLockedBy?: string | null
  /** Frozen snapshot of the template's non-TTL sections, once a template has been merged in. */
  otherConditionSnapshot?: AppCondition | null
  history: PnrTtlHistoryEntry[]
}

function ttlRuleKey(rule: CondTtlRule | null | undefined): string {
  if (!rule) return ''
  return `${rule.calcType}|${rule.daysBefore}|${rule.fixedDate}|${rule.time}`
}

export function ttlRuleEquals(a: CondTtlRule | null | undefined, b: CondTtlRule | null | undefined): boolean {
  return ttlRuleKey(a) === ttlRuleKey(b)
}

/**
 * Call on every PNR create/save whenever ttlType !== 'NONE'. Creates the
 * draft Applied Condition the first time; on a later edit, updates the
 * locked ttlRule (with a history entry) only if it actually changed —
 * otherConditionSnapshot and template linkage are left untouched.
 */
export function lockTtlOnPnrSave(
  existing: PnrAppliedCondition | null | undefined,
  ttlRule: CondTtlRule,
  actor: string,
): PnrAppliedCondition {
  const now = new Date().toISOString()
  if (!existing) {
    return {
      source: 'draft',
      appliedAt: now,
      appliedBy: actor,
      ttlRule,
      ttlLocked: true,
      ttlLockedAt: now,
      ttlLockedBy: actor,
      otherConditionSnapshot: null,
      history: [{ at: now, by: actor, action: 'LOCKED_ON_CREATE', newRule: ttlRule }],
    }
  }
  if (ttlRuleEquals(existing.ttlRule, ttlRule)) return existing
  return {
    ...existing,
    ttlRule,
    ttlLocked: true,
    ttlLockedAt: now,
    ttlLockedBy: actor,
    history: [...existing.history, {
      at: now, by: actor, action: 'TTL_UPDATED_MANUALLY',
      previousRule: existing.ttlRule, newRule: ttlRule,
    }],
  }
}

export interface TemplateMergePreview {
  hasConflict: boolean
  currentIso: string | null
  templateIso: string | null
  /** Apply this when the user picks "keep existing NAME DL" — also the safe result when hasConflict is false. */
  keepResult: PnrAppliedCondition
  /** Apply this only when the user explicitly picks "change to Template's NAME DL". */
  changeResult: PnrAppliedCondition
}

/**
 * Preview merging `template` into a PNR's Applied Condition. Only the
 * non-TTL sections are ever taken automatically; if a NAME DL is already
 * locked and the template's own NAME DL resolves to a different date/time
 * for this PNR's travel date, `hasConflict` is true and the caller must
 * ask the user to choose keepResult / changeResult / cancel (apply nothing).
 */
export function previewTemplateMergeForPnr(
  existing: PnrAppliedCondition | null | undefined,
  template: AppConditionTemplate,
  travelStart: string,
  holidays: HolidayData[],
  actor: string,
): TemplateMergePreview {
  const now = new Date().toISOString()
  const templateIso = calcCondTtlDateAdjusted(template.condition.ttlRule, travelStart, holidays).isoDateTime

  // No NAME DL locked yet — the template's own NAME DL becomes the new baseline (now locked going forward).
  if (!existing || !existing.ttlLocked) {
    const result: PnrAppliedCondition = {
      source: 'template',
      sourceTemplateId: template.templateId,
      sourceTemplateName: template.condition.conditionName,
      sourceTemplateVersion: template.version,
      appliedAt: now,
      appliedBy: actor,
      ttlRule: template.condition.ttlRule,
      ttlLocked: true,
      ttlLockedAt: now,
      ttlLockedBy: actor,
      otherConditionSnapshot: template.condition,
      history: [
        ...(existing?.history ?? []),
        {
          at: now, by: actor, action: 'LOCKED_FROM_TEMPLATE',
          newRule: template.condition.ttlRule,
          templateId: template.templateId, templateName: template.condition.conditionName,
        },
      ],
    }
    return {
      hasConflict: false,
      currentIso: existing ? calcCondTtlDateAdjusted(existing.ttlRule, travelStart, holidays).isoDateTime : null,
      templateIso,
      keepResult: result,
      changeResult: result,
    }
  }

  const currentIso = calcCondTtlDateAdjusted(existing.ttlRule, travelStart, holidays).isoDateTime
  const hasConflict = currentIso !== templateIso

  const keepResult: PnrAppliedCondition = {
    ...existing,
    source: 'template',
    sourceTemplateId: template.templateId,
    sourceTemplateName: template.condition.conditionName,
    sourceTemplateVersion: template.version,
    appliedAt: now,
    appliedBy: actor,
    otherConditionSnapshot: template.condition,
    history: hasConflict
      ? [...existing.history, {
          at: now, by: actor, action: 'MERGED_TEMPLATE_KEPT_TTL',
          previousRule: existing.ttlRule, newRule: existing.ttlRule,
          templateId: template.templateId, templateName: template.condition.conditionName,
        }]
      : existing.history,
  }

  const changeResult: PnrAppliedCondition = {
    ...keepResult,
    ttlRule: template.condition.ttlRule,
    ttlLockedAt: now,
    ttlLockedBy: actor,
    history: [...existing.history, {
      at: now, by: actor, action: 'MERGED_TEMPLATE_CHANGED_TTL',
      previousRule: existing.ttlRule, newRule: template.condition.ttlRule,
      templateId: template.templateId, templateName: template.condition.conditionName,
    }],
  }

  return { hasConflict, currentIso, templateIso, keepResult, changeResult }
}

/**
 * Split an ISO datetime string into (date, time) for display with existing
 * formatters. `calcCondTtlDateAdjusted` builds its ISO string via
 * `Date#toISOString()` (UTC) — parse-and-reformat through date-fns to
 * recover the intended local time-of-day rather than slicing the raw string.
 */
export function splitIsoDateTime(iso: string | null): { date: string | null; time: string | null } {
  if (!iso) return { date: null, time: null }
  try {
    const d = parseISO(iso)
    if (!isValid(d)) return { date: null, time: null }
    return { date: format(d, 'yyyy-MM-dd'), time: format(d, 'HH:mm') }
  } catch {
    return { date: null, time: null }
  }
}

/**
 * Re-derives the flat ttlDate/ttlTime/ttlDateTime/holiday-adjustment scalars
 * (used everywhere for display, sorting, dashboard) from an Applied
 * Condition's locked ttlRule, so they stay in sync whenever the applied
 * condition changes (initial lock, template merge, keep/change decision).
 *
 * Computes the raw date directly from the rule (days-before or fixed-date)
 * and pairs it with the rule's own `time` string verbatim, rather than
 * round-tripping through calcCondTtlDateAdjusted's UTC-serialized ISO
 * string — avoids any timezone-driven date/time drift for the saved PNR.
 */
export function scalarsFromAppliedCondition(
  appliedCondition: PnrAppliedCondition,
  travelStart: string,
  holidays: HolidayData[],
): {
  ttlType: 'DAYS_BEFORE' | 'FIXED_DATE'
  ttlDaysBefore: number | null
  ttlDate: string | null
  ttlTime: string | null
  ttlDateTime: string | null
  ttlDateOriginal: string | null
  ttlHolidayAdjusted: boolean
  ttlHolidayAdjustReason: string | null
} {
  const rule = appliedCondition.ttlRule
  const ttlType: 'DAYS_BEFORE' | 'FIXED_DATE' = rule.calcType === 'MANUAL_DATE' ? 'FIXED_DATE' : 'DAYS_BEFORE'
  const ttlTime = rule.time || null

  const rawDate = rule.calcType === 'MANUAL_DATE'
    ? (rule.fixedDate || null)
    : (travelStart ? calcTtlDateFromTravel(travelStart, rule.daysBefore) : null)

  if (!rawDate) {
    return {
      ttlType, ttlDaysBefore: rule.calcType === 'TRAVEL_MINUS_DAYS' ? rule.daysBefore : null,
      ttlDate: null, ttlTime, ttlDateTime: null,
      ttlDateOriginal: null, ttlHolidayAdjusted: false, ttlHolidayAdjustReason: null,
    }
  }

  const adjustment = adjustDateForHolidays(rawDate, holidays)
  const ttlDateTime = `${adjustment.adjustedDate}T${ttlTime ?? '00:00'}:00`
  return {
    ttlType,
    ttlDaysBefore: rule.calcType === 'TRAVEL_MINUS_DAYS' ? rule.daysBefore : null,
    ttlDate: adjustment.adjustedDate,
    ttlTime,
    ttlDateTime,
    ttlDateOriginal: adjustment.originalDate,
    ttlHolidayAdjusted: adjustment.adjusted,
    ttlHolidayAdjustReason: adjustment.reason,
  }
}
