# Audit Report — Add Stock → Series Wizard

> **Phase 1 Read-Only Audit** | Audited: 2026-07-13 | Auditor: Senior System Analyst

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical (data loss / broken flow) | 7 |
| 🟠 High (inconsistency / silent failure) | 6 |
| 🟡 Medium (UX / correctness gap) | 8 |
| 🔵 Low (naming / cleanup) | 4 |
| **Total** | **25** |

---

## 🔴 Critical Issues

---

### C-01 — wizardStateToDemoStock ignores per-PNR TTL overrides

**File**: `lib/demo-storage.ts:966–983`  
**Impact**: All per-PNR TTL fields entered in the wizard are silently lost on save.

**Root cause**: The save function only reads TTL from the linked condition:
```typescript
let ttlDateTime: string | null = null
const linkedSC = conditionById[p.condition_id ?? '']
if (linkedSC && p.travel_start) {
  ttlDateTime = calcCondTtlDate(linkedSC.condition.ttlRule, p.travel_start)
}
// p.ttl_type, p.ttl_days_before, p.ttl_date, p.ttl_time → NEVER READ
```

**Affected flows**:
- Per-row TTL set via `TtlEditor` in Step 4PNR → lost
- Bulk TTL set via "ตั้ง TTL ทุก PNR" modal → lost
- TTL entered during BulkPnrBuilder → lost
- Excel import with TTL columns → lost

**Correct behavior**: Should read `p.ttl_type`, and if not `NONE`, use `p.ttl_date`/`p.ttl_days_before` as override (taking priority over condition-derived TTL).

**Also affected**: `ttlType` and `ttlDaysBefore` fields are never written to `DemoPNR` during wizard save (only `ttlDate`, `ttlTime`, `ttlDateTime` are written, and those come from condition only).

---

### C-02 — Step3Conditions component not wired into wizard

**File**: `app/tickets/add/page.tsx` (entire file), `components/wizard/Step3Conditions.tsx` (exists)  
**Impact**: There is no UI to add/manage conditions during the Add Stock wizard. `WizardState.conditions` is always `[]`.

**Consequence**:
- PNR rows cannot link to any condition (`condition_id` dropdown is empty)
- Payment schedules cannot be built for new stocks
- TTL computed from condition is always null (no condition exists)
- New stocks are saved with `conditions: []` always

**Note**: `Step3Conditions.tsx` is a fully-implemented component that is never rendered. The wizard was refactored from 5 steps to 4 by collapsing Step3 into Step4PNR or removing it, but the component wasn't cleaned up.

---

### C-03 — demoStockToWizardState does not map TTL type/days back to wizard PNR form

**File**: `lib/demo-storage.ts:859–883`  
**Impact**: Edit flow loses TTL type information — user cannot see or modify TTL correctly in edit mode.

**Root cause**: The PNR mapping in `demoStockToWizardState` maps:
```typescript
// Current mapping (incomplete):
pnr_code, dummy_pnr, travel_start, travel_end, seat_total, fare, ...

// NOT mapped:
// ttlType → ttl_type
// ttlDaysBefore → ttl_days_before
// ttlDate → ttl_date
// ttlTime → ttl_time
```

Also missing: `currency` (per-PNR currency not preserved in edit round-trip).

---

### C-04 — saveDraft() is a no-op (alert placeholder)

**File**: `app/tickets/add/page.tsx` (saveDraft function)  
**Impact**: Clicking "บันทึก Draft" shows an alert but saves nothing. User believes draft is saved but it isn't. Navigating away loses all data.

**Current code** (from prior audit):
```typescript
const saveDraft = () => {
  alert('Draft saved!') // no actual storage
}
```

---

### C-05 — flightSetId never set when saving from wizard

**File**: `lib/demo-storage.ts:999–1032` (wizardStateToDemoStock, demoPNRs map)  
**Impact**: PNRs saved from wizard have no `flightSetId`. This breaks the PNR cell's flight set display in Series Detail, which looks up `flightSetId` in `stock.flightSets`.

**Workaround in getDemoStocks()**: Migration code assigns `flightSetId: p.flightSetId ?? flightSets[0]?.flightSetId ?? 'fset-default'` when loading, but this fallback assigns ALL PNRs to flightSet[0] regardless of their actual schedule.

**Impact on PNRTab**: `PNRCell` displays `flightSetName` based on `flightSetId` → always shows the first flight set's name for all PNRs.

---

### C-06 — generateStockCode() called on every component mount

**File**: `app/tickets/add/page.tsx` (useEffect on mount)  
**Impact**: Every time the Add Stock page mounts, a new stock code is generated. If user navigates to the page, then back, then forward again — they get a different code. Two tabs open simultaneously could generate colliding codes.

**Secondary issue**: The wizard's step-navigation (next/back) does NOT remount the page (it's a SPA), so within a session the code is stable. But a page refresh or link re-entry always generates a new code.

---

### C-07 — PNR condition_id lookup by conditionCode creates silent ambiguity

