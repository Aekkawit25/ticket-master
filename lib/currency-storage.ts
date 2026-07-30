const KEY = 'currencies_master_data'

export interface CurrencyData {
  currencyCode: string    // ISO 4217 Alpha-3, e.g. THB
  numericCode: string     // ISO 4217 numeric 3-digit, e.g. 764
  currencyName: string    // Full English name, e.g. Thai Baht
  displayName?: string    // Local/display name, e.g. บาทไทย
  symbol: string          // e.g. ฿
  decimalPlaces: number   // 0, 2, 3 per ISO minor unit
  isDefault: boolean      // only 1 can be true
  isCommon: boolean       // show in common-first dropdown
  status: 'ACTIVE' | 'INACTIVE'
}

// ── Seed: ISO 4217 Current Currencies & Funds ─────────────────────────────────
// Format: [code, numeric, name, symbol, decimal, isCommon]
// Source: ISO 4217 Maintenance Agency / SIX Group List One

const COMMON_CODES = new Set([
  'THB','USD','JPY','KRW','CNY','TWD','HKD','SGD','MYR','VND',
  'EUR','GBP','AUD','AED',
])

type SeedRow = [string, string, string, string, number, string?]

const SEED_ROWS: SeedRow[] = [
  // ── Southeast Asia ──────────────────────────────────────────────────────────
  ['THB', '764', 'Thai Baht',                    '฿',    2, 'บาทไทย'],
  ['VND', '704', 'Vietnamese Dong',               '₫',    0, 'ดองเวียดนาม'],
  ['IDR', '360', 'Indonesian Rupiah',             'Rp',   2],
  ['PHP', '608', 'Philippine Peso',               '₱',   2],
  ['MYR', '458', 'Malaysian Ringgit',             'RM',   2, 'ริงกิตมาเลเซีย'],
  ['SGD', '702', 'Singapore Dollar',              'S$',   2, 'ดอลลาร์สิงคโปร์'],
  ['BND', '096', 'Brunei Dollar',                 '$',    2],
  ['KHR', '116', 'Cambodian Riel',                '៛',    2],
  ['LAK', '418', 'Lao Kip',                       '₭',    2],
  ['MMK', '104', 'Myanmar Kyat',                  'K',    2],
  // ── East Asia ───────────────────────────────────────────────────────────────
  ['JPY', '392', 'Japanese Yen',                  '¥',    0, 'เยนญี่ปุ่น'],
  ['KRW', '410', 'South Korean Won',              '₩',    0, 'วอนเกาหลีใต้'],
  ['CNY', '156', 'Chinese Renminbi',              '¥',    2, 'หยวนจีน'],
  ['TWD', '901', 'New Taiwan Dollar',             'NT$',  2, 'ดอลลาร์ไต้หวัน'],
  ['HKD', '344', 'Hong Kong Dollar',              'HK$',  2, 'ดอลลาร์ฮ่องกง'],
  ['MOP', '446', 'Macanese Pataca',               'P',    2],
  ['MNT', '496', 'Mongolian Tögrög',              '₮',    2],
  // ── South Asia ──────────────────────────────────────────────────────────────
  ['INR', '356', 'Indian Rupee',                  '₹',    2],
  ['LKR', '144', 'Sri Lankan Rupee',              '₨',    2],
  ['NPR', '524', 'Nepalese Rupee',                '₨',    2],
  ['BDT', '050', 'Bangladeshi Taka',              '৳',   2],
  ['PKR', '586', 'Pakistani Rupee',               '₨',    2],
  ['MVR', '462', 'Maldivian Rufiyaa',             'Rf',   2],
  ['BTN', '064', 'Bhutanese Ngultrum',            'Nu',   2],
  ['AFN', '971', 'Afghan Afghani',                '؋',   2],
  // ── Central Asia ────────────────────────────────────────────────────────────
  ['KZT', '398', 'Kazakhstani Tenge',             '₸',    2],
  ['UZS', '860', 'Uzbekistani Sum',               'сум',  2],
  ['TJS', '972', 'Tajikistani Somoni',             'SM',   2],
  ['KGS', '417', 'Kyrgyzstani Som',               'с',    2],
  ['TMT', '934', 'Turkmenistan Manat',             'T',    2],
  // ── Middle East ─────────────────────────────────────────────────────────────
  ['AED', '784', 'UAE Dirham',                    'د.إ',  2, 'ดิรฮัมสหรัฐอาหรับเอมิเรตส์'],
  ['SAR', '682', 'Saudi Riyal',                   'ر.س',  2],
  ['QAR', '634', 'Qatari Riyal',                  'ر.ق',  2],
  ['KWD', '414', 'Kuwaiti Dinar',                 'د.ك',  3],
  ['BHD', '048', 'Bahraini Dinar',                '.د.ب', 3],
  ['OMR', '512', 'Omani Rial',                    'ر.ع.', 3],
  ['JOD', '400', 'Jordanian Dinar',               'د.ا',  3],
  ['ILS', '376', 'Israeli New Shekel',             '₪',    2],
  ['IRR', '364', 'Iranian Rial',                  '﷼',    2],
  ['IQD', '368', 'Iraqi Dinar',                   'ع.د',  3],
  ['LBP', '422', 'Lebanese Pound',                'ل.ل',  2],
  ['SYP', '760', 'Syrian Pound',                  '£',    2],
  ['YER', '886', 'Yemeni Rial',                   '﷼',    2],
  // ── Europe ──────────────────────────────────────────────────────────────────
  ['EUR', '978', 'Euro',                          '€',    2, 'ยูโร'],
  ['GBP', '826', 'Pound Sterling',                '£',    2, 'ปอนด์สเตอร์ลิง'],
  ['CHF', '756', 'Swiss Franc',                   'Fr',   2],
  ['NOK', '578', 'Norwegian Krone',               'kr',   2],
  ['SEK', '752', 'Swedish Krona',                 'kr',   2],
  ['DKK', '208', 'Danish Krone',                  'kr',   2],
  ['ISK', '352', 'Icelandic Króna',               'kr',   0],
  ['PLN', '985', 'Polish Złoty',                  'zł',   2],
  ['CZK', '203', 'Czech Koruna',                  'Kč',   2],
  ['HUF', '348', 'Hungarian Forint',              'Ft',   2],
  ['RON', '946', 'Romanian Leu',                  'lei',  2],
  ['BGN', '975', 'Bulgarian Lev',                 'лв',   2],
  ['HRK', '191', 'Croatian Kuna',                 'kn',   2],
  ['RSD', '941', 'Serbian Dinar',                 'din',  2],
  ['MKD', '807', 'Macedonian Denar',              'ден',  2],
  ['ALL', '008', 'Albanian Lek',                  'L',    2],
  ['BAM', '977', 'Bosnia-Herzegovina Mark',       'KM',   2],
  ['MDL', '498', 'Moldovan Leu',                  'L',    2],
  ['UAH', '980', 'Ukrainian Hryvnia',             '₴',    2],
  ['BYN', '933', 'Belarusian Ruble',              'Br',   2],
  ['GEL', '981', 'Georgian Lari',                 '₾',    2],
  ['AMD', '051', 'Armenian Dram',                 '֏',    2],
  ['AZN', '944', 'Azerbaijani Manat',             '₼',    2],
  ['TRY', '949', 'Turkish Lira',                  '₺',    2],
  ['RUB', '643', 'Russian Ruble',                 '₽',    2],
  // ── Africa ──────────────────────────────────────────────────────────────────
  ['ZAR', '710', 'South African Rand',            'R',    2],
  ['EGP', '818', 'Egyptian Pound',                '£',    2],
  ['NGN', '566', 'Nigerian Naira',                '₦',    2],
  ['KES', '404', 'Kenyan Shilling',               'KSh',  2],
  ['GHS', '936', 'Ghanaian Cedi',                 '₵',    2],
  ['ETB', '230', 'Ethiopian Birr',                'Br',   2],
  ['TZS', '834', 'Tanzanian Shilling',            'Sh',   2],
  ['UGX', '800', 'Ugandan Shilling',              'Sh',   0],
  ['XAF', '950', 'Central African CFA Franc',     'Fr',   0],
  ['XOF', '952', 'West African CFA Franc',        'Fr',   0],
  ['MAD', '504', 'Moroccan Dirham',               'MAD',  2],
  ['DZD', '012', 'Algerian Dinar',                'د.ج',  2],
  ['TND', '788', 'Tunisian Dinar',                'د.ت',  3],
  ['LYD', '434', 'Libyan Dinar',                  'ل.د',  3],
  ['SDG', '938', 'Sudanese Pound',                'ج.س.', 2],
  ['RWF', '646', 'Rwandan Franc',                 'Fr',   0],
  ['BIF', '108', 'Burundian Franc',               'Fr',   0],
  ['MGA', '969', 'Malagasy Ariary',               'Ar',   2],
  ['MWK', '454', 'Malawian Kwacha',               'MK',   2],
  ['ZMW', '967', 'Zambian Kwacha',                'ZK',   2],
  ['BWP', '072', 'Botswana Pula',                 'P',    2],
  ['NAD', '516', 'Namibian Dollar',               '$',    2],
  ['AOA', '973', 'Angolan Kwanza',                'Kz',   2],
  ['MZN', '943', 'Mozambican Metical',            'MT',   2],
  ['SZL', '748', 'Swazi Lilangeni',               'L',    2],
  ['LSL', '426', 'Lesotho Loti',                  'L',    2],
  ['GMD', '270', 'Gambian Dalasi',                'D',    2],
  ['SLE', '925', 'Sierra Leonean Leone',          'Le',   2],
  ['LRD', '430', 'Liberian Dollar',               '$',    2],
  ['GNF', '324', 'Guinean Franc',                 'Fr',   0],
  ['CVE', '132', 'Cape Verdean Escudo',           '$',    2],
  ['DJF', '262', 'Djiboutian Franc',              'Fr',   0],
  ['KMF', '174', 'Comorian Franc',                'Fr',   0],
  ['SCR', '690', 'Seychellois Rupee',             '₨',    2],
  ['MUR', '480', 'Mauritian Rupee',               '₨',    2],
  ['SOS', '706', 'Somali Shilling',               'Sh',   2],
  ['SSP', '728', 'South Sudanese Pound',          '£',    2],
  ['MRU', '929', 'Mauritanian Ouguiya',           'UM',   2],
  ['ERN', '232', 'Eritrean Nakfa',                'Nfk',  2],
  ['STN', '930', 'São Tomé & Príncipe Dobra',     'Db',   2],
  ['XPF', '953', 'CFP Franc',                     'Fr',   0],
  // ── Americas ────────────────────────────────────────────────────────────────
  ['USD', '840', 'US Dollar',                     '$',    2, 'ดอลลาร์สหรัฐ'],
  ['CAD', '124', 'Canadian Dollar',               'CA$',  2],
  ['MXN', '484', 'Mexican Peso',                  '$',    2],
  ['BRL', '986', 'Brazilian Real',                'R$',   2],
  ['ARS', '032', 'Argentine Peso',                '$',    2],
  ['CLP', '152', 'Chilean Peso',                  '$',    0],
  ['COP', '170', 'Colombian Peso',                '$',    2],
  ['PEN', '604', 'Peruvian Sol',                  'S/',   2],
  ['UYU', '858', 'Uruguayan Peso',                '$',    2],
  ['PYG', '600', 'Paraguayan Guaraní',            '₲',    0],
  ['BOB', '068', 'Bolivian Boliviano',            'Bs.',  2],
  ['VES', '928', 'Venezuelan Bolívar Soberano',   'Bs.S', 2],
  ['NIO', '558', 'Nicaraguan Córdoba',            'C$',   2],
  ['CRC', '188', 'Costa Rican Colón',             '₡',   2],
  ['GTQ', '320', 'Guatemalan Quetzal',            'Q',    2],
  ['HNL', '340', 'Honduran Lempira',              'L',    2],
  ['PAB', '590', 'Panamanian Balboa',             'B/.',  2],
  ['DOP', '214', 'Dominican Peso',                '$',    2],
  ['HTG', '332', 'Haitian Gourde',                'G',    2],
  ['JMD', '388', 'Jamaican Dollar',               '$',    2],
  ['TTD', '780', 'Trinidad & Tobago Dollar',      '$',    2],
  ['BBD', '052', 'Barbadian Dollar',              '$',    2],
  ['BSD', '044', 'Bahamian Dollar',               '$',    2],
  ['BZD', '084', 'Belize Dollar',                 '$',    2],
  ['SRD', '968', 'Surinamese Dollar',             '$',    2],
  ['GYD', '328', 'Guyanese Dollar',               '$',    2],
  ['AWG', '533', 'Aruban Florin',                 'ƒ',    2],
  ['ANG', '532', 'Netherlands Antillean Guilder', 'ƒ',    2],
  ['KYD', '136', 'Cayman Islands Dollar',         '$',    2],
  ['XCD', '951', 'East Caribbean Dollar',         '$',    2],
  ['BMD', '060', 'Bermudian Dollar',              '$',    2],
  ['CUP', '192', 'Cuban Peso',                    '$',    2],
  ['SVC', '222', 'Salvadoran Colón',              '₡',   2],
  // ── Oceania ─────────────────────────────────────────────────────────────────
  ['AUD', '036', 'Australian Dollar',             'A$',   2, 'ดอลลาร์ออสเตรเลีย'],
  ['NZD', '554', 'New Zealand Dollar',            'NZ$',  2],
  ['PGK', '598', 'Papua New Guinean Kina',        'K',    2],
  ['FJD', '242', 'Fijian Dollar',                 '$',    2],
  ['SBD', '090', 'Solomon Islands Dollar',        '$',    2],
  ['VUV', '548', 'Vanuatu Vatu',                  'Vt',   0],
  ['WST', '882', 'Samoan Tālā',                   'T',    2],
  ['TOP', '776', 'Tongan Paʻanga',                'T$',   2],
  // ── Other / Notable ─────────────────────────────────────────────────────────
  ['CDF', '976', 'Congolese Franc',               'Fr',   2],
  ['GIP', '292', 'Gibraltar Pound',               '£',    2],
  ['FKP', '238', 'Falkland Islands Pound',        '£',    2],
  ['SHP', '654', 'Saint Helenian Pound',          '£',    2],
  ['KPW', '408', 'North Korean Won',              '₩',    2],
  ['ZWL', '932', 'Zimbabwean Dollar',             '$',    2],
]

