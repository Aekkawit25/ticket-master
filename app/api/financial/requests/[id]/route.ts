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

// ── GET /api/financial/requests/[id] ─────────────────────────────────────────
// Get single request details. Any role with VIEW_TRANSACTIONS permission.
// Roles that have VIEW_TRANSACTIONS: all four roles.

export async function GET(request: Request) {
  const role = getRoleFromHeader(request)
  if (!role) return FORBIDDEN

  // Demo: data lives in client-side localStorage; server cannot retrieve it.
  return NextResponse.json({
    ok: true,
    message: 'Client-side storage in use',
    data: null,
  })
}

// ── PATCH /api/financial/requests/[id] ───────────────────────────────────────
// Review or approve a request.
//
//   ACCOUNTING_STAFF  → can approve PAYMENT requests  (action: 'APPROVE')
//   ACCOUNTING_MANAGER → can approve REFUND / FORFEITURE / ADJUSTMENT requests
//   Both roles can REJECT any pending request.
//
// Body:
//   action:          'APPROVE' | 'REJECT'
//   requestType:     RequestType  (client passes this so we can gate by type)
//   rejectedReason?: string
//   voucherNo?:      string
//   postingDate?:    string

type ReviewAction = 'APPROVE' | 'REJECT'
type RequestType = 'PAYMENT' | 'REFUND' | 'FORFEITURE' | 'ADJUSTMENT'

export async function PATCH(request: Request) {
  const role = getRoleFromHeader(request)
  if (!role) return FORBIDDEN

  // Only accounting roles may review/approve requests
  if (role !== 'ACCOUNTING_STAFF' && role !== 'ACCOUNTING_MANAGER') return FORBIDDEN

  let body: {
    action?: ReviewAction
    requestType?: RequestType
    rejectedReason?: string
    voucherNo?: string
    postingDate?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, { status: 400 })
  }

  const { action, requestType } = body

  if (!action || !['APPROVE', 'REJECT'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be APPROVE or REJECT', code: 'BAD_REQUEST' },
      { status: 400 },
    )
  }

  // Permission gate for APPROVE:
  //   ACCOUNTING_STAFF  → only PAYMENT
  //   ACCOUNTING_MANAGER → REFUND, FORFEITURE, ADJUSTMENT (and PAYMENT too)
  if (action === 'APPROVE' && requestType) {
    const managerOnlyTypes: RequestType[] = ['REFUND', 'FORFEITURE', 'ADJUSTMENT']
    if (managerOnlyTypes.includes(requestType) && role !== 'ACCOUNTING_MANAGER') {
      return NextResponse.json(
        {
          error: 'การอนุมัติประเภทนี้ต้องใช้สิทธิ์ผู้จัดการฝ่ายบัญชี',
          code: 'FORBIDDEN',
        },
        { status: 403 },
      )
    }
  }

  // Demo: actual state update happens client-side.
  return NextResponse.json({ ok: true })
}
