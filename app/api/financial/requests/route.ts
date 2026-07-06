import { NextResponse } from 'next/server'
import type { UserRole } from '@/lib/auth'

// ── Shared helpers (inline — auth.ts uses window, so we can't import it here) ─

const ALL_USER_ROLES: UserRole[] = [
  'TICKET_STAFF',
  'TICKET_SUPERVISOR',
  'ACCOUNTING_STAFF',
  'ACCOUNTING_MANAGER',
]

const TICKET_ROLES: UserRole[] = ['TICKET_STAFF', 'TICKET_SUPERVISOR']

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

// ── POST /api/financial/requests ──────────────────────────────────────────────
// Create a new financial request.
// Allowed roles: TICKET_STAFF, TICKET_SUPERVISOR
//
// Body (JSON):
//   pnrId, stockId, stageId, requestType, amount, currencyCode,
//   transactionDate, referenceNo, reason, remark, requestedBy
//
// Returns:
//   200 { ok: true, requestId: string }
//   403 if role is missing or not a ticket role
//   409 if referenceNo already exists in a non-cancelled/rejected request
//        (client passes existingRefs: string[] in body for the demo check)

export async function POST(request: Request) {
  const role = getRoleFromHeader(request)
  if (!role || !TICKET_ROLES.includes(role)) return FORBIDDEN

  let body: {
    pnrId?: string
    stockId?: string
    stageId?: string | null
    requestType?: string
    amount?: number
    currencyCode?: string
    transactionDate?: string
    referenceNo?: string
    reason?: string
    remark?: string
    requestedBy?: string
    // Demo duplicate-check: client passes refs already in use (non-cancelled/rejected)
    existingRefs?: string[]
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, { status: 400 })
  }

  const { referenceNo, existingRefs } = body

  // Duplicate referenceNo guard (demo: client passes existing refs to server for validation)
  if (referenceNo && existingRefs?.length) {
    const normalised = referenceNo.trim().toUpperCase()
    if (existingRefs.some(r => r.trim().toUpperCase() === normalised)) {
      return NextResponse.json(
        { error: 'เลขอ้างอิงนี้มีอยู่แล้วในระบบ', code: 'DUPLICATE_REF' },
        { status: 409 },
      )
    }
  }

  // In demo mode all actual storage happens client-side (localStorage).
  // The API just gates permissions and validates the duplicate ref.
  // Generate a requestId here so the client can use it (or client can generate its own).
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  const requestId = `REQ-FIN-${rand}`

  return NextResponse.json({ ok: true, requestId })
}

// ── GET /api/financial/requests ───────────────────────────────────────────────
// List requests (any authenticated role).
// Query params: pnrId (optional)
//
// Demo: data lives in localStorage on the client. The server returns a 200
// with a message so callers know to use client-side storage instead.

export async function GET(request: Request) {
  const role = getRoleFromHeader(request)
  if (!role) return FORBIDDEN

  const { searchParams } = new URL(request.url)
  const pnrId = searchParams.get('pnrId')

  return NextResponse.json({
    ok: true,
    message: 'Client-side storage in use',
    filter: { pnrId: pnrId ?? null },
    data: [],
  })
}
