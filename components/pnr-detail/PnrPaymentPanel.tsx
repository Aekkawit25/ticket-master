'use client'

// ─── PNR Payment Panel ─────────────────────────────────────────────────────────
// Interactive payment/transaction engine for a single PNR: financial summary
// cards, Payment Schedule / Transaction History tabs, record-transaction modal,
// lock-payment-stage modal, status-change modal, and the ticket-staff /
// accounting-staff financial request + posting flow.
//
// Ported from the former `ViewDrawer` slide-over (previously in app/pnr/page.tsx)
// as part of retiring the drawer in favor of a full PNR Detail page — this is
// the same real business logic and API surface (buildPaymentSchedule,
// deriveScheduleWithTransactions, calcPNRFinancialSummary, lockPaymentStage,
// saveFinancialRequest, ...), only the outer chrome changed (no longer a
// slide-over; rendered as the Detail page's "Payment" tab content).

import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  buildPaymentSchedule, deriveScheduleWithTransactions, calcPNRFinancialSummary,
  lockPaymentStage, isPostedStatus,
  type DemoStock, type PaymentScheduleItem, type FinancialTransaction, type TransactionType, type PaymentMethod,
} from '@/lib/demo-storage'
import { formatCurrency, formatNumber, formatDate, formatDateTime, cn, PAYMENT_TYPE_LABELS } from '@/lib/utils'
import { isTicketRole, isAccountingRole, USER_ROLE_LABELS, type UserRole } from '@/lib/auth'
import {
  getRequestsForPNR, saveFinancialRequest, generateRequestId, generateIdempotencyKey, checkDuplicateRef,
  REQUEST_TYPE_LABELS, REQUEST_STATUS_INFO, type FinancialRequest, type RequestType,
} from '@/lib/financial-requests-storage'
import type { PnrListRow } from '@/lib/pnr-display'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TimeInput } from '@/components/ui/time-input'
import { Modal } from '@/components/ui/modal'
import {
  PAYMENT_METHOD_LABELS, formatPaymentMethod, TxTypeBadge, getTxStatusInfo, TxStatusBadge,
  PaymentStatusBadge, TimingStatusBadge, SEAT_BASIS_LABELS, AMOUNT_MODE_LABELS, StageStatusBadge,
} from '@/components/pnr-detail/badges'
import { Plus } from 'lucide-react'

type TxModalType = 'payment' | 'refund' | 'forfeiture' | 'adjustment'

const INIT_TX_ACTION_FORM = {
  effectiveDate: '',
  effectiveTime: '',
  referenceNo: '',
  reason: '',
  remark: '',
}

const INIT_LOCK_FORM = {
  seatCount: '',
  manualReason: '',
}

const INIT_TX_FORM = {
  paymentStageId: '',
  originalTransactionId: '',
  paymentMethod: 'BANK_TRANSFER' as PaymentMethod,
  amount: '',
  feeAmount: '',
  transactionDate: '',
  transactionTime: '',
  referenceNo: '',
  creditNoteNo: '',
  reasonCode: '',
  remark: '',
  status: 'COMPLETED',
  // Bank Transfer
  sourceBank: '',
  destinationBank: '',
  transferReference: '',
  // Credit Card
  cardBrand: '',
  cardLast4: '',
  authorizationCode: '',
  // Topup
  topupAccountId: '',
  topupReference: '',
  topupBalanceBefore: '',
}

const INIT_FIN_REQ_FORM = {
  requestType: 'PAYMENT' as RequestType,
  stageId: '',
  amount: '',
  currencyCode: 'THB',
  transactionDate: new Date().toISOString().slice(0, 10),
  referenceNo: '',
  reason: '',
  remark: '',
  attachmentName: '',
}

const INIT_ACCT_POST_FORM = {
  postingDate: new Date().toISOString().slice(0, 10),
  voucherNo: '',
  bankAccount: '',
  accountingNote: '',
}

type TxMenuItem = { label: string; action: string; newStatus?: string; danger?: boolean; disabled?: boolean }

function getTxMenuActions(tx: FinancialTransaction): TxMenuItem[] {
  const { transactionType: type, status } = tx
  if (type === 'PAYMENT') {
    if (status === 'DRAFT')
      return [
        { label: 'แก้ไขรายการ',    action: 'view' },
        { label: 'ส่งตรวจสอบ',     action: 'change_status', newStatus: 'PENDING_APPROVAL' },
        { label: 'ยกเลิก',          action: 'change_status', newStatus: 'CANCELLED', danger: true },
      ]
    if (status === 'PENDING_APPROVAL' || status === 'PENDING')
      return [
        { label: 'อนุมัติการจ่าย', action: 'change_status', newStatus: 'COMPLETED' },
        { label: 'ไม่อนุมัติ',     action: 'change_status', newStatus: 'REJECTED', danger: true },
        { label: 'ดูรายละเอียด',   action: 'view' },
        { label: 'ดูหลักฐาน',      action: 'view_attachment', disabled: !tx.attachmentUrl },
      ]
    if (status === 'COMPLETED' || status === 'CONFIRMED')
      return [
        { label: 'ดูรายละเอียด', action: 'view' },
        { label: 'ดูหลักฐาน',    action: 'view_attachment', disabled: !tx.attachmentUrl },
        { label: 'กลับรายการ',   action: 'reversal', danger: true },
      ]
    if (status === 'REJECTED')
      return [
        { label: 'แก้ไขและส่งใหม่', action: 'change_status', newStatus: 'PENDING_APPROVAL' },
        { label: 'ดูรายละเอียด',    action: 'view' },
        { label: 'ยกเลิก',           action: 'change_status', newStatus: 'CANCELLED', danger: true },
      ]
    if (status === 'PENDING_ACCOUNTING_REVIEW')
      return [
        { label: 'ยืนยันและลงบัญชี', action: 'accounting_post' },
        { label: 'ปฏิเสธ', action: 'change_status', newStatus: 'REJECTED', danger: true },
      ]
    if (status === 'POSTED')
      return [
        { label: 'ดูรายละเอียด', action: 'view' },
        { label: 'Void รายการ', action: 'change_status', newStatus: 'VOIDED', danger: true, disabled: true },
      ]
    if (status === 'VOIDED')
      return [{ label: 'ดูรายละเอียด', action: 'view' }]
    if (status === 'REVERSED')
      return [{ label: 'ดูรายละเอียด', action: 'view' }]
    return [{ label: 'ดูรายละเอียด', action: 'view' }]
  }
  if (type === 'REFUND') {
    if (status === 'REQUESTED')
      return [
        { label: 'อนุมัติคืนเงิน',     action: 'change_status', newStatus: 'APPROVED' },
        { label: 'ไม่อนุมัติคืนเงิน', action: 'change_status', newStatus: 'REJECTED', danger: true },
        { label: 'ยกเลิกคำขอ',         action: 'change_status', newStatus: 'CANCELLED', danger: true },
        { label: 'ดูรายละเอียด',       action: 'view' },
      ]
    if (status === 'APPROVED')
      return [
        { label: 'ยืนยันได้รับเงินคืนแล้ว', action: 'change_status', newStatus: 'RECEIVED' },
        { label: 'ยกเลิกคำขอ',              action: 'change_status', newStatus: 'CANCELLED', danger: true },
        { label: 'ดูรายละเอียด',            action: 'view' },
      ]
    if (status === 'RECEIVED')
      return [
        { label: 'ดูรายละเอียด', action: 'view' },
        { label: 'ดูหลักฐาน',    action: 'view_attachment', disabled: !tx.attachmentUrl },
        { label: 'กลับรายการ',   action: 'reversal', danger: true },
      ]
    return [{ label: 'ดูรายละเอียด', action: 'view' }]
  }
  if (type === 'FORFEITURE') {
    if (status === 'PENDING_CONFIRMATION')
      return [
        { label: 'ยืนยันการถูกยึด',          action: 'change_status', newStatus: 'CONFIRMED' },
        { label: 'ระบุว่าอยู่ระหว่างโต้แย้ง', action: 'change_status', newStatus: 'DISPUTED' },
        { label: 'ยกเลิกรายการ',              action: 'change_status', newStatus: 'CANCELLED', danger: true },
        { label: 'ดูรายละเอียด',              action: 'view' },
      ]
    if (status === 'DISPUTED')
      return [
        { label: 'ยืนยันการถูกยึด', action: 'change_status', newStatus: 'CONFIRMED' },
        { label: 'ยกเลิกรายการ',    action: 'change_status', newStatus: 'CANCELLED', danger: true },
        { label: 'เพิ่มหมายเหตุ',   action: 'view' },
        { label: 'ดูรายละเอียด',    action: 'view' },
      ]
    if (status === 'CONFIRMED')
      return [
        { label: 'ดูรายละเอียด', action: 'view' },
        { label: 'ดูหลักฐาน',    action: 'view_attachment', disabled: !tx.attachmentUrl },
        { label: 'กลับรายการ',   action: 'reversal', danger: true },
      ]
    return [{ label: 'ดูรายละเอียด', action: 'view' }]
  }
  return [{ label: 'ดูรายละเอียด', action: 'view' }]
}

// ─── Financial Request Modal (Ticket Staff) ───────────────────────────────────

