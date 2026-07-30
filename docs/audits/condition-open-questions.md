# Condition System — Open Questions (Decisions Needed Before Fixing)

> **Phase 1 Read-Only Audit** | Audited: 2026-07-30 | Decisions recorded: 2026-07-30
> No code changes will proceed on any item still marked **OPEN** below.

### Q-01 — Should Add Stock get a Conditions step? — ✅ **RESOLVED: No**

**Decision**: Add Stock wizard will **not** get a Conditions step. CRIT-06 is reclassified from "bug" to **working-as-intended** — creating a Condition only during/after Edit Stock is the accepted product flow. `condition-fix-plan.md` Phase 3 is dropped.

---

### Q-02 / Q-03 — Canonical Override system — ✅ **RESOLVED: System B, PNR-direct-template-linking is intentional**

**Decision**: `conditionTemplateId` + `conditionOverride` (System B) is confirmed as the **intended, canonical** model for PNR-level Override. "PNR can link directly to a Template Condition" is a deliberate feature, not a stale leftover.

**Consequences**:
- `condition-fix-plan.md` Phase 2 proceeds as recommended option (a): unify everything onto System B. `SinglePnrModal`/`BulkPnrBuilder`/`Step4PNR` must become System-B-aware (read/preserve `conditionTemplateId`/`conditionOverride`/`appliedCondition`, never silently discard them).
- **`CLAUDE.md`'s rule "Conditions belong to Stock only — PNR cannot link to Condition Templates directly" is now confirmed stale** and should be corrected as part of this work (small doc fix, no functional risk) to read something like: *"A PNR normally inherits its Stock/Series' Condition, but may directly override it with its own Template Condition assignment (`conditionTemplateId`/`conditionOverride`) — this is an intentional exception, not a bypass."*
- The CRIT-05 stop-gap (preserve System B fields through `mergePnrMetadata` on Edit Stock save) is now unblocked and should be prioritized first, per the fix plan.

---

### Q-04 — Removing a Condition from a Series — ✅ **RESOLVED: ask first, with full impact detail**

**Decision**: When removing a Condition from a Series, the app must **not** silently reset affected PNRs. It must first show the user a confirmation with **full detail of what's impacted** (which PNRs, by name/code, and what will change for each — e.g. "PNR ABC123 will revert to no condition / fall back to Series default"), and only proceed to reset those PNRs after explicit confirmation.

**Implementation note for the fix plan**: this is closer to option (a) from the original recommendation, but with a stronger requirement than a simple count — the confirmation dialog must enumerate the affected PNRs individually (matching the level of detail already used elsewhere in the app, e.g. the PNR-impact preview modal used for sector changes). `condition-fix-plan.md` item for MED-15 should be updated to build this detailed preview (reuse or extend `PNRImpactModal`-style listing if applicable) rather than a simple toast/count.

---

### Q-05 — Bulk condition-change UX — ✅ **RESOLVED: per-conflict granularity**

**Decision**: PNRs with no NAME-DL conflict update automatically. PNRs whose NAME DL conflicts with the new Template are shown individually, and the user chooses Keep-existing or Use-new-template per PNR (with an "apply to all conflicting ones" shortcut available). This replaces the current blanket auto-keep-on-conflict behavior in `PNRTab.tsx`'s bulk condition-change modal.

Unblocks `condition-fix-plan.md` Phase 4.

---

### Q-06 — List pages loading Template list to resolve Condition correctly — ✅ **RESOLVED: Yes, allowed**

**Decision**: List pages (e.g. Group Ad Hoc list) may load the full Template list via `getConditionTemplates()` to correctly resolve each row's effective Condition through `getEffectiveConditionForPnr`. Unblocks CRIT-08 / MED-09 fixes as originally recommended.

---

### Q-07 — Multi-tab concurrent editing — ✅ **RESOLVED: Yes, this happens in practice**

**Decision**: Same-browser multi-tab (or multi-user-on-different-machines-but-same-account, if applicable) concurrent editing **is** a real scenario for this team. This raises the risk profile of every fix in this audit that reads-then-writes `DemoStock`/`DemoPNR` data (which is all of them, since `saveDemoStock()` re-persists the *entire* stock list on every save, and there is currently zero locking or conflict detection in `localStorage`).

**Implication for the fix plan** (added as new guidance, not a separate phase — this is a cross-cutting constraint):
- Every fix in Phase 0–2 must, at minimum, **re-read the latest stock/PNR state immediately before merging fields** (e.g. in `mergePnrMetadata`, in `applyConditionChangeDirect`) rather than relying on a state snapshot that may have gone stale while the user was interacting with a modal — this reduces (but does not eliminate) the window for last-write-wins clobbering.
- A **full** concurrency solution (optimistic locking with a version/updatedAt check-and-reject, or a merge strategy, or moving off `localStorage` to a backend with real transactions) is **out of scope for this Condition-system fix** — it's a app-wide architectural gap, not specific to Conditions. Recommend opening it as its own, separate audit/initiative once the Condition fixes land, since solving it properly likely depends on the Q-08 backend-migration decision anyway.
- I will flag in each Phase 0–2 fix's implementation notes where this stale-read risk specifically applies, so it's visible in code review, but will not attempt to build a general locking mechanism as part of this work unless you explicitly ask for it separately.

---

### Q-08 — Backend migration plans — ✅ **RESOLVED: No plans currently**

**Decision**: No backend migration is planned right now. Phase 2's Override-unification design will target the current `localStorage`/`DemoPNR` shape as-is, with no extra abstraction for a hypothetical future Supabase schema (per `condition-fix-plan.md`'s existing "no migration required" note — unchanged).

---

## Summary — all decisions resolved

| Item | Status |
|---|---|
| Fix Plan Phase 2 (Override unification onto System B) | ✅ Unblocked — proceed |
| Fix Plan Phase 3 (Add Stock Conditions step) | ❌ Dropped — not needed |
| Fix Plan Phase 4 (Bulk-change UX, per-conflict granularity) | ✅ Unblocked — proceed |
| CRIT-08 / MED-09 fix | ✅ Unblocked — proceed |
| MED-15 fix (Condition removal from Series) | ✅ Unblocked — proceed, with the detailed-impact confirmation UX from Q-04 |
| CLAUDE.md correction (Q-03) | ✅ Unblocked — proceed, low-risk doc fix |
| Phase 0 (12 isolated fixes), Phase 1 (NAME DL lock), Phase 5 (dead-code cleanup) | ✅ Always unblocked |
| Cross-cutting: stale-read guard for multi-tab safety (Q-07) | ✅ Apply as a lightweight mitigation within each fix; full concurrency solution out of scope |

**Every open question is now resolved. Nothing remains blocking implementation.**
