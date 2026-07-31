// Card E ("Condition & Deadline") + Conditions tab body.
//
// Read-only summary of the real condition governing this PNR — deliberately
// NOT a re-implementation of the full Series-level condition CRUD/template UI
// that already exists at components/tickets/detail/ConditionsTab.tsx
// (reachable via the "จัดการ Condition ทั้งหมด" link below). Building a second
// full editor here would be scope creep the mockup doesn't ask for.
//
// Deadlines: only ONE real PNR-level deadline field exists (ttlDateTime, the
// project's standardized "NAME DL"). The mockup's separate "Ticketing
// Deadline (TTL)" + "Name Deadline" rows are the same real field shown once
// here, not duplicated with two different labels for one value. "Full
// Payment" below is a genuinely distinct real field — the soonest unpaid
// payment-stage due date from the PNR's own payment schedule.

import Link from 'next/link'
import { formatDateDMY, getConditionTag, type PnrListRow } from '@/lib/pnr-display'
import { COND_PAYMENT_TYPE_LABELS, COND_CALC_TYPE_LABELS, COND_DUE_TYPE_LABELS, COND_REFUND_TYPE_LABELS, COND_REFUND_TYPE_COLORS, formatStageAmount, type AppCondition } from '@/lib/condition-schema'
import type { PaymentScheduleItem } from '@/lib/demo-storage'
import { TonePill } from '@/components/pnr-detail/badges'

function dueDescription(stage: AppCondition['stages'][number]): string {
  if (stage.dueType === 'CUSTOM_DATE') return stage.dueDate ? `วันที่ ${formatDateDMY(stage.dueDate)}` : COND_DUE_TYPE_LABELS.CUSTOM_DATE
  if (stage.dueType === 'TBD') return COND_DUE_TYPE_LABELS.TBD
  const label = COND_DUE_TYPE_LABELS[stage.dueType].replace('N', String(stage.dueDays))
  const time = !stage.dueTimeUnspecified && stage.dueTime ? ` เวลา ${stage.dueTime}` : ''
  return `${label}${time}`
}

/** Next Action — สังเคราะห์จากสัญญาณจริงเดียวกับ Alert Bar ของหน้า (ไม่ใช่ field ใหม่) */
function nextActionText(hasCondition: boolean, dlTone: 'green' | 'orange' | 'red' | undefined, hasOutstanding: boolean): string {
  if (!hasCondition) return 'กำหนด Condition ให้ PNR นี้ และตรวจสอบ NAME DL'
  if (dlTone === 'red') return 'NAME DL เลยกำหนดแล้ว — ตรวจสอบและดำเนินการด่วน'
  if (dlTone === 'orange') return 'ใกล้ครบกำหนด NAME DL — ตรวจสอบความพร้อม'
  if (hasOutstanding) return 'ตรวจสอบและติดตามการชำระเงินที่ค้างอยู่'
  return 'ปกติ ไม่มีรายการที่ต้องดำเนินการเพิ่มเติม'
}

export interface ConditionSummaryCardProps {
  row: PnrListRow
  condition: AppCondition | undefined
  nextPaymentDue: PaymentScheduleItem | null
  hasOutstanding: boolean
  stockId: string
  label?: string
  /** compact = Card E (summary only) · full = Conditions tab (+ stages/refund/free text) */
  variant?: 'compact' | 'full'
}

export function ConditionSummaryCard({ row, condition, nextPaymentDue, hasOutstanding, stockId, label, variant = 'compact' }: ConditionSummaryCardProps) {
  const tag = getConditionTag(row)

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {label && (
            <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{label}</span>
          )}
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Condition & Deadline</p>
        </div>
        <Link href={`/tickets/${stockId}?tab=Conditions`} className="text-[11px] text-[#0F5EF7] hover:underline whitespace-nowrap">
          จัดการ Condition ทั้งหมดของ Series
        </Link>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Condition</span>
          <div className="flex items-center gap-1.5">
            {condition && <span className="text-xs font-mono text-slate-700">{condition.conditionCode}</span>}
            <TonePill tone={tag.tone}>{tag.label}</TonePill>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">NAME DL</span>
          <span className="text-xs font-medium text-slate-700">{row.ttlDateTime ? formatDateDMY(row.ttlDateTime) : '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">กำหนดชำระถัดไป{nextPaymentDue ? ` (${nextPaymentDue.stageName})` : ''}</span>
          <span className="text-xs font-medium text-slate-700">
            {nextPaymentDue?.ttlDatetime ? formatDateDMY(nextPaymentDue.ttlDatetime) : '—'}
          </span>
        </div>
        <div className="pt-2 mt-1 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 mb-0.5">Next Action</p>
          <p className="text-xs text-slate-700">{nextActionText(!!row.conditionCode, tag.tone === 'gray' ? undefined : tag.tone, hasOutstanding)}</p>
        </div>
      </div>

      {variant === 'full' && condition && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
          {condition.stages.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">รอบชำระ ({condition.stages.length} งวด)</p>
              <div className="space-y-2">
                {condition.stages.map(s => (
                  <div key={s.stageId} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">{s.stageName || (s.paymentType ? COND_PAYMENT_TYPE_LABELS[s.paymentType] : `งวดที่ ${s.stageNo}`)}</span>
                      <span className="font-semibold text-slate-800">{formatStageAmount(s, row.currency)}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{COND_CALC_TYPE_LABELS[s.calcType]} · ครบกำหนด: {dueDescription(s)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {condition.refundPolicy?.refundType && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">นโยบายการคืนเงิน</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${COND_REFUND_TYPE_COLORS[condition.refundPolicy.refundType]}`}>
                {COND_REFUND_TYPE_LABELS[condition.refundPolicy.refundType]}
              </span>
              {condition.refundPolicy.description && (
                <p className="text-xs text-slate-500 mt-1.5">{condition.refundPolicy.description}</p>
              )}
            </div>
          )}
          {condition.freeTextCondition && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">เงื่อนไขเพิ่มเติม</p>
              <p className="text-xs text-slate-600 whitespace-pre-wrap">{condition.freeTextCondition}</p>
            </div>
          )}
        </div>
      )}

      {variant === 'full' && !condition && (
        <div className="mt-4 pt-4 border-t border-slate-100 text-center text-xs text-slate-400 py-4">
          PNR นี้ยังไม่มี Condition — <Link href={`/tickets/${stockId}?tab=Conditions`} className="text-[#0F5EF7] hover:underline">ไปกำหนด Condition</Link>
        </div>
      )}
    </section>
  )
}
