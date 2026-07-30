// ============================================================
// Role & Permission definitions for Air Ticket Stock Management
// ============================================================

export type UserRole =
  | 'TICKET_STAFF'
  | 'TICKET_SUPERVISOR'
  | 'ACCOUNTING_STAFF'
  | 'ACCOUNTING_MANAGER'

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  TICKET_STAFF:       'ฝ่ายตั๋ว',
  TICKET_SUPERVISOR:  'หัวหน้าฝ่ายตั๋ว',
  ACCOUNTING_STAFF:   'ฝ่ายบัญชี',
  ACCOUNTING_MANAGER: 'ผู้จัดการฝ่ายบัญชี',
}

export const ALL_USER_ROLES: UserRole[] = [
  'TICKET_STAFF',
  'TICKET_SUPERVISOR',
  'ACCOUNTING_STAFF',
  'ACCOUNTING_MANAGER',
]

// ── Permission types ──────────────────────────────────────────────────────────

export type Permission =
  | 'VIEW_TRANSACTIONS'
  | 'SUBMIT_FINANCIAL_REQUEST'   // ticket staff/supervisor: create request
  | 'REVIEW_TICKET_REQUEST'      // ticket supervisor: review ticket-side request before sending
  | 'VIEW_PENDING_REQUESTS'      // accounting: see pending requests
  | 'POST_TRANSACTION'           // accounting staff/manager: post (finalize) transactions
  | 'APPROVE_REFUND'             // manager only
  | 'APPROVE_FORFEITURE'         // manager only
  | 'APPROVE_ADJUSTMENT'         // manager only
  | 'VOID_TRANSACTION'           // manager only
  | 'REVERSE_TRANSACTION'        // manager only

// ── Role → Permissions mapping ────────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  TICKET_STAFF: [
    'VIEW_TRANSACTIONS',
    'SUBMIT_FINANCIAL_REQUEST',
  ],
  TICKET_SUPERVISOR: [
    'VIEW_TRANSACTIONS',
    'SUBMIT_FINANCIAL_REQUEST',
    'REVIEW_TICKET_REQUEST',
  ],
  ACCOUNTING_STAFF: [
    'VIEW_TRANSACTIONS',
    'VIEW_PENDING_REQUESTS',
    'POST_TRANSACTION',
  ],
  ACCOUNTING_MANAGER: [
    'VIEW_TRANSACTIONS',
    'VIEW_PENDING_REQUESTS',
    'POST_TRANSACTION',
    'APPROVE_REFUND',
    'APPROVE_FORFEITURE',
    'APPROVE_ADJUSTMENT',
    'VOID_TRANSACTION',
    'REVERSE_TRANSACTION',
  ],
}

// ── Public functions ──────────────────────────────────────────────────────────

/**
 * Check whether a role has a specific permission.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

/**
 * Get the demo user role from localStorage.
 * Falls back to 'TICKET_STAFF' when running server-side or when the stored
 * value is not a valid UserRole.
 */
export function getDemoRole(): UserRole {
  if (typeof window === 'undefined') return 'TICKET_STAFF'
  try {
    const stored = window.localStorage.getItem('demo_user_role')
    if (stored && ALL_USER_ROLES.includes(stored as UserRole)) {
      return stored as UserRole
    }
  } catch {
    // ignore storage errors
  }
  return 'TICKET_STAFF'
}

/**
 * Persist the demo user role to localStorage.
 * No-op when running server-side.
 */
export function setDemoRole(role: UserRole): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem('demo_user_role', role)
  } catch {
    // ignore storage errors
  }
}

/**
 * Validate role header and permission for use in API route handlers.
 * `roleHeader` comes from `request.headers.get('x-demo-role')`.
 * Returns false when the header is null, the value is not a valid UserRole,
 * or the role does not have the required permission.
 */
export function checkAPIPermission(
  roleHeader: string | null,
  required: Permission,
): boolean {
  if (!roleHeader) return false
  if (!ALL_USER_ROLES.includes(roleHeader as UserRole)) return false
  return hasPermission(roleHeader as UserRole, required)
}

/**
 * Returns true for roles on the ticket (operations) side.
 */
export function isTicketRole(role: UserRole): boolean {
  return role === 'TICKET_STAFF' || role === 'TICKET_SUPERVISOR'
}

/**
 * Returns true for roles on the accounting side.
 */
export function isAccountingRole(role: UserRole): boolean {
  return role === 'ACCOUNTING_STAFF' || role === 'ACCOUNTING_MANAGER'
}
