import { NextResponse } from 'next/server'
import type { UserRole } from '@/lib/auth'

// ── Shared helpers ────────────────────────────────────────────────────────────

const ALL_USER_ROLES: UserRole[] = [
  'TICKET_STAFF',
  'TICKET_SUPERVISOR',
  'ACCOUNTING_STAFF',
  'ACCOUNTING_MANAGER',
]

function getRoleFromHeader(request: Request): UserRole | null {
  const header = request.headers.get('x-demo-role')
  if (!header) return null
  if (!ALL_USER_ROLES.includes(header as UserRole)) return null
  return header as UserRole
}

const FORBIDDEN = NextResponse.json(
  { error: 'ไม่มีสิทธิ์ดำเนินการนี้', code: 'FORBIDDEN' },
  { status: 403 },
)

// Posted statuses that can be voided or reversed
const VOIDABLE_STATUSES = ['POSTED', 'COMPLETED', 'CONFIRMED', 'RECEIVED']

// ── PATCH /api/financial/transactions/[id] ────────────────────────────────────
// Void or Reverse a POSTED transaction.
// Allowed role: ACCOUNTING_MANAGER only.
//
// Body:
//   action:        'VOID' | 'REVERSE'
//   reason:        string   (required)
//   effectiveDate: string   (required, YYYY-MM-DD)
//   currentStatus: string   (client passes so server can validate)

type VoidReverseAction = 'VOID' | 'REVERSE'

export async function PATCH(request: Request) {
  const role = getRoleFromHeader(request)
  if (!role) return FORBIDDEN

  // Only ACCOUNTING_MANAGER may void or reverse
  if (role !== 'ACCOUNTING_MANAGER') return FORBIDDEN

  let body: {
    action?: VoidReverseAction
    reason?: string
    effectiveDate?: string
    currentStatus?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, { status: 400 })
  }

  const { action, reason, effectiveDate, currentStatus } = body

  if (!action || !['VOID', 'REVERSE'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be VOID or REVERSE', code: 'BAD_REQUEST' },
      { status: 400 },
    )
  }

  if (!reason?.trim()) {
    return NextResponse.json(
      { error: 'reason is required', code: 'BAD_REQUEST' },
      { status: 400 },
    )
  }

  if (!effectiveDate?.trim()) {
    return NextResponse.json(
      { error: 'effectiveDate is required', code: 'BAD_REQUEST' },
      { status: 400 },
    )
  }

  // Validate that the transaction is in a voidable / reversible state.
  // Client passes currentStatus so the server can guard without localStorage access.
  if (currentStatus && !VOIDABLE_STATUSES.includes(currentStatus)) {
    return NextResponse.json(
      {
        error: 'รายการนี้ไม่อยู่ในสถานะที่สามารถยกเลิก/กลับรายการได้',
        code: 'INVALID_STATUS',
      },
      { status: 400 },
    )
  }

  // Demo: actual state mutation happens client-side.
  return NextResponse.json({ ok: true })
}
