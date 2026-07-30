'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import {
  CheckCircle2, AlertTriangle, X, FileText, Search, Check,
  ChevronDown, ChevronRight, Pencil, Copy, RefreshCw, Plus, Clock,
  GitCompare, ArrowUpCircle, Info, ExternalLink, ArrowRightLeft, Unlink,
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
import {
  getSeriesConditionRelationship,
  computeConditionDiff,
  computeOverrideFields,
  validateTemplateForSeries,
  computeTemplateReadiness,
  SERIES_CONDITION_STATUS_LABEL,
  SERIES_CONDITION_STATUS_COLOR,
  type ConditionDiffSection,
} from '@/lib/condition-relationship'
import ConditionEditorModal from '@/components/condition-builder/ConditionEditorModal'
import type { AppConditionTemplate } from '@/lib/condition-schema'

// ─── ID helper ───────────────────────────────────────────────────────────────

const newLogId = () => `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ─── Condition name generator for Series ──────────────────────────────────────
// Rule: 1st = seriesName, 2nd = "seriesName แบบ 2", 3rd = "seriesName แบบ 3"…
// Always uses maxExistingIndex+1 so deleting a middle item never re-uses numbers.

function generateConditionNameForSeries(
  seriesName: string,
  existingConditions: AppStockCondition[],
): string {
  if (!seriesName.trim()) return ''
  const escaped = seriesName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const suffixRe = new RegExp(`^${escaped} แบบ (\\d+)$`)

  let maxIdx = 0
  for (const sc of existingConditions) {
    const name = sc.condition.conditionName
    if (name === seriesName) {
      maxIdx = Math.max(maxIdx, 1)
    } else {
      const m = name.match(suffixRe)
      if (m) maxIdx = Math.max(maxIdx, parseInt(m[1], 10))
    }
  }

  const nextIdx = maxIdx + 1
  return nextIdx === 1 ? seriesName : `${seriesName} แบบ ${nextIdx}`
}

// ─── Relationship status badge ────────────────────────────────────────────────

function RelationshipBadge({
  sc, allTemplates,
}: { sc: AppStockCondition; allTemplates: AppConditionTemplate[] }) {
  const rel = getSeriesConditionRelationship(sc, allTemplates)
  const colorCls = SERIES_CONDITION_STATUS_COLOR[rel.status]
  const label    = SERIES_CONDITION_STATUS_LABEL[rel.status]

  if (rel.status === 'NONE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        Custom
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colorCls}`}>
      {rel.status === 'NEW_VERSION' && <ArrowUpCircle size={9} className="shrink-0" />}
      {rel.status === 'CUSTOM' && <Info size={9} className="shrink-0" />}
      {label}
      {rel.overrideCount > 0 && <span className="opacity-70">· {rel.overrideCount} หัวข้อ</span>}
    </span>
  )
}

// ─── Inline diff view ─────────────────────────────────────────────────────────

