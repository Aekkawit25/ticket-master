# Condition System — Data Model & Relationship Audit

> **Phase 1 Read-Only Audit** | Audited: 2026-07-30
> No real database/FK schema exists for this feature (confirmed — see `condition-system-current-flow.md` §0). This document audits the equivalent TypeScript type relationships enforced (or not) in `localStorage` JSON structures.

## Type reference table

| Type | File | Key fields |
|---|---|---|
| `AppCondition` | `lib/condition-schema.ts:672` | `conditionId, conditionCode, conditionName, status:'Active'|'Inactive'|'Draft', airline, currency, version:string('V1'), stages:CondStage[], ttlRule:CondTtlRule, issuanceMode, ticketDlRule, baggagePolicy, seatReductionPolicy, refundTerms, ...` |
| `AppConditionTemplate` | `lib/condition-schema.ts:751` | `templateId, version:number, createdAt, updatedAt, templateType, airlineCode:string|null, airlines:string[]|null, ticketType:CondTemplateTicketType, currency, condition:AppCondition, isArchived?:boolean` |
| `AppStockCondition` | `lib/condition-schema.ts:768` | `source:'custom'|'template', sourceTemplateId?, sourceTemplateName?, sourceTemplateVersion?, appliedAt?, appliedBy?, locallyModified?, overrideFields?, overrideAt?, overrideBy?, condition:AppCondition` |
| `PnrAppliedCondition` | `lib/pnr-applied-condition.ts:45` | `ttlRule:CondTtlRule, ttlLocked, otherConditionSnapshot?:AppCondition|null, sourceTemplateVersion?, history:PnrTtlHistoryEntry[]` |
| `DemoStock` | `lib/demo-storage.ts:430` | `stockId, stockCode, ticketType:TicketType, groupType?:'SERIES'|'ADHOC', airlineCode, currency, sectors, flightSets?, conditions:AppStockCondition[], pnrs:DemoPNR[]` |
| `DemoPNR` | `lib/demo-storage.ts:359` | `pnrId, pnrCode, dummyPnr, flightSetId?, conditionCode:string, ttlType?/ttlDate/ttlTime/ttlDateTime, appliedCondition?:PnrAppliedCondition|null, conditionTemplateId?:string|null, conditionOverride?:boolean` |
| `CondTemplateTicketType` | `condition-schema.ts:749` | `'Group'|'FIT'|'Ticket+Land'|'All'` (no space) |
| `TicketType` | `types/index.ts` | `'Group'|'FIT'|'Ticket + Land'` (**with** space) |
| Legacy (dead) | `types/index.ts` | `FlightSeries, FlightCondition, FlightConditionStage, ConditionTemplate, ConditionTemplateStage, PaymentSchedule` — Supabase-shaped, unused by any live page |

## Relationship checklist (per user's 7 requirements)

| # | Requirement | Supported? | Evidence |
|---|---|---|---|
| 1 | 1 Template used by many Series | ✅ Yes | `AppStockCondition.sourceTemplateId` — many `DemoStock.conditions[]` entries can reference the same `templateId`; no uniqueness constraint prevents this (there is no constraint layer at all, but nothing blocks it either). |
| 2 | 1 Series has many Applied Conditions | ✅ Yes | `DemoStock.conditions: AppStockCondition[]` is already an array. |
| 3 | Each PNR can select a different Condition | ⚠️ Partially | System A (`conditionCode`) supports per-PNR selection from `stock.conditions[]`. System B (`conditionTemplateId`) supports per-PNR direct-template assignment. **Both exist but are not unified** — see `condition-bug-list.md` HIGH-01. |
| 4 | PNR can Override some fields | ⚠️ Partially | `conditionOverride: boolean` field exists and is correctly set/read **only** by `PNRTab.tsx`/`condition-usage.ts`. Every other PNR-entry screen (SinglePnrModal, BulkPnrBuilder, Step4PNR/wizard) neither reads nor preserves it — editing a PNR through those screens silently discards the override (CRIT-04/CRIT-05). |
| 5 | Editing a Template later must not accidentally change already-applied data | ✅ Yes, for Series | `AppStockCondition.condition` is a full deep-copy snapshot (`snapshotTemplateToCondition`), never re-read from the live template except via explicit opt-in sync. **Not fully true for PNR-level Direct assignment** — see #4; the *condition content* itself isn't re-read live either way (no live bug there), but the *link itself* (`conditionTemplateId`) can be silently destroyed by unrelated edits. |
| 6 | Applied Condition must store a Snapshot from the Template at time of use | ✅ Yes | Confirmed via `snapshotTemplateToCondition` (condition-storage.ts:236-252) for Series, and `PnrAppliedCondition` (pnr-applied-condition.ts) for PNR NAME DL. |
| 7 | NAME DL set before selecting a Condition must not be auto-overwritten | ❌ **No, in confirmed cases** | See `condition-bug-list.md` CRIT-01 (SinglePnrModal auto-fill effect on modal open) and CRIT-02 (FIXED_DATE type mapping bug that happens to mask CRIT-01 for that one rule type only). |

