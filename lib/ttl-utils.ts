import { formatDate } from '@/lib/utils'

export type TtlType = 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE'

/** Subtract daysBefore from travelStart, noon-anchored to avoid timezone issues */
export function calcTtlDateFromTravel(travelStart: string, daysBefore: number): string | null {
  if (!travelStart || daysBefore < 0) return null
  try {
    const d = new Date(travelStart + 'T12:00:00')
    d.setDate(d.getDate() - daysBefore)
    return d.toISOString().split('T')[0]
  } catch { return null }
}

/** Format TTL date+time for display: "DD MMM YY · HH:mm" or "DD MMM YY" */
export function formatTtlDisplay(ttlDate: string | null, ttlTime: string | null): string {
  if (!ttlDate) return '—'
  const d = formatDate(ttlDate)
  return ttlTime ? `${d} · ${ttlTime}` : d
}

/** Check if a PNR has a set TTL (ttl_type is not NONE and ttl_date is set) */
export function hasTtl(p: { ttl_type?: TtlType; ttl_date?: string | null }): boolean {
  // Explicitly cleared
  if (p.ttl_type === 'NONE') return false
  // New-style: type is set → require date too
  if (p.ttl_type === 'DAYS_BEFORE' || p.ttl_type === 'FIXED_DATE') return !!p.ttl_date
  // Backward compat: no ttl_type yet → use date presence (old ttl_status='SET' data)
  return !!p.ttl_date
}
