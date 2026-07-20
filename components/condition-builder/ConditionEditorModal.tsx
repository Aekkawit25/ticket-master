'use client'

/**
 * ConditionEditorModal — Large modal / page wrapper for the 7-tab Condition editor.
 *
 * mode='modal' → fixed full-screen overlay (used in wizard + ConditionsTab)
 * mode='page'  → fills parent container (used in template add/edit pages)
 *
 * Each tab shows:
 *  • Status indicator (empty / incomplete / complete / error)
 *  • Summary text in the tab bar tooltip and in the section header
 *  • ล้างข้อมูล button in the section header
 *  • Inline error messages
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  X, ChevronLeft, ChevronRight, Save, FileText,
  AlertCircle, CheckCircle2, RotateCcw, Info, Sparkles,
} from 'lucide-react'
import ConditionBuilder, {
  TABS, TabKey, TabStatus,
  getTabStatus, getTabSummary, validateCondition, validateTab, clearTab,
  type ConditionMode, type SeriesInfo, type TemplateInfo,
} from './ConditionBuilder'
import { defaultCancelGroupTerms, type AppCondition, type CondCancelGroupTerms } from '@/lib/condition-schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConditionEditorModalProps {
  open?: boolean
  mode?: 'modal' | 'page'
  title?: string
  value: AppCondition | null
  onChange?: (v: AppCondition) => void
  currency?: string
  conditionMode?: ConditionMode
  seriesInfo?: SeriesInfo
  /** Metadata from the template header — airline/currency locked outside the builder */
  templateInfo?: TemplateInfo
  readOnly?: boolean
  showBasicInfo?: boolean
  onCancel: () => void
  onSaveDraft?: (v: AppCondition) => void
  onSave: (v: AppCondition) => void
  onSaveAsTemplate?: (v: AppCondition) => void
  /** Called when user presses "ถัดไป" from basic tab while airline is not yet selected */
  onRequestAirlineValidation?: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...cls: (string | false | null | undefined)[]) { return cls.filter(Boolean).join(' ') }

// ─── Summary Bar (top of modal) ───────────────────────────────────────────────

