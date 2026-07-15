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

// ── Airports ───────────────────────────────────────────────────────────────────

export interface MasterAirport {
  code: string        // IATA 3-letter code
  name: string        // Full airport name
  city: string        // City
  countryCode: string // ISO Alpha-3 country code, e.g. THA, JPN
}

export const MASTER_AIRPORTS: MasterAirport[] = [
  // ── Thailand ──────────────────────────────────────────────────
  { code: 'BKK', name: 'Suvarnabhumi Airport',                          city: 'Bangkok',           countryCode: 'THA' },
  { code: 'DMK', name: 'Don Mueang International Airport',              city: 'Bangkok',           countryCode: 'THA' },
  { code: 'CNX', name: 'Chiang Mai International Airport',              city: 'Chiang Mai',        countryCode: 'THA' },
  { code: 'HKT', name: 'Phuket International Airport',                  city: 'Phuket',            countryCode: 'THA' },
  { code: 'USM', name: 'Samui Airport',                                 city: 'Koh Samui',         countryCode: 'THA' },
  { code: 'KBV', name: 'Krabi International Airport',                   city: 'Krabi',             countryCode: 'THA' },
  // ── Japan ─────────────────────────────────────────────────────
  { code: 'NRT', name: 'Narita International Airport',                  city: 'Tokyo',             countryCode: 'JPN' },
  { code: 'HND', name: 'Haneda Airport',                                city: 'Tokyo',             countryCode: 'JPN' },
  { code: 'KIX', name: 'Kansai International Airport',                  city: 'Osaka',             countryCode: 'JPN' },
  { code: 'ITM', name: 'Itami Airport',                                 city: 'Osaka',             countryCode: 'JPN' },
  { code: 'CTS', name: 'New Chitose Airport',                           city: 'Sapporo',           countryCode: 'JPN' },
  { code: 'FUK', name: 'Fukuoka Airport',                               city: 'Fukuoka',           countryCode: 'JPN' },
  { code: 'OKA', name: 'Naha Airport',                                  city: 'Okinawa',           countryCode: 'JPN' },
  { code: 'NGO', name: 'Chubu Centrair International Airport',          city: 'Nagoya',            countryCode: 'JPN' },
  { code: 'SDJ', name: 'Sendai Airport',                                city: 'Sendai',            countryCode: 'JPN' },
  { code: 'HIJ', name: 'Hiroshima Airport',                             city: 'Hiroshima',         countryCode: 'JPN' },
  { code: 'KOJ', name: 'Kagoshima Airport',                             city: 'Kagoshima',         countryCode: 'JPN' },
  { code: 'TAK', name: 'Takamatsu Airport',                             city: 'Takamatsu',         countryCode: 'JPN' },
  { code: 'KIJ', name: 'Niigata Airport',                               city: 'Niigata',           countryCode: 'JPN' },
  { code: 'AOJ', name: 'Aomori Airport',                                city: 'Aomori',            countryCode: 'JPN' },
  // ── South Korea ────────────────────────────────────────────────
  { code: 'ICN', name: 'Incheon International Airport',                 city: 'Seoul',             countryCode: 'KOR' },
  { code: 'GMP', name: 'Gimpo International Airport',                   city: 'Seoul',             countryCode: 'KOR' },
  { code: 'PUS', name: 'Gimhae International Airport',                  city: 'Busan',             countryCode: 'KOR' },
  { code: 'CJU', name: 'Jeju International Airport',                    city: 'Jeju',              countryCode: 'KOR' },
  // ── China ─────────────────────────────────────────────────────
  { code: 'PEK', name: 'Beijing Capital International Airport',         city: 'Beijing',           countryCode: 'CHN' },
  { code: 'PKX', name: 'Beijing Daxing International Airport',          city: 'Beijing',           countryCode: 'CHN' },
  { code: 'PVG', name: 'Shanghai Pudong International Airport',         city: 'Shanghai',          countryCode: 'CHN' },
  { code: 'SHA', name: 'Shanghai Hongqiao International Airport',       city: 'Shanghai',          countryCode: 'CHN' },
  { code: 'CAN', name: 'Guangzhou Baiyun International Airport',        city: 'Guangzhou',         countryCode: 'CHN' },
  { code: 'CTU', name: 'Chengdu Shuangliu International Airport',       city: 'Chengdu',           countryCode: 'CHN' },
  { code: 'TFU', name: 'Chengdu Tianfu International Airport',          city: 'Chengdu',           countryCode: 'CHN' },
  { code: 'KMG', name: 'Kunming Changshui International Airport',       city: 'Kunming',           countryCode: 'CHN' },
  { code: 'CSX', name: 'Changsha Huanghua International Airport',       city: 'Changsha',          countryCode: 'CHN' },
  { code: 'XIY', name: "Xi'an Xianyang International Airport",          city: "Xi'an",             countryCode: 'CHN' },
  { code: 'WUH', name: 'Wuhan Tianhe International Airport',            city: 'Wuhan',             countryCode: 'CHN' },
  { code: 'NKG', name: 'Nanjing Lukou International Airport',           city: 'Nanjing',           countryCode: 'CHN' },
  { code: 'SZX', name: "Shenzhen Bao'an International Airport",         city: 'Shenzhen',          countryCode: 'CHN' },
  { code: 'HGH', name: 'Hangzhou Xiaoshan International Airport',       city: 'Hangzhou',          countryCode: 'CHN' },
  { code: 'TAO', name: 'Qingdao Jiaodong International Airport',        city: 'Qingdao',           countryCode: 'CHN' },
  { code: 'DLC', name: 'Dalian Zhoushuizi International Airport',       city: 'Dalian',            countryCode: 'CHN' },
  { code: 'NNG', name: 'Nanning Wuxu International Airport',            city: 'Nanning',           countryCode: 'CHN' },
  { code: 'SYX', name: 'Sanya Phoenix International Airport',           city: 'Sanya',             countryCode: 'CHN' },
  { code: 'URC', name: 'Urumqi Diwopu International Airport',           city: 'Urumqi',            countryCode: 'CHN' },
  { code: 'SHE', name: 'Shenyang Taoxian International Airport',        city: 'Shenyang',          countryCode: 'CHN' },
  // ── Hong Kong / Macau / Taiwan ────────────────────────────────
  { code: 'HKG', name: 'Hong Kong International Airport',               city: 'Hong Kong',         countryCode: 'HKG' },
  { code: 'MFM', name: 'Macau International Airport',                   city: 'Macau',             countryCode: 'MAC' },
  { code: 'TPE', name: 'Taiwan Taoyuan International Airport',          city: 'Taipei',            countryCode: 'TWN' },
  { code: 'TSA', name: 'Taipei Songshan Airport',                       city: 'Taipei',            countryCode: 'TWN' },
  { code: 'KHH', name: 'Kaohsiung International Airport',               city: 'Kaohsiung',         countryCode: 'TWN' },
  // ── Southeast Asia ────────────────────────────────────────────
  { code: 'SIN', name: 'Singapore Changi Airport',                      city: 'Singapore',         countryCode: 'SGP' },
  { code: 'KUL', name: 'Kuala Lumpur International Airport',            city: 'Kuala Lumpur',      countryCode: 'MYS' },
  { code: 'BKI', name: 'Kota Kinabalu International Airport',           city: 'Kota Kinabalu',     countryCode: 'MYS' },
  { code: 'KCH', name: 'Kuching International Airport',                 city: 'Kuching',           countryCode: 'MYS' },
  { code: 'MNL', name: 'Ninoy Aquino International Airport',            city: 'Manila',            countryCode: 'PHL' },
  { code: 'CEB', name: 'Mactan-Cebu International Airport',             city: 'Cebu',              countryCode: 'PHL' },
  { code: 'CGK', name: 'Soekarno-Hatta International Airport',          city: 'Jakarta',           countryCode: 'IDN' },
  { code: 'DPS', name: 'Ngurah Rai International Airport',              city: 'Bali',              countryCode: 'IDN' },
  { code: 'SUB', name: 'Juanda International Airport',                  city: 'Surabaya',          countryCode: 'IDN' },
  { code: 'SGN', name: 'Tan Son Nhat International Airport',            city: 'Ho Chi Minh City',  countryCode: 'VNM' },
  { code: 'HAN', name: 'Noi Bai International Airport',                 city: 'Hanoi',             countryCode: 'VNM' },
  { code: 'DAD', name: 'Da Nang International Airport',                 city: 'Da Nang',           countryCode: 'VNM' },
  { code: 'PQC', name: 'Phu Quoc International Airport',                city: 'Phu Quoc',          countryCode: 'VNM' },
  { code: 'CXR', name: 'Cam Ranh International Airport',                city: 'Nha Trang',         countryCode: 'VNM' },
  { code: 'VTE', name: 'Wattay International Airport',                  city: 'Vientiane',         countryCode: 'LAO' },
  { code: 'REP', name: 'Siem Reap International Airport',               city: 'Siem Reap',         countryCode: 'KHM' },
  { code: 'PNH', name: 'Phnom Penh International Airport',              city: 'Phnom Penh',        countryCode: 'KHM' },
  { code: 'RGN', name: 'Yangon International Airport',                  city: 'Yangon',            countryCode: 'MMR' },
  // ── South Asia ────────────────────────────────────────────────
  { code: 'DEL', name: 'Indira Gandhi International Airport',           city: 'New Delhi',         countryCode: 'IND' },
  { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj Intl Airport',      city: 'Mumbai',            countryCode: 'IND' },
  { code: 'CMB', name: 'Bandaranaike International Airport',            city: 'Colombo',           countryCode: 'LKA' },
  { code: 'KTM', name: 'Tribhuvan International Airport',               city: 'Kathmandu',         countryCode: 'NPL' },
  { code: 'MLE', name: 'Velana International Airport',                  city: 'Malé',              countryCode: 'MDV' },
  // ── Middle East ───────────────────────────────────────────────
  { code: 'DXB', name: 'Dubai International Airport',                   city: 'Dubai',             countryCode: 'ARE' },
  { code: 'AUH', name: 'Abu Dhabi International Airport',               city: 'Abu Dhabi',         countryCode: 'ARE' },
  { code: 'DOH', name: 'Hamad International Airport',                   city: 'Doha',              countryCode: 'QAT' },
  { code: 'KWI', name: 'Kuwait International Airport',                  city: 'Kuwait City',       countryCode: 'KWT' },
  { code: 'RUH', name: 'King Khalid International Airport',             city: 'Riyadh',            countryCode: 'SAU' },
  { code: 'JED', name: 'King Abdulaziz International Airport',          city: 'Jeddah',            countryCode: 'SAU' },
  { code: 'MCT', name: 'Muscat International Airport',                  city: 'Muscat',            countryCode: 'OMN' },
  { code: 'BAH', name: 'Bahrain International Airport',                 city: 'Manama',            countryCode: 'BHR' },
  { code: 'CAI', name: 'Cairo International Airport',                   city: 'Cairo',             countryCode: 'EGY' },
  { code: 'AMM', name: 'Queen Alia International Airport',              city: 'Amman',             countryCode: 'JOR' },
  // ── Central Asia / Caucasus / Russia / Mongolia ──────────────
  { code: 'ALA', name: 'Almaty International Airport',                  city: 'Almaty',            countryCode: 'KAZ' },
  { code: 'ULN', name: 'Chinggis Khaan International Airport',          city: 'Ulaanbaatar',       countryCode: 'MNG' },
  { code: 'SVO', name: 'Sheremetyevo International Airport',            city: 'Moscow',            countryCode: 'RUS' },
  // ── Georgia ───────────────────────────────────────────────────
  { code: 'TBS', name: 'Tbilisi International Airport',                 city: 'Tbilisi',           countryCode: 'GEO' },
  { code: 'BUS', name: 'Batumi International Airport',                  city: 'Batumi',            countryCode: 'GEO' },
  { code: 'KUT', name: 'David the Builder Kutaisi International Airport', city: 'Kutaisi',         countryCode: 'GEO' },
  // ── Europe ────────────────────────────────────────────────────
  { code: 'LHR', name: 'London Heathrow Airport',                       city: 'London',            countryCode: 'GBR' },
  { code: 'CDG', name: 'Paris Charles de Gaulle Airport',               city: 'Paris',             countryCode: 'FRA' },
  { code: 'AMS', name: 'Amsterdam Schiphol Airport',                    city: 'Amsterdam',         countryCode: 'NLD' },
  { code: 'FRA', name: 'Frankfurt Airport',                             city: 'Frankfurt',         countryCode: 'DEU' },
  { code: 'MUC', name: 'Munich Airport',                                city: 'Munich',            countryCode: 'DEU' },
  { code: 'VIE', name: 'Vienna International Airport',                  city: 'Vienna',            countryCode: 'AUT' },
  { code: 'ZRH', name: 'Zurich Airport',                                city: 'Zurich',            countryCode: 'CHE' },
  { code: 'FCO', name: 'Leonardo da Vinci International Airport',       city: 'Rome',              countryCode: 'ITA' },
  { code: 'MXP', name: 'Milan Malpensa Airport',                        city: 'Milan',             countryCode: 'ITA' },
  { code: 'BCN', name: 'Barcelona El Prat Airport',                     city: 'Barcelona',         countryCode: 'ESP' },
  { code: 'MAD', name: 'Adolfo Suárez Madrid-Barajas Airport',          city: 'Madrid',            countryCode: 'ESP' },
  { code: 'IST', name: 'Istanbul Airport',                              city: 'Istanbul',          countryCode: 'TUR' },
  { code: 'SAW', name: 'Sabiha Gökçen International Airport',           city: 'Istanbul',          countryCode: 'TUR' },
  // ── Oceania ───────────────────────────────────────────────────
  { code: 'SYD', name: 'Sydney Kingsford Smith Airport',                city: 'Sydney',            countryCode: 'AUS' },
  { code: 'MEL', name: 'Melbourne Airport',                             city: 'Melbourne',         countryCode: 'AUS' },
  { code: 'BNE', name: 'Brisbane Airport',                              city: 'Brisbane',          countryCode: 'AUS' },
  { code: 'PER', name: 'Perth Airport',                                 city: 'Perth',             countryCode: 'AUS' },
  { code: 'AKL', name: 'Auckland Airport',                              city: 'Auckland',          countryCode: 'NZL' },
  // ── Americas ──────────────────────────────────────────────────
  { code: 'LAX', name: 'Los Angeles International Airport',             city: 'Los Angeles',       countryCode: 'USA' },
  { code: 'SFO', name: 'San Francisco International Airport',           city: 'San Francisco',     countryCode: 'USA' },
  { code: 'JFK', name: 'John F. Kennedy International Airport',         city: 'New York',          countryCode: 'USA' },
  { code: 'HNL', name: 'Daniel K. Inouye International Airport',        city: 'Honolulu',          countryCode: 'USA' },
  { code: 'SEA', name: 'Seattle-Tacoma International Airport',          city: 'Seattle',           countryCode: 'USA' },
]

export function getAirportLabel(code: string): string {
  const a = MASTER_AIRPORTS.find(x => x.code === code)
  return a ? `${a.code} — ${a.name} (${a.city}, ${a.countryCode})` : code
}

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

export const MASTER_AIRLINE_CODES: readonly string[] = MASTER_AIRLINES.map(a => a.code)
export const MASTER_AIRLINE_CODE_SET: ReadonlySet<string> = new Set(MASTER_AIRLINE_CODES)
