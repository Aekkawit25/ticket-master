# Open Questions — Add Stock → Series Wizard

> **Phase 1 Read-Only Audit** | Raised: 2026-07-13

These questions require input from stakeholders (PM / Product Owner / Lead Dev) before Phase 2 (fix planning) can proceed.

---

## Q1 — Step3Conditions: Intentionally removed or forgotten?

**Context**: `Step3Conditions.tsx` exists and is fully implemented, but is not rendered anywhere in the wizard. The wizard page (`app/tickets/add/page.tsx`) shows 4 steps: Info → Sectors → PNR → Review.

**Question**: Was removing the Conditions step from the wizard intentional?

**Options**:
- A) Yes, intentional — conditions are to be added AFTER creating the stock (in the detail page Conditions tab). The wizard creates a bare-bones stock, conditions added post-creation.
- B) No, it was accidentally omitted — it should be inserted as UI Step 3 (renaming Step4PNR → UI Step 3 and Step5Review → UI Step 4).
- C) Partially intentional — the step exists for future use but is currently disabled.

**Impact of answer**:
- If A: `conditions` field in `WizardState` should be removed or documented as always-empty. PNR condition linking during wizard is not expected to work.
- If B: `Step3Conditions` needs to be wired in; component name mismatch should be resolved.
- If C: No action now, but add a TODO comment.

---

## Q2 — Per-PNR TTL Override: Should wizard save honor it?

**Context**: `Step4PNR` lets users set TTL per-PNR via `TtlEditor`. But `wizardStateToDemoStock` ignores these values and derives TTL only from the linked condition (C-01 in audit).

**Question**: What is the intended behavior?

**Options**:
- A) Wizard TTL entries are overrides — they should take priority over condition-derived TTL on save.
- B) Wizard TTL entries are preview-only — the real TTL is always computed from condition when saving.
- C) No per-PNR TTL override is supported in the wizard; TTL is always set post-creation in the detail page.

**Impact**:
- If A: Fix `wizardStateToDemoStock` to read `p.ttl_type`/`p.ttl_date`/`p.ttl_days_before` and use those when set.
- If B: Remove TTL entry from Step4PNR (or make it read-only preview) to avoid user confusion.
- If C: Same as B, and add a note in UI "TTL is set after saving the stock".

---

## Q3 — Draft Feature: Will it be implemented?

**Context**: `saveDraft()` currently shows `alert('Draft saved!')` with no actual storage.

**Question**: Is draft-save a planned feature or a placeholder that will be removed?

**Options**:
- A) Planned feature — implement draft persistence to localStorage (separate key) or Supabase.
- B) Not planned — remove the "บันทึก Draft" button to avoid user confusion.
- C) Out of scope for now — keep the button but show a proper "ไม่รองรับในขณะนี้" message.

---

## Q4 — Stock Code Generation: Is collision prevention needed?

**Context**: `generateStockCode()` uses `Date.now()` + `prefix`. In a multi-user or multi-tab scenario, two stocks could get the same code. Also, every page mount generates a new code.

**Question**: What uniqueness guarantee is required for stock codes?

**Options**:
- A) No guarantee needed — demo mode only, collisions are acceptable.
- B) Server-generated — stock code should be assigned by Supabase/API on save, not generated client-side.
- C) Client-generated with dedup check — before showing the user a code, check existing stocks and regenerate if conflict.

---

## Q5 — Conditions Linking: Can a PNR be saved without a Condition?

**Context**: Currently all new PNRs are saved with `conditionCode: ''` because conditions are never populated in the wizard. The detail page PNR tab requires a condition to show payment schedules.

**Question**: Is a PNR without a condition valid?

**Options**:
- A) Valid — conditions are optional and can be assigned later in the detail page.
- B) Invalid — PNRs must have a condition before the stock can be Activated. Show validation error in Step4.
- C) Warning only — allow saving but warn that PNRs without conditions cannot be activated.

---

## Q6 — Edit Round-trip: Should sector date manual overrides be preserved?

