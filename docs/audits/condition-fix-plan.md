# Condition System — Fix Plan (Decisions Recorded 2026-07-30 — Ready to Execute)

> **Phase 1 Read-Only Audit** | Audited: 2026-07-30 | Decisions recorded: 2026-07-30 | **No code has been changed yet.**
> All blocking product decisions are now resolved except Q-05 (Phase 4 only) — see `condition-open-questions.md`.

## Guiding constraints (from the user's explicit rules)

- No clearing of existing data.
- No database/schema changes without a migration plan (moot today — no real DB is in use for this feature; see `condition-data-model-audit.md`).
- No second parallel Condition system — fixes must unify onto the existing model (confirmed: **System B**, `conditionTemplateId`/`conditionOverride`), not add a third.
- No Mock Data to make screens "look" populated.
- No UI-only fixes without checking the underlying (localStorage) logic.
- Never auto-overwrite an existing NAME DL.
- Never let a Template/Condition change silently affect existing PNR data without confirmation.
- Do not remove any function until every consuming screen is verified.
- **New (from Q-07)**: multi-tab concurrent editing is a real, confirmed usage pattern. Every fix that reads-then-writes `DemoStock`/`DemoPNR` must re-read the latest persisted state immediately before merging fields, rather than trusting an in-memory snapshot taken when a modal/page first opened. This does not eliminate the race entirely (no full locking exists), but minimizes the window. A full concurrency solution is explicitly out of scope for this fix (see `condition-open-questions.md` Q-07).

## Phase 0 — No-decision-needed, isolated, low-risk fixes

These are pure bug fixes with a single obviously-correct behavior, touching one function/file each, no architecture decision required. Safe to do first once approved.

