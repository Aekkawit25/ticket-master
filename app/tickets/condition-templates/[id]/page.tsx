'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import {
  Pencil, Copy, PowerOff, Trash2, ArrowLeft,
  CreditCard, Clock, Package, TrendingDown, X, RefreshCcw, FileText,
} from 'lucide-react'
import {
  type AppConditionTemplate, type CondStage, type CondSeatReductionRule,
  COND_PAYMENT_TYPE_LABELS, COND_DUE_TYPE_LABELS,
  COND_QUANTITY_BASIS_LABELS, COND_REFUNDABLE_LABELS,
  COND_PRE_MONEY_TYPE_LABELS, COND_PRE_REFUND_POLICY_LABELS,
  COND_REFUND_TYPE_LABELS, COND_REFUND_TYPE_COLORS,
  DAY_BASED_DUE_TYPES,
  formatStageAmount, formatTtlRule, formatBaggageSummary,
} from '@/lib/condition-schema'
import {
  getConditionTemplateById,
  deleteConditionTemplate,
  duplicateConditionTemplate,
  toggleConditionTemplateStatus,
} from '@/lib/condition-storage'
import { formatDate } from '@/lib/utils'

// ─── Label maps ───────────────────────────────────────────────────────────────

const AIRLINE_NAMES: Record<string, string> = {
  TG: 'Thai Airways', VZ: 'Thai VietJet', FD: 'Thai AirAsia',
  SQ: 'Singapore Airlines', QR: 'Qatar Airways', EK: 'Emirates',
  MH: 'Malaysia Airlines', CX: 'Cathay Pacific', JL: 'Japan Airlines',
  CI: 'China Airlines', NH: 'ANA', KE: 'Korean Air', BR: 'EVA Air', CA: 'Air China',
}

const OVER_LIMIT_LABELS: Record<string, string> = {
  UNSPECIFIED: 'ยังไม่กำหนด', NO_FORFEIT: 'ไม่ยึดเงิน',
  FORFEIT: 'ยึดเงิน', PENALTY: 'คิดค่าปรับ', REQUIRE_APPROVAL: 'ต้องขออนุมัติ',
}
const OVER_LIMIT_COLORS: Record<string, string> = {
  UNSPECIFIED:      'bg-slate-100 text-slate-500 border-slate-200',
  NO_FORFEIT:       'bg-green-50 text-green-700 border-green-200',
  FORFEIT:          'bg-orange-50 text-orange-700 border-orange-200',
  PENALTY:          'bg-red-50 text-red-700 border-red-200',
  REQUIRE_APPROVAL: 'bg-purple-50 text-purple-700 border-purple-200',
}
const FORFEIT_SOURCE_LABELS: Record<string, string> = {
  DEPOSIT: 'มัดจำ (Deposit)', RSVN_FEE: 'RSVN Fee', ALL: 'ทั้งหมด',
}
const PENALTY_TYPE_LABELS: Record<string, string> = {
  NONE: 'ไม่มีค่าปรับ', FIXED: 'จำนวนเงินคงที่', PERCENT: 'เปอร์เซ็นต์', FORFEIT_ALL: 'ยึดทั้งหมด',
}
const CALC_BASE_LABELS: Record<string, string> = {
  GROUP_PRICE: 'ราคากรุ๊ป', FARE: 'Fare', ALLIN: 'All-in',
  NET_FARE: 'Net Fare', DEPOSIT: 'Deposit', AMOUNT_PAID: 'ยอดที่จ่ายแล้ว',
}
const CG_POLICY_LABELS: Record<string, string> = {
  UNSPECIFIED: 'ยังไม่ระบุ', ALLOW: 'อนุญาต',
  NOT_ALLOW: 'ไม่อนุญาต', REQUIRE_APPROVAL: 'ต้องขออนุมัติ',
}
const CG_POLICY_COLORS: Record<string, string> = {
  UNSPECIFIED:      'bg-slate-100 text-slate-500',
  ALLOW:            'bg-green-50 text-green-700',
  NOT_ALLOW:        'bg-red-50 text-red-700',
  REQUIRE_APPROVAL: 'bg-purple-50 text-purple-700',
}
const CG_DEADLINE_BASE_LABELS: Record<string, string> = {
  DEPARTURE_DATE: 'วันเดินทางวันแรก', TICKET_ISSUE: 'วันออกตั๋ว',
  SEAT_CONFIRMED: 'วันที่ Confirm ที่นั่ง', CUSTOM_DATE: 'วันที่กำหนดเอง',
}
const CG_REFUNDABLE_LABELS: Record<string, string> = {
  UNSPECIFIED: 'ยังไม่ระบุ', NON_REFUNDABLE: 'คืนไม่ได้',
  PARTIAL_REFUND: 'คืนได้บางส่วน', FULL_REFUND: 'คืนได้ทั้งหมด',
}
const MAIN_REFUND_LABELS: Record<string, string> = {
  NON_REFUNDABLE: 'คืนไม่ได้', PARTIAL_REFUND: 'คืนได้บางส่วน',
  FULL_REFUND: 'คืนได้ทั้งหมด', STEP_RULE: 'ตาม Step Rule', REQUIRE_APPROVAL: 'ต้องขออนุมัติ',
}
const POST_POLICY_LABELS: Record<string, string> = {
  UNSPECIFIED: 'ยังไม่ระบุ', NON_REFUNDABLE: 'คืนไม่ได้',
  PARTIAL_REFUND: 'คืนได้บางส่วน', FULL_REFUND: 'คืนได้ทั้งหมด',
}
const POST_POLICY_COLORS: Record<string, string> = {
  UNSPECIFIED:    'bg-slate-100 text-slate-500',
  NON_REFUNDABLE: 'bg-red-50 text-red-700',
  PARTIAL_REFUND: 'bg-amber-50 text-amber-700',
  FULL_REFUND:    'bg-green-50 text-green-700',
}
const REFUND_ITEM_LABELS: Record<string, string> = {
  FARE: 'Fare', TAX: 'Tax', YQ: 'YQ', YR: 'YR', DEPOSIT: 'Deposit', OTHER: 'อื่น ๆ',
}
const UTIL_ACTION_LABELS: Record<string, string> = {
  NO_PENALTY: 'ไม่มีค่าปรับ', PENALTY: 'คิดค่าปรับ', FORFEIT_DEPOSIT: 'ยึดเงินมัดจำ',
}
const UTIL_BASE_LABELS: Record<string, string> = {
  INITIAL_SEAT: 'ที่นั่งเปิดขาย', DEPOSIT_SEAT: 'ที่นั่งที่วางมัดจำ', LATEST_SEAT: 'ที่นั่งปัจจุบัน',
}
const SEAT_BASIS_LABELS: Record<string, string> = {
  INITIAL_SEAT: 'Seat เริ่มต้น (ที่นั่งเปิดขาย)', REMAINING_SEAT: 'Seat คงเหลือ',
}
const SEAT_NOTICE_BASE_LABELS: Record<string, string> = {
  DEPARTURE_DATE: 'วันเดินทางวันแรก',
  TICKET_ISSUE:   'วันออกตั๋ว',
  SEAT_CONFIRMED: 'วันที่ Confirm ที่นั่ง',
}

