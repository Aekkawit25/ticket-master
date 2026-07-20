'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import {
  PlusCircle, Search,
  Eye, Pencil, Copy, PowerOff, Trash2, Clock,
  Banknote, CalendarDays,
} from 'lucide-react'
import {
  type AppConditionTemplate,
  type AppCondition,
  type CondStage,
  type CondTtlRule,
  COND_REFUND_TYPE_LABELS,
  formatStageAmount,
  formatTtlRule,
} from '@/lib/condition-schema'
import {
  getConditionTemplates,
  deleteConditionTemplate,
  duplicateConditionTemplate,
  toggleConditionTemplateStatus,
  seedTemplatesIfEmpty,
} from '@/lib/condition-storage'
import {
  computeUsageStats,
  type UsageStats,
} from '@/lib/condition-usage'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

type UsageFilter = 'all' | 'unused' | 'inuse' | 'has_series' | 'has_pnr' | 'has_override'

// ── Helpers ────────────────────────────────────────────────────────────────────

function stageDueText(s: CondStage): string {
  switch (s.dueType) {
    case 'TRAVEL_MINUS_DAYS':
      return `ก่อนเดินทาง ${s.dueDays} วัน${s.dueTimeUnspecified ? '' : ` เวลา ${s.dueTime}`}`
    case 'SEAT_CONFIRMED_PLUS_DAYS': return `หลัง Confirm ${s.dueDays} วัน`
    case 'CREATED_PLUS_DAYS':        return `หลังสร้าง ${s.dueDays} วัน`
    case 'PREV_DUE_PLUS_DAYS':       return `หลังงวดก่อน ${s.dueDays} วัน`
    case 'CUSTOM_DATE':              return s.dueDate || 'วันที่กำหนดเอง'
    case 'TBD':                      return 'TBD'
    default:                         return `${s.dueDays} วัน`
  }
}

function ttlSummary(rule: CondTtlRule | null | undefined): string {
  if (!rule || rule.calcType === 'NOT_SET') return 'ยังไม่ระบุ'
  return formatTtlRule(rule)
}

function getDepositStage(stages: CondStage[]): CondStage | null {
  return stages.find(s => s.paymentType === 'DEPOSIT' || s.paymentType === 'RSVN_FEE') ?? null
}

function getRefundChip(c: AppCondition): { label: string; cls: string } {
  if (c.refundTerms?.postTicket?.enabled) {
    const p = c.refundTerms.postTicket.refundMainPolicy
    if (p === 'NON_REFUNDABLE') return { label: 'คืนไม่ได้',       cls: 'bg-red-50 text-red-600 border border-red-100' }
    if (p === 'FULL_REFUND')    return { label: 'คืนได้เต็มจำนวน', cls: 'bg-green-50 text-green-700 border border-green-100' }
    if (p === 'PARTIAL_REFUND') return { label: 'คืนได้บางส่วน',  cls: 'bg-yellow-50 text-yellow-700 border border-yellow-100' }
  }
  if (c.refundPolicy?.enabled && c.refundPolicy.refundType) {
    const colorMap: Record<string, string> = {
      FULL_REFUND:        'bg-green-50 text-green-700 border border-green-100',
      PARTIAL_REFUND:     'bg-yellow-50 text-yellow-700 border border-yellow-100',
      CONDITIONAL_REFUND: 'bg-blue-50 text-blue-700 border border-blue-100',
      NON_REFUNDABLE:     'bg-red-50 text-red-600 border border-red-100',
    }
    return {
      label: COND_REFUND_TYPE_LABELS[c.refundPolicy.refundType],
      cls:   colorMap[c.refundPolicy.refundType] ?? 'bg-slate-50 text-slate-400 border border-slate-100',
    }
  }
  return { label: 'ยังไม่ระบุ', cls: 'bg-slate-50 text-slate-400 border border-slate-100' }
}

function getSeatChip(c: AppCondition): { label: string; cls: string } {
  const srp = c.seatReductionPolicy
  if (srp?.enabled && srp.allowReduction === 'ALLOW')
    return { label: 'มีเงื่อนไข', cls: 'bg-purple-50 text-purple-700 border border-purple-100' }
  if (srp?.enabled)
    return { label: 'เปิดใช้งาน', cls: 'bg-purple-50 text-purple-600 border border-purple-100' }
  return { label: 'ยังไม่ระบุ', cls: 'bg-slate-50 text-slate-400 border border-slate-100' }
}