function FinancialRequestModal({
  open, onClose, row, scheduleItems, currentRole, onSaved,
}: {
  open: boolean
  onClose: () => void
  row: PnrListRow
  scheduleItems: PaymentScheduleItem[]
  currentRole: UserRole
  onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState(() => ({ ...INIT_FIN_REQ_FORM, transactionDate: today }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const resetForm = () => {
    setForm({ ...INIT_FIN_REQ_FORM, transactionDate: new Date().toISOString().slice(0, 10) })
    setError('')
  }

  const handleSubmit = () => {
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) { setError('กรุณากรอกจำนวนเงินที่ถูกต้อง'); return }
    if (!form.transactionDate) { setError('กรุณาเลือกวันที่'); return }
    if (!form.reason.trim()) { setError('กรุณาระบุเหตุผล'); return }

    // Check duplicate referenceNo
    if (form.referenceNo.trim()) {
      const dup = checkDuplicateRef(form.referenceNo.trim())
      if (dup) { setError(`เลขอ้างอิง "${form.referenceNo}" ถูกใช้แล้วใน ${dup.requestId}`); return }
    }

    setSaving(true)
    try {
      const now = new Date().toISOString()
      const req: FinancialRequest = {
        requestId: generateRequestId(),
        idempotencyKey: generateIdempotencyKey(),
        stockId: row.stockId,
        pnrId: row.pnrId,
        stageId: form.stageId || null,
        requestType: form.requestType,
        amount,
        currencyCode: row.currency,
        transactionDate: form.transactionDate,
        referenceNo: form.referenceNo.trim(),
        reason: form.reason.trim(),
        remark: form.remark.trim(),
        attachments: form.attachmentName ? [form.attachmentName] : [],
        requestedBy: USER_ROLE_LABELS[currentRole],
        requestedByRole: currentRole,
        requestedDate: now,
        status: 'PENDING_ACCOUNTING_REVIEW',
        reviewedBy: null,
        reviewedDate: null,
        accountingReviewedBy: null,
        accountingReviewedDate: null,
        approvedBy: null,
        approvedDate: null,
        rejectedBy: null,
        rejectedDate: null,
        rejectedReason: null,
        linkedTransactionId: null,
        logs: [{
          logId: `LOG-${Date.now()}`,
          action: `สร้างคำขอ ${REQUEST_TYPE_LABELS[form.requestType]}`,
          actor: USER_ROLE_LABELS[currentRole],
          actorRole: currentRole,
          timestamp: now,
        }],
      }
      saveFinancialRequest(req)
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#05a94f]'
  const selectCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#05a94f] bg-white'

  const handleClose = () => { resetForm(); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title="ส่งคำขอรายการการเงิน" size="md"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleClose}>ยกเลิก</Button>
          <Button size="sm" onClick={handleSubmit} loading={saving}>ส่งคำขอ</Button>
        </>
      }>
      <div className="space-y-3">
        {/* PNR info */}
        <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600">
          <span className="text-slate-400">PNR: </span><span className="font-mono font-semibold">{row.pnrDisplay}</span>
          <span className="mx-2 text-slate-300">|</span>
          <span className="text-slate-400">Series: </span><span>{row.stockCode}</span>
        </div>

        {/* ประเภทคำขอ */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">ประเภทคำขอ <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(REQUEST_TYPE_LABELS) as [RequestType, string][]).map(([k, v]) => (
              <button key={k} type="button"
                onClick={() => setForm(f => ({ ...f, requestType: k }))}
                className={`text-xs px-3 py-2 rounded-lg border text-left transition-colors ${form.requestType === k ? 'border-[#05a94f] bg-green-50 text-[#05a94f] font-medium' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* รอบชำระ */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">รอบชำระ (ถ้ามี)</label>
          <select value={form.stageId} onChange={e => setForm(f => ({ ...f, stageId: e.target.value }))} className={selectCls}>
            <option value="">ไม่ระบุรอบ</option>
            {scheduleItems.map(s => <option key={s.stageId} value={s.stageId}>{s.stageName}</option>)}
          </select>
        </div>

        {/* จำนวนเงิน + วันที่ */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">จำนวนเงิน ({row.currency}) <span className="text-red-500">*</span></label>
            <input type="number" min="0" step="0.01" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0.00" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">วันที่รายการ <span className="text-red-500">*</span></label>
            <input type="date" value={form.transactionDate}
              onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))}
              className={inputCls} />
          </div>
        </div>

        {/* เลขอ้างอิง */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">เอกสารอ้างอิง</label>
          <input type="text" value={form.referenceNo}
            onChange={e => setForm(f => ({ ...f, referenceNo: e.target.value }))}
            placeholder="เลขที่เอกสาร, Invoice No. ฯลฯ"
            className={inputCls} />
        </div>

        {/* เหตุผล */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">เหตุผล <span className="text-red-500">*</span></label>
          <textarea value={form.reason}
            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            rows={2} placeholder="ระบุเหตุผล..."
            className={`${inputCls} resize-none`} />
        </div>

        {/* หมายเหตุ */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">หมายเหตุ</label>
          <textarea value={form.remark}
            onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
            rows={2} placeholder="หมายเหตุเพิ่มเติม..."
            className={`${inputCls} resize-none`} />
        </div>

        {/* ไฟล์แนบ (simulated) */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">ไฟล์แนบ</label>
          <input type="text" value={form.attachmentName}
            onChange={e => setForm(f => ({ ...f, attachmentName: e.target.value }))}
            placeholder="ชื่อไฟล์เอกสาร (เช่น invoice-001.pdf)"
            className={inputCls} />
          <p className="text-[10px] text-slate-400 mt-1">Demo: พิมพ์ชื่อไฟล์แนบ (ระบบจริงจะมี Upload)</p>
        </div>

        {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  )
}

// ─── Accounting Post Modal ────────────────────────────────────────────────────

function AccountingPostModal({
  open, onClose, pendingReq, row, currentRole, onPosted,
}: {
  open: boolean
  onClose: () => void
  pendingReq: FinancialRequest | null
  row: PnrListRow
  currentRole: UserRole
  onPosted: (req: FinancialRequest, tx: FinancialTransaction) => void
}) {
  const [form, setForm] = useState(() => ({ ...INIT_ACCT_POST_FORM, postingDate: new Date().toISOString().slice(0, 10) }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const resetForm = () => {
    setForm({ ...INIT_ACCT_POST_FORM, postingDate: new Date().toISOString().slice(0, 10) })
    setError('')
  }

  if (!pendingReq) return null

  const needsManagerApproval = ['REFUND', 'FORFEITURE', 'ADJUSTMENT'].includes(pendingReq.requestType) && currentRole === 'ACCOUNTING_STAFF'

  const handlePost = () => {
    if (!form.postingDate) { setError('กรุณาระบุวันที่ลงบัญชี'); return }
    if (!form.voucherNo.trim()) { setError('กรุณาระบุ Voucher No.'); return }
    if (needsManagerApproval) { setError('รายการนี้ต้องได้รับอนุมัติจากผู้จัดการฝ่ายบัญชีก่อน'); return }

    setSaving(true)
    try {
      const now = new Date().toISOString()
      const txType: TransactionType = pendingReq.requestType === 'PAYMENT' ? 'PAYMENT'
        : pendingReq.requestType === 'REFUND' ? 'REFUND'
        : pendingReq.requestType === 'FORFEITURE' ? 'FORFEITURE'
        : 'ADJUSTMENT'

      const newTx: FinancialTransaction = {
        transactionId: `TX-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        pnrId: pendingReq.pnrId,
        paymentStageId: pendingReq.stageId,
        originalTransactionId: null,
        transactionType: txType,
        paymentMethod: txType === 'PAYMENT' ? 'BANK_TRANSFER' : null,
        amount: pendingReq.amount,
        feeAmount: 0,
        currencyCode: pendingReq.currencyCode,
        transactionDate: pendingReq.transactionDate,
        paymentDateTime: null,
        status: 'POSTED',
        reasonCode: pendingReq.reason || null,
        referenceNo: pendingReq.referenceNo || null,
        creditNoteNo: null,
        attachmentUrl: null,
        remark: pendingReq.remark || null,
        sourceBank: null, destinationBank: null, transferReference: null,
        cardBrand: null, cardLast4: null, authorizationCode: null,
        topupAccountId: null, topupReference: null, topupBalanceBefore: null, topupUsedAmount: null, topupBalanceAfter: null,
        createdBy: USER_ROLE_LABELS[currentRole],
        approvedBy: USER_ROLE_LABELS[currentRole],
        createdAt: now,
        updatedAt: now,
        // New fields
        postingDate: form.postingDate,
        voucherNo: form.voucherNo.trim(),
        accountingNote: form.accountingNote.trim() || null,
        postedBy: USER_ROLE_LABELS[currentRole],
        linkedRequestId: pendingReq.requestId,
        idempotencyKey: pendingReq.idempotencyKey,
      }

      // Update the request status to APPROVED
      const updatedReq: FinancialRequest = {
        ...pendingReq,
        status: 'APPROVED',
        accountingReviewedBy: USER_ROLE_LABELS[currentRole],
        accountingReviewedDate: now,
        approvedBy: USER_ROLE_LABELS[currentRole],
        approvedDate: now,
        linkedTransactionId: newTx.transactionId,
        logs: [...pendingReq.logs, {
          logId: `LOG-${Date.now()}`,
          action: `ลงบัญชีแล้ว — Voucher: ${form.voucherNo}`,
          actor: USER_ROLE_LABELS[currentRole],
          actorRole: currentRole,
          timestamp: now,
        }],
      }
      saveFinancialRequest(updatedReq)
      onPosted(updatedReq, newTx)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#05a94f]'

  const handleClose = () => { resetForm(); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title="ยืนยันและลงบัญชี" size="sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleClose}>ยกเลิก</Button>
          <Button size="sm" onClick={handlePost} loading={saving} disabled={needsManagerApproval}>
            {needsManagerApproval ? 'ต้องอนุมัติโดยผู้จัดการ' : 'ยืนยันลงบัญชี'}
          </Button>
        </>
      }>
      <div className="space-y-3">
        {/* Request summary */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs">
          <p className="font-semibold text-blue-800 mb-1">{REQUEST_TYPE_LABELS[pendingReq.requestType]} — {pendingReq.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} {pendingReq.currencyCode}</p>
          <p className="text-blue-600">PNR: {row.pnrDisplay} | {pendingReq.reason}</p>
          {pendingReq.referenceNo && <p className="text-blue-500 mt-1">อ้างอิง: {pendingReq.referenceNo}</p>}
        </div>

        {needsManagerApproval && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
            รายการ Refund, ยอดถูกยึด และปรับปรุงยอด ต้องได้รับอนุมัติจากผู้จัดการฝ่ายบัญชีก่อน
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">วันที่ลงบัญชี <span className="text-red-500">*</span></label>
          <input type="date" value={form.postingDate}
            onChange={e => setForm(f => ({ ...f, postingDate: e.target.value }))}
            className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Voucher No. <span className="text-red-500">*</span></label>
          <input type="text" value={form.voucherNo}
            onChange={e => setForm(f => ({ ...f, voucherNo: e.target.value }))}
            placeholder="JV-2026-0001" className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">หมายเหตุฝ่ายบัญชี</label>
          <textarea value={form.accountingNote}
            onChange={e => setForm(f => ({ ...f, accountingNote: e.target.value }))}
            rows={2} placeholder="หมายเหตุ..."
            className={`${inputCls} resize-none`} />
        </div>

        {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  )
}

// ─── Main Panel ────────────────────────────────────────────────────────────

export interface PnrPaymentPanelProps {
  row: PnrListRow
  stock: DemoStock
  currentRole: UserRole
  onTransactionSave: (updated: DemoStock) => void
}

export function PnrPaymentPanel({ row, stock, currentRole, onTransactionSave }: PnrPaymentPanelProps) {
  const router = useRouter()
  const [txTab, setTxTab] = useState<'schedule' | 'history'>('schedule')
  const [txModal, setTxModal] = useState<TxModalType | null>(null)
  const [txForm, setTxForm] = useState({ ...INIT_TX_FORM })
  const [txError, setTxError] = useState('')
  const [txSaving, setTxSaving] = useState(false)
  const [scheduleActionIdx, setScheduleActionIdx] = useState<number | null>(null)
  const [scheduleMenuPos, setScheduleMenuPos] = useState<{
    top: number; right: number; openUp: boolean
  } | null>(null)

  const [txMenuIdx, setTxMenuIdx] = useState<number | null>(null)
  const [txMenuPos, setTxMenuPos] = useState<{ top: number; right: number; openUp: boolean } | null>(null)
  const [txActionModal, setTxActionModal] = useState<{
    tx: FinancialTransaction; newStatus: string; label: string; isReversal: boolean
  } | null>(null)
  const [txActionForm, setTxActionForm] = useState({ ...INIT_TX_ACTION_FORM })
  const [txActionSaving, setTxActionSaving] = useState(false)
  const [txActionError, setTxActionError] = useState('')
  const [txActionConfirm, setTxActionConfirm] = useState(false)

  const [lockModal, setLockModal] = useState<PaymentScheduleItem | null>(null)
  const [lockForm, setLockForm] = useState({ ...INIT_LOCK_FORM })
  const [lockError, setLockError] = useState('')
  const [lockSaving, setLockSaving] = useState(false)

  // Financial request state (ticket role)
  const [finReqModal, setFinReqModal] = useState(false)
  const [finReqRefresh, setFinReqRefresh] = useState(0)

  // Accounting post state
  const [acctPostModal, setAcctPostModal] = useState<FinancialRequest | null>(null)

  // Financial requests for this PNR — re-derived whenever pnrId or finReqRefresh changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pnrRequests = useMemo(() => getRequestsForPNR(row.pnrId), [row.pnrId, finReqRefresh])

  const pnrTx = useMemo(() =>
    (stock.transactions ?? []).filter(t => t.pnrId === row.pnrId),
    [stock, row.pnrId])

  const scheduleItems = useMemo(() => {
    const raw = buildPaymentSchedule(stock).filter(i => i.pnrId === row.pnrId)
    return deriveScheduleWithTransactions(raw, stock.transactions ?? [])
  }, [stock, row.pnrId])

  const requiredAmount = useMemo(() => {
    const LOCKED_STATUSES = ['LOCKED', 'REQUESTED', 'PARTIALLY_PAID', 'PAID', 'ADJUSTED']
    const pnrSchedule = scheduleItems.filter(i => i.pnrId === row.pnrId)
    const hasPerSeat = pnrSchedule.some(i => i.amountMode)
    if (hasPerSeat) {
      return pnrSchedule
        .filter(i => i.stageStatus && LOCKED_STATUSES.includes(i.stageStatus))
        .reduce((s, i) => s + (i.confirmedAmount ?? i.amount), 0)
    }
    return pnrSchedule.reduce((s, i) => s + i.amount, 0) || row.total
  }, [scheduleItems, row.pnrId, row.total])

  const financialSummary = useMemo(() =>
    calcPNRFinancialSummary(row.pnrId, stock.transactions ?? [], requiredAmount, scheduleItems),
    [row.pnrId, stock.transactions, requiredAmount, scheduleItems])

  const maxRefundable = useMemo(() => {
    if (!txForm.originalTransactionId) return 0
    const origTx = (stock.transactions ?? []).find(t => t.transactionId === txForm.originalTransactionId)
    if (!origTx) return 0
    const used = (stock.transactions ?? [])
      .filter(t =>
        t.originalTransactionId === txForm.originalTransactionId &&
        (t.transactionType === 'REFUND' || t.transactionType === 'FORFEITURE') &&
        isPostedStatus(t)
      )
      .reduce((s, t) => s + t.amount, 0)
    return Math.max(0, origTx.amount - used)
  }, [txForm.originalTransactionId, stock])

  const condition = stock.conditions.find(sc => sc.condition.conditionCode === row.conditionCode)?.condition

  const openTxModal = (type: TxModalType, presetStageId?: string) => {
    const now = new Date()
    // Auto-select stage when: no presetStageId + only 1 stage exists (prevents null paymentStageId)
    const autoStageId = presetStageId
      ?? (type === 'payment' && scheduleItems.length === 1 ? scheduleItems[0].stageId : '')
    setTxForm({
      ...INIT_TX_FORM,
      paymentStageId: autoStageId,
      transactionDate: now.toISOString().slice(0, 10),
      transactionTime: now.toTimeString().slice(0, 5),
      status: 'POSTED',
    })
    setTxError('')
    setTxModal(type)
  }

  const handleTxSave = async () => {
    const amount = parseFloat(txForm.amount)
    if (isNaN(amount) || amount <= 0) { setTxError('กรุณากรอกจำนวนเงินที่ถูกต้อง'); return }
    if (!txForm.transactionDate) { setTxError('กรุณาเลือกวันที่'); return }
    if ((txModal === 'refund' || txModal === 'forfeiture') && !txForm.originalTransactionId) {
      setTxError('กรุณาเลือก Payment ต้นทาง'); return
    }
    if ((txModal === 'refund' || txModal === 'forfeiture') && txForm.originalTransactionId) {
      if (amount > maxRefundable) {
        setTxError(`จำนวนเงินเกินวงเงินคงเหลือ (${formatCurrency(maxRefundable, row.currency)})`); return
      }
    }
    if (txModal === 'payment' && txForm.paymentMethod === 'TOPUP' && txForm.topupBalanceBefore) {
      const topupBefore = parseFloat(txForm.topupBalanceBefore)
      if (!isNaN(topupBefore) && amount > topupBefore) {
        setTxError(`จำนวนเงินเกินยอด Topup คงเหลือ (${formatCurrency(topupBefore, row.currency)})`); return
      }
    }
    setTxSaving(true)
    try {
      const now = new Date().toISOString()
      const txType: TransactionType = txModal === 'payment' ? 'PAYMENT'
        : txModal === 'refund' ? 'REFUND'
        : txModal === 'forfeiture' ? 'FORFEITURE'
        : 'ADJUSTMENT'
      const feeAmount = parseFloat(txForm.feeAmount) || 0
      const topupBefore = txForm.topupBalanceBefore ? parseFloat(txForm.topupBalanceBefore) : null
      const methodLabel = txType === 'PAYMENT' ? ` ผ่าน${PAYMENT_METHOD_LABELS[txForm.paymentMethod]}` : ''
      // Fallback: if stageId still empty and only 1 stage exists, auto-link to prevent null
      const resolvedStageId = txForm.paymentStageId
        || (txType === 'PAYMENT' && scheduleItems.length === 1 ? scheduleItems[0].stageId : null)
        || null
      const newTx: FinancialTransaction = {
        transactionId: `TX-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        pnrId: row.pnrId,
        paymentStageId: resolvedStageId,
        originalTransactionId: txForm.originalTransactionId || null,
        transactionType: txType,
        paymentMethod: txType === 'PAYMENT' ? txForm.paymentMethod : null,
        amount,
        feeAmount,
        currencyCode: row.currency,
        transactionDate: txForm.transactionDate,
        paymentDateTime: txForm.transactionTime
          ? `${txForm.transactionDate}T${txForm.transactionTime}:00`
          : null,
        status: txForm.status,
        reasonCode: txForm.reasonCode || null,
        referenceNo: txForm.referenceNo || null,
        creditNoteNo: txForm.creditNoteNo || null,
        attachmentUrl: null,
        remark: txForm.remark || null,
        // Bank Transfer
        sourceBank: txForm.paymentMethod === 'BANK_TRANSFER' ? txForm.sourceBank || null : null,
        destinationBank: txForm.paymentMethod === 'BANK_TRANSFER' ? txForm.destinationBank || null : null,
        transferReference: txForm.paymentMethod === 'BANK_TRANSFER' ? txForm.transferReference || null : null,
        // Credit Card
        cardBrand: txForm.paymentMethod === 'CREDIT_CARD' ? txForm.cardBrand || null : null,
        cardLast4: txForm.paymentMethod === 'CREDIT_CARD' ? txForm.cardLast4 || null : null,
        authorizationCode: txForm.paymentMethod === 'CREDIT_CARD' ? txForm.authorizationCode || null : null,
        // Topup
        topupAccountId: txForm.paymentMethod === 'TOPUP' ? txForm.topupAccountId || null : null,
        topupReference: txForm.paymentMethod === 'TOPUP' ? txForm.topupReference || null : null,
        topupBalanceBefore: txForm.paymentMethod === 'TOPUP' ? topupBefore : null,
        topupUsedAmount: txForm.paymentMethod === 'TOPUP' ? amount : null,
        topupBalanceAfter: txForm.paymentMethod === 'TOPUP' && topupBefore !== null ? topupBefore - amount : null,
        createdBy: 'Demo User',
        approvedBy: null,
        createdAt: now,
        updatedAt: now,
      }
      const updated: DemoStock = {
        ...stock,
        transactions: [...(stock.transactions ?? []), newTx],
        logs: [...stock.logs, {
          logId: `LOG-${Date.now()}`,
          action: `${txType}_RECORDED`,
          message: `บันทึก ${txType} ${formatCurrency(amount, row.currency)}${methodLabel}${txForm.referenceNo ? ` Ref: ${txForm.referenceNo}` : ''}`,
          createdAt: now,
          createdBy: 'Demo User',
        }],
      }
      onTransactionSave(updated)
      setTxModal(null)
      setTxError('')
      setTxTab('history')
    } finally {
      setTxSaving(false)
    }
  }

  const CRITICAL_STATUSES = ['COMPLETED', 'RECEIVED', 'CONFIRMED']

  const openTxAction = (tx: FinancialTransaction, action: string, newStatus: string, label: string) => {
    const now = new Date()
    setTxActionForm({
      ...INIT_TX_ACTION_FORM,
      effectiveDate: now.toISOString().slice(0, 10),
      effectiveTime: now.toTimeString().slice(0, 5),
    })
    setTxActionError('')
    setTxActionConfirm(false)
    setTxActionModal({ tx, newStatus, label, isReversal: action === 'reversal' })
  }

  const handleStatusChange = async () => {
    if (!txActionModal) return
    const { tx, newStatus, isReversal } = txActionModal
    if (!txActionForm.reason) { setTxActionError('กรุณากรอกเหตุผลในการเปลี่ยนสถานะ'); return }
    setTxActionSaving(true)
    try {
      const now = new Date().toISOString()
      const currentInfo = getTxStatusInfo(tx.transactionType, tx.status)
      const newInfo = isReversal
        ? { label: 'กลับรายการแล้ว' }
        : getTxStatusInfo(tx.transactionType, newStatus)
      if (isReversal) {
        const reversalTx: FinancialTransaction = {
          transactionId: `TX-${Date.now()}-REV`,
          pnrId: tx.pnrId,
          paymentStageId: tx.paymentStageId,
          originalTransactionId: tx.transactionId,
          transactionType: 'REVERSAL',
          paymentMethod: null,
          amount: tx.amount,
          feeAmount: 0,
          currencyCode: tx.currencyCode,
          transactionDate: txActionForm.effectiveDate || now.slice(0, 10),
          paymentDateTime: txActionForm.effectiveTime
            ? `${txActionForm.effectiveDate}T${txActionForm.effectiveTime}:00`
            : null,
          status: 'COMPLETED',
          reasonCode: txActionForm.reason || null,
          referenceNo: txActionForm.referenceNo || null,
          creditNoteNo: null, attachmentUrl: null,
          remark: txActionForm.remark || null,
          sourceBank: null, destinationBank: null, transferReference: null,
          cardBrand: null, cardLast4: null, authorizationCode: null,
          topupAccountId: null, topupReference: null,
          topupBalanceBefore: null, topupUsedAmount: null, topupBalanceAfter: null,
          createdBy: 'Demo User', approvedBy: 'Demo User',
          createdAt: now, updatedAt: now,
        }
        const updated: DemoStock = {
          ...stock,
          transactions: [
            ...(stock.transactions ?? []).map(t =>
              t.transactionId === tx.transactionId ? { ...t, status: 'REVERSED', updatedAt: now } : t
            ),
            reversalTx,
          ],
          logs: [...stock.logs, {
            logId: `LOG-${Date.now()}`,
            action: 'REVERSAL_CREATED',
            message: `กลับรายการ ${tx.transactionType} ${formatCurrency(tx.amount, tx.currencyCode)} จาก "${currentInfo.label}" (${tx.status})${txActionForm.reason ? ` เหตุผล: ${txActionForm.reason}` : ''}`,
            createdAt: now, createdBy: 'Demo User',
          }],
        }
        onTransactionSave(updated)
      } else {
        const updatedTx: FinancialTransaction = {
          ...tx, status: newStatus, updatedAt: now,
          referenceNo: txActionForm.referenceNo || tx.referenceNo,
          remark: txActionForm.remark
            ? (tx.remark ? `${tx.remark}\n${txActionForm.remark}` : txActionForm.remark)
            : tx.remark,
          approvedBy: CRITICAL_STATUSES.includes(newStatus) ? 'Demo User' : tx.approvedBy,
        }
        const updated: DemoStock = {
          ...stock,
          transactions: (stock.transactions ?? []).map(t =>
            t.transactionId === tx.transactionId ? updatedTx : t
          ),
          logs: [...stock.logs, {
            logId: `LOG-${Date.now()}`,
            action: 'STATUS_CHANGED',
            message: `เปลี่ยนสถานะ ${tx.transactionType} จาก "${currentInfo.label}" (${tx.status}) เป็น "${newInfo.label}" (${newStatus})${txActionForm.reason ? ` เหตุผล: ${txActionForm.reason}` : ''}`,
            createdAt: now, createdBy: 'Demo User',
          }],
        }
        onTransactionSave(updated)
      }
      setTxActionModal(null)
      setTxActionForm({ ...INIT_TX_ACTION_FORM })
      setTxActionConfirm(false)
    } finally {
      setTxActionSaving(false)
    }
  }

  const openLockModal = (si: PaymentScheduleItem) => {
    const pnr = stock.pnrs.find(p => p.pnrId === row.pnrId)
    const basis = si.seatBasis ?? 'REMAINING_AT_CUTOFF'
    let defaultSeat = ''
    if (basis === 'INITIAL_SEAT') {
      defaultSeat = String(pnr?.initialSeatCount ?? pnr?.seatTotal ?? '')
    } else if (basis === 'REMAINING_AT_CUTOFF') {
      defaultSeat = String(pnr?.seatBalance ?? pnr?.seatTotal ?? '')
    }
    setLockForm({ seatCount: defaultSeat, manualReason: '' })
    setLockError('')
    setLockModal(si)
  }

  const handleLockStage = async () => {
    if (!lockModal) return
    const seats = parseInt(lockForm.seatCount)
    if (isNaN(seats) || seats < 0) { setLockError('กรุณากรอกจำนวนที่นั่งที่ถูกต้อง'); return }
    if (lockModal.seatBasis === 'MANUAL_SEAT' && !lockForm.manualReason) {
      setLockError('กรุณาระบุเหตุผลสำหรับการกำหนดจำนวนที่นั่งเอง'); return
    }
    setLockSaving(true)
    try {
      const ratePerSeat = lockModal.ratePerSeat ?? 0
      const updated = lockPaymentStage(
        stock, row.pnrId, lockModal.stageId, seats, ratePerSeat, 'Demo User',
        lockModal.seatBasis === 'MANUAL_SEAT' ? lockForm.manualReason : undefined
      )
      onTransactionSave(updated)
      setLockModal(null)
      setLockForm({ ...INIT_LOCK_FORM })
    } finally {
      setLockSaving(false)
    }
  }

  const selectCls = 'w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#05a94f]'
  const inputCls  = 'w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#05a94f]'
  const completedPayments = pnrTx.filter(
    t => t.transactionType === 'PAYMENT' && isPostedStatus(t)
  )
  // Balance info for payment modal — use derived schedule data (paidForStage already computed)
  const selectedStageItem = scheduleItems.find(si => si.stageId === txForm.paymentStageId)
  const stageRequired = selectedStageItem ? (selectedStageItem.confirmedAmount ?? selectedStageItem.amount) : 0
  const stagePaidSoFar = selectedStageItem?.paidForStage ?? 0
  const stageRemaining = Math.max(0, stageRequired - stagePaidSoFar)
  const currentAmount = parseFloat(txForm.amount) || 0
  const topupBalanceAfterPreview = txForm.topupBalanceBefore
    ? Math.max(0, parseFloat(txForm.topupBalanceBefore) - currentAmount)
    : null

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      {/* Header + Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex-shrink-0">
            Payment & Financial Transactions
          </p>
          {/* Pending requests indicator */}
          {pnrRequests.filter(r => r.status === 'PENDING_ACCOUNTING_REVIEW' || r.status === 'PENDING_MANAGER_APPROVAL').length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">
              {pnrRequests.filter(r => r.status === 'PENDING_ACCOUNTING_REVIEW' || r.status === 'PENDING_MANAGER_APPROVAL').length} รายการรอตรวจสอบ
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {/* TICKET STAFF/SUPERVISOR: Single request button */}
          {isTicketRole(currentRole) && (
            <button onClick={() => setFinReqModal(true)}
              className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-[#05a94f] text-white hover:bg-[#048a3f] transition-colors whitespace-nowrap">
              <Plus size={11} />ส่งคำขอรายการการเงิน
            </button>
          )}
          {/* ACCOUNTING STAFF/MANAGER: Existing buttons (now post directly) */}
          {isAccountingRole(currentRole) && (
            <>
              <button onClick={() => openTxModal('payment')}
                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-[#05a94f] text-white hover:bg-[#048a3f] transition-colors whitespace-nowrap">
                <Plus size={11} />ยืนยันการจ่าย
              </button>
              <button onClick={() => openTxModal('refund')}
                className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg text-white transition-colors whitespace-nowrap ${currentRole === 'ACCOUNTING_MANAGER' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-300 cursor-not-allowed'}`}
                disabled={currentRole !== 'ACCOUNTING_MANAGER'}>
                <Plus size={11} />ยืนยัน Refund
              </button>
              <button onClick={() => openTxModal('forfeiture')}
                className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg text-white transition-colors whitespace-nowrap ${currentRole === 'ACCOUNTING_MANAGER' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-orange-300 cursor-not-allowed'}`}
                disabled={currentRole !== 'ACCOUNTING_MANAGER'}>
                <Plus size={11} />บันทึกถูกยึด
              </button>
              <button onClick={() => openTxModal('adjustment')}
                className={`text-[11px] px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${currentRole === 'ACCOUNTING_MANAGER' ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                disabled={currentRole !== 'ACCOUNTING_MANAGER'}>
                ปรับปรุงยอด
              </button>
            </>
          )}
          <button onClick={() => setTxTab('history')}
            className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 transition-colors whitespace-nowrap">
            ดูประวัติ
          </button>
        </div>
      </div>

      {/* Condition Badge */}
      {(condition || row.conditionCode) && (
        <div className="flex items-center gap-2 mb-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
          <Badge variant="blue">{condition?.conditionCode ?? row.conditionCode}</Badge>
          {condition && <span className="text-xs text-slate-600">{condition.conditionName}</span>}
        </div>
      )}

      {/* Financial Summary — 6 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {/* Card: ยอดยืนยัน (locked stages only) */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 min-w-0">
          <p className="text-[10px] font-medium text-slate-500 leading-tight">ยอดยืนยัน</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{formatCurrency(financialSummary.confirmedRequiredAmount, row.currency)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">รอบที่ล็อกยอดแล้วเท่านั้น</p>
          {financialSummary.estimatedAmount > 0 && (
            <p className="text-[10px] text-sky-600 mt-0.5">ประมาณการ: +{formatCurrency(financialSummary.estimatedAmount, row.currency)}</p>
          )}
        </div>
        {/* Card: ชำระแล้ว (with method breakdown) */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 min-w-0">
          <p className="text-[10px] font-medium text-slate-500 leading-tight">ชำระแล้ว</p>
          <p className="text-sm font-semibold text-[#05a94f] mt-0.5">{formatCurrency(financialSummary.paidAmount, row.currency)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">ยอดที่ชำระและยืนยันสำเร็จแล้ว</p>
          {Object.keys(financialSummary.methodBreakdown).length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-100 space-y-0.5">
              {(Object.entries(financialSummary.methodBreakdown) as [PaymentMethod, number][]).map(([m, v]) => (
                <div key={m} className="flex justify-between">
                  <span className="text-[10px] text-slate-400">{PAYMENT_METHOD_LABELS[m]}</span>
                  <span className="text-[10px] text-slate-600 font-medium">{formatNumber(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Card: ได้รับเงินคืน */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 min-w-0">
          <p className="text-[10px] font-medium text-slate-500 leading-tight">ได้รับเงินคืน</p>
          <p className="text-sm font-semibold text-blue-600 mt-0.5">{formatCurrency(financialSummary.refundAmount, row.currency)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">ยอด Refund ที่ได้รับเงินจริงแล้ว</p>
        </div>
        {/* Card: ถูกยึด */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 min-w-0">
          <p className="text-[10px] font-medium text-slate-500 leading-tight">ถูกยึด</p>
          <p className="text-sm font-semibold text-orange-600 mt-0.5">{formatCurrency(financialSummary.forfeitedAmount, row.currency)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">ยอดเงินที่ถูกยึดและยืนยันแล้ว</p>
        </div>
        {/* Card: ยอดค้างชำระ */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 min-w-0">
          <p className="text-[10px] font-medium text-slate-500 leading-tight">ยอดค้างชำระ</p>
          <p className={`text-sm font-semibold mt-0.5 ${financialSummary.outstandingAmount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
            {formatCurrency(financialSummary.outstandingAmount, row.currency)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">ยอดที่ยังต้องชำระเพิ่มเติม</p>
        </div>
        {/* Card: ยอดจ่ายสุทธิ */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 min-w-0">
          <p className="text-[10px] font-medium text-slate-500 leading-tight">ยอดจ่ายสุทธิ</p>
          <p className="text-sm font-bold text-slate-800 mt-0.5">{formatCurrency(financialSummary.netCashPaid, row.currency)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">ยอดจ่ายจริงหลังหักเงินคืน</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-3">
        {(['schedule', 'history'] as const).map(tab => (
          <button key={tab} onClick={() => setTxTab(tab)}
            className={cn(
              'text-xs font-medium px-4 py-2 border-b-2 -mb-px transition-colors',
              txTab === tab
                ? 'border-[#05a94f] text-[#05a94f]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}>
            {tab === 'schedule' ? 'Payment Schedule' : `Transaction History (${pnrTx.length})`}
          </button>
        ))}
      </div>

      {/* Payment Schedule Tab */}
      {txTab === 'schedule' && (
        scheduleItems.length === 0
          ? <div className="py-6 text-center text-xs text-slate-400">ยังไม่ได้กำหนด Payment Schedule</div>
          : <>
              <div className="space-y-3 mb-6">
                {scheduleItems.map((si, i) => {
                  const isLocked = si.stageStatus && ['LOCKED','REQUESTED','PARTIALLY_PAID','PAID','ADJUSTED'].includes(si.stageStatus)
                  // All status values are pre-derived by deriveScheduleWithTransactions
                  const stagePaid = si.paidForStage
                  const remaining = si.remainingForStage
                  const stageTxCount = pnrTx.filter(t => t.paymentStageId === si.stageId).length
                  const stagePendingRequests = pnrRequests.filter(r =>
                    r.stageId === si.stageId &&
                    (r.status === 'PENDING_ACCOUNTING_REVIEW' || r.status === 'PENDING_MANAGER_APPROVAL')
                  ).length

                  return (
                    <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="text-sm font-semibold text-slate-800">{si.stageName}</span>
                          {si.paymentType && PAYMENT_TYPE_LABELS[si.paymentType] && (
                            <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                              {PAYMENT_TYPE_LABELS[si.paymentType]}
                            </span>
                          )}
                          {/* Per-seat stages: show stage lock status badge */}
                          {si.amountMode && si.paymentStatus !== 'PAID' && si.paymentStatus !== 'PARTIALLY_PAID' && (
                            <StageStatusBadge status={si.stageStatus ?? 'ESTIMATED'} />
                          )}
                          {/* Payment status badge (primary) */}
                          <PaymentStatusBadge status={si.paymentStatus} />
                          {/* Timing status badge (secondary) — not shown for NOT_DUE when pending */}
                          <TimingStatusBadge status={si.timingStatus} days={si.lateDays ?? si.overdueDays} />
                          {si.nonRefundable && (
                            <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-red-100 text-red-600">ไม่คืนเงิน</span>
                          )}
                          {si.creditTowardFare && (
                            <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-green-100 text-green-700">นำไปหักค่าตั๋ว</span>
                          )}
                          {stagePendingRequests > 0 && (
                            <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">
                              มีรายการรอตรวจสอบ {stagePendingRequests} รายการ
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            if (scheduleActionIdx === i) { setScheduleActionIdx(null); setScheduleMenuPos(null); return }
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                            const openUp = window.innerHeight - rect.bottom < 200
                            setScheduleMenuPos({ top: openUp ? rect.top - 4 : rect.bottom + 4, right: window.innerWidth - rect.right, openUp })
                            setScheduleActionIdx(i)
                          }}
                          className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 whitespace-nowrap">
                          จัดการ <span className="text-[9px]">▾</span>
                        </button>
                      </div>

                      {/* Per-seat info block (new system only) */}
                      {si.amountMode && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 pb-3 border-b border-slate-100 text-xs">
                          <div>
                            <p className="text-[10px] text-slate-400 mb-0.5">อัตราต่อที่นั่ง</p>
                            <p className="font-semibold text-slate-800">{formatNumber(si.ratePerSeat ?? 0)} {row.currency}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{AMOUNT_MODE_LABELS[si.amountMode]}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 mb-0.5">ฐานจำนวนที่นั่ง</p>
                            <p className="font-medium text-slate-700">{SEAT_BASIS_LABELS[si.seatBasis ?? 'REMAINING_AT_CUTOFF']}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 mb-0.5">จำนวนประมาณการ</p>
                            <p className="font-semibold text-sky-700">{si.estimatedSeats ?? '—'} ที่นั่ง</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 mb-0.5">จำนวนที่ล็อกแล้ว</p>
                            <p className={`font-semibold ${si.lockedSeats != null ? 'text-[#05a94f]' : 'text-slate-400'}`}>
                              {si.lockedSeats != null ? `${si.lockedSeats} ที่นั่ง` : '—'}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Amount row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <p className="text-[10px] text-slate-400 mb-0.5">ยอดประมาณการ</p>
                          <p className={`font-medium ${si.amountMode && !si.estimatedAmount ? 'text-slate-300' : 'text-sky-600'}`}>
                            {si.amountMode
                              ? (si.estimatedAmount != null ? formatCurrency(si.estimatedAmount, row.currency) : '—')
                              : formatCurrency(si.amount, row.currency)
                            }
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 mb-0.5">ยอดยืนยัน</p>
                          <p className={`font-semibold ${si.confirmedAmount != null ? 'text-slate-800' : 'text-slate-300'}`}>
                            {si.confirmedAmount != null ? formatCurrency(si.confirmedAmount, row.currency) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 mb-0.5">ชำระแล้ว</p>
                          <p className={`font-semibold ${stagePaid > 0 ? 'text-[#05a94f]' : 'text-slate-400'}`}>
                            {stagePaid > 0 ? formatCurrency(stagePaid, row.currency) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 mb-0.5">คงเหลือ</p>
                          <p className={`font-semibold ${remaining > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                            {remaining > 0 ? formatCurrency(remaining, row.currency) : '—'}
                          </p>
                        </div>
                      </div>

                      {/* Dates + timing info */}
                      <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-[10px] text-slate-500">
                        {si.lockDate && (
                          <span>ล็อกยอดเมื่อ: <span className="font-medium text-[#05a94f]">{formatDateTime(si.lockDate)}</span></span>
                        )}
                        {si.ttlDatetime && (
                          <span>ครบกำหนด: <span className={`font-medium ${si.timingStatus === 'OVERDUE' || si.timingStatus === 'PAID_LATE' ? 'text-red-500' : 'text-slate-700'}`}>{formatDateTime(si.ttlDatetime)}</span></span>
                        )}
                        {si.fullyPaidAt && (
                          <span>ชำระครบเมื่อ: <span className="font-medium text-[#05a94f]">{formatDateTime(si.fullyPaidAt)}</span></span>
                        )}
                        {si.timingStatus === 'PAID_LATE' && si.lateDays != null && (
                          <span>ล่าช้า: <span className="font-medium text-orange-500">{si.lateDays} วัน</span></span>
                        )}
                        {si.timingStatus === 'OVERDUE' && si.overdueDays != null && (
                          <span>เกินกำหนด: <span className="font-medium text-red-500">{si.overdueDays} วัน</span></span>
                        )}
                        {stageTxCount > 0 && <span>{stageTxCount} รายการชำระ</span>}
                      </div>

                      {/* Lock button — only for ESTIMATED per-seat stages */}
                      {si.amountMode && !isLocked && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
                          <button
                            onClick={() => openLockModal(si)}
                            className="text-[11px] px-3 py-1.5 rounded-lg bg-[#05a94f] text-white hover:bg-[#048a3f] transition-colors font-medium">
                            ล็อกยอด
                          </button>
                          <span className="text-[10px] text-slate-400">ยอดประมาณการ — ยังสร้างใบเบิกไม่ได้</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Portal dropdown for schedule cards */}
              {scheduleActionIdx !== null && scheduleMenuPos && (() => {
                const si = scheduleItems[scheduleActionIdx]
                const closeMenu = () => { setScheduleActionIdx(null); setScheduleMenuPos(null) }
                return createPortal(
                  <>
                    <div className="fixed inset-0 z-[999]" onClick={closeMenu} />
                    <div
                      className="fixed z-[1000] bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-[160px]"
                      style={scheduleMenuPos.openUp
                        ? { bottom: window.innerHeight - scheduleMenuPos.top, right: scheduleMenuPos.right }
                        : { top: scheduleMenuPos.top, right: scheduleMenuPos.right }
                      }>
                      {si?.amountMode && !['LOCKED','REQUESTED','PARTIALLY_PAID','PAID','ADJUSTED'].includes(si.stageStatus ?? '') && (
                        <button onClick={() => { openLockModal(si); closeMenu() }}
                          className="w-full text-left px-3 py-2 text-[11px] text-[#05a94f] hover:bg-green-50 whitespace-nowrap font-medium">
                          ล็อกยอด
                        </button>
                      )}
                      {si?.stageStatus === 'LOCKED' && (
                        <button onClick={() => { router.push(`/requisitions/create?stockId=${row.stockId}&pnrId=${row.pnrId}&stageId=${si.stageId}`); closeMenu() }}
                          className="w-full text-left px-3 py-2 text-[11px] text-[#05a94f] hover:bg-green-50 whitespace-nowrap font-medium">
                          สร้างใบเบิก
                        </button>
                      )}
                      <button onClick={() => { openTxModal('payment', si?.stageId); closeMenu() }}
                        className="w-full text-left px-3 py-2 text-[11px] text-slate-700 hover:bg-slate-50 whitespace-nowrap">
                        บันทึกการจ่าย
                      </button>
                      <button onClick={() => { setTxTab('history'); closeMenu() }}
                        className="w-full text-left px-3 py-2 text-[11px] text-slate-700 hover:bg-slate-50 whitespace-nowrap">
                        ดูรายการชำระ
                      </button>
                      <div className="h-px bg-slate-100 my-1" />
                      <button onClick={closeMenu}
                        className="w-full text-left px-3 py-2 text-[11px] text-slate-400 hover:bg-slate-50 whitespace-nowrap cursor-not-allowed">
                        แก้ไขรอบชำระ
                      </button>
                      <button onClick={() => { setTxTab('history'); closeMenu() }}
                        className="w-full text-left px-3 py-2 text-[11px] text-slate-700 hover:bg-slate-50 whitespace-nowrap">
                        ดูประวัติ
                      </button>
                      <div className="h-px bg-slate-100 my-1" />
                      <button onClick={closeMenu}
                        className="w-full text-left px-3 py-2 text-[11px] text-red-500 hover:bg-red-50 whitespace-nowrap cursor-not-allowed">
                        ยกเลิกรอบชำระ
                      </button>
                    </div>
                  </>,
                  document.body
                )
              })()}
            </>
      )}

      {/* Transaction History Tab */}
      {txTab === 'history' && (
        <>
          {/* Pending requests section — visible to accounting roles */}
          {isAccountingRole(currentRole) && pnrRequests.filter(r => r.status === 'PENDING_ACCOUNTING_REVIEW' || r.status === 'PENDING_MANAGER_APPROVAL').length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-orange-600 uppercase tracking-wider mb-2">คำขอรอตรวจสอบ</p>
              <div className="space-y-2">
                {pnrRequests.filter(r => r.status === 'PENDING_ACCOUNTING_REVIEW' || r.status === 'PENDING_MANAGER_APPROVAL').map(req => (
                  <div key={req.requestId} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-semibold text-slate-800">{REQUEST_TYPE_LABELS[req.requestType]}</span>
                          <span className="text-[11px] font-semibold text-[#05a94f]">{req.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} {req.currencyCode}</span>
                          <span className="inline-flex px-1.5 py-px rounded-full text-[10px] bg-orange-100 text-orange-700">{REQUEST_STATUS_INFO[req.status].label}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">โดย {req.requestedBy} | {formatDate(req.requestedDate)} | เหตุผล: {req.reason}</p>
                        {req.referenceNo && <p className="text-[10px] text-slate-400">อ้างอิง: {req.referenceNo}</p>}
                      </div>
                      <button
                        onClick={() => setAcctPostModal(req)}
                        className="flex-shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg bg-[#05a94f] text-white hover:bg-[#048a3f] transition-colors whitespace-nowrap">
                        ยืนยันและลงบัญชี
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pnrTx.length === 0
          ? <div className="py-6 text-center text-xs text-slate-400">ยังไม่มี Transaction</div>
          : <><div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">เลขที่รายการ</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">วันที่/เวลา</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">ประเภทรายการ</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">วิธีชำระ</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">รอบชำระ</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-500 whitespace-nowrap">จำนวนเงิน</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">สถานะ</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">วันที่ลงบัญชี</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">Voucher No.</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">ผู้สร้าง</th>
                  <th className="px-3 py-2 text-center text-[11px] font-medium text-slate-500 whitespace-nowrap min-w-[80px]">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {pnrTx.map((tx, txIdx) => {
                  return (
                    <tr key={tx.transactionId} className="border-t border-slate-100 hover:bg-slate-50/60 align-middle">
                      <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{tx.transactionId.slice(-8)}</td>
                      <td className="px-3 py-2 text-[11px] whitespace-nowrap">{tx.paymentDateTime ? formatDateTime(tx.paymentDateTime) : formatDate(tx.transactionDate)}</td>
                      <td className="px-3 py-2"><TxTypeBadge type={tx.transactionType} /></td>
                      <td className="px-3 py-2 text-[11px] text-slate-600">{formatPaymentMethod(tx)}</td>
                      <td className="px-3 py-2 text-[11px] text-slate-600">
                        {tx.paymentStageId ? (condition?.stages.find(s => s.stageId === tx.paymentStageId)?.stageName ?? '—') : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-[11px] font-medium text-slate-800 whitespace-nowrap">{formatCurrency(tx.amount, tx.currencyCode)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <TxStatusBadge type={tx.transactionType} status={tx.status} />
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-600">{tx.postingDate ? formatDate(tx.postingDate) : '—'}</td>
                      <td className="px-3 py-2 text-[11px] font-mono text-slate-600">{tx.voucherNo ?? '—'}</td>
                      <td className="px-3 py-2 text-[11px] text-slate-600">{tx.createdBy}</td>
                      <td className="px-3 py-2.5 text-center min-w-[80px]">
                        <button
                          onClick={(e) => {
                            if (txMenuIdx === txIdx) { setTxMenuIdx(null); setTxMenuPos(null); return }
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                            const spaceBelow = window.innerHeight - rect.bottom
                            const openUp = spaceBelow < 220
                            setTxMenuPos({ top: openUp ? rect.top - 4 : rect.bottom + 4, right: window.innerWidth - rect.right, openUp })
                            setTxMenuIdx(txIdx)
                          }}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap">
                          จัดการ <span className="text-[9px]">▾</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

            {/* Portal dropdown for Transaction History */}
            {txMenuIdx !== null && txMenuPos && (() => {
              const tx = pnrTx[txMenuIdx]
              if (!tx) return null
              const menuItems = getTxMenuActions(tx)
              const closeMenu = () => { setTxMenuIdx(null); setTxMenuPos(null) }
              return createPortal(
                <>
                  <div className="fixed inset-0 z-[999]" onClick={closeMenu} />
                  <div
                    className="fixed z-[1000] bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-[180px]"
                    style={txMenuPos.openUp
                      ? { bottom: window.innerHeight - txMenuPos.top, right: txMenuPos.right }
                      : { top: txMenuPos.top, right: txMenuPos.right }
                    }>
                    {menuItems.map((item, mi) => (
                      <button
                        key={mi}
                        disabled={item.disabled}
                        onClick={() => {
                          closeMenu()
                          if (item.action === 'view' || item.action === 'view_attachment') return
                          if ((item.action === 'change_status' || item.action === 'reversal') && item.newStatus !== undefined || item.action === 'reversal') {
                            openTxAction(tx, item.action, item.newStatus ?? 'REVERSED', item.label)
                          }
                        }}
                        className={`w-full text-left px-3 py-2 text-[11px] whitespace-nowrap transition-colors ${
                          item.disabled
                            ? 'text-slate-300 cursor-not-allowed'
                            : item.danger
                              ? 'text-red-500 hover:bg-red-50'
                              : 'text-slate-700 hover:bg-slate-50'
                        }`}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>,
                document.body
              )
            })()}
          </>
          }
        </>
      )}

      {/* Status Change Modal */}
      {txActionModal && (() => {
        const { tx, newStatus, label, isReversal } = txActionModal
        const currentInfo = getTxStatusInfo(tx.transactionType, tx.status)
        const newInfo = isReversal
          ? { label: 'กลับรายการแล้ว', cls: 'bg-purple-100 text-purple-700', tooltip: '' }
          : getTxStatusInfo(tx.transactionType, newStatus)
        const isCritical = isReversal || CRITICAL_STATUSES.includes(newStatus)
        const txTypeLabel: Record<string, string> = {
          PAYMENT: 'การจ่ายเงิน', REFUND: 'การคืนเงิน',
          FORFEITURE: 'เงินถูกยึด', REVERSAL: 'กลับรายการ', ADJUSTMENT: 'ปรับปรุงยอด',
        }
        return (
          <Modal
            open
            onClose={() => { setTxActionModal(null); setTxActionConfirm(false) }}
            title={`เปลี่ยนสถานะ — ${label}`}
            size="md"
            footer={
              txActionConfirm ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setTxActionConfirm(false)}>แก้ไข</Button>
                  <Button size="sm" onClick={handleStatusChange} loading={txActionSaving}
                    className="bg-red-500 hover:bg-red-600 border-red-500">ยืนยัน (ไม่สามารถยกเลิกได้)</Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm"
                    onClick={() => { setTxActionModal(null); setTxActionConfirm(false) }}>ยกเลิก</Button>
                  <Button size="sm" onClick={() => {
                    if (!txActionForm.reason) { setTxActionError('กรุณากรอกเหตุผลในการเปลี่ยนสถานะ'); return }
                    if (isCritical) { setTxActionError(''); setTxActionConfirm(true) } else { handleStatusChange() }
                  }} loading={txActionSaving}>ยืนยันการเปลี่ยนสถานะ</Button>
                </>
              )
            }
          >
            <div className="space-y-3">
              {/* Info summary */}
              <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">ประเภทรายการ</span>
                  <span className="font-medium text-slate-700">{txTypeLabel[tx.transactionType] ?? tx.transactionType}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">สถานะปัจจุบัน</span>
                  <span className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium ${currentInfo.cls}`}>{currentInfo.label}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">สถานะใหม่</span>
                  <span className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium ${newInfo.cls}`}>{newInfo.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">จำนวนเงิน</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(tx.amount, tx.currencyCode)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">ผู้ดำเนินการ</span>
                  <span className="font-medium text-slate-700">Demo User</span>
                </div>
              </div>

              {/* Confirm step */}
              {txActionConfirm && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                  <p className="font-semibold mb-1">⚠ ยืนยันการดำเนินการสำคัญ</p>
                  <p>การเปลี่ยนสถานะเป็น <strong>{newInfo.label}</strong> จะมีผลทางการเงินทันที และไม่สามารถยกเลิกได้โดยตรง (ต้องใช้กลับรายการเท่านั้น) คุณต้องการดำเนินการต่อใช่หรือไม่?</p>
                </div>
              )}

              {!txActionConfirm && (
                <>
                  {/* วันที่และเวลาที่มีผล */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">วันที่มีผล</label>
                      <input type="date" value={txActionForm.effectiveDate}
                        onChange={e => setTxActionForm(f => ({ ...f, effectiveDate: e.target.value }))}
                        className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">เวลา</label>
                      <TimeInput value={txActionForm.effectiveTime}
                        onChange={v => setTxActionForm(f => ({ ...f, effectiveTime: v }))}
                        className="border-slate-200 rounded-lg" />
                    </div>
                  </div>

                  {/* เลขอ้างอิง */}
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">เลขอ้างอิง</label>
                    <input type="text" value={txActionForm.referenceNo} placeholder="เลขอ้างอิงเอกสาร"
                      onChange={e => setTxActionForm(f => ({ ...f, referenceNo: e.target.value }))}
                      className={inputCls} />
                  </div>

                  {/* เหตุผล (required) */}
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">
                      เหตุผลในการเปลี่ยนสถานะ <span className="text-red-500">*</span>
                    </label>
                    <textarea value={txActionForm.reason} rows={2} placeholder="กรอกเหตุผล..."
                      onChange={e => setTxActionForm(f => ({ ...f, reason: e.target.value }))}
                      className={`${inputCls} resize-none`} />
                  </div>

                  {/* หมายเหตุ */}
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">หมายเหตุ</label>
                    <textarea value={txActionForm.remark} rows={2} placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                      onChange={e => setTxActionForm(f => ({ ...f, remark: e.target.value }))}
                      className={`${inputCls} resize-none`} />
                  </div>
                </>
              )}

              {txActionError && (
                <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{txActionError}</p>
              )}
            </div>
          </Modal>
        )
      })()}

      {/* Lock Modal */}
      {lockModal && (() => {
        const seats = parseInt(lockForm.seatCount) || 0
        const ratePerSeat = lockModal.ratePerSeat ?? 0
        const previewAmount = seats * ratePerSeat
        return (
          <Modal
            open
            onClose={() => setLockModal(null)}
            title={`ล็อกยอด — ${lockModal.stageName}`}
            size="sm"
            footer={
              <>
                <Button variant="outline" size="sm" onClick={() => setLockModal(null)}>ยกเลิก</Button>
                <Button size="sm" onClick={handleLockStage} loading={lockSaving}
                  className="bg-[#05a94f] hover:bg-[#048a3f] border-[#05a94f]">ล็อกยอด</Button>
              </>
            }
          >
            <div className="space-y-3">
              {/* Stage info */}
              <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">ฐานจำนวนที่นั่ง</span>
                  <span className="font-medium text-slate-700">{SEAT_BASIS_LABELS[lockModal.seatBasis ?? 'REMAINING_AT_CUTOFF']}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">อัตราต่อที่นั่ง</span>
                  <span className="font-semibold text-slate-800">{formatNumber(ratePerSeat)} {row.currency}</span>
                </div>
                {lockModal.estimatedSeats != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">จำนวนประมาณการ</span>
                    <span className="text-sky-700 font-medium">{lockModal.estimatedSeats} ที่นั่ง</span>
                  </div>
                )}
              </div>

              {/* Seat input */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  จำนวนที่นั่ง <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" min="0" value={lockForm.seatCount}
                  onChange={e => setLockForm(f => ({ ...f, seatCount: e.target.value }))}
                  placeholder="ระบุจำนวนที่นั่ง"
                  className={inputCls}
                />
              </div>

              {/* Manual seat reason */}
              {lockModal.seatBasis === 'MANUAL_SEAT' && (
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">
                    เหตุผลในการระบุจำนวนเอง <span className="text-red-500">*</span>
                  </label>
                  <textarea rows={2} value={lockForm.manualReason}
                    onChange={e => setLockForm(f => ({ ...f, manualReason: e.target.value }))}
                    placeholder="กรอกเหตุผล..."
                    className={`${inputCls} resize-none`} />
                </div>
              )}

              {/* Preview */}
              {seats > 0 && (
                <div className="bg-[#05a94f]/5 border border-[#05a94f]/20 rounded-lg p-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">{seats} × {formatNumber(ratePerSeat)}</span>
                    <span className="text-lg font-bold text-[#05a94f]">{formatCurrency(previewAmount, row.currency)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">ยอดยืนยันที่จะล็อก</p>
                </div>
              )}

              {lockError && (
                <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{lockError}</p>
              )}
            </div>
          </Modal>
        )
      })()}

      {/* Financial Request Modal — ticket staff */}
      <FinancialRequestModal
        open={finReqModal}
        onClose={() => setFinReqModal(false)}
        row={row}
        scheduleItems={scheduleItems}
        currentRole={currentRole}
        onSaved={() => { setFinReqRefresh(n => n + 1); setTxTab('history') }}
      />

      {/* Accounting Post Modal */}
      <AccountingPostModal
        open={!!acctPostModal}
        onClose={() => setAcctPostModal(null)}
        pendingReq={acctPostModal}
        row={row}
        currentRole={currentRole}
        onPosted={(updatedReq, newTx) => {
          const updatedStock: DemoStock = {
            ...stock,
            transactions: [...(stock.transactions ?? []), newTx],
            logs: [...(stock.logs ?? []), {
              logId: `LOG-${Date.now()}`,
              action: `ลงบัญชี ${REQUEST_TYPE_LABELS[updatedReq.requestType]} — ${newTx.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ${newTx.currencyCode} (Voucher: ${newTx.voucherNo ?? '—'})`,
              message: `Posted by ${newTx.postedBy ?? 'Accounting'}`,
              createdAt: newTx.createdAt,
              createdBy: newTx.createdBy,
            }],
          }
          onTransactionSave(updatedStock)
          setFinReqRefresh(n => n + 1)
          setAcctPostModal(null)
          setTxTab('history')
        }}
      />

      {/* Transaction Modal */}
      {txModal && (
        <Modal
          open={!!txModal}
          onClose={() => { setTxModal(null); setTxError('') }}
          title={
            txModal === 'payment' ? 'บันทึกการจ่าย'
            : txModal === 'refund' ? 'บันทึก Refund'
            : txModal === 'forfeiture' ? 'บันทึกเงินถูกยึด'
            : 'ปรับปรุงยอด'
          }
          size="md"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => { setTxModal(null); setTxError('') }}>ยกเลิก</Button>
              <Button size="sm" onClick={handleTxSave} loading={txSaving}>บันทึก</Button>
            </>
          }
        >
          <div className="space-y-3">

            {/* ── Balance info panel (payment only) ── */}
            {txModal === 'payment' && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide mb-2">ยอดประกอบ</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  <span className="text-slate-500">ยอดที่ต้องชำระ (รอบ)</span>
                  <span className="text-right text-slate-700 font-medium">{stageRequired > 0 ? formatCurrency(stageRequired, row.currency) : '—'}</span>
                  <span className="text-slate-500">ชำระแล้ว</span>
                  <span className="text-right text-[#05a94f] font-medium">{formatCurrency(stagePaidSoFar, row.currency)}</span>
                  <span className="text-slate-500">ยอดคงเหลือ</span>
                  <span className="text-right text-amber-600 font-medium">{stageRequired > 0 ? formatCurrency(stageRemaining, row.currency) : '—'}</span>
                  <span className="text-slate-500">กำลังบันทึก</span>
                  <span className="text-right font-bold text-slate-800">{currentAmount > 0 ? formatCurrency(currentAmount, row.currency) : '—'}</span>
                </div>
              </div>
            )}

            {/* ── รอบชำระ (payment) ── */}
            {txModal === 'payment' && condition && (
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">รอบชำระ</label>
                <select value={txForm.paymentStageId}
                  onChange={e => setTxForm(f => ({ ...f, paymentStageId: e.target.value }))}
                  className={selectCls}>
                  <option value="">ไม่ระบุรอบ</option>
                  {condition.stages.map(s => <option key={s.stageId} value={s.stageId}>{s.stageName}</option>)}
                </select>
              </div>
            )}

            {/* ── วิธีการชำระ (payment) ── */}
            {txModal === 'payment' && (
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">วิธีการชำระ <span className="text-red-500">*</span></label>
                <select value={txForm.paymentMethod}
                  onChange={e => setTxForm(f => ({ ...f, paymentMethod: e.target.value as PaymentMethod }))}
                  className={selectCls}>
                  {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ── จำนวนเงิน + ค่าธรรมเนียม ── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  จำนวนเงิน ({row.currency}) <span className="text-red-500">*</span>
                </label>
                <input type="number" min="0" step="0.01"
                  value={txForm.amount}
                  onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className={inputCls} />
              </div>
              {txModal === 'payment' && (
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">ค่าธรรมเนียม</label>
                  <input type="number" min="0" step="0.01"
                    value={txForm.feeAmount}
                    onChange={e => setTxForm(f => ({ ...f, feeAmount: e.target.value }))}
                    placeholder="0.00"
                    className={inputCls} />
                </div>
              )}
            </div>

            {/* ── วันที่ + เวลา ── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">วันที่ <span className="text-red-500">*</span></label>
                <input type="date" value={txForm.transactionDate}
                  onChange={e => setTxForm(f => ({ ...f, transactionDate: e.target.value }))}
                  className={inputCls} />
              </div>
              {txModal === 'payment' && (
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">เวลา</label>
                  <TimeInput value={txForm.transactionTime}
                    onChange={v => setTxForm(f => ({ ...f, transactionTime: v }))}
                    className="border-slate-200 rounded-lg" />
                </div>
              )}
            </div>

            {/* ── Bank Transfer fields ── */}
            {txModal === 'payment' && txForm.paymentMethod === 'BANK_TRANSFER' && (
              <div className="space-y-2.5 pt-1 border-t border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">ข้อมูลการโอน</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">ธนาคารต้นทาง</label>
                    <input type="text" value={txForm.sourceBank}
                      onChange={e => setTxForm(f => ({ ...f, sourceBank: e.target.value }))}
                      placeholder="เช่น กสิกรไทย"
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">ธนาคารปลายทาง</label>
                    <input type="text" value={txForm.destinationBank}
                      onChange={e => setTxForm(f => ({ ...f, destinationBank: e.target.value }))}
                      placeholder="เช่น ไทยพาณิชย์"
                      className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">เลขอ้างอิงการโอน</label>
                  <input type="text" value={txForm.transferReference}
                    onChange={e => setTxForm(f => ({ ...f, transferReference: e.target.value }))}
                    placeholder="Transaction reference"
                    className={inputCls} />
                </div>
              </div>
            )}

            {/* ── Credit Card fields ── */}
            {txModal === 'payment' && txForm.paymentMethod === 'CREDIT_CARD' && (
              <div className="space-y-2.5 pt-1 border-t border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">ข้อมูลบัตร</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">ประเภทบัตร</label>
                    <select value={txForm.cardBrand}
                      onChange={e => setTxForm(f => ({ ...f, cardBrand: e.target.value }))}
                      className={selectCls}>
                      <option value="">เลือกประเภทบัตร</option>
                      {['Visa', 'Mastercard', 'JCB', 'Amex', 'UnionPay'].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">เลขบัตร 4 ตัวท้าย</label>
                    <input type="text" maxLength={4} value={txForm.cardLast4}
                      onChange={e => setTxForm(f => ({ ...f, cardLast4: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                      placeholder="XXXX"
                      className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Authorization Code</label>
                  <input type="text" value={txForm.authorizationCode}
                    onChange={e => setTxForm(f => ({ ...f, authorizationCode: e.target.value }))}
                    placeholder="Auth code จากธนาคาร"
                    className={inputCls} />
                </div>
                <p className="text-[10px] text-slate-400">* จัดเก็บเฉพาะ Card Brand และเลขบัตร 4 ตัวท้าย ไม่จัดเก็บเลขบัตรเต็มหรือ CVV</p>
              </div>
            )}

            {/* ── Topup fields ── */}
            {txModal === 'payment' && txForm.paymentMethod === 'TOPUP' && (
              <div className="space-y-2.5 pt-1 border-t border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">ข้อมูล Topup</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">บัญชี Topup</label>
                    <input type="text" value={txForm.topupAccountId}
                      onChange={e => setTxForm(f => ({ ...f, topupAccountId: e.target.value }))}
                      placeholder="รหัสบัญชี Topup"
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">เลขอ้างอิง Topup</label>
                    <input type="text" value={txForm.topupReference}
                      onChange={e => setTxForm(f => ({ ...f, topupReference: e.target.value }))}
                      placeholder="Topup reference"
                      className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">ยอดคงเหลือก่อนใช้</label>
                  <input type="number" min="0" step="0.01" value={txForm.topupBalanceBefore}
                    onChange={e => setTxForm(f => ({ ...f, topupBalanceBefore: e.target.value }))}
                    placeholder="0.00"
                    className={inputCls} />
                </div>
                {txForm.topupBalanceBefore && topupBalanceAfterPreview !== null && (
                  <div className="bg-slate-50 rounded-lg p-2.5 text-xs flex justify-between">
                    <span className="text-slate-500">ยอดคงเหลือหลังใช้</span>
                    <span className={`font-semibold ${topupBalanceAfterPreview < 0 ? 'text-red-500' : 'text-slate-700'}`}>
                      {formatCurrency(topupBalanceAfterPreview, row.currency)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Original Payment (refund / forfeiture) ── */}
            {(txModal === 'refund' || txModal === 'forfeiture') && (
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Payment ต้นทาง <span className="text-red-500">*</span></label>
                <select value={txForm.originalTransactionId}
                  onChange={e => setTxForm(f => ({ ...f, originalTransactionId: e.target.value }))}
                  className={selectCls}>
                  <option value="">เลือก Payment</option>
                  {completedPayments.map(t => (
                    <option key={t.transactionId} value={t.transactionId}>
                      {formatDate(t.transactionDate)} · {formatCurrency(t.amount, t.currencyCode)}{t.referenceNo ? ` · ${t.referenceNo}` : ''}
                    </option>
                  ))}
                </select>
                {completedPayments.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">ยังไม่มี Payment ที่ Completed/Confirmed</p>
                )}
                {txForm.originalTransactionId && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    วงเงินคงเหลือ: <span className="font-medium text-slate-700">{formatCurrency(maxRefundable, row.currency)}</span>
                  </p>
                )}
              </div>
            )}

            {/* ── สถานะ ── */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">สถานะ</label>
              <select value={txForm.status}
                onChange={e => setTxForm(f => ({ ...f, status: e.target.value }))}
                className={selectCls}>
                {txModal === 'payment' && ['PENDING', 'COMPLETED', 'CONFIRMED', 'FAILED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                {txModal === 'refund' && ['REQUESTED', 'APPROVED', 'RECEIVED', 'REJECTED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                {txModal === 'forfeiture' && ['PENDING_CONFIRMATION', 'CONFIRMED', 'DISPUTED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                {txModal === 'adjustment' && ['COMPLETED'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* ── เลขอ้างอิง ── */}
            {(txModal === 'payment' || txModal === 'adjustment') && (
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">เลขอ้างอิง</label>
                <input type="text" value={txForm.referenceNo}
                  onChange={e => setTxForm(f => ({ ...f, referenceNo: e.target.value }))}
                  placeholder="หมายเลขอ้างอิง"
                  className={inputCls} />
              </div>
            )}

            {/* ── Credit Note (refund) ── */}
            {txModal === 'refund' && (
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Credit Note No</label>
                <input type="text" value={txForm.creditNoteNo}
                  onChange={e => setTxForm(f => ({ ...f, creditNoteNo: e.target.value }))}
                  placeholder="เลขที่ Credit Note"
                  className={inputCls} />
              </div>
            )}

            {/* ── Reason Code ── */}
            {(txModal === 'refund' || txModal === 'forfeiture' || txModal === 'adjustment') && (
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Reason Code {(txModal === 'refund' || txModal === 'forfeiture') && <span className="text-red-500">*</span>}
                </label>
                <input type="text" value={txForm.reasonCode}
                  onChange={e => setTxForm(f => ({ ...f, reasonCode: e.target.value }))}
                  placeholder="เช่น CANCEL, AIRLINE_CHANGE"
                  className={inputCls} />
              </div>
            )}

            {/* ── หมายเหตุ ── */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">หมายเหตุ</label>
              <textarea value={txForm.remark} rows={2}
                onChange={e => setTxForm(f => ({ ...f, remark: e.target.value }))}
                placeholder="บันทึกเพิ่มเติม..."
                className={`${inputCls} resize-none`} />
            </div>

            {txError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{txError}</p>}
          </div>
        </Modal>
      )}
    </section>
  )
}
