// ─── PNR Payment/Status Badges ────────────────────────────────────────────────
// Shared JSX badge & formatting components used by both the List PNR table's
// Payment column (app/pnr/page.tsx) and the PNR Detail page's Payment tab
// (components/pnr-detail/PnrPaymentPanel.tsx) — kept here so both stay in sync
// instead of duplicating the same status→label→color mapping twice.

import { cn, formatNumber } from '@/lib/utils'
import type { PaymentMethod, PaymentScheduleItem, PNRFinancialSummary, StageStatus, FinancialTransaction } from '@/lib/demo-storage'

// ─── Tone pill (generic status tag) ───────────────────────────────────────

export const TONE_CLASSES = {
  green:  'bg-emerald-50 text-emerald-700 border border-emerald-200',
  orange: 'bg-orange-50 text-orange-700 border border-orange-200',
  amber:  'bg-amber-50 text-amber-600 border border-amber-200',
  red:    'bg-red-50 text-red-700 border border-red-200',
  gray:   'bg-slate-100 text-slate-500 border border-slate-200',
} as const

export function TonePill({ tone, children }: { tone: keyof typeof TONE_CLASSES; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap', TONE_CLASSES[tone])}>
      {children}
    </span>
  )
}

// ─── Payment method ────────────────────────────────────────────────────────

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  BANK_TRANSFER: 'เงินโอน',
  CREDIT_CARD:   'ตัดบัตร',
  TOPUP:         'ใช้ยอด Topup',
  CASH:          'เงินสด',
  CHEQUE:        'เช็ค',
  OTHER:         'อื่น ๆ',
}

export function formatPaymentMethod(tx: FinancialTransaction): string {
  if (!tx.paymentMethod) return '—'
  if (tx.paymentMethod === 'CREDIT_CARD' && tx.cardLast4)
    return `ตัดบัตร •••• ${tx.cardLast4}`
  return PAYMENT_METHOD_LABELS[tx.paymentMethod]
}

// ─── Transaction type/status badges ───────────────────────────────────────

