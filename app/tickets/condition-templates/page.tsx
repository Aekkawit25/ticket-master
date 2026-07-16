'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import {
  PlusCircle, Search, ChevronDown, ChevronRight,
  Eye, Pencil, Copy, PowerOff, Trash2, Clock,
  Banknote, CalendarDays, FileText,
} from 'lucide-react'
import {
  type AppConditionTemplate,
  type AppCondition,
  type CondStage,
  type CondTtlRule,
  type CondRefundableType,
  COND_PAYMENT_TYPE_LABELS,
  COND_CALC_TYPE_LABELS,
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
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

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

// ── Chip component ─────────────────────────────────────────────────────────────
function SummaryChip({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-slate-400">{label}:</span>
      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', cls)}>{value}</span>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ConditionTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<AppConditionTemplate[]>([])
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [deleteModal, setDeleteModal] = useState<string | null>(null)

  const load = () => {
    seedTemplatesIfEmpty()
    setTemplates(getConditionTemplates())
  }
  useEffect(load, [])

  const filtered = useMemo(() => {
    const groupOnly = templates.filter(t => t.ticketType === 'Group' || t.ticketType === 'All')
    if (!search.trim()) return groupOnly
    const q = search.toLowerCase()
    return groupOnly.filter(t =>
      t.condition.conditionCode.toLowerCase().includes(q) ||
      t.condition.conditionName.toLowerCase().includes(q) ||
      (t.condition.description ?? '').toLowerCase().includes(q) ||
      (t.airlineCode ?? '').toLowerCase().includes(q),
    )
  }, [templates, search])

  const toggle = (id: string) =>
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleDuplicate    = (id: string) => { duplicateConditionTemplate(id);    load() }
  const handleToggleStatus = (id: string) => { toggleConditionTemplateStatus(id); load() }
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

        {/* ── Empty state ── */}
        {filtered.length === 0 && (
          <Card>
            <div className="flex flex-col items-center py-12 gap-3 text-slate-400">
              <p className="text-sm font-medium">ยังไม่มี Template Condition</p>
              <Button size="sm" onClick={() => router.push('/tickets/condition-templates/add')}>
                สร้าง Template แรก
              </Button>
            </div>
          </Card>
        )}

        {/* ── Template List ── */}
        <div className="space-y-2">
          {filtered.map(t => {
            const c            = t.condition
            const isExpanded   = expandedIds.has(t.templateId)
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

                    {/* Toggle chevron */}
                    <button
                      type="button"
                      onClick={() => toggle(t.templateId)}
                      className="mt-1 shrink-0 text-slate-400 hover:text-slate-600 transition"
                    >
                      {isExpanded
                        ? <ChevronDown size={14} />
                        : <ChevronRight size={14} />
                      }
                    </button>

                    {/* Identity info (click area for expand) */}
                    <div
                      role="button" tabIndex={0}
                      onClick={() => toggle(t.templateId)}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggle(t.templateId)}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
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
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0 -mt-0.5" onClick={e => e.stopPropagation()}>
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
                        onClick={() => handleToggleStatus(t.templateId)}
                        className={cn(
                          'p-1.5 rounded-lg transition',
                          c.status === 'Active'
                            ? 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                            : 'text-amber-500 hover:text-[#05a94f] hover:bg-emerald-50',
                        )}>
                        <PowerOff size={13} />
                      </button>
                      <button type="button" title="ลบ"
                        onClick={() => setDeleteModal(t.templateId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition">
                        <Trash2 size={13} />
                      </button>
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
                  <SummaryChip label="ลดที่นั่ง" value={seatChip.label} cls={seatChip.cls} />
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
                <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50/60">
                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span>ใช้กับ: <strong className="text-slate-600">Group</strong></span>
                    <span className="text-slate-200 select-none">·</span>
                    <span>อัปเดต: <strong className="text-slate-600">{formatDate(t.updatedAt)}</strong></span>
                    <span className="text-slate-200 select-none">·</span>
                    <span>v{t.version}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(t.templateId)}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-[#05a94f] transition"
                  >
                    {isExpanded ? (
                      <><ChevronDown size={12} className="shrink-0" /> ย่อรายละเอียด</>
                    ) : (
                      <><ChevronRight size={12} className="shrink-0" /> ดูรายละเอียด</>
                    )}
                  </button>
                </div>

                {/* ══ Expanded Detail ══ */}
                {isExpanded && (
                  <div className="border-t-2 border-slate-200 bg-slate-50/80 px-4 pb-4 pt-3 space-y-4">

                    {/* รายการรอบชำระเงินทั้งหมด */}
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                        รายการรอบชำระเงิน
                      </p>
                      {c.stages.length === 0 ? (
                        <p className="text-xs text-slate-400 italic px-1">ยังไม่มีรอบชำระ — ยังไม่ระบุ</p>
                      ) : (
                        <div className="space-y-2">
                          {c.stages.map(s => {
                            const refundable: CondRefundableType = (s as any).refundable ?? 'UNSPECIFIED'
                            const creditTowardFare: boolean      = (s as any).creditTowardFare ?? false
                            return (
                              <div key={s.stageId} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                                {/* Stage header */}
                                <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                                  <span className="w-5 h-5 rounded-full bg-[#05a94f] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                    {s.stageNo}
                                  </span>
                                  <span className="text-xs font-semibold text-slate-700 flex-1">
                                    {COND_PAYMENT_TYPE_LABELS[s.paymentType as keyof typeof COND_PAYMENT_TYPE_LABELS]
                                      ?? s.paymentType
                                      ?? `งวดที่ ${s.stageNo}`}
                                  </span>
                                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                                    {formatStageAmount(s, t.currency)}
                                  </span>
                                </div>
                                {/* Stage body */}
                                <div className="px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                                  <span className="text-[11px] text-slate-500">
                                    วิธีคิด:{' '}
                                    <span className="text-slate-700 font-medium">
                                      {COND_CALC_TYPE_LABELS[s.calcType as keyof typeof COND_CALC_TYPE_LABELS] ?? s.calcType}
                                    </span>
                                  </span>
                                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                                    <Clock size={10} className="text-slate-400 shrink-0" />
                                    กำหนดชำระ:{' '}
                                    <span className="text-slate-700 font-medium ml-0.5">{stageDueText(s)}</span>
                                  </span>
                                  <div className="flex items-center gap-1 ml-auto flex-wrap">
                                    {creditTowardFare && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-100">
                                        นับเป็นค่าตั๋ว
                                      </span>
                                    )}
                                    {refundable === 'REFUNDABLE' && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium border border-blue-100">คืนเงินได้</span>
                                    )}
                                    {refundable === 'NON_REFUNDABLE' && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-medium border border-red-100">คืนเงินไม่ได้</span>
                                    )}
                                    {refundable === 'AS_SEAT_RETURN' && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium border border-amber-100">ตามเงื่อนไขคืนที่นั่ง</span>
                                    )}
                                    {refundable === 'UNSPECIFIED' && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-medium">ยังไม่ระบุคืนเงิน</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* TTL */}
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                      <Clock size={12} className="text-purple-400 shrink-0" />
                      <span className="text-[11px] font-semibold text-slate-500">NAME DL / กำหนดส่งชื่อ</span>
                      <span className={cn(
                        'text-xs font-medium',
                        c.ttlRule?.calcType === 'NOT_SET' || !c.ttlRule ? 'text-slate-400 italic' : 'text-slate-700'
                      )}>
                        {ttlSummary(c.ttlRule)}
                      </span>
                    </div>

                    {/* เงื่อนไขการคืน */}
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                        เงื่อนไขการคืน (Refund)
                      </p>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', refundChip.cls)}>
                          {refundChip.label}
                        </span>
                        {c.refundTerms?.remark && (
                          <p className="mt-1.5 text-[11px] text-slate-500">{c.refundTerms.remark}</p>
                        )}
                      </div>
                    </div>

                    {/* เงื่อนไขลดที่นั่ง */}
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                        เงื่อนไขลดที่นั่ง
                      </p>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', seatChip.cls)}>
                          {seatChip.label}
                        </span>
                        {c.seatReductionPolicy?.enabled && c.seatReductionPolicy.maxReducePercent != null && (
                          <span className="ml-2 text-[11px] text-slate-500">ลดได้สูงสุด {c.seatReductionPolicy.maxReducePercent}%</span>
                        )}
                        {c.seatReductionPolicy?.remark && (
                          <p className="mt-1.5 text-[11px] text-slate-500">{c.seatReductionPolicy.remark}</p>
                        )}
                        {!c.seatReductionPolicy?.enabled && (
                          <span className="ml-2 text-[11px] text-slate-400 italic">ยังไม่ระบุ</span>
                        )}
                      </div>
                    </div>

                    {/* เงื่อนไขเพิ่มเติม Free Text */}
                    {hasFreeText ? (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                          <FileText size={10} />
                          เงื่อนไขเพิ่มเติม (Free Text)
                        </p>
                        <div className="rounded-xl border border-orange-100 bg-orange-50/40 px-3 py-2.5 shadow-sm">
                          {c.freeTextHtml ? (
                            <div
                              className="prose prose-xs max-w-none text-slate-600 text-xs"
                              dangerouslySetInnerHTML={{ __html: c.freeTextHtml }}
                            />
                          ) : (
                            <p className="text-xs text-slate-600 whitespace-pre-wrap">{c.freeTextCondition}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                          <FileText size={10} />
                          เงื่อนไขเพิ่มเติม (Free Text)
                        </p>
                        <p className="text-[11px] text-slate-400 italic px-1">ไม่มีเงื่อนไขเพิ่มเติม</p>
                      </div>
                    )}
                  </div>
                )}

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
    </AppLayout>
  )
}
