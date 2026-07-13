# Flow Map — Add Stock → Series Wizard

> **Phase 1 Read-Only Audit** | Audited: 2026-07-13 | Status: Draft

---

## 1. Entry Point

```
All Tickets page (/tickets)
  └── [+ Add Stock] button
        └── /tickets/add (app/tickets/add/page.tsx)
```

---

## 2. Wizard UI vs Component Mapping

> ⚠️ Component names are off-by-one from the UI step numbers.

| UI Step | Display Label           | Rendered Component    | File                              |
|---------|-------------------------|-----------------------|-----------------------------------|
| 1       | ข้อมูล Stock            | `Step1StockInfo`      | components/wizard/Step1StockInfo.tsx |
| 2       | เที่ยวบิน               | `Step2Sectors`        | components/wizard/Step2Sectors.tsx   |
| 3       | PNR & Seats             | **`Step4PNR`**        | components/wizard/Step4PNR.tsx       |
| 4       | ตรวจสอบ & บันทึก        | **`Step5Review`**     | components/wizard/Step5Review.tsx    |
| —       | *(not rendered)*        | `Step3Conditions`     | components/wizard/Step3Conditions.tsx |

**Issue**: UI Step 3 renders `Step4PNR` (not Step3), UI Step 4 renders `Step5Review` (not Step4). `Step3Conditions` component exists but is **not wired into the wizard**.

---

## 3. WizardState Shape

```typescript
// types/index.ts
interface WizardState {
  step: number                      // current UI step (1–4)
  stockInfo: FlightSeriesFormData   // Step 1 data
  schedules: FlightScheduleFormData[] // Step 2 data
  conditions: AppCondition[]        // Step 3 data (always [] — no UI to populate)
  pnrs: FlightPNRFormData[]         // Step 3 (UI) data
}
```

---

## 4. Step-by-Step Data Flow

### Step 1 — Stock Info (`Step1StockInfo`)

```
User selects StockType → 4 options: SERIES / AD_HOC / FIT / TICKET_ONLY
  ├── ticketType: 'Group' | 'FIT' | 'Ticket + Land'
  └── groupType: 'SERIES' | 'ADHOC' | undefined

User fills:
  - group_name (Group / Tour name)
  - airline_code (from MASTER_AIRLINES)
  - currency (CurrencyCombobox)
  - country_id, destination, remark
  - trip_type (computed from sectors in Step 2)

Stock Code:
  - generateStockCode() called on page mount → [prefix][timestamp]
  - Prefixes: SR (SERIES), AH (AD_HOC), FIT (FIT), TO (TICKET_ONLY)
  - ⚠️ Generated every mount — navigating back/forward creates a new code
```

**Validation (Step 1)**:
- `group_name`: required
- `airline_code`: required  
- `currency`: required (defaults to 'THB')
- `ticket_type`: required (must confirm type)

---

### Step 2 — Flight Sectors (`Step2Sectors`)

```
User adds sectors per "Schedule" (flight set)
  - Main schedule: required (isMain: true)
  - Additional schedules: optional (for FIT/multi-route)

Per sector:
  - sectorType: Departure | Transit | Arrival
  - airline_code, flight_no
  - dep_airport_code, arr_airport_code
  - dep_time, arr_time (HH:mm)
  - arr_day_offset (computed: 0 or 1)
  - day_offset (departure day relative to travelStart, default: 1)

Business Rules:
  - SERIES / AD_HOC / TICKET_ONLY: min 2 sectors (Departure + Arrival)
  - FIT one-way: min 1 sector
  - Airport autocomplete: active airports only (getActiveAirports)
  - Same-airport transit warning shown
```

---

### Step 3 (UI) / Step 4 (component) — PNR & Seats (`Step4PNR`)

