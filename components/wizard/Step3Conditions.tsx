'use client'

/**
 * Step3Conditions — Wizard Step 3: Conditions
 * Manages a list of AppCondition objects.
 * Uses the unified ConditionBuilder for creating / editing each condition.
 */

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import {
  Plus, FileText, Copy, Trash2, ChevronDown, ChevronRight,
  Search, Check,
} from 'lucide-react'
import {
  type AppCondition,
  type AppConditionTemplate,
  defaultCondition,
  newConditionId,
  generateConditionCode,
  generateTemplateCode,
  newTemplateId,
  formatTtlRule,
  formatStageAmount,
  COND_REFUND_TYPE_LABELS,
  COND_REFUND_TYPE_COLORS,
  COND_TEMPLATE_TYPE_SHORT,
  COND_TEMPLATE_TYPE_COLORS,
} from '@/lib/condition-schema'
import { getConditionTemplates, saveConditionTemplate, snapshotTemplateToCondition, seedTemplatesIfEmpty } from '@/lib/condition-storage'
import ConditionEditorModal from '@/components/condition-builder/ConditionEditorModal'
import type { SeriesInfo } from '@/components/condition-builder/ConditionBuilder'
import { cn } from '@/lib/utils'

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface Step3ConditionsProps {
  conditions: AppCondition[]
  onChange: (conditions: AppCondition[]) => void
  currency: string
  conditionMode?: import('@/components/condition-builder/ConditionBuilder').ConditionMode
  seriesInfo?: SeriesInfo
  /** Example travel start for TTL/due-date previews */
  previewTravelStart?: string
}

// ─── Template Picker ──────────────────────────────────────────────────────────

function TemplatePicker({
  open, onClose, onPick, seriesAirline,
}: {
  open: boolean
  onClose: () => void
  onPick: (t: AppConditionTemplate) => void
  seriesAirline?: string
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [templates, setTemplates] = useState<AppConditionTemplate[]>([])

  const load = useCallback(() => {
    seedTemplatesIfEmpty()
    setTemplates(getConditionTemplates())
    setSearch('')
    setSelected(null)
  }, [])

  const filtered = templates.filter(t => {
    // If in series mode, filter to matching airline (or universal templates)
    if (seriesAirline && t.airlineCode && t.airlineCode !== seriesAirline) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      t.condition.conditionCode.toLowerCase().includes(q) ||
      t.condition.conditionName.toLowerCase().includes(q) ||
      (t.condition.description ?? '').toLowerCase().includes(q)
    )
  })

  const selectedTemplate = templates.find(t => t.templateId === selected) ?? null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เลือก Template Condition"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button disabled={!selectedTemplate} onClick={() => selectedTemplate && onPick(selectedTemplate)}>
            ใช้ Template นี้
          </Button>
        </>
      }
    >
      {seriesAirline && (
        <p className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 mb-3">
          แสดงเฉพาะ Template ที่ใช้กับ <strong>{seriesAirline}</strong> หรือ Template ที่ใช้ได้กับทุก Airline
        </p>
      )}
      {/* Search */}
      <div className="relative mb-3">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหา Template..."
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
        />
      </div>
      {/* List */}
      <div className="max-h-64 overflow-y-auto space-y-1.5">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8">
            {templates.length === 0 ? 'ยังไม่มี Template — ไปสร้างได้ที่ Settings → Condition Templates'
              : seriesAirline ? `ไม่พบ Template สำหรับ Airline ${seriesAirline}`
              : 'ไม่พบ Template ที่ตรงกัน'}
          </p>
        ) : filtered.map(t => (
          <button
            key={t.templateId}
            type="button"
            onClick={() => setSelected(prev => prev === t.templateId ? null : t.templateId)}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-xl border transition-all',
              selected === t.templateId
                ? 'border-[#05a94f] bg-emerald-50'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    'inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold',
                    COND_TEMPLATE_TYPE_COLORS[t.templateType],
                  )}>
                    {COND_TEMPLATE_TYPE_SHORT[t.templateType]}
                  </span>
                  {t.airlineCode && (
                    <span className="font-mono text-[9px] font-bold px-1.5 py-px rounded bg-slate-100 text-slate-600">{t.airlineCode}</span>
                  )}
                  <span className="font-mono text-[10px] text-slate-400">{t.condition.conditionCode}</span>
                  <span className="text-sm font-semibold text-slate-800">{t.condition.conditionName}</span>
                  <span className="text-[10px] text-slate-400">{t.condition.stages.length} งวด</span>
                </div>
                {t.condition.description && (
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{t.condition.description}</p>
                )}
              </div>
              {selected === t.templateId && <Check size={14} className="shrink-0 text-[#05a94f]" />}
            </div>
          </button>
        ))}
      </div>
    </Modal>
  )
}