function isInUse(s: UsageStats | undefined): boolean {
  return !!s && (s.series.length > 0 || s.directPnrs.length > 0)
}

// ── Chip component ─────────────────────────────────────────────────────────────
function SummaryChip({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-slate-400">{label}:</span>
      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', cls)}>{value}</span>
    </div>
  )
}

// ── Usage badge with hover tooltip ────────────────────────────────────────────
function UsageBadge({
  stats,
  templateId,
  onClick,
}: {
  stats: UsageStats
  templateId: string
  onClick: () => void
}) {
  const overrideCount = stats.directPnrs.filter(p => p.relationship === 'OVERRIDE').length
  const totalPnr      = stats.inheritedPnrs.length + stats.directPnrs.length
  const inUse         = stats.series.length > 0 || stats.directPnrs.length > 0
  const tooltipRef    = useRef<HTMLDivElement>(null)
  const [tooltipPos, setTooltipPos] = useState<'below' | 'above'>('below')

  const handleHover = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltipPos(rect.bottom + 130 > window.innerHeight ? 'above' : 'below')
  }

  if (!inUse) {
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200 select-none">
        ยังไม่ถูกใช้งาน
      </span>
    )
  }

  return (
    <div className="relative group inline-flex flex-col gap-0.5">
      {/* Main badge */}
      <button
        type="button"
        onMouseEnter={handleHover}
        onClick={onClick}
        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
      >
        ใช้งานแล้ว · {stats.series.length} Series · {totalPnr} PNR
      </button>
      {/* Override sub-badge */}
      {overrideCount > 0 && (
        <span className="text-[9px] font-medium px-1.5 py-px rounded-full bg-orange-50 text-orange-600 border border-orange-200 self-start">
          Override {overrideCount}
        </span>
      )}

      {/* Hover tooltip */}
      <div
        ref={tooltipRef}
        className={cn(
          'absolute left-0 z-30 hidden group-hover:block w-52 bg-white border border-slate-200 rounded-xl shadow-lg p-3 pointer-events-none',
          tooltipPos === 'above' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}
      >
        <p className="text-[10px] font-semibold text-slate-700 mb-2">รายละเอียดการใช้งาน</p>
        <div className="space-y-1.5">
          <Row label="Series ที่กำหนดโดยตรง" value={stats.series.length} />
          <Row label="PNR ที่รับจาก Series"  value={stats.inheritedPnrs.length} />
          <Row label="PNR ที่กำหนดโดยตรง"   value={stats.directPnrs.length} />
          {overrideCount > 0 && <Row label="Override" value={overrideCount} highlight />}
        </div>
        <p className="text-[9px] text-slate-400 mt-2 pt-2 border-t border-slate-100">คลิกเพื่อดูรายละเอียด</p>
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className={cn('text-[10px] font-semibold tabular-nums', highlight ? 'text-orange-600' : 'text-slate-700')}>
        {value}
      </span>
    </div>
  )
}

// ── Filter pill ────────────────────────────────────────────────────────────────
const FILTER_OPTS: { value: UsageFilter; label: string }[] = [
  { value: 'all',          label: 'ทั้งหมด' },
  { value: 'unused',       label: 'ยังไม่ถูกใช้งาน' },
  { value: 'inuse',        label: 'ใช้งานแล้ว' },
  { value: 'has_series',   label: 'มี Series ใช้งาน' },
  { value: 'has_pnr',      label: 'มี PNR กำหนดโดยตรง' },
  { value: 'has_override', label: 'มี Override' },
]