**File**: `lib/demo-storage.ts:948–951`  
**Root cause**:
```typescript
conditionById[sc.condition.conditionId] = sc   // by ID
conditionById[sc.condition.conditionCode] = sc  // by code (backward compat)
```

If two conditions have different IDs but the same code (possible in custom conditions), the second one silently overwrites the first in the lookup. No error is raised.

**Also**: `demoStockToWizardState` maps `condition_id: p.conditionCode` (the code, not the ID). So wizard PNR form uses code as the key, but `Step4PNR` dropdown uses `conditionId` as the value. When editing, the condition link may not be resolvable.

---

## 🟠 High Issues

---

### H-01 — Dual TTL system coexists in FlightPNRFormData

**File**: `types/index.ts` (FlightPNRFormData interface)  
**Impact**: Both old `ttl_status: 'UNSET'|'SET'` and new `ttl_type: 'NONE'|'DAYS_BEFORE'|'FIXED_DATE'` exist simultaneously. Components use both.

**Evidence**: `Step4PNR.tsx:48-54` (`emptyPNR`) sets both `ttl_status: 'UNSET'` and `ttl_type: 'NONE'`. `commitBulkTtl` sets both `ttl_type` and `ttl_status: 'SET'`.

**Risk**: Future code changes may only update one field, leaving the system in an inconsistent state.

---

### H-02 — StockStatus includes 'Reopened' in types/index.ts

**File**: `types/index.ts`  
**Impact**: `StockStatus = 'Draft' | 'Active' | 'Closed' | 'Cancelled' | 'Reopened'` — but spec says only 4 statuses exist. The 'Reopened' value is a transitional state, not a final status. Any switch/if that checks for all statuses will miss 'Reopened' cases or include it inadvertently.

---

### H-03 — PNRStatus type still present (old binary status)

**File**: `types/index.ts`  
**Impact**: `PNRStatus = 'Pending' | 'Confirmed'` — the old single-field status — still used in `Step4PNR.tsx` (`STATUS_OPTIONS`, `STATUS_LABELS`, `STATUS_COLORS`). This is the old system that was supposed to be replaced by `pnrStatus + confirmationStatus`.

New PNRs created in the wizard have both `status: 'Pending'` (old) and `pnr_status: 'PENDING'` (new). This dual system persists through save.

---

### H-04 — WizardState.conditions always empty — no UI to populate

**File**: `app/tickets/add/page.tsx`, `types/index.ts`  
**Impact**: `WizardState` has a `conditions: AppCondition[]` field, but there is no UI step in the wizard to add/edit conditions. The field is initialized as `[]` and never gets populated.

**Consequence**: New stocks always save with zero conditions. This breaks:
1. PNR-condition linking during wizard
2. TTL derivation from condition (C-01)
3. Payment schedule building post-creation

---

### H-05 — Tax null → 0 conversion during save may corrupt data

**File**: `lib/demo-storage.ts:1013`  
**Issue**: `tax: p.tax ?? 0` — if a PNR has `price_format: 'ALL_IN'` or `'FARE_YQ'`, tax is intentionally `null`. Saving as `0` means loaded data will show tax = 0 instead of N/A.

**Impact**: `calculateStockSummary` uses `p.taxType === 'separate'` filter, so tax=0 on non-separate formats won't corrupt the sum. But the detail view may show "0" instead of "—".

---

### H-06 — Import/Paste Excel: TTL data not propagated to form correctly

**File**: `components/wizard/Step4PNR.tsx:606–623` (addPastedPNRs)  
**Impact**: `addPastedPNRs` (paste from Excel) creates PNRs with:
- No TTL fields set (ttl_type defaults to 'NONE')
- Condition defaulting to first condition only if exactly 1 condition exists

Since conditions are always empty (H-04), no PNR gets a condition from paste. Since TTL comes from condition (C-01) and condition is empty, no TTL is ever set.

---

## 🟡 Medium Issues

---

### M-01 — Step component numbering mismatch

**Files**: Wizard component names vs UI step numbers  
**Impact**: Code navigation confusion. `Step4PNR` is shown as "Step 3" in the UI. `Step5Review` is "Step 4".  
**Detail**: This appears to be caused by removing `Step3Conditions` from the UI without renaming the downstream components.

---

### M-02 — generateStockCode uses Date.now() — potential collision in rapid creation

**File**: `app/tickets/add/page.tsx`  
**Issue**: If two users create stocks within the same millisecond (possible in demo mode with two tabs), they get the same stock code. No uniqueness check against existing codes.

---

### M-03 — PNR duplicate check does not block save

**File**: `components/wizard/Step5Review.tsx:60–61`  
**Impact**: `checkPNRDuplicatesInSystem()` runs and shows a warning, but the save button is still active. User can save a stock with known duplicate PNR codes. No validation in `confirmSave()` checks for duplicates.

---

### M-04 — TtlEditor (wizard) and TtlField (detail) are two separate implementations

