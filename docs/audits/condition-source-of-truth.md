# Condition System — Source of Truth Map

> **Phase 1 Read-Only Audit** | Audited: 2026-07-30
> See `condition-system-current-flow.md` for flow context, `condition-bug-list.md` for defects referenced by ID.

## Where each data type actually lives

| Data | Canonical field(s) | Storage | Notes |
|---|---|---|---|
| **Template Condition** | `AppConditionTemplate` (whole object) | `localStorage['app_condition_templates']` via `lib/condition-storage.ts` | Single, real source of truth. Legacy `lib/template-storage.ts` key `ticket_stock_condition_templates` is **dead** — no live page reads/writes it (one prior live consumer, Airlines-detail page, already migrated off it). |
| **Applied Condition of Series** | `DemoStock.conditions: AppStockCondition[]` | `localStorage['ticket_stock_demo_data']` via `lib/demo-storage.ts` | Full deep-copy snapshot of the `AppCondition` at apply time (`snapshotTemplateToCondition`), plus `sourceTemplateId`/`sourceTemplateVersion`/`locallyModified`/`overrideFields` metadata. Never re-reads the live template except via the explicit opt-in "sync" action. |
| **Applied Condition of PNR** | **Split across two incompatible fields** — see below | same | **Not a single source of truth today.** This is the #1 architectural risk (`condition-bug-list.md` HIGH-01). |
| **Condition Code** | `AppCondition.conditionCode` | inside whichever snapshot holds the condition (template, stock-condition, or the PNR's own copy) | Also aliased as `code` in `PnrModalCondition`/`BulkPnrCondition` (SinglePnrModal/BulkPnrBuilder's own local types) and `condition_id`/`condition_code` in legacy/wizard-adjacent code. See naming table below. |
| **Template ID** | `AppConditionTemplate.templateId` | `condition-storage.ts` | Consistently used everywhere for template identity (verified no swap with `conditionId`). |
| **Series ID** | *(does not exist as a separate concept)* | — | "Series" is **not** a distinct ID space — it is `DemoStock` rows where `ticketType==='Group' && groupType==='SERIES'` (`lib/stock-type-config.ts::getStockTypeKey`). The real ID is `DemoStock.stockId` (business code: `stockCode`). |
| **Stock ID** | `DemoStock.stockId` / `stockCode` | `demo-storage.ts` | The one real table; Series/Group Ad Hoc/FIT/Ticket(Land) are all filtered views of this same array. |
| **PNR ID** | `DemoPNR.pnrId` (internal) vs `DemoPNR.pnrCode`/`dummyPnr` (airline-issued/display) | `demo-storage.ts` | Confirmed two genuinely different fields, never swapped in any lookup found (11 call sites checked). |
| **NAME DL Rule** | `AppCondition.ttlRule: CondTtlRule` (the rule definition, e.g. "N days before") | inside whichever condition snapshot | This is the *template-level* rule. |
| **NAME DL actual date in use** | `DemoPNR.ttlDate`/`ttlTime`/`ttlDateTime` (flat, denormalized) **+** `DemoPNR.appliedCondition: PnrAppliedCondition` (locked rule + full history) | `demo-storage.ts` | Two representations of the same fact: `PnrAppliedCondition` is the authoritative locked/audited value; the flat `ttl*` fields are a denormalized projection kept in sync by `scalarsFromAppliedCondition`. Display components (`TtlField`, `TtlEditor`) read **neither** the flat snapshot's original/adjusted/reason fields nor `appliedCondition` — they always **live-recompute** from current `travelDate` + current holiday config (`condition-bug-list.md` HIGH-05). |
| **Override** | `DemoPNR.conditionTemplateId` + `DemoPNR.conditionOverride: boolean` | `demo-storage.ts` | Only written/read by `PNRTab.tsx` / `lib/condition-usage.ts` / `lib/condition-relationship.ts`. Every other PNR-entry screen is unaware of these fields and can silently wipe them (`condition-bug-list.md` CRIT-04/CRIT-05). |
| **Version (template revision)** | `AppConditionTemplate.version: number` | `condition-storage.ts` | Auto-incremented counter; NOT an actual retrievable version history — just a label. |
| **Version (content label)** | `AppCondition.version: string` (e.g. `'V1'`) | inside the condition object | A **second, unrelated** concept sharing the word "version" — confirmed no live code confuses the two, but see MED-11. |
| **Status (Template/Condition)** | `AppCondition.status: 'Active'\|'Inactive'\|'Draft'` | inside the condition object | Lives on the **condition**, not on `AppConditionTemplate` itself. Template archival is a separate, orthogonal boolean (`isArchived`). No lowercase `'active'` or competing boolean `isActive` field found anywhere in the live model. |
| **Airline** | `airlineCode` (IATA string, e.g. `'TG'`) | various (`AppConditionTemplate.airlineCode`, `DemoStock.airlineCode`, `AppCondition.airline`) | **No numeric `airline_id` concept exists anywhere in this codebase.** Airline is identified solely by IATA code string, everywhere, including `lib/master-data.ts`. |
| **Ticket Type** | `CondTemplateTicketType` (`'Group'\|'FIT'\|'Ticket+Land'\|'All'`, no space) on templates vs `TicketType` (`'Group'\|'FIT'\|'Ticket + Land'`, **with space**) on stocks | `condition-schema.ts` / `types/index.ts` | The space-vs-no-space mismatch is a real, confirmed bug in one remaining spot (`PNRTab.tsx:521` — HIGH-06). Elsewhere already normalized via `getStockTypeConfig(...).ticketType` or `templateTicketTypeMatchesStock()`. |

## Per-screen data source audit

