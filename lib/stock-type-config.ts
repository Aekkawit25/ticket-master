/**
 * Central Stock Type Config — single source of truth for all display text,
 * labels, prefixes, paths, and placeholders across the app.
 *
 * Use getStockTypeKey() to derive the key from DB fields (ticketType + groupType).
 * Use STOCK_TYPE_CONFIG[key] to get all display metadata.
 */

export type StockTypeKey = 'GROUP_SERIES' | 'GROUP_ADHOC' | 'FIT' | 'TICKET_LAND'

export interface StockTypeConfig {
  key: StockTypeKey
  /** e.g. "Group Series" */
  displayName: string
  /** e.g. "ตั๋วกรุ๊ปที่เป็น series" */
  description: string
  /** Page list title, e.g. "Group Series" */
  pageTitle: string
  /** Page subtitle, e.g. "Stock ตั๋วกรุ๊ปที่เป็น series" */
  subtitle: string
  /** Wizard add page title, e.g. "Add Stock — Group Series" */
  addTitle: string
  /** Edit page title, e.g. "Edit Stock — Group Series" */
  editTitle: string
  /** Stock Code field label, e.g. "Series Code" */
  codeLabel: string
  /** Stock Name field label, e.g. "Series Name" */
  nameLabel: string
  /** Stock Code prefix, e.g. "SR" */
  prefix: string
  /** Example code, e.g. "SR26070001" */
  exampleCode: string
  /** Search input placeholder */
  searchPlaceholder: string
  /** Empty state message */
  emptyText: string
  /** Add button text */
  addButtonText: string
  /** Add path (wizard URL) */
  addPath: string
  /** Clear button text */
  clearButtonText: string
  /** Clear confirm note */
  clearNote: string
  /** Whether this type is disabled (Coming Soon) */
  disabled: boolean
  /** Breadcrumb trail */
  breadcrumb: string[]
  /** DB ticket_type value */
  ticketType: 'Group' | 'FIT' | 'Ticket + Land'
  /** DB group_type value (only for Group subtypes) */
  groupType?: 'SERIES' | 'ADHOC'
}

export const STOCK_TYPE_CONFIG: Record<StockTypeKey, StockTypeConfig> = {
  GROUP_SERIES: {
    key: 'GROUP_SERIES',
    displayName: 'Group Series',
    description: 'ตั๋วกรุ๊ปที่เป็น series',
    pageTitle: 'Group Series',
    subtitle: 'Stock ตั๋วกรุ๊ปที่เป็น series',
    addTitle: 'Add Stock — Group Series',
    editTitle: 'Edit Stock — Group Series',
    codeLabel: 'Series Code',
    nameLabel: 'Series Name',
    prefix: 'SR',
    exampleCode: 'SR26070001',
    searchPlaceholder: 'ค้นหา Series Code, Series Name, PNR...',
    emptyText: 'ยังไม่มีข้อมูล Group Series',
    addButtonText: 'Add Group Series',
    addPath: '/tickets/add?type=Group&groupType=SERIES',
    clearButtonText: 'ล้างข้อมูล Group Series',
    clearNote: 'เฉพาะ Group Series เท่านั้น ประเภทอื่นไม่ถูกลบ',
    disabled: false,
    breadcrumb: ['Ticket Stock', 'Group Series'],
    ticketType: 'Group',
    groupType: 'SERIES',
  },
  GROUP_ADHOC: {
    key: 'GROUP_ADHOC',
    displayName: 'Group Ad Hoc',
    description: 'ตั๋วกรุ๊ปทัวร์ Ad Hoc',
    pageTitle: 'Group Ad Hoc',
    subtitle: 'Stock ตั๋ว Group แบบ Ad Hoc',
    addTitle: 'Add Stock — Group Ad Hoc',
    editTitle: 'Edit Stock — Group Ad Hoc',
    codeLabel: 'Ad Hoc Code',
    nameLabel: 'Ad Hoc Name',
    prefix: 'AH',
    exampleCode: 'AH26070001',
    searchPlaceholder: 'ค้นหา Ad Hoc Code, Ad Hoc Name, PNR...',
    emptyText: 'ยังไม่มีข้อมูล Group Ad Hoc',
    addButtonText: 'Add Group Ad Hoc',
    addPath: '/tickets/add?type=Group&groupType=ADHOC',
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
    pageTitle: 'FIT Tickets',
    subtitle: 'Stock ตั๋ว FIT',
    addTitle: 'Add Stock — FIT Ticket',
    editTitle: 'Edit Stock — FIT Ticket',
    codeLabel: 'FIT Code',
    nameLabel: 'FIT Name',
    prefix: 'FIT',
    exampleCode: 'FIT26070001',
    searchPlaceholder: 'ค้นหา FIT Code, PNR...',
    emptyText: 'ยังไม่มีข้อมูล FIT Ticket',
    addButtonText: 'Add FIT Ticket',
    addPath: '/tickets/add?type=FIT',
    clearButtonText: 'ล้างข้อมูล FIT',
    clearNote: 'เฉพาะ FIT เท่านั้น ประเภทอื่นไม่ถูกลบ',
    disabled: true,
    breadcrumb: ['Ticket Stock', 'FIT Tickets'],
    ticketType: 'FIT',
  },
  TICKET_LAND: {
    key: 'TICKET_LAND',
    displayName: 'Ticket + Land',
    description: 'ตั๋วพร้อมแลนด์',
    pageTitle: 'Ticket + Land',
    subtitle: 'Stock ตั๋วพร้อมแพ็กเกจ Land',
    addTitle: 'Add Stock — Ticket + Land',
    editTitle: 'Edit Stock — Ticket + Land',
    codeLabel: 'Stock Code',
    nameLabel: 'Stock Name',
    prefix: 'TL',
    exampleCode: 'TL26070001',
    searchPlaceholder: 'ค้นหา Stock Code, Stock Name, PNR...',
    emptyText: 'ยังไม่มีข้อมูล Ticket + Land',
    addButtonText: 'Add Ticket + Land',
    addPath: '/tickets/add?type=Ticket+Land',
    clearButtonText: 'ล้างข้อมูล Ticket+Land',
    clearNote: 'เฉพาะ Ticket+Land เท่านั้น ประเภทอื่นไม่ถูกลบ',
    disabled: true,
    breadcrumb: ['Ticket Stock', 'Ticket + Land'],
    ticketType: 'Ticket + Land',
  },
}

/** Derive the StockTypeKey from DB fields. Returns null for "All Tickets" or "All Group". */
export function getStockTypeKey(
  ticketType: string,
  groupType?: string | null,
): StockTypeKey | null {
  if (ticketType === 'Group' && groupType === 'SERIES') return 'GROUP_SERIES'
  if (ticketType === 'Group' && groupType === 'ADHOC') return 'GROUP_ADHOC'
  if (ticketType === 'FIT') return 'FIT'
  if (ticketType === 'Ticket + Land') return 'TICKET_LAND'
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

/** Same as getStockTypeConfig but falls back to GROUP_SERIES when type is unresolvable. */
export function getStockTypeConfigSafe(
  ticketType: string,
  groupType?: string | null,
): StockTypeConfig {
  return getStockTypeConfig(ticketType, groupType) ?? STOCK_TYPE_CONFIG.GROUP_SERIES
}
