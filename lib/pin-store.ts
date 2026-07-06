/**
 * Server-only PIN store — demo mode.
 * Uses globalThis to survive Next.js HMR hot-reloads within the same process.
 * A cold server restart still clears it — clients re-hydrate via hydrateFromHash().
 * NEVER import this file in client components.
 * PIN hashes are never exposed to the client.
 */

import bcrypt from 'bcryptjs'

const MAX_ATTEMPTS     = 5
const LOCK_DURATION_MS = 15 * 60 * 1000  // 15 minutes
const BCRYPT_ROUNDS    = 10

interface PinRecord {
  hash: string
  failedAttempts: number
  lockedUntil: number | null  // epoch ms
}

// globalThis survives Next.js HMR module reloads within the same Node.js process.
// A cold server restart (npm run dev) still clears it — clients re-hydrate from localStorage.
const g = globalThis as typeof globalThis & { _demoPinStore?: Map<string, PinRecord> }

function getStore(): Map<string, PinRecord> {
  if (!g._demoPinStore) g._demoPinStore = new Map()
  return g._demoPinStore
}

export const DEMO_USERS_META: Array<{
  userId: string
  name: string
  role: string
  canReopenStock: boolean
}> = [
  { userId: 'u-admin', name: 'Admin User', role: 'Admin',   canReopenStock: true  },
  { userId: 'u-mgr',   name: 'Manager A',  role: 'Manager', canReopenStock: true  },
  { userId: 'u-staff', name: 'Staff B',    role: 'Staff',   canReopenStock: false },
  { userId: 'u-view',  name: 'Viewer C',   role: 'Viewer',  canReopenStock: false },
]

/**
 * Re-seeds globalThis from a bcrypt hash stored in the client's localStorage.
 * Called when the server was restarted and has lost its in-memory state.
 * Only hydrates if the userId is not already known, to avoid overwriting newer state.
 */
export function hydrateFromHash(userId: string, hash: string): void {
  const s = getStore()
  if (!s.has(userId)) {
    s.set(userId, { hash, failedAttempts: 0, lockedUntil: null })
  }
}

export function hasPinSet(userId: string): boolean {
  return getStore().has(userId)
}

export function getPinStatus(userId: string): {
  hasPinSet: boolean
  isLocked: boolean
  lockedUntil: string | null
  failedAttempts: number
} {
  const rec = getStore().get(userId)
  if (!rec) return { hasPinSet: false, isLocked: false, lockedUntil: null, failedAttempts: 0 }

  const now      = Date.now()
  const isLocked = rec.lockedUntil !== null && rec.lockedUntil > now
  return {
    hasPinSet: true,
    isLocked,
    lockedUntil: isLocked ? new Date(rec.lockedUntil!).toISOString() : null,
    failedAttempts: rec.failedAttempts,
  }
}

export function userCanReopen(userId: string): boolean {
  return DEMO_USERS_META.find(u => u.userId === userId)?.canReopenStock ?? false
}

export function validatePinFormat(pin: string): { valid: boolean; reason?: string } {
  if (!/^\d{4}$/.test(pin)) return { valid: false, reason: 'PIN ต้องเป็นตัวเลข 4 หลักเท่านั้น' }
  if (/^(\d)\1{3}$/.test(pin)) return { valid: false, reason: 'PIN ไม่ควรใช้ตัวเลขซ้ำทั้งหมด เช่น 0000, 1111' }
  const digits = pin.split('').map(Number)
  const isAsc  = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1)
  const isDesc = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1)
  if (isAsc || isDesc) return { valid: false, reason: 'PIN ไม่ควรใช้ตัวเลขเรียงลำดับ เช่น 1234, 4321' }
  return { valid: true }
}

/**
 * Hashes and stores the PIN in globalThis.
 * Returns the bcrypt hash so the API route can send it to the client
 * for localStorage persistence (demo mode survival across server restarts).
 */
export async function setPin(userId: string, pin: string): Promise<string> {
  const hash = await bcrypt.hash(pin, BCRYPT_ROUNDS)
  getStore().set(userId, { hash, failedAttempts: 0, lockedUntil: null })
  return hash
}

export async function verifyPin(
  userId: string,
  pin: string,
): Promise<{
  success: boolean
  message: string
  remainingAttempts?: number
  lockedUntil?: string
}> {
  const rec = getStore().get(userId)
  if (!rec) return { success: false, message: 'ยังไม่ได้ตั้งรหัส Reopen PIN กรุณาตั้งรหัสใน Settings ก่อน' }

  const now = Date.now()
  if (rec.lockedUntil !== null && rec.lockedUntil > now) {
    return {
      success: false,
      message: 'มีการกรอกรหัสไม่ถูกต้องหลายครั้ง กรุณาลองใหม่ภายหลัง',
      lockedUntil: new Date(rec.lockedUntil).toISOString(),
    }
  }

  const match = await bcrypt.compare(pin, rec.hash)
  if (match) {
    getStore().set(userId, { ...rec, failedAttempts: 0, lockedUntil: null })
    return { success: true, message: 'รหัสถูกต้อง' }
  }

  const newFailed  = rec.failedAttempts + 1
  const shouldLock = newFailed >= MAX_ATTEMPTS
  const lockedUntil = shouldLock ? now + LOCK_DURATION_MS : null
  getStore().set(userId, { ...rec, failedAttempts: newFailed, lockedUntil })

  if (shouldLock) {
    return {
      success: false,
      message: 'มีการกรอกรหัสไม่ถูกต้องหลายครั้ง กรุณาลองใหม่ภายหลัง',
      lockedUntil: new Date(lockedUntil!).toISOString(),
    }
  }

  return {
    success: false,
    message: 'รหัสยืนยันไม่ถูกต้อง',
    remainingAttempts: MAX_ATTEMPTS - newFailed,
  }
}
