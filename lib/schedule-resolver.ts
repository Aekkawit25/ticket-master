import type { DemoPNR, DemoFlightSet, DemoSector, PnrSectorSchedule } from './demo-storage'

// ─── helpers ─────────────────────────────────────────────────────────────────

function addDaysLocal(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const local = new Date(y, m - 1, d)
  local.setDate(local.getDate() + days)
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
}

function calcDepDate(travelStart: string, departureDayOffset: number): string {
  // dayOffset is 1-based: Travel Day 1 = travelStart + 0 days
  return addDaysLocal(travelStart, departureDayOffset - 1)
}

// ─── primary resolver ─────────────────────────────────────────────────────────

/**
 * Build PnrSectorSchedule[] from a PNR that already has sectorSchedules stored.
 * Priority: stored manual override → recalculate from travelStart + departureDayOffset.
 */
export function resolvePnrSectorSchedules(
  pnr: DemoPNR,
  flightSet: DemoFlightSet
): PnrSectorSchedule[] {
  const travelStart = pnr.travelStart
  if (!travelStart || !flightSet.sectors.length) return []

  return flightSet.sectors.map((sec, i) => {
    // Match stored override by flightSetSectorId first, then fall back to index
    const stored = pnr.sectorSchedules?.find(s => s.flightSetSectorId === sec.sectorId)
      ?? pnr.sectorSchedules?.[i]

    const plusDay = sec.arrDayOffset ?? 0
    const departureDayOffset = sec.dayOffset ?? 1

    let departureDate: string
    let isDateOverride: boolean
    let sourceType: PnrSectorSchedule['sourceType']

    if (stored?.isDateOverride && stored.departureDate) {
      departureDate = stored.departureDate
      isDateOverride = true
      sourceType = 'manual'
    } else {
      departureDate = calcDepDate(travelStart, departureDayOffset)
      isDateOverride = false
      sourceType = 'calculated'
    }

    const arrivalDate = plusDay > 0 ? addDaysLocal(departureDate, plusDay) : departureDate

    return {
      flightSetSectorId: sec.sectorId,
      sequence: sec.seq,
      sectorType: sec.sectorType as PnrSectorSchedule['sectorType'],
      departureDate,
      departureTime: (stored?.isTimeOverride && stored.departureTime) ? stored.departureTime : (sec.depTime ?? ''),
      arrivalDate,
      arrivalTime: (stored?.isTimeOverride && stored.arrivalTime) ? stored.arrivalTime : (sec.arrTime ?? ''),
      plusDay,
      departureDayOffset,
      isDateOverride,
      isTimeOverride: stored?.isTimeOverride ?? false,
      sourceType,
    }
  })
}

// ─── legacy adapter ───────────────────────────────────────────────────────────

/**
 * Reconstruct PnrSectorSchedule[] for legacy PNRs that only have sectorDates[].
 * Matches by index (sectorDates[i] ↔ flightSet.sectors[i]).
 * isDateOverride=false, sourceType='calculated' for all entries.
 */
export function adaptLegacyPnrSchedule(
  pnr: DemoPNR,
  flightSet: DemoFlightSet
): PnrSectorSchedule[] {
  const travelStart = pnr.travelStart
  if (!travelStart || !flightSet.sectors.length) return []

  return flightSet.sectors.map((sec, i) => {
    const legacyDate = pnr.sectorDates?.[i]?.date ?? ''
    const departureDayOffset = sec.dayOffset ?? 1
    const plusDay = sec.arrDayOffset ?? 0

    // Prefer stored legacy date; fall back to calculation
    const departureDate = legacyDate || calcDepDate(travelStart, departureDayOffset)
    const arrivalDate = plusDay > 0 ? addDaysLocal(departureDate, plusDay) : departureDate

    return {
      flightSetSectorId: sec.sectorId,
      sequence: sec.seq,
      sectorType: sec.sectorType as PnrSectorSchedule['sectorType'],
      departureDate,
      departureTime: sec.depTime ?? '',
      arrivalDate,
      arrivalTime: sec.arrTime ?? '',
      plusDay,
      departureDayOffset,
      isDateOverride: false,
      isTimeOverride: false,
      sourceType: 'calculated' as const,
    }
  })
}

// ─── entry point ──────────────────────────────────────────────────────────────

/**
 * Return the resolved schedule list for a PNR, choosing the right path:
 * - If pnr.sectorSchedules has entries → resolvePnrSectorSchedules (new path)
 * - Otherwise → adaptLegacyPnrSchedule (legacy path)
 */
export function getPnrSectorSchedules(
  pnr: DemoPNR,
  flightSet: DemoFlightSet
): PnrSectorSchedule[] {
  if (pnr.sectorSchedules && pnr.sectorSchedules.length > 0) {
    return resolvePnrSectorSchedules(pnr, flightSet)
  }
  return adaptLegacyPnrSchedule(pnr, flightSet)
}

// ─── travel end helper ────────────────────────────────────────────────────────

/**
 * Derive travelEnd from a resolved schedule list.
 * Uses the last Arrival sector's arrivalDate; falls back to the last sector's arrivalDate.
 */
export function resolveTravelEnd(schedules: PnrSectorSchedule[]): string {
  if (!schedules.length) return ''
  const arrivals = schedules.filter(s => s.sectorType === 'Arrival')
  const last = arrivals.length ? arrivals[arrivals.length - 1] : schedules[schedules.length - 1]
  return last.arrivalDate
}

// ─── build helper ─────────────────────────────────────────────────────────────

/**
 * Build PnrSectorSchedule[] from raw DemoSector list + travelStart.
 * All dates are calculated (no overrides). Used when creating/updating a PNR.
 */
export function buildSectorSchedules(
  sectors: DemoSector[],
  travelStart: string
): PnrSectorSchedule[] {
  if (!travelStart || !sectors.length) return []
  return sectors.map(sec => {
    const departureDayOffset = sec.dayOffset ?? 1
    const departureDate = calcDepDate(travelStart, departureDayOffset)
    const plusDay = sec.arrDayOffset ?? 0
    const arrivalDate = plusDay > 0 ? addDaysLocal(departureDate, plusDay) : departureDate
    return {
      flightSetSectorId: sec.sectorId,
      sequence: sec.seq,
      sectorType: sec.sectorType as PnrSectorSchedule['sectorType'],
      departureDate,
      departureTime: sec.depTime ?? '',
      arrivalDate,
      arrivalTime: sec.arrTime ?? '',
      plusDay,
      departureDayOffset,
      isDateOverride: false,
      isTimeOverride: false,
      sourceType: 'calculated' as const,
    }
  })
}
