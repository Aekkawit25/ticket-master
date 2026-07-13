# Test Matrix — Add Stock → Series Wizard

> **Phase 1 Read-Only Audit** | Created: 2026-07-13

Legend: ✅ Should pass | ❌ Known to fail (from audit) | ⚠️ Likely pass but unverified | 🚫 Not testable (feature not implemented)

---

## Section 1 — Step 1: Stock Info

| TC | Scenario | Expected | Estimated Status | Audit Issue |
|----|----------|----------|-----------------|-------------|
| 1-01 | Select SERIES type → confirm type | Type locked; prefix = SR | ⚠️ | — |
| 1-02 | Change type after filling group_name | Shows confirmation dialog | ⚠️ | — |
| 1-03 | Fill group_name, airline, currency → click Next | Passes validation, moves to Step 2 | ⚠️ | — |
| 1-04 | Click Next without filling required fields | Shows field errors | ⚠️ | — |
| 1-05 | Currency defaults to THB | CurrencyCombobox shows THB | ⚠️ | — |
| 1-06 | Open wizard in two browser tabs simultaneously | Two different stock codes generated | ❌ (may collide) | M-02 |
| 1-07 | Navigate away and return to /tickets/add | New stock code generated | ❌ (user surprised) | C-06 |
| 1-08 | Select AD_HOC type → prefix = AH | ⚠️ | — |
| 1-09 | Select FIT type → prefix = FIT | ⚠️ | — |
| 1-10 | Select TICKET_ONLY type → prefix = TO | ⚠️ | — |

---

## Section 2 — Step 2: Flight Sectors

| TC | Scenario | Expected | Estimated Status | Audit Issue |
|----|----------|----------|-----------------|-------------|
| 2-01 | Add Departure + Arrival sector | 2 sectors, valid SERIES | ⚠️ | — |
| 2-02 | Try to proceed with only 1 sector (SERIES) | Blocked — min 2 sectors | ⚠️ | — |
| 2-03 | Add sector with valid airport code | Airport shown | ⚠️ | — |
| 2-04 | Type invalid airport code | Reverted to previous value | ⚠️ | — |
| 2-05 | Set arr_time < dep_time | +1 day offset auto-set | ⚠️ | — |
| 2-06 | Transit sector: same dep/arr airport | Warning shown | ⚠️ | — |
| 2-07 | Add multiple schedules for FIT | All schedules saved | ⚠️ | — |
| 2-08 | Route with 2 Transit legs (A→B→C→D) | Both transits use correct day_offset | ⚠️ | M-06 |
| 2-09 | Edit sector after creating PNR in Step 4 | PNR marked OUTDATED | ⚠️ | — |

---

## Section 3 — Step 3 (UI) / Step4PNR: PNR Entry

| TC | Scenario | Expected | Estimated Status | Audit Issue |
|----|----------|----------|-----------------|-------------|
| 3-01 | Add manual PNR row | New row with default values | ✅ | — |
| 3-02 | Leave pnr_code blank | dummy_pnr auto-generated (DMY-...) | ⚠️ | — |
| 3-03 | Enter pnr_code → dummy_pnr cleared | Real PNR, no dummy | ⚠️ | — |
| 3-04 | Set travel_start → sector dates auto-computed | All sector dates populated | ⚠️ | — |
| 3-05 | Change travel_start for existing PNR | Shift dialog appears | ⚠️ | — |
| 3-06 | Manually edit sector 2 dep date | dep_manual set to true | ⚠️ | — |
| 3-07 | Reset sector to computed date | dep_manual cleared | ⚠️ | — |
| 3-08 | Set price_format = ALL_IN | YQ and Tax columns disabled | ⚠️ | — |
| 3-09 | Change price_format when tax > 0 | Confirmation dialog shown | ⚠️ | — |
| 3-10 | Set per-PNR currency different from stock | Currency shown in PNR row | ⚠️ | — |
| 3-11 | Set TTL via TtlEditor per-row | TTL shown in PNR row | ⚠️ | — |
| 3-12 | Save stock — per-PNR TTL from wizard preserved in DemoPNR | ttlDate/ttlType saved | ❌ | C-01 |
| 3-13 | Bulk TTL — set TTL for all PNRs at once | All PNRs get TTL | ⚠️ | — |
| 3-14 | Save stock — bulk TTL preserved | TTL saved for all PNRs | ❌ | C-01 |
| 3-15 | Link PNR to condition | Condition dropdown shows options | ❌ | C-02, H-04 |
| 3-16 | Duplicate row | New row with same data, pnr_code cleared | ⚠️ | — |
| 3-17 | Delete row — confirmation shown | Row removed after confirm | ⚠️ | — |
| 3-18 | Bulk PNR builder — add multiple PNRs | All PNRs added to table | ⚠️ | — |
| 3-19 | Paste from Excel — paste PNR/Outbound/Return/Seats | PNRs added | ⚠️ | — |
| 3-20 | Import Excel | PNRs imported | ⚠️ | — |
| 3-21 | OUTDATED PNR banner — "Update All" | PNR dates recomputed | ⚠️ | — |
| 3-22 | PNR with pnr_code already in another stock | Duplicate warning in Step 5 | ⚠️ | M-03 |
| 3-23 | total_amount auto-computed when fare changes | total = fare + tax + yq | ⚠️ | — |