## ID / naming mismatch audit

| Check | Result |
|---|---|
| `template_id` vs `condition_id`/`conditionId` confused in a lookup | **No live swap found.** All `templateId` lookups (`condition-usage.ts`, `condition-relationship.ts`, `ConditionAssignModal.tsx`, `ConditionsTab.tsx`, `PNRTab.tsx`) consistently use `templateId`. One naming-collision **risk** (not a bug): the legacy/dead `FlightPNRFormData.condition_id` field name is repurposed at the wizard→DemoStock boundary (`demo-storage.ts:1160`) to mean `AppCondition.conditionId` (or `conditionCode` as fallback via a dual-keyed lookup map) — a different ID space than what the same field name means in the dead Supabase schema. No runtime impact since the dead path never executes. |
| `airline_id` vs `airline_code` | **Confirmed: no `airline_id` numeric concept exists anywhere.** Airline is identified solely by IATA code string (`airlineCode`/`airline_code`/`code`) across every layer including `lib/master-data.ts`. |
| `series_id` vs `stock_id` | **Confirmed: "Series" is not a separate ID space.** It's `ticket_type='Group' + group_type='SERIES'` filtering over the single `DemoStock`/`stockId` table (`lib/stock-type-config.ts`). Legacy `FlightSeries.id`/`series_id` is dead code, never populated. |
| `pnr_id` vs `pnr_code` | **Confirmed distinct, never swapped.** 11 lookup call sites checked (`app/tickets/[id]/page.tsx`, `condition-usage.ts`, `demo-storage.ts`, `ConditionAssignModal.tsx`, `SegmentsTab.tsx`, `PNRTab.tsx` ×3, `requisitions/create/page.tsx`, `app/pnr/page.tsx` ×2) — all correctly key on `pnrId` for identity. |
| "Group" vs "Series" raw-key comparison against template `ticketType` | **One remaining live bug found**: `components/tickets/detail/PNRTab.tsx:521` — `t.ticketType !== liveStock.ticketType` compares `CondTemplateTicketType` (`'Ticket+Land'`, no space) directly against `DemoStock.ticketType` (`'Ticket + Land'`, with space) with no normalization. Silently excludes all Ticket+Land-scoped templates from the PNR-direct-assignment picker for Ticket (Land) stocks. `'Group'`/`'FIT'` stocks are unaffected (identical literals). Every other picker in the app already normalizes this correctly via `getStockTypeConfig(...).ticketType` or `templateTicketTypeMatchesStock()`. |
| `'Active'` vs `'active'` (case) | **None found.** No lowercase status literal anywhere in the live model. |
| Boolean vs String status | **None found for the live model.** A narrower, **dead** `ConditionStatus = 'Active'|'Inactive'` (no Draft) exists in `types/index.ts` used only by the dead `lib/template-storage.ts`/`ConditionTemplateForm.tsx` — inert, not a live bug, but a trap if that dead code is ever revived without also revising the type. |
| Soft-delete fields (`deleted_at`/`archived`/`draft`/`is_deleted`) | **Confirmed: only `AppConditionTemplate.isArchived?: boolean` exists** as a real soft-delete/archival mechanism. No `deleted_at`/`archived_at`/`is_deleted` fields exist anywhere in the repo. `'Draft'` exists only as one literal value of `AppCondition.status`, not a separate field — and it is effectively unreachable in the live Template-creation flow since `defaultCondition()` hardcodes `status:'Active'` (LOW-04). |

## Two distinct "version" concepts (confirmed, not a bug today but a design smell)

1. `AppConditionTemplate.version: number` — auto-incremented template revision counter, the one all live code actually uses for staleness checks (`condition-relationship.ts`) and display (`v{template.version}`).
2. `AppCondition.version: string` — a free-text content label defaulting to `'V1'`, unrelated to revision tracking.

No code currently reads the wrong one, but the shared name is a footgun for future development (MED-11).

## Migration implications

No database migration is required today because there is no real database in use for this feature — everything is a `localStorage` JSON blob shape. **If/when this feature is migrated to a real Supabase-backed schema** (a decision explicitly flagged in `condition-open-questions.md` Q-08), the schema should:

- Model `applied_conditions` as its own table with FKs to both `stock_id` and, nullable, `pnr_id` (so a Series-level and PNR-level applied condition share one shape).
- Add an explicit, single `override` boolean + `source_template_id` (nullable) on the PNR-level applied-condition row — do **not** repeat the current dual-field (`conditionCode` flat string vs `conditionTemplateId`+`conditionOverride`) split.
- Store `ttl_locked`, `ttl_rule` (jsonb), and `ttl_history` (jsonb array or a separate `ttl_history` table) directly on the PNR's applied-condition row, mirroring `PnrAppliedCondition`'s shape — this part of the current design is sound and should be preserved, not redesigned.
- Normalize `ticket_type` representation once, at the boundary, so `'Ticket + Land'` vs `'Ticket+Land'` cannot both exist in the same schema.
