import { format, parseISO, isValid } from 'date-fns'
import { buildRouteText, formatDate } from '@/lib/utils'
import type { WizardState, FlightSeries, TicketType, TripType, StockStatus } from '@/types'
import {
  type AppStockCondition, type AppCondition, type CondCalcType, type CondDueType, type CondTtlCalcType, type CondRefundableType,
  calcCondTtlDate,
  defaultBaggagePolicy, migrateBaggagePolicy,
  defaultSeatReductionPolicy, migrateSeatReductionPolicy, defaultSeatReturnPolicy, defaultRefundPolicy, defaultTtlRule,
  migrateRefundTerms, defaultRefundTerms, defaultCancelGroupTerms,
} from '@/lib/condition-schema'

// Map removed calc types to the nearest active equivalent
function migrateCalcType(ct: string | undefined): CondCalcType {
  switch (ct) {
    case 'PER_SEAT': case 'FIXED_PER_PNR': case 'FIXED_PER_SERIES': return ct
    case 'FIXED_AMOUNT': return 'FIXED_PER_SERIES'
    // Percent types and remaining balance default to PER_SEAT
    default: return 'PER_SEAT'
  }
}

function migrateDueType(dt: string | undefined): CondDueType {
  if (dt === 'CUSTOM_DATE') return 'CUSTOM_DATE'
  return 'TRAVEL_MINUS_DAYS'
}

function migrateTtlCalcType(ct: string | undefined): CondTtlCalcType {
  if (ct === 'MANUAL_DATE') return 'MANUAL_DATE'
  return 'TRAVEL_MINUS_DAYS'
}

function migrateRefundable(r: string | undefined): CondRefundableType {
  if (r === 'REFUNDABLE' || r === 'NON_REFUNDABLE') return r
  return 'UNSPECIFIED'
}

const STORAGE_KEY = 'ticket_stock_demo_data'

// ============================================================
// Demo Storage Types
// ============================================================

export interface DemoSector {
  sectorId: string
  seq: number
  sectorType: string
  airlineCode: string
  flightNo: string
  depAirportCode: string
  arrAirportCode: string
  depTime: string
  arrTime: string
  arrDayOffset: number
  dayOffset: number
  remark: string
}

export interface DemoFlightSet {
  flightSetId: string
  flightSetName: string
  sectors: DemoSector[]
  isCustom?: boolean
  createdFromPnrId?: string
}

export interface DemoScheduleInfo {
  scheduleId: string
  scheduleName: string
  isMain: boolean
  sectors: DemoSector[]
  countryCode?: string
  countryName?: string
  destinationAirport?: string
  remark: string
  sourceScheduleId?: string
}

export interface DemoConditionStage {
  stageId: string
  stageSeq: number
  stageName: string
  paymentType: string         // holds PaymentType values or legacy string
  customPaymentName: string | null
  // Legacy amount fields (backward-compat)
  amountType: string
  amount: number
  percentBase: string
  paymentBaseDate: string
  paymentDueDaysBefore: number
  paymentDueTime: string
  // Per-seat fields (new system)
  amountMode?: AmountMode
  ratePerSeat?: number
  currencyCode?: string
  seatBasis?: SeatBasis
  seatSnapshotRule?: string
  dueBase?: string
  dueOffsetDays?: number
  dueTime?: string
  nonRefundable?: boolean
  creditTowardFare?: boolean
  remark?: string
}

export interface DemoTtlRule {
  ttlCalcType: 'from_travel_date' | 'manual' | 'not_set'
  ttlBaseDate: string
  ttlDaysBefore: number
  ttlDate: string
  ttlTime: string
}

export interface DemoCondition {
  conditionId: string
  conditionCode: string
  conditionName: string
  description: string
  status: string
  stages: DemoConditionStage[]
  ttlRule: DemoTtlRule
  // Template source tracking (snapshot model)
  conditionSource?: 'none' | 'template' | 'custom'
  sourceTemplateId?: string
  sourceTemplateVersion?: number
  appliedTemplateName?: string
  appliedDate?: string
  // Stock-level modification tracking
  locallyModified?: boolean          // true when user edited after applying from template
  refundType?: string                // copied from template refundType (FULL_REFUND | PARTIAL_REFUND | CONDITIONAL_REFUND | NON_REFUNDABLE)
  refundDescription?: string         // copied from template refundDescription
  freeTextCondition?: string         // copied from template freeTextCondition
}

export interface DemoLog {
  logId: string
  action: string
  message: string
  createdAt: string
  createdBy: string
}

export interface DemoReopenEvent {
  eventId: string
  eventType: 'STOCK_REOPEN_REQUESTED' | 'STOCK_REOPEN_PIN_FAILED' | 'STOCK_REOPENED' | 'STOCK_UPDATED_AFTER_REOPEN' | 'STOCK_RECLOSED' | 'STOCK_REOPEN_SCOPE_EXTENDED'
  actor: string
  role: string
  timestamp: string
  reason?: string
  sections?: string[]
  details?: string
  failedAttempts?: number
}

// ─── Financial Transactions ───────────────────────────────────────────────────

export type TransactionType = 'PAYMENT' | 'REFUND' | 'FORFEITURE' | 'ADJUSTMENT' | 'REVERSAL'

export type PaymentMethod = 'BANK_TRANSFER' | 'CREDIT_CARD' | 'TOPUP' | 'CASH' | 'CHEQUE' | 'OTHER'

// ─── Per-seat Payment Schedule Types ─────────────────────────────────────────

export type PaymentType = 'RSVN_FEE' | 'DEPOSIT_1' | 'DEPOSIT_2' | 'FULL_PAYMENT' | 'OTHER'
export type AmountMode = 'PER_SEAT_FIXED' | 'PERCENT_PER_SEAT' | 'REMAINING_PER_SEAT' | 'FIXED_TOTAL'
export type SeatBasis = 'INITIAL_SEAT' | 'REMAINING_AT_CUTOFF' | 'MANUAL_SEAT'
export type StageStatus =
  | 'WAITING_CALCULATION'
  | 'ESTIMATED'
  | 'LOCKED'
  | 'REQUESTED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'ADJUSTED'
  | 'CANCELLED'

export interface PNRStageSnapshot {
  stageId: string
  seatSnapshot: number
  rateSnapshot: number
  confirmedAmount: number
  lockedAt: string
  lockedBy: string
  stageStatus: StageStatus
  manualSeatReason?: string
}

export interface FinancialTransaction {
  transactionId: string
  pnrId: string
  paymentStageId: string | null
  originalTransactionId: string | null
  transactionType: TransactionType
  paymentMethod: PaymentMethod | null
  amount: number
  feeAmount: number
  currencyCode: string
  transactionDate: string
  paymentDateTime: string | null
  status: string
  reasonCode: string | null
  referenceNo: string | null
  creditNoteNo: string | null
  attachmentUrl: string | null
  remark: string | null
  // Bank transfer
  sourceBank: string | null
  destinationBank: string | null
  transferReference: string | null
  // Credit card (stored: brand + last 4 only — no full number, no CVV)
  cardBrand: string | null
  cardLast4: string | null
  authorizationCode: string | null
  // Topup
  topupAccountId: string | null
  topupReference: string | null
  topupBalanceBefore: number | null
  topupUsedAmount: number | null
  topupBalanceAfter: number | null
  createdBy: string
  approvedBy: string | null
  createdAt: string
  updatedAt: string
  // ── New fields (all optional for backward compat) ─────────────────────────
  postingDate?: string | null          // date accounting posted to books (YYYY-MM-DD)
  voucherNo?: string | null            // accounting voucher number
  accountingNote?: string | null       // accounting remark when posting
  postedBy?: string | null             // who posted (accounting staff/manager)
  linkedRequestId?: string | null      // linked FinancialRequest.requestId
  voidedAt?: string | null             // when voided
  voidedBy?: string | null
  voidReason?: string | null
  reversalReason?: string | null       // reason for reversal
  idempotencyKey?: string | null       // prevent duplicate submission
}