---

## Section 4 — Step 4 (UI) / Step5Review: Review & Save

| TC | Scenario | Expected | Estimated Status | Audit Issue |
|----|----------|----------|-----------------|-------------|
| 4-01 | All fields valid — confirm save | Stock saved to localStorage | ✅ | — |
| 4-02 | Duplicate PNR shown in review | Warning banner displayed | ⚠️ | — |
| 4-03 | Duplicate PNR — save anyway | Stock saved despite duplicates | ⚠️ | M-03 |
| 4-04 | Period calculated correctly | min(travelStart) to max(travelEnd) | ⚠️ | — |
| 4-05 | Route text shown correctly | BKK→NRT→BKK | ⚠️ | — |
| 4-06 | Total seats = sum of all PNR seat_total | ✅ | — |
| 4-07 | Total amount = sum of all PNR total_amount | ✅ | — |
| 4-08 | Conditions shown in review (if conditions exist) | Listed | 🚫 | C-02 |

---

## Section 5 — wizardStateToDemoStock (Save Logic)

| TC | Scenario | Expected | Estimated Status | Audit Issue |
|----|----------|----------|-----------------|-------------|
| 5-01 | New stock saved with status = 'Draft' | stockInfo.status = 'Draft' | ✅ | — |
| 5-02 | All PNRs have pnrStatus = 'PENDING' | ✅ | — |
| 5-03 | All PNRs have confirmationStatus = 'PENDING_CONFIRMATION' | ✅ | — |
| 5-04 | All PNRs have seatUsed = 0, seatBalance = seatTotal | ✅ | — |
| 5-05 | PNR linked to condition → conditionCode populated | ✅ (if condition exists) | — |
| 5-06 | PNR with no condition → conditionCode = '' | ✅ | — |
| 5-07 | PNR TTL from condition computed correctly | ttlDate from condition.ttlRule | ⚠️ | — |
| 5-08 | PNR TTL override (ttl_type=DAYS_BEFORE) preserved | ttlType, ttlDaysBefore saved | ❌ | C-01 |
| 5-09 | flightSetId set for each PNR | DemoPNR.flightSetId populated | ❌ | C-05 |
| 5-10 | Activity log created with correct action | logs[] has 2–3 entries | ✅ | — |
| 5-11 | Dummy PNR count in log matches actual dummy count | ✅ | — |
| 5-12 | tax: null → saved as 0 for FARE format PNR | 0 instead of null | ❌ | H-05 |
| 5-13 | tax: null preserved for ALL_IN format PNR | null in DemoPNR | ❌ | H-05 |
| 5-14 | routeText built from main schedule sectors | "BKK - NRT - BKK" format | ⚠️ | — |
| 5-15 | summary calculated from pnrs | period, seatTotal, grandTotal correct | ✅ | — |

---

## Section 6 — Edit Round-trip (demoStockToWizardState → wizardStateToDemoStock)

