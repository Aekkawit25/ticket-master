'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/input'
import { formatDate, formatDateTime, formatCurrency, cn, PAYMENT_TYPE_LABELS } from '@/lib/utils'
import {
  getRequisitionById, saveRequisition, addReqLog,
  REQUISITION_STATUS_INFO, CALC_BASIS_LABELS,
  type DemoRequisition, type RequisitionStatus,
} from '@/lib/requisition-storage'
import {
  ChevronLeft, Pencil, CheckCircle2, XCircle, Clock, Send,
  FileText, Printer, AlertTriangle, Banknote, RotateCcw, Info,
} from 'lucide-react'

// ─── Status Badge ─────────────────────────────────────────────────────────────

function ReqStatusBadge({ status }: { status: RequisitionStatus }) {
  const info = REQUISITION_STATUS_INFO[status]
  return <Badge variant={info.variant}>{info.label}</Badge>
}

function PayStatusBadge({ status }: { status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' }) {
  const map = {
    UNPAID:         { label: 'รอชำระ',        variant: 'yellow' as const },
    PARTIALLY_PAID: { label: 'ชำระบางส่วน',  variant: 'orange' as const },
    PAID:           { label: 'ชำระแล้ว',      variant: 'green' as const },
  }
  const { label, variant } = map[status]
  return <Badge variant={variant}>{label}</Badge>
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span className={cn('text-sm text-slate-800', mono ? 'font-mono' : '')}>{value ?? '—'}</span>
    </div>
  )
}

// ─── Workflow action helpers ───────────────────────────────────────────────────

interface WorkflowAction {
  label: string
  icon: React.ReactNode
  variant: 'primary' | 'outline' | 'danger' | 'ghost'
  targetStatus: RequisitionStatus
  needsReason?: boolean
  reasonLabel?: string
  confirmLabel?: string
}

