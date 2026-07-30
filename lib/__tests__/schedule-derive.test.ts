import { describe, it, expect } from 'vitest'
import { deriveScheduleWithTransactions } from '../demo-storage'
import type { PaymentScheduleItem, FinancialTransaction } from '../demo-storage'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<PaymentScheduleItem> = {}): PaymentScheduleItem {
  return {
    pnrDisplay: 'ABC123',
    pnrId: 'pnr-1',
    stageId: 'stage-1',
    stageSeq: 1,
    stageName: 'งวดที่ 1',
    paymentType: 'DEPOSIT',
    amountType: 'Fixed',
    amount: 9000,
    baseDate: 'Travel Date',
    dueDaysBefore: 30,
    dueDate: '2026-05-01',
    ttlDatetime: '2026-05-01T18:00:00',
    paid: 0,
    paidForStage: 0,
    refundForStage: 0,
    remainingForStage: 9000,
    status: 'Pending',
    paymentStatus: 'PENDING',
    timingStatus: 'NOT_DUE',
    fullyPaidAt: null,
    lateDays: null,
    overdueDays: null,
    ...overrides,
  }
}

function makeTx(overrides: Partial<FinancialTransaction>): FinancialTransaction {
  return {
    transactionId: `TX-${Math.random()}`,
    pnrId: 'pnr-1',
    paymentStageId: 'stage-1',
    originalTransactionId: null,
    transactionType: 'PAYMENT',
    paymentMethod: 'BANK_TRANSFER',
    amount: 0,
    feeAmount: 0,
    currencyCode: 'THB',
    transactionDate: '2026-04-15',
    paymentDateTime: '2026-04-15T10:00:00',
    status: 'POSTED',
    reasonCode: null,
    referenceNo: null,
    creditNoteNo: null,
    attachmentUrl: null,
    remark: null,
    sourceBank: null,
    destinationBank: null,
    transferReference: null,
    cardBrand: null,
    cardLast4: null,
    authorizationCode: null,
    topupAccountId: null,
    topupReference: null,
    topupBalanceBefore: null,
    topupUsedAmount: null,
    topupBalanceAfter: null,
    createdBy: 'Test',
    approvedBy: null,
    createdAt: '2026-04-15T10:00:00.000Z',
    updatedAt: '2026-04-15T10:00:00.000Z',
    ...overrides,
  }
}

// ─── Fixed reference dates ────────────────────────────────────────────────────
// ttlDatetime default: '2026-05-01T18:00:00'
const BEFORE_DUE = new Date('2026-04-01T00:00:00')   // before due date
const AFTER_DUE  = new Date('2026-06-01T00:00:00')   // after due date

