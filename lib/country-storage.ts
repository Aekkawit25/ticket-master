const KEY = 'countries_data'

export interface CountryData {
  countryCode: string    // ISO Alpha-3, e.g. THA
  countryName: string    // Full English name, e.g. Thailand
  displayName: string    // Short/common name, e.g. Thailand, UAE, UK
  status: 'Active' | 'Inactive'
}

// ── Seed: world countries ISO 3166-1 Alpha-3 ──────────────────────────────────

export const SEED_COUNTRIES: Omit<CountryData, 'status'>[] = [
  // ── Southeast Asia ───────────────────────────────────────────────
  { countryCode: 'THA', countryName: 'Thailand',            displayName: 'Thailand' },
  { countryCode: 'MMR', countryName: 'Myanmar',             displayName: 'Myanmar' },
  { countryCode: 'VNM', countryName: 'Vietnam',             displayName: 'Vietnam' },
  { countryCode: 'KHM', countryName: 'Cambodia',            displayName: 'Cambodia' },
  { countryCode: 'LAO', countryName: 'Laos',                displayName: 'Laos' },
  { countryCode: 'MYS', countryName: 'Malaysia',            displayName: 'Malaysia' },
  { countryCode: 'SGP', countryName: 'Singapore',           displayName: 'Singapore' },
  { countryCode: 'IDN', countryName: 'Indonesia',           displayName: 'Indonesia' },
  { countryCode: 'PHL', countryName: 'Philippines',         displayName: 'Philippines' },
  { countryCode: 'BRN', countryName: 'Brunei',              displayName: 'Brunei' },
  { countryCode: 'TLS', countryName: 'Timor-Leste',         displayName: 'Timor-Leste' },
  // ── East Asia ────────────────────────────────────────────────────
  { countryCode: 'JPN', countryName: 'Japan',               displayName: 'Japan' },
  { countryCode: 'KOR', countryName: 'South Korea',         displayName: 'South Korea' },
  { countryCode: 'CHN', countryName: 'China',               displayName: 'China' },
  { countryCode: 'HKG', countryName: 'Hong Kong',           displayName: 'Hong Kong' },
  { countryCode: 'MAC', countryName: 'Macau',               displayName: 'Macau' },
  { countryCode: 'TWN', countryName: 'Taiwan',              displayName: 'Taiwan' },
  { countryCode: 'MNG', countryName: 'Mongolia',            displayName: 'Mongolia' },
  { countryCode: 'PRK', countryName: 'North Korea',         displayName: 'North Korea' },
  // ── South Asia ───────────────────────────────────────────────────
  { countryCode: 'IND', countryName: 'India',               displayName: 'India' },
  { countryCode: 'LKA', countryName: 'Sri Lanka',           displayName: 'Sri Lanka' },
  { countryCode: 'NPL', countryName: 'Nepal',               displayName: 'Nepal' },
  { countryCode: 'MDV', countryName: 'Maldives',            displayName: 'Maldives' },
  { countryCode: 'BGD', countryName: 'Bangladesh',          displayName: 'Bangladesh' },
  { countryCode: 'PAK', countryName: 'Pakistan',            displayName: 'Pakistan' },
  { countryCode: 'BTN', countryName: 'Bhutan',              displayName: 'Bhutan' },
  { countryCode: 'AFG', countryName: 'Afghanistan',         displayName: 'Afghanistan' },
  // ── Central Asia ─────────────────────────────────────────────────
  { countryCode: 'KAZ', countryName: 'Kazakhstan',          displayName: 'Kazakhstan' },
  { countryCode: 'UZB', countryName: 'Uzbekistan',          displayName: 'Uzbekistan' },
  { countryCode: 'TKM', countryName: 'Turkmenistan',        displayName: 'Turkmenistan' },
  { countryCode: 'KGZ', countryName: 'Kyrgyzstan',          displayName: 'Kyrgyzstan' },
  { countryCode: 'TJK', countryName: 'Tajikistan',          displayName: 'Tajikistan' },
  // ── Middle East ──────────────────────────────────────────────────
  { countryCode: 'ARE', countryName: 'United Arab Emirates',displayName: 'UAE' },
  { countryCode: 'SAU', countryName: 'Saudi Arabia',        displayName: 'Saudi Arabia' },
  { countryCode: 'QAT', countryName: 'Qatar',               displayName: 'Qatar' },
  { countryCode: 'KWT', countryName: 'Kuwait',              displayName: 'Kuwait' },
  { countryCode: 'BHR', countryName: 'Bahrain',             displayName: 'Bahrain' },
  { countryCode: 'OMN', countryName: 'Oman',                displayName: 'Oman' },
  { countryCode: 'IRQ', countryName: 'Iraq',                displayName: 'Iraq' },
  { countryCode: 'IRN', countryName: 'Iran',                displayName: 'Iran' },
  { countryCode: 'ISR', countryName: 'Israel',              displayName: 'Israel' },
  { countryCode: 'JOR', countryName: 'Jordan',              displayName: 'Jordan' },
  { countryCode: 'LBN', countryName: 'Lebanon',             displayName: 'Lebanon' },
  { countryCode: 'SYR', countryName: 'Syria',               displayName: 'Syria' },
  { countryCode: 'YEM', countryName: 'Yemen',               displayName: 'Yemen' },
  { countryCode: 'PSE', countryName: 'Palestine',           displayName: 'Palestine' },
  // ── Russia ────────────────────────────────────────────────────────
  { countryCode: 'RUS', countryName: 'Russia',              displayName: 'Russia' },
  // ── Europe ───────────────────────────────────────────────────────
  { countryCode: 'GBR', countryName: 'United Kingdom',      displayName: 'UK' },
  { countryCode: 'FRA', countryName: 'France',              displayName: 'France' },
  { countryCode: 'DEU', countryName: 'Germany',             displayName: 'Germany' },
  { countryCode: 'ITA', countryName: 'Italy',               displayName: 'Italy' },
  { countryCode: 'ESP', countryName: 'Spain',               displayName: 'Spain' },
  { countryCode: 'NLD', countryName: 'Netherlands',         displayName: 'Netherlands' },
  { countryCode: 'BEL', countryName: 'Belgium',             displayName: 'Belgium' },
  { countryCode: 'CHE', countryName: 'Switzerland',         displayName: 'Switzerland' },
  { countryCode: 'AUT', countryName: 'Austria',             displayName: 'Austria' },
  { countryCode: 'SWE', countryName: 'Sweden',              displayName: 'Sweden' },
  { countryCode: 'NOR', countryName: 'Norway',              displayName: 'Norway' },
  { countryCode: 'DNK', countryName: 'Denmark',             displayName: 'Denmark' },
  { countryCode: 'FIN', countryName: 'Finland',             displayName: 'Finland' },
  { countryCode: 'ISL', countryName: 'Iceland',             displayName: 'Iceland' },
  { countryCode: 'IRL', countryName: 'Ireland',             displayName: 'Ireland' },
  { countryCode: 'PRT', countryName: 'Portugal',            displayName: 'Portugal' },
  { countryCode: 'GRC', countryName: 'Greece',              displayName: 'Greece' },
  { countryCode: 'TUR', countryName: 'Turkey',              displayName: 'Turkey' },
  { countryCode: 'POL', countryName: 'Poland',              displayName: 'Poland' },
  { countryCode: 'CZE', countryName: 'Czech Republic',      displayName: 'Czech Republic' },
  { countryCode: 'SVK', countryName: 'Slovakia',            displayName: 'Slovakia' },
  { countryCode: 'HUN', countryName: 'Hungary',             displayName: 'Hungary' },
  { countryCode: 'ROU', countryName: 'Romania',             displayName: 'Romania' },
  { countryCode: 'BGR', countryName: 'Bulgaria',            displayName: 'Bulgaria' },
  { countryCode: 'HRV', countryName: 'Croatia',             displayName: 'Croatia' },
  { countryCode: 'SRB', countryName: 'Serbia',              displayName: 'Serbia' },
  { countryCode: 'SVN', countryName: 'Slovenia',            displayName: 'Slovenia' },
  { countryCode: 'BIH', countryName: 'Bosnia and Herzegovina', displayName: 'Bosnia' },
  { countryCode: 'MNE', countryName: 'Montenegro',          displayName: 'Montenegro' },
  { countryCode: 'MKD', countryName: 'North Macedonia',     displayName: 'North Macedonia' },
  { countryCode: 'ALB', countryName: 'Albania',             displayName: 'Albania' },
  { countryCode: 'UKR', countryName: 'Ukraine',             displayName: 'Ukraine' },
  { countryCode: 'BLR', countryName: 'Belarus',             displayName: 'Belarus' },
  { countryCode: 'MDA', countryName: 'Moldova',             displayName: 'Moldova' },
  { countryCode: 'LTU', countryName: 'Lithuania',           displayName: 'Lithuania' },
  { countryCode: 'LVA', countryName: 'Latvia',              displayName: 'Latvia' },
  { countryCode: 'EST', countryName: 'Estonia',             displayName: 'Estonia' },
  { countryCode: 'CYP', countryName: 'Cyprus',              displayName: 'Cyprus' },
  { countryCode: 'MLT', countryName: 'Malta',               displayName: 'Malta' },
  { countryCode: 'LUX', countryName: 'Luxembourg',          displayName: 'Luxembourg' },
  { countryCode: 'MCO', countryName: 'Monaco',              displayName: 'Monaco' },
  { countryCode: 'LIE', countryName: 'Liechtenstein',       displayName: 'Liechtenstein' },
  { countryCode: 'AND', countryName: 'Andorra',             displayName: 'Andorra' },
  { countryCode: 'SMR', countryName: 'San Marino',          displayName: 'San Marino' },
  { countryCode: 'GEO', countryName: 'Georgia',             displayName: 'Georgia' },
  { countryCode: 'ARM', countryName: 'Armenia',             displayName: 'Armenia' },
  { countryCode: 'AZE', countryName: 'Azerbaijan',          displayName: 'Azerbaijan' },
  { countryCode: 'KOS', countryName: 'Kosovo',              displayName: 'Kosovo' },
  // ── Oceania ──────────────────────────────────────────────────────
  { countryCode: 'AUS', countryName: 'Australia',           displayName: 'Australia' },
  { countryCode: 'NZL', countryName: 'New Zealand',         displayName: 'New Zealand' },
  { countryCode: 'FJI', countryName: 'Fiji',                displayName: 'Fiji' },
  { countryCode: 'PNG', countryName: 'Papua New Guinea',    displayName: 'Papua New Guinea' },
  { countryCode: 'SLB', countryName: 'Solomon Islands',     displayName: 'Solomon Islands' },
  { countryCode: 'VUT', countryName: 'Vanuatu',             displayName: 'Vanuatu' },
  { countryCode: 'WSM', countryName: 'Samoa',               displayName: 'Samoa' },
  { countryCode: 'TON', countryName: 'Tonga',               displayName: 'Tonga' },
  { countryCode: 'KIR', countryName: 'Kiribati',            displayName: 'Kiribati' },
  { countryCode: 'FSM', countryName: 'Micronesia',          displayName: 'Micronesia' },
  { countryCode: 'PLW', countryName: 'Palau',               displayName: 'Palau' },
  { countryCode: 'MHL', countryName: 'Marshall Islands',    displayName: 'Marshall Islands' },
  { countryCode: 'NRU', countryName: 'Nauru',               displayName: 'Nauru' },
  { countryCode: 'TUV', countryName: 'Tuvalu',              displayName: 'Tuvalu' },
  // ── Americas – North ─────────────────────────────────────────────
  { countryCode: 'USA', countryName: 'United States',       displayName: 'USA' },
  { countryCode: 'CAN', countryName: 'Canada',              displayName: 'Canada' },
  { countryCode: 'MEX', countryName: 'Mexico',              displayName: 'Mexico' },
  // ── Americas – Central ───────────────────────────────────────────
  { countryCode: 'GTM', countryName: 'Guatemala',           displayName: 'Guatemala' },
  { countryCode: 'BLZ', countryName: 'Belize',              displayName: 'Belize' },
  { countryCode: 'HND', countryName: 'Honduras',            displayName: 'Honduras' },
  { countryCode: 'SLV', countryName: 'El Salvador',         displayName: 'El Salvador' },
  { countryCode: 'NIC', countryName: 'Nicaragua',           displayName: 'Nicaragua' },
  { countryCode: 'CRI', countryName: 'Costa Rica',          displayName: 'Costa Rica' },
  { countryCode: 'PAN', countryName: 'Panama',              displayName: 'Panama' },
  // ── Caribbean ────────────────────────────────────────────────────
  { countryCode: 'CUB', countryName: 'Cuba',                displayName: 'Cuba' },
  { countryCode: 'JAM', countryName: 'Jamaica',             displayName: 'Jamaica' },
  { countryCode: 'HTI', countryName: 'Haiti',               displayName: 'Haiti' },
  { countryCode: 'DOM', countryName: 'Dominican Republic',  displayName: 'Dominican Republic' },
  { countryCode: 'TTO', countryName: 'Trinidad and Tobago', displayName: 'Trinidad & Tobago' },
  { countryCode: 'BRB', countryName: 'Barbados',            displayName: 'Barbados' },
  { countryCode: 'BHS', countryName: 'Bahamas',             displayName: 'Bahamas' },
  // ── Americas – South ─────────────────────────────────────────────
  { countryCode: 'COL', countryName: 'Colombia',            displayName: 'Colombia' },
  { countryCode: 'VEN', countryName: 'Venezuela',           displayName: 'Venezuela' },
  { countryCode: 'GUY', countryName: 'Guyana',              displayName: 'Guyana' },
  { countryCode: 'SUR', countryName: 'Suriname',            displayName: 'Suriname' },
  { countryCode: 'BRA', countryName: 'Brazil',              displayName: 'Brazil' },
  { countryCode: 'PER', countryName: 'Peru',                displayName: 'Peru' },
  { countryCode: 'ECU', countryName: 'Ecuador',             displayName: 'Ecuador' },
  { countryCode: 'BOL', countryName: 'Bolivia',             displayName: 'Bolivia' },
  { countryCode: 'PRY', countryName: 'Paraguay',            displayName: 'Paraguay' },
  { countryCode: 'URY', countryName: 'Uruguay',             displayName: 'Uruguay' },
  { countryCode: 'ARG', countryName: 'Argentina',           displayName: 'Argentina' },
  { countryCode: 'CHL', countryName: 'Chile',               displayName: 'Chile' },
  // ── Africa – North ───────────────────────────────────────────────
  { countryCode: 'EGY', countryName: 'Egypt',               displayName: 'Egypt' },
  { countryCode: 'LBY', countryName: 'Libya',               displayName: 'Libya' },
  { countryCode: 'TUN', countryName: 'Tunisia',             displayName: 'Tunisia' },
  { countryCode: 'DZA', countryName: 'Algeria',             displayName: 'Algeria' },
  { countryCode: 'MAR', countryName: 'Morocco',             displayName: 'Morocco' },
  { countryCode: 'SDN', countryName: 'Sudan',               displayName: 'Sudan' },
  { countryCode: 'SSD', countryName: 'South Sudan',         displayName: 'South Sudan' },
  // ── Africa – East ────────────────────────────────────────────────
  { countryCode: 'ETH', countryName: 'Ethiopia',            displayName: 'Ethiopia' },
  { countryCode: 'KEN', countryName: 'Kenya',               displayName: 'Kenya' },
  { countryCode: 'TZA', countryName: 'Tanzania',            displayName: 'Tanzania' },
  { countryCode: 'UGA', countryName: 'Uganda',              displayName: 'Uganda' },
  { countryCode: 'RWA', countryName: 'Rwanda',              displayName: 'Rwanda' },
  { countryCode: 'BDI', countryName: 'Burundi',             displayName: 'Burundi' },
  { countryCode: 'MOZ', countryName: 'Mozambique',          displayName: 'Mozambique' },
  { countryCode: 'ZMB', countryName: 'Zambia',              displayName: 'Zambia' },
  { countryCode: 'ZWE', countryName: 'Zimbabwe',            displayName: 'Zimbabwe' },
  { countryCode: 'MWI', countryName: 'Malawi',              displayName: 'Malawi' },
  { countryCode: 'MDG', countryName: 'Madagascar',          displayName: 'Madagascar' },
  { countryCode: 'MUS', countryName: 'Mauritius',           displayName: 'Mauritius' },
  { countryCode: 'SOM', countryName: 'Somalia',             displayName: 'Somalia' },
  { countryCode: 'DJI', countryName: 'Djibouti',            displayName: 'Djibouti' },
  { countryCode: 'ERI', countryName: 'Eritrea',             displayName: 'Eritrea' },
  // ── Africa – West ────────────────────────────────────────────────
  { countryCode: 'NGA', countryName: 'Nigeria',             displayName: 'Nigeria' },
  { countryCode: 'GHA', countryName: 'Ghana',               displayName: 'Ghana' },
  { countryCode: 'SEN', countryName: 'Senegal',             displayName: 'Senegal' },
  { countryCode: 'CIV', countryName: "Côte d'Ivoire",       displayName: "Ivory Coast" },
  { countryCode: 'CMR', countryName: 'Cameroon',            displayName: 'Cameroon' },
  { countryCode: 'GIN', countryName: 'Guinea',              displayName: 'Guinea' },
  { countryCode: 'MLI', countryName: 'Mali',                displayName: 'Mali' },
  { countryCode: 'BFA', countryName: 'Burkina Faso',        displayName: 'Burkina Faso' },
  { countryCode: 'NER', countryName: 'Niger',               displayName: 'Niger' },
  { countryCode: 'TGO', countryName: 'Togo',                displayName: 'Togo' },
  { countryCode: 'BEN', countryName: 'Benin',               displayName: 'Benin' },
  { countryCode: 'LBR', countryName: 'Liberia',             displayName: 'Liberia' },
  { countryCode: 'SLE', countryName: 'Sierra Leone',        displayName: 'Sierra Leone' },
  { countryCode: 'GNB', countryName: 'Guinea-Bissau',       displayName: 'Guinea-Bissau' },
  { countryCode: 'GMB', countryName: 'Gambia',              displayName: 'Gambia' },
  { countryCode: 'MRT', countryName: 'Mauritania',          displayName: 'Mauritania' },
  { countryCode: 'CPV', countryName: 'Cape Verde',          displayName: 'Cape Verde' },
  // ── Africa – Central ─────────────────────────────────────────────
  { countryCode: 'COD', countryName: 'DR Congo',            displayName: 'DR Congo' },
  { countryCode: 'COG', countryName: 'Republic of Congo',   displayName: 'Congo' },
  { countryCode: 'CAF', countryName: 'Central African Republic', displayName: 'CAR' },
  { countryCode: 'GAB', countryName: 'Gabon',               displayName: 'Gabon' },
  { countryCode: 'GNQ', countryName: 'Equatorial Guinea',   displayName: 'Equatorial Guinea' },
  { countryCode: 'STP', countryName: 'São Tomé and Príncipe', displayName: 'São Tomé' },
  { countryCode: 'TCD', countryName: 'Chad',                displayName: 'Chad' },
  // ── Africa – Southern ────────────────────────────────────────────
  { countryCode: 'ZAF', countryName: 'South Africa',        displayName: 'South Africa' },
  { countryCode: 'NAM', countryName: 'Namibia',             displayName: 'Namibia' },
  { countryCode: 'BWA', countryName: 'Botswana',            displayName: 'Botswana' },
  { countryCode: 'SWZ', countryName: 'Eswatini',            displayName: 'Eswatini' },
  { countryCode: 'LSO', countryName: 'Lesotho',             displayName: 'Lesotho' },
  { countryCode: 'AGO', countryName: 'Angola',              displayName: 'Angola' },
]

function seed(): CountryData[] {
  return SEED_COUNTRIES.map(c => ({ ...c, status: 'Active' as const }))
}

export function getCountries(): CountryData[] {
  if (typeof window === 'undefined') return seed()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return seed()
    const stored: CountryData[] = JSON.parse(raw)
    const codes = new Set(stored.map(c => c.countryCode))
    const fresh = SEED_COUNTRIES
      .filter(c => !codes.has(c.countryCode))
      .map(c => ({ ...c, status: 'Active' as const }))
    return [...stored, ...fresh]
  } catch { return seed() }
}

export function saveCountries(countries: CountryData[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(countries))
  window.dispatchEvent(new Event('countries_updated'))
}

export function getActiveCountries(): CountryData[] {
  return getCountries().filter(c => c.status === 'Active')
}

export function getCountryByCode(code: string): CountryData | undefined {
  if (!code) return undefined
  return getCountries().find(c => c.countryCode === code.toUpperCase())
}

export function getCountryName(code: string): string {
  const c = getCountryByCode(code)
  return c?.displayName ?? c?.countryName ?? code
}