export interface PNRFinancialSummary {
  requiredAmount: number          // confirmed (locked) stages only
  confirmedRequiredAmount: number // same as requiredAmount (explicit alias)
  estimatedAmount: number         // estimated (not-yet-locked) stages
  paidAmount: number
  refundAmount: number
  forfeitedAmount: number
  supplierHeldAmount: number
  outstandingAmount: number
  netCashPaid: number
  methodBreakdown: Partial<Record<PaymentMethod, number>>
  adjustedAmount: number          // net adjustment (positive or negative)
  pendingRequestCount: number     // count of pending requests (for display — passed as param)
}

// ── Canonical transaction status groups ───────────────────────────────────────
// New transactions should use 'POSTED'; legacy data may use the alternatives.

export const POSTED_TX_STATUSES = ['POSTED', 'COMPLETED', 'CONFIRMED', 'RECEIVED'] as const
export const VOIDED_TX_STATUSES = ['VOIDED', 'CANCELLED'] as const
export const REVERSED_TX_STATUSES = ['REVERSED'] as const
export const PENDING_TX_STATUSES = [
  'DRAFT',
  'PENDING',
  'PENDING_APPROVAL',
  'PENDING_ACCOUNTING_REVIEW',
  'PENDING_MANAGER_APPROVAL',
] as const

/**
 * Returns true when a transaction has been fully posted / confirmed to the books.
 * Accepts both the canonical 'POSTED' status and legacy equivalent values so that
 * old demo data continues to be counted correctly.
 */
export function isPostedStatus(tx: FinancialTransaction): boolean {
  return (
    tx.status === 'POSTED' ||
    tx.status === 'COMPLETED' ||
    tx.status === 'CONFIRMED' ||
    tx.status === 'RECEIVED'
  )
}

export interface PaymentScheduleItem {
  pnrDisplay: string
  pnrId: string
  stageId: string
  stageSeq: number
  stageName: string
  paymentType: string
  amountType: string
  amount: number
  baseDate: string
  dueDaysBefore: number
  dueDate: string | null
  ttlDatetime: string | null
  paid: number
  paidForStage: number        // computed from POSTED transactions with matching paymentStageId
  refundForStage: number      // computed from POSTED REFUND transactions with matching paymentStageId
  remainingForStage: number   // max(effectiveAmount - paidForStage + refundForStage, 0)
  status: 'Pending' | 'Paid' | 'Overdue' | 'Partially_Paid'  // backward-compat
  // ── Two-badge status (derived) ────────────────────────────────────────────────
  paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'PENDING'
  timingStatus: 'PAID_ON_TIME' | 'PAID_LATE' | 'OVERDUE' | 'NOT_DUE' | 'PENDING_MORE'
  fullyPaidAt: string | null  // ISO datetime of tx that completed the stage payment
  lateDays: number | null     // days late when PAID_LATE (> 0)
  overdueDays: number | null  // days overdue when OVERDUE (> 0)
  // Per-seat fields
  amountMode?: AmountMode
  ratePerSeat?: number
  seatBasis?: SeatBasis
  estimatedSeats?: number
  lockedSeats?: number
  estimatedAmount?: number
  confirmedAmount?: number
  lockDate?: string | null
  nonRefundable?: boolean
  creditTowardFare?: boolean
  stageStatus?: StageStatus
}

export interface DemoPNR {
  pnrId: string
  pnrCode: string
  dummyPnr: string
  pnrType: 'real' | 'dummy'
  pnrDisplay: string
  travelStart: string
  travelEnd: string
  flightSetId?: string
  scheduleId?: string
  sectorDates: { sectorType: string; date: string }[]
  seatTotal: number
  seatUsed: number
  seatBalance: number
  priceFormat?: 'FARE' | 'FARE_YQ' | 'ALL_IN'
  fare: number
  yq?: number
  taxType: string
  tax: number
  fareIncludesTax: boolean
  taxStatus: 'completed' | 'included' | 'pending'
  total: number
  conditionCode: string
  ttlDate: string | null
  ttlTime: string | null
  ttlDateTime: string | null
  status: string
  remark: string
  initialSeatCount?: number                         // seat count at PNR creation (INITIAL_SEAT basis)
  stageSnapshots?: Record<string, PNRStageSnapshot> // keyed by stageId
}

export interface DemoSummary {
  period: string
  periodStart: string | null
  periodEnd: string | null
  pnrCount: number
  seatTotal: number
  seatUsed: number
  seatBalance: number
  fareTotal: number
  taxTotal: number
  grandTotal: number
  nextTTL: string | null
}

export interface DemoStock {
  stockId: string
  stockCode: string
  ticketType: TicketType
  tripType: TripType
  groupName: string
  airlineCode: string
  countryId: string
  tourGroupId?: string
  destination: string
  currency: string
  status: StockStatus
  remark: string
  routeText: string
  createdAt: string
  updatedAt: string
  sectors: DemoSector[]
  flightSets?: DemoFlightSet[]
  schedules?: DemoScheduleInfo[]
  conditions: AppStockCondition[]
  pnrs: DemoPNR[]
  summary: DemoSummary
  logs: DemoLog[]
  transactions: FinancialTransaction[]
  // Closed state
  closedAt?: string
  closedBy?: string
  // Reopened state
  reopenedAt?: string
  reopenedBy?: string
  reopenedByRole?: string
  reopenReason?: string
  reopenAllowedSections?: string[]
  reopenEvents?: DemoReopenEvent[]
  defaultConditionCode?: string
}

// ============================================================
// Unique ID generator
// ============================================================

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ============================================================
// localStorage CRUD
// ============================================================