export function TxTypeBadge({ type }: { type: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    PAYMENT:    { cls: 'bg-green-100 text-green-700',   label: 'Payment' },
    REFUND:     { cls: 'bg-blue-100 text-blue-700',     label: 'Refund' },
    FORFEITURE: { cls: 'bg-orange-100 text-orange-700', label: 'Forfeiture' },
    ADJUSTMENT: { cls: 'bg-slate-100 text-slate-600',   label: 'Adjustment' },
    REVERSAL:   { cls: 'bg-red-100 text-red-600',       label: 'Reversal' },
  }
  const { cls, label } = map[type] ?? { cls: 'bg-slate-100 text-slate-500', label: type }
  return <span className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium ${cls}`}>{label}</span>
}

export function getTxStatusInfo(type: string, status: string): { label: string; cls: string; tooltip: string } {
  if (type === 'PAYMENT' || type === 'ADJUSTMENT') {
    const m: Record<string, [string, string, string]> = {
      DRAFT:            ['ร่าง',             'bg-slate-100 text-slate-500',   'สร้างรายการไว้แล้ว แต่ยังไม่ได้ส่งตรวจสอบ'],
      PENDING:          ['รอตรวจสอบ',        'bg-yellow-100 text-yellow-700', 'รอผู้มีสิทธิ์ตรวจสอบและอนุมัติ'],
      PENDING_APPROVAL: ['รอตรวจสอบ',        'bg-yellow-100 text-yellow-700', 'รอผู้มีสิทธิ์ตรวจสอบและอนุมัติ'],
      COMPLETED:        ['ชำระสำเร็จ',       'bg-green-100 text-green-700',   'ตรวจสอบและยืนยันการจ่ายเรียบร้อยแล้ว'],
      CONFIRMED:        ['ชำระสำเร็จ',       'bg-green-100 text-green-700',   'ตรวจสอบและยืนยันการจ่ายเรียบร้อยแล้ว'],
      FAILED:           ['ล้มเหลว',          'bg-red-100 text-red-600',       'การชำระเงินล้มเหลว'],
      REJECTED:         ['ไม่อนุมัติ',       'bg-rose-100 text-rose-600',     'รายการไม่ผ่านการตรวจสอบ'],
      CANCELLED:                  ['ยกเลิก',                    'bg-slate-100 text-slate-500',   'รายการถูกยกเลิกและไม่นำมาคำนวณ'],
      REVERSED:                   ['กลับรายการแล้ว',            'bg-purple-100 text-purple-700', 'มีรายการ Reversal เพื่อล้างผลของรายการเดิมแล้ว'],
      PENDING_ACCOUNTING_REVIEW:  ['รอฝ่ายบัญชีตรวจสอบ',       'bg-orange-100 text-orange-700', 'รอฝ่ายบัญชีตรวจสอบและลงบัญชี'],
      PENDING_MANAGER_APPROVAL:   ['รออนุมัติผู้จัดการ',         'bg-yellow-100 text-yellow-700', 'รอผู้จัดการฝ่ายบัญชีอนุมัติ'],
      POSTED:                     ['ลงบัญชีแล้ว',               'bg-green-100 text-green-700',   'ลงบัญชีแล้ว — ยอดสมบูรณ์'],
      VOIDED:                     ['ยกเลิกรายการ',              'bg-slate-100 text-slate-500',   'รายการถูก Void — ไม่นำมาคำนวณ'],
    }
    const [label, cls, tooltip] = m[status] ?? [status, 'bg-slate-100 text-slate-500', status]
    return { label, cls, tooltip }
  }
  if (type === 'REFUND') {
    const m: Record<string, [string, string, string]> = {
      REQUESTED:                  ['ขอคืนเงิน',                'bg-yellow-100 text-yellow-700', 'ส่งคำขอคืนเงินแล้ว แต่ยังไม่ได้รับอนุมัติ'],
      APPROVED:                   ['อนุมัติคืนเงิน',           'bg-blue-100 text-blue-700',     'อนุมัติคำขอแล้ว แต่ยังไม่ได้รับเงินจริง'],
      RECEIVED:                   ['ได้รับเงินคืนแล้ว',        'bg-green-100 text-green-700',   'ได้รับเงินคืนจริงและยืนยันเรียบร้อยแล้ว'],
      REJECTED:                   ['ไม่อนุมัติคืนเงิน',       'bg-rose-100 text-rose-600',     'รายการไม่ผ่านการตรวจสอบ'],
      CANCELLED:                  ['ยกเลิกคำขอคืนเงิน',       'bg-slate-100 text-slate-500',   'รายการถูกยกเลิกและไม่นำมาคำนวณ'],
      REVERSED:                   ['กลับรายการแล้ว',           'bg-purple-100 text-purple-700', 'มีรายการ Reversal เพื่อล้างผลของรายการเดิมแล้ว'],
      PENDING_ACCOUNTING_REVIEW:  ['รอฝ่ายบัญชีตรวจสอบ',      'bg-orange-100 text-orange-700', 'รอฝ่ายบัญชีตรวจสอบและลงบัญชี'],
      PENDING_MANAGER_APPROVAL:   ['รออนุมัติผู้จัดการ',        'bg-yellow-100 text-yellow-700', 'รอผู้จัดการฝ่ายบัญชีอนุมัติ'],
      POSTED:                     ['ลงบัญชีแล้ว',              'bg-green-100 text-green-700',   'ลงบัญชีแล้ว — ยอดสมบูรณ์'],
      VOIDED:                     ['ยกเลิกรายการ',             'bg-slate-100 text-slate-500',   'รายการถูก Void — ไม่นำมาคำนวณ'],
    }
    const [label, cls, tooltip] = m[status] ?? [status, 'bg-slate-100 text-slate-500', status]
    return { label, cls, tooltip }
  }
  if (type === 'FORFEITURE') {
    const m: Record<string, [string, string, string]> = {
      PENDING_CONFIRMATION: ['รอยืนยันการถูกยึด',   'bg-orange-100 text-orange-600', 'ยังอยู่ระหว่างตรวจสอบว่าถูกยึดเงินจริงหรือไม่'],
      CONFIRMED:            ['ยืนยันถูกยึดแล้ว',     'bg-red-100 text-red-700',       'ยืนยันว่าเงินถูกยึดและไม่สามารถเรียกคืนได้'],
      DISPUTED:             ['อยู่ระหว่างโต้แย้ง',   'bg-orange-100 text-orange-700', 'อยู่ระหว่างเจรจาหรือคัดค้านการถูกยึด'],
      CANCELLED:            ['ยกเลิกรายการถูกยึด',   'bg-slate-100 text-slate-500',   'รายการถูกยกเลิกและไม่นำมาคำนวณ'],
      REVERSED:             ['กลับรายการแล้ว',        'bg-purple-100 text-purple-700', 'มีรายการ Reversal เพื่อล้างผลของรายการเดิมแล้ว'],
    }
    const [label, cls, tooltip] = m[status] ?? [status, 'bg-slate-100 text-slate-500', status]
    return { label, cls, tooltip }
  }
  if (type === 'REVERSAL') {
    return { label: 'กลับรายการแล้ว', cls: 'bg-purple-100 text-purple-700', tooltip: 'รายการ Reversal ที่สร้างขึ้นเพื่อล้างผลรายการเดิม' }
  }
  return { label: status, cls: 'bg-slate-100 text-slate-500', tooltip: status }
}

export function TxStatusBadge({ type, status }: { type: string; status: string }) {
  const { label, cls, tooltip } = getTxStatusInfo(type, status)
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium cursor-help ${cls}`}>
      {label}
    </span>
  )
}

// ─── Payment schedule badges ───────────────────────────────────────────────

export function PaymentStatusBadge({ status }: { status: PaymentScheduleItem['paymentStatus'] }) {
  if (status === 'PAID')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-green-100 text-green-700">ชำระแล้ว</span>
  if (status === 'PARTIALLY_PAID')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">ชำระบางส่วน</span>
  if (status === 'UNPAID')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-red-100 text-red-600">ยังไม่ชำระ</span>
  return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-700">รอชำระ</span>
}

