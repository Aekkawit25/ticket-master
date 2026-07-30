import { NextResponse } from 'next/server'
import type { UserRole } from '@/lib/auth'

// ── Shared helpers ────────────────────────────────────────────────────────────

const ALL_USER_ROLES: UserRole[] = [
  'TICKET_STAFF',
  'TICKET_SUPERVISOR',
  'ACCOUNTING_STAFF',
  'ACCOUNTING_MANAGER',
]

const ACCOUNTING_ROLES: UserRole[] = ['ACCOUNTING_STAFF', 'ACCOUNTING_MANAGER']

type TransactionType = 'PAYMENT' | 'REFUND' | 'FORFEITURE' | 'ADJUSTMENT' | 'REVERSAL'
const MANAGER_ONLY_TYPES: TransactionType[] = ['REFUND', 'FORFEITURE', 'ADJUSTMENT']

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

// ── POST /api/financial/transactions ─────────────────────────────────────────
// Post a transaction to the books.
// Allowed roles: ACCOUNTING_STAFF (PAYMENT only), ACCOUNTING_MANAGER (all types)
//
// Body (JSON):
//   pnrId, stockId, transactionType, paymentMethod, amount, currencyCode,
//   transactionDate, referenceNo, remark, createdBy,
//   linkedRequestId?, voucherNo?, postingDate?, accountingNote?,
//   existingVoucherNos?: string[]  — client passes for server-side duplicate check

export async function POST(request: Request) {
  const role = getRoleFromHeader(request)
  if (!role || !ACCOUNTING_ROLES.includes(role)) return FORBIDDEN

  let body: {
    transactionType?: TransactionType
    voucherNo?: string
    existingVoucherNos?: string[]
    [key: string]: unknown
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, { status: 400 })
  }

  const { transactionType, voucherNo, existingVoucherNos } = body

  // REFUND / FORFEITURE / ADJUSTMENT require ACCOUNTING_MANAGER
  if (
    transactionType &&
    MANAGER_ONLY_TYPES.includes(transactionType) &&
    role !== 'ACCOUNTING_MANAGER'
  ) {
    return NextResponse.json(
      {
        error: 'ประเภทรายการนี้ต้องใช้สิทธิ์ผู้จัดการฝ่ายบัญชี',
        code: 'FORBIDDEN',
      },
      { status: 403 },
    )
  }

  // Duplicate voucher number check (client passes existing voucher nos)
  if (voucherNo && existingVoucherNos?.length) {
    const normalised = voucherNo.trim().toUpperCase()
    if (existingVoucherNos.some(v => v.trim().toUpperCase() === normalised)) {
      return NextResponse.json(
        { error: 'เลขที่ใบสำคัญนี้มีอยู่แล้วในระบบ', code: 'DUPLICATE_VOUCHER' },
        { status: 409 },
      )
    }
  }

  // In demo mode actual storage is in localStorage on the client.
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase()
  const transactionId = `TXN-${rand}`

  return NextResponse.json({ ok: true, transactionId })
}
