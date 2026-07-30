/**
 * Single source of truth for PNR row validation.
 *
 * Used by every surface that creates/edits PNR rows (Add Stock wizard Step 3
 * "PNR & Seats", the PNRSeatsTable grid, Single PNR modal, Bulk PNR builder,
 * and Review & Save) so a row that passes on one screen can never be
 * silently rejected by another.
 *
 * Required fields, by design:
 *  - travelStart, seatTotal — always required.
 *  - Price fields — required ONLY for the fields relevant to `priceFormat`:
 *      FARE     → fare > 0 (Tax/YQ optional, default 0)
 *      FARE_YQ  → fare > 0 AND yq specified
 *      ALL_IN   → allInAmount > 0 (fare/tax/yq not applicable, never checked)
 *  - NAME DL (ttl*) — required only when a ttlType is actually selected.
 *  - pnrCode, condition, remark — never required; blank PNR Code is expected
 *    to become a Dummy PNR (see lib/pnr-shared-utils.ts generateDummyPnrCode).
 */

export type PnrFieldKey =
  | 'pnrCode' | 'travelStart' | 'seatTotal' | 'fare' | 'allInAmount' | 'yq' | 'tax'
  | 'ttlDaysBefore' | 'ttlDate'

export type PnrIssueSeverity = 'error' | 'warning' | 'info'

export interface PnrFieldIssue {
  field: PnrFieldKey
  severity: PnrIssueSeverity
  message: string
}

export interface NormalizedPnrRow {
  pnrCode: string
  travelStart: string
  seatTotal: number | null
  priceFormat: 'FARE' | 'FARE_YQ' | 'ALL_IN'
  fare: number | null
  yq: number | null
  allInAmount: number | null
  ttlType?: 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE' | null
  ttlDaysBefore?: number | string | null
  ttlDate?: string | null
}

/** Per-row field checks — no cross-row context (duplicate PNR code) needed. */
export function validatePnrRowFields(row: NormalizedPnrRow): PnrFieldIssue[] {
  const issues: PnrFieldIssue[] = []

  if (!row.travelStart) {
    issues.push({ field: 'travelStart', severity: 'error', message: 'ยังไม่ได้ระบุวันเดินทาง' })
  }
  if (!row.seatTotal || row.seatTotal <= 0) {
    issues.push({ field: 'seatTotal', severity: 'error', message: 'ยังไม่ได้ระบุ Seat หรือต้องมากกว่า 0' })
  }

  const fmt = row.priceFormat || 'FARE'
  if (fmt === 'ALL_IN') {
    if (!row.allInAmount || row.allInAmount <= 0) {
      issues.push({ field: 'allInAmount', severity: 'error', message: 'ราคา All In ต้องมากกว่า 0' })
    }
  } else if (fmt === 'FARE_YQ') {
    if (!row.fare || row.fare <= 0) {
      issues.push({ field: 'fare', severity: 'error', message: 'Fare ต้องมากกว่า 0' })
    }
    if (row.yq == null) {
      issues.push({ field: 'yq', severity: 'error', message: 'ยังไม่ได้ระบุ YQ' })
    }
  } else {
    // FARE — Tax/YQ are optional additional charges, never blocking
    if (!row.fare || row.fare <= 0) {
      issues.push({ field: 'fare', severity: 'error', message: 'Fare ต้องมากกว่า 0' })
    }
  }

  if (row.ttlType === 'DAYS_BEFORE') {
    const d = typeof row.ttlDaysBefore === 'string' ? parseInt(row.ttlDaysBefore, 10) : row.ttlDaysBefore
    if (row.ttlDaysBefore === '' || row.ttlDaysBefore == null || d == null || isNaN(d) || d < 0) {
      issues.push({ field: 'ttlDaysBefore', severity: 'error', message: 'กรุณากรอกจำนวนวันก่อนเดินทาง NAME DL (≥ 0)' })
    }
  } else if (row.ttlType === 'FIXED_DATE' && !row.ttlDate) {
    issues.push({ field: 'ttlDate', severity: 'error', message: 'กรุณากรอกวันที่ NAME DL' })
  }

  return issues
}

