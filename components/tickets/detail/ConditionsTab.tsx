'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import {
  CheckCircle2, AlertTriangle, X, FileText, Search, Check,
  ChevronDown, ChevronRight, Pencil, Copy, RefreshCw, Plus, Clock,
} from 'lucide-react'
import { saveDemoStock } from '@/lib/demo-storage'
import type { DemoStock, DemoLog } from '@/lib/demo-storage'
import {
  type AppCondition,
  type AppStockCondition,
  type CondTemplateType,
  defaultCondition,
  newConditionId,
  generateConditionCode,
  formatStageAmount,
  formatTtlRule,
  COND_REFUND_TYPE_LABELS,
  COND_REFUND_TYPE_COLORS,
  COND_TEMPLATE_TYPE_SHORT,
  COND_TEMPLATE_TYPE_COLORS,
  COND_DUE_TYPE_LABELS,
  COND_CALC_TYPE_LABELS,
  COND_PAYMENT_TYPE_LABELS,
} from '@/lib/condition-schema'
import {
  getConditionTemplates,
  snapshotTemplateToCondition,
} from '@/lib/condition-storage'
import ConditionEditorModal from '@/components/condition-builder/ConditionEditorModal'
import type { AppConditionTemplate } from '@/lib/condition-schema'

// ─── ID helper ───────────────────────────────────────────────────────────────

