// ─── PNR Display Helpers ──────────────────────────────────────────────────────
// Shared, pure (no JSX) view-model builders and presentation helpers for PNR data.
// Used by both the List PNR page (app/pnr/page.tsx) and the PNR Detail page
// (app/tickets/[id]/pnr/[pnrId]/page.tsx) so the two stay consistent and don't
// duplicate the same "real field → display" derivations.
//
// Everything here computes from real fields already on DemoStock/DemoPNR
// (seatBalance, ttlDateTime, conditionCode, status, financial-request state).
// No new Business Logic or DB fields are introduced.

import { differenceInCalendarDays, format, isValid } from 'date-fns'
import { parseDateSafe } from '@/lib/utils'
import type { DemoStock, DemoPNR, DemoLog, PaymentScheduleItem } from '@/lib/demo-storage'
import type { TicketType } from '@/types'

// ─── Row view-model ────────────────────────────────────────────────────────

export type MappingStatus = 'Not Mapped' | 'Partially Mapped' | 'Mapped'

export interface PnrListRow {
  stockId: string
  stockCode: string   // "Series Code"
  groupName: string   // "Series Name"
  ticketType: TicketType
  groupType?: string
  airlineCode: string
  countryId: string
  routeText: string
  currency: string
  pnrId: string
  pnrCode: string
  dummyPnr: string
  pnrType: 'real' | 'dummy'
  pnrDisplay: string
  travelStart: string
  travelEnd: string
  seatTotal: number
  seatUsed: number
  seatBalance: number
  fare: number
  tax: number
  total: number
  conditionCode: string
  ttlDateTime: string | null
  status: string
  remark: string
  available: number
  programCount: number
  mappingStatus: MappingStatus
}

/**
 * Builds a display row for a single PNR within its parent stock.
 *
 * Known limitation (pre-existing, not introduced here): there is no real
 * "linked to external system" field anywhere in the data model, so
 * `mappingStatus` is always 'Not Mapped' and `programCount` is always 0 —
 * same as the original `buildRows()` this was extracted from.
 */
export function buildPnrRow(stock: DemoStock, pnr: DemoPNR): PnrListRow {
  return {
    stockId: stock.stockId,
    stockCode: stock.stockCode,
    groupName: stock.groupName,
    ticketType: stock.ticketType,
    groupType: stock.groupType,
    airlineCode: stock.airlineCode,
    countryId: stock.countryId,
    routeText: stock.routeText,
    currency: stock.currency,
    pnrId: pnr.pnrId,
    pnrCode: pnr.pnrCode,
    dummyPnr: pnr.dummyPnr,
    pnrType: pnr.pnrType,
    pnrDisplay: pnr.pnrDisplay,
    travelStart: pnr.travelStart,
    travelEnd: pnr.travelEnd,
    seatTotal: pnr.seatTotal,
    seatUsed: pnr.seatUsed,
    seatBalance: pnr.seatBalance,
    fare: pnr.fare,
    tax: pnr.tax ?? 0,
    total: pnr.total,
    conditionCode: pnr.conditionCode,
    ttlDateTime: pnr.ttlDateTime,
    status: pnr.status,
    remark: pnr.remark,
    available: pnr.seatBalance,
    programCount: 0,
    mappingStatus: 'Not Mapped',
  }
}

export function buildPnrListRows(stocks: DemoStock[]): PnrListRow[] {
  const rows: PnrListRow[] = []
  for (const s of stocks) {
    for (const p of s.pnrs) rows.push(buildPnrRow(s, p))
  }
  return rows
}

export function mappingVariant(s: MappingStatus): 'green' | 'yellow' | 'gray' {
  if (s === 'Mapped') return 'green'
  if (s === 'Partially Mapped') return 'yellow'
  return 'gray'
}

// ─── Date formatting (dd/mm/yy) ───────────────────────────────────────────
// Scoped to the redesigned PNR pages per their Design Reference — the rest
// of the app still uses lib/utils.ts's formatDate/formatDateTime ("dd MMM yy").

export function formatDateDMY(date: string | null | undefined): string {
  if (!date) return '—'
  try {
    const d = parseDateSafe(date)
    if (!isValid(d)) return '—'
    return format(d, 'dd/MM/yy')
  } catch {
    return '—'
  }
}

export function formatDateTimeDMY(date: string | null | undefined): string {
  if (!date) return '—'
  try {
    const d = parseDateSafe(date)
    if (!isValid(d)) return '—'
    return format(d, 'dd/MM/yy HH:mm')
  } catch {
    return '—'
  }
}

// ─── NAME DL (deadline) derivation ────────────────────────────────────────

/** เกณฑ์ "ใกล้ NAME DL" — ใช้ค่าเดียวกับ KPI "ใกล้ TTL" ของหน้า Dashboard (app/api/dashboard/route.ts) */
export const NEAR_NAME_DL_DAYS = 7

export interface DeadlineInfo {
  dateLabel: string
  relLabel: string
  tone: 'green' | 'orange' | 'red'
}