/** Cross-row + cross-stock PNR code duplicate detection (blank codes never conflict — they become Dummy PNRs). */
export function findDuplicatePnrRowIndices(
  rows: { pnrCode: string }[],
  existingCodes?: Set<string>,
): Map<number, string> {
  const map = new Map<number, string>()
  const seenAt = new Map<string, number>()
  rows.forEach((r, i) => {
    const code = r.pnrCode.trim()
    if (!code) return
    if (existingCodes?.has(code)) {
      map.set(i, `PNR "${code}" มีอยู่แล้วในระบบ`)
      return
    }
    if (seenAt.has(code)) {
      map.set(i, `PNR "${code}" ซ้ำกับแถว ${seenAt.get(code)! + 1}`)
    } else {
      seenAt.set(code, i)
    }
  })
  return map
}

export interface PnrRowValidation {
  rowIndex: number
  issues: PnrFieldIssue[]
  hasError: boolean
  hasWarning: boolean
}

export function validatePnrRows(rows: NormalizedPnrRow[], existingPnrCodes?: Set<string>): PnrRowValidation[] {
  const dupMap = findDuplicatePnrRowIndices(rows, existingPnrCodes)
  return rows.map((row, rowIndex) => {
    const issues = validatePnrRowFields(row)
    const dupMsg = dupMap.get(rowIndex)
    if (dupMsg) issues.unshift({ field: 'pnrCode', severity: 'error', message: dupMsg })
    return {
      rowIndex,
      issues,
      hasError: issues.some(i => i.severity === 'error'),
      hasWarning: issues.some(i => i.severity === 'warning'),
    }
  })
}

export function hasAnyPnrError(rowValidations: PnrRowValidation[]): boolean {
  return rowValidations.some(rv => rv.hasError)
}

export interface PnrValidationSummaryItem {
  rowIndex: number
  field: PnrFieldKey
  severity: PnrIssueSeverity
  message: string
  /** Ready-to-render, clickable summary line, e.g. "แถว 2: ยังไม่ได้ระบุ Seat". */
  label: string
}

/** Flattens row validations into a clickable summary list — errors first, then warnings, then info. */
export function buildPnrValidationSummary(rowValidations: PnrRowValidation[]): PnrValidationSummaryItem[] {
  const items: PnrValidationSummaryItem[] = []
  rowValidations.forEach(rv => {
    rv.issues.forEach(issue => {
      items.push({
        rowIndex: rv.rowIndex,
        field: issue.field,
        severity: issue.severity,
        message: issue.message,
        label: `แถว ${rv.rowIndex + 1}: ${issue.message}`,
      })
    })
  })
  const order: Record<PnrIssueSeverity, number> = { error: 0, warning: 1, info: 2 }
  return items.sort((a, b) => order[a.severity] - order[b.severity])
}

export function pnrFieldElementId(rowIndex: number, field: PnrFieldKey): string {
  return `pnr-field-${rowIndex}-${field}`
}

/** Scrolls to and focuses the first invalid field for a row — client-only, no-op during SSR. */
export function scrollToPnrField(rowIndex: number, field: PnrFieldKey): void {
  if (typeof window === 'undefined') return
  const el = document.getElementById(pnrFieldElementId(rowIndex, field))
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    el.focus({ preventScroll: true })
  } else {
    el.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true })
  }
}

/** Convenience: scroll to the first error in a validation summary (errors already sorted first). */
export function scrollToFirstPnrError(summary: PnrValidationSummaryItem[]): void {
  const first = summary.find(s => s.severity === 'error')
  if (first) scrollToPnrField(first.rowIndex, first.field)
}
