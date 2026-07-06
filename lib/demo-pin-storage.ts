/**
 * Client-side localStorage store for demo Reopen PIN data.
 * Persists the bcrypt hash and status per userId across browser sessions and server restarts.
 *
 * The hash is a bcrypt one-way function output — it cannot be reversed to obtain the PIN.
 * Storing it client-side is intentional for the demo mode only.
 * In production, PIN data lives server-side in the database.
 *
 * NEVER import this file in server-side code (API routes, server components).
 */

const STORAGE_KEY = 'demo_reopen_pin'

export interface DemoPinEntry {
  hasReopenPin: boolean
  reopenPinHash: string  // bcrypt hash — NEVER the PIN itself
}

type DemoPinStore = Record<string, DemoPinEntry>

function loadStore(): DemoPinStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DemoPinStore) : {}
  } catch {
    return {}
  }
}

function persist(store: DemoPinStore): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {}
}

/** Returns the stored PIN entry for a user, or null if not set. */
export function getDemoPinEntry(userId: string): DemoPinEntry | null {
  return loadStore()[userId] ?? null
}

/**
 * Saves (upserts) a PIN entry for a user.
 * Never overwrites existing entries unless explicitly called — safe on reload.
 */
export function saveDemoPinEntry(userId: string, entry: DemoPinEntry): void {
  const store = loadStore()
  store[userId] = entry
  persist(store)
}
