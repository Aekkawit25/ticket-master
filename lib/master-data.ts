/**
 * Master reference data for Condition Builder selects.
 * Mirrors the mock data in settings pages — replace with API/storage when ready.
 */

export interface MasterAirline {
  code: string
  name: string
}

export const MASTER_AIRLINES: MasterAirline[] = [
  { code: 'TG',  name: 'Thai Airways International' },
  { code: 'FD',  name: 'Thai AirAsia' },
  { code: 'DD',  name: 'Nok Airlines' },
  { code: 'PG',  name: 'Bangkok Airways' },
  { code: 'VZ',  name: 'Thai VietJet Air' },
  { code: 'WE',  name: 'Thai Smile Airways' },
  { code: 'JL',  name: 'Japan Airlines' },
  { code: 'NH',  name: 'All Nippon Airways (ANA)' },
  { code: 'KE',  name: 'Korean Air' },
  { code: 'OZ',  name: 'Asiana Airlines' },
  { code: 'CX',  name: 'Cathay Pacific' },
  { code: 'SQ',  name: 'Singapore Airlines' },
  { code: 'MH',  name: 'Malaysia Airlines' },
  { code: 'EK',  name: 'Emirates' },
  { code: 'QR',  name: 'Qatar Airways' },
  { code: 'BA',  name: 'British Airways' },
  { code: 'LH',  name: 'Lufthansa' },
  { code: 'TK',  name: 'Turkish Airlines' },
  { code: 'AF',  name: 'Air France' },
  { code: 'KL',  name: 'KLM Royal Dutch Airlines' },
  { code: 'CI',  name: 'China Airlines' },
  { code: 'BR',  name: 'EVA Air' },
  { code: 'CA',  name: 'Air China' },
  { code: 'CZ',  name: 'China Southern Airlines' },
  { code: 'MU',  name: 'China Eastern Airlines' },
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