/** สรุปสถานะ NAME DL จาก ttlDateTime จริงของ PNR — ไม่มีการสร้างวันที่ใหม่ */
export function getDeadlineInfo(ttlDateTime: string | null): DeadlineInfo | null {
  if (!ttlDateTime) return null
  const target = parseDateSafe(ttlDateTime)
  if (!isValid(target)) return null
  const diffDays = differenceInCalendarDays(target, new Date())
  const dateLabel = formatDateDMY(ttlDateTime)
  if (diffDays < 0) return { dateLabel, relLabel: `เลยกำหนด ${Math.abs(diffDays)} วัน`, tone: 'red' }
  if (diffDays === 0) return { dateLabel, relLabel: 'ครบกำหนดวันนี้', tone: 'orange' }
  if (diffDays <= NEAR_NAME_DL_DAYS) return { dateLabel, relLabel: `ในอีก ${diffDays} วัน`, tone: 'orange' }
  return { dateLabel, relLabel: `ในอีก ${diffDays} วัน`, tone: 'green' }
}

export type ConditionTagInfo = { label: string; tone: 'green' | 'orange' | 'red' | 'gray' }

/**
 * แปลง conditionCode/seatBalance/ttlDateTime จริง ให้เป็น Tag ที่อ่านง่าย
 * ปกติ / ใกล้ NAME DL / ยอดผิดปกติ (seatBalance ติดลบ) / ยังไม่มี Condition
 */
export function getConditionTag(row: Pick<PnrListRow, 'conditionCode' | 'available' | 'ttlDateTime'>): ConditionTagInfo {
  if (!row.conditionCode) return { label: 'ยังไม่มี Condition', tone: 'gray' }
  if (row.available < 0) return { label: 'ยอดผิดปกติ', tone: 'red' }
  const dl = getDeadlineInfo(row.ttlDateTime)
  if (dl && dl.tone !== 'green') return { label: 'ใกล้ NAME DL', tone: 'orange' }
  return { label: 'ปกติ', tone: 'green' }
}

export type RowStatusInfo = { label: string; tone: 'green' | 'orange' | 'amber' | 'red' }

/**
 * สังเคราะห์ "สถานะ" 4 ระดับจากฟิลด์จริงที่มีอยู่แล้ว (ไม่ใช่ field ใหม่):
 * seatBalance ติดลบ → ผิดปกติ, มีคำขอการเงินรอตรวจสอบจริง (getPendingRequests) → รอตรวจสอบ,
 * ยังไม่ Confirmed (status จริงของ PNR) → รอยืนยัน, นอกนั้น → ครบ
 */
export function getRowStatusTag(row: Pick<PnrListRow, 'available' | 'status'>, hasPendingReview: boolean): RowStatusInfo {
  if (row.available < 0) return { label: 'ผิดปกติ', tone: 'red' }
  if (hasPendingReview) return { label: 'รอตรวจสอบ', tone: 'orange' }
  if (row.status !== 'Confirmed') return { label: 'รอยืนยัน', tone: 'amber' }
  return { label: 'ครบ', tone: 'green' }
}

// ─── Payment schedule helpers (pure) ──────────────────────────────────────

export function computePaymentStatus(ttlDatetime: string | null): 'Pending' | 'Overdue' {
  if (!ttlDatetime) return 'Pending'
  return new Date(ttlDatetime) < new Date() ? 'Overdue' : 'Pending'
}

/** รอบชำระที่ครบกำหนดเร็วที่สุด (ttlDatetime ใกล้สุด) จาก schedule จริงของ PNR */
export function getNextPaymentItem(items: PaymentScheduleItem[]): PaymentScheduleItem | null {
  if (items.length === 0) return null
  return [...items].sort((a, b) => {
    const at = a.ttlDatetime ? new Date(a.ttlDatetime).getTime() : Infinity
    const bt = b.ttlDatetime ? new Date(b.ttlDatetime).getTime() : Infinity
    return at - bt
  })[0]
}

// ─── Last-update attribution ──────────────────────────────────────────────

/**
 * หา log ล่าสุดที่เกี่ยวข้องกับ PNR นี้จริง (ผูกกับ pnrDisplay ถ้า log ระบุไว้)
 * ถ้าไม่มี log ที่ระบุ pnrDisplay ตรงกัน ให้ fallback เป็น log ล่าสุดของทั้ง Series,
 * และถ้าไม่มี log เลยให้ fallback เป็น stock.updatedAt (ไม่ทราบผู้แก้ไข)
 */
export function getPnrLastUpdate(stock: DemoStock, pnrDisplay: string): { at: string; by: string } | null {
  const pnrLogs = stock.logs.filter(l => l.pnrDisplay === pnrDisplay)
  const pool: DemoLog[] = pnrLogs.length > 0 ? pnrLogs : stock.logs
  if (pool.length > 0) {
    const latest = pool.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b))
    return { at: latest.createdAt, by: latest.createdBy }
  }
  return stock.updatedAt ? { at: stock.updatedAt, by: '—' } : null
}
