# Condition System — Current Flow Map (End-to-End)

> **Phase 1 Read-Only Audit** | Audited: 2026-07-30 | Scope: Template Condition, Series Applied Condition, PNR Applied Condition, NAME DL (TTL), Override
> Companion documents: `condition-data-model-audit.md`, `condition-source-of-truth.md`, `condition-bug-list.md`, `condition-impact-matrix.md`, `condition-test-cases.md`, `condition-fix-plan.md`, `condition-open-questions.md`

## 0. Architecture reality check

This is a **client-side, `localStorage`-only** feature area. There is no live Supabase/API wiring for Condition data today:

- `app/api/tickets/route.ts` / `app/api/tickets/[id]/route.ts` are real Next.js routes that call `getServerSupabase()` against a `flight_series` table using the legacy `types/index.ts` shapes (`FlightSeries`, `FlightCondition`, `FlightPNR`, `ConditionTemplate`) — but **no page or component fetches them**. Dead code.
- All live reads/writes go through:
  - `lib/condition-storage.ts` → `localStorage['app_condition_templates']` (Template Condition)
  - `lib/demo-storage.ts` → `localStorage['ticket_stock_demo_data']` (Stock/Series, PNR, Applied Condition, NAME DL)
  - `lib/holiday-storage.ts` → `localStorage['holidays_data']` (holiday calendar for NAME DL adjustment)
- Two now-orphaned legacy modules exist and must **not** be revived without re-auditing: `lib/template-storage.ts` (key `ticket_stock_condition_templates`) and its UI `components/condition-templates/ConditionTemplateForm.tsx` / `SharedStageCard.tsx`. Zero live imports remain (confirmed by repo-wide grep). A prior fix already migrated the one remaining live consumer (`app/settings/airlines/[id]/page.tsx`) off this legacy module.
- `lib/airline-condition-presets.ts` + `lib/airline-preset-storage.ts` — a whole "airline default preset" subsystem exists but is never imported by any live template-creation page. Dead.

---

## 1. Create Template Condition

| Step | File / Function |
|---|---|
| UI entry | `app/tickets/condition-templates/add/page.tsx` |
| Editor | `components/condition-builder/ConditionEditorModal.tsx` → `components/condition-builder/ConditionBuilder.tsx` (local React state only, `conditionMode="template"`) |
| Save | `handleSave` → `saveConditionTemplate(toSave)` in `lib/condition-storage.ts:165-175` |
| Storage | `localStorage['app_condition_templates']`, full-array `JSON.stringify` on every save |
| ID generation | `newTemplateId()` (condition-schema.ts) — timestamp+random, minted once at `defaultTemplate({ ticketType: 'Group' })` (add/page.tsx:21) |

`saveConditionTemplate` does a positional `unshift` for a new `templateId` — no uniqueness validation on `conditionCode`, no schema validation at the storage layer.

## 2. Edit Template Condition

| Step | File / Function |
|---|---|
| UI entry | `app/tickets/condition-templates/[id]/edit/page.tsx` |
| Load | `getConditionTemplateById(id)` (condition-storage.ts:116-118) |
| Impact choice UI | 3-way modal (edit/page.tsx:160-213): "สร้าง Version ใหม่" / "อัปเดต Series ที่ยังไม่ปรับ" / "บันทึกโดยไม่เพิ่ม Version" |
| Save | `doSave(cond, bumpVersion, updateSynced)` (edit/page.tsx:50-82) → `saveConditionTemplate(updated)` — **same `templateId` always**, `createdAt` preserved via spread, `version` bumped or not per user choice |
| Optional propagation | If "อัปเดต Series ที่ยังไม่ปรับ": re-snapshots into every `DemoStock.conditions[]` entry with matching `sourceTemplateId` where `!locallyModified` (edit/page.tsx:65-79) |

**Key fact**: because `AppStockCondition` stores a full `condition: AppCondition` object (not just an ID pointer), editing a template **never** silently mutates an already-applied Series' data — the Series keeps its independent snapshot unless the user explicitly opts into "อัปเดต Series ที่ยังไม่ปรับ". This part of the architecture is sound. See `condition-bug-list.md` HIGH-07 for the one real gap (storage layer itself enforces nothing; safety is UI-only).

## 3. Activate / Deactivate Template

Two **independent** toggles:

