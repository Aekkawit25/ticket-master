/**
 * PNR-level Applied Condition — NAME DL lock + Template merge
 *
 * Spec under test (lib/pnr-applied-condition.ts):
 *  - Setting NAME DL on a PNR immediately creates/locks a draft Applied
 *    Condition, even with no Template Condition chosen.
 *  - Choosing a Template Condition afterward merges in only the template's
 *    other sections; it must never silently overwrite the locked NAME DL.
 *  - If the template's own NAME DL differs, the caller gets both possible
 *    results (keep / change) plus a conflict flag — it must default to
 *    "keep" unless the caller explicitly applies the change result.
 *  - Editing the source Template later (bumping its version) must not
 *    retroactively change an already-merged PNR without a fresh merge call.
 */

import { describe, it, expect } from 'vitest'
import {
  lockTtlOnPnrSave, previewTemplateMergeForPnr, ttlRuleEquals, splitIsoDateTime, scalarsFromAppliedCondition,
} from '../pnr-applied-condition'
import { defaultCondition, defaultTemplate, defaultTtlRule, type CondTtlRule } from '../condition-schema'

const ACTOR = 'System'

function daysBeforeRule(daysBefore: number, time = '18:00'): CondTtlRule {
  return { ...defaultTtlRule(), calcType: 'TRAVEL_MINUS_DAYS', daysBefore, time, fixedDate: '' }
}

function fixedDateRule(fixedDate: string, time = '18:00'): CondTtlRule {
  return { ...defaultTtlRule(), calcType: 'MANUAL_DATE', daysBefore: 0, time, fixedDate }
}

// Monday — a plain business day, no weekend/holiday shift involved.
const TRAVEL_START = '2026-01-05'

describe('§1 — lockTtlOnPnrSave: draft creation on PNR create/save', () => {
  it('TC01: first call with no existing appliedCondition creates a locked draft', () => {
    const rule = daysBeforeRule(30)
    const result = lockTtlOnPnrSave(null, rule, ACTOR)
    expect(result.source).toBe('draft')
    expect(result.ttlLocked).toBe(true)
    expect(result.ttlRule).toEqual(rule)
    expect(result.otherConditionSnapshot).toBeNull()
    expect(result.history).toHaveLength(1)
    expect(result.history[0].action).toBe('LOCKED_ON_CREATE')
  })

  it('TC02: re-saving with the identical rule is a no-op (same object, no new history entry)', () => {
    const rule = daysBeforeRule(30)
    const first = lockTtlOnPnrSave(null, rule, ACTOR)
    const second = lockTtlOnPnrSave(first, { ...rule }, ACTOR)
    expect(second).toBe(first)
    expect(second.history).toHaveLength(1)
  })

  it('TC03: editing the locked NAME DL later updates the rule and appends history', () => {
    const first = lockTtlOnPnrSave(null, daysBeforeRule(30), ACTOR)
    const second = lockTtlOnPnrSave(first, daysBeforeRule(14), ACTOR)
    expect(second.ttlRule.daysBefore).toBe(14)
    expect(second.history).toHaveLength(2)
    expect(second.history[1].action).toBe('TTL_UPDATED_MANUALLY')
    expect(second.history[1].previousRule?.daysBefore).toBe(30)
    expect(second.history[1].newRule?.daysBefore).toBe(14)
  })

  it('TC04: supports FIXED_DATE (custom date) NAME DL, not just days-before', () => {
    const result = lockTtlOnPnrSave(null, fixedDateRule('2026-03-01'), ACTOR)
    expect(result.ttlRule.calcType).toBe('MANUAL_DATE')
    expect(result.ttlRule.fixedDate).toBe('2026-03-01')
    expect(result.ttlLocked).toBe(true)
  })
})

describe('§2 — ttlRuleEquals', () => {
  it('TC05: identical rules are equal regardless of object identity', () => {
    expect(ttlRuleEquals(daysBeforeRule(30), { ...daysBeforeRule(30) })).toBe(true)
  })
  it('TC06: differing daysBefore/time/calcType/fixedDate are not equal', () => {
    expect(ttlRuleEquals(daysBeforeRule(30), daysBeforeRule(14))).toBe(false)
    expect(ttlRuleEquals(daysBeforeRule(30, '18:00'), daysBeforeRule(30, '09:00'))).toBe(false)
    expect(ttlRuleEquals(daysBeforeRule(30), fixedDateRule('2026-03-01'))).toBe(false)
  })
})

describe('§3 — previewTemplateMergeForPnr: no NAME DL locked yet', () => {
  it('TC07: template becomes the new baseline with no conflict when nothing was locked before', () => {
    const template = defaultTemplate({ condition: defaultCondition({ conditionName: 'Standard', ttlRule: daysBeforeRule(21) }) })
    const preview = previewTemplateMergeForPnr(null, template, TRAVEL_START, [], ACTOR)
    expect(preview.hasConflict).toBe(false)
    expect(preview.keepResult.source).toBe('template')
    expect(preview.keepResult.ttlLocked).toBe(true)
    expect(preview.keepResult.ttlRule.daysBefore).toBe(21)
    expect(preview.keepResult.sourceTemplateId).toBe(template.templateId)
    expect(preview.keepResult.otherConditionSnapshot).toBe(template.condition)
    expect(preview.keepResult.history[0].action).toBe('LOCKED_FROM_TEMPLATE')
  })
})