export const SEED_CURRENCIES: CurrencyData[] = SEED_ROWS.map(([code, num, name, sym, dec, displayName]) => ({
  currencyCode:  code,
  numericCode:   num,
  currencyName:  name,
  displayName,
  symbol:        sym,
  decimalPlaces: dec,
  isDefault:     code === 'THB',
  isCommon:      COMMON_CODES.has(code),
  status:        'ACTIVE',
}))

// ── Storage helpers ────────────────────────────────────────────────────────────

export function getCurrencies(): CurrencyData[] {
  if (typeof window === 'undefined') return SEED_CURRENCIES
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(SEED_CURRENCIES))
      return SEED_CURRENCIES
    }
    const parsed = JSON.parse(raw) as CurrencyData[]
    // Migration: backfill displayName for common currencies
    const COMMON_TH_NAMES: Record<string, string> = {
      THB: 'บาทไทย',      USD: 'ดอลลาร์สหรัฐ',               JPY: 'เยนญี่ปุ่น',
      KRW: 'วอนเกาหลีใต้', CNY: 'หยวนจีน',                    TWD: 'ดอลลาร์ไต้หวัน',
      HKD: 'ดอลลาร์ฮ่องกง', SGD: 'ดอลลาร์สิงคโปร์',          MYR: 'ริงกิตมาเลเซีย',
      VND: 'ดองเวียดนาม',  EUR: 'ยูโร',                        GBP: 'ปอนด์สเตอร์ลิง',
      AUD: 'ดอลลาร์ออสเตรเลีย', AED: 'ดิรฮัมสหรัฐอาหรับเอมิเรตส์',
    }
    let needsMigration = false
    const migrated = parsed.map(c => {
      if (!c.displayName && COMMON_TH_NAMES[c.currencyCode]) {
        needsMigration = true
        return { ...c, displayName: COMMON_TH_NAMES[c.currencyCode] }
      }
      return c
    })
    if (needsMigration) {
      localStorage.setItem(KEY, JSON.stringify(migrated))
      return migrated
    }
    return parsed
  } catch {
    return SEED_CURRENCIES
  }
}

