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
} from 'lucide-react'
import {
  type AppConditionTemplate,
  type CondRefundableType,
  COND_REFUND_TYPE_LABELS,
  COND_REFUND_TYPE_COLORS,
  COND_PAYMENT_TYPE_LABELS,
  COND_CALC_TYPE_LABELS,
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

const AIRLINE_NAMES: Record<string, string> = {
  TG: 'Thai Airways', VZ: 'Thai VietJet', FD: 'Thai AirAsia',
  SQ: 'Singapore Airlines', QR: 'Qatar Airways', EK: 'Emirates',
  MH: 'Malaysia Airlines', CX: 'Cathay Pacific', JL: 'Japan Airlines',
  CI: 'China Airlines', NH: 'All Nippon Airways', KE: 'Korean Air',
  BR: 'EVA Air', CA: 'Air China',
}

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

  const handleDuplicate = (id: string) => {
    duplicateConditionTemplate(id)
    load()
  }

  const handleToggleStatus = (id: string) => {
    toggleConditionTemplateStatus(id)
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
        {/* Top bar */}
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
          </div>
          <Button icon={<PlusCircle size={14} />} onClick={() => router.push('/tickets/condition-templates/add')}>
            สร้าง Template
          </Button>
        </div>

        {/* Template list */}
        {filtered.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center py-12 gap-3 text-slate-400">
              <p className="text-sm font-medium">ยังไม่มี Template Condition</p>
              <Button size="sm" onClick={() => router.push('/tickets/condition-templates/add')}>
                สร้าง Template แรก
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(t => {
              const c = t.condition
              const isExpanded = expandedIds.has(t.templateId)
              return (
                <Card key={t.templateId}>
                  <div
                    role="button" tabIndex={0}
                    onClick={() => toggle(t.templateId)}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggle(t.templateId)}
                    className="flex items-start justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition rounded-t-[inherit]"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      {isExpanded ? <ChevronDown size={13} className="text-slate-400 mt-0.5 shrink-0" /> : <ChevronRight size={13} className="text-slate-400 mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        {/* Row 1: code + name + airline */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-px rounded">{c.conditionCode}</span>
                          <span className="font-semibold text-sm text-slate-800">{c.conditionName}</span>
                          {t.airlineCode && (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-px rounded font-medium">{t.airlineCode}</span>
                          )}
                          {t.ticketType && t.ticketType !== 'All' && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-px rounded font-medium">{t.ticketType}</span>
                          )}
                          {t.currency && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-px rounded font-medium">{t.currency}</span>
                          )}
                        </div>
                        {/* Row 2: status + capability badges */}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant={c.status === 'Active' ? 'green' : 'gray'}>{c.status}</Badge>
                          {c.stages.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{c.stages.length} งวด</span>
                          )}
                          {(c as any).baggagePolicy?.enabled && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 font-medium border border-cyan-100">สัมภาระ</span>
                          )}
                          {(c as any).seatReductionPolicy?.allowReduction && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium border border-purple-100">ลดที่นั่ง</span>
                          )}
                          {c.refundPolicy.enabled && c.refundPolicy.refundType && (
                            <span className={`text-[10px] px-1.5 py-px rounded-full font-semibold ${COND_REFUND_TYPE_COLORS[c.refundPolicy.refundType]}`}>
                              {COND_REFUND_TYPE_LABELS[c.refundPolicy.refundType]}
                            </span>
                          )}
                          {((c as any).freeTextCondition?.trim() || (c as any).freeTextHtml?.trim()) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium border border-orange-100">เงื่อนไขเพิ่มเติม</span>
                          )}
                          {c.description && (
                            <span className="text-[10px] text-slate-400 truncate max-w-xs">{c.description}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button type="button" title="ดูรายละเอียด" onClick={() => router.push(`/tickets/condition-templates/${t.templateId}`)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
                        <Eye size={13} />
                      </button>
                      <button type="button" title="แก้ไข" onClick={() => router.push(`/tickets/condition-templates/${t.templateId}/edit`)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#05a94f] hover:bg-emerald-50 transition">
                        <Pencil size={13} />
                      </button>
                      <button type="button" title="คัดลอก" onClick={() => handleDuplicate(t.templateId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
                        <Copy size={13} />
                      </button>
                      <button type="button" title={c.status === 'Active' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'} onClick={() => handleToggleStatus(t.templateId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition">
                        <PowerOff size={13} />
                      </button>
                      <button type="button" title="ลบ" onClick={() => setDeleteModal(t.templateId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4">

                      {/* ── รอบชำระเงิน ── */}
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">รอบชำระเงิน</p>
                        {c.stages.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">ไม่มีรอบชำระ</p>
                        ) : (
                          <div className="space-y-2">
                            {c.stages.map(s => {
                              const dueText =
                                s.dueType === 'TRAVEL_MINUS_DAYS' ? `ก่อนเดินทาง ${s.dueDays} วัน เวลา ${s.dueTime}` :
                                s.dueType === 'CUSTOM_DATE'       ? s.dueDate || 'วันที่กำหนดเอง' :
                                s.dueType === 'TBD'               ? 'TBD' :
                                `${s.dueDays} วัน เวลา ${s.dueTime}`
                              const refundable: CondRefundableType = (s as any).refundable ?? 'UNSPECIFIED'
                              const creditTowardFare: boolean = (s as any).creditTowardFare ?? false
                              return (
                                <div key={s.stageId} className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
                                  {/* Stage header bar */}
                                  <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white">
                                    <span className="w-5 h-5 rounded-full bg-[#05a94f] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                      {s.stageNo}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-700 flex-1">
                                      {COND_PAYMENT_TYPE_LABELS[s.paymentType as keyof typeof COND_PAYMENT_TYPE_LABELS] ?? s.paymentType}
                                    </span>
                                    <span className="text-sm font-bold text-slate-800">
                                      {formatStageAmount(s, t.currency)}
                                    </span>
                                  </div>
                                  {/* Stage body */}
                                  <div className="px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                                    {/* Calc type */}
                                    <span className="text-[11px] text-slate-500">
                                      วิธีคิด: <span className="text-slate-700 font-medium">
                                        {COND_CALC_TYPE_LABELS[s.calcType as keyof typeof COND_CALC_TYPE_LABELS] ?? s.calcType}
                                      </span>
                                    </span>
                                    {/* Due */}
                                    <span className="flex items-center gap-1 text-[11px] text-slate-500">
                                      <Clock size={10} className="text-slate-400" />
                                      กำหนดชำระ: <span className="text-slate-700 font-medium ml-0.5">{dueText}</span>
                                    </span>
                                    {/* Badges */}
                                    <div className="flex items-center gap-1 ml-auto">
                                      {creditTowardFare && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-100">
                                          นับเป็นค่าตั๋ว
                                        </span>
                                      )}
                                      {refundable === 'REFUNDABLE' && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium border border-blue-100">
                                          คืนเงินได้
                                        </span>
                                      )}
                                      {refundable === 'NON_REFUNDABLE' && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-medium border border-red-100">
                                          คืนเงินไม่ได้
                                        </span>
                                      )}
                                      {refundable === 'AS_SEAT_RETURN' && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium border border-amber-100">
                                          ตามเงื่อนไขคืนที่นั่ง
                                        </span>
                                      )}
                                      {refundable === 'UNSPECIFIED' && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-medium">
                                          ยังไม่ระบุคืนเงิน
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* ── TTL ── */}
                      <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <Clock size={12} className="text-slate-400 shrink-0" />
                        <span className="text-[11px] font-semibold text-slate-500">กำหนดส่ง NAME (TTL)</span>
                        <span className="text-xs font-medium text-slate-700">{formatTtlRule(c.ttlRule)}</span>
                        <span className="ml-auto text-[10px] text-slate-400">
                          {t.ticketType !== 'All' && <span className="mr-3">ตั๋ว: {t.ticketType}</span>}
                          v{t.version} · อัปเดต {formatDate(t.updatedAt)}
                        </span>
                      </div>

                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}

        {/* Delete confirm */}
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
      </div>
    </AppLayout>
  )
}
