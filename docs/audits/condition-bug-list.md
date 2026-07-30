# Condition System — Bug List

> **Phase 1 Read-Only Audit** | Audited: 2026-07-30 | No code changed as part of this audit.

## Summary

| Severity | Count |
|---|---|
| 🔴 Critical (data loss / silent overwrite / broken flow) | 8 |
| 🟠 High (inconsistency / silent wrong behavior) | 9 |
| 🟡 Medium (UX gap / correctness edge case) | 16 |
| 🔵 Low (dead code / naming smell) | 5 |
| **Total** | **38** |

---

## 🔴 Critical

### CRIT-01 — NAME DL silently overwritten on opening Edit-PNR modal

**Files**: `components/shared/SinglePnrModal.tsx:149-202`
**Data loss risk**: Yes — a manually-locked NAME DL date is replaced in the form the instant the modal opens, before the user touches anything.

`ttlUserModified` is local component state, force-reset to `false` on every `open` (line 174). The auto-fill effect (`if (!values.conditionCode || ttlUserModified) return`) fires as soon as `values.conditionCode` is populated from the loaded PNR — which happens immediately for an existing PNR that already has a condition — and unconditionally overwrites `ttlType`/`ttlDate`/`ttlDaysBefore`/`ttlTime` with the linked condition's own rule. No conflict modal, no confirmation.

**Failure scenario**: PNR has NAME DL manually locked to "30 days before travel." Linked condition's rule says "45 days before." User opens Edit PNR (doesn't touch NAME DL fields) → NAME DL silently becomes 45 days → user saves without noticing → `lockTtlOnPnrSave` records this as `TTL_UPDATED_MANUALLY`, misattributing an unintended system-driven change to the user.

**Root cause**: `ttlUserModified` is a same-session UI flag, not derived from the PNR's persisted `appliedCondition.ttlLocked`.

**Directly violates the user's explicit invariant** (report §14: "ห้ามเขียนทับ NAME DL เดิมโดยอัตโนมัติ").

---

### CRIT-02 — `calcType` mis-cast masks NAME DL logic for fixed-date conditions

