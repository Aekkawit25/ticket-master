// ============================================================
// Requisition Storage — Demo (globalThis + localStorage)
// ============================================================

// ------------------------------------
// Types
// ------------------------------------

export type RequisitionStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'WAITING_PAYMENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CANCELLED'

export type RequisitionPaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'

export type CalculationBasis =
  | 'INITIAL_SEAT'
  | 'CURRENT_REMAINING_SEAT'
  | 'FIXED_AMOUNT'
  | 'PERCENT_OF_FARE'
  | 'REMAINING_FARE'
  | 'MANUAL_AMOUNT'

export type ReqItemType = 'PNR_STAGE' | 'OTHER'

export type ReqSourceType = 'PNR' | 'GENERAL'

// ------------------------------------
// Interfaces
// ------------------------------------

export interface DemoReqBankAccount {
  accountId: string
  bankName: string
  accountName: string
  accountNo: string
  branch: string
}

export interface DemoReqSupplierSnapshot {
  supplierCode: string
  supplierName: string
  taxId: string
  branchType: 'HQ' | 'BRANCH'
  branchNo: string
  address: string
  contactName: string
  phone: string
  email: string
  bankAccounts: DemoReqBankAccount[]
  selectedAccountId: string
}

export interface DemoReqItem {
  itemId: string
  itemType: ReqItemType

  pnrId: string | null
  pnrDisplay: string | null
  stageId: string | null
  paymentRuleId: string | null

  paymentType: string
  stageSeq: number | null
  stageName: string

  calculationBasis: CalculationBasis

  seatSnapshot: number
  snapshotType: 'INITIAL_SEAT' | 'CURRENT_REMAINING_SEAT' | 'MANUAL'
  snapshotDateTime: string
  seatTotalAtSnapshot: number
  seatRemainingAtSnapshot: number

  ratePerSeat: number
  fixedAmount: number
  percent: number
  calculatedAmount: number

  creditTowardFare: boolean
  refundable: boolean

  currencyCode: string
  dueDate: string | null
  ttlDate: string | null
  remark: string

  createdDate: string
  updatedDate: string
}

export interface DemoReqPaymentRecord {
  paymentId: string
  paymentDate: string
  paymentAmount: number
  paymentMethod: string
  paymentReference: string
  paymentStatus: 'PENDING' | 'COMPLETED' | 'FAILED'
  createdBy: string
  createdDate: string
}

export interface DemoReqAttachment {
  attachmentId: string
  documentCategory: string
  fileName: string
  fileType: string
  fileSize: number
  uploadedBy: string
  uploadedDate: string
  status: 'ACTIVE' | 'DELETED'
}

export interface DemoReqLog {
  logId: string
  action: string
  userId: string
  userName: string
  beforeValue: string | null
  afterValue: string | null
  actionDateTime: string
}

export interface DemoRequisition {
  requisitionId: string
  requisitionNo: string | null // null before first save; auto-generated on save

  documentType: 'REQUISITION'
  sourceType: ReqSourceType

  seriesId: string | null
  seriesCode: string | null
  seriesName: string | null
  airlineCode: string | null
  travelPeriod: string | null
  routeText: string | null

  pnrIds: string[]
  pnrDisplays: string[]

  documentTitle: string
  documentDate: string
  dueDate: string | null
  referenceDoc: string
  department: string

  supplierSnapshot: DemoReqSupplierSnapshot | null

  currencyCode: string
  exchangeRate: number

  subtotal: number
  discountAmount: number

  vatRate: number
  vatAmount: number

  withholdingTaxRate: number
  withholdingTaxAmount: number

  netAmount: number
  approvedAmount: number
  paidAmount: number

  items: DemoReqItem[]

  paymentMethod: string
  paymentDetail: string

  documentStatus: RequisitionStatus
  paymentStatus: RequisitionPaymentStatus

  payments: DemoReqPaymentRecord[]
  attachments: DemoReqAttachment[]

  internalNote: string
  approverNote: string
  accountingNote: string
  differenceReason: string

  isDifferenceDoc: boolean
  originalRequisitionId: string | null

  approvedBy: string | null
  approvedDate: string | null

  rejectedBy: string | null
  rejectedDate: string | null
  rejectedReason: string | null

  cancelledBy: string | null
  cancelledDate: string | null
  cancelReason: string | null

  createdBy: string
  createdDate: string
  updatedBy: string
  updatedDate: string

  logs: DemoReqLog[]
}

// ------------------------------------
// globalThis declaration (HMR-safe)
// ------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __airTicketRequisitions: DemoRequisition[] | undefined
}

// ------------------------------------
// Constants / Label Maps
// ------------------------------------

export const REQUISITION_STATUS_INFO: Record<
  RequisitionStatus,
  { label: string; variant: 'gray' | 'orange' | 'green' | 'red' | 'blue' | 'yellow' }