| Toggle | Field | Function | UI |
|---|---|---|---|
| Status | `condition.status: 'Active'⇄'Inactive'` | `toggleConditionTemplateStatus(id)` (condition-storage.ts:220-232) | List page (warns if in-use) + Detail page (does **not** warn — MED-02) |
| Archive | `AppConditionTemplate.isArchived` | `setConditionTemplateArchived(id, archived)` (condition-storage.ts:214-218) | Detail page only — List page has no Archive button (MED-03) |

Both a template's Status="Inactive" AND `isArchived=true` are excluded from new-assignment pickers by `filterActiveTemplatesForStock` (condition-storage.ts:152-163).

## 4. Select Template in Series (Edit Stock)

| Step | File / Function |
|---|---|
| UI entry | `app/tickets/[id]/edit/page.tsx` Step 3 → `components/wizard/Step3Conditions.tsx` |
| Picker | `TemplatePicker` (Step3Conditions.tsx) — fetches `getConditionTemplates()` on open, filters via `filterActiveTemplatesForStock({ airlineCode, ticketType })` |
| Pick | `handlePickTemplate` → `snapshotTemplateToCondition(t)` (condition-storage.ts:236-252) — deep-copies `AppCondition`, mints a new `conditionId` |
| Add to state | `onChange([...conditions, newCond])` — purely in-memory `WizardState.conditions` until wizard Save |

**Not covered here**: Add Stock wizard. See §12 (Known Gap: CRIT-06).

## 5. Create New Condition from Series (custom, not from template)

`Step3Conditions.tsx::handleAddNew` → blank `AppCondition` via `defaultCondition()` seeded with `seriesInfo.airlineCode`/currency/routes → `ConditionEditorModal` (`conditionMode="series"`) → `handleSaveEditWith` appends to `conditions[]`.

Optional "Save as Template" checkbox → `handleSaveAsTemplate` (Step3Conditions.tsx:331-346) mints a **fresh** `newTemplateId()`/`version:1` — cannot overwrite an existing template.

## 6. Bind Condition to Series (Stock Detail)

| Step | File / Function |
|---|---|
| UI entry | `components/tickets/detail/ConditionsTab.tsx` → `TemplatePickerModal` |
| Filter | `filterActiveTemplatesForStock(getConditionTemplates(), { airlineCode: stock.airlineCode, ticketType: getStockTypeConfig(stock.ticketType, stock.groupType)?.ticketType })` |
| Assign | `onUse`/`onCopy` → `_doSave` → `persistUpdate([...conditions, sc], logMsg)` → `saveDemoStock(updated)` |
| Change existing | `handleConfirmChangeTemplate` — shows affected-PNR preview before cascading (first-time assignment via `handleUseTemplate` skips this preview — MED-14) |
| Reset to template defaults | `handleConfirmReset`, guarded by `showResetConfirm` |
| Remove | `handleRemoveCondition` (line ~562) — strips entry from `stock.conditions`; does **not** clean up PNRs whose `conditionCode` pointed at it (MED-15) |

Override bookkeeping fields live on `AppStockCondition`: `sourceTemplateId`, `sourceTemplateVersion`, `locallyModified`, `overrideFields`. Diff/relationship logic lives in `lib/condition-relationship.ts` (`computeConditionDiff`, `computeOverrideFields`, `validateTemplateForSeries`, `computeTemplateReadiness`, `getSeriesConditionRelationship`, `getSeriesConditionStatus`) — this module's header explicitly states it is the **single source of truth** for relationship/status logic; several screens don't comply (see `condition-bug-list.md`).

## 7. Bind Condition to PNR / Assign Condition per-PNR

**Two parallel systems exist** (see `condition-bug-list.md` HIGH-01 for full analysis):

- **System A** ("Stock condition", flat): `DemoPNR.conditionCode: string`. Written by:
  - `components/shared/SinglePnrModal.tsx` (Add PNR)
  - `components/shared/BulkPnrBuilder.tsx` (หลาย PNR)
  - `components/wizard/Step4PNR.tsx` (wizard PNR step, both Add and Edit)
  - Common resolution helper: `lib/pnr-shared-utils.ts::buildDemoPnrFromForm`
- **System B** ("Direct Template assignment"): `DemoPNR.conditionTemplateId` + `DemoPNR.conditionOverride: boolean`. Written **only** by:
  - `components/tickets/detail/PNRTab.tsx::applyConditionChangeDirect`
  - `lib/condition-usage.ts::assignTemplateToPnrs`