const ANCILLARY_LABELS: Record<string, string> = {
  UNSPECIFIED: 'ยังไม่ระบุ', YES: 'ได้', NO: 'ไม่ได้',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDueText(s: CondStage): string {
  if (s.dueType === 'CUSTOM_DATE') {
    if (!s.dueDate) return 'วันที่กำหนดเอง (ยังไม่ระบุ)'
    const noTime = s.dueTimeUnspecified ?? !s.dueTime
    return noTime ? `วันที่ ${s.dueDate}` : `วันที่ ${s.dueDate} เวลา ${s.dueTime}`
  }
  if (s.dueType === 'TBD') return 'กำหนดภายหลัง (TBD)'
  if (!DAY_BASED_DUE_TYPES.includes(s.dueType)) return COND_DUE_TYPE_LABELS[s.dueType] ?? s.dueType
  const noTime = s.dueTimeUnspecified ?? !s.dueTime
  const base = (COND_DUE_TYPE_LABELS[s.dueType] ?? '').replace(' N วัน', '')
  return noTime
    ? `${base} ${s.dueDays} วัน`
    : `${base} ${s.dueDays} วัน เวลา ${s.dueTime}`
}

function formatSeatRange(r: CondSeatReductionRule): string {
  if (r.rangeType === 'FROM_DAY_UP')
    return r.fromDays != null ? `ตั้งแต่ ${r.fromDays} วันก่อนเดินทางขึ้นไป` : 'ทุกช่วงเวลา'
  if (r.rangeType === 'UNTIL_DAY')
    return r.toDays != null ? `ภายใน ${r.toDays} วันก่อนเดินทาง` : 'ก่อนเดินทาง'
  const from = r.fromDays != null ? `${r.fromDays}` : '?'
  const to   = r.toDays   != null ? `${r.toDays}` : '?'
  return `ระหว่าง ${from}–${to} วันก่อนเดินทาง`
}

function Chip({ children, color = 'slate' }: { children: React.ReactNode; color?: string }) {
  const c: Record<string, string> = {
    slate:  'bg-slate-100 text-slate-600',
    green:  'bg-green-50 text-green-700',
    red:    'bg-red-50 text-red-700',
    orange: 'bg-orange-50 text-orange-700',
    blue:   'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    cyan:   'bg-cyan-50 text-cyan-700',
    amber:  'bg-amber-50 text-amber-700',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${c[color] ?? c.slate}`}>{children}</span>
}

function OverLimitChip({ action }: { action: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${OVER_LIMIT_COLORS[action] ?? 'bg-slate-100 text-slate-500'}`}>
      {OVER_LIMIT_LABELS[action] ?? action}
    </span>
  )
}

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 mb-0.5">{label}</p>
      <div className="text-xs text-slate-700">{children}</div>
    </div>
  )
}

function StageRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-1.5">
      <span className="text-[11px] text-slate-400 w-44 shrink-0">{label}</span>
      <span className="text-xs text-slate-700 flex-1">{value}</span>
    </div>
  )
}

function SrPenaltySummary({ overLimit, forfeitSrc, penType, penAmount, penPercent, penCurrency, calcBase }: {
  overLimit: string; forfeitSrc: string | null
  penType: string; penAmount: number | null; penPercent: number | null; penCurrency: string; calcBase: string
}) {
  if (overLimit === 'FORFEIT') {
    return (
      <div className="flex flex-wrap gap-1.5 items-center">
        <OverLimitChip action="FORFEIT" />
        {forfeitSrc && <Chip color="orange">จาก: {FORFEIT_SOURCE_LABELS[forfeitSrc] ?? forfeitSrc}</Chip>}
      </div>
    )
  }
  if (overLimit === 'PENALTY') {
    return (
      <div className="flex flex-wrap gap-1.5 items-center">
        <OverLimitChip action="PENALTY" />
        <Chip color="red">{PENALTY_TYPE_LABELS[penType] ?? penType}</Chip>
        {penType === 'FIXED'   && penAmount  != null && <Chip color="red">{penAmount.toLocaleString('en-US')} {penCurrency}</Chip>}
        {penType === 'PERCENT' && penPercent != null && <Chip color="red">{penPercent}% ของ{CALC_BASE_LABELS[calcBase] ?? calcBase}</Chip>}
      </div>
    )
  }
  return <OverLimitChip action={overLimit} />
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConditionTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [template, setTemplate] = useState<AppConditionTemplate | null>(null)
  const [deleteModal, setDeleteModal] = useState(false)

  useEffect(() => {
    const t = getConditionTemplateById(id)
    if (!t) { router.replace('/tickets/condition-templates'); return }
    setTemplate(t)
  }, [id, router])

  if (!template) return null

  const c   = template.condition
  const bp  = c.baggagePolicy
  const sp  = c.seatReductionPolicy
  const cg  = c.cancelGroupTerms
  const rt  = c.refundTerms

  // Section visibility
  const hasPayment   = c.stages.length > 0
  const hasTtl       = c.ttlRule.calcType !== 'NOT_SET'
  const hasBaggage   = bp.checkedBagStatus !== 'UNSPECIFIED' || bp.carryOnStatus !== 'UNSPECIFIED' || !!bp.remark.trim()
  const hasSeatRed   = sp.enabled
  const hasCancelGrp = cg.enabled
  const hasRefund    = rt.enabled || c.refundPolicy.enabled
  const hasExtra     = !!(c.freeTextCondition?.trim() || c.freeTextHtml?.trim())
  const hasNote      = !!c.internalNote?.trim()

  const handleDuplicate = () => {
    const dup = duplicateConditionTemplate(id)
    if (dup) router.push(`/tickets/condition-templates/${dup.templateId}`)
  }

  const handleToggleStatus = () => {
    toggleConditionTemplateStatus(id)
    setTemplate(prev => prev ? {
      ...prev,
      condition: { ...prev.condition, status: prev.condition.status === 'Active' ? 'Inactive' : 'Active' },
    } : prev)
  }

  const handleDelete = () => {
    deleteConditionTemplate(id)
    router.replace('/tickets/condition-templates')
  }

  return (
    <AppLayout title="Template Condition">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* ── Toolbar ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => router.push('/tickets/condition-templates')}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition">
            <ArrowLeft size={14} /> กลับ
          </button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" icon={<Copy size={12} />} onClick={handleDuplicate}>คัดลอก</Button>
            <Button size="sm" variant="outline" icon={<PowerOff size={12} />} onClick={handleToggleStatus}>
              {c.status === 'Active' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
            </Button>
            <Button size="sm" variant="outline" icon={<Pencil size={12} />}
              onClick={() => router.push(`/tickets/condition-templates/${id}/edit`)}>
              แก้ไข
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => setDeleteModal(true)}>ลบ</Button>
          </div>
        </div>

        {/* ── Overview ──────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-slate-400">{c.conditionCode}</span>
              <span className="text-slate-300 select-none">·</span>
              <CardTitle className="text-base">{c.conditionName}</CardTitle>
              <Badge variant={c.status === 'Active' ? 'green' : c.status === 'Draft' ? 'yellow' : 'gray'}>{c.status}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <Kv label="สายการบิน">
                {template.airlineCode
                  ? `${template.airlineCode} — ${AIRLINE_NAMES[template.airlineCode] ?? template.airlineCode}`
                  : 'ทุกสายการบิน'}
              </Kv>
              <Kv label="ประเภทตั๋ว">{template.ticketType}</Kv>
              <Kv label="สกุลเงิน">{template.currency}</Kv>
              <Kv label="จำนวนรอบชำระเงิน">
                {c.stages.length > 0 ? `${c.stages.length} งวด` : 'ยังไม่มี'}
              </Kv>
            </div>
            {c.effectiveDate && (
              <div className="mt-3 text-xs">
                <Kv label="มีผลตั้งแต่">{c.effectiveDate}</Kv>
              </div>
            )}
            {c.description && <p className="text-sm text-slate-600 mt-3">{c.description}</p>}
            <div className="text-[10px] text-slate-400 mt-3">
              สร้าง: {formatDate(template.createdAt)} · อัปเดต: {formatDate(template.updatedAt)}
            </div>
          </CardContent>
        </Card>

        {/* ── Payment Stages ────────────────────────────────────────────────── */}
        {hasPayment && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard size={14} className="text-slate-400" />
                <CardTitle>รอบชำระเงิน ({c.stages.length} งวด)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {c.stages.map(s => {
                const payLabel = s.paymentType === 'OTHER'
                  ? (s.customPaymentName || 'OTHER')
                  : (COND_PAYMENT_TYPE_LABELS[s.paymentType as keyof typeof COND_PAYMENT_TYPE_LABELS] ?? s.paymentType)
                return (
                  <div key={s.stageId} className="border border-slate-200 rounded-xl overflow-hidden">
                    {/* Stage header */}
                    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                      <span className="w-5 h-5 shrink-0 rounded-full bg-[#05a94f]/10 flex items-center justify-center text-[10px] font-bold text-[#05a94f]">
                        {s.stageNo}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">
                        {s.stageName}
                        {payLabel && (
                          <span className="ml-1.5 text-slate-500 font-normal text-xs">({payLabel})</span>
                        )}
                      </span>
                    </div>
                    {/* KV rows */}
                    <div className="divide-y divide-slate-100 bg-white py-0.5">
                      <StageRow
                        label="จำนวนเงิน"
                        value={<span className="font-semibold text-[#05a94f]">{formatStageAmount(s, template.currency)}</span>}
                      />
                      <StageRow
                        label="ใช้จำนวนจาก"
                        value={COND_QUANTITY_BASIS_LABELS[s.quantityBasis] ?? s.quantityBasis}
                      />
                      <StageRow
                        label="กำหนดชำระ"
                        value={formatDueText(s)}
                      />
                      <StageRow
                        label="นับเป็นส่วนหนึ่งของค่าตั๋ว"
                        value={s.creditTowardFare ? 'ใช่' : 'ไม่ใช่'}
                      />
                      <StageRow
                        label="คืนเงินได้หรือไม่"
                        value={COND_REFUNDABLE_LABELS[s.refundable] ?? 'ยังไม่ระบุ'}
                      />
                      {s.remark.trim() && (
                        <StageRow
                          label="หมายเหตุ"
                          value={<span className="italic text-slate-500">{s.remark}</span>}
                        />
                      )}
                    </div>
                  </div>
                )
              })}

              {/* TTL */}
              {hasTtl && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={12} className="text-slate-400" />
                    {c.issuanceMode === 'SIMULTANEOUS' ? (
                      <span className="text-xs font-semibold text-slate-600">NAME &amp; TICKET DL</span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-600">NAME DL / TICKET DL</span>
                    )}
                  </div>
                  {c.issuanceMode === 'SIMULTANEOUS' ? (
                    <>
                      <p className="text-[10px] text-emerald-700 pl-5 font-medium mb-0.5">ส่งชื่อพร้อมออกตั๋ว</p>
                      <p className="text-xs text-slate-700 pl-5">{formatTtlRule(c.ttlRule)}</p>
                    </>
                  ) : (
                    <div className="pl-5 space-y-1">
                      <p className="text-[10px] text-slate-500 font-medium mb-0.5">ส่งชื่อก่อน แล้วออกตั๋วภายหลัง</p>
                      <p className="text-xs text-slate-700">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1.5">NAME DL</span>
                        {formatTtlRule(c.ttlRule)}
                      </p>
                      <p className="text-xs text-slate-700">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1.5">TICKET DL</span>
                        {formatTtlRule(c.ticketDlRule)}
                      </p>
                    </div>
                  )}
                  {c.ttlRule.remark && <p className="text-[10px] text-slate-400 italic pl-5 mt-0.5">{c.ttlRule.remark}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Baggage ───────────────────────────────────────────────────────── */}
        {hasBaggage && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Package size={14} className="text-slate-400" />
                <CardTitle>สัมภาระ</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Summary — same text as tab preview and BaggagePreviewCard */}
              <div className={`rounded-xl px-4 py-3 border ${
                formatBaggageSummary(bp) === 'ยังไม่ระบุสัมภาระ'
                  ? 'bg-slate-50 border-slate-200'
                  : formatBaggageSummary(bp).startsWith('ไม่รวม')
                  ? 'bg-red-50 border-red-100'
                  : 'bg-cyan-50 border-cyan-100'
              }`}>
                <p className={`text-sm font-medium ${
                  formatBaggageSummary(bp) === 'ยังไม่ระบุสัมภาระ' ? 'text-slate-400 italic'
                  : formatBaggageSummary(bp).startsWith('ไม่รวม') ? 'text-red-700'
                  : 'text-cyan-900'
                }`}>
                  {formatBaggageSummary(bp)}
                </p>
              </div>

              {/* Ancillary options */}
              {(bp.canBuyExtraBaggage !== 'UNSPECIFIED' || bp.canBuySeat !== 'UNSPECIFIED' || bp.canBuyAfterTicketIssued !== 'UNSPECIFIED') && (
                <div className="grid grid-cols-3 gap-2">
                  {bp.canBuyExtraBaggage !== 'UNSPECIFIED' && (
                    <Kv label="ซื้อสัมภาระเพิ่ม">
                      <Chip color={bp.canBuyExtraBaggage === 'YES' ? 'green' : 'red'}>{ANCILLARY_LABELS[bp.canBuyExtraBaggage]}</Chip>
                    </Kv>
                  )}
                  {bp.canBuySeat !== 'UNSPECIFIED' && (
                    <Kv label="จองที่นั่ง">
                      <Chip color={bp.canBuySeat === 'YES' ? 'green' : 'red'}>{ANCILLARY_LABELS[bp.canBuySeat]}</Chip>
                    </Kv>
                  )}
                  {bp.canBuyAfterTicketIssued !== 'UNSPECIFIED' && (
                    <Kv label="ซื้อหลังออกตั๋ว">
                      <Chip color={bp.canBuyAfterTicketIssued === 'YES' ? 'green' : 'red'}>{ANCILLARY_LABELS[bp.canBuyAfterTicketIssued]}</Chip>
                    </Kv>
                  )}
                </div>
              )}
              {bp.ancillaryDetail.trim() && (
                <p className="text-xs text-slate-600">{bp.ancillaryDetail}</p>
              )}
              {bp.remark.trim() && (
                <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-2">{bp.remark}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Seat Reduction ────────────────────────────────────────────────── */}
        {hasSeatRed && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingDown size={14} className="text-slate-400" />
                <CardTitle>เงื่อนไขการลดที่นั่ง</CardTitle>
                {sp.allowReduction === 'UNSPECIFIED'
                  ? <Chip color="slate">ยังไม่กำหนดนโยบาย</Chip>
                  : <Chip color="green">อนุญาตให้ลด</Chip>}
              </div>
            </CardHeader>
            {sp.allowReduction !== 'UNSPECIFIED' && (
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Kv label="โหมด">
                    <Chip color="blue">{sp.mode === 'SINGLE' ? 'เงื่อนไขเดียว' : 'กฎขั้นบันได'}</Chip>
                  </Kv>
                  {sp.maxReducePercent != null && <Kv label="ลดได้สูงสุด">{sp.maxReducePercent}%</Kv>}
                  <Kv label="คำนวณจำนวนที่นั่งจาก">{SEAT_BASIS_LABELS[sp.basis] ?? sp.basis}</Kv>
                </div>

                {/* Notice days deadline — แสดงแยกชัดเจนจาก seat basis */}
                {sp.noticeDays != null && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <p className="text-[10px] text-slate-400 mb-0.5">Deadline การแจ้งลดที่นั่ง</p>
                    <p className="text-xs font-medium text-slate-700">
                      แจ้งลดไม่น้อยกว่า <span className="text-[#05a94f]">{sp.noticeDays} วัน</span>
                      {' '}ก่อน{SEAT_NOTICE_BASE_LABELS[sp.noticeDaysBase] ?? 'วันเดินทางวันแรก'}
                    </p>
                  </div>
                )}

                {sp.mode === 'SINGLE' && (
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1">หากเกินเงื่อนไข</p>
                    <SrPenaltySummary
                      overLimit={sp.singleOverLimitAction} forfeitSrc={sp.singleForfeitSource}
                      penType={sp.singlePenaltyType} penAmount={sp.singlePenaltyAmount}
                      penPercent={sp.singlePenaltyPercent} penCurrency={sp.singlePenaltyCurrency || template.currency}
                      calcBase={sp.singleCalcBase}
                    />
                  </div>
                )}

                {sp.mode === 'STEP_RULE' && sp.rules.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] text-slate-400">
                          <th className="text-left py-1.5 pr-3 font-medium">ช่วงเวลา</th>
                          <th className="text-left py-1.5 pr-3 font-medium">ลดสูงสุด</th>
                          <th className="text-left py-1.5 font-medium">หากเกินเงื่อนไข</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sp.rules.map(r => (
                          <tr key={r.id} className="border-b border-slate-100">
                            <td className="py-2 pr-3 text-slate-700">{formatSeatRange(r)}</td>
                            <td className="py-2 pr-3 text-slate-700">{r.maxReducePercent != null ? `${r.maxReducePercent}%` : '—'}</td>
                            <td className="py-2">
                              <SrPenaltySummary
                                overLimit={r.ruleOverLimitAction} forfeitSrc={r.forfeitSource}
                                penType={r.penaltyType} penAmount={r.penaltyAmount}
                                penPercent={r.penaltyPercent} penCurrency={r.currency || template.currency}
                                calcBase={r.calcBase}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {sp.remark.trim() && (
                  <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-2">{sp.remark}</p>
                )}
              </CardContent>
            )}
          </Card>
        )}

        {/* ── Cancel Group ──────────────────────────────────────────────────── */}
        {hasCancelGrp && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <X size={14} className="text-slate-400" />
                <CardTitle>เงื่อนไขการยกเลิกกรุ๊ป</CardTitle>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CG_POLICY_COLORS[cg.policy] ?? 'bg-slate-100 text-slate-500'}`}>
                  {CG_POLICY_LABELS[cg.policy] ?? cg.policy}
                </span>
              </div>
            </CardHeader>
            {cg.policy !== 'UNSPECIFIED' && (
              <CardContent className="space-y-3">
                {/* Deadline — ประโยคเดียวเหมือน Card ลดที่นั่ง */}
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <p className="text-[10px] text-slate-400 mb-0.5">Deadline การยกเลิกกรุ๊ป</p>
                  {cg.noticeDays != null ? (
                    <p className="text-xs font-medium text-slate-700">
                      แจ้งยกเลิกไม่น้อยกว่า{' '}
                      <span className="text-[#05a94f]">{cg.noticeDays} วัน</span>
                      {' '}ก่อน{CG_DEADLINE_BASE_LABELS[cg.deadlineBase] ?? cg.deadlineBase}
                      {cg.deadlineBase === 'CUSTOM_DATE' && cg.deadlineCustomDate && (
                        <span className="text-slate-400"> ({cg.deadlineCustomDate})</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">
                      นับจาก{CG_DEADLINE_BASE_LABELS[cg.deadlineBase] ?? cg.deadlineBase}
                      {cg.deadlineBase === 'CUSTOM_DATE' && cg.deadlineCustomDate && (
                        <span className="text-slate-400"> ({cg.deadlineCustomDate})</span>
                      )}
                    </p>
                  )}
                </div>

                {/* หากเกินเงื่อนไข */}
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">หากเกินเงื่อนไข</p>
                  <SrPenaltySummary
                    overLimit={cg.overLimitAction} forfeitSrc={cg.forfeitSource}
                    penType={cg.penaltyType} penAmount={cg.penaltyAmount}
                    penPercent={cg.penaltyPercent} penCurrency={cg.penaltyCurrency || template.currency}
                    calcBase={cg.penaltyCalcBase}
                  />
                </div>

                {/* คืนเงิน */}
                {cg.refundable !== 'UNSPECIFIED' && (
                  <Kv label="คืนเงิน">
                    <Chip color={cg.refundable === 'NON_REFUNDABLE' ? 'red' : cg.refundable === 'FULL_REFUND' ? 'green' : 'amber'}>
                      {CG_REFUNDABLE_LABELS[cg.refundable] ?? cg.refundable}
                    </Chip>
                  </Kv>
                )}

                {cg.remark.trim() && (
                  <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-2">{cg.remark}</p>
                )}
              </CardContent>
            )}
          </Card>
        )}

        {/* ── Refund Terms (v2) ─────────────────────────────────────────────── */}
        {rt.enabled && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <RefreshCcw size={14} className="text-slate-400" />
                <CardTitle>เงื่อนไขการคืนเงิน</CardTitle>
                {rt.mainPolicy && (
                  <Chip color={rt.mainPolicy === 'NON_REFUNDABLE' ? 'red' : rt.mainPolicy === 'FULL_REFUND' ? 'green' : 'amber'}>
                    {MAIN_REFUND_LABELS[rt.mainPolicy] ?? rt.mainPolicy}
                  </Chip>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {rt.noticeDaysBeforeTravel != null && (
                <Kv label="แจ้งล่วงหน้าก่อนเดินทาง">{rt.noticeDaysBeforeTravel} วัน</Kv>
              )}

              {/* Pre-ticket */}
              {rt.preTicket.enabled && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-700">ก่อนออกตั๋ว</span>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {rt.preTicket.moneyTypeRules.length > 0 && (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-[10px] text-slate-400">
                            <th className="text-left py-1 pr-3 font-medium">ประเภทเงิน</th>
                            <th className="text-left py-1 font-medium">นโยบาย</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rt.preTicket.moneyTypeRules.map((mr, i) => (
                            <tr key={i} className="border-b border-slate-50">
                              <td className="py-1.5 pr-3 text-slate-600">
                                {COND_PRE_MONEY_TYPE_LABELS[mr.moneyType] ?? mr.moneyType}
                              </td>
                              <td className="py-1.5">
                                <Chip color={mr.refundPolicy === 'NON_REFUNDABLE' ? 'red' : mr.refundPolicy === 'FULL_REFUND' ? 'green' : 'slate'}>
                                  {COND_PRE_REFUND_POLICY_LABELS[mr.refundPolicy] ?? mr.refundPolicy}
                                </Chip>
                                {mr.refundPolicy === 'PARTIAL_REFUND' && mr.refundPercent != null && (
                                  <span className="ml-1 text-slate-500">{mr.refundPercent}%</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {rt.preTicket.rules.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-400">Step Rules ({rt.preTicket.rules.length} กฎ)</p>
                        {rt.preTicket.rules.map((r, i) => (
                          <div key={r.id ?? i} className="text-[11px] text-slate-600 flex gap-2">
                            <span className="text-slate-400">
                              {r.fromDays != null ? `≥ ${r.fromDays} วัน` : ''}{r.fromDays != null && r.toDays != null ? ' — ' : ''}{r.toDays != null ? `< ${r.toDays} วัน` : ''}
                            </span>
                            <span>→ {r.refundType}</span>
                            {r.refundPercent != null && <span>{r.refundPercent}%</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Post-ticket */}
              {rt.postTicket.enabled && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">หลังออกตั๋ว</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${POST_POLICY_COLORS[rt.postTicket.refundMainPolicy] ?? 'bg-slate-100 text-slate-500'}`}>
                      {POST_POLICY_LABELS[rt.postTicket.refundMainPolicy] ?? rt.postTicket.refundMainPolicy}
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {rt.postTicket.refundableItems.length > 0 && (
                      <Kv label="รายการที่คืนได้">
                        <div className="flex flex-wrap gap-1">
                          {rt.postTicket.refundableItems.map(item => (
                            <Chip key={item} color="green">{REFUND_ITEM_LABELS[item] ?? item}</Chip>
                          ))}
                        </div>
                      </Kv>
                    )}
                    {rt.postTicket.nonRefundableItems.length > 0 && (
                      <Kv label="รายการที่คืนไม่ได้">
                        <div className="flex flex-wrap gap-1">
                          {rt.postTicket.nonRefundableItems.map(item => (
                            <Chip key={item} color="red">{REFUND_ITEM_LABELS[item] ?? item}</Chip>
                          ))}
                        </div>
                      </Kv>
                    )}
                    {rt.postTicket.penaltyMode !== 'NONE' && (
                      <Kv label="ค่าปรับ">
                        {rt.postTicket.penaltyMode === 'SINGLE' && (
                          <span>
                            {rt.postTicket.penaltySingleType === 'PERCENT'
                              ? `${rt.postTicket.penaltySingleValue ?? '?'}%`
                              : rt.postTicket.penaltySingleType === 'FIXED'
                              ? `${(rt.postTicket.penaltySingleValue ?? 0).toLocaleString('en-US')} ${rt.postTicket.refundFeeCurrency || template.currency}`
                              : rt.postTicket.penaltySingleType}
                          </span>
                        )}
                        {rt.postTicket.penaltyMode === 'STEP_RULE' && (
                          <span>{rt.postTicket.penaltyStepRules.length} ช่วง</span>
                        )}
                      </Kv>
                    )}
                    {rt.postTicket.remark.trim() && (
                      <p className="text-xs text-slate-500 italic">{rt.postTicket.remark}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Utilization */}
              {rt.utilization.enabled && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-700">เงื่อนไขการใช้ที่นั่ง (Utilization)</span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {rt.utilization.requiredPercent != null && (
                        <Kv label="ต้องใช้ขั้นต่ำ">{rt.utilization.requiredPercent}%</Kv>
                      )}
                      <Kv label="คำนวณจาก">{UTIL_BASE_LABELS[rt.utilization.calcBase] ?? rt.utilization.calcBase}</Kv>
                      <Kv label="หากไม่ถึง">
                        <Chip color={rt.utilization.exceedAction === 'NO_PENALTY' ? 'green' : 'red'}>
                          {UTIL_ACTION_LABELS[rt.utilization.exceedAction] ?? rt.utilization.exceedAction}
                        </Chip>
                      </Kv>
                      {rt.utilization.exceedAction === 'PENALTY' && rt.utilization.penaltyAmount != null && (
                        <Kv label="ค่าปรับต่อที่นั่ง">
                          {rt.utilization.penaltyAmount.toLocaleString('en-US')} {rt.utilization.penaltyCurrency || template.currency}
                        </Kv>
                      )}
                    </div>
                    {rt.utilization.remark.trim() && (
                      <p className="text-xs text-slate-500 italic mt-2">{rt.utilization.remark}</p>
                    )}
                  </div>
                </div>
              )}

              {rt.remark.trim() && (
                <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-2">{rt.remark}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Legacy Refund Policy (fallback for old data) ───────────────────── */}
        {!rt.enabled && c.refundPolicy.enabled && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <RefreshCcw size={14} className="text-slate-400" />
                <CardTitle>นโยบายคืนเงิน</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {c.refundPolicy.refundType && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold mb-2 ${COND_REFUND_TYPE_COLORS[c.refundPolicy.refundType]}`}>
                  {COND_REFUND_TYPE_LABELS[c.refundPolicy.refundType]}
                </span>
              )}
              {c.refundPolicy.description && (
                <p className="text-sm text-slate-600 mt-2">{c.refundPolicy.description}</p>
              )}
              {c.refundPolicy.tiers.length > 0 && (
                <div className="mt-3 space-y-2">
                  {c.refundPolicy.tiers.map(tier => (
                    <div key={tier.tierId} className="bg-slate-50 rounded-xl px-3 py-2 text-xs text-slate-600">
                      <span className="font-medium">{tier.name}</span>
                      {(tier.minDays !== null || tier.maxDays !== null) && (
                        <span className="text-slate-400 ml-2">
                          {tier.minDays !== null ? `> ${tier.minDays} วัน` : ''}
                          {tier.minDays !== null && tier.maxDays !== null ? ' — ' : ''}
                          {tier.maxDays !== null ? `≤ ${tier.maxDays} วัน` : ''}
                        </span>
                      )}
                      <span className="ml-3 text-green-700">คืน {tier.refundPercent}%</span>
                      {tier.deductPercent > 0 && <span className="ml-2 text-red-500">หัก {tier.deductPercent}%</span>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Extra Conditions ──────────────────────────────────────────────── */}
        {hasExtra && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-slate-400" />
                <CardTitle>เงื่อนไขเพิ่มเติม</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {c.freeTextHtml?.trim() ? (
                <div
                  className="prose prose-sm max-w-none text-slate-700 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0"
                  dangerouslySetInnerHTML={{ __html: c.freeTextHtml }}
                />
              ) : (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.freeTextCondition}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Internal Note ─────────────────────────────────────────────────── */}
        {hasNote && (
          <Card>
            <CardHeader><CardTitle>Note ภายใน</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.internalNote}</p>
            </CardContent>
          </Card>
        )}

        {/* ── Delete modal ──────────────────────────────────────────────────── */}
        <Modal
          open={deleteModal}
          onClose={() => setDeleteModal(false)}
          title="ลบ Template"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleteModal(false)}>ยกเลิก</Button>
              <Button variant="danger" onClick={handleDelete}>ลบ Template</Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">ลบ <strong>{c.conditionName}</strong> หรือไม่?</p>
        </Modal>
      </div>
    </AppLayout>
  )
}