export function TimingStatusBadge({ status, days }: { status: PaymentScheduleItem['timingStatus']; days?: number | null }) {
  if (status === 'PAID_ON_TIME')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-green-50 text-green-600 border border-green-200">ชำระตรงเวลา</span>
  if (status === 'PAID_LATE')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-orange-100 text-orange-600">ชำระล่าช้า {days} วัน</span>
  if (status === 'OVERDUE')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-red-100 text-red-600">เกินกำหนด{days ? ` ${days} วัน` : ''}</span>
  if (status === 'PENDING_MORE')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-blue-50 text-blue-600">รอชำระเพิ่ม</span>
  return null  // NOT_DUE: no timing badge
}

// ─── Per-seat schedule labels & badges ─────────────────────────────────────

export const SEAT_BASIS_LABELS: Record<string, string> = {
  INITIAL_SEAT:        'จำนวนที่นั่งเริ่มต้น',
  REMAINING_AT_CUTOFF: 'ที่นั่งคงเหลือ ณ วันล็อกยอด',
  MANUAL_SEAT:         'ระบุจำนวนเอง',
}

export const AMOUNT_MODE_LABELS: Record<string, string> = {
  PER_SEAT_FIXED:      'อัตราคงที่ต่อที่นั่ง',
  PERCENT_PER_SEAT:    'เปอร์เซ็นต์ต่อที่นั่ง',
  REMAINING_PER_SEAT:  'ยอดคงเหลือต่อที่นั่ง',
  FIXED_TOTAL:         'ยอดรวมตายตัว',
}

export const STAGE_STATUS_INFO: Record<StageStatus, { label: string; cls: string }> = {
  WAITING_CALCULATION: { label: 'รอคำนวณ',       cls: 'bg-slate-100 text-slate-500' },
  ESTIMATED:           { label: 'ยอดประมาณการ',  cls: 'bg-sky-100 text-sky-700' },
  LOCKED:              { label: 'ล็อกยอดแล้ว',   cls: 'bg-[#05a94f]/10 text-[#05a94f]' },
  REQUESTED:           { label: 'สร้างใบเบิกแล้ว', cls: 'bg-blue-100 text-blue-700' },
  PARTIALLY_PAID:      { label: 'จ่ายบางส่วน',   cls: 'bg-yellow-100 text-yellow-700' },
  PAID:                { label: 'จ่ายแล้ว',       cls: 'bg-green-100 text-green-700' },
  ADJUSTED:            { label: 'ปรับยอดแล้ว',   cls: 'bg-orange-100 text-orange-600' },
  CANCELLED:           { label: 'ยกเลิก',         cls: 'bg-red-100 text-red-600' },
}

export function StageStatusBadge({ status }: { status: StageStatus | undefined }) {
  if (!status) return null
  const { label, cls } = STAGE_STATUS_INFO[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500' }
  return <span className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium ${cls}`}>{label}</span>
}

// ─── Payment summary cell (used in the List PNR table's Payment column) ───

export function PaymentSummaryCell({ summary, txCount, currency, onClick }: {
  summary: PNRFinancialSummary | null
  txCount: number
  currency: string
  onClick: () => void
}) {
  if (!summary || summary.requiredAmount === 0) {
    return <span className="text-xs text-slate-400">ยังไม่ได้กำหนดการชำระ</span>
  }
  const isPaid = summary.paidAmount >= summary.requiredAmount
  // outstanding = MAX(required - paid, 0) — ไม่นำ refund/forfeiture มาคำนวณ
  const outstanding = Math.max(0, summary.requiredAmount - summary.paidAmount)
  const methodEntries = Object.entries(summary.methodBreakdown) as [PaymentMethod, number][]
  const METHOD_SHORT: Record<PaymentMethod, string> = {
    BANK_TRANSFER: 'โอน', CREDIT_CARD: 'บัตร', TOPUP: 'Topup',
    CASH: 'สด', CHEQUE: 'เช็ค', OTHER: 'อื่นๆ',
  }
  return (
    <button onClick={onClick} className="text-left w-full hover:opacity-75 transition-opacity" title="ดูรายละเอียดการชำระเงิน">
      <div className="space-y-0.5">
        {isPaid ? (
          <p className="text-[11px] font-semibold text-[#05a94f]">
            ชำระครบแล้ว {formatNumber(summary.paidAmount)} {currency}
          </p>
        ) : (
          <>
            <p className={`text-[11px] font-semibold ${summary.paidAmount > 0 ? 'text-[#05a94f]' : 'text-slate-500'}`}>
              ชำระแล้ว {formatNumber(summary.paidAmount)} {currency}
            </p>
            <p className="text-[11px] text-amber-600">
              คงเหลือ {formatNumber(outstanding)} {currency}
            </p>
          </>
        )}
        {methodEntries.length > 0 && (
          <p className="text-[10px] text-slate-400 leading-tight">
            {methodEntries.map(([m, v]) => `${METHOD_SHORT[m]} ${formatNumber(v)}`).join(' · ')}
          </p>
        )}
      </div>
    </button>
  )
}
