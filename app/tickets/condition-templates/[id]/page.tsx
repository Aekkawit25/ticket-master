'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Pencil, Copy, PowerOff, Trash2, ArrowLeft } from 'lucide-react'
import {
  type AppConditionTemplate,
  COND_REFUND_TYPE_LABELS,
  COND_REFUND_TYPE_COLORS,
  formatStageAmount,
  formatTtlRule,
  COND_DUE_TYPE_LABELS,
  COND_CALC_TYPE_LABELS,
} from '@/lib/condition-schema'
import {
  getConditionTemplateById,
  deleteConditionTemplate,
  duplicateConditionTemplate,
  toggleConditionTemplateStatus,
} from '@/lib/condition-storage'
import { formatDate } from '@/lib/utils'

const AIRLINE_NAMES: Record<string, string> = {
  TG: 'Thai Airways', VZ: 'Thai VietJet', FD: 'Thai AirAsia',
  SQ: 'Singapore Airlines', QR: 'Qatar Airways', EK: 'Emirates',
  MH: 'Malaysia Airlines', CX: 'Cathay Pacific', JL: 'Japan Airlines',
}

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

  const c = template.condition

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
        {/* Header */}
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
            <Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => setDeleteModal(true)}>
              ลบ
            </Button>
          </div>
        </div>

        {/* Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm text-slate-400">{c.conditionCode}</span>
              <CardTitle>{c.conditionName}</CardTitle>
              <Badge variant={c.status === 'Active' ? 'green' : 'gray'}>{c.status}</Badge>
              {(c as any).baggagePolicy?.enabled && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 font-medium border border-cyan-100">สัมภาระ</span>
              )}
              {(c as any).seatReductionPolicy?.allowReduction && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium border border-purple-100">ลดที่นั่ง</span>
              )}
              {((c as any).freeTextCondition?.trim() || (c as any).freeTextHtml?.trim()) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium border border-orange-100">เงื่อนไขเพิ่มเติม</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-slate-400 mb-0.5">สายการบิน</p>
                <p className="font-medium text-slate-700">
                  {template.airlineCode ? `${template.airlineCode} — ${AIRLINE_NAMES[template.airlineCode] ?? template.airlineCode}` : 'ทุกสายการบิน'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 mb-0.5">ประเภทตั๋ว</p>
                <p className="font-medium text-slate-700">{template.ticketType}</p>
              </div>
              <div>
                <p className="text-slate-400 mb-0.5">สกุลเงิน</p>
                <p className="font-medium text-slate-700">{template.currency}</p>
              </div>
              <div>
                <p className="text-slate-400 mb-0.5">Version</p>
                <p className="font-medium text-slate-700">v{template.version}</p>
              </div>
            </div>
            {c.description && <p className="text-sm text-slate-600 mt-3">{c.description}</p>}
            <div className="text-[10px] text-slate-400 mt-3 flex gap-3">
              <span>สร้าง: {formatDate(template.createdAt)}</span>
              <span>อัปเดต: {formatDate(template.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Payment Stages */}
        <Card>
          <CardHeader>
            <CardTitle>รอบชำระเงิน ({c.stages.length} งวด)</CardTitle>
          </CardHeader>
          <CardContent>
            {c.stages.length === 0 ? (
              <p className="text-sm text-slate-400 italic">ไม่มีรอบชำระเงิน</p>
            ) : (
              <div className="space-y-2">
                {c.stages.map(s => (
                  <div key={s.stageId} className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[11px] font-bold text-slate-500">
                        {s.stageNo}
                      </span>
                      <span className="font-semibold text-slate-800 text-sm">{s.stageName}</span>
                      <span className="ml-auto text-xs font-semibold text-[#05a94f]">{formatStageAmount(s, template.currency)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 pl-8">
                      <span>วิธีคิด: {COND_CALC_TYPE_LABELS[s.calcType]}</span>
                      <span>กำหนด: {COND_DUE_TYPE_LABELS[s.dueType]}{['TRAVEL_MINUS_DAYS','CREATED_PLUS_DAYS','PREV_DUE_PLUS_DAYS','PREV_PAID_PLUS_DAYS'].includes(s.dueType) ? ` ${s.dueDays} วัน เวลา ${s.dueTime}` : ''}</span>
                      {s.creditTowardFare && <span className="text-blue-600">✓ นับเป็นค่าตั๋ว</span>}
                      {s.nonRefundable && <span className="text-red-500">✕ คืนไม่ได้</span>}
                      {s.remark && <span className="text-slate-400 italic">{s.remark}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* TTL */}
        <Card>
          <CardHeader><CardTitle>กำหนดส่งรายชื่อ (TTL)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700">{formatTtlRule(c.ttlRule)}</p>
          </CardContent>
        </Card>

        {/* Refund Policy */}
        {c.refundPolicy.enabled && (
          <Card>
            <CardHeader><CardTitle>นโยบายคืนเงิน</CardTitle></CardHeader>
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

        {/* Notes */}
        {(c.freeTextCondition || c.internalNote) && (
          <Card>
            <CardHeader><CardTitle>หมายเหตุ</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {c.freeTextCondition && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">เงื่อนไขทั่วไป</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.freeTextCondition}</p>
                </div>
              )}
              {c.internalNote && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Note ภายใน</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.internalNote}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Delete modal */}
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