const newLogId = () => `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ sc }: { sc: AppStockCondition }) {
  if (sc.source === 'template') {
    if (sc.locallyModified) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
          Modified จาก Template
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200">
        <FileText size={9} /> Template: {sc.sourceTemplateName ?? '—'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
      Custom
    </span>
  )
}

// ─── Template picker modal ────────────────────────────────────────────────────

function TemplatePickerModal({
  open, onClose, onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (t: AppConditionTemplate) => void
}) {
  const [templates, setTemplates] = useState<AppConditionTemplate[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setSearch(''); setSelected(null); return }
    setTemplates(getConditionTemplates().filter(t => t.condition.status === 'Active'))
  }, [open])

  const filtered = useMemo(() => {
    if (!search.trim()) return templates
    const q = search.toLowerCase()
    return templates.filter(t =>
      t.condition.conditionCode.toLowerCase().includes(q) ||
      t.condition.conditionName.toLowerCase().includes(q) ||
      (t.condition.description ?? '').toLowerCase().includes(q) ||
      (t.airlineCode ?? '').toLowerCase().includes(q),
    )
  }, [templates, search])

  const selectedItem = templates.find(t => t.templateId === selected) ?? null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เลือก Template Condition"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button disabled={!selectedItem} onClick={() => selectedItem && onPick(selectedItem)}>
            ใช้ Template นี้
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา Template..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
          />
        </div>
        <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-6">
              {search ? 'ไม่พบ Template ที่ตรงกัน' : 'ยังไม่มี Template Condition ที่ Active'}
            </p>
          ) : (
            filtered.map(t => (
              <button
                key={t.templateId}
                type="button"
                onClick={() => setSelected(prev => prev === t.templateId ? null : t.templateId)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                  selected === t.templateId
                    ? 'border-[#05a94f] bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold ${COND_TEMPLATE_TYPE_COLORS[t.templateType as CondTemplateType]}`}>
                        {COND_TEMPLATE_TYPE_SHORT[t.templateType as CondTemplateType]}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">{t.condition.conditionCode}</span>
                      <span className="text-sm font-semibold text-slate-800">{t.condition.conditionName}</span>
                      <span className="text-[10px] text-slate-400">{t.condition.stages.length} งวด</span>
                      {t.airlineCode && <span className="text-[10px] text-slate-500">{t.airlineCode}</span>}
                    </div>
                    {t.condition.description && (
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{t.condition.description}</p>
                    )}
                  </div>
                  {selected === t.templateId && <Check size={14} className="shrink-0 text-[#05a94f] mt-0.5" />}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  liveStock: DemoStock | null
  currency: string
  canEdit: boolean
  jumpToEdit: boolean
  onUpdate: (stock: DemoStock) => void
  onDirtyChange: (dirty: boolean) => void
  onJumpDone: () => void
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ConditionsTab({
  liveStock, currency, canEdit, jumpToEdit, onUpdate, onDirtyChange, onJumpDone,
}: Props) {
  const [editingId, setEditingId]             = useState<string | null>(null)
  const [editDraft, setEditDraft]             = useState<AppCondition | null>(null)
  const [initialDraft, setInitialDraft]       = useState<AppCondition | null>(null)
  const [isNewCondition, setIsNewCondition]   = useState(false)
  const [newConditionSc, setNewConditionSc]   = useState<AppStockCondition | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [showResetConfirm, setShowResetConfirm]     = useState<AppStockCondition | null>(null)
  const [expandedIds, setExpandedIds]               = useState<Set<string>>(new Set())
  const [toast, setToast]                           = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    if (jumpToEdit && liveStock?.conditions.length) {
      const first = liveStock.conditions[0]
      openEdit(first)
      onJumpDone()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToEdit])

  const conditions = liveStock?.conditions ?? []

  const toggleCard = (id: string) =>
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Save helper ───────────────────────────────────────────────────────────────
  const persistUpdate = (newConditions: AppStockCondition[], logMsg: string) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const log: DemoLog = { logId: newLogId(), action: logMsg, message: logMsg, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = {
      ...liveStock,
      conditions: newConditions,
      updatedAt: now,
      logs: [log, ...liveStock.logs],
    }
    saveDemoStock(updated)
    onUpdate(updated)
  }

  // ── Edit single condition ─────────────────────────────────────────────────────
  const openEdit = (sc: AppStockCondition) => {
    // Pre-merge series airline/currency so modal's init onChange produces identical JSON
    const merged = liveStock
      ? { ...sc.condition, airline: liveStock.airlineCode, currency: liveStock.currency }
      : { ...sc.condition }
    setInitialDraft(merged)
    setEditDraft(merged)
    setEditingId(sc.condition.conditionId)
    setIsNewCondition(false)
    setNewConditionSc(null)
    onDirtyChange(true)
  }

  const cancelEdit = useCallback(() => {
    const isDirty = editDraft && initialDraft &&
      JSON.stringify(editDraft) !== JSON.stringify(initialDraft)
    if (isDirty) {
      if (!window.confirm('มีข้อมูลที่ยังไม่ได้บันทึก\nต้องการออกโดยไม่บันทึกหรือไม่?')) return
    }
    setEditingId(null)
    setEditDraft(null)
    setInitialDraft(null)
    setIsNewCondition(false)
    setNewConditionSc(null)
    onDirtyChange(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDraft, initialDraft])

  const _doSave = useCallback((cond: AppCondition, source?: AppStockCondition) => {
    if (!liveStock || !editingId) return
    if (isNewCondition) {
      const sc: AppStockCondition = source
        ? { ...source, condition: cond }
        : { source: 'custom', condition: cond }
      persistUpdate([...liveStock.conditions, sc], `สร้าง Condition "${cond.conditionName}"`)
      setExpandedIds(prev => new Set([...prev, cond.conditionId]))
    } else {
      persistUpdate(
        liveStock.conditions.map(sc =>
          sc.condition.conditionId !== editingId ? sc : {
            ...sc,
            locallyModified: sc.source === 'template' ? true : sc.locallyModified,
            condition: cond,
          }
        ),
        `แก้ไข Condition "${cond.conditionName}"`,
      )
    }
    setEditingId(null)
    setEditDraft(null)
    setInitialDraft(null)
    setIsNewCondition(false)
    setNewConditionSc(null)
    onDirtyChange(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStock, editingId, isNewCondition])

  const saveEdit = useCallback((cond: AppCondition) => {
    _doSave(cond, newConditionSc ?? undefined)
    showToast('บันทึก Condition สำเร็จ')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_doSave, newConditionSc])

  const saveDraftEdit = useCallback((cond: AppCondition) => {
    _doSave(cond, newConditionSc ?? undefined)
    showToast('บันทึกฉบับร่าง สำเร็จ')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_doSave, newConditionSc])

  // ── Apply from template — open in editor first, persist only on Save ──────────
  const handlePickTemplate = useCallback((tmpl: AppConditionTemplate) => {
    if (!liveStock) return
    setShowTemplatePicker(false)
    const sc = snapshotTemplateToCondition(tmpl)
    const existingCodes = liveStock.conditions.map(c => c.condition.conditionCode)
    if (existingCodes.includes(sc.condition.conditionCode)) {
      sc.condition.conditionId = newConditionId()
      sc.condition.conditionCode = generateConditionCode(existingCodes)
    }
    // Pre-merge series info so modal's init onChange produces identical JSON
    const merged = { ...sc.condition, airline: liveStock.airlineCode, currency: liveStock.currency }
    setInitialDraft(merged)
    setEditDraft(merged)
    setEditingId(sc.condition.conditionId)
    setIsNewCondition(true)
    setNewConditionSc(sc)
    onDirtyChange(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStock])

  // ── Add new blank condition — open in editor first, persist only on Save ──────
  const handleAddNew = useCallback(() => {
    if (!liveStock) return
    const existingCodes = liveStock.conditions.map(c => c.condition.conditionCode)
    // Pre-merge series airline/currency so modal's init onChange produces identical JSON
    const cond = {
      ...defaultCondition({ conditionCode: generateConditionCode(existingCodes) }),
      airline: liveStock.airlineCode,
      currency: liveStock.currency,
    }
    setInitialDraft({ ...cond })
    setEditDraft({ ...cond })
    setEditingId(cond.conditionId)
    setIsNewCondition(true)
    setNewConditionSc({ source: 'custom', condition: cond })
    onDirtyChange(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStock])

  // ── Duplicate ─────────────────────────────────────────────────────────────────
  const handleDuplicate = useCallback((sc: AppStockCondition) => {
    if (!liveStock) return
    const existingCodes = liveStock.conditions.map(c => c.condition.conditionCode)
    const dup: AppStockCondition = {
      source: 'custom',
      condition: {
        ...sc.condition,
        conditionId: newConditionId(),
        conditionCode: generateConditionCode(existingCodes),
        conditionName: sc.condition.conditionName + ' (Copy)',
      },
    }
    const newConditions = [...liveStock.conditions, dup]
    persistUpdate(newConditions, `คัดลอก Condition "${sc.condition.conditionName}"`)
    showToast(`คัดลอก "${sc.condition.conditionName}" สำเร็จ`)
    setExpandedIds(prev => new Set([...prev, dup.condition.conditionId]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStock])

  // ── Reset from template ───────────────────────────────────────────────────────
  const handleConfirmReset = useCallback(() => {
    if (!liveStock || !showResetConfirm) return
    const templateId = showResetConfirm.sourceTemplateId!
    const origId = showResetConfirm.condition.conditionId
    const origCode = showResetConfirm.condition.conditionCode
    const allTemplates = getConditionTemplates()
    const tmpl = allTemplates.find(t => t.templateId === templateId)
    if (!tmpl) { setShowResetConfirm(null); return }
    const fresh = snapshotTemplateToCondition(tmpl)
    fresh.condition.conditionId = origId
    fresh.condition.conditionCode = origCode
    const newConditions = liveStock.conditions.map(sc =>
      sc.condition.conditionId === origId ? fresh : sc,
    )
    persistUpdate(newConditions, `รีเซ็ต Condition "${fresh.condition.conditionName}" จาก Template`)
    setShowResetConfirm(null)
    showToast('รีเซ็ต Condition จาก Template สำเร็จ')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStock, showResetConfirm])

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = useCallback((sc: AppStockCondition) => {
    if (!liveStock) return
    if (!window.confirm(`ลบ "${sc.condition.conditionName}" หรือไม่?`)) return
    const newConditions = liveStock.conditions.filter(c => c.condition.conditionId !== sc.condition.conditionId)
    persistUpdate(newConditions, `ลบ Condition "${sc.condition.conditionName}"`)
    showToast(`ลบ "${sc.condition.conditionName}" แล้ว`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStock])

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2 text-sm text-[#05a94f] bg-green-50 border border-green-200 rounded-xl px-3 py-2">
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      {/* Action bar */}
      {canEdit && !editingId && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" icon={<FileText size={13} />}
            onClick={() => setShowTemplatePicker(true)}>
            ใช้ Template Condition
          </Button>
          <Button size="sm" variant="outline" icon={<Plus size={13} />}
            onClick={handleAddNew}>
            สร้าง Condition ใหม่
          </Button>
        </div>
      )}

      {/* Read-only condition cards */}
      <div className="space-y-3">
        {conditions.length === 0 ? (
          <Card>
            <CardContent>
              <div className="flex flex-col items-center py-10 gap-4 text-center">
                <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                  <Clock size={22} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">ยังไม่ได้ระบุ Condition</p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    ข้อมูลตั๋วถูกบันทึกแล้ว คุณสามารถเลือก Template Condition หรือสร้าง Condition ใหม่ภายหลังได้
                  </p>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button size="sm" icon={<FileText size={13} />} onClick={() => setShowTemplatePicker(true)}>
                      เลือก Template Condition
                    </Button>
                    <Button size="sm" variant="outline" icon={<Plus size={13} />} onClick={handleAddNew}>
                      สร้าง Condition ใหม่
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          conditions.map(sc => {
            const c = sc.condition
            const isExpanded = expandedIds.has(c.conditionId)
            const pnrCount = liveStock?.pnrs.filter(p => p.conditionCode === c.conditionCode || p.conditionCode === c.conditionId).length ?? 0
            return (
              <Card key={c.conditionId}>
                <div
                  role="button" tabIndex={0}
                  onClick={() => toggleCard(c.conditionId)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleCard(c.conditionId)}
                  className="flex items-start justify-between gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="mt-0.5 text-slate-400 shrink-0">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <div className="min-w-0">
                      {/* Row 1: code + name */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-px rounded">{c.conditionCode || '—'}</span>
                        <span className="font-semibold text-sm text-slate-800">{c.conditionName}</span>
                      </div>
                      {/* Row 2: badges */}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <SourceBadge sc={sc} />
                        <span className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-semibold ${c.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {c.status}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{c.stages.length} งวด</span>
                        {pnrCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{pnrCount} PNR ใช้งาน</span>
                        )}
                        {c.description && (
                          <span className="text-[10px] text-slate-400 truncate max-w-xs">{c.description}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {sc.source === 'template' && sc.sourceTemplateId && (
                        <button type="button" title="รีเซ็ตจาก Template"
                          onClick={() => setShowResetConfirm(sc)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition">
                          <RefreshCw size={13} />
                        </button>
                      )}
                      <button type="button" title="คัดลอก"
                        onClick={() => handleDuplicate(sc)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
                        <Copy size={13} />
                      </button>
                      <button type="button" title="แก้ไข"
                        onClick={() => openEdit(sc)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#05a94f] hover:bg-emerald-50 transition">
                        <Pencil size={13} />
                      </button>
                      <button type="button" title="ลบ"
                        onClick={() => handleDelete(sc)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition">
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4">
                    {/* Template source banner */}
                    {sc.source === 'template' && sc.sourceTemplateId && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-700">
                        <FileText size={12} className="shrink-0" />
                        <div className="flex-1">
                          <span className="font-medium">Template ต้นฉบับ:</span> {sc.sourceTemplateName ?? '—'}
                          {sc.appliedAt && (
                            <span className="text-blue-500 ml-2">
                              นำมาใช้เมื่อ {new Date(sc.appliedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </span>
                          )}
                          {sc.sourceTemplateVersion && <span className="text-blue-400 ml-1">(v{sc.sourceTemplateVersion})</span>}
                        </div>
                        {sc.locallyModified && (
                          <span className="shrink-0 px-2 py-px rounded bg-amber-100 text-amber-700 font-semibold">แก้ไขแล้ว</span>
                        )}
                      </div>
                    )}

                    {/* Payment stages */}
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">รอบชำระเงิน</p>
                      {c.stages.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">ยังไม่มีรอบชำระเงิน</p>
                      ) : (
                        <div className="space-y-2">
                          {c.stages.map(s => {
                            const dueText =
                              s.dueType === 'TRAVEL_MINUS_DAYS'   ? `ก่อนเดินทาง ${s.dueDays} วัน เวลา ${s.dueTime}` :
                              s.dueType === 'CREATED_PLUS_DAYS'   ? `หลังสร้าง ${s.dueDays} วัน เวลา ${s.dueTime}` :
                              s.dueType === 'PREV_DUE_PLUS_DAYS'  ? `หลังงวดก่อน ${s.dueDays} วัน เวลา ${s.dueTime}` :
                              s.dueType === 'PREV_PAID_PLUS_DAYS' ? `หลังชำระงวดก่อน ${s.dueDays} วัน เวลา ${s.dueTime}` :
                              s.dueType === 'CUSTOM_DATE'          ? (s.dueDate || 'วันที่กำหนดเอง') :
                              'TBD'
                            const isNonRefundable = s.refundable === 'NON_REFUNDABLE' || s.nonRefundable
                            return (
                              <div key={s.stageId} className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
                                {/* Stage header */}
                                <div className="flex items-center gap-2.5 px-3 py-2 bg-white border-b border-slate-100">
                                  <span className="w-5 h-5 rounded-full bg-[#05a94f] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                    {s.stageNo}
                                  </span>
                                  <span className="text-xs font-semibold text-slate-700 flex-1 min-w-0 truncate">
                                    {(COND_PAYMENT_TYPE_LABELS as Record<string, string>)[s.paymentType] ?? s.paymentType}
                                  </span>
                                  <span className="text-sm font-bold text-slate-800 shrink-0">
                                    {formatStageAmount(s, currency)}
                                  </span>
                                </div>
                                {/* Stage detail */}
                                <div className="px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                                  <span className="text-[11px] text-slate-500">
                                    วิธีคิด: <span className="text-slate-700 font-medium">{COND_CALC_TYPE_LABELS[s.calcType]}</span>
                                  </span>
                                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                                    <Clock size={10} className="text-slate-400 shrink-0" />
                                    กำหนดชำระ: <span className="text-slate-700 font-medium ml-0.5">{dueText}</span>
                                  </span>
                                  {/* Property badges */}
                                  <div className="flex items-center gap-1 ml-auto flex-wrap">
                                    {s.creditTowardFare && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-100">
                                        นับเป็นค่าตั๋ว
                                      </span>
                                    )}
                                    {s.refundable === 'REFUNDABLE' && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium border border-blue-100">
                                        คืนเงินได้
                                      </span>
                                    )}
                                    {isNonRefundable && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-medium border border-red-100">
                                        คืนเงินไม่ได้
                                      </span>
                                    )}
                                    {s.refundable === 'AS_SEAT_RETURN' && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium border border-amber-100">
                                        ตามเงื่อนไขคืนที่นั่ง
                                      </span>
                                    )}
                                    {(s.refundable === 'UNSPECIFIED' || (!s.refundable && !s.nonRefundable)) && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-medium">
                                        ยังไม่ระบุคืนเงิน
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {s.remark && (
                                  <div className="px-3 pb-2 text-[10px] text-slate-400 italic">{s.remark}</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Refund */}
                    {c.refundPolicy.enabled && c.refundPolicy.refundType && (
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 mb-1.5">นโยบายคืนเงิน</p>
                        <div className="flex items-start gap-2">
                          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${COND_REFUND_TYPE_COLORS[c.refundPolicy.refundType]}`}>
                            {COND_REFUND_TYPE_LABELS[c.refundPolicy.refundType]}
                          </span>
                          {c.refundPolicy.description && (
                            <p className="text-xs text-slate-600">{c.refundPolicy.description}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Free text condition */}
                    {(c.freeTextCondition || (c as any).freeTextHtml) && (
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 mb-1">เงื่อนไขเพิ่มเติม</p>
                        {(c as any).freeTextHtml ? (
                          <div
                            className="text-xs text-slate-600 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5"
                            dangerouslySetInnerHTML={{ __html: (c as any).freeTextHtml }}
                          />
                        ) : (
                          <p className="text-xs text-slate-600 whitespace-pre-wrap">{c.freeTextCondition}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })
        )}
      </div>

      {/* Template picker */}
      <TemplatePickerModal
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onPick={handlePickTemplate}
      />

      {/* Edit condition modal */}
      <ConditionEditorModal
        open={!!editingId && !!editDraft}
        mode="modal"
        title={isNewCondition ? 'สร้าง Condition ใหม่' : 'แก้ไข Condition'}
        value={editDraft}
        onChange={setEditDraft}
        currency={currency}
        conditionMode="series"
        seriesInfo={liveStock ? {
          seriesCode:  liveStock.stockCode,
          seriesName:  liveStock.groupName,
          airlineCode: liveStock.airlineCode,
          currency:    liveStock.currency,
          routes: liveStock.sectors
            .filter(s => s.depAirportCode && s.arrAirportCode)
            .map(s => `${s.depAirportCode}-${s.arrAirportCode}`)
            .filter((r, i, arr) => arr.indexOf(r) === i),
        } : undefined}
        showBasicInfo
        readOnly={!canEdit}
        onCancel={cancelEdit}
        onSaveDraft={canEdit ? saveDraftEdit : undefined}
        onSave={saveEdit}
      />

      {/* Reset from template confirm */}
      <Modal
        open={!!showResetConfirm}
        onClose={() => setShowResetConfirm(null)}
        title="รีเซ็ต Condition จาก Template"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowResetConfirm(null)}>ยกเลิก</Button>
            <Button variant="danger" onClick={handleConfirmReset}>ยืนยัน — รีเซ็ต</Button>
          </>
        }
      >
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
          <div className="flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
              <p>รีเซ็ต Condition นี้จาก Template <strong>"{showResetConfirm?.sourceTemplateName}"</strong></p>
              <p className="mt-1">การแก้ไขทั้งหมดที่ทำกับ Condition นี้จะถูกทับ</p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
