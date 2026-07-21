/**
 * Central Stock Type Config — single source of truth for all display text,
 * labels, prefixes, paths, and placeholders across the app.
 *
 * Use getStockTypeKey() to derive the key from DB fields (ticketType + groupType).
 * Use STOCK_TYPE_CONFIG[key] to get all display metadata.
 */

export type StockType    = 'SERIES' | 'AD_HOC' | 'FIT' | 'TICKET_ONLY'
export type StockTypeKey = StockType   // backward-compat alias

export interface StockTypeConfig {
  key: StockType
  /** e.g. "Series" */
  displayName: string
  /** e.g. "ตั๋วกรุ๊ปที่เป็น Series" */
  description: string
  /** Page list title, e.g. "Series" */
  pageTitle: string
  /** Page subtitle */
  subtitle: string
  /** Wizard add page title */
  addTitle: string
  /** Edit page title */
  editTitle: string
  /** Stock Code field label */
  codeLabel: string
  /** Stock Name field label */
  nameLabel: string
  /** Stock Code prefix */
  prefix: string
  /** Example code */
  exampleCode: string
  /** Search input placeholder */
  searchPlaceholder: string
  /** Empty state message */
  emptyText: string
  /** Add button text */
  addButtonText: string
  /** Add path (wizard URL), or null to show a picker modal */
  addPath: string | null
  /** Clear button text */
  clearButtonText: string
  /** Clear confirm note */
  clearNote: string
  /** Always false — all types are now active */
  disabled: false
  /** Breadcrumb trail */
  breadcrumb: string[]
  /** DB ticket_type value (for backward compat with existing data) */
  ticketType: 'Group' | 'FIT' | 'Ticket + Land'
  /** DB group_type value (only for Group subtypes) */
  groupType?: 'SERIES' | 'ADHOC'
}