function getWorkflowActions(status: RequisitionStatus): WorkflowAction[] {
  switch (status) {
    case 'DRAFT':
      return [
        { label: 'ส่งอนุมัติ', icon: <Send size={14} />, variant: 'primary', targetStatus: 'PENDING_APPROVAL', confirmLabel: 'ยืนยันส่งอนุมัติ?' },
        { label: 'ยกเลิก', icon: <XCircle size={14} />, variant: 'danger', targetStatus: 'CANCELLED', needsReason: true, reasonLabel: 'เหตุผลที่ยกเลิก' },
      ]
    case 'PENDING_APPROVAL':
      return [
        { label: 'อนุมัติ', icon: <CheckCircle2 size={14} />, variant: 'primary', targetStatus: 'APPROVED', confirmLabel: 'ยืนยันอนุมัติใบเบิกนี้?' },
        { label: 'ไม่อนุมัติ', icon: <XCircle size={14} />, variant: 'danger', targetStatus: 'REJECTED', needsReason: true, reasonLabel: 'เหตุผลที่ไม่อนุมัติ' },
      ]
    case 'APPROVED':
      return [
        { label: 'รอชำระ', icon: <Clock size={14} />, variant: 'outline', targetStatus: 'WAITING_PAYMENT', confirmLabel: 'เปลี่ยนสถานะเป็น รอชำระเงิน?' },
      ]
    case 'WAITING_PAYMENT':
      return [
        { label: 'บันทึกชำระบางส่วน', icon: <Banknote size={14} />, variant: 'outline', targetStatus: 'PARTIALLY_PAID', confirmLabel: 'บันทึกการชำระบางส่วน?' },
        { label: 'บันทึกชำระครบ', icon: <CheckCircle2 size={14} />, variant: 'primary', targetStatus: 'PAID', confirmLabel: 'ยืนยันชำระครบแล้ว?' },
      ]
    case 'PARTIALLY_PAID':
      return [
        { label: 'บันทึกชำระครบ', icon: <CheckCircle2 size={14} />, variant: 'primary', targetStatus: 'PAID', confirmLabel: 'ยืนยันชำระครบแล้ว?' },
      ]
    case 'REJECTED':
      return [
        { label: 'ส่งอนุมัติอีกครั้ง', icon: <RotateCcw size={14} />, variant: 'outline', targetStatus: 'PENDING_APPROVAL', confirmLabel: 'ส่งอนุมัติอีกครั้ง?' },
      ]
    default:
      return []
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RequisitionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id ?? '')

  const [req, setReq] = useState<DemoRequisition | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Workflow action modal state
  const [actionModal, setActionModal] = useState<WorkflowAction | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionSaving, setActionSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  // Toast
  const [toast, setToast] = useState('')

  useEffect(() => {
    const found = getRequisitionById(id)
    if (!found) {
      setNotFound(true)
    } else {
      setReq(found)
    }
    setLoading(false)
  }, [id])

  const workflowActions = useMemo(() => req ? getWorkflowActions(req.documentStatus) : [], [req])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  function handleAction(action: WorkflowAction) {
    if (action.needsReason) {
      setActionModal(action)
      setActionReason('')
      setActionError('')
    } else {
      setActionModal(action)
      setActionReason('')
      setActionError('')
    }
  }

  function confirmAction() {
    if (!req || !actionModal) return
    if (actionModal.needsReason && !actionReason.trim()) {
      setActionError('กรุณาระบุเหตุผล')
      return
    }
    setActionSaving(true)
    const now = new Date().toISOString()
    const updated: DemoRequisition = {
      ...req,
      documentStatus: actionModal.targetStatus,
      updatedDate: now,
      updatedBy: 'Admin',
      // Specific fields per action
      approvedBy: actionModal.targetStatus === 'APPROVED' ? 'Admin' : req.approvedBy,
      approvedDate: actionModal.targetStatus === 'APPROVED' ? now : req.approvedDate,
      rejectedBy: actionModal.targetStatus === 'REJECTED' ? 'Admin' : req.rejectedBy,
      rejectedDate: actionModal.targetStatus === 'REJECTED' ? now : req.rejectedDate,
      rejectedReason: actionModal.targetStatus === 'REJECTED' ? actionReason : req.rejectedReason,
      cancelledBy: actionModal.targetStatus === 'CANCELLED' ? 'Admin' : req.cancelledBy,
      cancelledDate: actionModal.targetStatus === 'CANCELLED' ? now : req.cancelledDate,
      cancelReason: actionModal.targetStatus === 'CANCELLED' ? actionReason : req.cancelReason,
      paymentStatus: actionModal.targetStatus === 'PAID' ? 'PAID'
        : actionModal.targetStatus === 'PARTIALLY_PAID' ? 'PARTIALLY_PAID'
        : req.paymentStatus,
    }
    const withLog = addReqLog(
      updated,
      `เปลี่ยนสถานะ → ${REQUISITION_STATUS_INFO[actionModal.targetStatus].label}${actionReason ? ` (${actionReason})` : ''}`,
      'Admin',
      REQUISITION_STATUS_INFO[req.documentStatus].label,
      REQUISITION_STATUS_INFO[actionModal.targetStatus].label,
    )
    saveRequisition(withLog)
    setReq(withLog)
    setActionModal(null)
    setActionSaving(false)
    showToast(`เปลี่ยนสถานะเป็น "${REQUISITION_STATUS_INFO[actionModal.targetStatus].label}" สำเร็จ`)
  }

  // ─── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppLayout title="ใบเบิก">
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400 text-sm">กำลังโหลด...</div>
        </div>
      </AppLayout>
    )
  }

  if (notFound || !req) {
    return (
      <AppLayout title="ใบเบิก">
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <AlertTriangle size={32} className="text-slate-300" />
          <p className="text-slate-500 text-sm">ไม่พบใบเบิกเลขที่ {id}</p>
          <Button variant="outline" icon={<ChevronLeft size={14} />} onClick={() => router.push('/requisitions')}>
            กลับรายการใบเบิก
          </Button>
        </div>
      </AppLayout>
    )
  }

  const canEdit = req.documentStatus === 'DRAFT'
  const supplier = req.supplierSnapshot
  const activeAttachments = req.attachments.filter(a => a.status === 'ACTIVE')
  const selectedBank = supplier?.bankAccounts.find(b => b.accountId === supplier.selectedAccountId)

  return (
    <AppLayout title="ใบเบิก">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg shadow-lg text-sm">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/requisitions')}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700">
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900">ใบเบิก</h1>
              <span className="font-mono text-sm text-slate-500">{req.requisitionNo ?? '— รอบันทึก —'}</span>
              <ReqStatusBadge status={req.documentStatus} />
              <PayStatusBadge status={req.paymentStatus} />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{req.documentTitle || '—'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700"
            title="พิมพ์ใบเบิก">
            <Printer size={18} />
          </button>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              icon={<Pencil size={14} />}
              onClick={() => router.push(`/requisitions/create?reqId=${req.requisitionId}`)}>
              แก้ไข
            </Button>
          )}
          {workflowActions.map(action => (
            <button
              key={action.targetStatus}
              onClick={() => handleAction(action)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                action.variant === 'primary' && 'bg-[#05a94f] text-white hover:bg-[#048a3f]',
                action.variant === 'outline' && 'border border-slate-200 text-slate-700 hover:bg-slate-50',
                action.variant === 'danger' && 'border border-red-200 text-red-600 hover:bg-red-50',
                action.variant === 'ghost' && 'text-slate-500 hover:bg-slate-100',
              )}>
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reference info bar (PNR source) */}
      {req.sourceType === 'PNR' && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 mb-5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
          {req.seriesCode && <span><span className="text-slate-400">Series: </span><span className="font-mono font-medium">{req.seriesCode}</span></span>}
          {req.seriesName && <span><span className="text-slate-400">ชื่อ: </span>{req.seriesName}</span>}
          {req.airlineCode && <span><span className="text-slate-400">สายการบิน: </span>{req.airlineCode}</span>}
          {req.routeText && <span><span className="text-slate-400">เส้นทาง: </span>{req.routeText}</span>}
          {req.travelPeriod && <span><span className="text-slate-400">ช่วงเดินทาง: </span>{req.travelPeriod}</span>}
          {req.pnrDisplays.length > 0 && <span><span className="text-slate-400">PNR: </span>{req.pnrDisplays.join(', ')}</span>}
        </div>
      )}

      <div className="space-y-5 max-w-5xl pb-10">

        {/* Section 1: Document info */}
        <Section title="ข้อมูลเอกสาร">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <InfoRow label="เลขที่เอกสาร" value={<span className="font-mono font-semibold text-[#05a94f]">{req.requisitionNo ?? '— สร้างอัตโนมัติ —'}</span>} />
            <InfoRow label="วันที่สร้าง" value={formatDate(req.documentDate)} />
            <InfoRow label="วันที่ครบกำหนด" value={req.dueDate ? formatDate(req.dueDate) : '—'} />
            <InfoRow label="สถานะ" value={<ReqStatusBadge status={req.documentStatus} />} />
            <InfoRow label="หัวข้อเอกสาร" value={req.documentTitle || '—'} />
            <InfoRow label="เอกสารอ้างอิง" value={req.referenceDoc || '—'} />
            <InfoRow label="แผนก" value={req.department || '—'} />
            <InfoRow label="ผู้สร้าง" value={req.createdBy} />
            {req.approvedBy && <InfoRow label="ผู้อนุมัติ" value={`${req.approvedBy}${req.approvedDate ? ` (${formatDateTime(req.approvedDate)})` : ''}`} />}
            {req.rejectedBy && <InfoRow label="ผู้ไม่อนุมัติ" value={`${req.rejectedBy}${req.rejectedDate ? ` (${formatDateTime(req.rejectedDate)})` : ''}`} />}
            {req.rejectedReason && <InfoRow label="เหตุผลไม่อนุมัติ" value={<span className="text-red-600">{req.rejectedReason}</span>} />}
            {req.cancelReason && <InfoRow label="เหตุผลยกเลิก" value={<span className="text-red-600">{req.cancelReason}</span>} />}
          </div>
        </Section>

        {/* Section 2: Supplier */}
        {supplier && (
          <Section title="ข้อมูล Supplier">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <InfoRow label="Supplier Code" value={supplier.supplierCode} mono />
              <InfoRow label="ชื่อ Supplier" value={supplier.supplierName} />
              <InfoRow label="เลขประจำตัวผู้เสียภาษี" value={supplier.taxId} mono />
              <InfoRow label="สำนักงาน" value={supplier.branchType === 'HQ' ? 'สำนักงานใหญ่' : `สาขา ${supplier.branchNo}`} />
              <div className="col-span-2"><InfoRow label="ที่อยู่" value={supplier.address} /></div>
            </div>
            {selectedBank && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <p className="text-[11px] text-green-700 font-medium mb-1.5">บัญชีที่เลือกรับเงิน</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-700">
                  <div><span className="text-slate-400">ธนาคาร: </span>{selectedBank.bankName}</div>
                  <div><span className="text-slate-400">ชื่อบัญชี: </span>{selectedBank.accountName}</div>
                  <div><span className="text-slate-400">เลขที่: </span><span className="font-mono">{selectedBank.accountNo}</span></div>
                  <div><span className="text-slate-400">สาขา: </span>{selectedBank.branch}</div>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Section 3: Items */}
        <Section title="รายการใบเบิก">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500">#</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500">PNR</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500">ประเภทการชำระ</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500">รอบที่</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500">ฐานคำนวณ</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-500">ที่นั่ง</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-500">ราคา/ที่นั่ง</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-500">จำนวนเงิน</th>
                  <th className="px-3 py-2 text-center text-[11px] font-medium text-slate-500">นับค่าตั๋ว</th>
                  <th className="px-3 py-2 text-center text-[11px] font-medium text-slate-500">คืนเงินได้</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500">ครบกำหนด</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {req.items.length === 0 && (
                  <tr>
                    <td colSpan={12} className="py-6 text-center text-slate-400">ไม่มีรายการ</td>
                  </tr>
                )}
                {req.items.map((item, idx) => (
                  <tr key={item.itemId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono font-medium text-slate-800">{item.pnrDisplay ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{PAYMENT_TYPE_LABELS[item.paymentType] ?? item.paymentType}</td>
                    <td className="px-3 py-2 text-slate-600">{item.stageSeq ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-600 text-[11px]">{CALC_BASIS_LABELS[item.calculationBasis] ?? item.calculationBasis}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{item.seatSnapshot > 0 ? item.seatSnapshot : '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{item.ratePerSeat > 0 ? formatCurrency(item.ratePerSeat, item.currencyCode) : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatCurrency(item.calculatedAmount, item.currencyCode)}</td>
                    <td className="px-3 py-2 text-center">{item.creditTowardFare ? '✓' : '—'}</td>
                    <td className="px-3 py-2 text-center">{item.refundable ? '✓' : '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{item.dueDate ? formatDate(item.dueDate) : '—'}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate" title={item.remark || undefined}>{item.remark || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Section 4: Pricing summary */}
        <Section title="สรุปรายการและภาษี">
          <div className="flex justify-end">
            <div className="w-72 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>มูลค่ารายการ</span>
                <span>{formatCurrency(req.subtotal, req.currencyCode)}</span>
              </div>
              {req.discountAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>ส่วนลด</span>
                  <span className="text-red-500">−{formatCurrency(req.discountAmount, req.currencyCode)}</span>
                </div>
              )}
              {req.vatAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>VAT {req.vatRate}%</span>
                  <span>{formatCurrency(req.vatAmount, req.currencyCode)}</span>
                </div>
              )}
              {req.withholdingTaxAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>ภาษีหัก ณ ที่จ่าย {req.withholdingTaxRate}%</span>
                  <span className="text-red-500">−{formatCurrency(req.withholdingTaxAmount, req.currencyCode)}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-1 mt-1 flex justify-between font-bold text-slate-900">
                <span>ยอดสุทธิที่ขอเบิก</span>
                <span className="text-[#05a94f] text-base">{formatCurrency(req.netAmount, req.currencyCode)}</span>
              </div>
              {req.exchangeRate !== 1 && req.currencyCode !== 'THB' && (
                <div className="flex justify-between text-slate-400 text-xs">
                  <span>อัตราแลกเปลี่ยน</span>
                  <span>1 {req.currencyCode} = {req.exchangeRate} THB</span>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Section 5: Payment info */}
        {(req.paymentMethod || req.paymentDetail) && (
          <Section title="การชำระเงิน">
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="วิธีการชำระ" value={req.paymentMethod || '—'} />
              <InfoRow label="วันที่ต้องโอน" value={req.dueDate ? formatDate(req.dueDate) : '—'} />
              {req.paymentDetail && (
                <div className="col-span-2">
                  <InfoRow label="รายละเอียดการชำระ" value={req.paymentDetail} />
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Section 6: Attachments */}
        {activeAttachments.length > 0 && (
          <Section title="ไฟล์แนบ">
            <div className="space-y-2">
              {activeAttachments.map(att => (
                <div key={att.attachmentId}
                  className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <FileText size={14} className="text-slate-400" />
                    <span className="text-slate-700 font-medium">{att.fileName}</span>
                    <span className="text-slate-400">|</span>
                    <span className="text-slate-500">{att.documentCategory}</span>
                    <span className="text-slate-400">|</span>
                    <span className="text-slate-400">{(att.fileSize / 1024).toFixed(1)} KB</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{formatDate(att.uploadedDate)}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Section 7: Notes */}
        {(req.internalNote || req.approverNote || req.accountingNote) && (
          <Section title="หมายเหตุ">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {req.internalNote && (
                <div>
                  <p className="text-slate-400 mb-1 flex items-center gap-1"><Info size={12} /> หมายเหตุภายใน (ไม่แสดงใน PDF)</p>
                  <p className="text-slate-700 whitespace-pre-wrap">{req.internalNote}</p>
                </div>
              )}
              {req.approverNote && (
                <div>
                  <p className="text-slate-400 mb-1">หมายเหตุถึงผู้อนุมัติ</p>
                  <p className="text-slate-700 whitespace-pre-wrap">{req.approverNote}</p>
                </div>
              )}
              {req.accountingNote && (
                <div>
                  <p className="text-slate-400 mb-1">หมายเหตุถึงฝ่ายบัญชี</p>
                  <p className="text-slate-700 whitespace-pre-wrap">{req.accountingNote}</p>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Section 8: Audit log */}
        {req.logs.length > 0 && (
          <Section title="ประวัติการดำเนินการ">
            <div className="space-y-2">
              {[...req.logs].reverse().map(log => (
                <div key={log.logId} className="flex items-start gap-3 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-slate-700">{log.action}</span>
                    {log.beforeValue && log.afterValue && (
                      <span className="text-slate-400"> — <span className="text-slate-500">{log.beforeValue}</span> → <span className="font-medium text-slate-700">{log.afterValue}</span></span>
                    )}
                  </div>
                  <span className="text-slate-400 flex-shrink-0">{formatDateTime(log.actionDateTime)}</span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Workflow action modal */}
      {actionModal && (
        <Modal
          open={!!actionModal}
          onClose={() => setActionModal(null)}
          title={actionModal.label}
          footer={
            <>
              <Button variant="outline" onClick={() => setActionModal(null)} disabled={actionSaving}>ยกเลิก</Button>
              <button
                onClick={confirmAction}
                disabled={actionSaving}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors',
                  actionModal.variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#05a94f] hover:bg-[#048a3f]',
                  actionSaving && 'opacity-60 cursor-not-allowed',
                )}>
                {actionSaving ? 'กำลังบันทึก...' : 'ยืนยัน'}
              </button>
            </>
          }>
          <div className="space-y-3 text-sm text-slate-600">
            {actionModal.confirmLabel && !actionModal.needsReason && (
              <p>{actionModal.confirmLabel}</p>
            )}
            {actionModal.needsReason && (
              <Textarea
                label={actionModal.reasonLabel ?? 'เหตุผล'}
                required
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="ระบุเหตุผล..."
                rows={3}
              />
            )}
            {actionError && (
              <p className="text-red-600 text-xs">{actionError}</p>
            )}
          </div>
        </Modal>
      )}
    </AppLayout>
  )
}