export function saveCurrencies(data: CurrencyData[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(data))
  window.dispatchEvent(new Event('currencies_updated'))
}

export function initCurrencies(): CurrencyData[] {
  if (typeof window === 'undefined') return SEED_CURRENCIES
  if (!localStorage.getItem(KEY)) {
    localStorage.setItem(KEY, JSON.stringify(SEED_CURRENCIES))
  }
  return getCurrencies()
}

// ── Query helpers ──────────────────────────────────────────────────────────────

export function getCurrencyByCode(code: string): CurrencyData | undefined {
  return getCurrencies().find(c => c.currencyCode === code)
}

export function getActiveCurrencies(): CurrencyData[] {
  return getCurrencies().filter(c => c.status === 'ACTIVE')
}

export function getDefaultCurrency(): CurrencyData | undefined {
  return getCurrencies().find(c => c.isDefault)
}

/** Returns ACTIVE currencies: default first, then common, then rest (all sorted by code within group) */
export function getCurrencyOptions(): CurrencyData[] {
  const active = getActiveCurrencies()
  const def    = active.filter(c => c.isDefault)
  const common = active.filter(c => c.isCommon && !c.isDefault).sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
  const rest   = active.filter(c => !c.isCommon && !c.isDefault).sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
  return [...def, ...common, ...rest]
}