// ─── Condition Card (collapsed view) ─────────────────────────────────────────

function ConditionCard({
  condition, currency, isExpanded, onToggle, onEdit, onDuplicate, onDelete,
}: {
  condition: AppCondition
  currency: string
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const refund = condition.refundPolicy
  return (
    <Card>
      {/* Header */}
      <div
        role="button" tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onToggle()}
        className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isExpanded ? <ChevronDown size={13} className="text-slate-400 shrink-0" /> : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
          <span className="font-mono text-[10px] text-slate-400">{condition.conditionCode || '—'}</span>
          <span className="font-semibold text-sm text-slate-800 truncate">{condition.conditionName || 'ไม่มีชื่อ'}</span>
          <Badge variant={condition.status === 'Active' ? 'green' : 'gray'}>{condition.status}</Badge>
          <span className="text-[10px] text-slate-400 shrink-0">{condition.stages.length} งวด</span>
          {refund.enabled && refund.refundType && (
            <span className={cn('text-[10px] px-1.5 py-px rounded-full font-semibold shrink-0', COND_REFUND_TYPE_COLORS[refund.refundType])}>
              {COND_REFUND_TYPE_LABELS[refund.refundType]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <button type="button" title="คัดลอก" onClick={onDuplicate}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
            <Copy size={12} />
          </button>
          <button type="button" title="แก้ไข" onClick={onEdit}
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#05a94f] hover:bg-emerald-50 transition text-xs font-medium">
            แก้ไข
          </button>
          <button type="button" title="ลบ" onClick={onDelete}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Expanded summary */}
      {isExpanded && (
        <div className="border-t border-slate-100 px-4 pb-3 pt-2 space-y-2 text-xs text-slate-600">
          {condition.stages.length === 0 ? (
            <p className="text-slate-400 italic">ยังไม่มีรอบชำระ</p>
          ) : (
            condition.stages.map(s => (
              <div key={s.stageId} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                  {s.stageNo}
                </span>
                <span className="font-medium text-slate-700">{s.stageName}</span>
                <span className="text-slate-500">{formatStageAmount(s, currency)}</span>
                <span className="text-slate-400">
                  {s.dueType === 'TRAVEL_MINUS_DAYS' ? `ก่อนเดินทาง ${s.dueDays} วัน ${s.dueTime}` :
                   s.dueType === 'TBD' ? 'TBD' :
                   s.dueDate || `${s.dueDays} วัน ${s.dueTime}`}
                </span>
              </div>
            ))
          )}
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
            TTL: {formatTtlRule(condition.ttlRule)}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Step3Conditions({
  conditions,
  onChange,
  currency,
  conditionMode = 'series',
  seriesInfo,
  previewTravelStart = '2026-06-18',
}: Step3ConditionsProps) {
  const [expandedIds, setExpandedIds]       = useState<Set<string>>(new Set())
  const [editingId, setEditingId]           = useState<string | null>(null)
  const [showPicker, setShowPicker]         = useState(false)
  const [editDraft, setEditDraft]           = useState<AppCondition | null>(null)

  const toggleExpand = (id: string) =>
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const existingCodes = conditions.map(c => c.conditionCode)

  // ── Add new blank condition ──
  const handleAddNew = () => {
    const isSeries = conditionMode === 'series'
    const blank = defaultCondition({
      conditionCode: generateConditionCode(existingCodes),
      currency: isSeries && seriesInfo ? seriesInfo.currency : currency,
      ...(isSeries && seriesInfo ? {
        airline: seriesInfo.airlineCode,
        conditionType: 'Custom' as const,
        applyScope: seriesInfo.routes.length > 0 ? ('ROUTE' as const) : ('ALL' as const),
        applyRoutes: seriesInfo.routes,
      } : {}),
    })
    setEditDraft(blank)
    setEditingId('__new__')
  }

  // ── Apply from template ──
  const handlePickTemplate = (t: AppConditionTemplate) => {
    const sc = snapshotTemplateToCondition(t)
    let code = sc.condition.conditionCode
    if (existingCodes.includes(code)) code = generateConditionCode(existingCodes)
    // In series mode, override airline/currency/scope from series
    const seriesOverrides = conditionMode === 'series' && seriesInfo ? {
      airline:    seriesInfo.airlineCode,
      currency:   seriesInfo.currency,
      applyScope: seriesInfo.routes.length > 0 ? ('ROUTE' as const) : ('ALL' as const),
      applyRoutes: seriesInfo.routes,
      applyCountries: [],
    } : {}
    const newCond: AppCondition = { ...sc.condition, conditionCode: code, ...seriesOverrides }
    onChange([...conditions, newCond])
    setShowPicker(false)
    setExpandedIds(prev => new Set([...prev, newCond.conditionId]))
  }

  // ── Save condition as template (when checkbox checked in series mode) ──
  const handleSaveAsTemplate = useCallback((cond: AppCondition) => {
    if (!seriesInfo) return
    const existingTmplCodes = getConditionTemplates().map(t => t.condition.conditionCode)
    const now = new Date().toISOString()
    const tmpl: AppConditionTemplate = {
      templateId:   newTemplateId(),
      version:      1,
      createdAt:    now,
      updatedAt:    now,
      templateType: 'PAYMENT',
      airlineCode:  seriesInfo.airlineCode,
      airlines:     [seriesInfo.airlineCode],
      ticketType:   'All',
      currency:     seriesInfo.currency,
      condition: {
        ...cond,
        conditionId:   `CON-${Date.now()}-tmpl`,
        conditionCode: generateTemplateCode(existingTmplCodes),
        conditionType: 'Template',
        applyScope:    seriesInfo.routes.length > 0 ? 'ROUTE' : 'ALL',
        applyRoutes:   seriesInfo.routes,
        applyCountries: [],
      },
    }
    saveConditionTemplate(tmpl)
  }, [seriesInfo])

  // ── Edit existing ──
  const handleEdit = (c: AppCondition) => {
    setEditDraft({ ...c })
    setEditingId(c.conditionId)
  }

  // ── Save from editor modal ──
  const handleSaveEditWith = (cond: AppCondition) => {
    if (editingId === '__new__') {
      onChange([...conditions, cond])
      setExpandedIds(prev => new Set([...prev, cond.conditionId]))
    } else {
      onChange(conditions.map(c => c.conditionId === editingId ? cond : c))
    }
    setEditDraft(null)
    setEditingId(null)
  }

  // ── Duplicate ──
  const handleDuplicate = (c: AppCondition) => {
    const dup: AppCondition = {
      ...c,
      conditionId:   newConditionId(),
      conditionCode: generateConditionCode(existingCodes),
      conditionName: c.conditionName + ' (Copy)',
      stages:        c.stages.map(s => ({ ...s, stageId: `STG-${Date.now()}-dup` })),
    }
    onChange([...conditions, dup])
    setExpandedIds(prev => new Set([...prev, dup.conditionId]))
  }

  // ── Delete ──
  const handleDelete = (id: string) => {
    if (!window.confirm('ลบ Condition นี้หรือไม่?')) return
    onChange(conditions.filter(c => c.conditionId !== id))
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" icon={<FileText size={13} />}
          onClick={() => setShowPicker(true)}>
          ใช้ Template Condition
        </Button>
        <Button size="sm" variant="outline" icon={<Plus size={13} />}
          onClick={handleAddNew}>
          สร้าง Condition ใหม่
        </Button>
      </div>

      {/* Condition list */}
      {conditions.length === 0 ? (
        <Card>
          <CardContent>
            <div className="flex flex-col items-center py-10 gap-3 text-center">
              <FileText size={32} className="text-slate-200" />
              <p className="text-sm font-medium text-slate-400">ยังไม่มี Condition</p>
              <p className="text-xs text-slate-400">
                กด "ใช้ Template Condition" หรือ "สร้าง Condition ใหม่" เพื่อเพิ่ม
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {conditions.map(c => (
            <ConditionCard
              key={c.conditionId}
              condition={c}
              currency={currency}
              isExpanded={expandedIds.has(c.conditionId)}
              onToggle={() => toggleExpand(c.conditionId)}
              onEdit={() => handleEdit(c)}
              onDuplicate={() => handleDuplicate(c)}
              onDelete={() => handleDelete(c.conditionId)}
            />
          ))}
        </div>
      )}

      {/* Template Picker Modal */}
      <TemplatePicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onPick={handlePickTemplate}
        seriesAirline={conditionMode === 'series' ? seriesInfo?.airlineCode : undefined}
      />

      {/* Condition Editor Modal */}
      <ConditionEditorModal
        open={!!editingId && !!editDraft}
        mode="modal"
        title={editingId === '__new__' ? 'สร้าง Condition ใหม่' : 'แก้ไข Condition'}
        value={editDraft}
        onChange={setEditDraft}
        currency={seriesInfo?.currency ?? currency}
        conditionMode={conditionMode}
        seriesInfo={seriesInfo}
        showBasicInfo
        onCancel={() => { setEditingId(null); setEditDraft(null) }}
        onSave={cond => { setEditDraft(cond); handleSaveEditWith(cond) }}
        onSaveAsTemplate={conditionMode === 'series' ? handleSaveAsTemplate : undefined}
      />
    </div>
  )
}