export function getDemoStocks(): DemoStock[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DemoStock[]
    const migrateSectorType = (t: string) =>
      t === 'Outbound' ? 'Departure' : t === 'Return' ? 'Arrival' : t === 'Domestic' ? 'Transit' : t
    const migrateSec = (sec: DemoSector): DemoSector => ({ ...sec, sectorType: migrateSectorType(sec.sectorType) })
    return parsed.map(s => {
      const migratedSectors = (s.sectors ?? []).map(migrateSec)
      const flightSets: DemoFlightSet[] = s.flightSets && s.flightSets.length > 0
        ? s.flightSets.map(fs => ({ ...fs, sectors: (fs.sectors ?? []).map(migrateSec) }))
        : [{ flightSetId: 'fset-default', flightSetName: 'Default', sectors: migratedSectors }]
      // Fill missing new policy fields (baggagePolicy / seatReductionPolicy / seatReturnPolicy)
      // so old AppStockCondition objects (created before this schema revision) get defaults.
      const ensureNewPolicies = (cond: AppCondition): AppCondition => ({
        ...cond,
        // § 1 Extended — added 2026-07
        airline:             (cond as any).airline        ?? '',
        currency:            (cond as any).currency       ?? 'THB',
        conditionType:       (cond as any).conditionType  ?? 'Custom',
        applyScope:          (cond as any).applyScope     ?? 'ALL',
        applyRoutes:         (cond as any).applyRoutes    ?? [],
        applyCountries:      (cond as any).applyCountries ?? [],
        effectiveDate:       (cond as any).effectiveDate  ?? '',
        version:             (cond as any).version        ?? 'V1',
        // § 2 Stages — new stage fields added 2026-07
        stages: (cond.stages ?? []).map((s: any) => ({
          ...s,
          calcType:  migrateCalcType(s.calcType),
          dueType:   migrateDueType(s.dueType),
          quantityBasis:             s.quantityBasis             ?? 'INITIAL_SEAT',
          refundable:  migrateRefundable(s.refundable ?? (s.nonRefundable ? 'NON_REFUNDABLE' : undefined)),
        })),
        // § 2 TTL — remark field added 2026-07
        ttlRule: { ...(cond.ttlRule ?? defaultTtlRule()), remark: (cond.ttlRule as any)?.remark ?? '', calcType: migrateTtlCalcType((cond.ttlRule as any)?.calcType) },
        // Policies — migrate old {enabled,checkedBagKg,...} to new schema
        baggagePolicy:       migrateBaggagePolicy((cond as any).baggagePolicy ?? null) ?? defaultBaggagePolicy(),
        seatReductionPolicy: migrateSeatReductionPolicy((cond as any).seatReductionPolicy ?? null),
        cancelGroupTerms:    (cond as any).cancelGroupTerms ?? defaultCancelGroupTerms(),
        seatReturnPolicy:    cond.seatReturnPolicy     ?? defaultSeatReturnPolicy(),
        refundPolicy:        cond.refundPolicy         ?? defaultRefundPolicy(),
        refundTerms:         migrateRefundTerms((cond as any).refundTerms ?? null),
        freeTextCondition:   cond.freeTextCondition    ?? '',
        freeTextHtml:        (cond as any).freeTextHtml ?? '',
        internalNote:        cond.internalNote         ?? '',
      })

      // Migrate conditions: old DemoCondition[] → AppStockCondition[]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const migratedConditions: AppStockCondition[] = (s.conditions ?? []).map((c: any) => {
        if (c.condition !== undefined) {
          // Already migrated — just fill any missing new fields
          return { ...c, condition: ensureNewPolicies(c.condition) } as AppStockCondition
        }
        // Old DemoCondition format — wrap it
        return {
          source: (c.conditionSource === 'template' ? 'template' : 'custom') as 'custom' | 'template',
          sourceTemplateId: c.sourceTemplateId,
          sourceTemplateName: c.appliedTemplateName,
          sourceTemplateVersion: c.sourceTemplateVersion,
          appliedAt: c.appliedDate,
          locallyModified: c.locallyModified ?? false,
          condition: {
            conditionId: c.conditionId ?? (`CON-${Math.random().toString(36).slice(2)}`),
            conditionCode: c.conditionCode ?? '',
            conditionName: c.conditionName ?? '',
            description: c.description ?? '',
            status: (c.status ?? 'Active') as 'Active' | 'Inactive',
            stages: (c.stages ?? []).map((st: any, si: number) => ({
              stageId: st.stageId ?? `STG-${si}`,
              stageNo: st.stageSeq ?? st.stageNo ?? (si + 1),
              stageName: st.stageName ?? `งวดที่ ${si + 1}`,
              paymentType: (st.paymentType ?? '') as import('./condition-schema').CondPaymentType | '',
              customPaymentName: st.customPaymentName ?? '',
              calcType: migrateCalcType((() => {
                const t = st.amountType ?? st.calcType ?? 'FIXED_PER_PNR'
                if (t === 'PER_SEAT' || t === 'FIXED_SEAT') return 'PER_SEAT'
                if (t === 'FIXED_PER_SERIES') return 'FIXED_PER_SERIES'
                if (t === 'FIXED_PER_PNR') return 'FIXED_PER_PNR'
                return t // pass through — migrateCalcType handles legacy mapping
              })()),
              amount: st.amount ?? 0,
              percent: st.amount ?? st.percent ?? 0,
              calcBase: null,
              dueType: migrateDueType((() => {
                const b = st.paymentBaseDate ?? st.dueBase ?? st.dueType ?? ''
                if (b === 'TRAVEL_MINUS_DAYS' || b.includes('Travel')) return 'TRAVEL_MINUS_DAYS'
                if (b === 'CUSTOM_DATE') return 'CUSTOM_DATE'
                return 'TRAVEL_MINUS_DAYS'
              })()),
              dueDays: st.paymentDueDaysBefore ?? st.dueDays ?? st.dueOffsetDays ?? 0,
              dueTime: st.paymentDueTime ?? st.dueTime ?? '18:00',
              dueDate: st.dueDate ?? '',
              creditTowardFare: st.creditTowardFare ?? false,
              quantityBasis: (st.quantityBasis ?? 'INITIAL_SEAT') as import('./condition-schema').CondQuantityBasis,
              refundable: migrateRefundable(st.refundable ?? (st.nonRefundable ? 'NON_REFUNDABLE' : undefined)),
              nonRefundable: st.nonRefundable ?? false,
              remark: st.remark ?? '',
            })),
            ttlRule: {
              calcType: migrateTtlCalcType((() => {
                const t = c.ttlRule?.ttlCalcType ?? c.ttlRule?.calcType ?? ''
                if (t === 'from_travel_date' || t === 'TRAVEL_MINUS_DAYS') return 'TRAVEL_MINUS_DAYS'
                if (t === 'manual' || t === 'MANUAL_DATE') return 'MANUAL_DATE'
                return 'TRAVEL_MINUS_DAYS'
              })()),
              daysBefore: c.ttlRule?.ttlDaysBefore ?? c.ttlRule?.daysBefore ?? 30,
              time: c.ttlRule?.ttlTime ?? c.ttlRule?.time ?? '18:00',
              fixedDate: c.ttlRule?.ttlDate ?? c.ttlRule?.fixedDate ?? '',
              remark: c.ttlRule?.remark ?? '',
            },
            airline:             '',
            currency:            'THB',
            conditionType:       'Custom' as const,
            applyScope:          'ALL' as const,
            applyRoutes:         [],
            applyCountries:      [],
            effectiveDate:       '',
            version:             'V1',
            baggagePolicy:       defaultBaggagePolicy(),
            seatReductionPolicy: defaultSeatReductionPolicy(),
            cancelGroupTerms:    defaultCancelGroupTerms(),
            seatReturnPolicy:    defaultSeatReturnPolicy(),
            refundPolicy: {
              enabled: !!(c.refundType),
              refundType: (c.refundType ?? null) as import('./condition-schema').CondRefundType | null,
              description: c.refundDescription ?? '',
              tiers: [],
            },
            refundTerms:         defaultRefundTerms(),
            freeTextCondition: c.freeTextCondition ?? '',
            freeTextHtml:      c.freeTextHtml      ?? '',
            internalNote: '',
          },
        } satisfies AppStockCondition
      })

      return {
        ...s,
        logs: s.logs ?? [],
        transactions: s.transactions ?? [],
        sectors: migratedSectors,
        flightSets,
        conditions: migratedConditions,
        pnrs: (s.pnrs ?? []).map(p => ({
          ...p,
          flightSetId: p.flightSetId ?? flightSets[0]?.flightSetId ?? 'fset-default',
          sectorDates: (p.sectorDates ?? []).map(sd => ({
            ...sd,
            sectorType: migrateSectorType(sd.sectorType),
          })),
          initialSeatCount: p.initialSeatCount ?? p.seatTotal,
          stageSnapshots: p.stageSnapshots ?? {},
        })),
      }
    })
  } catch {
    return []
  }
}

export function getDemoStockByCode(stockCode: string): DemoStock | null {
  return getDemoStocks().find(s => s.stockCode === stockCode) ?? null
}

export function getDemoStockById(stockId: string): DemoStock | null {
  const stocks = getDemoStocks()
  return stocks.find(s => s.stockId === stockId) ?? null
}

export function getStockFlightSets(stock: DemoStock): DemoFlightSet[] {
  return stock.flightSets && stock.flightSets.length > 0
    ? stock.flightSets
    : [{ flightSetId: 'fset-default', flightSetName: 'Default', sectors: stock.sectors }]
}

export function saveDemoStock(stock: DemoStock): void {
  if (typeof window === 'undefined') return
  try {
    const stocks = getDemoStocks()
    // prepend (newest first), replace if same stockId already exists
    const filtered = stocks.filter(s => s.stockId !== stock.stockId)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([stock, ...filtered]))
    window.dispatchEvent(new CustomEvent('demo_stock_updated', { detail: { stockId: stock.stockId } }))
  } catch {
    // silently ignore quota errors
  }
}

export function deleteDemoStock(stockId: string): void {
  if (typeof window === 'undefined') return
  try {
    const stocks = getDemoStocks().filter(s => s.stockId !== stockId)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stocks))
    window.dispatchEvent(new CustomEvent('demo_stock_updated', { detail: { stockId } }))
  } catch {
    // silently ignore
  }
}

export function clearAllDemoData(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent('demo_stock_updated', { detail: {} }))
  } catch {
    // silently ignore
  }
}