```
User adds PNR rows to a table

Per-PNR fields:
  - pnr_code: real PNR (optional; if blank, auto-generates dummy)
  - dummy_pnr: auto-generated if pnr_code is blank
  - travel_start: outbound departure date
  - travel_end: computed from sectors
  - sector_dates[]: per-sector dep/arr dates (with manual-override flags)
  - seat_total: integer
  - price_format: FARE | FARE_YQ | ALL_IN
  - fare, yq, tax, total_amount
  - currency (per-PNR, defaults from stockInfo)
  - condition_id: links to a condition in WizardState.conditions
  - status: 'Pending' | 'Confirmed'
  - pnr_status: 'PENDING' (hardcoded in emptyPNR)
  - confirmation_status: 'PENDING_CONFIRMATION' (hardcoded)
  - ttl_type: 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE'
  - ttl_days_before: number | null
  - ttl_status: 'UNSET' | 'SET' (legacy field, kept for compat)
  - ttl_date, ttl_time: computed from ttl_type

PNR Entry Methods:
  1. Manual row (+ Add PNR button)
  2. Bulk PNR builder (BulkPnrBuilder modal)
  3. Paste from Excel (PasteExcelModal — columns: PNR, Outbound, Return, Seats)
  4. Import Excel (ImportExcelModal)

TTL Entry in Step 4PNR:
  - Per-PNR: via TtlEditor (floating popover) — sets ttl_type, ttl_days_before, ttl_date, ttl_time
  - Bulk: "ตั้ง TTL ทุก PNR" modal — sets same TTL for multiple PNRs

⚠️ CRITICAL: wizardStateToDemoStock() IGNORES per-PNR TTL from form
   - Computes TTL from condition's ttlRule only
   - p.ttl_type, p.ttl_days_before, p.ttl_date never read during save
   - Result: all per-PNR TTL overrides are silently discarded on save
```

**Conditions in Step 4PNR**:
- Each PNR row has a `condition_id` dropdown
- Dropdown options come from `WizardState.conditions`
- Since `Step3Conditions` is not wired, `conditions = []` always
- ⚠️ PNR cannot link to any condition — dropdown is always empty

---

### Step 4 (UI) / Step 5 (component) — Review & Save (`Step5Review`)

```
Shows summary of all entered data:
  - Stock info summary
  - Sector/route display
  - PNR table (read-only review)
  - Period calculation (min/max travel dates)
  - Total seats + total amount

PNR Duplicate Check:
  - checkPNRDuplicatesInSystem() — compares against localStorage
  - Shows warning if duplicates found
  - ⚠️ Does not BLOCK save — user can still save despite duplicates
```

---

## 5. Save Flow

```
User clicks "Confirm & Save"
  │
  ├── confirmSave() in app/tickets/add/page.tsx
  │     ├── wizardStateToDemoStock(state) → DemoStock
  │     └── saveDemoStock(stock) → localStorage
  │
  └── Auto-logs written:
        - "Create Stock [code]"
        - "Generate Dummy PNR N รายการ" (if any dummy PNRs)
        - "Save Demo Data"
```

### wizardStateToDemoStock() Key Mappings

