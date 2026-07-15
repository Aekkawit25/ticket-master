'use client'

import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import {
  Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow,
} from '@/components/ui/table'
import {
  ChevronLeft, Plus, Trash2, AlertTriangle, CheckCircle, X,
} from 'lucide-react'
import {
  getDemoStocks, buildPaymentSchedule,
} from '@/lib/demo-storage'
import {
  formatDate, formatCurrency, formatNumber, PAYMENT_TYPE_LABELS,
} from '@/lib/utils'
import type {
  DemoRequisition, DemoReqItem, DemoReqSupplierSnapshot,
  DemoReqAttachment, RequisitionStatus, CalculationBasis,
} from '@/lib/requisition-storage'
import {
  getRequisitions, saveRequisition, generateReqId, generateRequisitionNo,
  checkDuplicateRequisition, getMockSupplier, calcReqTotals, buildPaymentDetail,
  addReqLog,
  REQUISITION_STATUS_INFO, PAYMENT_METHOD_OPTIONS, DOC_CATEGORY_OPTIONS,
  CALC_BASIS_LABELS,
} from '@/lib/requisition-storage'

// ─── helpers ────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function genItemId(): string {
  return `ITEM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function genAttachId(): string {
  return `ATT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function blankItem(): DemoReqItem {
  const now = new Date().toISOString()
  return {
    itemId: genItemId(),
    itemType: 'OTHER',
    pnrId: null,
    pnrDisplay: null,
    stageId: null,
    paymentRuleId: null,
    paymentType: 'OTHER',
    stageSeq: null,
    stageName: '',
    calculationBasis: 'FIXED_AMOUNT',
    seatSnapshot: 0,
    snapshotType: 'MANUAL',
    snapshotDateTime: now,
    seatTotalAtSnapshot: 0,
    seatRemainingAtSnapshot: 0,
    ratePerSeat: 0,
    fixedAmount: 0,
    percent: 0,
    calculatedAmount: 0,
    creditTowardFare: false,
    refundable: true,
    currencyCode: 'THB',
    dueDate: null,
    ttlDate: null,
    remark: '',
    createdDate: now,
    updatedDate: now,
  }
}

const PAYMENT_TYPE_OPTIONS = Object.entries(PAYMENT_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))

// ─── Toast ───────────────────────────────────────────────────────────────────

interface Toast { id: string; message: string; type: 'success' | 'error' }

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm text-white transition-all
            ${t.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
        >
          {t.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      ))}
    </div>
  )
}

// ─── Form State ──────────────────────────────────────────────────────────────

interface FormState {
  requisitionId: string
  requisitionNo: string | null
  sourceType: 'PNR' | 'GENERAL'
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
  dueDate: string
  referenceDoc: string
  department: string
  supplierSnapshot: DemoReqSupplierSnapshot | null
  selectedAccountId: string
  currencyCode: string
  exchangeRate: number
  discountAmount: number
  includeVat: boolean
  vatRate: number
  includeWHT: boolean
  whtRate: number
  items: DemoReqItem[]
  paymentMethod: string
  paymentDetail: string
  internalNote: string
  approverNote: string
  accountingNote: string
  differenceReason: string
  documentStatus: RequisitionStatus
  attachments: DemoReqAttachment[]
  isDifferenceDoc: boolean
  // Reference info for display
  stageName: string
  paymentType: string
}

function defaultForm(): FormState {
  return {
    requisitionId: generateReqId(),
    requisitionNo: null,
    sourceType: 'GENERAL',
    seriesId: null,
    seriesCode: null,
    seriesName: null,
    airlineCode: null,
    travelPeriod: null,
    routeText: null,
    pnrIds: [],
    pnrDisplays: [],
    documentTitle: '',
    documentDate: todayISO(),
    dueDate: '',
    referenceDoc: '',
    department: 'ฝ่ายบัญชี',
    supplierSnapshot: null,
    selectedAccountId: '',
    currencyCode: 'THB',
    exchangeRate: 1,
    discountAmount: 0,
    includeVat: false,
    vatRate: 7,
    includeWHT: false,
    whtRate: 3,
    items: [],
    paymentMethod: 'โอนเงิน',
    paymentDetail: '',
    internalNote: '',
    approverNote: '',
    accountingNote: '',
    differenceReason: '',
    documentStatus: 'DRAFT',
    attachments: [],
    isDifferenceDoc: false,
    stageName: '',
    paymentType: '',
  }
}

// ─── Duplicate alert state ─────────────────────────────────────────────────

interface DupAlert {
  pnrId: string
  stageId: string
  existingReq: DemoRequisition
}

// ─── Inner page (needs useSearchParams) ──────────────────────────────────────

function CreateRequisitionInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const stockId = searchParams.get('stockId')
  const pnrId   = searchParams.get('pnrId')
  const stageId = searchParams.get('stageId')
  const reqId   = searchParams.get('reqId')

  const isEditing = !!reqId

  const [form, setForm] = useState<FormState>(defaultForm)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [dupAlerts, setDupAlerts] = useState<DupAlert[]>([])
  const [selectedDocCategory, setSelectedDocCategory] = useState(DOC_CATEGORY_OPTIONS[0])
  const [isDirty, setIsDirty] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Toast helper ──────────────────────────────────────────────────────────

  const addToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = `toast-${Date.now()}`
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  // ── setF helper ──────────────────────────────────────────────────────────

  function setF<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  // ── Unsaved change warning ────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // ── Data Loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (reqId) {
      // Load existing requisition for editing
      const all = getRequisitions()
      const existing = all.find(r => r.requisitionId === reqId)
      if (existing) {
        setForm({
          requisitionId: existing.requisitionId,
          requisitionNo: existing.requisitionNo,
          sourceType: existing.sourceType,
          seriesId: existing.seriesId,
          seriesCode: existing.seriesCode,
          seriesName: existing.seriesName,
          airlineCode: existing.airlineCode,
          travelPeriod: existing.travelPeriod,
          routeText: existing.routeText,
          pnrIds: existing.pnrIds,
          pnrDisplays: existing.pnrDisplays,
          documentTitle: existing.documentTitle,
          documentDate: existing.documentDate,
          dueDate: existing.dueDate ?? '',
          referenceDoc: existing.referenceDoc,
          department: existing.department,
          supplierSnapshot: existing.supplierSnapshot,
          selectedAccountId: existing.supplierSnapshot?.selectedAccountId ?? '',
          currencyCode: existing.currencyCode,
          exchangeRate: existing.exchangeRate,
          discountAmount: existing.discountAmount,
          includeVat: existing.vatRate > 0,
          vatRate: existing.vatRate || 7,
          includeWHT: existing.withholdingTaxRate > 0,
          whtRate: existing.withholdingTaxRate || 3,
          items: existing.items,
          paymentMethod: existing.paymentMethod,
          paymentDetail: existing.paymentDetail,
          internalNote: existing.internalNote,
          approverNote: existing.approverNote,
          accountingNote: existing.accountingNote,
          differenceReason: existing.differenceReason,
          documentStatus: existing.documentStatus,
          attachments: existing.attachments,
          isDifferenceDoc: existing.isDifferenceDoc,
          stageName: existing.items[0]?.stageName ?? '',
          paymentType: existing.items[0]?.paymentType ?? '',
        })
        setIsDirty(false)
      }
      return
    }

    if (stockId) {
      const stocks = getDemoStocks()
      const stock = stocks.find(s => s.stockId === stockId)
      if (!stock) return

      const supplier = getMockSupplier(stock.airlineCode)
      const schedule = buildPaymentSchedule(stock)

      const pnr = pnrId ? stock.pnrs.find(p => p.pnrId === pnrId) : null
      const condStage = pnr
        ? stock.conditions.flatMap(sc => sc.condition.stages).find(s => s.stageId === stageId)
        : null
      const scheduleItem = schedule.find(s => s.pnrId === pnrId && s.stageId === stageId)

      // Build initial item
      let initialItem: DemoReqItem | null = null
      if (pnr && condStage) {
        const snapshot = pnr.stageSnapshots?.[condStage.stageId]
        const isLocked = !!snapshot

        const isPerSeat = condStage.calcType === 'PER_SEAT'
        const calcBasis: CalculationBasis = isPerSeat ? 'CURRENT_REMAINING_SEAT' : 'FIXED_AMOUNT'

        const seatCount = isLocked
          ? (snapshot?.seatSnapshot ?? pnr.seatTotal)
          : pnr.seatTotal

        const rate = snapshot?.rateSnapshot ?? (isPerSeat ? condStage.amount : 0)
        const amount = isLocked
          ? (snapshot?.confirmedAmount ?? (isPerSeat ? seatCount * rate : condStage.amount))
          : (isPerSeat ? seatCount * rate : condStage.amount)

        const now = new Date().toISOString()
        initialItem = {
          itemId: genItemId(),
          itemType: 'PNR_STAGE',
          pnrId: pnr.pnrId,
          pnrDisplay: pnr.pnrDisplay,
          stageId: condStage.stageId,
          paymentRuleId: null,
          paymentType: condStage.paymentType,
          stageSeq: condStage.stageNo,
          stageName: condStage.stageName,
          calculationBasis: calcBasis,
          seatSnapshot: seatCount,
          snapshotType: isLocked ? 'INITIAL_SEAT' : 'CURRENT_REMAINING_SEAT',
          snapshotDateTime: now,
          seatTotalAtSnapshot: pnr.seatTotal,
          seatRemainingAtSnapshot: pnr.seatBalance ?? pnr.seatTotal,
          ratePerSeat: rate,
          fixedAmount: amount,
          percent: 0,
          calculatedAmount: amount,
          creditTowardFare: condStage.creditTowardFare ?? false,
          refundable: !(condStage.nonRefundable ?? false),
          currencyCode: stock.currency,
          dueDate: scheduleItem?.dueDate ?? null,
          ttlDate: scheduleItem?.ttlDatetime ?? null,
          remark: '',
          createdDate: now,
          updatedDate: now,
        }

        // Duplicate check
        const dup = checkDuplicateRequisition(pnr.pnrId, condStage.stageId)
        if (dup) {
          setDupAlerts([{ pnrId: pnr.pnrId, stageId: condStage.stageId, existingReq: dup }])
        }
      }

      // Travel period text
      const travelStart = pnr?.travelStart ?? stock.summary.periodStart ?? ''
      const travelEnd = pnr?.travelEnd ?? stock.summary.periodEnd ?? ''
      const travelPeriod = travelStart
        ? (travelEnd && travelEnd !== travelStart
          ? `${formatDate(travelStart)} – ${formatDate(travelEnd)}`
          : formatDate(travelStart))
        : null

      const autoTitle = pnr
        ? `ใบเบิก ${condStage?.stageName ?? ''} — ${pnr.pnrDisplay}`
        : `ใบเบิก ${stock.stockCode}`

      setForm(prev => ({
        ...prev,
        sourceType: 'PNR',
        seriesId: stock.stockId,
        seriesCode: stock.stockCode,
        seriesName: stock.groupName,
        airlineCode: stock.airlineCode,
        travelPeriod,
        routeText: stock.routeText,
        pnrIds: pnr ? [pnr.pnrId] : [],
        pnrDisplays: pnr ? [pnr.pnrDisplay] : [],
        currencyCode: stock.currency,
        exchangeRate: stock.currency === 'THB' ? 1 : 1,
        supplierSnapshot: { ...supplier, selectedAccountId: supplier.selectedAccountId },
        selectedAccountId: supplier.selectedAccountId,
        referenceDoc: pnr ? `${stock.stockCode} / ${pnr.pnrDisplay}` : stock.stockCode,
        dueDate: scheduleItem?.dueDate ?? '',
        items: initialItem ? [initialItem] : [],
        documentTitle: autoTitle,
        paymentDetail: initialItem ? buildPaymentDetail(initialItem) : '',
        stageName: condStage?.stageName ?? '',
        paymentType: condStage?.paymentType ?? '',
      }))
      setIsDirty(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Computed ──────────────────────────────────────────────────────────────

  const totals = useMemo(() => calcReqTotals(
    form.items,
    form.discountAmount,
    form.includeVat ? form.vatRate : 0,
    form.includeWHT ? form.whtRate : 0,
  ), [form.items, form.discountAmount, form.includeVat, form.vatRate, form.includeWHT, form.whtRate])

  const uniquePnrCount = useMemo(() => {
    const ids = form.items
      .filter(i => i.itemType === 'PNR_STAGE' && i.pnrId)
      .map(i => i.pnrId!)
    return new Set(ids).size
  }, [form.items])

  const totalSeats = useMemo(() =>
    form.items
      .filter(i => i.itemType === 'PNR_STAGE')
      .reduce((s, i) => s + i.seatSnapshot, 0),
    [form.items])

  const typeBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    for (const item of form.items) {
      const key = item.paymentType || 'OTHER'
      map[key] = (map[key] ?? 0) + item.calculatedAmount
    }
    return map
  }, [form.items])

  // ── Item update helpers ───────────────────────────────────────────────────

  function updateItem(itemId: string, patch: Partial<DemoReqItem>) {
    setF('items', form.items.map(i => i.itemId === itemId ? { ...i, ...patch, updatedDate: new Date().toISOString() } : i))
  }

  function removeItem(itemId: string) {
    setF('items', form.items.filter(i => i.itemId !== itemId))
  }

  function addOtherItem() {
    const newItem = blankItem()
    newItem.currencyCode = form.currencyCode
    setF('items', [...form.items, newItem])
  }

  // ── File upload ───────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const newAttachments: DemoReqAttachment[] = []
    Array.from(files).forEach(file => {
      newAttachments.push({
        attachmentId: genAttachId(),
        documentCategory: selectedDocCategory,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        uploadedBy: 'Admin',
        uploadedDate: new Date().toISOString(),
        status: 'ACTIVE',
      })
    })
    setF('attachments', [...form.attachments, ...newAttachments])
    e.target.value = ''
  }

  function removeAttachment(attachmentId: string) {
    setF('attachments', form.attachments.map(a =>
      a.attachmentId === attachmentId ? { ...a, status: 'DELETED' as const } : a
    ))
  }

  // ── Build DemoRequisition from form ───────────────────────────────────────

  function buildRequisition(status: RequisitionStatus, withNo: boolean): DemoRequisition {
    const now = new Date().toISOString()
    const effectiveNo = withNo && !form.requisitionNo ? generateRequisitionNo() : form.requisitionNo
    const t = calcReqTotals(
      form.items,
      form.discountAmount,
      form.includeVat ? form.vatRate : 0,
      form.includeWHT ? form.whtRate : 0,
    )
    const supplier = form.supplierSnapshot
      ? { ...form.supplierSnapshot, selectedAccountId: form.selectedAccountId }
      : null

    return {
      requisitionId: form.requisitionId,
      requisitionNo: effectiveNo,
      documentType: 'REQUISITION',
      sourceType: form.sourceType,
      seriesId: form.seriesId,
      seriesCode: form.seriesCode,
      seriesName: form.seriesName,
      airlineCode: form.airlineCode,
      travelPeriod: form.travelPeriod,
      routeText: form.routeText,
      pnrIds: form.pnrIds,
      pnrDisplays: form.pnrDisplays,
      documentTitle: form.documentTitle,
      documentDate: form.documentDate,
      dueDate: form.dueDate || null,
      referenceDoc: form.referenceDoc,
      department: form.department,
      supplierSnapshot: supplier,
      currencyCode: form.currencyCode,
      exchangeRate: form.exchangeRate,
      subtotal: t.subtotal,
      discountAmount: t.discountAmount,
      vatRate: form.includeVat ? form.vatRate : 0,
      vatAmount: t.vatAmount,
      withholdingTaxRate: form.includeWHT ? form.whtRate : 0,
      withholdingTaxAmount: t.withholdingTaxAmount,
      netAmount: t.netAmount,
      approvedAmount: 0,
      paidAmount: 0,
      items: form.items,
      paymentMethod: form.paymentMethod,
      paymentDetail: form.paymentDetail,
      documentStatus: status,
      paymentStatus: 'UNPAID',
      payments: [],
      attachments: form.attachments,
      internalNote: form.internalNote,
      approverNote: form.approverNote,
      accountingNote: form.accountingNote,
      differenceReason: form.differenceReason,
      isDifferenceDoc: form.isDifferenceDoc,
      originalRequisitionId: null,
      approvedBy: null,
      approvedDate: null,
      rejectedBy: null,
      rejectedDate: null,
      rejectedReason: null,
      cancelledBy: null,
      cancelledDate: null,
      cancelReason: null,
      createdBy: 'Admin',
      createdDate: now,
      updatedBy: 'Admin',
      updatedDate: now,
      logs: [],
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(forSubmit: boolean): string | null {
    if (!form.supplierSnapshot) return 'กรุณาเลือก Supplier'
    if (form.items.length === 0) return 'ต้องมีรายการอย่างน้อย 1 รายการ'
    for (const item of form.items) {
      if (item.calculatedAmount <= 0) return `รายการ "${item.stageName || item.itemType}" ต้องมียอดมากกว่า 0`
    }
    if (form.currencyCode !== 'THB' && form.exchangeRate <= 0) return 'กรุณาระบุอัตราแลกเปลี่ยน'
    if (forSubmit && !form.documentTitle) return 'กรุณาระบุหัวข้อเอกสาร'
    return null
  }

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function handleSaveDraft() {
    const err = validate(false)
    if (err) { addToast(err, 'error'); return }
    setIsSaving(true)
    try {
      let req = buildRequisition('DRAFT', false)
      req = addReqLog(req, 'SAVE_DRAFT', 'Admin', undefined, 'บันทึกฉบับร่าง')
      saveRequisition(req)
      setForm(prev => ({ ...prev, requisitionNo: req.requisitionNo, documentStatus: 'DRAFT' }))
      setIsDirty(false)
      addToast('บันทึกฉบับร่างสำเร็จ')
      router.push(`/requisitions/${req.requisitionId}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmitApproval() {
    const err = validate(true)
    if (err) { addToast(err, 'error'); return }
    setIsSaving(true)
    try {
      let req = buildRequisition('PENDING_APPROVAL', true)
      req = addReqLog(req, 'SUBMIT_APPROVAL', 'Admin', undefined, 'ส่งอนุมัติ')
      saveRequisition(req)
      setForm(prev => ({ ...prev, requisitionNo: req.requisitionNo, documentStatus: 'PENDING_APPROVAL' }))
      setIsDirty(false)
      addToast('ส่งอนุมัติสำเร็จ')
      router.push(`/requisitions/${req.requisitionId}`)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Status badge ──────────────────────────────────────────────────────────

  const statusInfo = REQUISITION_STATUS_INFO[form.documentStatus]

  const isSubmitted = !['DRAFT'].includes(form.documentStatus)

  // ── PNR stage items for reference section ─────────────────────────────────

  const pnrItems = form.items.filter(i => i.itemType === 'PNR_STAGE')

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout title={isEditing ? 'แก้ไขใบเบิก' : 'สร้างใบเบิก'}>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ── Sticky Top Bar ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/requisitions')}>
              <ChevronLeft size={16} />
              กลับ
            </Button>
            <h1 className="text-base font-semibold text-slate-800">
              {isEditing ? 'แก้ไขใบเบิก' : 'สร้างใบเบิก'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isEditing && (
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            )}
            <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={isSaving}>
              บันทึกฉบับร่าง
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmitApproval} disabled={isSaving}>
              ส่งอนุมัติ
            </Button>
          </div>
        </div>
      </div>

      {/* ── Reference Info Bar ─────────────────────────────────────── */}
      {form.sourceType === 'PNR' && (
        <div className="bg-slate-100 border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
              {form.seriesCode && (
                <span><span className="font-medium text-slate-500">Series Code:</span> {form.seriesCode}</span>
              )}
              {form.seriesName && (
                <span><span className="font-medium text-slate-500">Series Name:</span> {form.seriesName}</span>
              )}
              {form.airlineCode && (
                <span><span className="font-medium text-slate-500">Airline:</span> {form.airlineCode}</span>
              )}
              {form.routeText && (
                <span><span className="font-medium text-slate-500">เส้นทาง:</span> {form.routeText}</span>
              )}
              {form.travelPeriod && (
                <span><span className="font-medium text-slate-500">Travel Period:</span> {form.travelPeriod}</span>
              )}
              {form.stageName && (
                <span><span className="font-medium text-slate-500">รอบชำระ:</span> {form.stageName}</span>
              )}
              {form.dueDate && (
                <span><span className="font-medium text-slate-500">วันที่ครบกำหนด:</span> {formatDate(form.dueDate)}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ───────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-28">

        {/* ── Section 1: ข้อมูลเอกสาร ────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">ข้อมูลเอกสาร</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">เลขที่เอกสาร</label>
              <input
                readOnly
                value={form.requisitionNo ?? 'สร้างอัตโนมัติ'}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
              />
            </div>
            <Input
              label="หัวข้อเอกสาร"
              required
              value={form.documentTitle}
              onChange={e => setF('documentTitle', e.target.value)}
              placeholder="ระบุหัวข้อเอกสาร"
            />
            <Input
              label="เอกสารอ้างอิง"
              value={form.referenceDoc}
              onChange={e => setF('referenceDoc', e.target.value)}
              placeholder="Series Code / PNR"
            />
            <Input
              label="วันที่สร้างเอกสาร"
              type="date"
              value={form.documentDate}
              readOnly={isSubmitted}
              onChange={e => !isSubmitted && setF('documentDate', e.target.value)}
            />
            <Input
              label="วันที่ครบกำหนด"
              type="date"
              value={form.dueDate}
              onChange={e => setF('dueDate', e.target.value)}
            />
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">ผู้สร้างเอกสาร</label>
              <input
                readOnly
                value="Admin"
                className="w-full px-3 py-2 text-sm border rounded-lg bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
              />
            </div>
            <Input
              label="แผนก"
              value={form.department}
              onChange={e => setF('department', e.target.value)}
            />
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">สถานะ</label>
              <div className="px-3 py-2">
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 2: ข้อมูล PNR อ้างอิง ──────────────────────── */}
        {form.sourceType === 'PNR' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">ข้อมูล PNR อ้างอิง</h2>
                <p className="text-xs text-slate-400 mt-0.5">(อ่านอย่างเดียว — ดึงจากระบบ PNR)</p>
              </div>
              <div title="ฟีเจอร์นี้จะเปิดใช้งานในเวอร์ชันถัดไป">
                <Button variant="outline" size="sm" disabled icon={<Plus size={14} />}>
                  เพิ่ม PNR
                </Button>
              </div>
            </div>
            <Table>
              <TableHead>
                <tr>
                  <Th>PNR</Th>
                  <Th>Airline</Th>
                  <Th>Route</Th>
                  <Th>Travel Period</Th>
                  <Th className="text-right">Seat Total</Th>
                  <Th className="text-right">Seat Used</Th>
                  <Th>Condition</Th>
                  <Th>Payment Type</Th>
                  <Th>Payment Stage</Th>
                  <Th>Due Date</Th>
                  <Th>NAME DL</Th>
                  <Th>Currency</Th>
                  <Th></Th>
                </tr>
              </TableHead>
              <TableBody>
                {pnrItems.length === 0 ? (
                  <EmptyRow cols={13} message="ไม่มีรายการ PNR" />
                ) : (
                  pnrItems.map(item => (
                    <TableRow key={item.itemId}>
                      <Td className="font-mono text-xs">{item.pnrDisplay ?? '-'}</Td>
                      <Td>{form.airlineCode ?? '-'}</Td>
                      <Td>{form.routeText ?? '-'}</Td>
                      <Td>{form.travelPeriod ?? '-'}</Td>
                      <Td className="text-right">{formatNumber(item.seatTotalAtSnapshot)}</Td>
                      <Td className="text-right">{formatNumber(item.seatTotalAtSnapshot - item.seatRemainingAtSnapshot)}</Td>
                      <Td className="text-xs">{item.stageName}</Td>
                      <Td className="text-xs">{PAYMENT_TYPE_LABELS[item.paymentType] ?? item.paymentType}</Td>
                      <Td className="text-xs">{item.stageSeq ? `รอบที่ ${item.stageSeq}` : '-'}</Td>
                      <Td className="text-xs">{item.dueDate ? formatDate(item.dueDate) : '-'}</Td>
                      <Td className="text-xs">{item.ttlDate ? formatDate(item.ttlDate) : '-'}</Td>
                      <Td>{item.currencyCode}</Td>
                      <Td>
                        {(pnrItems.length > 1 || form.documentStatus === 'DRAFT') && (
                          <button
                            onClick={() => removeItem(item.itemId)}
                            className="text-red-400 hover:text-red-600 p-1"
                            title="ลบรายการ PNR"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </Td>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* ── Duplicate Alert ───────────────────────────────────────── */}
        {dupAlerts.map(alert => (
          <div key={`${alert.pnrId}-${alert.stageId}`}
            className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800 mb-2">
                  พบใบเบิกสำหรับ PNR และรอบการชำระนี้แล้ว
                </p>
                <div className="text-xs text-amber-700 grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                  <div><span className="font-medium">เลขที่ใบเบิกเดิม:</span> {alert.existingReq.requisitionNo ?? '-'}</div>
                  <div><span className="font-medium">วันที่:</span> {formatDate(alert.existingReq.documentDate)}</div>
                  <div><span className="font-medium">ยอด:</span> {formatCurrency(alert.existingReq.netAmount, alert.existingReq.currencyCode)}</div>
                  <div><span className="font-medium">สถานะ:</span> {REQUISITION_STATUS_INFO[alert.existingReq.documentStatus].label}</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/requisitions/${alert.existingReq.requisitionId}`)}
                  >
                    เปิดใบเบิกเดิม
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDupAlerts(prev => prev.filter(a => !(a.pnrId === alert.pnrId && a.stageId === alert.stageId)))
                      setF('items', form.items.filter(i => !(i.pnrId === alert.pnrId && i.stageId === alert.stageId)))
                    }}
                  >
                    ยกเลิก
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* ── Section 3: ข้อมูล Supplier ─────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">ข้อมูล Supplier</h2>
          {form.supplierSnapshot ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <ReadonlyField label="Supplier Code" value={form.supplierSnapshot.supplierCode} />
                <ReadonlyField label="ชื่อ Supplier" value={form.supplierSnapshot.supplierName} />
                <ReadonlyField label="เลขประจำตัวผู้เสียภาษี" value={form.supplierSnapshot.taxId} />
                <ReadonlyField
                  label="สำนักงานใหญ่/สาขา"
                  value={form.supplierSnapshot.branchType === 'HQ'
                    ? `สำนักงานใหญ่ (${form.supplierSnapshot.branchNo})`
                    : `สาขา ${form.supplierSnapshot.branchNo}`}
                />
                <ReadonlyField label="ที่อยู่" value={form.supplierSnapshot.address} className="col-span-1 md:col-span-2" />
                <ReadonlyField label="ชื่อผู้ติดต่อ" value={form.supplierSnapshot.contactName} />
                <ReadonlyField label="เบอร์โทรศัพท์" value={form.supplierSnapshot.phone} />
                <ReadonlyField label="อีเมล" value={form.supplierSnapshot.email} />
              </div>

              {/* Bank Accounts */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">บัญชีรับเงิน</p>
                <p className="text-xs text-slate-400 mb-3">
                  ห้ามกรอกเลขบัญชีใหม่โดยตรง — ต้องแก้ไขจากข้อมูล Supplier Master
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {form.supplierSnapshot.bankAccounts.map(acc => (
                    <label
                      key={acc.accountId}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
                        ${form.selectedAccountId === acc.accountId
                          ? 'border-[#05a94f] bg-green-50'
                          : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <input
                        type="radio"
                        name="bankAccount"
                        value={acc.accountId}
                        checked={form.selectedAccountId === acc.accountId}
                        onChange={() => setF('selectedAccountId', acc.accountId)}
                        className="mt-0.5 accent-[#05a94f]"
                      />
                      <div className="text-xs space-y-0.5">
                        <p className="font-medium text-slate-700">{acc.bankName}</p>
                        <p className="text-slate-600">{acc.accountName}</p>
                        <p className="font-mono text-slate-500">{acc.accountNo}</p>
                        <p className="text-slate-400">สาขา: {acc.branch}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">ไม่พบข้อมูล Supplier</p>
          )}
        </div>

        {/* ── Section 4: รายการใบเบิก ──────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">รายการใบเบิก</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th className="w-8">#</Th>
                  <Th>PNR</Th>
                  <Th>ประเภทการชำระ</Th>
                  <Th className="text-right">รอบที่</Th>
                  <Th>ฐานคำนวณ</Th>
                  <Th className="text-right">จำนวนที่นั่ง</Th>
                  <Th className="text-right">ราคา/ที่นั่ง</Th>
                  <Th className="text-right font-semibold">จำนวนเงิน</Th>
                  <Th>สกุลเงิน</Th>
                  <Th className="text-center">นับเป็นค่าตั๋ว</Th>
                  <Th className="text-center">คืนเงินได้</Th>
                  <Th>วันครบกำหนด</Th>
                  <Th>หมายเหตุ</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {form.items.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-3 py-10 text-center text-slate-400 text-sm">
                      ไม่มีรายการ
                    </td>
                  </tr>
                ) : (
                  form.items.map((item, idx) => (
                    <ItemRow
                      key={item.itemId}
                      item={item}
                      index={idx}
                      onUpdate={patch => updateItem(item.itemId, patch)}
                      onRemove={() => removeItem(item.itemId)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={addOtherItem}>
              เพิ่มค่าใช้จ่ายอื่น
            </Button>
          </div>
        </div>

        {/* ── Section 5: ข้อมูลราคาและภาษี ───────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">ข้อมูลราคาและภาษี</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">สกุลเงิน</label>
              <input readOnly value={form.currencyCode}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed" />
            </div>

            {form.currencyCode !== 'THB' && (
              <Input
                label="อัตราแลกเปลี่ยน"
                type="number"
                min={0}
                step="0.0001"
                value={form.exchangeRate}
                onChange={e => setF('exchangeRate', parseFloat(e.target.value) || 0)}
                required
              />
            )}

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">VAT</label>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="includeVat"
                  checked={form.includeVat}
                  onChange={e => setF('includeVat', e.target.checked)}
                  className="accent-[#05a94f]"
                />
                <label htmlFor="includeVat" className="text-xs text-slate-600">คิด VAT</label>
                {form.includeVat && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={form.vatRate}
                      onChange={e => setF('vatRate', parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 text-xs border rounded border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#05a94f]"
                    />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">ภาษีหัก ณ ที่จ่าย</label>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="includeWHT"
                  checked={form.includeWHT}
                  onChange={e => setF('includeWHT', e.target.checked)}
                  className="accent-[#05a94f]"
                />
                <label htmlFor="includeWHT" className="text-xs text-slate-600">หักภาษี ณ ที่จ่าย</label>
                {form.includeWHT && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={form.whtRate}
                      onChange={e => setF('whtRate', parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 text-xs border rounded border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#05a94f]"
                    />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                )}
              </div>
            </div>

            <Input
              label="ส่วนลด"
              type="number"
              min={0}
              step="0.01"
              value={form.discountAmount}
              onChange={e => setF('discountAmount', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* ── Section 6: การชำระเงิน ───────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">การชำระเงิน</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="วิธีการชำระ"
              value={form.paymentMethod}
              onChange={e => setF('paymentMethod', e.target.value)}
              options={PAYMENT_METHOD_OPTIONS.map(o => ({ value: o, label: o }))}
            />
            <Input
              label="วันที่ต้องโอน"
              type="date"
              value={form.dueDate}
              onChange={e => setF('dueDate', e.target.value)}
            />
            <div className="col-span-1 md:col-span-2">
              <Textarea
                label="รายละเอียดการชำระ"
                value={form.paymentDetail}
                onChange={e => setF('paymentDetail', e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* ── Section 7: สรุปรายการ ────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">สรุปรายการ</h2>
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left: counts */}
            <div className="flex-1 grid grid-cols-2 gap-3 content-start">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">จำนวน PNR</p>
                <p className="text-xl font-bold text-slate-800">{uniquePnrCount}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">จำนวนที่นั่งรวม</p>
                <p className="text-xl font-bold text-slate-800">{formatNumber(totalSeats)}</p>
              </div>
              {/* Type breakdown */}
              {Object.entries(typeBreakdown).map(([type, amount]) => (
                <div key={type} className="bg-slate-50 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-slate-500">{PAYMENT_TYPE_LABELS[type] ?? type}</p>
                  <p className="text-sm font-semibold text-slate-700">{formatCurrency(amount, form.currencyCode)}</p>
                </div>
              ))}
            </div>

            {/* Right: totals */}
            <div className="md:w-80 flex-shrink-0">
              <div className="bg-slate-50 rounded-xl p-4 text-xs space-y-2">
                <SummaryRow label="มูลค่ารายการก่อนภาษี" value={formatCurrency(totals.subtotal, form.currencyCode)} />
                {totals.discountAmount > 0 && (
                  <SummaryRow label="ส่วนลดรวม" value={`-${formatCurrency(totals.discountAmount, form.currencyCode)}`} className="text-red-600" />
                )}
                {totals.discountAmount > 0 && (
                  <>
                    <div className="border-t border-slate-300 my-1" />
                    <SummaryRow label="มูลค่าหลังส่วนลด" value={formatCurrency(totals.subtotal - totals.discountAmount, form.currencyCode)} />
                  </>
                )}
                {form.includeVat && (
                  <SummaryRow label={`VAT ${form.vatRate}%`} value={formatCurrency(totals.vatAmount, form.currencyCode)} />
                )}
                {form.includeWHT && (
                  <SummaryRow label={`ภาษีหัก ณ ที่จ่าย ${form.whtRate}%`} value={`-${formatCurrency(totals.withholdingTaxAmount, form.currencyCode)}`} className="text-red-600" />
                )}
                <div className="border-t-2 border-slate-400 my-1" />
                <SummaryRow label="ยอดสุทธิที่ขอเบิก" value={formatCurrency(totals.netAmount, form.currencyCode)} bold />
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 8: ไฟล์แนบ ───────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">ไฟล์แนบ</h2>

          {/* Category selector */}
          <div className="mb-3 max-w-xs">
            <Select
              label="ประเภทเอกสาร"
              value={selectedDocCategory}
              onChange={e => setSelectedDocCategory(e.target.value)}
              options={DOC_CATEGORY_OPTIONS.map(o => ({ value: o, label: o }))}
            />
          </div>

          {/* File list */}
          {form.attachments.filter(a => a.status === 'ACTIVE').length > 0 && (
            <Table className="mb-3">
              <TableHead>
                <tr>
                  <Th>ชื่อไฟล์</Th>
                  <Th>ประเภทเอกสาร</Th>
                  <Th className="text-right">ขนาดไฟล์</Th>
                  <Th>วันที่อัปโหลด</Th>
                  <Th>ผู้อัปโหลด</Th>
                  <Th></Th>
                </tr>
              </TableHead>
              <TableBody>
                {form.attachments.filter(a => a.status === 'ACTIVE').map(att => (
                  <TableRow key={att.attachmentId}>
                    <Td className="text-xs font-medium">{att.fileName}</Td>
                    <Td className="text-xs">{att.documentCategory}</Td>
                    <Td className="text-right text-xs">{(att.fileSize / 1024).toFixed(1)} KB</Td>
                    <Td className="text-xs">{formatDate(att.uploadedDate)}</Td>
                    <Td className="text-xs">{att.uploadedBy}</Td>
                    <Td>
                      <button
                        onClick={() => removeAttachment(att.attachmentId)}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Upload button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              อัปโหลดไฟล์
            </Button>
            <p className="text-xs text-slate-400 mt-1">รองรับ: PDF, JPG, JPEG, PNG, DOC, DOCX, XLS, XLSX</p>
          </div>
        </div>

        {/* ── Section 9: หมายเหตุ ──────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">หมายเหตุ</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label="หมายเหตุภายใน"
              helper="ไม่แสดงในเอกสาร PDF"
              value={form.internalNote}
              onChange={e => setF('internalNote', e.target.value)}
              rows={3}
            />
            <Textarea
              label="หมายเหตุถึงผู้อนุมัติ"
              value={form.approverNote}
              onChange={e => setF('approverNote', e.target.value)}
              rows={3}
            />
            <Textarea
              label="หมายเหตุถึงฝ่ายบัญชี"
              value={form.accountingNote}
              onChange={e => setF('accountingNote', e.target.value)}
              rows={3}
            />
            {form.isDifferenceDoc && (
              <Textarea
                label="เหตุผลกรณีสร้างยอดส่วนต่าง"
                value={form.differenceReason}
                onChange={e => setF('differenceReason', e.target.value)}
                rows={3}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Sticky Bottom Bar ─────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 lg:pl-[276px] flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/requisitions')}>
            <ChevronLeft size={16} />
            กลับหน้าหลัก
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={isSaving}>
              บันทึกฉบับร่าง
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmitApproval} disabled={isSaving}>
              บันทึกและส่งอนุมัติ
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReadonlyField({
  label, value, className,
}: { label: string; value: string; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <label className="block text-xs font-medium text-slate-500">{label}</label>
      <p className="text-sm text-slate-800 py-1">{value || '-'}</p>
    </div>
  )
}

function SummaryRow({
  label, value, bold, className,
}: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div className={`flex items-center justify-between ${className ?? ''}`}>
      <span className="text-slate-500">{label}</span>
      <span className={bold ? 'font-bold text-slate-800 text-sm' : 'text-slate-700'}>{value}</span>
    </div>
  )
}

interface ItemRowProps {
  item: DemoReqItem
  index: number
  onUpdate: (patch: Partial<DemoReqItem>) => void
  onRemove: () => void
}

function ItemRow({ item, index, onUpdate, onRemove }: ItemRowProps) {
  const isOther = item.itemType === 'OTHER'

  return (
    <tr className="hover:bg-slate-50">
      <Td className="text-slate-400 text-xs">{index + 1}</Td>
      <Td className="font-mono text-xs">{item.pnrDisplay ?? '-'}</Td>
      <Td className="text-xs min-w-[120px]">
        {isOther ? (
          <select
            value={item.paymentType}
            onChange={e => onUpdate({ paymentType: e.target.value })}
            className="w-full text-xs border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#05a94f]"
          >
            {PAYMENT_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          PAYMENT_TYPE_LABELS[item.paymentType] ?? item.paymentType
        )}
      </Td>
      <Td className="text-right text-xs">{item.stageSeq ?? '-'}</Td>
      <Td className="text-xs">{CALC_BASIS_LABELS[item.calculationBasis]}</Td>
      <Td className="text-right text-xs">{formatNumber(item.seatSnapshot)}</Td>
      <Td className="text-right text-xs">
        {isOther ? (
          <input
            type="number"
            min={0}
            step="0.01"
            value={item.ratePerSeat}
            onChange={e => {
              const rate = parseFloat(e.target.value) || 0
              onUpdate({ ratePerSeat: rate, calculatedAmount: rate * (item.seatSnapshot || 1) })
            }}
            className="w-24 text-right text-xs border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#05a94f]"
          />
        ) : (
          formatNumber(item.ratePerSeat, 2)
        )}
      </Td>
      <Td className="text-right text-xs font-semibold">
        {isOther ? (
          <input
            type="number"
            min={0}
            step="0.01"
            value={item.calculatedAmount}
            onChange={e => onUpdate({ calculatedAmount: parseFloat(e.target.value) || 0 })}
            className="w-28 text-right text-xs border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#05a94f]"
          />
        ) : (
          formatNumber(item.calculatedAmount, 2)
        )}
      </Td>
      <Td className="text-xs">{item.currencyCode}</Td>
      <Td className="text-center">
        <input
          type="checkbox"
          checked={item.creditTowardFare}
          readOnly={!isOther}
          onChange={isOther ? e => onUpdate({ creditTowardFare: e.target.checked }) : undefined}
          className="accent-[#05a94f]"
        />
      </Td>
      <Td className="text-center">
        <input
          type="checkbox"
          checked={item.refundable}
          readOnly={!isOther}
          onChange={isOther ? e => onUpdate({ refundable: e.target.checked }) : undefined}
          className="accent-[#05a94f]"
        />
      </Td>
      <Td className="text-xs">{item.dueDate ? formatDate(item.dueDate) : '-'}</Td>
      <Td className="min-w-[120px]">
        <input
          type="text"
          value={item.remark}
          onChange={e => onUpdate({ remark: e.target.value })}
          placeholder="หมายเหตุ"
          className="w-full text-xs border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#05a94f]"
        />
      </Td>
      <Td>
        {isOther && (
          <button
            onClick={onRemove}
            className="text-red-400 hover:text-red-600 p-1"
          >
            <Trash2 size={14} />
          </button>
        )}
      </Td>
    </tr>
  )
}

// ─── Page export (wrapped in Suspense for useSearchParams) ────────────────────

export default function CreateRequisitionPage() {
  return (
    <Suspense fallback={
      <AppLayout title="สร้างใบเบิก">
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
          กำลังโหลด...
        </div>
      </AppLayout>
    }>
      <CreateRequisitionInner />
    </Suspense>
  )
}