function matchFilter(s: UsageStats | undefined, f: UsageFilter): boolean {
  if (f === 'all') return true
  if (!s)          return f === 'unused'
  const totalPnr   = s.inheritedPnrs.length + s.directPnrs.length
  const inUse      = s.series.length > 0 || s.directPnrs.length > 0
  const overrideCt = s.directPnrs.filter(p => p.relationship === 'OVERRIDE').length
  switch (f) {
    case 'unused':       return !inUse
    case 'inuse':        return inUse
    case 'has_series':   return s.series.length > 0
    case 'has_pnr':      return s.directPnrs.length > 0
    case 'has_override': return overrideCt > 0
    default:             return true
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ConditionTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<AppConditionTemplate[]>([])
  const [search, setSearch]       = useState('')
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all')
  const [deleteModal, setDeleteModal] = useState<string | null>(null)
  const [toggleWarning, setToggleWarning] = useState<{
    templateId: string
    currentStatus: string
    seriesCount: number
    totalPnrCount: number
  } | null>(null)

  const load = useCallback(() => {
    seedTemplatesIfEmpty()
    setTemplates(getConditionTemplates())
  }, [])
  useEffect(load, [load])

  // Compute usage stats for all templates (re-runs when templates reload)
  const usageMap = useMemo(() => {
    const map = new Map<string, UsageStats>()
    for (const t of templates) {
      map.set(t.templateId, computeUsageStats(t.templateId))
    }
    return map
  }, [templates])

  const filtered = useMemo(() => {
    const groupOnly = templates.filter(t => t.ticketType === 'Group' || t.ticketType === 'All')
    const byFilter  = groupOnly.filter(t => matchFilter(usageMap.get(t.templateId), usageFilter))
    if (!search.trim()) return byFilter
    const q = search.toLowerCase()
    return byFilter.filter(t =>
      t.condition.conditionCode.toLowerCase().includes(q) ||
      t.condition.conditionName.toLowerCase().includes(q) ||
      (t.condition.description ?? '').toLowerCase().includes(q) ||
      (t.airlineCode ?? '').toLowerCase().includes(q),
    )
  }, [templates, search, usageFilter, usageMap])

  const handleDuplicate = (id: string) => { duplicateConditionTemplate(id); load() }

  const handleToggleClick = (t: AppConditionTemplate) => {
    const s = usageMap.get(t.templateId)
    // Warn only when deactivating an active, in-use condition
    if (t.condition.status === 'Active' && s && isInUse(s)) {
      setToggleWarning({
        templateId: t.templateId,
        currentStatus: t.condition.status,
        seriesCount: s.series.length,
        totalPnrCount: s.inheritedPnrs.length + s.directPnrs.length,
      })
    } else {
      toggleConditionTemplateStatus(t.templateId)
      load()
    }
  }

  const handleToggleConfirm = () => {
    if (!toggleWarning) return
    toggleConditionTemplateStatus(toggleWarning.templateId)
    setToggleWarning(null)
    load()
  }

  const handleDelete = () => {
    if (!deleteModal) return
    deleteConditionTemplate(deleteModal)
    setDeleteModal(null)
    load()
  }

  return (
    <AppLayout title="Template Condition">
      <div className="space-y-4">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหา Template..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
              />
            </div>
            <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
              Group Booking เท่านั้น
            </span>
            {filtered.length > 0 && (
              <span className="text-[11px] text-slate-400">{filtered.length} template</span>
            )}
          </div>
          <Button icon={<PlusCircle size={14} />} onClick={() => router.push('/tickets/condition-templates/add')}>
            สร้าง Template
          </Button>
        </div>

        {/* ── Usage Filter ── */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setUsageFilter(opt.value)}
              className={cn(
                'text-[11px] font-medium px-3 py-1 rounded-full border transition-colors',
                usageFilter === opt.value
                  ? 'bg-[#05a94f] text-white border-[#05a94f]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ── Empty state ── */}
        {filtered.length === 0 && (
          <Card>
            <div className="flex flex-col items-center py-12 gap-3 text-slate-400">
              <p className="text-sm font-medium">
                {search || usageFilter !== 'all' ? 'ไม่พบ Template ที่ตรงกับเงื่อนไข' : 'ยังไม่มี Template Condition'}
              </p>
              {!search && usageFilter === 'all' && (
                <Button size="sm" onClick={() => router.push('/tickets/condition-templates/add')}>
                  สร้าง Template แรก
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* ── Template List ── */}
        <div className="space-y-2">
          {filtered.map(t => {
            const c            = t.condition
            const stats        = usageMap.get(t.templateId)
            const inUse        = isInUse(stats)
            const depositStage = getDepositStage(c.stages)
            const firstStage   = c.stages[0] ?? null
            const hasFullPay   = c.stages.some(s => s.paymentType === 'FULL_PAYMENT')
            const hasFreeText  = !!(c.freeTextCondition?.trim() || c.freeTextHtml?.trim())
            const refundChip   = getRefundChip(c)
            const seatChip     = getSeatChip(c)

            return (
              <Card key={t.templateId} className="overflow-hidden">

                {/* ══ Header ══ */}
                <div className="px-4 pt-3 pb-2">
                  <div className="flex items-start gap-3">

                    {/* Identity info */}
                    <div className="min-w-0 flex-1">
                      {/* Row 1: Code + Name */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-px rounded font-semibold shrink-0">
                          {c.conditionCode || '—'}
                        </span>
                        <span className="font-semibold text-sm text-slate-800">
                          {c.conditionName || 'ไม่มีชื่อ'}
                        </span>
                      </div>

                      {/* Row 2: Badges */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {t.airlineCode && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                            {t.airlineCode}
                          </span>
                        )}
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                          Group
                        </span>
                        {t.currency && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {t.currency}
                          </span>
                        )}
                        <Badge variant={c.status === 'Active' ? 'green' : c.status === 'Draft' ? 'yellow' : 'gray'}>
                          {c.status}
                        </Badge>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                          {c.stages.length > 0 ? `${c.stages.length} รอบ` : 'ยังไม่ระบุรอบ'}
                        </span>
                        {hasFreeText && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100">
                            เงื่อนไขเพิ่มเติม
                          </span>
                        )}
                        {/* Usage badge */}
                        {stats && (
                          <UsageBadge
                            stats={stats}
                            templateId={t.templateId}
                            onClick={() => router.push(`/tickets/condition-templates/${t.templateId}?tab=usage`)}
                          />
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0 -mt-0.5">
                      <button type="button" title="ดูรายละเอียด"
                        onClick={() => router.push(`/tickets/condition-templates/${t.templateId}`)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
                        <Eye size={13} />
                      </button>
                      <button type="button" title="แก้ไข"
                        onClick={() => router.push(`/tickets/condition-templates/${t.templateId}/edit`)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#05a94f] hover:bg-emerald-50 transition">
                        <Pencil size={13} />
                      </button>
                      <button type="button" title="คัดลอก"
                        onClick={() => handleDuplicate(t.templateId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
                        <Copy size={13} />
                      </button>
                      <button type="button"
                        title={c.status === 'Active' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        onClick={() => handleToggleClick(t)}
                        className={cn(
                          'p-1.5 rounded-lg transition',
                          c.status === 'Active'
                            ? 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                            : 'text-amber-500 hover:text-[#05a94f] hover:bg-emerald-50',
                        )}>
                        <PowerOff size={13} />
                      </button>

                      {/* Delete — disabled if in use */}
                      <span
                        title={inUse ? 'ไม่สามารถลบได้ เนื่องจาก Condition นี้กำลังถูกใช้งาน' : 'ลบ'}
                        className="inline-flex"
                      >
                        <button
                          type="button"
                          disabled={inUse}
                          onClick={inUse ? undefined : () => setDeleteModal(t.templateId)}
                          className={cn(
                            'p-1.5 rounded-lg transition',
                            inUse
                              ? 'text-slate-200 cursor-not-allowed'
                              : 'text-slate-400 hover:text-red-500 hover:bg-red-50',
                          )}
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    </div>
                  </div>
                </div>

                {/* ══ Summary Grid (4 cells) ══ */}
                <div className="mx-4 mb-2 grid grid-cols-4 rounded-xl border border-slate-100 overflow-hidden divide-x divide-slate-100">
                  {/* 1. มัดจำ / Deposit หลัก */}
                  <div className="px-3 py-2.5 bg-white">
                    <div className="flex items-center gap-1 mb-1">
                      <Banknote size={10} className="text-emerald-500 shrink-0" />
                      <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">มัดจำ / Deposit หลัก</span>
                    </div>
                    {depositStage ? (
                      <p className="text-[12px] font-bold text-slate-800 leading-tight">
                        {formatStageAmount(depositStage, t.currency)}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">ยังไม่ระบุ</p>
                    )}
                  </div>

                  {/* 2. รอบชำระเงิน */}
                  <div className="px-3 py-2.5 bg-white">
                    <div className="flex items-center gap-1 mb-1">
                      <CalendarDays size={10} className="text-blue-500 shrink-0" />
                      <span className="text-[10px] text-slate-400 font-medium">รอบชำระเงิน</span>
                    </div>
                    {c.stages.length > 0 ? (
                      <p className="text-[12px] font-bold text-slate-800 leading-tight">{c.stages.length} รอบ</p>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">ยังไม่ระบุ</p>
                    )}
                  </div>

                  {/* 3. กำหนดชำระ (first stage) */}
                  <div className="px-3 py-2.5 bg-white">
                    <div className="flex items-center gap-1 mb-1">
                      <Clock size={10} className="text-amber-500 shrink-0" />
                      <span className="text-[10px] text-slate-400 font-medium">กำหนดชำระ</span>
                    </div>
                    {firstStage ? (
                      <p className="text-[11px] font-semibold text-slate-700 leading-snug">
                        {stageDueText(firstStage)}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">ยังไม่ระบุ</p>
                    )}
                  </div>

                  {/* 4. TTL / ส่งชื่อ */}
                  <div className="px-3 py-2.5 bg-white">
                    <div className="flex items-center gap-1 mb-1">
                      <Clock size={10} className="text-purple-500 shrink-0" />
                      <span className="text-[10px] text-slate-400 font-medium">NAME DL / ส่งชื่อ</span>
                    </div>
                    <p className={cn(
                      'leading-snug',
                      c.ttlRule?.calcType === 'NOT_SET' || !c.ttlRule
                        ? 'text-[11px] text-slate-400 italic'
                        : 'text-[11px] font-semibold text-slate-700'
                    )}>
                      {ttlSummary(c.ttlRule)}
                    </p>
                  </div>
                </div>

                {/* ══ Summary Chips ══ */}
                <div className="mx-4 mb-2 flex items-center gap-2 flex-wrap">
                  <SummaryChip label="Refund" value={refundChip.label} cls={refundChip.cls} />
                  <span className="text-slate-200 text-xs select-none">·</span>
                  <SummaryChip label="ลดที่นั่ง/ยกเลิก" value={seatChip.label} cls={seatChip.cls} />
                  <span className="text-slate-200 text-xs select-none">·</span>
                  <SummaryChip
                    label="Full Payment"
                    value={hasFullPay ? 'มี' : 'ยังไม่ระบุ'}
                    cls={hasFullPay
                      ? 'bg-blue-50 text-blue-700 border border-blue-100'
                      : 'bg-slate-50 text-slate-400 border border-slate-100'}
                  />
                  <span className="text-slate-200 text-xs select-none">·</span>
                  <SummaryChip
                    label="Free Text"
                    value={hasFreeText ? 'มี' : 'ไม่มี'}
                    cls={hasFreeText
                      ? 'bg-orange-50 text-orange-700 border border-orange-100'
                      : 'bg-slate-50 text-slate-400 border border-slate-100'}
                  />
                </div>

                {/* ══ Card Footer ══ */}
                <div className="flex items-center px-4 py-2 border-t border-slate-100 bg-slate-50/60">
                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span>ใช้กับ: <strong className="text-slate-600">Group</strong></span>
                    <span className="text-slate-200 select-none">·</span>
                    <span>อัปเดต: <strong className="text-slate-600">{formatDate(t.updatedAt)}</strong></span>
                    <span className="text-slate-200 select-none">·</span>
                    <span>v{t.version}</span>
                  </div>
                </div>

              </Card>
            )
          })}
        </div>

      </div>

      {/* ── Delete Confirm ── */}
      <Modal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="ลบ Template Condition"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteModal(null)}>ยกเลิก</Button>
            <Button variant="danger" onClick={handleDelete}>ลบ</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">ต้องการลบ Template นี้หรือไม่? ข้อมูลจะหายไปถาวร</p>
      </Modal>

      {/* ── Toggle (deactivate) Warning ── */}
      <Modal
        open={!!toggleWarning}
        onClose={() => setToggleWarning(null)}
        title="ยืนยันการปิดใช้งาน Condition"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToggleWarning(null)}>ยกเลิก</Button>
            <Button variant="danger" onClick={handleToggleConfirm}>ปิดใช้งาน</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Condition นี้กำลังถูกใช้งานอยู่ คุณต้องการปิดใช้งานหรือไม่?
          </p>
          {toggleWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-amber-700 mb-1.5">ได้รับผลกระทบ</p>
              <div className="flex justify-between text-xs">
                <span className="text-amber-700">Series ที่กำหนดโดยตรง</span>
                <span className="font-semibold text-amber-800">{toggleWarning.seriesCount}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-amber-700">PNR รวม</span>
                <span className="font-semibold text-amber-800">{toggleWarning.totalPnrCount}</span>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">Condition จะยังคงผูกอยู่กับ Series และ PNR แต่สถานะจะเปลี่ยนเป็น Inactive</p>
        </div>
      </Modal>
    </AppLayout>
  )
}