/**
 * Clears only demo stocks of a given ticket type (Group / FIT / Ticket + Land),
 * leaving the other types intact. Returns the number of stocks removed.
 */
export function clearDemoStocksByType(ticketType: TicketType): number {
  if (typeof window === 'undefined') return 0
  try {
    const all = getDemoStocks()
    const remaining = all.filter(s => s.ticketType !== ticketType)
    const removed = all.length - remaining.length
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining))
    window.dispatchEvent(new CustomEvent('demo_stock_updated', { detail: { ticketType } }))
    return removed
  } catch {
    return 0
  }
}

// ============================================================
// JSON export helpers
// ============================================================

export function exportStockJSON(stock: DemoStock): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([JSON.stringify(stock, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${stock.stockCode}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportAllStocksJSON(): void {
  if (typeof window === 'undefined') return
  const stocks = getDemoStocks()
  const blob = new Blob([JSON.stringify(stocks, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ticket_stock_demo_data.json'
  a.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// Summary calculation
// ============================================================

/**
 * Central Source of Truth for TTL Date across all pages.
 *
 * Rules:
 *   - Exclude PNRs with status 'Ticketed' (names submitted) or 'Cancelled'
 *   - Include ALL remaining PNRs that have a ttlDateTime, past or future
 *   - Returns the earliest ttlDateTime as ISO string, or null if none
 *
 * A past TTL must still be displayed (in red) to alert users of overdue deadlines.
 */
export function getNextTTL(pnrs: DemoPNR[]): string | null {
  const candidates = pnrs
    .filter(p => p.status !== 'Ticketed' && p.status !== 'Cancelled')
    .filter(p => !!p.ttlDateTime)
    .map(p => p.ttlDateTime as string)
    .sort()
  return candidates[0] ?? null
}

export function calculateStockSummary(pnrs: DemoPNR[]): DemoSummary {
  const pnrCount = pnrs.length
  const seatTotal = pnrs.reduce((sum, p) => sum + p.seatTotal, 0)
  const seatUsed = pnrs.reduce((sum, p) => sum + p.seatUsed, 0)
  const seatBalance = pnrs.reduce((sum, p) => sum + p.seatBalance, 0)
  const fareTotal = pnrs.reduce((sum, p) => sum + p.fare, 0)
  const taxTotal = pnrs
    .filter(p => p.taxType === 'separate')
    .reduce((sum, p) => sum + p.tax, 0)
  const grandTotal = pnrs.reduce((sum, p) => sum + p.total, 0)

  // Period: min and max of travelStart
  const travelStarts = pnrs.map(p => p.travelStart).filter(Boolean).sort()
  const periodStart = travelStarts[0] ?? null
  const periodEnd = travelStarts[travelStarts.length - 1] ?? null

  // period display text
  const period = periodStart
    ? periodStart === periodEnd
      ? formatDate(periodStart)
      : `${formatDate(periodStart)} – ${formatDate(periodEnd)}`
    : '—'

  const nextTTL = getNextTTL(pnrs)

  return {
    period,
    periodStart,
    periodEnd,
    pnrCount,
    seatTotal,
    seatUsed,
    seatBalance,
    fareTotal,
    taxTotal,
    grandTotal,
    nextTTL,
  }
}

// ============================================================
// DemoStock → WizardState conversion  (for Edit page)
// ============================================================

export function demoStockToWizardState(stock: DemoStock): WizardState {
  return {
    step: 1,
    stockInfo: {
      ticket_type: stock.ticketType,
      trip_type: stock.tripType,
      stock_code: stock.stockCode,
      group_name: stock.groupName,
      country_id: stock.countryId,
      tour_group_id: stock.tourGroupId ?? '',
      destination: stock.destination,
      airline_code: stock.airlineCode,
      currency: stock.currency,
      status: stock.status,
      remark: stock.remark,
    },
    schedules: (() => {
      if (stock.schedules && stock.schedules.length > 0) {
        return stock.schedules.map(sch => ({
          scheduleId: sch.scheduleId,
          scheduleName: sch.scheduleName,
          isMain: sch.isMain,
          remark: sch.remark,
          countryCode: sch.countryCode,
          countryName: sch.countryName,
          destinationAirport: sch.destinationAirport,
          sectors: sch.sectors.map(s => ({
            seq: s.seq,
            sector_type: s.sectorType as import('@/types').SectorType,
            airline_code: s.airlineCode,
            flight_no: s.flightNo,
            dep_airport_code: s.depAirportCode,
            arr_airport_code: s.arrAirportCode,
            dep_time: s.depTime,
            arr_time: s.arrTime,
            arr_day_offset: s.arrDayOffset,
            day_offset: s.dayOffset,
            remark: s.remark,
          })),
        }))
      }
      return [{
        scheduleId: 'SCH-A',
        scheduleName: 'ชุดเที่ยวบินหลัก',
        isMain: true,
        remark: '',
        countryCode: undefined,
        countryName: undefined,
        destinationAirport: undefined,
        sectors: stock.sectors.map(s => ({
          seq: s.seq,
          sector_type: s.sectorType as import('@/types').SectorType,
          airline_code: s.airlineCode,
          flight_no: s.flightNo,
          dep_airport_code: s.depAirportCode,
          arr_airport_code: s.arrAirportCode,
          dep_time: s.depTime,
          arr_time: s.arrTime,
          arr_day_offset: s.arrDayOffset,
          day_offset: s.dayOffset,
          remark: s.remark,
        })),
      }]
    })(),
    // Stock → Wizard: AppStockCondition → AppCondition (just unwrap the wrapper)
    conditions: stock.conditions.map(sc => sc.condition),
    pnrs: stock.pnrs.map(p => ({
      pnr_code: p.pnrCode,
      dummy_pnr: p.dummyPnr,
      travel_start: p.travelStart,
      travel_end: p.travelEnd,
      seat_total: p.seatTotal,
      fare: p.fare,
      tax_type: p.taxType as WizardState['pnrs'][0]['tax_type'],
      tax: p.tax,
      total_amount: p.total,
      condition_id: p.conditionCode,
      status: p.status as WizardState['pnrs'][0]['status'],
      remark: p.remark,
      schedule_id: p.scheduleId,
      sector_dates: (p.sectorDates ?? []).map(sd => ({
        sector_type: sd.sectorType,
        day_offset: stock.sectors.find(s => s.sectorType === sd.sectorType)?.dayOffset ?? 1,
        travel_date: sd.date,
      })),
    })),
  }
}

// ============================================================
// WizardState → DemoStock conversion
// ============================================================

export function wizardStateToDemoStock(state: WizardState): DemoStock {
  const { stockInfo, schedules, conditions, pnrs } = state
  const now = new Date().toISOString()

  const stockId = genId('STK')

  const mainSchedule = schedules.find(s => s.isMain) ?? schedules[0]
  const sectors = mainSchedule?.sectors ?? []

  // Convert sectors (from main schedule)
  const demoSectors: DemoSector[] = sectors.map((s, i) => ({
    sectorId: genId('SEC'),
    seq: s.seq ?? i + 1,
    sectorType: s.sector_type,
    airlineCode: s.airline_code,
    flightNo: s.flight_no,
    depAirportCode: s.dep_airport_code,
    arrAirportCode: s.arr_airport_code,
    depTime: s.dep_time,
    arrTime: s.arr_time,
    arrDayOffset: s.arr_day_offset,
    dayOffset: s.day_offset,
    remark: s.remark ?? '',
  }))

  // Convert all schedules
  const demoSchedules: DemoScheduleInfo[] = schedules.map(sch => ({
    scheduleId: sch.scheduleId,
    scheduleName: sch.scheduleName,
    isMain: sch.isMain,
    remark: sch.remark,
    countryCode: sch.countryCode,
    countryName: sch.countryName,
    destinationAirport: sch.destinationAirport,
    sectors: sch.sectors.map((s, i) => ({
      sectorId: genId('SEC'),
      seq: s.seq ?? i + 1,
      sectorType: s.sector_type,
      airlineCode: s.airline_code,
      flightNo: s.flight_no,
      depAirportCode: s.dep_airport_code,
      arrAirportCode: s.arr_airport_code,
      depTime: s.dep_time,
      arrTime: s.arr_time,
      arrDayOffset: s.arr_day_offset,
      dayOffset: s.day_offset,
      remark: s.remark ?? '',
    })),
  }))

  // Convert conditions — AppCondition[] → AppStockCondition[]
  const demoConditions: AppStockCondition[] = conditions.map(c => ({
    source: 'custom' as const,
    condition: c,
  }))

  // Build condition lookup by conditionId (wizard PNR links by conditionId)
  const conditionById: Record<string, AppStockCondition> = {}
  demoConditions.forEach(sc => {
    conditionById[sc.condition.conditionId] = sc
    conditionById[sc.condition.conditionCode] = sc   // also by code for backward compat
  })

  // Convert PNRs — build per-schedule sector lookup for per-PNR travel_end computation
  const scheduleMap: Record<string, DemoScheduleInfo> = {}
  demoSchedules.forEach(sch => { scheduleMap[sch.scheduleId] = sch })

  const demoPNRs: DemoPNR[] = pnrs.map(p => {
    const isReal = !!p.pnr_code?.trim()
    const pnrType: 'real' | 'dummy' = isReal ? 'real' : 'dummy'
    const pnrDisplay = isReal ? p.pnr_code! : (p.dummy_pnr || '')

    // Find linked condition to compute TTL
    let ttlDateTime: string | null = null
    const linkedSC = conditionById[p.condition_id ?? '']
    if (linkedSC && p.travel_start) {
      ttlDateTime = calcCondTtlDate(linkedSC.condition.ttlRule, p.travel_start)
    }

    // Extract ttlDate and ttlTime for display
    let ttlDate: string | null = null
    let ttlTimeStr: string | null = null
    if (ttlDateTime) {
      try {
        const d = parseISO(ttlDateTime)
        if (isValid(d)) {
          ttlDate = format(d, 'yyyy-MM-dd')
          ttlTimeStr = format(d, 'HH:mm')
        }
      } catch {
        // keep null
      }
    }

    // taxStatus
    let taxStatus: 'completed' | 'included' | 'pending'
    if (p.tax_type === 'included') taxStatus = 'included'
    else if (p.tax_type === 'pending') taxStatus = 'pending'
    else taxStatus = 'completed'

    // sector dates
    const sectorDates = (p.sector_dates ?? []).map(sd => ({
      sectorType: sd.sector_type,
      date: sd.travel_date,
    }))

    const seatBalance = Math.max(0, p.seat_total - 0) // new stocks: seat_used = 0

    return {
      pnrId: genId('PNR'),
      pnrCode: p.pnr_code ?? '',
      dummyPnr: p.dummy_pnr ?? '',
      pnrType,
      pnrDisplay,
      travelStart: p.travel_start ?? '',
      travelEnd: p.travel_end ?? '',
      scheduleId: p.schedule_id,
      sectorDates,
      seatTotal: p.seat_total,
      seatUsed: 0,
      seatBalance: p.seat_total,
      fare: p.fare,
      taxType: p.tax_type,
      tax: p.tax,
      fareIncludesTax: p.tax_type === 'included',
      taxStatus,
      total: p.total_amount,
      conditionCode: linkedSC?.condition.conditionCode ?? '',
      ttlDate,
      ttlTime: ttlTimeStr,
      ttlDateTime,
      status: p.status ?? 'Pending',
      remark: p.remark ?? '',
      initialSeatCount: p.seat_total,
      stageSnapshots: {},
    }
  })

  // Route text
  const routeText = buildRouteText(
    sectors.map(s => ({ dep_airport_code: s.dep_airport_code, arr_airport_code: s.arr_airport_code }))
  )

  const summary = calculateStockSummary(demoPNRs)

  // Auto-generate initial activity logs
  const logs: DemoLog[] = [
    {
      logId: genId('LOG'),
      action: 'Create Stock',
      message: `สร้าง Stock ${stockInfo.stock_code}`,
      createdAt: now,
      createdBy: 'System',
    },
  ]
  const dummyCount = demoPNRs.filter(p => p.pnrType === 'dummy').length
  if (dummyCount > 0) {
    logs.push({
      logId: genId('LOG'),
      action: 'Generate Dummy PNR',
      message: `สร้าง Dummy PNR อัตโนมัติ ${dummyCount} รายการ`,
      createdAt: now,
      createdBy: 'System',
    })
  }
  logs.push({
    logId: genId('LOG'),
    action: 'Save Demo Data',
    message: 'บันทึกข้อมูลใน localStorage (Demo Mode)',
    createdAt: now,
    createdBy: 'System',
  })

  return {
    stockId,
    stockCode: stockInfo.stock_code,
    ticketType: stockInfo.ticket_type,
    tripType: stockInfo.trip_type,
    groupName: stockInfo.group_name,
    airlineCode: stockInfo.airline_code,
    countryId: mainSchedule?.countryCode ?? stockInfo.country_id ?? '',
    tourGroupId: stockInfo.tour_group_id ?? '',
    destination: stockInfo.destination ?? '',
    currency: stockInfo.currency,
    status: stockInfo.status,
    remark: stockInfo.remark ?? '',
    routeText,
    createdAt: now,
    updatedAt: now,
    sectors: demoSectors,
    schedules: demoSchedules,
    conditions: demoConditions,
    pnrs: demoPNRs,
    summary,
    logs,
    transactions: [],
  }
}

// ============================================================
// Payment Schedule builder
// ============================================================

export function buildPaymentSchedule(stock: DemoStock): PaymentScheduleItem[] {
  const items: PaymentScheduleItem[] = []

  for (const pnr of stock.pnrs) {
    if (!pnr.conditionCode) continue
    const sc = stock.conditions.find(c => c.condition.conditionCode === pnr.conditionCode)
    const cond = sc?.condition
    if (!cond || cond.stages.length === 0) continue

    let cumulative = 0
    const sortedStages = [...cond.stages].sort((a, b) => a.stageNo - b.stageNo)
    const currentSeats = Math.max(0, pnr.seatBalance ?? pnr.seatTotal)
    let prevDueDate: string | null = null

    for (const stage of sortedStages) {
      // ── Due date calculation ──────────────────────────────────────────
      let dueDate: string | null = null
      let baseDateStr = ''

      if (stage.dueType === 'TRAVEL_MINUS_DAYS' && pnr.travelStart) {
        try {
          const d = parseISO(pnr.travelStart)
          if (isValid(d)) {
            const due = new Date(d)
            due.setDate(due.getDate() - stage.dueDays)
            dueDate = format(due, 'yyyy-MM-dd')
            baseDateStr = pnr.travelStart
          }
        } catch { /* keep null */ }
      } else if (stage.dueType === 'CREATED_PLUS_DAYS') {
        try {
          const d = parseISO(stock.createdAt)
          if (isValid(d)) {
            const due = new Date(d)
            due.setDate(due.getDate() + stage.dueDays)
            dueDate = format(due, 'yyyy-MM-dd')
            baseDateStr = stock.createdAt
          }
        } catch { /* keep null */ }
      } else if (stage.dueType === 'PREV_DUE_PLUS_DAYS' && prevDueDate) {
        try {
          const d = parseISO(prevDueDate)
          if (isValid(d)) {
            const due = new Date(d)
            due.setDate(due.getDate() + stage.dueDays)
            dueDate = format(due, 'yyyy-MM-dd')
          }
        } catch { /* keep null */ }
      } else if (stage.dueType === 'CUSTOM_DATE') {
        dueDate = stage.dueDate || null
      }
      // PREV_PAID_PLUS_DAYS and TBD → dueDate stays null

      const ttlDatetime = dueDate ? `${dueDate}T${stage.dueTime}:00` : null

      // ── Amount calculation ────────────────────────────────────────────
      let amount = 0
      switch (stage.calcType) {
        case 'FIXED_PER_PNR':
          amount = stage.amount
          break
        case 'PER_SEAT':
          amount = stage.amount * currentSeats
          break
        case 'FIXED_PER_SERIES':
          amount = stage.amount
          break
        case 'PERCENT_OF_BASE': {
          const yq = pnr.yq ?? 0
          const base =
            stage.calcBase === 'FARE'     ? pnr.fare :
            stage.calcBase === 'FARE_TAX' ? pnr.total :
            stage.calcBase === 'FARE_YQ'  ? (pnr.fare + yq) :
            pnr.total
          amount = Math.round(base * stage.percent / 100)
          break
        }
        case 'REMAINING_BALANCE':
          amount = Math.max(0, pnr.total - cumulative)
          break
      }

      cumulative += amount
      prevDueDate = dueDate

      const snapshot = pnr.stageSnapshots?.[stage.stageId]
      const confirmedAmount = snapshot?.confirmedAmount
      const finalAmount = confirmedAmount ?? amount

      items.push({
        pnrDisplay: pnr.pnrDisplay || pnr.pnrCode || pnr.dummyPnr,
        pnrId: pnr.pnrId,
        stageId: stage.stageId,
        stageSeq: stage.stageNo,
        stageName: stage.stageName,
        paymentType: stage.paymentType ?? '',
        amountType: stage.calcType,
        amount: finalAmount,
        baseDate: baseDateStr,
        dueDaysBefore: stage.dueDays,
        dueDate,
        ttlDatetime,
        paid: 0,
        paidForStage: 0,
        refundForStage: 0,
        remainingForStage: finalAmount,
        status: 'Pending',
        paymentStatus: 'PENDING',
        timingStatus: 'NOT_DUE',
        fullyPaidAt: null,
        lateDays: null,
        overdueDays: null,
        estimatedSeats: stage.calcType === 'PER_SEAT' ? currentSeats : undefined,
        estimatedAmount: amount,
        confirmedAmount,
        stageStatus: snapshot?.stageStatus,
        lockDate: snapshot?.lockedAt ?? null,
        lockedSeats: snapshot?.seatSnapshot,
        nonRefundable: stage.nonRefundable,
        creditTowardFare: stage.creditTowardFare,
      })
    }
  }

  return items
}

/**
 * Enriches each PaymentScheduleItem with payment data derived from actual POSTED transactions.
 *
 * Status priority: PAID → PARTIALLY_PAID → OVERDUE → PENDING
 * Only transactions whose paymentStageId matches the stageId are counted.
 * Only POSTED statuses (POSTED, COMPLETED, CONFIRMED, RECEIVED) are included.
 * VOIDED, REVERSED, DRAFT, PENDING_* transactions are excluded.
 *
 * Fallback: if a PNR has exactly 1 stage, PAYMENT transactions with paymentStageId = null
 * are attributed to that stage (migration safety for data recorded before stageId was required).
 */
export function deriveScheduleWithTransactions(
  items: PaymentScheduleItem[],
  transactions: FinancialTransaction[],
  now: Date = new Date(),
): PaymentScheduleItem[] {
  // Build per-PNR stage count for fallback attribution
  const pnrStageCounts = new Map<string, number>()
  for (const item of items) {
    pnrStageCounts.set(item.pnrId, (pnrStageCounts.get(item.pnrId) ?? 0) + 1)
  }

  return items.map(item => {
    const isSingleStage = pnrStageCounts.get(item.pnrId) === 1

    // Include transactions that explicitly target this stage OR (fallback) unlinked
    // PAYMENT transactions for a PNR with only one stage
    const stageTx = transactions.filter(t => {
      if (t.pnrId !== item.pnrId) return false
      if (t.paymentStageId === item.stageId) return true
      // Fallback: attribute null-stageId PAYMENT transactions to the sole stage
      return isSingleStage && t.paymentStageId == null && t.transactionType === 'PAYMENT'
    })

    // Sort PAYMENT transactions chronologically to find fullyPaidAt accurately
    const postedPayments = stageTx
      .filter(t => t.transactionType === 'PAYMENT' && isPostedStatus(t))
      .sort((a, b) => {
        const ta = a.paymentDateTime ?? `${a.transactionDate}T00:00:00`
        const tb = b.paymentDateTime ?? `${b.transactionDate}T00:00:00`
        return ta.localeCompare(tb)
      })

    const paidForStage = postedPayments.reduce((s, t) => s + t.amount, 0)

    const refundForStage = stageTx
      .filter(t => t.transactionType === 'REFUND' && isPostedStatus(t))
      .reduce((s, t) => s + t.amount, 0)

    const effectiveAmount = item.confirmedAmount ?? item.amount
    const remainingForStage = Math.max(0, effectiveAmount - paidForStage + refundForStage)

    // Find the transaction that completed payment (cumulative first reached effectiveAmount)
    let fullyPaidAt: string | null = null
    if (effectiveAmount > 0 && paidForStage >= effectiveAmount) {
      let cum = 0
      for (const tx of postedPayments) {
        cum += tx.amount
        if (cum >= effectiveAmount) {
          fullyPaidAt = tx.paymentDateTime ?? `${tx.transactionDate}T00:00:00`
          break
        }
      }
    }

    const dueDatetime = item.ttlDatetime ? new Date(item.ttlDatetime) : null
    const MS_PER_DAY = 1000 * 60 * 60 * 24

    let paymentStatus: PaymentScheduleItem['paymentStatus']
    let timingStatus: PaymentScheduleItem['timingStatus']
    let lateDays: number | null = null
    let overdueDays: number | null = null

    if (effectiveAmount > 0 && remainingForStage <= 0) {
      // Fully paid
      paymentStatus = 'PAID'
      if (fullyPaidAt && dueDatetime) {
        const diffMs = new Date(fullyPaidAt).getTime() - dueDatetime.getTime()
        if (diffMs > 0) {
          timingStatus = 'PAID_LATE'
          lateDays = Math.ceil(diffMs / MS_PER_DAY)
        } else {
          timingStatus = 'PAID_ON_TIME'
        }
      } else {
        timingStatus = 'PAID_ON_TIME'
      }
    } else if (paidForStage > 0) {
      // Partially paid
      paymentStatus = 'PARTIALLY_PAID'
      if (dueDatetime && now > dueDatetime) {
        timingStatus = 'OVERDUE'
        overdueDays = Math.ceil((now.getTime() - dueDatetime.getTime()) / MS_PER_DAY)
      } else {
        timingStatus = 'PENDING_MORE'
      }
    } else {
      // Not paid
      if (dueDatetime && now > dueDatetime) {
        paymentStatus = 'UNPAID'
        timingStatus = 'OVERDUE'
        overdueDays = Math.ceil((now.getTime() - dueDatetime.getTime()) / MS_PER_DAY)
      } else {
        paymentStatus = 'PENDING'
        timingStatus = 'NOT_DUE'
      }
    }

    // Backward-compat status field
    let status: PaymentScheduleItem['status']
    if (paymentStatus === 'PAID') status = 'Paid'
    else if (paymentStatus === 'PARTIALLY_PAID') status = 'Partially_Paid'
    else if (timingStatus === 'OVERDUE') status = 'Overdue'
    else status = 'Pending'

    // For per-seat stages: also update stageStatus to reflect payment reality
    let stageStatus = item.stageStatus
    if (item.amountMode && stageStatus && ['LOCKED', 'REQUESTED', 'PARTIALLY_PAID', 'PAID', 'ADJUSTED'].includes(stageStatus)) {
      if (paymentStatus === 'PAID') stageStatus = 'PAID'
      else if (paymentStatus === 'PARTIALLY_PAID') stageStatus = 'PARTIALLY_PAID'
    }

    return {
      ...item,
      paidForStage,
      refundForStage,
      remainingForStage,
      status,
      paymentStatus,
      timingStatus,
      fullyPaidAt,
      lateDays,
      overdueDays,
      stageStatus,
      paid: paidForStage,
    }
  })
}

// ============================================================
// System-wide PNR Duplicate Check  (checks real + dummy codes)
// ============================================================

export interface PNRConflictDetail {
  pnrCode: string
  rowIndices: number[]
  conflictType: 'in_list' | 'in_system'
  conflictingStock?: {
    stockId: string
    stockCode: string
    groupName: string
    ticketType: string
    status: string
  }
}

export interface PNRSystemCheckResult {
  hasConflicts: boolean
  conflicts: PNRConflictDetail[]
  duplicateIndices: Set<number>
}

/**
 * Check a list of PNRs (real and/or dummy codes) for duplicates both within the list
 * and against every stock stored in localStorage.
 *
 * @param pnrs  - Array with optional pnr_code and dummy_pnr fields.
 * @param excludeStockId - When editing a stock, pass its stockId to exclude it from the
 *   system lookup so its own codes are not flagged as duplicates.
 */
export function checkPNRDuplicatesInSystem(
  pnrs: { pnr_code?: string | null; dummy_pnr?: string | null }[],
  excludeStockId?: string,
): PNRSystemCheckResult {
  const allStocks = getDemoStocks().filter(s => !excludeStockId || s.stockId !== excludeStockId)

  // Build system lookup: UPPER(code) → stock meta
  const systemMap = new Map<string, { stockId: string; stockCode: string; groupName: string; ticketType: string; status: string }>()
  for (const s of allStocks) {
    for (const p of s.pnrs) {
      const realCode = p.pnrCode.trim().toUpperCase()
      if (realCode) systemMap.set(realCode, { stockId: s.stockId, stockCode: s.stockCode, groupName: s.groupName, ticketType: s.ticketType, status: s.status })
      const dummyCode = (p.dummyPnr || '').trim().toUpperCase()
      if (dummyCode) systemMap.set(dummyCode, { stockId: s.stockId, stockCode: s.stockCode, groupName: s.groupName, ticketType: s.ticketType, status: s.status })
    }
  }

  // Build within-list map: each PNR is represented by its real code, else its dummy code
  const listMap = new Map<string, number[]>()
  pnrs.forEach((p, i) => {
    const code = ((p.pnr_code || '').trim() || (p.dummy_pnr || '').trim()).toUpperCase()
    if (!code) return
    if (!listMap.has(code)) listMap.set(code, [])
    listMap.get(code)!.push(i)
  })

  const conflicts: PNRConflictDetail[] = []
  const duplicateIndices = new Set<number>()

  for (const [code, indices] of listMap.entries()) {
    const isDupInList = indices.length > 1
    const systemMatch = systemMap.get(code)
    if (!isDupInList && !systemMatch) continue

    indices.forEach(i => duplicateIndices.add(i))
    conflicts.push({
      pnrCode: code,
      rowIndices: indices,
      conflictType: systemMatch ? 'in_system' : 'in_list',
      conflictingStock: systemMatch,
    })
  }

  return { hasConflicts: conflicts.length > 0, conflicts, duplicateIndices }
}

/**
 * Format conflict details into a human-readable Thai message.
 * Single conflict → one descriptive sentence.
 * Multiple conflicts → bulleted list.
 */
export function formatPNRConflictMessage(conflicts: PNRConflictDetail[]): string {
  if (!conflicts.length) return ''
  if (conflicts.length === 1) {
    const c = conflicts[0]
    if (c.conflictType === 'in_list') {
      return `PNR ${c.pnrCode} ซ้ำในรายการ (แถว ${c.rowIndices.map(i => i + 1).join(', ')})`
    }
    const s = c.conflictingStock!
    return `PNR ${c.pnrCode} มีอยู่แล้วใน Stock ${s.stockCode} — ${s.groupName} (${s.status} · ${s.ticketType}) — ไม่สามารถบันทึกซ้ำได้`
  }
  const lines = conflicts.map(c => {
    if (c.conflictType === 'in_list') return `• ${c.pnrCode}: ซ้ำในรายการ`
    const s = c.conflictingStock!
    return `• ${c.pnrCode}: ซ้ำกับ ${s.stockCode} — ${s.groupName} (${s.status})`
  })
  return `พบ PNR ซ้ำ ${conflicts.length} รายการ:\n${lines.join('\n')}`
}

// ============================================================
// DemoStock → FlightSeries (for TicketTable)
// ============================================================

export function demoStockToFlightSeries(d: DemoStock): FlightSeries {
  return {
    id: d.stockId,
    stock_code: d.stockCode,
    ticket_type: d.ticketType,
    trip_type: d.tripType,
    group_name: d.groupName,
    country_id: d.countryId || null,
    destination: d.destination || null,
    airline_code: d.airlineCode,
    route_text: d.routeText || null,
    period_start: d.summary.periodStart,
    period_end: d.summary.periodEnd,
    currency: d.currency,
    status: d.status,
    remark: d.remark || null,
    created_by: null,
    created_at: d.createdAt,
    updated_by: null,
    updated_at: d.updatedAt,
    pnr_count: d.summary.pnrCount,
    seat_total: d.summary.seatTotal,
    seat_used: d.summary.seatUsed,
    seat_balance: d.summary.seatBalance,
    nearest_ttl: getNextTTL(d.pnrs),  // always recompute from PNRs — never read stale summary value
  }
}

// ============================================================
// Financial Summary Calculator
// ============================================================

export function calcPNRFinancialSummary(
  pnrId: string,
  transactions: FinancialTransaction[],
  legacyRequiredAmount: number,
  scheduleItems?: PaymentScheduleItem[],
  pendingRequestCount?: number,
): PNRFinancialSummary {
  const pnrTx = transactions.filter(t => t.pnrId === pnrId)

  // ── Payments ──────────────────────────────────────────────────────────────
  const paidTx = pnrTx.filter(t => t.transactionType === 'PAYMENT' && isPostedStatus(t))
  const paidAmount = paidTx.reduce((s, t) => s + t.amount, 0)

  // ── Refunds ───────────────────────────────────────────────────────────────
  const refundAmount = pnrTx
    .filter(t => t.transactionType === 'REFUND' && isPostedStatus(t))
    .reduce((s, t) => s + t.amount, 0)

  // ── Forfeitures ───────────────────────────────────────────────────────────
  const forfeitedAmount = pnrTx
    .filter(t => t.transactionType === 'FORFEITURE' && isPostedStatus(t))
    .reduce((s, t) => s + t.amount, 0)

  // ── Adjustments (net — positive credit, negative debit) ───────────────────
  const adjustedAmount = pnrTx
    .filter(t => t.transactionType === 'ADJUSTMENT' && isPostedStatus(t))
    .reduce((s, t) => s + t.amount, 0)

  // ── Payment method breakdown ──────────────────────────────────────────────
  const methodBreakdown: Partial<Record<PaymentMethod, number>> = {}
  for (const tx of paidTx) {
    if (tx.paymentMethod) {
      methodBreakdown[tx.paymentMethod] = (methodBreakdown[tx.paymentMethod] ?? 0) + tx.amount
    }
  }

  // ── Stage-based required amounts ──────────────────────────────────────────
  // Per req 15: confirmed = locked stages only; estimated = not-yet-locked stages
  const LOCKED_STATUSES: StageStatus[] = ['LOCKED', 'REQUESTED', 'PARTIALLY_PAID', 'PAID', 'ADJUSTED']
  let confirmedRequiredAmount = legacyRequiredAmount
  let estimatedAmount = 0

  if (scheduleItems) {
    const pnrSchedule = scheduleItems.filter(i => i.pnrId === pnrId)
    // Only recalculate if there are per-seat stages in the schedule
    const hasPerSeatStages = pnrSchedule.some(i => i.amountMode)
    if (hasPerSeatStages) {
      confirmedRequiredAmount = 0
      for (const item of pnrSchedule) {
        if (item.stageStatus && LOCKED_STATUSES.includes(item.stageStatus)) {
          confirmedRequiredAmount += item.confirmedAmount ?? item.amount
        } else {
          estimatedAmount += item.estimatedAmount ?? item.amount
        }
      }
    }
  }

  return {
    requiredAmount: confirmedRequiredAmount,
    confirmedRequiredAmount,
    estimatedAmount,
    paidAmount,
    refundAmount,
    forfeitedAmount,
    supplierHeldAmount: forfeitedAmount,
    outstandingAmount: Math.max(0, confirmedRequiredAmount - paidAmount),
    netCashPaid: Math.max(0, paidAmount - refundAmount),
    methodBreakdown,
    adjustedAmount,
    pendingRequestCount: pendingRequestCount ?? 0,
  }
}

// ============================================================
// Stage Lock / Unlock
// ============================================================

export function lockPaymentStage(
  stock: DemoStock,
  pnrId: string,
  stageId: string,
  seatCount: number,
  ratePerSeat: number,
  lockedBy: string,
  manualSeatReason?: string,
): DemoStock {
  const now = new Date().toISOString()
  const confirmedAmount = seatCount * ratePerSeat

  const snapshot: PNRStageSnapshot = {
    stageId,
    seatSnapshot: seatCount,
    rateSnapshot: ratePerSeat,
    confirmedAmount,
    lockedAt: now,
    lockedBy,
    stageStatus: 'LOCKED',
    ...(manualSeatReason ? { manualSeatReason } : {}),
  }

  const stage = stock.conditions.flatMap(c => c.condition.stages).find(s => s.stageId === stageId)
  const pnr = stock.pnrs.find(p => p.pnrId === pnrId)

  return {
    ...stock,
    updatedAt: now,
    pnrs: stock.pnrs.map(p =>
      p.pnrId !== pnrId ? p : {
        ...p,
        stageSnapshots: { ...(p.stageSnapshots ?? {}), [stageId]: snapshot },
      }
    ),
    logs: [...stock.logs, {
      logId: `LOG-${Date.now()}`,
      action: 'STAGE_LOCKED',
      message: `ล็อกยอดรอบ "${stage?.stageName ?? stageId}" สำหรับ PNR ${pnr?.pnrDisplay ?? pnrId}: ${seatCount} ที่นั่ง × ${ratePerSeat.toLocaleString()} = ${confirmedAmount.toLocaleString()} ${stock.currency}${manualSeatReason ? ` เหตุผล: ${manualSeatReason}` : ''}`,
      createdAt: now,
      createdBy: lockedBy,
    }],
  }
}

// ─── Supplier Master ──────────────────────────────────────────────────────────

export interface DemoSupplier {
  supplierId: string
  supplierCode: string
  supplierName: string
  supplierType: 'BSP' | 'GDS' | 'AGENT' | 'BANK' | 'OTHER'
  taxId: string | null
  bankAccount: string | null
  status: 'Active' | 'Inactive'
  remark: string
}

// ─── Airline Payment Methods ──────────────────────────────────────────────────

export type PaymentRoute = 'direct' | 'intermediary'

export type PaymentChannel =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CHEQUE'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'AUTO_DEBIT'
  | 'ONLINE_PAYMENT'
  | 'TOP_UP'
  | 'CREDIT_TERM'
  | 'OTHER'

export interface PaymentBankAccount {
  accountId: string
  accountLabel: string    // e.g. "บัญชีหลัก", "บัญชี USD"
  accountName: string     // required
  bankName: string        // required
  accountNo: string       // text (not number)
  branch: string
  accountType: string     // ออมทรัพย์ | กระแสรายวัน | ฝากประจำ | อื่นๆ
  currency: string        // e.g. THB, USD
  swiftCode: string
  transferNote: string
  isPrimary: boolean      // 1 primary per currency
  status: 'Active' | 'Inactive'
}

export interface PaymentChequeDetail {
  payeeName: string   // required
  bankName: string    // required
  branch: string
  note: string
}

export interface PaymentCashDetail {
  recipientName: string
  organization: string
  note: string
}

export interface PaymentTopUpDetail {
  systemName: string
  walletAccountId: string
  accountName: string
  note: string
}

export interface PaymentOtherChannelDetail {
  channelName: string   // required
  description: string
}

export interface DemoAirlinePaymentMethod {
  paymentMethodId: string
  airlineCode: string
  paymentMethodName: string
  paymentRoute: PaymentRoute
  payeeSupplierId: string | null
  payeeDisplayName: string              // editable "ชำระให้" display name
  supportedPaymentTypes: string[]
  // ── Payment channels ─────────────────────────────────────────────────────
  allowedPaymentChannels: string[]
  defaultPaymentChannel: string
  customPaymentChannelName: string | null  // = otherChannelDetail.channelName (legacy compat)
  // ── Channel-specific details ──────────────────────────────────────────────
  bankAccounts: PaymentBankAccount[]
  chequeDetail: PaymentChequeDetail | null
  cashDetail: PaymentCashDetail | null
  topUpDetail: PaymentTopUpDetail | null
  otherChannelDetail: PaymentOtherChannelDetail | null
  isDefault: boolean
  status: 'Active' | 'Inactive'
  remark: string
}

const SUPPLIER_KEY = 'ticket_suppliers_demo'
const AIRLINE_PM_KEY = 'ticket_airline_payment_methods_demo'

let _pmSeq = 0
function _genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${(++_pmSeq).toString().padStart(3, '0')}`
}

function _getDefaultSuppliers(): DemoSupplier[] {
  return [
    { supplierId: 'SUP-001', supplierCode: 'BSP', supplierName: 'BSP Thailand', supplierType: 'BSP', taxId: null, bankAccount: null, status: 'Active', remark: '' },
    { supplierId: 'SUP-002', supplierCode: 'AMADEUS', supplierName: 'Amadeus IT Group', supplierType: 'GDS', taxId: null, bankAccount: null, status: 'Active', remark: '' },
    { supplierId: 'SUP-003', supplierCode: 'SABRE', supplierName: 'Sabre Corporation', supplierType: 'GDS', taxId: null, bankAccount: null, status: 'Active', remark: '' },
    { supplierId: 'SUP-004', supplierCode: 'AGENT-01', supplierName: 'ตัวแทนออกตั๋ว 01', supplierType: 'AGENT', taxId: null, bankAccount: null, status: 'Active', remark: '' },
  ]
}

export function getDemoSuppliers(): DemoSupplier[] {
  if (typeof window === 'undefined') return _getDefaultSuppliers()
  try {
    const raw = localStorage.getItem(SUPPLIER_KEY)
    if (!raw) { const d = _getDefaultSuppliers(); localStorage.setItem(SUPPLIER_KEY, JSON.stringify(d)); return d }
    return JSON.parse(raw)
  } catch { return _getDefaultSuppliers() }
}

export function saveDemoSupplier(s: DemoSupplier): void {
  const list = getDemoSuppliers()
  const idx = list.findIndex(x => x.supplierId === s.supplierId)
  if (idx >= 0) list[idx] = s; else list.push(s)
  localStorage.setItem(SUPPLIER_KEY, JSON.stringify(list))
}

export function deleteDemoSupplier(supplierId: string): void {
  const list = getDemoSuppliers().filter(x => x.supplierId !== supplierId)
  localStorage.setItem(SUPPLIER_KEY, JSON.stringify(list))
}

export function generateSupplierId(): string { return _genId('SUP') }

export function getAirlinePaymentMethods(airlineCode?: string): DemoAirlinePaymentMethod[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(AIRLINE_PM_KEY)
    const all: DemoAirlinePaymentMethod[] = raw ? JSON.parse(raw) : []
    return airlineCode ? all.filter(m => m.airlineCode === airlineCode) : all
  } catch { return [] }
}

export function saveAirlinePaymentMethod(m: DemoAirlinePaymentMethod): void {
  const all = getAirlinePaymentMethods()
  const idx = all.findIndex(x => x.paymentMethodId === m.paymentMethodId)
  if (idx >= 0) all[idx] = m; else all.push(m)
  localStorage.setItem(AIRLINE_PM_KEY, JSON.stringify(all))
}

export function deleteAirlinePaymentMethod(paymentMethodId: string): void {
  const list = getAirlinePaymentMethods().filter(x => x.paymentMethodId !== paymentMethodId)
  localStorage.setItem(AIRLINE_PM_KEY, JSON.stringify(list))
}

export function generatePaymentMethodId(): string { return _genId('PM') }