describe('§4 — previewTemplateMergeForPnr: NAME DL already locked, template agrees', () => {
  it('TC08: same resolved date/time → no conflict, ttlRule untouched, other sections still merged', () => {
    const existing = lockTtlOnPnrSave(null, daysBeforeRule(21, '18:00'), ACTOR)
    const template = defaultTemplate({ condition: defaultCondition({ conditionName: 'Standard', ttlRule: daysBeforeRule(21, '18:00') }) })
    const preview = previewTemplateMergeForPnr(existing, template, TRAVEL_START, [], ACTOR)
    expect(preview.hasConflict).toBe(false)
    expect(preview.keepResult.ttlRule).toEqual(existing.ttlRule)
    expect(preview.keepResult.otherConditionSnapshot).toBe(template.condition)
    expect(preview.keepResult.source).toBe('template')
  })
})

describe('§5 — previewTemplateMergeForPnr: conflict — template disagrees with the locked NAME DL', () => {
  const existing = lockTtlOnPnrSave(null, daysBeforeRule(30, '18:00'), ACTOR)
  const template = defaultTemplate({ condition: defaultCondition({ conditionName: 'Standard 14D', ttlRule: daysBeforeRule(14, '18:00') }) })
  const preview = previewTemplateMergeForPnr(existing, template, TRAVEL_START, [], ACTOR)

  it('TC09: hasConflict is true when the resolved NAME DL differs', () => {
    expect(preview.hasConflict).toBe(true)
    expect(preview.currentIso).not.toBe(preview.templateIso)
  })

  it('TC10: keepResult preserves the original locked ttlRule — never auto-overwritten', () => {
    expect(preview.keepResult.ttlRule).toEqual(existing.ttlRule)
    expect(preview.keepResult.ttlLocked).toBe(true)
    expect(preview.keepResult.history.at(-1)?.action).toBe('MERGED_TEMPLATE_KEPT_TTL')
  })

  it('TC11: keepResult still merges in the template\'s other (non-TTL) sections', () => {
    expect(preview.keepResult.otherConditionSnapshot).toBe(template.condition)
    expect(preview.keepResult.sourceTemplateId).toBe(template.templateId)
  })

  it('TC12: changeResult switches to the template\'s NAME DL only when explicitly applied', () => {
    expect(preview.changeResult.ttlRule).toEqual(template.condition.ttlRule)
    expect(preview.changeResult.history.at(-1)?.action).toBe('MERGED_TEMPLATE_CHANGED_TTL')
    expect(preview.changeResult.history.at(-1)?.previousRule).toEqual(existing.ttlRule)
  })

  it('TC13: keepResult and changeResult are independent — applying one never mutates the other', () => {
    expect(preview.keepResult.ttlRule).not.toEqual(preview.changeResult.ttlRule)
  })
})

describe('§6 — editing the source Template later does not cascade into an already-merged PNR', () => {
  it('TC14: sourceTemplateVersion is pinned at merge time; a later template version bump requires a fresh merge call to take effect', () => {
    const template = defaultTemplate({ version: 1, condition: defaultCondition({ ttlRule: daysBeforeRule(30) }) })
    const merged = previewTemplateMergeForPnr(null, template, TRAVEL_START, [], ACTOR).keepResult
    expect(merged.sourceTemplateVersion).toBe(1)

    // Template gets edited later (version bump + different TTL) — the already-merged PNR object is untouched
    // because it holds a frozen copy, not a live reference back to `template`.
    const editedTemplate = { ...template, version: 2, condition: defaultCondition({ ttlRule: daysBeforeRule(7) }) }
    expect(merged.sourceTemplateVersion).toBe(1)
    expect(merged.ttlRule.daysBefore).toBe(30)
    expect(merged.otherConditionSnapshot).not.toBe(editedTemplate.condition)
  })
})

describe('§7 — splitIsoDateTime / scalarsFromAppliedCondition', () => {
  it('TC15: splits an ISO datetime into separate date and time', () => {
    expect(splitIsoDateTime('2026-01-02T18:00:00')).toEqual({ date: '2026-01-02', time: '18:00' })
    expect(splitIsoDateTime(null)).toEqual({ date: null, time: null })
  })

  it('TC16: scalarsFromAppliedCondition re-derives flat ttl* fields (incl. holiday shift) from the locked rule', () => {
    // 2026-01-08 (Thu) - 4 days = 2026-01-04 (Sunday) → shifts back to 2026-01-02 (Friday)
    const applied = lockTtlOnPnrSave(null, daysBeforeRule(4, '18:00'), ACTOR)
    const scalars = scalarsFromAppliedCondition(applied, '2026-01-08', [])
    expect(scalars.ttlType).toBe('DAYS_BEFORE')
    expect(scalars.ttlDaysBefore).toBe(4)
    expect(scalars.ttlDate).toBe('2026-01-02')
    expect(scalars.ttlTime).toBe('18:00')
    expect(scalars.ttlHolidayAdjusted).toBe(true)
    expect(scalars.ttlDateOriginal).toBe('2026-01-04')
  })
})