**Files**: `components/tickets/detail/PNRTab.tsx:597`, `app/tickets/group/adhoc/page.tsx:231`
**Data loss risk**: Indirect (disables protection, doesn't itself destroy data)

```ts
calcType: c.condition.ttlRule.calcType as 'TRAVEL_MINUS_DAYS' | 'FIXED_DATE' | 'NONE',
```
The real `CondTtlRule.calcType` union has **no runtime value `'FIXED_DATE'`** — the actual value is `'MANUAL_DATE'`. The `as` cast doesn't transform the string, only silences TypeScript. Every consumer (`SinglePnrModal.tsx:198,240,535`) compares against the literal `'FIXED_DATE'`, which never matches. Compare the **correct** mapping already used elsewhere in the same codebase:
```ts
// components/wizard/Step4PNR.tsx:278-280 — CORRECT pattern
calcType: (c.ttlRule.calcType === 'TRAVEL_MINUS_DAYS' ? 'TRAVEL_MINUS_DAYS'
  : c.ttlRule.calcType === 'MANUAL_DATE' ? 'FIXED_DATE' : 'NONE') as ...
```

**Effect**: any condition with a fixed-custom-date NAME DL rule is silently treated as having no rule at all when passed through `PNRTab.tsx`'s single-PNR modal or the ad-hoc-add page — auto-fill never fires, conflict detection never fires. This currently *happens* to prevent CRIT-01 from triggering for this one rule type (a broken feature masking a different bug), but is its own confirmed defect and must be fixed independently.

---

### CRIT-03 — Clearing NAME DL to "ไม่ระบุ" (NONE) doesn't clear the persisted lock

**Files**: `lib/pnr-shared-utils.ts::buildDemoPnrFromForm`, lines 346-385
**Data loss risk**: Low direct loss, but causes stale-data resurfacing

```ts
let lockedTtlRule: CondTtlRule | null = null
if (v.ttlType === 'FIXED_DATE' && v.ttlDate) { ... }
else if (v.ttlType === 'DAYS_BEFORE' && ...) { ... }
// no branch for v.ttlType === 'NONE'

const appliedCondition = lockedTtlRule
  ? lockTtlOnPnrSave(existingPnr?.appliedCondition, lockedTtlRule, 'System')
  : (existingPnr?.appliedCondition ?? null)   // ← stale lock object survives
```
Flat scalar fields correctly clear, but `appliedCondition.ttlLocked` (the field that actually drives conflict detection) is left untouched at `true` with the old rule. **Failure scenario**: user explicitly clears NAME DL to NONE and saves; UI shows no NAME DL; later, applying/changing a Template Condition on this PNR treats it as still-locked and may resurface or auto-keep the old rule — contradicting the user's explicit clear action.

---

### CRIT-04 — Editing any field of an Override PNR silently wipes the Override

**Files**: `lib/pnr-shared-utils.ts:391-438` (returned object has no `conditionTemplateId`/`conditionOverride` keys); trigger `components/tickets/detail/PNRTab.tsx:263`; display gap `PNRTab.tsx:1164` + `pnr-shared-utils.ts:227`
**Data loss risk**: **Yes, confirmed, high** — this is the most severe single finding in this audit.

`buildDemoPnrFromForm` builds a brand-new object literal (not `{...existingPnr, ...}`) and never reads or preserves `conditionTemplateId`/`conditionOverride`. A PNR with a Direct Template Override (System B: `conditionTemplateId` set, `conditionOverride:true`, `conditionCode:''`) opened via PNRTab's Edit (pencil) button loads into `SinglePnrModal` via `pnrToFormValues`, which reads only `conditionCode` (blank for an override PNR) — so **the modal never even shows the user their real overridden condition**, displaying "ไม่ระบุ" instead. If the user edits *any* other field (e.g. seat count) and saves, the returned PNR has `conditionTemplateId`/`conditionOverride` = `undefined` — **the override is permanently gone**, silently reverted to "no condition."

---

### CRIT-05 — Opening and saving Edit Stock wizard wipes all PNR Overrides and NAME DL history

**Files**: `lib/demo-storage.ts::demoStockToWizardState` (doesn't read `conditionTemplateId`), `wizardStateToDemoStock` (doesn't reconstruct System B fields), `app/tickets/[id]/edit/page.tsx::mergePnrMetadata` (lines 252-278, whitelist omits `conditionTemplateId`/`conditionOverride`/`appliedCondition`)
**Data loss risk**: **Yes, confirmed, high, broad blast radius** — affects the *entire* Series, not just the edited PNR.

Simply opening Edit Stock (even editing only Step 1 Stock Info, never touching PNRs) and saving will, for **every** PNR in that Series:
- Wipe `conditionTemplateId`/`conditionOverride` for any PNR with a Direct Template Override (same class of loss as CRIT-04, via a different code path).
- Flatten `appliedCondition`'s `history`/`source`/`sourceTemplateId` bookkeeping even for non-override PNRs, since `wizardStateToDemoStock` always calls `lockTtlOnPnrSave(null, lockedRule, 'System')` — fresh, `existing=null` — instead of merging with the PNR's prior `appliedCondition`. The scalar `ttlDate`/`ttlTime` values are usually preserved by coincidence (recomputed the same way), but the **audit trail (`history[]`) is lost**.

`mergePnrMetadata` exists specifically to restore fields the wizard round-trip doesn't reconstruct (it already whitelists `pnrId`, `seatUsed`, `pnrStatus`, `activatedAt`, etc.) but its whitelist is missing exactly the three fields this bug needs.

---

### CRIT-06 — Add Stock wizard has no Conditions step at all

**Files**: `app/tickets/add/page.tsx` (entire file — only imports `Step1StockInfo`, `Step2Sectors`, `Step4PNR`, `Step5Review`)
**Data loss risk**: No data loss, but a **complete feature gap** for new stocks.

`Step3Conditions` is never rendered. `WizardState.conditions` is initialized to `[]` at line 277 and never mutated anywhere in this file. **A user creating a brand-new Series/Stock cannot select or create any Condition during creation** — they must save the stock first, then go to Edit Stock to add a Condition. This directly explains part of the reported "เลือก Template ไม่ได้" symptom for new stocks. (Re-confirmed today; originally flagged in a stale 2026-07-13 audit as issue C-02.)

---

### CRIT-07 — Review & Save shows raw internal ID instead of Condition code/name

**Files**: `components/wizard/Step5Review.tsx` lines 78-89, 110-112, 493-497
**Data loss risk**: No data loss, but a confirmed, live, user-visible display bug.

```ts
const conditionsForTable = conditionsUsed.map(c => ({ conditionId: c.id, conditionName: c.id }))
```
`conditionsUsed` is built purely from `pnrs.condition_id` groupings, never cross-referenced against `state.conditions` (the real `AppCondition[]` with actual code/name). The "Conditions ที่ใช้ใน PNR" card literally renders `{c.id}` (e.g. `CON-1699999999-abcde`) as **both** the code chip and the name. This happens in the **Edit Stock** flow especially, where `state.conditions` genuinely has the real data sitting unused in scope.

---

### CRIT-08 — Group Ad Hoc list shows blank Condition for PNRs that have one

**Files**: `app/tickets/group/adhoc/page.tsx` lines 184, 199-200, 496-501
**Data loss risk**: No data loss, but a confirmed cross-screen contradiction visible to users.

```ts
const sc = series.conditions.find(c => c.condition.conditionCode === pnr.conditionCode)
```
Matches only by exact `conditionCode`; ignores `conditionTemplateId` (Direct assignment) and never falls back to series-inherited condition when `conditionCode` is empty (the normal case for a PNR that simply inherits the Series' condition). **Same PNR** shows a resolved condition + source badge on `PNRTab` (via the correct `getEffectiveConditionForPnr`) but shows blank on this list page.

---

## 🟠 High

### HIGH-01 — Two incompatible "Condition assignment" systems coexist on `DemoPNR`

System A (`conditionCode` flat string — used by SinglePnrModal, BulkPnrBuilder, Step4PNR/wizard) vs System B (`conditionTemplateId` + `conditionOverride: boolean` — used only by PNRTab/`condition-usage.ts`). `getEffectiveConditionForPnr` (the one correct reconciler) resolves by field-presence priority, **never actually reading `conditionOverride`** — the boolean is reporting-only. This split is the root architectural cause of CRIT-04/CRIT-05/CRIT-08.

### HIGH-02 — BulkPnrBuilder's post-generation bulk-apply has zero NAME-DL conflict checking

**File**: `components/shared/BulkPnrBuilder.tsx::applyBulk('cond')`, lines ~750-762. Sets `conditionCode` on every selected row unconditionally, doesn't recompute TTL to match, no per-row `ttlUserModified` tracking exists on `InternalRow` at all. Asymmetric with the pre-generation shared-config `<select>`, which *is* conflict-checked.

### HIGH-03 — Bulk condition-change auto-resolves conflicts to "keep" without pre-confirmation visibility, and offers no per-item granularity

**File**: `components/tickets/detail/PNRTab.tsx` `condChangeConfirm` flow, lines 1316-1348. Conflict count is computed only *inside* the confirm-click handler and surfaced solely as a post-hoc toast — not shown before the user commits. Only two outcomes exist: "ยืนยันการเปลี่ยน" (apply to the whole batch, auto-keep NAME DL on any conflict) or Cancel. **Does not implement the required 4-way choice** ("อัปเดตทั้งหมด / อัปเดตเฉพาะรายการที่เลือก / เก็บค่าเดิม / ยกเลิก") from the report's §8.

### HIGH-04 — Two TTL date-calculation engines with different timezone behavior

`lib/condition-schema.ts::calcCondTtlDate`/`calcCondTtlDateAdjusted` (NOT noon-anchored, `new Date(str)`+UTC `toISOString()`) vs `lib/ttl-utils.ts::calcTtlDateFromTravel` (noon-anchored, correct). `previewTemplateMergeForPnr`'s conflict detection (`currentIso`/`templateIso`) uses the drift-prone one; `scalarsFromAppliedCondition` (what's actually persisted) uses the correct one. In timezones behind UTC, the conflict check can disagree with the value that would actually be saved.

### HIGH-05 — NAME DL audit-trail fields are write-only; re-editing a shifted date loses the true original

`components/shared/TtlField.tsx` / `TtlEditor.tsx` never read `ttlDateOriginal`/`ttlHolidayAdjusted`/`ttlHolidayAdjustReason` (populated correctly elsewhere, e.g. `BulkPnrBuilder.tsx`, `demo-storage.ts`) — both components always live-recompute from current `travelDate` + current holiday config. Additionally `TtlEditor.tsx:39` seeds its editable date field from the **already-adjusted** `ttlDate`, not `ttlDateOriginal` — re-opening and re-saving without touching the date silently makes the shifted date the new "original" for future recalculation.

### HIGH-06 — Remaining raw ticket-type comparison bug (space mismatch)

**File**: `components/tickets/detail/PNRTab.tsx:521` — `t.ticketType !== liveStock.ticketType` compares `'Ticket+Land'` (template, no space) against `'Ticket + Land'` (stock, with space) directly, unlike the already-fixed patterns elsewhere (`condition-storage.ts::templateTicketTypeMatchesStock`, `ConditionsTab.tsx` via `getStockTypeConfig`). Silently excludes all Ticket+Land templates from the PNR-direct-assignment picker for Ticket (Land) stocks.

### HIGH-07 — Template storage layer enforces no invariants; delete has no in-layer usage guard

`lib/condition-storage.ts::saveConditionTemplate` does an unconditional overwrite with no version/createdAt enforcement (relies entirely on caller discipline). `deleteConditionTemplate` is a **hard delete** with **zero usage-safety check inside the storage function itself** — protection exists only in the UI (list/detail pages disable the delete button when in-use). Any other/future code path calling `deleteConditionTemplate` directly bypasses this entirely.

### HIGH-08 — Stock Detail's own tabs disagree on "PNR without condition" count

`components/tickets/detail/SummaryTab.tsx` lines 174-180 counts via raw `p.conditionCode` only (ignoring `conditionTemplateId`/series-inheritance), while `PNRTab.tsx` (same page, different tab) computes the correct effective condition via `getEffectiveConditionForPnr`. Same stock, same PNRs, contradictory numbers on two tabs of one page.

### HIGH-09 — ConditionsTab never shows NAME DL for a Series' condition

`components/tickets/detail/ConditionsTab.tsx` imports `formatTtlRule` but never calls it. A user browsing a Series' Conditions tab cannot see the NAME DL rule at all (only visible via the separate "compare to template" diff view), unlike the Template List/Detail pages which prominently show it for the same underlying data.

---

## 🟡 Medium

| ID | Finding | File(s) |
|---|---|---|
| MED-01 | Template List page hardcodes literal "Group" for ticketType badge/footer regardless of actual value (could be `'All'`); Detail page for the same template shows the real value | `app/tickets/condition-templates/page.tsx:394-396,578` vs `[id]/page.tsx:366` |
| MED-02 | Detail page's Active/Inactive toggle skips the "N Series/PNR affected" warning the List page shows for the identical action | `condition-templates/[id]/page.tsx:264-270` vs `page.tsx:262-283` |
| MED-03 | Archive toggle only reachable one-at-a-time from Template Detail; List page has no Archive button | `condition-templates/page.tsx` vs `[id]/page.tsx:272-316` |
| MED-04 | `PNRSeatsTable`'s `conditions` prop type structurally carries only `{conditionId, conditionName}` — code/status can never be shown in this shared table | `components/shared/PNRSeatsTable.tsx` (prop type, line ~122) |
| MED-05 | `Step3Conditions`'s `ConditionCard` status badge omits the Draft→yellow branch present in Template List/Detail's three-way ternary | `components/wizard/Step3Conditions.tsx:219` |
| MED-06 | Two independent NAME-DL-conflict implementations exist (SinglePnrModal's local `resolveConditionTtlIso` vs. the canonical `previewTemplateMergeForPnr`) — a fix to one won't reach the other | `SinglePnrModal.tsx:237-249` vs `lib/pnr-applied-condition.ts` |
| MED-07 | Step4PNR implements a third, independently-maintained parallel data model/logic for TTL-lock derivation, separate from `buildDemoPnrFromForm` | `components/wizard/Step4PNR.tsx`, `lib/demo-storage.ts:1173-1233` |
| MED-08 | Naming drift: "condition code" spelled 4 different ways across the codebase (`conditionId`/`condition_id`/`conditionCode`/`code`) | multiple, see `condition-source-of-truth.md` |
| MED-09 | `app/tickets/[id]/page.tsx`'s `pnrRows` is a third, independent, incomplete condition-resolver — currently dead code, but a landmine if wired up later | `app/tickets/[id]/page.tsx:182-189` |
| MED-10 | `CondTemplateTicketType` (live) vs `ConditionTemplateTicketType` (dead, types/index.ts) — near-identical names, different literal spacing | `condition-schema.ts:749` vs `types/index.ts` |
| MED-11 | Two unrelated "version" concepts share the field name `version` (`AppConditionTemplate.version:number` vs `AppCondition.version:string`) | `condition-schema.ts:753,687` |
| MED-12 | CLAUDE.md states "PNR cannot link to Condition Templates directly" — directly contradicted by the live `conditionTemplateId` Direct-assignment feature | `CLAUDE.md` vs `PNRTab.tsx`/`condition-usage.ts` |
| MED-13 | Editing a Series' Applied Condition never cascades to PNRs automatically — only the separate, explicit Bulk Condition Change action does | `ConditionsTab.tsx` (confirmed via grep: no `pnrs.map`/cascade logic in this file) |
| MED-14 | First-time condition assignment to a Series skips the affected-PNR preview shown for template *changes* | `ConditionsTab.tsx::handleUseTemplate` |
| MED-15 | Removing a Series condition doesn't clean up PNRs pointing at it (orphaned code shown silently); affected-PNR count in the confirm dialog is inaccurate with multiple conditions | `ConditionsTab.tsx::handleRemoveCondition`, line ~562 |
| MED-16 | `getDemoStocks()` runs a full migration pipeline on every read; `saveDemoStock()` re-persists **all** stocks through the same pipeline on every single save — large blast radius for any latent migration-heuristic bug | `lib/demo-storage.ts` |

---

## 🔵 Low (dead code / naming smell — no functional risk, listed for completeness per audit scope)

| ID | Finding |
|---|---|
| LOW-01 | `lib/template-storage.ts`, `ConditionTemplateForm.tsx`, `SharedStageCard.tsx` — fully dead legacy Template storage subsystem, zero remaining live imports |
| LOW-02 | `lib/airline-condition-presets.ts` + `lib/airline-preset-storage.ts` — dead "airline preset" subsystem, never wired into live template creation |
| LOW-03 | `app/api/tickets/route.ts`/`[id]/route.ts` + legacy Supabase types in `types/index.ts` — dead, no page fetches them |
| LOW-04 | `AppCondition.status: 'Draft'` is effectively unreachable in the Template flow (`defaultCondition()` hardcodes `'Active'`) |
| LOW-05 | "No version bump" save choice on Template edit is cosmetic only — there's no real retrievable version history, so any brand-new future assignment always gets the latest content regardless of the user's choice |

---

## Do NOT fix without a decision (see `condition-open-questions.md`)

CRIT-06 (Add Stock missing Conditions step) and HIGH-01 (System A/B unification) are **architecture decisions**, not simple bug fixes — they require the user's explicit sign-off before implementation per the audit's own ground rules (§14: "ห้ามสร้างระบบ Condition ซ้ำอีกชุด", "ห้ามเปลี่ยน Template แล้วกระทบ PNR เดิมโดยไม่ยืนยัน").