> = {
  DRAFT:           { label: 'ฉบับร่าง',       variant: 'gray' },
  PENDING_APPROVAL:{ label: 'รออนุมัติ',       variant: 'orange' },
  APPROVED:        { label: 'อนุมัติแล้ว',     variant: 'blue' },
  REJECTED:        { label: 'ไม่อนุมัติ',      variant: 'red' },
  WAITING_PAYMENT: { label: 'รอชำระ',          variant: 'yellow' },
  PARTIALLY_PAID:  { label: 'ชำระบางส่วน',    variant: 'orange' },
  PAID:            { label: 'ชำระแล้ว',        variant: 'green' },
  CANCELLED:       { label: 'ยกเลิก',          variant: 'gray' },
}

export const PAYMENT_METHOD_OPTIONS = [
  'โอนเงิน',
  'เช็ค',
  'บัตรเครดิต',
  'เงินสด',
  'อื่น ๆ',
]

export const DOC_CATEGORY_OPTIONS = [
  'Invoice',
  'Payment Notice',
  'Deposit Schedule',
  'Airline Contract',
  'Booking Confirmation',
  'Approval Document',
  'Bank Detail',
  'หลักฐานการชำระ',
  'เอกสารอื่น',
]

export const CALC_BASIS_LABELS: Record<CalculationBasis, string> = {
  INITIAL_SEAT:           'จำนวนที่นั่งเริ่มต้น',
  CURRENT_REMAINING_SEAT: 'ที่นั่งคงเหลือ ณ วันที่สร้างใบเบิก',
  FIXED_AMOUNT:           'จำนวนเงินคงที่',
  PERCENT_OF_FARE:        'เปอร์เซ็นต์ของค่าตั๋ว',
  REMAINING_FARE:         'ยอดค่าตั๋วคงเหลือ',
  MANUAL_AMOUNT:          'กรอกเอง',
}

// ------------------------------------
// Storage helpers
// ------------------------------------

const LS_KEY = 'air_ticket_requisitions'
const LS_SEQ_KEY = 'air_ticket_req_seq'

function loadFromStorage(): DemoRequisition[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as DemoRequisition[]
  } catch {
    return []
  }
}

function persistToStorage(list: DemoRequisition[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {
    // quota exceeded — silently ignore
  }
}

export function getRequisitions(): DemoRequisition[] {
  if (globalThis.__airTicketRequisitions == null) {
    globalThis.__airTicketRequisitions = loadFromStorage()
  }
  return globalThis.__airTicketRequisitions
}

export function saveRequisition(req: DemoRequisition): void {
  const list = getRequisitions()
  const idx = list.findIndex(r => r.requisitionId === req.requisitionId)
  if (idx >= 0) {
    list[idx] = req
  } else {
    list.push(req)
  }
  globalThis.__airTicketRequisitions = list
  persistToStorage(list)
}

export function getRequisitionById(id: string): DemoRequisition | null {
  return getRequisitions().find(r => r.requisitionId === id) ?? null
}

// ------------------------------------
// ID Generation
// ------------------------------------

export function generateReqId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return `REQ-ID-${suffix}`
}

export function generateRequisitionNo(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const prefix = `REQ-${yyyy}${mm}`

  let seq = 0
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LS_SEQ_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as { prefix: string; seq: number }
        if (parsed.prefix === prefix) {
          seq = parsed.seq
        }
      }
    } catch {
      // ignore
    }
  }

  seq += 1

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LS_SEQ_KEY, JSON.stringify({ prefix, seq }))
    } catch {
      // ignore
    }
  }

  return `${prefix}-${String(seq).padStart(4, '0')}`
}

// ------------------------------------
// Duplicate Check
// ------------------------------------

export function checkDuplicateRequisition(
  pnrId: string,
  stageId: string,
  excludeId?: string,
): DemoRequisition | null {
  const list = getRequisitions()
  for (const req of list) {
    if (req.documentStatus === 'CANCELLED') continue
    if (excludeId && req.requisitionId === excludeId) continue
    const hasMatch = req.items.some(
      item => item.pnrId === pnrId && item.stageId === stageId,
    )
    if (hasMatch) return req
  }
  return null
}

// ------------------------------------
// Mock Supplier Data
// ------------------------------------