**Context**: `demoStockToWizardState` does not map `dep_manual`/`arr_manual` flags back to the wizard PNR form. After editing, all manually-set sector dates are treated as auto-computed and will be overwritten on the next save.

**Question**: Should manually-set sector dates survive an edit round-trip?

**Options**:
- A) Yes — add `dep_manual`/`arr_manual` to `DemoPNR` and preserve through the round-trip.
- B) No — editing resets all sector dates to computed values; user must re-enter overrides.
- C) Partially — only preserve if the user changes a specific date field during edit.

---

## Q7 — TtlEditor vs TtlField: Which component should be canonical?

**Context**: Two TTL UI components exist:
- `TtlEditor` (`components/shared/TtlEditor.tsx`) — floating popover, used in `Step4PNR`
- `TtlField` (`components/shared/TtlField.tsx`) — inline form, used in PNRTab detail modal

**Question**: Should there be a single canonical TTL input component?

**Options**:
- A) Keep both — wizard uses popover (space-constrained table); detail modal uses inline (more space).
- B) Consolidate to `TtlField` — replace `TtlEditor` usage in `Step4PNR` with the inline version.
- C) Consolidate to `TtlEditor` — the popover pattern is preferred.

**Note**: Both support NONE/DAYS_BEFORE/FIXED_DATE. They differ in layout (popover vs inline) and date display format (comma vs middle-dot separator).

---

## Q8 — PNR Duplicate Check: Should it block save?

**Context**: Step5Review shows a duplicate PNR warning but does not prevent saving.

**Question**: Should duplicate PNRs hard-block the save action?

**Options**:
- A) Hard block — disable "Confirm & Save" button if duplicates exist.
- B) Soft block — show a confirmation modal "You have duplicate PNRs, are you sure?"
- C) Warning only (current) — show warning but allow save.

---

## Q9 — FlightSet vs Schedule: Are these the same concept?

**Context**: The system has two overlapping structures:
- `DemoFlightSet` (used in PNRTab, has `flightSetId`)
- `DemoScheduleInfo` (used in wizard Step2, has `scheduleId`)
- `DemoPNR` has BOTH `flightSetId?` and `scheduleId?`

**Question**: Are these two distinct concepts or the same concept with two names?

**Clarification needed**:
- When a PNR links to a `schedule_id` in the wizard, should that map to a `flightSetId` in the detail page?
- Should the wizard create `DemoFlightSet` entries from `DemoScheduleInfo`?
- Or should PNRTab be changed to look up by `scheduleId` instead of `flightSetId`?

---

## Q10 — Stock Status at Wizard Save: Always 'Draft'?

**Context**: New stocks always save with `status: stockInfo.status`. `stockInfo.status` is initialized to `'Draft'` and there is no UI to change it in the wizard.

**Question**: Should users be able to save directly as 'Active' from the wizard?

**Options**:
- A) Always Draft — the wizard creates Draft stocks; Activation is a separate action.
- B) Optional — add a "Save as Active" button that triggers the DraftToActiveModal.
- C) Conditional — if all required fields are complete, offer "Save as Active" option.

---

## Q11 — Per-PNR Currency: Is it intended to differ from stock currency?

**Context**: Each PNR in `Step4PNR` has its own `currency` field (via `CurrencyCombobox`). This can differ from `stockInfo.currency`. The currency-change confirmation modal handles this.

**Question**: Is per-PNR currency a supported feature or a bug?

**Options**:
- A) Supported — different PNRs can have different currencies (e.g., mixed THB/USD bookings).
- B) Not supported — all PNRs must use the stock's currency; remove per-PNR currency field.
- C) Supported with restrictions — per-PNR currency for display only; summaries always use stock currency.

---

## Q12 — Conditions in Wizard: Should conditions be created inline or selected from templates?

**Context**: `Step3Conditions.tsx` exists but is unwired. It's unclear whether the intent was:
- Users create conditions from scratch in the wizard
- Users select from existing templates
- Conditions are always managed separately (Settings → Conditions)

**Question**: What is the intended conditions workflow during stock creation?