`lib/condition-relationship.ts::getEffectiveConditionForPnr(pnr, stock, allTemplates)` reconciles both (priority: direct template → explicit conditionCode → inherited series template → any active series condition), and is the **only** place that does this correctly — used by `PNRTab.tsx` only. Every other screen (`PNRSeatsTable`, `SinglePnrModal`, `BulkPnrBuilder`, `Step5Review`, `SummaryTab`, `group/adhoc/page.tsx`) reads a raw field directly instead, causing the display-consistency bugs in `condition-bug-list.md`.

## 8. Set NAME DL Before Selecting Condition

Supported in all PNR-entry screens (SinglePnrModal, BulkPnrBuilder, Step4PNR, PNRSeatsTable's inline `TtlEditor`) — user can type `ttlType`/`ttlDate`/`ttlDaysBefore`/`ttlTime` directly with no condition selected. Each screen tracks a local `ttlUserModified` boolean to gate whether picking/changing a condition afterward should auto-fill NAME DL or prompt a conflict check via `TtlTemplateConflictModal`.

Canonical lock/audit engine: `lib/pnr-applied-condition.ts`:
- `PnrAppliedCondition` — frozen scalar snapshot (`ttlRule`, `otherConditionSnapshot`, `sourceTemplateVersion`, `history: PnrTtlHistoryEntry[]`)
- `lockTtlOnPnrSave(existing, newRule, actor)` — no-ops if the rule is unchanged; otherwise re-locks + appends history
- `previewTemplateMergeForPnr(existing, template, travelStart, holidays, actor)` — compares resolved ISO dates, returns `{ hasConflict, keepResult, changeResult }`, never auto-picks
- `scalarsFromAppliedCondition` — projects the locked rule back into flat `ttlDate`/`ttlTime` etc., using the noon-anchored (correct) date engine

**Real-world usage gap**: `SinglePnrModal.tsx` and `BulkPnrBuilder.tsx` do **not** call these canonical functions — they reimplement a parallel, local `ttlUserModified` + `resolveConditionTtlIso`/`resolveCondTtlIso` check instead. Only `PNRTab.tsx` and the wizard-save path (`lib/demo-storage.ts` via `pnr-shared-utils.ts`) use the canonical module. This duplication is the root cause of `condition-bug-list.md` CRIT-01/CRIT-02.

## 9. Change Template or Condition Later

- **Series level**: `ConditionsTab.tsx::handleConfirmChangeTemplate` — shows affected-PNR preview, never auto-cascades to PNRs (no code touches `liveStock.pnrs` in this file at all — confirmed by grep). The only PNR-cascade path is the explicit, user-initiated Bulk Condition Change described next.
- **PNR level (single)**: `PNRTab.tsx::selectTemplate` → `previewTemplateMergeForPnr` → opens `TtlTemplateConflictModal` only if `hasConflict` → user picks KEEP or CHANGE explicitly.
- **PNR level (bulk)**: `PNRTab.tsx`'s `condChangeConfirm` flow — one blanket "ยืนยันการเปลี่ยน" button; NAME DL conflicts across the whole batch are **auto-resolved to KEEP** with the conflict count only shown *after* the click (toast), not before confirmation. No "Update all / Update selected only / Keep existing / Cancel" 4-way choice exists (see `condition-bug-list.md` HIGH-03, and `condition-open-questions.md` Q-05).

## 10. Edit a Template That's Already Used by Series/PNR

Covered in §2 above. Snapshot model makes this safe by construction for **Series**. **PNR-level Direct Template assignment (System B) is NOT protected the same way** — see §7 and `condition-bug-list.md` CRIT-04/CRIT-05 for how editing a PNR (via SinglePnrModal) or the whole Stock (via Edit Stock wizard save) can wipe System B fields entirely, independent of whether the template itself was edited.

## 11. Remove Condition from Series / PNR

- **Series**: `ConditionsTab.tsx::handleRemoveCondition` — strips from `stock.conditions`; PNRs pointing at the removed `conditionCode` are not reset/warned (MED-15).
- **PNR (Direct override, System B)**: `applyConditionChangeDirect` with `newSource: 'SERIES'` explicitly clears `conditionTemplateId: null`, `conditionOverride: false`, `conditionCode: ''` — reverting to Series inheritance. **Working as intended** for this one path.
- **PNR (System A, flat conditionCode)**: no explicit "remove" UI found in SinglePnrModal/BulkPnrBuilder beyond re-selecting "— ไม่ระบุ —" in the `<select>`.

## 12. Display in Stock Detail and Review & Save

See `condition-source-of-truth.md` and `condition-bug-list.md` for the full per-screen comparison. Headline: **`Step5Review.tsx` (Review & Save, used by both Add and Edit wizards) shows the raw internal `condition_id` as both code and name** instead of resolving against `state.conditions` (CRIT-07) — the single most concrete, currently-live display bug found.

## Known Structural Gap Carried Forward From a Prior (2026-07-13) Audit

`docs/audits/add-stock-series-audit.md` flagged (as C-02) that `Step3Conditions` was never wired into `app/tickets/add/page.tsx`. **Re-verified fresh today: still true.** `app/tickets/add/page.tsx` only imports `Step1StockInfo`, `Step2Sectors`, `Step4PNR`, `Step5Review` — 4 steps, no Conditions step. `WizardState.conditions` is initialized to `[]` and never mutated in that file. **This means a brand-new Series/Stock cannot have a Condition selected at creation time at all — only after, via Edit Stock.** This is very likely a major contributor to the user's reported "เลือก Template ไม่ได้" symptom for new stocks specifically. See `condition-bug-list.md` CRIT-06 and `condition-open-questions.md` Q-01.

## Full File/Function Index (for reference)

| Layer | File |
|---|---|
| Template schema/types | `lib/condition-schema.ts` |
| Template CRUD | `lib/condition-storage.ts` |
| Template list/detail/add/edit pages | `app/tickets/condition-templates/{page,add/page,[id]/page,[id]/edit/page}.tsx` |
| Template editor UI | `components/condition-builder/ConditionEditorModal.tsx`, `ConditionBuilder.tsx` |
| Series Applied Condition (wizard) | `components/wizard/Step3Conditions.tsx` |
| Series Applied Condition (stock detail) | `components/tickets/detail/ConditionsTab.tsx` |
| Relationship/diff/readiness logic | `lib/condition-relationship.ts` |
| Usage stats / direct-assign | `lib/condition-usage.ts` |
| PNR Applied Condition + NAME DL lock | `lib/pnr-applied-condition.ts` |
| TTL calc (noon-anchored, correct) | `lib/ttl-utils.ts` |
| TTL calc (legacy, NOT noon-anchored) | `lib/condition-schema.ts::calcCondTtlDate`/`calcCondTtlDateAdjusted` |
| Holiday adjustment | `lib/holiday-utils.ts`, `lib/holiday-storage.ts` |
| NAME DL conflict modal | `components/shared/TtlTemplateConflictModal.tsx` |
| NAME DL inline editors | `components/shared/TtlField.tsx`, `TtlEditor.tsx` |
| PNR add (single) | `components/shared/SinglePnrModal.tsx` |
| PNR add (bulk) | `components/shared/BulkPnrBuilder.tsx` |
| PNR grid | `components/shared/PNRSeatsTable.tsx` |
| Wizard PNR step | `components/wizard/Step4PNR.tsx` |
| Shared PNR build/validate | `lib/pnr-shared-utils.ts`, `lib/pnr-validation.ts` |
| Stock/PNR storage (source of truth) | `lib/demo-storage.ts` |
| Wizard host (Add) | `app/tickets/add/page.tsx` |
| Wizard host (Edit) | `app/tickets/[id]/edit/page.tsx` |
| Review & Save step | `components/wizard/Step5Review.tsx` |
| Stock Detail tabs | `components/tickets/detail/{PNRTab,ConditionsTab,SegmentsTab,SummaryTab}.tsx` |
| Stock Detail host | `app/tickets/[id]/page.tsx` |
| List pages | `app/tickets/page.tsx`, `app/tickets/group/series/page.tsx`, `app/tickets/group/adhoc/page.tsx` |
| Dead/legacy (do not extend) | `lib/template-storage.ts`, `components/condition-templates/ConditionTemplateForm.tsx`, `SharedStageCard.tsx`, `lib/airline-condition-presets.ts`, `lib/airline-preset-storage.ts`, `app/api/tickets/**` |
