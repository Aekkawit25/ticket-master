/**
 * Master reference data for Condition Builder selects.
 * Mirrors the mock data in settings pages — replace with API/storage when ready.
 */

export interface MasterAirline {
  code: string
  name: string
}

export const MASTER_AIRLINES: MasterAirline[] = [
  // ── Thai carriers ────────────────────────────────────────────
  { code: 'TG',  name: 'Thai Airways' },
  { code: 'FD',  name: 'Air Asia' },
  { code: 'DD',  name: 'Nok Air' },
  { code: 'SL',  name: 'Thai Lion Air' },
  { code: 'WE',  name: 'Thai Smile Airways' },
  { code: 'VZ',  name: 'Thai Vietjet Air' },
  { code: 'XJ',  name: 'Air Asia X' },
  // ── East Asia ─────────────────────────────────────────────────
  { code: 'JL',  name: 'Japan Airlines' },
  { code: 'NH',  name: 'All Nippon Airways' },
  { code: 'KE',  name: 'Korean Air' },
  { code: 'OZ',  name: 'Asiana Airlines' },
  { code: 'TW',  name: "T'way Air" },
  { code: 'ZE',  name: 'Eastar Jet' },
  { code: 'BX',  name: 'Air Busan' },
  { code: 'CX',  name: 'Cathay Pacific Airlines' },
  { code: 'HX',  name: 'Hong Kong Airlines' },
  { code: 'UO',  name: 'Hong Kong Express Airways' },
  { code: 'HB',  name: 'Greater Bay Airlines' },
  { code: 'NX',  name: 'Air Macau' },
  { code: 'CI',  name: 'China Airlines' },
  { code: 'BR',  name: 'EVA Air' },
  { code: 'JX',  name: 'Starlux Airlines' },
  // ── China ─────────────────────────────────────────────────────
  { code: 'CA',  name: 'Air China' },
  { code: 'CZ',  name: 'China Southern Airlines' },
  { code: 'MU',  name: 'China Eastern Airlines' },
  { code: 'FM',  name: 'Shanghai Airlines' },
  { code: 'HU',  name: 'Hainan Airlines' },
  { code: 'SC',  name: 'Shandong Airlines' },
  { code: 'ZH',  name: 'Shenzhen Airlines' },
  { code: '3U',  name: 'Sichuan Airlines' },
  { code: 'EU',  name: 'Chengdu Airlines' },
  { code: '9H',  name: "Air Chang'an" },
  { code: 'HO',  name: 'Juneyao Air' },
  { code: 'GJ',  name: 'Loong Air' },
  { code: 'JD',  name: 'Beijing Capital Airlines' },
  { code: 'G5',  name: 'China Express Airlines' },
  { code: 'QW',  name: 'Qingdao Airlines' },
  { code: 'AQ',  name: '9 Air' },
  { code: '9C',  name: 'Spring Airlines' },
  { code: 'UQ',  name: 'Urumqi Air' },
  { code: 'KY',  name: 'Kunming Airlines' },
  { code: '8L',  name: 'Lucky Air' },
  { code: 'PN',  name: 'West Air' },
  { code: 'BK',  name: 'Okay Airways' },
  { code: 'DR',  name: 'Ruili Airlines' },
  // ── Southeast Asia ────────────────────────────────────────────
  { code: 'SQ',  name: 'Singapore Airlines' },
  { code: 'TR',  name: 'Scoot' },
  { code: 'VN',  name: 'Vietnam Airlines' },
  { code: 'VJ',  name: 'Vietjet Air' },
  { code: 'QH',  name: 'Bamboo Airways' },
  { code: 'VU',  name: 'Vietravel Airlines' },
  { code: '9G',  name: 'Sun Phu Quoc Airways' },
  { code: 'PR',  name: 'Philippine Airlines' },
  { code: '8M',  name: 'Myanmar Airways International' },
  { code: 'MM',  name: 'Peach Air' },
  // ── South Asia ────────────────────────────────────────────────
  { code: 'AI',  name: 'Air India' },
  { code: 'SG',  name: 'SpiceJet' },
  { code: '6E',  name: 'IndiGo Airlines' },
  // ── Middle East ───────────────────────────────────────────────
  { code: 'EK',  name: 'Emirates' },
  { code: 'QR',  name: 'Qatar Airways' },
  { code: 'EY',  name: 'Etihad Airways' },
  { code: 'GF',  name: 'Gulf Air' },
  { code: 'KU',  name: 'Kuwait Airways' },
  { code: 'WY',  name: 'Oman Air' },
  { code: 'SV',  name: 'Saudia Airlines' },
  { code: 'MS',  name: 'EgyptAir' },
  // ── Central Asia & Russia ─────────────────────────────────────
  { code: 'KC',  name: 'Air Astana' },
  { code: 'SU',  name: 'Aeroflot Russian Airlines' },
  { code: 'OM',  name: 'MIAT Mongolian Airlines' },
  // ── Europe ────────────────────────────────────────────────────
  { code: 'TK',  name: 'Turkish Airlines' },
  { code: 'E9',  name: 'Iberojet' },
  // ── Africa ────────────────────────────────────────────────────
  { code: 'ET',  name: 'Ethiopian Airlines' },
  // ── Low-cost / Regional ───────────────────────────────────────
  { code: 'ZG',  name: 'Zego' },
  { code: '9W',  name: 'Jet Airways' },
]

export interface MasterCurrency {
  code: string
  name: string
}

export const MASTER_CURRENCIES: MasterCurrency[] = [
  { code: 'THB', name: 'Thai Baht (บาท)' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
]

export interface MasterCountry {
  name: string
}

export const MASTER_COUNTRIES: MasterCountry[] = [
  { name: 'Japan' },
  { name: 'South Korea' },
  { name: 'China' },
  { name: 'Taiwan' },
  { name: 'Hong Kong' },
  { name: 'Singapore' },
  { name: 'Malaysia' },
  { name: 'Vietnam' },
  { name: 'United Kingdom' },
  { name: 'France' },
  { name: 'Germany' },
  { name: 'UAE' },
  { name: 'Australia' },
  { name: 'USA' },
  { name: 'Switzerland' },
  { name: 'Italy' },
  { name: 'Spain' },
  { name: 'Turkey' },
  { name: 'India' },
  { name: 'Indonesia' },
]

export function getAirlineName(code: string): string {
  return MASTER_AIRLINES.find(a => a.code === code)?.name ?? code
}

export function getAirlineLabel(code: string): string {
  const a = MASTER_AIRLINES.find(a => a.code === code)
  return a ? `${a.code} — ${a.name}` : code
}