export function getMockSupplier(airlineCode: string): DemoReqSupplierSnapshot {
  const suppliers: Record<string, DemoReqSupplierSnapshot> = {
    TG: {
      supplierCode: 'SUP-TG',
      supplierName: 'บริษัท การบินไทย จำกัด (มหาชน)',
      taxId: '0107537000068',
      branchType: 'HQ',
      branchNo: '00000',
      address: '89 ถนนวิภาวดีรังสิต แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร 10900',
      contactName: 'ฝ่ายการเงิน การบินไทย',
      phone: '02-545-1000',
      email: 'finance@thaiairways.com',
      bankAccounts: [
        {
          accountId: 'TG-ACC-001',
          bankName: 'ธนาคารกรุงเทพ จำกัด (มหาชน)',
          accountName: 'บริษัท การบินไทย จำกัด (มหาชน)',
          accountNo: '101-3-12345-6',
          branch: 'สำนักงานใหญ่',
        },
        {
          accountId: 'TG-ACC-002',
          bankName: 'ธนาคารไทยพาณิชย์ จำกัด (มหาชน)',
          accountName: 'บริษัท การบินไทย จำกัด (มหาชน)',
          accountNo: '001-2-34567-8',
          branch: 'ดอนเมือง',
        },
      ],
      selectedAccountId: 'TG-ACC-001',
    },
    QR: {
      supplierCode: 'SUP-QR',
      supplierName: 'Qatar Airways Q.C.S.C.',
      taxId: '0105560001234',
      branchType: 'BRANCH',
      branchNo: '00001',
      address: '2nd Floor, Jewelry Trade Center, 919/399 Silom Road, Bangkok 10500',
      contactName: 'Sales & Finance Department',
      phone: '02-627-1701',
      email: 'bkk@qatarairways.com.qa',
      bankAccounts: [
        {
          accountId: 'QR-ACC-001',
          bankName: 'ธนาคารกสิกรไทย จำกัด (มหาชน)',
          accountName: 'Qatar Airways (Thailand) Co., Ltd.',
          accountNo: '012-3-45678-9',
          branch: 'สีลม',
        },
        {
          accountId: 'QR-ACC-002',
          bankName: 'HSBC Bank (Thailand)',
          accountName: 'Qatar Airways Q.C.S.C.',
          accountNo: '001-456789-001',
          branch: 'Bangkok',
        },
      ],
      selectedAccountId: 'QR-ACC-001',
    },
    EK: {
      supplierCode: 'SUP-EK',
      supplierName: 'Emirates (Thailand) Ltd.',
      taxId: '0105540056789',
      branchType: 'BRANCH',
      branchNo: '00001',
      address: '407 Athenee Tower, 22nd Floor, Wireless Road, Lumpini, Pathumwan, Bangkok 10330',
      contactName: 'Finance & Accounts',
      phone: '02-664-1040',
      email: 'bkk@emirates.com',
      bankAccounts: [
        {
          accountId: 'EK-ACC-001',
          bankName: 'ธนาคารกรุงศรีอยุธยา จำกัด (มหาชน)',
          accountName: 'Emirates (Thailand) Ltd.',
          accountNo: '401-1-23456-7',
          branch: 'วิทยุ',
        },
        {
          accountId: 'EK-ACC-002',
          bankName: 'Citibank N.A.',
          accountName: 'Emirates Group',
          accountNo: '0-123456-789',
          branch: 'Bangkok',
        },
      ],
      selectedAccountId: 'EK-ACC-001',
    },
    TZ: {
      supplierCode: 'SUP-TZ',
      supplierName: 'Scoot Tigerair Pte Ltd (สาขากรุงเทพ)',
      taxId: '0105560098765',
      branchType: 'BRANCH',
      branchNo: '00001',
      address: '18 Floor, Two Pacific Place, 142 Sukhumvit Road, Bangkok 10110',
      contactName: 'Commercial Finance',
      phone: '02-251-5190',
      email: 'thfinance@flyscoot.com',
      bankAccounts: [
        {
          accountId: 'TZ-ACC-001',
          bankName: 'ธนาคารกรุงไทย จำกัด (มหาชน)',
          accountName: 'Scoot Tigerair Pte Ltd',
          accountNo: '091-0-12345-6',
          branch: 'สุขุมวิท',
        },
        {
          accountId: 'TZ-ACC-002',
          bankName: 'ธนาคารกสิกรไทย จำกัด (มหาชน)',
          accountName: 'Scoot Tigerair Pte Ltd',
          accountNo: '067-2-34567-8',
          branch: 'อโศก',
        },
      ],
      selectedAccountId: 'TZ-ACC-001',
    },
    FD: {
      supplierCode: 'SUP-FD',
      supplierName: 'บริษัท ไทยแอร์เอเชีย จำกัด',
      taxId: '0105545012345',
      branchType: 'HQ',
      branchNo: '00000',
      address: '222 ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร 10900',
      contactName: 'ฝ่ายบัญชีและการเงิน',
      phone: '02-515-9999',
      email: 'account@airasia.com',
      bankAccounts: [
        {
          accountId: 'FD-ACC-001',
          bankName: 'ธนาคารกสิกรไทย จำกัด (มหาชน)',
          accountName: 'บริษัท ไทยแอร์เอเชีย จำกัด',
          accountNo: '028-1-23456-7',
          branch: 'วิภาวดีรังสิต',
        },
        {
          accountId: 'FD-ACC-002',
          bankName: 'ธนาคารกรุงเทพ จำกัด (มหาชน)',
          accountName: 'บริษัท ไทยแอร์เอเชีย จำกัด',
          accountNo: '901-7-12345-6',
          branch: 'ดอนเมือง',
        },
      ],
      selectedAccountId: 'FD-ACC-001',
    },
  }

  return (
    suppliers[airlineCode] ?? {
      supplierCode: `SUP-${airlineCode}`,
      supplierName: `${airlineCode} Airline`,
      taxId: '0000000000000',
      branchType: 'HQ',
      branchNo: '00000',
      address: '-',
      contactName: '-',
      phone: '-',
      email: '-',
      bankAccounts: [
        {
          accountId: `${airlineCode}-ACC-001`,
          bankName: 'ธนาคารกรุงเทพ จำกัด (มหาชน)',
          accountName: `${airlineCode} Airline`,
          accountNo: '000-0-00000-0',
          branch: 'สำนักงานใหญ่',
        },
        {
          accountId: `${airlineCode}-ACC-002`,
          bankName: 'ธนาคารกสิกรไทย จำกัด (มหาชน)',
          accountName: `${airlineCode} Airline`,
          accountNo: '000-0-00000-1',
          branch: 'สำนักงานใหญ่',
        },
      ],
      selectedAccountId: `${airlineCode}-ACC-001`,
    }
  )
}