describe('deriveScheduleWithTransactions — payment status', () => {
  it('จ่ายครบก่อนกำหนด → PAID + PAID_ON_TIME', () => {
    const items = [makeItem()]
    // paymentDateTime = 2026-04-15 (before due 2026-05-01)
    const txs = [makeTx({ amount: 9000, paymentDateTime: '2026-04-15T10:00:00' })]
    const result = deriveScheduleWithTransactions(items, txs, AFTER_DUE)
    expect(result[0].paymentStatus).toBe('PAID')
    expect(result[0].timingStatus).toBe('PAID_ON_TIME')
    expect(result[0].paidForStage).toBe(9000)
    expect(result[0].remainingForStage).toBe(0)
    expect(result[0].fullyPaidAt).toBe('2026-04-15T10:00:00')
    expect(result[0].lateDays).toBeNull()
  })

  it('จ่ายครบหลังกำหนด → PAID + PAID_LATE พร้อม lateDays', () => {
    const items = [makeItem()]
    // paymentDateTime = 2026-05-13 (12 days after due 2026-05-01)
    const txs = [makeTx({ amount: 9000, paymentDateTime: '2026-05-13T08:50:00' })]
    const result = deriveScheduleWithTransactions(items, txs, AFTER_DUE)
    expect(result[0].paymentStatus).toBe('PAID')
    expect(result[0].timingStatus).toBe('PAID_LATE')
    expect(result[0].lateDays).toBeGreaterThan(0)
    // 2026-05-13 - 2026-05-01T18:00 ≈ 11.6 days → ceil = 12
    expect(result[0].lateDays).toBe(12)
  })

  it('จ่ายบางส่วนก่อนกำหนด → PARTIALLY_PAID + PENDING_MORE', () => {
    const items = [makeItem()]
    const txs = [makeTx({ amount: 4500, paymentDateTime: '2026-04-15T10:00:00' })]
    const result = deriveScheduleWithTransactions(items, txs, BEFORE_DUE)
    expect(result[0].paymentStatus).toBe('PARTIALLY_PAID')
    expect(result[0].timingStatus).toBe('PENDING_MORE')
    expect(result[0].paidForStage).toBe(4500)
    expect(result[0].remainingForStage).toBe(4500)
  })

  it('จ่ายบางส่วนหลังกำหนด → PARTIALLY_PAID + OVERDUE', () => {
    const items = [makeItem()]
    const txs = [makeTx({ amount: 4500, paymentDateTime: '2026-04-15T10:00:00' })]
    const result = deriveScheduleWithTransactions(items, txs, AFTER_DUE)
    expect(result[0].paymentStatus).toBe('PARTIALLY_PAID')
    expect(result[0].timingStatus).toBe('OVERDUE')
    expect(result[0].overdueDays).toBeGreaterThan(0)
  })

  it('ยังไม่จ่ายก่อนกำหนด → PENDING + NOT_DUE', () => {
    const items = [makeItem()]
    const result = deriveScheduleWithTransactions(items, [], BEFORE_DUE)
    expect(result[0].paymentStatus).toBe('PENDING')
    expect(result[0].timingStatus).toBe('NOT_DUE')
    expect(result[0].paidForStage).toBe(0)
  })

  it('ยังไม่จ่ายหลังกำหนด → UNPAID + OVERDUE พร้อม overdueDays', () => {
    const items = [makeItem()]
    const result = deriveScheduleWithTransactions(items, [], AFTER_DUE)
    expect(result[0].paymentStatus).toBe('UNPAID')
    expect(result[0].timingStatus).toBe('OVERDUE')
    expect(result[0].overdueDays).toBeGreaterThan(0)
  })

  it('จ่ายครบแม้เลยกำหนด → PAID (ไม่ใช่ UNPAID หรือ OVERDUE เป็นหลัก)', () => {
    const items = [makeItem()]
    const txs = [makeTx({ amount: 9000, paymentDateTime: '2026-05-13T08:50:00' })]
    // now = AFTER_DUE (Jun 1), due = May 1 — paid = May 13 (late but fully paid)
    const result = deriveScheduleWithTransactions(items, txs, AFTER_DUE)
    expect(result[0].paymentStatus).toBe('PAID')     // primary: ชำระแล้ว ✓
    expect(result[0].timingStatus).toBe('PAID_LATE') // secondary: ชำระล่าช้า ✓
  })

  it('Refund หลังจ่ายครบ → remaining กลับมา → PARTIALLY_PAID', () => {
    const items = [makeItem()]
    const txs = [
      makeTx({ transactionId: 'P1', amount: 9000, transactionType: 'PAYMENT', paymentDateTime: '2026-04-15T10:00:00' }),
      makeTx({ transactionId: 'R1', amount: 3000, transactionType: 'REFUND',  paymentDateTime: '2026-04-20T10:00:00' }),
    ]
    const result = deriveScheduleWithTransactions(items, txs, AFTER_DUE)
    expect(result[0].paidForStage).toBe(9000)
    expect(result[0].refundForStage).toBe(3000)
    expect(result[0].remainingForStage).toBe(3000)
    expect(result[0].paymentStatus).toBe('PARTIALLY_PAID')
    expect(result[0].timingStatus).toBe('OVERDUE') // after due date
  })

  it('Transaction สถานะ VOIDED/REVERSED/DRAFT ไม่นับ', () => {
    const items = [makeItem()]
    const txs = [
      makeTx({ amount: 9000, status: 'VOIDED' }),
      makeTx({ amount: 9000, status: 'REVERSED' }),
      makeTx({ amount: 9000, status: 'DRAFT' }),
    ]
    const result = deriveScheduleWithTransactions(items, txs, BEFORE_DUE)
    expect(result[0].paidForStage).toBe(0)
    expect(result[0].paymentStatus).toBe('PENDING')
  })

  it('Transaction ที่ไม่ตรง paymentStageId ไม่ถูกนับ', () => {
    const items = [makeItem({ stageId: 'stage-1' })]
    const txs = [makeTx({ amount: 9000, paymentStageId: 'stage-other' })]
    const result = deriveScheduleWithTransactions(items, txs, BEFORE_DUE)
    expect(result[0].paidForStage).toBe(0)
    expect(result[0].paymentStatus).toBe('PENDING')
  })

  it('fullyPaidAt ถูกหาจาก TX ที่ทำให้ยอดสะสมครบ ไม่ใช่ TX ล่าสุด', () => {
    // Two payments: first reaches threshold, second is later
    const items = [makeItem({ amount: 5000 })]
    const txs = [
      makeTx({ transactionId: 'T1', amount: 5000, paymentDateTime: '2026-04-10T09:00:00' }),
      makeTx({ transactionId: 'T2', amount: 2000, paymentDateTime: '2026-04-20T09:00:00' }), // extra
    ]
    const result = deriveScheduleWithTransactions(items, txs)
    // T1 (5000) reaches the 5000 threshold, so fullyPaidAt = T1's datetime
    expect(result[0].fullyPaidAt).toBe('2026-04-10T09:00:00')
  })

  it('รองรับ legacy status COMPLETED/CONFIRMED', () => {
    const items = [makeItem()]
    const txs = [
      makeTx({ transactionId: 'A', amount: 4000, status: 'COMPLETED', paymentDateTime: '2026-04-10T09:00:00' }),
      makeTx({ transactionId: 'B', amount: 5000, status: 'CONFIRMED', paymentDateTime: '2026-04-12T09:00:00' }),
    ]
    const result = deriveScheduleWithTransactions(items, txs, BEFORE_DUE)
    expect(result[0].paidForStage).toBe(9000)
    expect(result[0].paymentStatus).toBe('PAID')
    expect(result[0].timingStatus).toBe('PAID_ON_TIME')
  })
})

describe('deriveScheduleWithTransactions — fallback (single stage)', () => {
  it('PNR งวดเดียว + TX ไม่มี stageId → fallback → PAID', () => {
    const items = [makeItem({ stageId: 'stage-1' })]
    const txs = [makeTx({ amount: 9000, paymentStageId: null, paymentDateTime: '2026-04-15T10:00:00' })]
    const result = deriveScheduleWithTransactions(items, txs, BEFORE_DUE)
    expect(result[0].paidForStage).toBe(9000)
    expect(result[0].paymentStatus).toBe('PAID')
  })

  it('PNR หลายงวด + TX ไม่มี stageId → ไม่ใช้ fallback', () => {
    const items = [
      makeItem({ stageId: 'stage-1', amount: 5000, remainingForStage: 5000 }),
      makeItem({ stageId: 'stage-2', amount: 4000, remainingForStage: 4000 }),
    ]
    const txs = [makeTx({ amount: 9000, paymentStageId: null })]
    const result = deriveScheduleWithTransactions(items, txs, BEFORE_DUE)
    expect(result[0].paidForStage).toBe(0)
    expect(result[1].paidForStage).toBe(0)
  })
})