| WizardState field              | DemoStock/DemoPNR field         | Notes                                       |
|-------------------------------|----------------------------------|---------------------------------------------|
| stockInfo.stock_code           | stockCode                        | from generateStockCode()                    |
| stockInfo.ticket_type          | ticketType                       |                                             |
| stockInfo.group_type           | groupType                        | 'SERIES' \| 'ADHOC' \| undefined            |
| stockInfo.currency             | currency                         |                                             |
| stockInfo.status               | status                           | always 'Draft' for new                      |
| schedules[main].sectors        | sectors + schedules              |                                             |
| conditions (AppCondition[])    | conditions (AppStockCondition[]) | wraps each as `{ source: 'custom', condition }` |
| pnr.pnr_code                   | pnrCode                          |                                             |
| pnr.dummy_pnr                  | dummyPnr                         |                                             |
| pnr.travel_start               | travelStart                      |                                             |
| pnr.seat_total                 | seatTotal                        |                                             |
| pnr.fare                       | fare                             |                                             |
| pnr.tax ?? 0                   | tax                              | ⚠️ null → 0                                 |
| pnr.total_amount               | total                            |                                             |
| pnr.condition_id               | conditionCode (via lookup)       | looks up by conditionId OR conditionCode    |
| condition.ttlRule + travelStart | ttlDate, ttlTime, ttlDateTime   | ⚠️ ignores pnr.ttl_type / ttl_date          |
| pnr.pnr_status ?? 'PENDING'    | pnrStatus                        |                                             |
| pnr.schedule_id                | scheduleId                       |                                             |
| *(not mapped)*                 | flightSetId                      | ⚠️ not set — filled by migration fallback   |
| *(not mapped)*                 | ttlType, ttlDaysBefore           | ⚠️ not saved from wizard                    |

---

## 6. Draft Flow

```
User clicks "บันทึก Draft"
  └── saveDraft() in app/tickets/add/page.tsx
        └── alert('Draft saved!') — no actual persistence
```

⚠️ Draft is completely non-functional (demo placeholder only).

---

## 7. Edit Stock Flow (for reference)

```
Detail page /tickets/[id]
  └── [Edit] button
        └── /tickets/[id]/edit
              ├── getDemoStockById(id) → DemoStock
              ├── demoStockToWizardState(stock) → WizardState
              └── Wizard renders same 4-step UI

Save (edit):
  - wizardStateToDemoStock(state) → DemoStock (with SAME stockId)
  - saveDemoStock(stock) → replaces in localStorage
```

**demoStockToWizardState() TTL gaps**:
- PNR TTL fields NOT mapped back: `ttlType`, `ttlDaysBefore`
- `sector_dates` mapping: loses `dep_manual`/`arr_manual` flags

---

## 8. Status at Wizard Save

```
New stock always saves with:
  status: stockInfo.status  ← from WizardState (set to 'Draft' at init)
  pnrStatus: 'PENDING' for each PNR
  confirmationStatus: 'PENDING_CONFIRMATION' for each PNR
  seatUsed: 0
  seatBalance: seatTotal
```

---

## 9. Data Store Architecture

```
localStorage key: 'ticket_stock_demo_data'
  └── DemoStock[]  (newest first)

Supabase: NOT used for Add Stock flow (demo only)
```

Events dispatched on save:
```
window.dispatchEvent(new CustomEvent('demo_stock_updated', { detail: { stockId } }))
```

Listeners: TicketTable and detail pages use this to refresh.

---

## 10. Component Dependency Graph

```
app/tickets/add/page.tsx
├── components/wizard/WizardStepper.tsx
├── components/wizard/WizardLayout.tsx
├── components/wizard/Step1StockInfo.tsx
│     ├── components/shared/CurrencyCombobox.tsx
│     ├── components/ui/searchable-select.tsx
│     └── lib/master-data.ts (MASTER_AIRLINES)
├── components/wizard/Step2Sectors.tsx
│     ├── components/shared/AirlineCell.tsx
│     ├── lib/airport-storage.ts (getActiveAirports)
│     └── lib/time-utils.ts
├── components/wizard/Step4PNR.tsx
│     ├── components/shared/TtlEditor.tsx  (floating popover)
│     ├── components/shared/BulkPnrBuilder.tsx
│     ├── components/wizard/ImportExcelModal.tsx
│     ├── components/wizard/BulkPNRModal.tsx
│     ├── components/shared/CurrencyCombobox.tsx
│     └── lib/demo-storage.ts (getDemoStocks for duplicate check)
├── components/wizard/Step5Review.tsx
│     └── lib/demo-storage.ts (checkPNRDuplicatesInSystem)
└── lib/demo-storage.ts (wizardStateToDemoStock, saveDemoStock)
```
