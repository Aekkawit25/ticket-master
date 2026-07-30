// ============================================================
// Financial Requests Storage (Demo — localStorage)
// ============================================================
// HMR-safe: data is cached in globalThis.__airTicketFinRequests so that
// hot-module replacement in dev does not cause data to reset between reloads.

const STORAGE_KEY = 'air_ticket_fin_requests'

declare global {
  // eslint-disable-next-line no-var
  var __airTicketFinRequests: FinancialRequest[] | undefined
}

// ── Request type enumerations ─────────────────────────────────────────────────

export type RequestType = 'PAYMENT' | 'REFUND' | 'FORFEITURE' | 'ADJUSTMENT'

export type RequestStatus =
  | 'PENDING_ACCOUNTING_REVIEW'
  | 'PENDING_MANAGER_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'

// ── Audit log entry ───────────────────────────────────────────────────────────

export interface RequestAuditLog {
  logId: string
  action: string
  actor: string
  actorRole: string
  timestamp: string
  note?: string
}

// ── Main interface ────────────────────────────────────────────────────────────

export interface FinancialRequest {
  requestId: string
  idempotencyKey: string
  stockId: string
  pnrId: string
  stageId: string | null
  requestType: RequestType
  amount: number
  currencyCode: string
  transactionDate: string
  referenceNo: string
  reason: string
  remark: string
  attachments: string[]          // simulated file names
  requestedBy: string
  requestedByRole: string
  requestedDate: string
  status: RequestStatus
  reviewedBy: string | null      // ticket supervisor review
  reviewedDate: string | null
  accountingReviewedBy: string | null
  accountingReviewedDate: string | null
  approvedBy: string | null      // accounting manager approval (for refund/forfeiture/adjustment)
  approvedDate: string | null
  rejectedBy: string | null
  rejectedDate: string | null
  rejectedReason: string | null
  linkedTransactionId: string | null  // populated after accounting posts the transaction
  logs: RequestAuditLog[]
}

// ── Label maps ────────────────────────────────────────────────────────────────

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  PAYMENT:    'แจ้งการจ่าย',
  REFUND:     'ขอ Refund',
  FORFEITURE: 'แจ้งยอดถูกยึด',
  ADJUSTMENT: 'ขอปรับปรุงยอด',
}

export const REQUEST_STATUS_INFO: Record<RequestStatus, { label: string; color: string }> = {
  PENDING_ACCOUNTING_REVIEW: { label: 'รอฝ่ายบัญชีตรวจสอบ', color: 'orange' },
  PENDING_MANAGER_APPROVAL:  { label: 'รออนุมัติ',           color: 'yellow' },
  APPROVED:                  { label: 'อนุมัติแล้ว',         color: 'green'  },
  REJECTED:                  { label: 'ปฏิเสธ',              color: 'red'    },
  CANCELLED:                 { label: 'ยกเลิก',              color: 'gray'   },
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function loadFromStorage(): FinancialRequest[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as FinancialRequest[]
  } catch {
    return []
  }
}

function persistToStorage(requests: FinancialRequest[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requests))
    globalThis.__airTicketFinRequests = requests
    window.dispatchEvent(new CustomEvent('fin_requests_updated'))
  } catch {
    // silently ignore quota errors
  }
}

// ── Public CRUD ───────────────────────────────────────────────────────────────

/**
 * Return all financial requests.
 * In the browser we cache in globalThis for HMR safety; in SSR we return [].
 */
export function getFinancialRequests(): FinancialRequest[] {
  if (typeof window === 'undefined') return []
  if (globalThis.__airTicketFinRequests !== undefined) {
    return globalThis.__airTicketFinRequests
  }
  const loaded = loadFromStorage()
  globalThis.__airTicketFinRequests = loaded
  return loaded
}

/**
 * Upsert a single request (insert or replace by requestId).
 */
export function saveFinancialRequest(req: FinancialRequest): void {
  const all = getFinancialRequests()
  const filtered = all.filter(r => r.requestId !== req.requestId)
  persistToStorage([req, ...filtered])
}

export function getFinancialRequestById(id: string): FinancialRequest | null {
  return getFinancialRequests().find(r => r.requestId === id) ?? null
}

export function getRequestsForPNR(pnrId: string): FinancialRequest[] {
  return getFinancialRequests().filter(r => r.pnrId === pnrId)
}

export function getRequestsForStage(pnrId: string, stageId: string): FinancialRequest[] {
  return getFinancialRequests().filter(r => r.pnrId === pnrId && r.stageId === stageId)
}

export function getPendingRequests(): FinancialRequest[] {
  return getFinancialRequests().filter(
    r => r.status === 'PENDING_ACCOUNTING_REVIEW' || r.status === 'PENDING_MANAGER_APPROVAL',
  )
}

// ── ID / key generators ───────────────────────────────────────────────────────

/** Generate a request ID in the format REQ-FIN-XXXXXX (6 alphanumeric chars). */
export function generateRequestId(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `REQ-FIN-${rand}`
}

/** Generate an idempotency key: ISO timestamp + random suffix. */
export function generateIdempotencyKey(): string {
  return `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 10)}`
}

// ── Duplicate reference check ─────────────────────────────────────────────────

/**
 * Check whether `referenceNo` is already used by an active (non-CANCELLED,
 * non-REJECTED) request.
 *
 * @param referenceNo - The reference number to check.
 * @param excludeId   - Optional requestId to exclude (useful when editing).
 * @returns The conflicting request, or null if no conflict.
 */
export function checkDuplicateRef(
  referenceNo: string,
  excludeId?: string,
): FinancialRequest | null {
  const normalised = referenceNo.trim().toUpperCase()
  return (
    getFinancialRequests().find(r => {
      if (excludeId && r.requestId === excludeId) return false
      if (r.status === 'CANCELLED' || r.status === 'REJECTED') return false
      return r.referenceNo.trim().toUpperCase() === normalised
    }) ?? null
  )
}
