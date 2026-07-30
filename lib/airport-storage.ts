import { MASTER_AIRPORTS, type MasterAirport } from './master-data'

const KEY = 'airports_data'

export interface StoredAirport extends MasterAirport {
  status: 'Active' | 'Inactive'
}

// ISO Alpha-2 → Alpha-3 mapping for migrating old localStorage data
const CC2_TO_ALPHA3: Record<string, string> = {
  TH: 'THA', JP: 'JPN', KR: 'KOR', CN: 'CHN', HK: 'HKG', MO: 'MAC', TW: 'TWN',
  SG: 'SGP', MY: 'MYS', PH: 'PHL', ID: 'IDN', VN: 'VNM', LA: 'LAO', KH: 'KHM',
  MM: 'MMR', IN: 'IND', LK: 'LKA', NP: 'NPL', MV: 'MDV', AE: 'ARE', QA: 'QAT',
  KW: 'KWT', SA: 'SAU', OM: 'OMN', BH: 'BHR', EG: 'EGY', JO: 'JOR', KZ: 'KAZ',
  MN: 'MNG', RU: 'RUS', GB: 'GBR', FR: 'FRA', NL: 'NLD', DE: 'DEU', AT: 'AUT',
  CH: 'CHE', IT: 'ITA', ES: 'ESP', TR: 'TUR', AU: 'AUS', NZ: 'NZL', US: 'USA',
  CA: 'CAN', MX: 'MEX', BR: 'BRA', AR: 'ARG', ZA: 'ZAF', KE: 'KEN', ET: 'ETH',
}

function migrateAirport(raw: Record<string, unknown>): StoredAirport {
  // New format already has countryCode
  if (typeof raw.countryCode === 'string') {
    return raw as unknown as StoredAirport
  }
  // Old format: has 'cc' (ISO 2-char) and 'country' (name) — migrate
  const masterMatch = MASTER_AIRPORTS.find(a => a.code === raw.code)
  const countryCode =
    masterMatch?.countryCode ??
    (typeof raw.cc === 'string' ? CC2_TO_ALPHA3[raw.cc] : undefined) ??
    'UNK'
  return {
    code:        raw.code        as string,
    name:        raw.name        as string,
    city:        raw.city        as string,
    countryCode,
    status:     (raw.status as 'Active' | 'Inactive') ?? 'Active',
  }
}

function seed(): StoredAirport[] {
  return MASTER_AIRPORTS.map(a => ({ ...a, status: 'Active' as const }))
}

export function getAirports(): StoredAirport[] {
  if (typeof window === 'undefined') return seed()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return seed()
    const parsed: Record<string, unknown>[] = JSON.parse(raw)
    const stored = parsed.map(migrateAirport)
    // Merge: add any new airports from MASTER that aren't stored yet
    const codes = new Set(stored.map(a => a.code))
    const fresh = MASTER_AIRPORTS
      .filter(a => !codes.has(a.code))
      .map(a => ({ ...a, status: 'Active' as const }))
    return [...stored, ...fresh]
  } catch { return seed() }
}

export function saveAirports(airports: StoredAirport[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(airports))
  window.dispatchEvent(new Event('airports_updated'))
}

export function getActiveAirports(): StoredAirport[] {
  return getAirports().filter(a => a.status === 'Active')
}

export function getAirportByCode(code: string): StoredAirport | undefined {
  return getAirports().find(a => a.code === code.toUpperCase())
}

export function isValidActiveAirport(code: string): boolean {
  return getAirports().some(a => a.code === code.toUpperCase() && a.status === 'Active')
}

export function validateAirportCodes(codes: string[]): string[] {
  const active = new Set(getAirports().filter(a => a.status === 'Active').map(a => a.code))
  return [...new Set(codes.filter(c => c && !active.has(c.toUpperCase())))]
}
