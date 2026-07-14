// ─── Shared view-model types for PNRSeatsTable ───────────────────────────────

export type PriceFormat = 'FARE' | 'FARE_YQ' | 'ALL_IN'
export type TaxType     = 'separate' | 'included' | 'pending'
export type TtlType     = 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE'

export interface SectorTemplate {
  sectorType:      string
  dayOffset:       number
  arrDayOffset:    number
  depAirportCode:  string
  arrAirportCode:  string
  depTime:         string
  arrTime:         string
}

export interface ScheduleTemplate {
  scheduleId:   string
  scheduleName: string
  isMain:       boolean
  sectors:      SectorTemplate[]
}

export interface PNRSectorRecord {
  sectorType:     string
  dayOffset:      number
  arrDayOffset:   number
  depAirportCode: string
  arrAirportCode: string
  depDate:        string
  depTime:        string
  arrDate:        string
  arrTime:        string
  depManual:      boolean
  arrManual:      boolean
  timeOverride:   boolean
  tmplDepTime:    string
  tmplArrTime:    string
}

export interface PNRRecord {
  rowId:          string
  seq:            number
  pnrCode:        string
  dummyPnr:       string
  activeScheduleId?: string
  seatTotal:      number
  priceFormat:    PriceFormat
  fare:           number
  yq:             number | null
  tax:            number | null
  taxType:        TaxType
  totalAmount:    number
  currency:       string
  conditionId:    string
  remark:         string
  ttlType:        TtlType
  ttlDate:        string | null
  ttlTime:        string | null
  ttlDaysBefore:  number | null
  sectors:        PNRSectorRecord[]
  selected?:      boolean
  errors?:        string[]
  isNewlyAdded?:  boolean
}

// ─── Pure business logic ──────────────────────────────────────────────────────

function addDaysStr(dateStr: string, days: number): string {
  if (!dateStr || days === 0) return dateStr
  try {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  } catch { return dateStr }
}

export function calcPnrTotal(fmt: PriceFormat, fare: number, tax: number | null, yq: number | null): number {
  if (fmt === 'ALL_IN') return fare
  if (fmt === 'FARE_YQ') return fare + (yq ?? 0)
  return fare + (tax ?? 0) + (yq ?? 0)
}

export function autoAdjustArrDate(
  depDate: string,
  depTime: string,
  arrTime: string,
  arrDayOffset: number,
): { arrDate: string; wasAdjusted: boolean } {
  if (!depDate) return { arrDate: '', wasAdjusted: false }
  const tmplArr = addDaysStr(depDate, arrDayOffset)
  if (tmplArr === depDate && depTime && arrTime && arrTime < depTime) {
    return { arrDate: addDaysStr(depDate, 1), wasAdjusted: true }
  }
  return { arrDate: tmplArr, wasAdjusted: false }
}

export function calcSectorDepDate(travelStart: string, dayOffset: number): string {
  if (!travelStart) return ''
  try {
    const d = new Date(travelStart + 'T12:00:00')
    d.setDate(d.getDate() + dayOffset - 1)
    return d.toISOString().split('T')[0]
  } catch { return '' }
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
export function getDayLabel(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr + 'T12:00:00')
    if (isNaN(d.getTime())) return '—'
    return DOW[d.getDay()]
  } catch { return '—' }
}

export function buildSectorsFromTemplate(
  travelStart: string,
  tmpl: SectorTemplate[],
): PNRSectorRecord[] {
  return tmpl.map(s => {
    const dep = calcSectorDepDate(travelStart, s.dayOffset)
    const arr = dep ? addDaysStr(dep, s.arrDayOffset) : ''
    return {
      sectorType:     s.sectorType,
      dayOffset:      s.dayOffset,
      arrDayOffset:   s.arrDayOffset,
      depAirportCode: s.depAirportCode,
      arrAirportCode: s.arrAirportCode,
      depDate:        dep,
      depTime:        s.depTime,
      arrDate:        arr,
      arrTime:        s.arrTime,
      depManual:      false,
      arrManual:      false,
      timeOverride:   false,
      tmplDepTime:    s.depTime,
      tmplArrTime:    s.arrTime,
    }
  })
}