function SummaryBar({ value, currency, conditionMode, seriesInfo, templateInfo }: {
  value: AppCondition; currency: string
  conditionMode?: ConditionMode; seriesInfo?: SeriesInfo; templateInfo?: TemplateInfo
}) {
  const inTemplateMode = conditionMode === 'template' && !!templateInfo
  const inSeriesMode   = conditionMode === 'series'   && !!seriesInfo

  if (inTemplateMode || inSeriesMode) {
    const summary = getTabSummary('basic', value, currency, conditionMode ?? 'template', seriesInfo, templateInfo)
    const hasAirlineWarning = inTemplateMode && !templateInfo!.airlineCode
    return (
      <div className="flex items-center gap-2 px-5 py-2 bg-slate-50 border-b border-slate-200 flex-wrap shrink-0">
        <span className={cn('text-xs', hasAirlineWarning ? 'text-amber-600' : 'text-slate-500')}>
          {summary}
        </span>
      </div>
    )
  }

  const hasCode = value.conditionCode.trim()
  const hasName = value.conditionName.trim()
  return (
    <div className="flex items-center gap-2 px-5 py-2 bg-slate-50 border-b border-slate-200 flex-wrap shrink-0">
      <span className={cn('font-mono text-xs font-bold', hasCode ? 'text-slate-700' : 'text-slate-300')}>
        {hasCode || 'XXXX'}
      </span>
      <span className="text-slate-300 text-xs select-none">·</span>
      <span className={cn('text-xs font-medium truncate max-w-[240px]', hasName ? 'text-slate-700' : 'text-slate-400 italic')}>
        {hasName || 'ยังไม่มีชื่อ'}
      </span>
      <span className="text-slate-300 text-xs select-none">·</span>
      <span className={cn(
        'text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0',
        value.status === 'Active' ? 'bg-emerald-100 text-emerald-700'
        : value.status === 'Draft'  ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-500',
      )}>
        {value.status}
      </span>
      <span className="text-slate-300 text-xs select-none">·</span>
      <span className="text-xs text-slate-500 font-medium shrink-0">{currency}</span>
    </div>
  )
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TabStatus, { dot: string | null; label: string; badge: string }> = {
  empty:      { dot: null,            label: 'ยังไม่ตั้งค่า',   badge: '' },
  incomplete: { dot: 'bg-amber-400',  label: 'ยังไม่ครบ',      badge: 'bg-amber-100 text-amber-600' },
  complete:   { dot: 'bg-emerald-400',label: 'ตั้งค่าแล้ว',    badge: 'bg-emerald-100 text-emerald-700' },
  error:      { dot: 'bg-red-500',    label: 'มีข้อผิดพลาด',   badge: 'bg-red-100 text-red-600' },
}

function EditorTabBar({
  activeTab, value, currency, visibleTabs, errors, onSelect, conditionMode, seriesInfo, templateInfo,
}: {
  activeTab: TabKey
  value: AppCondition
  currency: string
  visibleTabs: typeof TABS
  errors: Partial<Record<TabKey, string[]>>
  onSelect: (k: TabKey) => void
  conditionMode: ConditionMode
  seriesInfo?: SeriesInfo
  templateInfo?: TemplateInfo
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
      {visibleTabs.map(tab => {
        const isActive    = activeTab === tab.key
        const status      = getTabStatus(tab.key, value, errors[tab.key] ?? [], conditionMode, seriesInfo, templateInfo)
        const cfg         = STATUS_CONFIG[status]
        const summary     = getTabSummary(tab.key, value, currency, conditionMode, seriesInfo, templateInfo)
        const liveErrs    = validateTab(tab.key, value, conditionMode, templateInfo)
        const errCount    = liveErrs.length
        const statusLabel = status === 'incomplete' && errCount > 0
          ? errCount === 1 ? `ยังไม่ครบ · ${liveErrs[0]}` : `ยังไม่ครบ (${errCount} รายการ)`
          : cfg.label

        const cardCls = cn(
          'w-full min-h-[80px] rounded-xl border-2 px-4 py-3 flex flex-col justify-center gap-1.5 text-left transition-colors cursor-pointer',
          status === 'error'
            ? (isActive ? 'bg-red-50 border-red-500 shadow-sm' : 'bg-red-50 border-red-300 hover:border-red-400')
            : status === 'incomplete'
              ? (isActive ? 'bg-amber-50 border-amber-400 shadow-sm' : 'bg-amber-50 border-amber-300 hover:border-amber-400')
              : status === 'complete'
                ? (isActive ? 'bg-emerald-50 border-[#05a94f] shadow-sm' : 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-300')
                : (isActive ? 'bg-white border-[#05a94f] shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'),
        )

        const stepCls = cn(
          'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
          isActive
            ? 'bg-[#05a94f] text-white'
            : status === 'error'
              ? 'bg-red-400 text-white'
              : status === 'incomplete'
                ? 'bg-amber-400 text-white'
                : status === 'complete'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-200 text-slate-500',
        )

        const labelCls = cn(
          'text-xs font-semibold leading-snug line-clamp-2',
          status === 'error'      ? 'text-red-700'    :
          status === 'incomplete' ? 'text-amber-700'  :
          isActive                ? 'text-[#05a94f]'  :
          status === 'complete'   ? 'text-emerald-700' :
          'text-slate-700',
        )

        const statusCls = cn(
          'text-[10px] font-medium leading-none',
          status === 'empty'      ? 'text-slate-400'   :
          status === 'incomplete' ? 'text-amber-600'   :
          status === 'complete'   ? 'text-emerald-600' :
          'text-red-600',
        )

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            title={errCount > 0 ? `ข้อมูลที่ยังขาด:\n${liveErrs.map(e => `• ${e}`).join('\n')}` : `${cfg.label}: ${summary}`}
            className={cardCls}
          >
            {/* Row 1: step circle + label */}
            <div className="flex items-start gap-2">
              <span className={stepCls}>{tab.no}</span>
              <span className={labelCls}>{tab.label}</span>
            </div>
            {/* Row 2: status text */}
            <div className="flex items-center gap-1.5 pl-7">
              {cfg.dot && (
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
              )}
              <span className={statusCls}>{statusLabel}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Tab Content Header (inside scroll area) ─────────────────────────────────

function TabContentHeader({
  tabKey, value, currency, errors, readOnly, onClear, onFillExample, conditionMode, seriesInfo, templateInfo,
}: {
  tabKey: TabKey
  value: AppCondition
  currency: string
  errors: string[]
  readOnly: boolean
  onClear: () => void
  onFillExample?: () => void
  conditionMode: ConditionMode
  seriesInfo?: SeriesInfo
  templateInfo?: TemplateInfo
}) {
  const tab     = TABS.find(t => t.key === tabKey)!
  const status  = getTabStatus(tabKey, value, errors, conditionMode, seriesInfo, templateInfo)
  const summary = getTabSummary(tabKey, value, currency, conditionMode, seriesInfo, templateInfo)
  const cfg     = STATUS_CONFIG[status]

  const statusBadge = (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold',
      status === 'empty'      ? 'bg-slate-100 text-slate-500' :
      status === 'incomplete' ? 'bg-amber-100 text-amber-700' :
      status === 'complete'   ? 'bg-emerald-100 text-emerald-700' :
      'bg-red-100 text-red-700',
    )}>
      {cfg.dot && <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />}
      {cfg.label}
    </span>
  )

  return (
    <div className="mb-5 pb-4 border-b border-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-800">{tab.label}</h3>
            {statusBadge}
          </div>
          {/* Summary text */}
          <div className="flex items-start gap-1.5 mt-1.5">
            <Info size={11} className="text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500">{summary}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Fill example button — cancel tab only */}
          {onFillExample && tabKey === 'cancel' && !readOnly && (
            <button
              type="button"
              onClick={onFillExample}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border border-emerald-200 hover:border-emerald-300 transition"
            >
              <Sparkles size={10} />
              สร้างตัวอย่าง
            </button>
          )}
          {/* Clear button */}
          {!readOnly && status !== 'empty' && (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition"
            >
              <RotateCcw size={10} />
              ล้างข้อมูล Tab นี้
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Footer Button ────────────────────────────────────────────────────────────

function FooterBtn({ onClick, disabled, variant = 'default', children }: {
  onClick: () => void; disabled?: boolean
  variant?: 'default' | 'ghost' | 'primary' | 'draft'
  children: React.ReactNode
}) {
  const styles: Record<string, string> = {
    default: 'border border-slate-300 text-slate-700 hover:bg-slate-50',
    ghost:   'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
    primary: 'bg-[#05a94f] text-white hover:bg-[#04943e] shadow-sm',
    draft:   'border border-slate-300 text-slate-600 hover:bg-slate-50',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-4 py-2 rounded-xl text-xs font-medium transition flex items-center gap-1.5',
        styles[variant],
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
      )}
    >
      {children}
    </button>
  )
}

// ─── Cancel Tab Example Data ─────────────────────────────────────────────────

const CANCEL_EXAMPLE: CondCancelGroupTerms = {
  enabled: true,
  policy: 'UNSPECIFIED',
  noticeDays: 45,
  deadlineBase: 'DEPARTURE_DATE',
  deadlineCustomDate: '',
  overLimitAction: 'UNSPECIFIED',
  forfeitSource: null,
  penaltyType: 'NONE',
  penaltyAmount: null,
  penaltyPercent: null,
  penaltyCurrency: '',
  penaltyCalcBase: 'GROUP_PRICE',
  refundable: 'UNSPECIFIED',
  remark: 'การยกเลิกกรุ๊ป (No Sell) ต้องแจ้งไม่น้อยกว่า 45 วัน\nก่อนวันเดินทางวันแรก โดยเอกสารไม่ได้ระบุผลกรณีแจ้งเกินกำหนด\nหรือเงื่อนไขการคืนเงิน',
  cancelType: 'STEP',
  stepCancels: [
    {
      stepId: 'cs_example_1',
      daysFrom: 45,
      daysTo: null,
      result: 'UNSPECIFIED' as const,
      remark: 'ตั้งแต่ 45 วันขึ้นไปก่อนเดินทาง — ยกเลิกได้ตามเงื่อนไข',
    },
    {
      stepId: 'cs_example_2',
      daysFrom: 0,
      daysTo: 44,
      result: 'NOT_ALLOWED' as const,
      remark: '0–44 วันก่อนเดินทาง — ไม่ผ่านเงื่อนไขการยกเลิก',
    },
  ],
}

// ─── Confirm Clear Dialog ─────────────────────────────────────────────────────

function ConfirmClearDialog({ tabLabel, onConfirm, onCancel }: {
  tabLabel: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <RotateCcw size={16} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">ล้างข้อมูล Tab "{tabLabel}"?</h3>
            <p className="text-xs text-slate-500 mt-1">
              ข้อมูลทั้งหมดใน Tab นี้จะถูกล้างและกลับสู่ค่าเริ่มต้น การดำเนินการนี้ยังไม่ได้บันทึก — กดยกเลิกเพื่อออกโดยไม่ล้าง
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 transition">
            ยกเลิก
          </button>
          <button type="button" onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition">
            ล้างข้อมูล
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Confirm Fill Example Dialog ─────────────────────────────────────────────

function ConfirmFillExampleDialog({ onConfirm, onCancel }: {
  onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <Sparkles size={16} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">แทนที่ข้อมูลปัจจุบันด้วยตัวอย่าง?</h3>
            <p className="text-xs text-slate-500 mt-1">
              ข้อมูลใน Tab เงื่อนไขการยกเลิกกรุ๊ป (No Sell) จะถูกแทนที่ด้วยข้อมูลตัวอย่าง แต่จะยังไม่ถูกบันทึก
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 transition">
            ยกเลิก
          </button>
          <button type="button" onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition flex items-center gap-1.5">
            <Sparkles size={11} />
            สร้างตัวอย่าง
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConditionEditorModal({
  open = true,
  mode = 'modal',
  title,
  value,
  onChange,
  currency = 'THB',
  conditionMode = 'template',
  seriesInfo,
  templateInfo,
  readOnly = false,
  showBasicInfo = true,
  onCancel,
  onSaveDraft,
  onSave,
  onSaveAsTemplate,
  onRequestAirlineValidation,
}: ConditionEditorModalProps) {
  const visibleTabs = showBasicInfo ? TABS : TABS.filter(t => t.key !== 'basic')

  const [draft,                    setDraft]                   = useState<AppCondition | null>(value)
  const [activeTab,                setActiveTab]               = useState<TabKey>(showBasicInfo ? 'basic' : 'payment')
  const [errors,                   setErrors]                  = useState<Partial<Record<TabKey, string[]>>>({})
  const [clearTarget,              setClearTarget]             = useState<TabKey | null>(null)
  const [saveAsTemplate,           setSaveAsTemplate]          = useState(false)
  const [showFillExampleConfirm,   setShowFillExampleConfirm] = useState(false)
  const [fillExampleToastVisible,  setFillExampleToastVisible] = useState(false)

  const contentRef   = useRef<HTMLDivElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset scroll position inside content area on every tab switch
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [activeTab])

  // Sync draft whenever the external value changes (fires during user edits too —
  // must NOT touch activeTab here, otherwise editing any field resets the tab).
  // In series mode, always overlay airline/currency from the series.
  // In template mode with templateInfo, overlay airline/currency from the template header.
  useEffect(() => {
    if (conditionMode === 'series' && seriesInfo && value) {
      setDraft({ ...value, airline: seriesInfo.airlineCode, currency: seriesInfo.currency })
    } else if (templateInfo && value) {
      // Always inherit airline/currency from template (even when airlineCode is null = "ทุกสายการบิน")
      setDraft({ ...value, airline: templateInfo.airlineCode ?? value.airline, currency: templateInfo.currency || value.currency })
    } else {
      setDraft(value)
    }
  }, [value, conditionMode, seriesInfo, templateInfo])

  // Reset UI state (tab, errors, saveAsTemplate) ONLY when the modal transitions
  // from closed → open. Tracking with a ref avoids resetting on user edits.
  // In series mode, also push the merged airline/currency to the parent on first open
  // so that any immediate save already carries the correct airline.
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setErrors({})
      setSaveAsTemplate(false)
      setActiveTab(showBasicInfo ? 'basic' : 'payment')
      if (conditionMode === 'series' && seriesInfo && value) {
        const merged: AppCondition = { ...value, airline: seriesInfo.airlineCode, currency: seriesInfo.currency }
        setDraft(merged)
        onChange?.(merged)
      } else if (templateInfo && value) {
        const merged: AppCondition = { ...value, airline: templateInfo.airlineCode ?? value.airline, currency: templateInfo.currency || value.currency }
        setDraft(merged)
        onChange?.(merged)
      }
    }
    prevOpenRef.current = !!open
  }, [open, showBasicInfo, conditionMode, seriesInfo, templateInfo])

  // Lock body scroll when modal is open so background page doesn't scroll behind overlay
  useEffect(() => {
    if (!open || mode !== 'modal') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open, mode])

  const handleChange = useCallback((v: AppCondition) => {
    setDraft(v)
    onChange?.(v)
    setErrors(prev => {
      if (!prev[activeTab]) return prev
      const next = { ...prev }
      delete next[activeTab]
      return next
    })
  }, [onChange, activeTab])

  const handleClearTab = (key: TabKey) => {
    if (!draft) return
    const cleared = clearTab(key, draft, conditionMode)
    setDraft(cleared)
    onChange?.(cleared)
    // Remove errors for this tab
    setErrors(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setClearTarget(null)
  }

  const executeFillExample = useCallback(() => {
    if (!draft) return
    const next: AppCondition = { ...draft, cancelGroupTerms: { ...CANCEL_EXAMPLE } }
    setDraft(next)
    onChange?.(next)
    setErrors(prev => { const n = { ...prev }; delete n.cancel; return n })
    setShowFillExampleConfirm(false)
    setFillExampleToastVisible(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setFillExampleToastVisible(false), 3500)
  }, [draft, onChange])

  const handleFillExampleRequest = useCallback(() => {
    if (!draft) return
    const cgStatus = getTabStatus('cancel', draft, [], conditionMode, seriesInfo, templateInfo)
    if (cgStatus !== 'empty') {
      setShowFillExampleConfirm(true)
    } else {
      executeFillExample()
    }
  }, [draft, conditionMode, seriesInfo, templateInfo, executeFillExample])

  const currentIdx = visibleTabs.findIndex(t => t.key === activeTab)
  const canGoPrev  = currentIdx > 0
  const canGoNext  = currentIdx < visibleTabs.length - 1

  const handleNext = () => {
    if (!canGoNext) return
    // Before leaving the basic tab: if airline is required but missing, alert the parent
    if (activeTab === 'basic' && conditionMode === 'template' && templateInfo && !templateInfo.airlineCode) {
      onRequestAirlineValidation?.()
      return
    }
    setActiveTab(visibleTabs[currentIdx + 1].key)
  }

  const handleSave = () => {
    if (!draft) return
    const toSave: AppCondition = conditionMode === 'series' && seriesInfo
      ? { ...draft, airline: seriesInfo.airlineCode, currency: seriesInfo.currency, status: 'Active' }
      : templateInfo
        ? { ...draft, airline: templateInfo.airlineCode ?? draft.airline, currency: templateInfo.currency || draft.currency, status: 'Active' }
        : { ...draft, status: 'Active' }
    const errs = validateCondition(toSave, conditionMode, templateInfo)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      const firstErrTab = visibleTabs.find(t => errs[t.key])?.key
      if (firstErrTab) setActiveTab(firstErrTab)
      return
    }
    setErrors({})
    onSave(toSave)
    if (saveAsTemplate && onSaveAsTemplate) onSaveAsTemplate(toSave)
  }

  if (!open || !draft) return null

  const hasErrors = Object.keys(errors).length > 0
  const activeTabDef = TABS.find(t => t.key === activeTab)!

  // ── Shared inner content ─────────────────────────────────────────────────

  const inner = (
    <div className={cn('flex flex-col', mode === 'modal' ? 'h-full min-h-0' : 'min-h-[calc(100vh-280px)]')}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={15} className="text-[#05a94f] shrink-0" />
          <h2 className="text-sm font-semibold text-slate-800 truncate">
            {title ?? (draft.conditionName || 'Condition Editor')}
          </h2>
        </div>
        <button type="button" onClick={onCancel}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0">
          <X size={15} />
        </button>
      </div>

      {/* ── Summary Bar ── */}
      <SummaryBar value={draft} currency={currency} conditionMode={conditionMode} seriesInfo={seriesInfo} templateInfo={templateInfo} />

      {/* ── Global error notice ── */}
      {hasErrors && (
        <div className="flex items-center gap-2 px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 shrink-0">
          <AlertCircle size={12} className="shrink-0" />
          <span>
            มีข้อมูลที่ยังไม่ครบถ้วน —{' '}
            {Object.keys(errors).map(k => {
              const tab = TABS.find(t => t.key === k)
              return tab ? (
                <button key={k} type="button" onClick={() => setActiveTab(k as TabKey)}
                  className="underline font-medium hover:text-red-900 mr-1">
                  {tab.label}
                </button>
              ) : null
            })}
          </span>
        </div>
      )}

      {/* ── Tab Bar ── */}
      <EditorTabBar
        activeTab={activeTab}
        value={draft}
        currency={currency}
        visibleTabs={visibleTabs}
        errors={errors}
        onSelect={setActiveTab}
        conditionMode={conditionMode}
        seriesInfo={seriesInfo}
        templateInfo={templateInfo}
      />

      {/* ── Scrollable Content ── */}
      <div
        ref={contentRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 transparent' } as React.CSSProperties}
      >
        <div className={cn(mode === 'modal' ? 'max-w-5xl mx-auto' : '', 'px-6 py-5')}>
          {/* Tab Content Header */}
          <TabContentHeader
            tabKey={activeTab}
            value={draft}
            currency={currency}
            errors={errors[activeTab] ?? []}
            readOnly={readOnly}
            onClear={() => setClearTarget(activeTab)}
            onFillExample={!readOnly ? handleFillExampleRequest : undefined}
            conditionMode={conditionMode}
            seriesInfo={seriesInfo}
            templateInfo={templateInfo}
          />
          {/* Section content */}
          <ConditionBuilder
            value={draft}
            onChange={handleChange}
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            currency={currency}
            readOnly={readOnly}
            showBasicInfo={showBasicInfo}
            errors={errors}
            conditionMode={conditionMode}
            seriesInfo={seriesInfo}
            templateInfo={templateInfo}
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-200 bg-white shrink-0 flex-wrap">
        {/* Left */}
        <FooterBtn onClick={onCancel} variant="ghost">ยกเลิก</FooterBtn>
        {onSaveDraft && !readOnly && (
          <FooterBtn onClick={() => draft && onSaveDraft({ ...draft, status: 'Draft' })} variant="draft">
            <Save size={11} />
            บันทึกฉบับร่าง
          </FooterBtn>
        )}
        {/* Save-as-template checkbox — series mode only */}
        {conditionMode === 'series' && !readOnly && onSaveAsTemplate && (
          <label className="flex items-center gap-1.5 cursor-pointer ml-1 select-none">
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={e => setSaveAsTemplate(e.target.checked)}
              className="accent-[#05a94f] w-3.5 h-3.5"
            />
            <span className="text-[11px] text-slate-600 font-medium">บันทึกเป็น Template ด้วย</span>
            {saveAsTemplate && seriesInfo && (
              <span className="text-[10px] text-emerald-600 font-semibold">
                ({seriesInfo.airlineCode})
              </span>
            )}
          </label>
        )}
        {/* Spacer */}
        <div className="flex-1" />
        {/* Right */}
        <FooterBtn
          onClick={() => canGoPrev && setActiveTab(visibleTabs[currentIdx - 1].key)}
          disabled={!canGoPrev} variant="default">
          <ChevronLeft size={12} />
          ก่อนหน้า
        </FooterBtn>
        <FooterBtn
          onClick={handleNext}
          disabled={!canGoNext} variant="default">
          ถัดไป
          <ChevronRight size={12} />
        </FooterBtn>
        {!readOnly && (
          <FooterBtn onClick={handleSave} variant="primary">
            <CheckCircle2 size={11} />
            บันทึกการเปลี่ยนแปลง
          </FooterBtn>
        )}
      </div>
    </div>
  )

  // ── Confirm clear dialog ────────────────────────────────────────────────

  const clearDialog = clearTarget && (
    <ConfirmClearDialog
      tabLabel={TABS.find(t => t.key === clearTarget)?.label ?? ''}
      onConfirm={() => handleClearTab(clearTarget)}
      onCancel={() => setClearTarget(null)}
    />
  )

  // ── Fill example dialog + toast ─────────────────────────────────────────

  const fillExampleDialog = showFillExampleConfirm && (
    <ConfirmFillExampleDialog
      onConfirm={executeFillExample}
      onCancel={() => setShowFillExampleConfirm(false)}
    />
  )

  const fillExampleToast = fillExampleToastVisible && (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-600 text-white text-xs font-medium shadow-lg pointer-events-none select-none">
      <CheckCircle2 size={13} />
      สร้างข้อมูลตัวอย่างแล้ว กรุณาตรวจสอบก่อนบันทึก
    </div>
  )

  // ── modal mode ───────────────────────────────────────────────────────────

  if (mode === 'modal') {
    return (
      <>
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(2px)', backgroundColor: 'rgba(15,23,42,0.35)' }}
          onClick={e => { if (e.target === e.currentTarget) onCancel() }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: '96vw', height: '96vh', maxWidth: '1600px' }}
            onClick={e => e.stopPropagation()}
          >
            {inner}
          </div>
        </div>
        {clearDialog}
        {fillExampleDialog}
        {fillExampleToast}
      </>
    )
  }

  // ── page mode ────────────────────────────────────────────────────────────

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
        {inner}
      </div>
      {clearDialog}
      {fillExampleDialog}
      {fillExampleToast}
    </>
  )
}