| TC | Scenario | Expected | Estimated Status | Audit Issue |
|----|----------|----------|-----------------|-------------|
| 6-01 | Stock with DAYS_BEFORE TTL — open edit | ttl_type=DAYS_BEFORE in form | ❌ | C-03 |
| 6-02 | Stock with FIXED_DATE TTL — open edit | ttl_type=FIXED_DATE in form | ❌ | C-03 |
| 6-03 | Stock with manually-adjusted sector dates | dep_manual flags preserved | ❌ | M-05 |
| 6-04 | Edit stock — re-save without changes | All data identical to original | ⚠️ | — |
| 6-05 | Stock with per-PNR currency — open edit | currency shown per-PNR | ❌ | C-03 |
| 6-06 | Edit stock — add new PNR — save | New PNR saved alongside existing | ⚠️ | — |
| 6-07 | Stock with multiple schedules — open edit | All schedules preserved | ⚠️ | — |

---

## Section 7 — Status & Validation

| TC | Scenario | Expected | Estimated Status | Audit Issue |
|----|----------|----------|-----------------|-------------|
| 7-01 | Save Draft button | Shows alert only | ❌ (no real save) | C-04 |
| 7-02 | Back button in wizard | Goes to previous step, data preserved | ⚠️ | — |
| 7-03 | Refresh page mid-wizard | Data lost (no persistence) | ⚠️ (expected) | — |
| 7-04 | New stock appears in All Tickets after save | ✅ | — |
| 7-05 | New stock detail page shows correct data | ✅ | — |
| 7-06 | New stock appears in group filter | Filtered by ticketType/groupType | ⚠️ | — |
| 7-07 | demo_stock_updated event fires after save | ✅ | — |

---

## Section 8 — PNR Status System

| TC | Scenario | Expected | Estimated Status | Audit Issue |
|----|----------|----------|-----------------|-------------|
| 8-01 | New PNR in wizard: old `status` field | 'Pending' | ✅ | — |
| 8-02 | New PNR in wizard: new `pnr_status` field | 'PENDING' | ✅ | — |
| 8-03 | New PNR: `confirmation_status` field | 'PENDING_CONFIRMATION' | ✅ | — |
| 8-04 | PNR `status` = 'Confirmed' in wizard | `confirmation_status` = 'CONFIRMED' after save? | ❌ (only checks old status field) | H-03 |
| 8-05 | getPnrConfirmationStatus for new PNR | PENDING_CONFIRMATION | ✅ | — |

---

## Section 9 — Multi-tab / Multi-user (Demo Mode)

| TC | Scenario | Expected | Estimated Status | Audit Issue |
|----|----------|----------|-----------------|-------------|
| 9-01 | Two tabs open wizard simultaneously, both save | Both stocks saved (different IDs) | ⚠️ (may collide by code) | M-02 |
| 9-02 | Tab 1 saves stock; Tab 2 reloads All Tickets | Tab 2 sees new stock | ✅ (localStorage event) | — |
| 9-03 | localStorage quota exceeded | Error silently swallowed | ⚠️ (saveDemoStock catches) | — |

---

## Section 10 — Type Constraints

| TC | Scenario | Expected | Estimated Status | Audit Issue |
|----|----------|----------|-----------------|-------------|
| 10-01 | SERIES: ticketType='Group', groupType='SERIES' | SR prefix | ✅ | — |
| 10-02 | AD_HOC: ticketType='Group', groupType='ADHOC' | AH prefix | ✅ | — |
| 10-03 | FIT: ticketType='FIT', groupType=undefined | FIT prefix | ✅ | — |
| 10-04 | TICKET_ONLY: ticketType='Ticket + Land', groupType=undefined | TO prefix | ✅ | — |
| 10-05 | SERIES requires min 2 sectors; FIT allows 1 | Enforced in Step2 | ⚠️ | — |

---

## Test Priority Order (for Phase 2 fix verification)

1. **C-01** (TTL save) — TC 3-12, 3-14, 5-08
2. **C-02** (Conditions missing) — TC 3-15, 4-08
3. **C-03** (Edit round-trip TTL) — TC 6-01, 6-02, 6-05
4. **C-04** (Draft) — TC 7-01
5. **C-05** (flightSetId) — TC 5-09
6. **H-05** (tax null→0) — TC 5-12, 5-13
7. **M-03** (Duplicate block) — TC 4-03
8. **M-05** (Manual sector dates) — TC 6-03