| Order | Bug | Fix | Files touched | Risk |
|---|---|---|---|---|
| 1 | CRIT-02 | Replace the `as 'FIXED_DATE'` cast with the correct `calcType==='MANUAL_DATE' ? 'FIXED_DATE' : ...` mapping (mirror `Step4PNR.tsx:278-280`'s existing correct pattern) | `PNRTab.tsx:597`, `app/tickets/group/adhoc/page.tsx:231` | Low — makes a currently-dead code path live; must re-verify CRIT-01 fix lands together (see Phase 1) or this alone will newly expose CRIT-01 for fixed-date rules |
| 2 | HIGH-06 | Normalize the ticket-type comparison at `PNRTab.tsx:521` to use `getStockTypeConfig(liveStock.ticketType, liveStock.groupType)?.ticketType` (same pattern as `ConditionsTab.tsx`), instead of comparing raw fields | `PNRTab.tsx:521` | Low |
| 3 | CRIT-07 | `Step5Review.tsx`'s "Conditions used" card: resolve `pnr.condition_id` against `state.conditions` (lookup by `conditionId`) instead of displaying the raw ID as both code and name | `components/wizard/Step5Review.tsx:78-89,110-112,493-497` | Low — display-only fix |
| 4 | CRIT-08 | `group/adhoc/page.tsx`: replace the ad-hoc exact-match resolver with `getEffectiveConditionForPnr(pnr, series, allTemplates)` | `app/tickets/group/adhoc/page.tsx:184,199-200` | Low-Medium — needs `allTemplates` to be loaded on this list page (currently may not be); verify perf impact of loading templates on a list page with many rows |
| 5 | HIGH-08 | `SummaryTab.tsx`'s condition-coverage count: use `getEffectiveConditionForPnr` (or at minimum also check `conditionTemplateId`) instead of raw `p.conditionCode` | `components/tickets/detail/SummaryTab.tsx:174-180` | Low |
| 6 | HIGH-09 | `ConditionsTab.tsx`: actually render `formatTtlRule(condition.ttlRule)` somewhere in the condition card (it's already imported) | `components/tickets/detail/ConditionsTab.tsx` | Low — additive UI only |
| 7 | MED-01 | Template List page: replace hardcoded "Group" text with the real `t.ticketType` value (or a proper label map including `'All'`) | `app/tickets/condition-templates/page.tsx:394-396,578` | Low |
| 8 | MED-02 | Add the same "N Series/PNR affected" warning to the Detail page's deactivate action that the List page already has | `app/tickets/condition-templates/[id]/page.tsx` | Low |
| 9 | MED-03 | Add an Archive button to the Template List page (reuse `setConditionTemplateArchived`) | `app/tickets/condition-templates/page.tsx` | Low |
| 10 | MED-05 | Add the missing Draft→yellow branch to `Step3Conditions.tsx`'s status badge ternary, matching Template List/Detail | `components/wizard/Step3Conditions.tsx:219` | Low |
| 11 | HIGH-04 | Route `previewTemplateMergeForPnr`'s `currentIso`/`templateIso` computation through the noon-anchored `calcTtlDateFromTravel`/`calcTtlDateFromTravelAdjusted` (ttl-utils.ts) instead of `calcCondTtlDate`/`calcCondTtlDateAdjusted` (condition-schema.ts), matching what `scalarsFromAppliedCondition` already does | `lib/pnr-applied-condition.ts` | Medium — touches the shared conflict-detection function; must re-run existing TTL/holiday unit tests |
| 12 | MED-15 | **Per Q-04**: before removing a Condition from a Series, show a detailed confirmation listing every affected PNR by name/code and exactly what will change for it (not just a count), then — only on explicit confirm — reset those PNRs back to no-condition/Series-default. Re-read the latest `liveStock.pnrs` immediately before building this list (multi-tab safety, Q-07). | `components/tickets/detail/ConditionsTab.tsx::handleRemoveCondition` | Medium — new confirmation UI needed (reuse the `PNRImpactModal` listing pattern already used for sector changes if applicable) |

## Phase 1 — NAME DL lock unification (requires sign-off: touches the core invariant)

**Goal**: make "NAME DL must never be silently overwritten" true everywhere, not just in PNRTab.

1. **CRIT-01**: In `SinglePnrModal.tsx`, replace the local `ttlUserModified` session flag (for `mode==='edit_pnr'`) with a derived value seeded from `editingPnr?.appliedCondition?.ttlLocked` on open — so the auto-fill effect never fires for an already-locked PNR without going through the conflict-check path first (reuse `previewTemplateMergeForPnr` instead of the modal's own local `resolveConditionTtlIso`, folding in MED-06 at the same time).
2. **CRIT-03**: In `buildDemoPnrFromForm`, add the missing `v.ttlType === 'NONE'` branch that explicitly clears/unlocks `appliedCondition` (set `ttlLocked:false` or `null`, with a new history entry `TTL_CLEARED`) instead of leaving the prior lock object untouched.
3. **HIGH-02**: In `BulkPnrBuilder.tsx`'s post-generation `applyBulk('cond')`, add the same conflict-check pattern already used by the pre-generation shared-config select (requires adding a per-row `ttlUserModified`-equivalent flag to `InternalRow`, or conservatively: always recompute each row's TTL to match the newly applied condition and surface a single "N rows had a different NAME DL — kept as-is" summary, mirroring PNRTab's bulk behavior).

**Testing**: TC-04, TC-05, TC-06, TC-07, TC-19 from `condition-test-cases.md` must all pass after this phase, plus re-run `lib/__tests__/ttl-modal.test.ts` / any existing pnr-applied-condition tests.

## Phase 2 — Override (System A/B) unification — ✅ **APPROVED: unify onto System B**

**Goal**: fix CRIT-04 and CRIT-05 permanently by making Override a single, consistently-respected concept everywhere, per the user's explicit "D. Override" architecture requirement and the confirmed decision (Q-02/Q-03) that PNR-direct-template-linking (System B: `conditionTemplateId`/`conditionOverride`) is the intentional, canonical model.

Approach:

1. Add a single helper, e.g. `lib/pnr-shared-utils.ts::applyConditionSelection(pnr, selection)`, that is the **only** function allowed to change a PNR's condition — it always sets `conditionCode`/`conditionTemplateId`/`conditionOverride` together and never leaves one stale relative to the others.
2. `buildDemoPnrFromForm` must preserve `conditionTemplateId`/`conditionOverride`/`appliedCondition` from `existingPnr` by default (spread-then-override, not build-from-scratch), and only clear them when the user explicitly changes the condition through the new shared helper. Per Q-07, re-fetch `existingPnr` fresh from storage right before merging, not from a stale prop passed in when the modal opened.
3. `mergePnrMetadata` (Edit Stock wizard round-trip) must add `conditionTemplateId`, `conditionOverride`, and `appliedCondition` (full object, not just scalars) to its restoration whitelist — **this is the CRIT-05 stop-gap and should ship first, immediately, on its own**, ahead of the rest of Phase 2 (see execution order below).
4. `SinglePnrModal`/`BulkPnrBuilder`'s Condition `<select>` should visually distinguish "inherited from Series" vs "PNR override" (small badge), reusing `getEffectiveConditionForPnr`'s classification, so users are never blind to an existing override (fixes the display half of CRIT-04, independent of the data-loss half).
5. Update `CLAUDE.md`'s Condition rule to reflect the now-confirmed intentional PNR-direct-override exception (Q-03) — a one-line doc correction, no code risk.

## Phase 3 — ❌ **DROPPED** (Q-01: Add Stock will not get a Conditions step)

CRIT-06 is reclassified as working-as-intended. No action.

## Phase 4 — Bulk-change UX — ✅ **APPROVED: per-conflict granularity**

HIGH-03 fix, per Q-05's resolved decision: in `PNRTab.tsx`'s bulk condition-change flow —

1. Compute `previewTemplateMergeForPnr` for every selected PNR **before** showing the confirmation dialog (not inside the click handler as today), so conflicts are known upfront.
2. PNRs with no conflict (`hasConflict === false`) are queued for automatic update — no extra prompt needed for these.
3. PNRs with a conflict are listed individually in the confirmation UI, each with its own Keep-existing / Use-new-template choice, plus a shortcut button "ใช้ตัวเลือกนี้กับทุกรายการที่ชน" (apply this choice to all conflicting ones).
4. Only after all conflicting PNRs have an explicit choice (individually or via the shortcut) does "ยืนยันการเปลี่ยน" become enabled.
5. Per Q-07 (multi-tab safety): re-run `previewTemplateMergeForPnr` against freshly-read PNR state right before applying, in case another tab changed a PNR's lock state while this dialog was open — if a previously-no-conflict PNR now conflicts, surface it rather than silently overwriting.

## Phase 5 — Cleanup (no functional risk, do last)

- LOW-01/LOW-02/LOW-03: confirm with one more full-repo grep immediately before removal (per the "don't remove until verified unused" rule) and delete `lib/template-storage.ts`, `ConditionTemplateForm.tsx`, `SharedStageCard.tsx`, `lib/airline-condition-presets.ts`, `lib/airline-preset-storage.ts` in one isolated commit with no other changes, so it's trivially revertable if something surprising still depends on them.
- MED-10/MED-11: rename one of the colliding type names (`CondTemplateTicketType` vs dead `ConditionTemplateTicketType`; `AppCondition.version` vs `AppConditionTemplate.version`) for future clarity — cosmetic, no runtime behavior change, safe to batch with the dead-code removal commit.

## Database Migration

**None required.** This entire feature area is `localStorage`-only today (see `condition-data-model-audit.md`). All proposed fixes above operate on the existing JSON field shapes already present on `DemoPNR`/`DemoStock` — no new fields need to be added to unblock Phase 0/1/2 (the fields `conditionTemplateId`/`conditionOverride`/`appliedCondition` already exist in the type, they're just not consistently read/written). If the product later decides to migrate this feature to a real Supabase-backed schema, see the migration-shape recommendations at the end of `condition-data-model-audit.md` — that would be a separate, much larger initiative requiring its own plan.

## Suggested execution order (all decisions resolved — ready to implement)

1. Ship the **CRIT-05 stop-gap** (Phase 2, point 3 — `mergePnrMetadata` whitelist fix) immediately, as its own tiny, isolated fix — highest data-loss risk, smallest possible diff.
2. Ship Phase 0 (12 isolated fixes) — no dependencies, immediate value.
3. Ship Phase 1 (NAME DL lock unification).
4. Ship the remainder of Phase 2 (full Override unification onto System B) + the `CLAUDE.md` correction.
5. Ship Phase 4 (bulk-change per-conflict UX).
6. Ship Phase 5 cleanup (dead code removal, naming smells) — isolated, last.
7. Phase 3 — dropped, nothing to ship.

**Nothing remains blocked.** Awaiting your go-ahead to begin implementation.