| Screen | Reads condition data from | Classification |
|---|---|---|
| `app/tickets/condition-templates/page.tsx` (list) | `getConditionTemplates()` (localStorage, live) | ✅ Database-equivalent (localStorage), single source |
| `app/tickets/condition-templates/[id]/page.tsx` (detail) | `getConditionTemplateById(id)` (same source) | ✅ |
| `app/tickets/condition-templates/add/page.tsx` / `[id]/edit/page.tsx` | same | ✅ |
| `Step3Conditions.tsx` (Edit Stock wizard) | `getConditionTemplates()` + `filterActiveTemplatesForStock` (same source, fixed in prior task) | ✅ |
| `ConditionsTab.tsx` (Stock Detail) | `getConditionTemplates()` + `filterActiveTemplatesForStock` (same source, fixed in prior task) | ✅ |
| `PNRTab.tsx` | `getConditionTemplates()` directly, own inline filter (`t.ticketType !== liveStock.ticketType`) | ⚠️ Same source, but **own ad-hoc filter with the space-mismatch bug** (HIGH-06) |
| `app/settings/airlines/[id]/page.tsx` (Templates tab) | `getConditionTemplates()` from `lib/condition-storage.ts` (fixed in prior task — was previously reading the dead `lib/template-storage.ts`) | ✅ (post-fix) |
| `SinglePnrModal.tsx` / `BulkPnrBuilder.tsx` | Condition list passed in as **props** by the parent screen (`PNRTab`/`Step4PNR`/`app/tickets/[id]/edit/page.tsx`), which itself derives from `liveStock.conditions`/`state.conditions` | ✅ Same ultimate source, no separate fetch, no mock data |
| `Step5Review.tsx` | **Does not read `state.conditions` for its "Conditions used" card at all** — derives from raw `pnr.condition_id` groupings only | ❌ Bug (CRIT-07) — data exists in scope but is bypassed |
| `SummaryTab.tsx` | `liveStock.conditions` (correct source) but a **separate ad-hoc count** (`pnrs.map(p => p.conditionCode)`) that ignores System B override fields | ⚠️ Same source, incomplete logic (HIGH-08) |
| `group/adhoc/page.tsx` (list) | `series.conditions.find(...)` exact-match only, ignores `conditionTemplateId`/inheritance | ⚠️ Same source, incomplete logic (CRIT-08) |
| `app/tickets/[id]/page.tsx` `pnrRows` | Own ad-hoc resolver, same source, but currently **dead code** | ⚠️ Latent risk only |
| `PNRSeatsTable.tsx` | `conditions` prop (`{conditionId, conditionName}[]`) passed by parent — same ultimate source, but the type itself cannot carry code/status | ⚠️ Structural display gap, not a wrong-source bug |

**No screen anywhere reads from Mock Data or a separately-cached/stale Local Storage key for condition content** (once the prior Airlines-detail-page fix is accounted for). Every remaining inconsistency is a **logic/resolution bug reading the correct source incompletely**, not a wrong-source bug — this is an important distinction for the fix plan: most fixes are "use the shared resolver" refactors, not data-migration.

## Naming inconsistency inventory (same concept, different field name)

| Concept | Names found | Where |
|---|---|---|
| Condition code/identity | `conditionCode`, `condition_id`, `conditionId`, `code` | `AppCondition.conditionCode`; `FlightPNRFormData.condition_id` (legacy/wizard); `PNRRecord.conditionId`; `PnrModalCondition.code`/`BulkPnrCondition.code` |
| Ticket type (stock) | `'Ticket + Land'` (with space) | `types/index.ts::TicketType`, `DemoStock.ticketType` |
| Ticket type (template) | `'Ticket+Land'` (no space) | `condition-schema.ts::CondTemplateTicketType` |
| "Version" | `AppConditionTemplate.version: number` vs `AppCondition.version: string` | Two different concepts, same word |
| Condition status | `AppCondition.status: 'Active'\|'Inactive'\|'Draft'` (live) vs `types/index.ts::ConditionStatus = 'Active'\|'Inactive'` (dead, no Draft) | Only the first is live |

## Recommendation — single Source of Truth going forward

1. **Template Condition** → keep `lib/condition-storage.ts` / `AppConditionTemplate` as the only source. Delete or clearly quarantine `lib/template-storage.ts` and its dead UI once confirmed unused for one more release cycle (see `condition-fix-plan.md` — do not delete yet per the audit's "no removal until verified unused" rule; it already has zero live imports, but keep as a follow-up cleanup ticket, not part of this fix).
2. **Applied Condition of PNR** → **must** be unified onto one model. Recommend keeping `conditionTemplateId`/`conditionOverride` (System B) as the canonical Override flag, and having System A screens (`SinglePnrModal`, `BulkPnrBuilder`, `Step4PNR`) become override-aware by routing all reads/writes through `lib/condition-relationship.ts::getEffectiveConditionForPnr` and a to-be-added shared "set PNR condition" function that always sets both `conditionCode`/`conditionTemplateId`/`conditionOverride` together, never just one. This is the single biggest structural fix — see `condition-fix-plan.md` Phase 1.
3. **NAME DL** → keep `PnrAppliedCondition` (`lib/pnr-applied-condition.ts`) as the only lock/audit source; every screen that writes NAME DL must go through `lockTtlOnPnrSave`/`previewTemplateMergeForPnr`, not a local re-implementation. Display components must start reading `ttlDateOriginal`/`ttlHolidayAdjusted`/`ttlHolidayAdjustReason` instead of always live-recomputing.
4. **Ticket-type comparisons** → standardize on `getStockTypeConfig(ticketType, groupType)?.ticketType` (the already-normalized value) as the only way to compare a stock against a template's `ticketType`. Never compare raw `StockType` keys or raw `DemoStock.ticketType` directly against `CondTemplateTicketType`.