const makeLabel = (c: CurrencyData): string =>
  c.displayName ? `${c.currencyCode} — ${c.displayName}` : `${c.currencyCode} — ${c.currencyName}`

/** Returns dropdown options: default first, then common, then rest */
export function getCurrencySelectOptions(): { value: string; label: string; group?: string }[] {
  const active = getActiveCurrencies()
  const def    = active.find(c => c.isDefault)
  const common = active.filter(c => c.isCommon && !c.isDefault).sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
  const rest   = active.filter(c => !c.isCommon && !c.isDefault).sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
  return [
    ...(def    ? [{ value: def.currencyCode,    label: makeLabel(def),    group: 'default' }] : []),
    ...common.map(c => ({ value: c.currencyCode, label: makeLabel(c),     group: 'common'  })),
    ...rest.map(c   => ({ value: c.currencyCode, label: makeLabel(c),     group: 'other'   })),
  ]
}

// ── Mutation helpers ───────────────────────────────────────────────────────────

export function updateCurrency(code: string, patch: Partial<Pick<CurrencyData, 'symbol' | 'decimalPlaces' | 'isCommon' | 'status' | 'displayName'>>): void {
  const currencies = getCurrencies()
  const updated = currencies.map(c => c.currencyCode === code ? { ...c, ...patch } : c)
  saveCurrencies(updated)
}

export function setDefaultCurrency(code: string): void {
  const currencies = getCurrencies()
  const updated = currencies.map(c => ({ ...c, isDefault: c.currencyCode === code }))
  saveCurrencies(updated)
}

/** Returns false (and does nothing) if trying to deactivate the default currency. */
export function toggleCurrencyStatus(code: string): boolean {
  const currencies = getCurrencies()
  const curr = currencies.find(c => c.currencyCode === code)
  if (curr?.isDefault && curr.status === 'ACTIVE') return false
  const updated = currencies.map(c =>
    c.currencyCode === code
      ? { ...c, status: c.status === 'ACTIVE' ? 'INACTIVE' as const : 'ACTIVE' as const }
      : c
  )
  saveCurrencies(updated)
  return true
}

/** Returns the code of the current default currency, falling back to THB. */
export function getDefaultCurrencyCode(): string {
  return getDefaultCurrency()?.currencyCode ?? 'THB'
}

// ── Format helper ──────────────────────────────────────────────────────────────

export function formatCurrencyAmount(amount: number, currencyCode: string): string {
  const dec = getCurrencyByCode(currencyCode)?.decimalPlaces ?? 2
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}
