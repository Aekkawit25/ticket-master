/**
 * Pure shared time utilities — NO 'use client', usable in both server (API) and client code.
 */

/**
 * Normalize raw user-typed time → HH:mm (24h).
 * Returns '' if input cannot be parsed or is out of range.
 *
 * Accepted inputs:
 *   "8"        → "08:00"
 *   "08"       → "08:00"
 *   "830"      → "08:30"
 *   "0830"     → "08:30"
 *   "1730"     → "17:30"
 *   "8:30"     → "08:30"
 *   "08:30"    → "08:30"
 *   "8.30"     → "08:30"
 *   "08.30"    → "08:30"
 *   "00.00"    → "00:00"
 *   "0.00"     → "00:00"
 *
 * REJECTED (returns ''):
 *   - AM/PM formats (e.g., "8 PM", "8:30 AM")
 *   - Multiple separators (e.g., "8:3:0", "08..30", "08::30")
 *   - Mixed separators (both : and . together)
 *   - Hour > 23 or minute > 59
 *   - Letters, spaces inside digits, other special chars
 *   - More than 4 digits without separator
 *   - Inputs like "159:366", "9999", "12345", "159366"
 */
export function normalizeTime(raw: string): string {
  if (!raw) return ''
  const s = raw.trim()
  if (!s) return ''

  // Reject AM/PM
  if (/am|pm/i.test(s)) return ''

  // Reject if contains both ':' AND '.' (mixed separators)
  if (s.includes(':') && s.includes('.')) return ''

  // Count separators (: or .)
  const sepCount = (s.match(/[:.]/g) || []).length

  // Reject if more than one separator
  if (sepCount > 1) return ''

  // Has exactly one separator
  if (sepCount === 1) {
    // Normalize dot → colon then match H:mm or HH:mm
    const withColon = s.replace('.', ':')
    const colonPair = withColon.match(/^(\d{1,2}):(\d{1,2})$/)
    if (!colonPair) return ''
    const h = parseInt(colonPair[1], 10)
    const m = parseInt(colonPair[2], 10)
    if (h > 23 || m > 59) return ''
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // No separator — must be pure digits
  if (!/^\d+$/.test(s)) return ''

  // 3–4 pure digits: "830" → "08:30", "0830" → "08:30", "1730" → "17:30"
  if (/^\d{3,4}$/.test(s)) {
    const padded = s.padStart(4, '0')
    const h = parseInt(padded.slice(0, 2), 10)
    const m = parseInt(padded.slice(2), 10)
    if (h > 23 || m > 59) return ''
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // 1–2 pure digits: hour only → "8" → "08:00", "23" → "23:00"
  if (/^\d{1,2}$/.test(s)) {
    const h = parseInt(s, 10)
    if (h > 23) return ''
    return `${String(h).padStart(2, '0')}:00`
  }

  // 5+ digits or anything else
  return ''
}

/** True if s is exactly a valid HH:mm 24-hour string (e.g., "08:30", "23:59") */
export function isValidHHmm(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

/** Alias for isValidHHmm */
export function validateTime(s: string): boolean {
  return isValidHHmm(s)
}

/**
 * True if a and b refer to the same airport code.
 * Comparison is case-insensitive and trims whitespace.
 * Returns false when either value is empty (empty airports are handled by required-field validation).
 */
export function sameAirport(a: string, b: string): boolean {
  if (!a || !b) return false
  return a.trim().toUpperCase() === b.trim().toUpperCase()
}

/**
 * Validate dep_time and arr_time for every sector.
 * Returns array of errors for any non-null, non-empty time that fails isValidHHmm.
 */
export function validateAllSectorTimes(
  sectors: ReadonlyArray<{ dep_time?: string | null; arr_time?: string | null }>,
): Array<{ idx: number; field: 'dep_time' | 'arr_time'; message: string }> {
  const errors: Array<{ idx: number; field: 'dep_time' | 'arr_time'; message: string }> = []
  sectors.forEach((s, idx) => {
    if (s.dep_time && !isValidHHmm(s.dep_time)) {
      errors.push({ idx, field: 'dep_time', message: `Sector ${idx + 1}: dep_time "${s.dep_time}" ไม่ถูกต้อง (ต้อง HH:mm)` })
    }
    if (s.arr_time && !isValidHHmm(s.arr_time)) {
      errors.push({ idx, field: 'arr_time', message: `Sector ${idx + 1}: arr_time "${s.arr_time}" ไม่ถูกต้อง (ต้อง HH:mm)` })
    }
  })
  return errors
}