export const STOCK_TYPE_CONFIG: Record<StockType, StockTypeConfig> = {
  SERIES: {
    key: 'SERIES',
    displayName: 'Series',
    description: 'ตั๋วกรุ๊ปที่เป็น Series',
    pageTitle: 'Series',
    subtitle: 'Stock ตั๋วกรุ๊ปที่เป็น Series',
    addTitle: 'Add Stock — Series',
    editTitle: 'Edit Stock — Series',
    codeLabel: 'Series Code',
    nameLabel: 'Series Name',
    prefix: 'SR',
    exampleCode: 'SR26070001',
    searchPlaceholder: 'ค้นหา Series Code, Series Name, PNR...',
    emptyText: 'ยังไม่มีข้อมูล Series',
    addButtonText: 'Add Series',
    addPath: '/tickets/add?stockType=SERIES',
    clearButtonText: 'ล้างข้อมูล Series',
    clearNote: 'เฉพาะ Series เท่านั้น ประเภทอื่นไม่ถูกลบ',
    disabled: false,
    breadcrumb: ['Ticket Stock', 'Series'],
    ticketType: 'Group',
    groupType: 'SERIES',
  },
  AD_HOC: {
    key: 'AD_HOC',
    displayName: 'Group Ad Hoc',
    description: 'ตั๋วกรุ๊ปแบบ Group Ad Hoc',
    pageTitle: 'Group Ad Hoc',
    subtitle: 'Stock ตั๋วกรุ๊ปแบบ Group Ad Hoc — Ad Hoc และ PNR Ad Hoc ใน Series',
    addTitle: 'Add Stock — Group Ad Hoc',
    editTitle: 'Edit Stock — Group Ad Hoc',
    codeLabel: 'Ad Hoc Code',
    nameLabel: 'Ad Hoc Name',
    prefix: 'AH',
    exampleCode: 'AH26070001',
    searchPlaceholder: 'ค้นหา Ad Hoc Code, Ad Hoc Name, PNR...',
    emptyText: 'ยังไม่มีข้อมูล Group Ad Hoc',
    addButtonText: 'Add Group Ad Hoc',
    addPath: null,
    clearButtonText: 'ล้างข้อมูล Group Ad Hoc',
    clearNote: 'เฉพาะ Group Ad Hoc เท่านั้น ประเภทอื่นไม่ถูกลบ',
    disabled: false,
    breadcrumb: ['Ticket Stock', 'Group Ad Hoc'],
    ticketType: 'Group',
    groupType: 'ADHOC',
  },
  FIT: {
    key: 'FIT',
    displayName: 'FIT',
    description: 'ตั๋วเดี่ยว',
    pageTitle: 'FIT',
    subtitle: 'Stock ตั๋ว FIT',
    addTitle: 'Add Stock — FIT',
    editTitle: 'Edit Stock — FIT',
    codeLabel: 'FIT Code',
    nameLabel: 'FIT Name',
    prefix: 'FIT',
    exampleCode: 'FIT26070001',
    searchPlaceholder: 'ค้นหา FIT Code, FIT Name, PNR...',
    emptyText: 'ยังไม่มีข้อมูล FIT',
    addButtonText: 'Add FIT',
    addPath: '/tickets/add?stockType=FIT',
    clearButtonText: 'ล้างข้อมูล FIT',
    clearNote: 'เฉพาะ FIT เท่านั้น ประเภทอื่นไม่ถูกลบ',
    disabled: false,
    breadcrumb: ['Ticket Stock', 'FIT'],
    ticketType: 'FIT',
  },
  TICKET_ONLY: {
    key: 'TICKET_ONLY',
    displayName: 'Ticket (Land)',
    description: 'ซื้อตั๋วผ่านผู้ให้บริการอื่น',
    pageTitle: 'Ticket (Land)',
    subtitle: 'Stock ตั๋วที่ซื้อผ่านผู้ให้บริการอื่น',
    addTitle: 'Add Stock — Ticket (Land)',
    editTitle: 'Edit Stock — Ticket (Land)',
    codeLabel: 'Stock Code',
    nameLabel: 'Stock Name',
    prefix: 'TO',
    exampleCode: 'TO26070001',
    searchPlaceholder: 'ค้นหา Stock Code, Stock Name, PNR...',
    emptyText: 'ยังไม่มีข้อมูล Ticket (Land)',
    addButtonText: 'Add Ticket (Land)',
    addPath: '/tickets/add?stockType=TICKET_ONLY',
    clearButtonText: 'ล้างข้อมูล Ticket (Land)',
    clearNote: 'เฉพาะ Ticket (Land) เท่านั้น ประเภทอื่นไม่ถูกลบ',
    disabled: false,
    breadcrumb: ['Ticket Stock', 'Ticket (Land)'],
    ticketType: 'Ticket + Land',
  },
}

/**
 * Derive the StockType from DB fields (ticketType + groupType) or from a StockType key directly.
 * Returns null for "All Tickets" or "All Group".
 */
export function getStockTypeKey(
  ticketType: string,
  groupType?: string | null,
): StockType | null {
  // Accept new StockType values directly (from ?stockType= param)
  if (ticketType === 'SERIES') return 'SERIES'
  if (ticketType === 'AD_HOC') return 'AD_HOC'
  if (ticketType === 'FIT' && !groupType) return 'FIT'
  if (ticketType === 'TICKET_ONLY') return 'TICKET_ONLY'
  // Map from old ticket_type + group_type (backward compat with DB and localStorage)
  if (ticketType === 'Group' && groupType === 'SERIES') return 'SERIES'
  if (ticketType === 'Group' && groupType === 'ADHOC')  return 'AD_HOC'
  if (ticketType === 'FIT') return 'FIT'
  if (ticketType === 'Ticket + Land') return 'TICKET_ONLY'
  return null
}

/** Get config from DB fields, or null for "All Tickets" / unknown. */
export function getStockTypeConfig(
  ticketType: string,
  groupType?: string | null,
): StockTypeConfig | null {
  const key = getStockTypeKey(ticketType, groupType)
  return key ? STOCK_TYPE_CONFIG[key] : null
}

/** Same as getStockTypeConfig but falls back to SERIES when type is unresolvable. */
export function getStockTypeConfigSafe(
  ticketType: string,
  groupType?: string | null,
): StockTypeConfig {
  return getStockTypeConfig(ticketType, groupType) ?? STOCK_TYPE_CONFIG.SERIES
}