// ------------------------------------
// Calculations
// ------------------------------------

export function calcReqTotals(
  items: DemoReqItem[],
  discountAmount: number,
  vatRate: number,
  withholdingTaxRate: number,
): {
  subtotal: number
  discountAmount: number
  vatAmount: number
  withholdingTaxAmount: number
  netAmount: number
} {
  const subtotal = items.reduce((sum, item) => sum + item.calculatedAmount, 0)
  const afterDiscount = Math.max(0, subtotal - discountAmount)
  const vatAmount = (afterDiscount * vatRate) / 100
  const withholdingTaxAmount = (afterDiscount * withholdingTaxRate) / 100
  const netAmount = afterDiscount + vatAmount - withholdingTaxAmount

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discountAmount),
    vatAmount: round2(vatAmount),
    withholdingTaxAmount: round2(withholdingTaxAmount),
    netAmount: round2(netAmount),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ------------------------------------
// Payment Detail Builder
// ------------------------------------

export function buildPaymentDetail(item: DemoReqItem): string {
  const paymentTypeLabel: Record<string, string> = {
    RSVN_FEE:           'ค่าจองที่นั่ง',
    DEPOSIT:            'มัดจำ',
    BALANCE:            'ชำระส่วนที่เหลือ',
    FULL_PAYMENT:       'ชำระเต็มจำนวน',
    FEE:                'ชำระค่าธรรมเนียม',
    // backward-compat
    REMAINING_PAYMENT:  'ชำระส่วนที่เหลือ',
    ADDITIONAL_PAYMENT: 'ชำระเพิ่ม',
    OTHER:              'อื่น ๆ',
  }
  const typeLabel = paymentTypeLabel[item.paymentType] ?? item.paymentType
  const seq = item.stageSeq ?? 1
  const pnrRef = item.pnrDisplay ? ` สำหรับ PNR ${item.pnrDisplay}` : ''

  const amount = item.calculatedAmount.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  if (
    item.calculationBasis === 'INITIAL_SEAT' ||
    item.calculationBasis === 'CURRENT_REMAINING_SEAT'
  ) {
    const rate = item.ratePerSeat.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return `เบิกชำระ${typeLabel} รอบที่ ${seq}${pnrRef} จำนวน ${item.seatSnapshot} ที่นั่ง อัตรา ${rate} ${item.currencyCode}/ที่นั่ง รวม ${amount} ${item.currencyCode}`
  }

  if (item.calculationBasis === 'PERCENT_OF_FARE') {
    return `เบิกชำระ${typeLabel} รอบที่ ${seq}${pnrRef} อัตรา ${item.percent}% รวม ${amount} ${item.currencyCode}`
  }

  return `เบิกชำระ${typeLabel} รอบที่ ${seq}${pnrRef} รวม ${amount} ${item.currencyCode}`
}

// ------------------------------------
// Audit Log Helper
// ------------------------------------

export function addReqLog(
  req: DemoRequisition,
  action: string,
  userName: string,
  before?: string,
  after?: string,
): DemoRequisition {
  const logEntry: DemoReqLog = {
    logId: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    action,
    userId: userName,
    userName,
    beforeValue: before ?? null,
    afterValue: after ?? null,
    actionDateTime: new Date().toISOString(),
  }
  return {
    ...req,
    logs: [...(req.logs ?? []), logEntry],
  }
}
