# Condition System — Change Impact Matrix

> **Phase 1 Read-Only Audit** | Audited: 2026-07-30
> Cross-reference: bug IDs from `condition-bug-list.md`.

For each change scenario: what *should* happen (per the user's requirements), what *actually* happens today, and the gap.

| # | Scenario | Should happen | Actually happens today | Gap / Bug ref |
|---|---|---|---|---|
| 1 | Edit a Template Condition (content only, no version bump) | Only affects the template record itself; no Series/PNR impacted | ✅ Matches — snapshot model protects Series. PNR-level Direct assignment doesn't re-read template content live either, so also unaffected here. | None |
| 2 | Edit a Template Condition and choose "Create new version" | New `version` number, existing Series/PNR snapshots untouched | ✅ Matches | None |
| 3 | Edit a Template Condition and choose "Update Series not yet synced" | Only Series flagged as not-locally-modified get re-snapshotted; PNRs are **not** auto-touched, a separate confirm step is needed for PNR cascade | ✅ Series propagation matches. PNR cascade requires the separate, explicit Bulk Condition Change action in PNRTab — correctly not automatic. | None (MED-13 flags that this separation should be confirmed as intentional) |
| 4 | Edit a Series' Applied Condition (custom edit, not template change) | Becomes a Series-level override (`locallyModified`, `overrideFields` computed); does not ask about PNRs since Series-level edits don't cascade | ✅ Matches (`ConditionsTab.tsx::_doSave`) | None |
| 5 | Edit a PNR's Condition (pick different Condition/Template for one PNR) | Should be recorded as a PNR Override | ⚠️ Only true via **PNRTab**'s dropdown (System B). Via **SinglePnrModal/BulkPnrBuilder** (System A), there's no override concept — just a flat field change, AND if the PNR already had a System B override, editing via these screens **destroys** it | CRIT-04, HIGH-01 |
| 6 | Change travel date on a PNR | Recompute only the NAME DL that uses a rule (`daysBefore`); a NAME DL set as a fixed/manual date must NOT change | ✅ Matches — `calcType==='MANUAL_DATE'`/`FIXED_DATE` rules are date-independent by construction; only `TRAVEL_MINUS_DAYS` rules recompute from `travelStart`. Confirmed no code path recomputes a fixed-date NAME DL off travel date changes. | None found (verify with test case TC-10) |
| 7 | NAME DL set as a fixed/manual date | Must never change automatically for any reason (travel date change, template change, holiday config change) | ⚠️ Mostly true, but the **display** layer (`TtlField`/`TtlEditor`) always live-recomputes holiday-adjustment on top of whatever fixed date is stored — if holiday config changes after the fact, the *displayed* preview can shift even though the *persisted* value hasn't, with no visual distinction between "persisted" and "just-recomputed-for-preview" | HIGH-05 |
| 8 | Remove (unlink) a Condition/Template from a Series | Applied Condition data must still exist afterward (for audit/history), Series just stops actively using it | ⚠️ Partially — the entry is removed from `stock.conditions[]` entirely (not soft-unlinked/archived at the Series level), and PNRs still pointing at the removed `conditionCode` are not notified/reset | MED-15 |
| 9 | Delete a Template Condition | Must not make an already-using Series/PNR's data disappear | ✅ Matches for Series (full snapshot model). ⚠️ Storage-layer function itself has no in-layer guard against deleting an in-use template — protection is UI-only (disabled button) | HIGH-07 |
| 10 | Bulk-update multiple PNRs' Condition at once | Must support: Update all / Update selected only / Keep existing / Cancel — never silently overwrite NAME DL | ❌ Only "confirm the whole batch" (auto-keep NAME DL on conflict) or Cancel exists; no per-item granularity; conflict count only shown after clicking confirm | HIGH-03 |
| 11 | Opening Edit Stock and saving without touching PNRs | PNR data (including Overrides and NAME DL history) must be preserved untouched | ❌ **Confirmed bug** — wipes System B override fields and flattens NAME DL audit history for every PNR in the Series | CRIT-05 |
| 12 | Opening Edit-PNR modal for a PNR with a locked NAME DL, without touching NAME DL fields | NAME DL must remain exactly as persisted | ❌ **Confirmed bug** for `TRAVEL_MINUS_DAYS`-type locked rules (masked for `MANUAL_DATE`-type by an unrelated bug) | CRIT-01, CRIT-02 |
| 13 | Explicitly clearing a PNR's NAME DL to "ไม่ระบุ" | Lock state must also clear; no stale rule should resurface later | ❌ **Confirmed bug** — `appliedCondition.ttlLocked` stays true with the old rule | CRIT-03 |

## Data-loss risk summary (highest first)

1. **CRIT-05** (Edit Stock save wipes all PNR overrides + NAME DL history in a Series) — broadest blast radius, silent, no confirmation shown.
2. **CRIT-04** (Edit single PNR wipes its own override) — narrower blast radius but equally silent.
3. **CRIT-01 / CRIT-03** (NAME DL silently changed/stale-locked) — no records deleted, but incorrect deadline data can drive real payment/refund deadlines wrong without anyone noticing until it's too late operationally.
4. **CRIT-07 / CRIT-08** — no data loss, but incorrect *display* could lead a user to make a wrong manual decision (e.g., re-entering a condition code by hand because the UI showed nothing).

## Recommended pre-fix safety net

Before any of the CRIT-04/05 fixes are implemented, back up (export) the current `localStorage['ticket_stock_demo_data']` blob for any environment with real user data, since the fix will change how `mergePnrMetadata`/`buildDemoPnrFromForm` behave — see `condition-fix-plan.md` Phase 1 for the exact, minimal-diff approach that avoids needing a data migration at all (the fields already exist on `DemoPNR`; the fix only changes which code paths read/write them).