**Files**: `components/shared/TtlEditor.tsx` (floating popover), `components/shared/TtlField.tsx` (inline)  
**Impact**: Two different UIs for the same concept. Style, behavior, and option labels may diverge over time.  
**Note**: Both implement the 3-option TTL system (NONE/DAYS_BEFORE/FIXED_DATE), but TtlEditor appears to be the older implementation while TtlField was the new shared component created in the TTL modal overhaul.

---

### M-05 — Manual sector date flags (dep_manual/arr_manual) lost in edit round-trip

**File**: `lib/demo-storage.ts:878–882` (demoStockToWizardState PNR mapping)  
**Impact**: When editing an existing stock, all manually-set sector dates lose their `dep_manual: true` flag. On save, the edit wizard will recompute all dates from `travel_start + day_offset`, overwriting any manually-adjusted dates.

---

### M-06 — sector_dates day_offset lookup uses first sector of matching type

**File**: `lib/demo-storage.ts:880`  
```typescript
day_offset: stock.sectors.find(s => s.sectorType === sd.sectorType)?.dayOffset ?? 1,
```
If a route has two sectors of the same type (e.g., two Transit legs), this always returns the first match's `day_offset`, not the correct sector's offset.

---

### M-07 — periodEnd in Step5Review uses travelStart not travelEnd

**File**: `components/wizard/Step5Review.tsx:47–53`  
```typescript
const periodEnd = travelDates.reduce((a, b) => (a.end || '') > (b.end || '') ? a : b).end
```
Actually, it uses `end` (travelEnd) correctly. But `periodStart` uses `start` (travelStart). However, for display in summary, the "period" shown in Step5 is the departure range only (not the return range). Users booking in September may not realize the return extends into October.

---

### M-08 — WizardStepper step count hardcoded

**File**: `components/wizard/WizardStepper.tsx`  
**Impact**: If a step is re-added (e.g., Step3Conditions is re-wired), the stepper must be manually updated. No single source of truth for step count.

---

## 🔵 Low Issues

---

### L-01 — formatTtlDisplay defined locally in Step4PNR.tsx AND in lib/ttl-utils.ts

**Files**: `components/wizard/Step4PNR.tsx:74–78`, `lib/ttl-utils.ts:22–27`  
**Impact**: Two separate implementations. Step4PNR uses comma separator `"DD MMM YY, HH:mm"` while `lib/ttl-utils.ts` uses dot separator `"DD MMM YY · HH:mm"`. Inconsistent display format.

---

### L-02 — subtractDaysFromDate defined locally in Step4PNR vs calcTtlDateFromTravel in lib/ttl-utils.ts

**Files**: `components/wizard/Step4PNR.tsx:80–87`, `lib/ttl-utils.ts:13–19`  
**Impact**: Duplicate implementations. Both use noon anchor (`T12:00:00`) for timezone safety, which is correct. But divergence in future maintenance could break one while the other stays correct.

---

### L-03 — emptyPNR default currency is 'THB' (hardcoded fallback)

**File**: `components/wizard/Step4PNR.tsx:28`  
```typescript
function emptyPNR(defaultCurrency = 'THB'): FlightPNRFormData
```
The default is 'THB', and it is passed `currency` from `stockInfo.currency`. This is correct — but if the stock currency was changed and a new row was added before the change propagated, it could show THB briefly. Low risk.

---

### L-04 — DemoReopenEvent type defined in demo-storage but not used in wizard

**File**: `lib/demo-storage.ts:143–153`  
**Note**: Reopen events are part of the existing-stock lifecycle, not the wizard. No action needed, but the interface is part of `DemoStock` which the wizard creates (with empty arrays/null for reopen fields). This is fine.

---

## Appendix: Files Read During Audit

| File | Lines Read | Key Findings |
|------|-----------|--------------|
| `app/tickets/add/page.tsx` | 1–592 | Wizard structure, saveDraft, confirmSave, generateStockCode |
| `lib/stock-type-config.ts` | 1–186 | StockType → prefix/ticketType mapping |
| `types/index.ts` | 1–519 | All TypeScript interfaces; dual TTL, dual status systems |
| `lib/demo-storage.ts` | 1–1150 | DemoPNR interface, wizardStateToDemoStock, demoStockToWizardState |
| `components/wizard/Step1StockInfo.tsx` | 1–150 | Type selector, field list |
| `components/wizard/Step2Sectors.tsx` | 1–100 | Sector structure, airport autocomplete |
| `components/wizard/Step4PNR.tsx` | 1–699 | PNR table, TTL handling, bulk ops |
| `components/wizard/Step5Review.tsx` | 1–100 | Review display, duplicate check |
| `types/index.ts` | full | FlightPNRFormData, WizardState, StockStatus |
| `lib/ttl-utils.ts` | full | TtlType, calcTtlDateFromTravel, condTtlTypeToTtlType |
| `components/shared/TtlField.tsx` | full | Shared TTL field component |