function ConditionDiffView({ sections }: { sections: ConditionDiffSection[] }) {
  const diffSections = sections.filter(s => s.isDiff)
  const sameSections = sections.filter(s => !s.isDiff)

  if (sections.length === 0) {
    return <p className="text-xs text-slate-400 italic">ไม่สามารถโหลดข้อมูลเปรียบเทียบได้</p>
  }

  return (
    <div className="space-y-2">
      {diffSections.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <CheckCircle2 size={13} className="shrink-0" />
          ทุกหัวข้อตรงกับ Template — ไม่พบความแตกต่าง
        </div>
      ) : (
        <>
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">
            หัวข้อที่แตกต่าง ({diffSections.length})
          </p>
          {diffSections.map(s => (
            <div key={s.section} className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden text-xs">
              <div className="px-3 py-1.5 bg-amber-100 border-b border-amber-200 font-semibold text-amber-800 text-[11px]">
                {s.label}
              </div>
              <div className="grid grid-cols-2 divide-x divide-amber-200">
                <div className="px-3 py-2">
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Series (ปัจจุบัน)</p>
                  <p className="text-slate-700 leading-relaxed">{s.snapshotSummary}</p>
                </div>
                <div className="px-3 py-2">
                  <p className="text-[9px] font-bold text-blue-500 uppercase mb-0.5">Template (ล่าสุด)</p>
                  <p className="text-slate-700 leading-relaxed">{s.templateSummary}</p>
                </div>
              </div>
            </div>
          ))}
          {sameSections.length > 0 && (
            <p className="text-[10px] text-slate-400">
              หัวข้อที่เหมือนกัน: {sameSections.map(s => s.label).join(', ')}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Template picker modal ────────────────────────────────────────────────────

function TemplatePickerModal({
  open, onClose, onUse, onCopy, stock,
}: {
  open: boolean
  onClose: () => void
  onUse: (t: AppConditionTemplate) => void   // direct save — only for ready templates
  onCopy: (t: AppConditionTemplate) => void  // open editor — for any template
  stock?: DemoStock | null
}) {
  const [templates, setTemplates] = useState<AppConditionTemplate[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setSearch(''); setSelected(null); return }
    const all = getConditionTemplates().filter(t =>
      !t.isArchived &&
      t.condition.status === 'Active' &&
      (!t.airlineCode || !stock?.airlineCode || t.airlineCode === stock.airlineCode)
    )
    setTemplates(all)
  }, [open, stock])

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

  const selectedItem    = templates.find(t => t.templateId === selected) ?? null
  const selectedReady   = selectedItem ? computeTemplateReadiness(selectedItem) : null
  const selectedValid   = selectedItem && stock ? validateTemplateForSeries(selectedItem, stock) : null
  const canUseDirectly  = !!selectedItem && selectedReady?.status === 'ready' && (selectedValid == null || selectedValid.valid)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เลือก Template Condition"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          {/* Confirmation hint when a ready template is selected */}
          {canUseDirectly && selectedItem && (
            <p className="text-[10px] text-emerald-600 flex-1 leading-snug">
              Condition จะใช้ข้อมูลตาม Template <strong>{selectedItem.condition.conditionCode}</strong> v{selectedItem.version} ทันที
            </p>
          )}
          {!canUseDirectly && <span className="flex-1" />}
          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
            <Button
              variant="outline"
              disabled={!selectedItem}
              onClick={() => selectedItem && onCopy(selectedItem)}
            >
              คัดลอกมาแก้ไข
            </Button>
            <Button
              disabled={!canUseDirectly}
              title={!selectedItem ? 'กรุณาเลือก Template' : selectedReady?.status !== 'ready' ? 'ไม่สามารถใช้ตาม Template ได้ เนื่องจากข้อมูลยังไม่ครบ' : ''}
              onClick={() => selectedItem && onUse(selectedItem)}
            >
              ใช้ตาม Template
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {stock && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <Info size={11} className="shrink-0 text-slate-400" />
            แสดงเฉพาะ Template ที่ตรงกับสายการบิน <strong className="text-slate-700">{stock.airlineCode}</strong>
          </div>
        )}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา Template..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
          />
        </div>

        {/* Currency / validation warnings for selected item */}
        {selectedValid?.warnings.map((w, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <AlertTriangle size={11} className="shrink-0" />
            {w}
          </div>
        ))}

        {/* Missing-fields panel for selected incomplete template */}
        {selectedItem && selectedReady?.status === 'incomplete' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-1">
            <p className="text-[10px] font-semibold text-amber-700 flex items-center gap-1.5">
              <AlertTriangle size={11} className="shrink-0" />
              ข้อมูลที่ยังขาด — สามารถ "คัดลอกมาแก้ไข" เพื่อกรอกให้ครบ
            </p>
            <ul className="space-y-0.5">
              {selectedReady.missingFields.map((f, i) => (
                <li key={i} className="text-[10px] text-amber-600 flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">•</span>{f}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-6">
              {search
                ? 'ไม่พบ Template ที่ตรงกัน'
                : stock
                  ? `ยังไม่มี Template Condition Active สำหรับสายการบิน ${stock.airlineCode}`
                  : 'ยังไม่มี Template Condition ที่ Active'}
            </p>
          ) : (
            filtered.map(t => {
              const readiness = computeTemplateReadiness(t)
              const currencyMismatch = stock && t.currency && t.currency !== stock.currency
              const isSelected = selected === t.templateId
              return (
                <button
                  key={t.templateId}
                  type="button"
                  onClick={() => setSelected(prev => prev === t.templateId ? null : t.templateId)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-[#05a94f] bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px] text-slate-400">{t.condition.conditionCode}</span>
                        <span className="text-sm font-semibold text-slate-800">{t.condition.conditionName}</span>
                        <span className="text-[10px] text-slate-400">v{t.version}</span>
                        {/* Readiness badge */}
                        {readiness.status === 'ready' ? (
                          <span className="text-[9px] px-1.5 py-px rounded-full bg-emerald-100 text-emerald-700 font-semibold border border-emerald-200 flex items-center gap-0.5">
                            <CheckCircle2 size={9} /> พร้อมใช้งาน
                          </span>
                        ) : (
                          <span
                            className="text-[9px] px-1.5 py-px rounded-full bg-amber-100 text-amber-700 font-semibold border border-amber-200 cursor-help"
                            title={`ข้อมูลที่ยังขาด:\n${readiness.missingFields.map(f => `• ${f}`).join('\n')}`}
                          >
                            ข้อมูลไม่ครบ
                          </span>
                        )}
                        {currencyMismatch && (
                          <span className="text-[9px] px-1.5 py-px rounded-full bg-orange-100 text-orange-700 font-semibold">
                            {t.currency} ≠ {stock?.currency}
                          </span>
                        )}
                      </div>
                      {t.condition.description && (
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{t.condition.description}</p>
                      )}
                      {/* Show missing fields inline when incomplete and selected */}
                      {isSelected && readiness.status === 'incomplete' && readiness.missingFields.length > 0 && (
                        <div className="mt-1.5 text-[10px] text-amber-600 space-y-0.5">
                          {readiness.missingFields.slice(0, 3).map((f, i) => (
                            <div key={i} className="flex items-start gap-1">
                              <span className="shrink-0">•</span>{f}
                            </div>
                          ))}
                          {readiness.missingFields.length > 3 && (
                            <div className="text-amber-400">+{readiness.missingFields.length - 3} รายการ</div>
                          )}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check size={14} className="shrink-0 text-[#05a94f] mt-0.5" />}
                  </div>
                </button>
              )
            })
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
  const [showDiffId, setShowDiffId]                 = useState<string | null>(null)
  const [toast, setToast]                           = useState('')
  const [pendingChangeTemplate, setPendingChangeTemplate] = useState<AppConditionTemplate | null>(null)
  const [showRemoveConfirm, setShowRemoveConfirm]         = useState<AppStockCondition | null>(null)

  // Template list (loaded once; refreshed after reset)
  const [allTemplates, setAllTemplates] = useState<AppConditionTemplate[]>(() => getConditionTemplates())
  const refreshTemplates = useCallback(() => setAllTemplates(getConditionTemplates()), [])

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
  const hasTemplateCond = conditions.some(c => c.source === 'template')
  const directPnrConditions = liveStock?.pnrs.filter(p => p.conditionTemplateId) ?? []

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
      // Compute overrideFields when editing a template-sourced condition
      const now = new Date().toISOString()
      persistUpdate(
        liveStock.conditions.map(sc => {
          if (sc.condition.conditionId !== editingId) return sc
          if (sc.source !== 'template') return { ...sc, condition: cond }

          const tmpl = allTemplates.find(t => t.templateId === sc.sourceTemplateId)
          const overrideFields = tmpl
            ? computeOverrideFields(cond, tmpl.condition, currency)
            : (sc.overrideFields ?? [])
          const hasOverride = overrideFields.length > 0

          return {
            ...sc,
            locallyModified: hasOverride,
            overrideFields,
            overrideAt: hasOverride ? now : sc.overrideAt,
            overrideBy: hasOverride ? 'ผู้ใช้งาน' : sc.overrideBy,
            condition: cond,
          }
        }),
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

  // ── Use template directly — persist snapshot immediately, no editor ──────────
  const handleUseTemplate = useCallback((tmpl: AppConditionTemplate) => {
    if (!liveStock) return
    setShowTemplatePicker(false)

    // If there's already a template condition, show change confirmation instead
    const existingTemplateCond = liveStock.conditions.find(c => c.source === 'template')
    if (existingTemplateCond) {
      setPendingChangeTemplate(tmpl)
      return
    }

    const sc = snapshotTemplateToCondition(tmpl, 'ผู้ใช้งาน')
    const existingCodes = liveStock.conditions.map(c => c.condition.conditionCode)
    if (existingCodes.includes(sc.condition.conditionCode)) {
      sc.condition.conditionId = newConditionId()
      sc.condition.conditionCode = generateConditionCode(existingCodes)
    }
    // Apply series airline/currency into the snapshot
    sc.condition.airline = liveStock.airlineCode
    sc.condition.currency = liveStock.currency
    sc.condition.status = 'Active'
    persistUpdate(
      [...liveStock.conditions, sc],
      `รับ Condition "${sc.condition.conditionName}" จาก Template ${tmpl.condition.conditionCode} v${tmpl.version}`,
    )
    setExpandedIds(prev => new Set([...prev, sc.condition.conditionId]))
    showToast(`รับ Condition จาก Template ${tmpl.condition.conditionCode} v${tmpl.version} สำเร็จ`)
    refreshTemplates()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStock])

  // ── Confirm change to a different template ────────────────────────────────────
  const handleConfirmChangeTemplate = useCallback(() => {
    if (!liveStock || !pendingChangeTemplate) return
    const sc = snapshotTemplateToCondition(pendingChangeTemplate, 'ผู้ใช้งาน')
    const nonTemplateCodes = liveStock.conditions.filter(c => c.source !== 'template').map(c => c.condition.conditionCode)
    if (nonTemplateCodes.includes(sc.condition.conditionCode)) {
      sc.condition.conditionId = newConditionId()
      sc.condition.conditionCode = generateConditionCode(nonTemplateCodes)
    }
    sc.condition.airline = liveStock.airlineCode
    sc.condition.currency = liveStock.currency
    sc.condition.status = 'Active'
    const nonTemplateConds = liveStock.conditions.filter(c => c.source !== 'template')
    const tmpl = pendingChangeTemplate
    persistUpdate(
      [sc, ...nonTemplateConds],
      `เปลี่ยน Template Condition เป็น "${sc.condition.conditionName}" จาก ${tmpl.condition.conditionCode} v${tmpl.version}`,
    )
    setPendingChangeTemplate(null)
    setExpandedIds(prev => new Set([...prev, sc.condition.conditionId]))
    showToast(`เปลี่ยน Condition เป็น ${tmpl.condition.conditionCode} v${tmpl.version} สำเร็จ`)
    refreshTemplates()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStock, pendingChangeTemplate])

  // ── Remove condition from series ─────────────────────────────────────────────
  const handleRemoveCondition = useCallback((sc: AppStockCondition) => {
    if (!liveStock) return
    const newConditions = liveStock.conditions.filter(c => c.condition.conditionId !== sc.condition.conditionId)
    persistUpdate(newConditions, `ยกเลิกการใช้ Condition "${sc.condition.conditionName}"`)
    setShowRemoveConfirm(null)
    showToast(`ยกเลิกการใช้ Condition "${sc.condition.conditionName}" แล้ว`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStock])

  // ── Copy from template — open in editor for the user to fill/modify ──────────
  const handleCopyTemplate = useCallback((tmpl: AppConditionTemplate) => {
    if (!liveStock) return
    setShowTemplatePicker(false)
    const sc = snapshotTemplateToCondition(tmpl, 'ผู้ใช้งาน')
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
    const conditionCode = generateConditionCode(existingCodes)
    const conditionName = generateConditionNameForSeries(liveStock.groupName, liveStock.conditions)
    // Pre-merge series airline/currency so modal's init onChange produces identical JSON
    const cond = {
      ...defaultCondition({ conditionCode, conditionName }),
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

  // ── Reset from template (or update to latest version) ────────────────────────
  const handleConfirmReset = useCallback((targetSc?: AppStockCondition) => {
    const sc = targetSc ?? showResetConfirm
    if (!liveStock || !sc) return
    const templateId = sc.sourceTemplateId!
    const origId = sc.condition.conditionId
    const origCode = sc.condition.conditionCode
    const templates = getConditionTemplates()
    const tmpl = templates.find(t => t.templateId === templateId)
    if (!tmpl) { setShowResetConfirm(null); return }
    // Snapshot with cleared override flags
    const fresh: AppStockCondition = {
      ...snapshotTemplateToCondition(tmpl, 'ผู้ใช้งาน'),
      overrideFields: [],
      overrideAt: undefined,
      overrideBy: undefined,
    }
    fresh.condition.conditionId = origId
    fresh.condition.conditionCode = origCode
    const newConditions = liveStock.conditions.map(s =>
      s.condition.conditionId === origId ? fresh : s,
    )
    persistUpdate(newConditions, `รีเซ็ต Condition "${fresh.condition.conditionName}" จาก Template`)
    setShowResetConfirm(null)
    setShowDiffId(null)
    refreshTemplates()
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
            {hasTemplateCond ? 'เปลี่ยน Template Condition' : 'ใช้ Template Condition'}
          </Button>
          <Button size="sm" variant="outline" icon={<Plus size={13} />}
            onClick={handleAddNew}>
            สร้าง Condition ใหม่
          </Button>
        </div>
      )}

      {/* Read-only condition cards */}
      <div className="space-y-3">
        {conditions.length === 0 && directPnrConditions.length === 0 ? (
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
          <>
            {/* Section 1: Series-level conditions */}
            {conditions.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500">
                <Clock size={13} className="text-slate-400 shrink-0" />
                ยังไม่ได้กำหนด Condition ให้ Series
              </div>
            ) : (
              conditions.map(sc => {
            const c = sc.condition
            const isExpanded = expandedIds.has(c.conditionId)
            const pnrCount = sc.source === 'template'
              ? (liveStock?.pnrs.filter(p => !p.conditionTemplateId).length ?? 0)
              : (liveStock?.pnrs.filter(p => p.conditionCode === c.conditionCode || p.conditionCode === c.conditionId).length ?? 0)
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
                        <RelationshipBadge sc={sc} allTemplates={allTemplates} />
                        {sc.source === 'template' && sc.sourceTemplateId && (() => {
                          const rel = getSeriesConditionRelationship(sc, allTemplates)
                          return (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100">
                              <FileText size={9} />
                              รับจาก {rel.templateCode || sc.sourceTemplateId} v{sc.sourceTemplateVersion ?? 1}
                            </span>
                          )
                        })()}
                        <span className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-semibold ${c.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {c.status}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{c.stages.length} งวด</span>
                        {pnrCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{pnrCount} PNR ใช้งาน</span>
                        )}
                        {sc.appliedAt && sc.source === 'template' && (
                          <span className="text-[10px] text-slate-400">
                            นำมาใช้ {new Date(sc.appliedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                          </span>
                        )}
                        {c.description && (
                          <span className="text-[10px] text-slate-400 truncate max-w-xs">{c.description}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {sc.source === 'template' && sc.sourceTemplateId && (() => {
                      const rel = getSeriesConditionRelationship(sc, allTemplates)
                      return (
                        <>
                          {/* ดู Template ต้นทาง */}
                          <button type="button"
                            title="ดู Template ต้นทาง"
                            onClick={() => window.open(`/tickets/condition-templates/${sc.sourceTemplateId}`, '_self')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition">
                            <ExternalLink size={13} />
                          </button>
                          {/* Compare button */}
                          <button type="button"
                            title="เปรียบเทียบกับ Template"
                            onClick={() => setShowDiffId(prev => prev === c.conditionId ? null : c.conditionId)}
                            className={`p-1.5 rounded-lg transition ${
                              showDiffId === c.conditionId
                                ? 'text-blue-600 bg-blue-50'
                                : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                            }`}>
                            <GitCompare size={13} />
                          </button>
                          {/* Reset/update button */}
                          {canEdit && (
                            <button type="button"
                              title={rel.status === 'NEW_VERSION' ? 'อัปเดตเป็น Version ใหม่' : 'รีเซ็ตจาก Template'}
                              onClick={() => setShowResetConfirm(sc)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition">
                              <RefreshCw size={13} />
                            </button>
                          )}
                          {/* เปลี่ยน Template Condition */}
                          {canEdit && (
                            <button type="button"
                              title="เปลี่ยน Template Condition"
                              onClick={() => setShowTemplatePicker(true)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition">
                              <ArrowRightLeft size={13} />
                            </button>
                          )}
                          {/* ยกเลิกการใช้ Condition */}
                          {canEdit && (
                            <button type="button"
                              title="ยกเลิกการใช้ Condition"
                              onClick={() => setShowRemoveConfirm(sc)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition">
                              <Unlink size={13} />
                            </button>
                          )}
                        </>
                      )
                    })()}
                    {canEdit && (
                      <>
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
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4">
                    {/* Template source banner */}
                    {sc.source === 'template' && sc.sourceTemplateId && (() => {
                      const rel = getSeriesConditionRelationship(sc, allTemplates)
                      const liveTemplate = allTemplates.find(t => t.templateId === sc.sourceTemplateId)
                      return (
                        <div className={`rounded-xl border overflow-hidden text-xs ${
                          rel.status === 'NEW_VERSION' ? 'bg-blue-50 border-blue-200' :
                          rel.status === 'CUSTOM'      ? 'bg-amber-50 border-amber-200' :
                          rel.status === 'UNLINKED'    ? 'bg-slate-50 border-slate-200' :
                          'bg-blue-50 border-blue-100'
                        }`}>
                          {/* Banner header */}
                          <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                            <FileText size={12} className={`shrink-0 ${
                              rel.status === 'NEW_VERSION' ? 'text-blue-500' :
                              rel.status === 'CUSTOM'      ? 'text-amber-500' :
                              rel.status === 'UNLINKED'    ? 'text-slate-400' : 'text-blue-500'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <span className={`font-semibold ${
                                rel.status === 'CUSTOM'   ? 'text-amber-700' :
                                rel.status === 'UNLINKED' ? 'text-slate-500' : 'text-blue-700'
                              }`}>
                                {rel.templateCode ? `${rel.templateCode} ` : ''}{rel.templateName ?? '—'}
                              </span>
                              <span className={`ml-2 ${rel.status === 'CUSTOM' ? 'text-amber-500' : 'text-blue-400'}`}>
                                v{rel.usedVersion ?? 1}
                                {rel.status === 'NEW_VERSION' && liveTemplate && (
                                  <span className="text-blue-600 font-semibold"> → v{rel.currentVersion} พร้อมอัปเดต</span>
                                )}
                              </span>
                              {sc.appliedAt && (
                                <span className="text-slate-400 ml-2">
                                  · นำมาใช้ {new Date(sc.appliedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                                  {sc.appliedBy && sc.appliedBy !== 'System' ? ` โดย ${sc.appliedBy}` : ''}
                                </span>
                              )}
                            </div>
                            {rel.overrideCount > 0 && sc.overrideAt && (
                              <span className="text-[10px] text-amber-600">
                                ปรับ {rel.overrideCount} หัวข้อ {new Date(sc.overrideAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                              </span>
                            )}
                          </div>

                          {/* "มี Version ใหม่" action row */}
                          {rel.status === 'NEW_VERSION' && canEdit && liveTemplate && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 border-t border-blue-200">
                              <ArrowUpCircle size={12} className="text-blue-600 shrink-0" />
                              <span className="text-blue-700 font-medium flex-1">
                                รับ: {rel.templateCode} v{rel.currentVersion}
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowDiffId(prev => prev === c.conditionId ? null : c.conditionId)}
                                className="text-[10px] text-blue-600 hover:text-blue-800 underline font-medium"
                              >
                                ดูความแตกต่าง
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConfirmReset(sc)}
                                className="text-[10px] px-2 py-0.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
                              >
                                อัปเดตเป็น v{rel.currentVersion}
                              </button>
                            </div>
                          )}

                          {/* Inline diff view */}
                          {showDiffId === c.conditionId && liveTemplate && (
                            <div className="px-3 pb-3 pt-2 border-t border-blue-200 bg-white/50">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                                <GitCompare size={10} />
                                เปรียบเทียบ Series vs Template (v{rel.currentVersion})
                              </p>
                              <ConditionDiffView
                                sections={computeConditionDiff(sc.condition, liveTemplate.condition, currency)}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })()}

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

            {/* Section 2: Direct PNR conditions */}
            {directPnrConditions.length > 0 && (
              <div className="space-y-2 mt-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[9px] font-bold">{directPnrConditions.length}</span>
                  Condition เฉพาะ PNR (กำหนดโดยตรง)
                </p>
                {directPnrConditions.map(pnr => {
                  const tmpl = allTemplates.find(t => t.templateId === pnr.conditionTemplateId)
                  const pnrDisplay = pnr.pnrCode || pnr.dummyPnr || pnr.pnrDisplay || pnr.pnrId
                  return (
                    <div key={pnr.pnrId} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-blue-100 bg-blue-50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-700">{pnrDisplay}</span>
                          <span className="inline-flex px-1.5 py-px rounded text-[9px] font-medium bg-blue-100 text-blue-700 border border-blue-200">กำหนดโดยตรง</span>
                        </div>
                        {tmpl ? (
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {tmpl.condition.conditionCode} · {tmpl.condition.conditionName}
                            <span className="text-blue-400 ml-1">v{tmpl.version}</span>
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-400 mt-0.5">{pnr.conditionTemplateId}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Template picker */}
      <TemplatePickerModal
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onUse={handleUseTemplate}
        onCopy={handleCopyTemplate}
        stock={liveStock}
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
          seriesCode:    liveStock.stockCode,
          seriesName:    liveStock.groupName,
          airlineCode:   liveStock.airlineCode,
          currency:      liveStock.currency,
          departureDate: liveStock.summary.periodStart ?? '',
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

      {/* Change template confirm */}
      <Modal
        open={!!pendingChangeTemplate}
        onClose={() => setPendingChangeTemplate(null)}
        title="เปลี่ยน Template Condition"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingChangeTemplate(null)}>ยกเลิก</Button>
            <Button onClick={handleConfirmChangeTemplate}>ยืนยัน — เปลี่ยน Condition</Button>
          </>
        }
      >
        <div className="space-y-3">
          {/* Old condition */}
          {conditions.find(c => c.source === 'template') && (() => {
            const old = conditions.find(c => c.source === 'template')!
            return (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Condition เดิม</p>
                <p className="text-sm font-semibold text-slate-700">{old.condition.conditionName}</p>
                <p className="text-xs text-slate-500 font-mono">{old.condition.conditionCode} · v{old.sourceTemplateVersion ?? 1}</p>
              </div>
            )
          })()}
          <div className="flex items-center justify-center text-slate-300 text-lg">↓</div>
          {/* New condition */}
          {pendingChangeTemplate && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1.5">Condition ใหม่</p>
              <p className="text-sm font-semibold text-emerald-700">{pendingChangeTemplate.condition.conditionName}</p>
              <p className="text-xs text-emerald-600 font-mono">{pendingChangeTemplate.condition.conditionCode} · v{pendingChangeTemplate.version}</p>
            </div>
          )}
          {/* Affected PNR count */}
          {liveStock && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <AlertTriangle size={13} className="shrink-0" />
              {liveStock.pnrs.filter(p => !p.conditionTemplateId).length} PNR ใน Series นี้จะได้รับ Condition ใหม่
            </div>
          )}
        </div>
      </Modal>

      {/* Remove condition confirm */}
      <Modal
        open={!!showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(null)}
        title="ยกเลิกการใช้ Condition"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowRemoveConfirm(null)}>กลับ</Button>
            <Button variant="danger" onClick={() => showRemoveConfirm && handleRemoveCondition(showRemoveConfirm)}>
              ยืนยัน — ยกเลิกการใช้
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className="shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800 mb-1">Condition ที่จะถูกยกเลิก</p>
                <p className="text-sm font-semibold text-slate-700">{showRemoveConfirm?.condition.conditionName}</p>
                <p className="text-xs text-slate-500 font-mono">{showRemoveConfirm?.condition.conditionCode}</p>
              </div>
            </div>
          </div>
          {liveStock && (
            <p className="text-xs text-slate-600">
              {liveStock.pnrs.filter(p => !p.conditionTemplateId).length} PNR ใน Series นี้ที่รับ Condition จาก Series จะหยุดใช้ Condition นี้
            </p>
          )}
        </div>
      </Modal>

      {/* Reset from template confirm */}
      <Modal
        open={!!showResetConfirm}
        onClose={() => setShowResetConfirm(null)}
        title="รีเซ็ต Condition จาก Template"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowResetConfirm(null)}>ยกเลิก</Button>
            <Button variant="danger" onClick={() => handleConfirmReset()}>ยืนยัน — รีเซ็ต</Button>
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
