'use client'

import { useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { PlusCircle, Copy, Pencil, Trash2, ChevronDown, ChevronRight, FileText, AlertTriangle } from 'lucide-react'
import { PAYMENT_TYPE_LABELS } from '@/lib/utils'

const mockTemplates = [
  {
    id: 't1',
    template_code: 'TMPL01',
    template_name: 'มัดจำ + ชำระครั้งเดียว',
    description: 'มัดจำ 5,000 บาท แล้วชำระส่วนที่เหลือก่อนเดินทาง 14 วัน',
    status: 'Active',
    stages: [
      { stage_no: 1, stage_name: 'งวดที่ 1 — มัดจำ', payment_type: 'DEPOSIT', custom_payment_name: null, amount_type: 'FIXED_TOTAL', amount_value: 5000, payment_due_days_before: 30, payment_due_time: '18:00' },
      { stage_no: 2, stage_name: 'งวดที่ 2 — ชำระส่วนที่เหลือ', payment_type: 'REMAINING_PAYMENT', custom_payment_name: null, amount_type: 'Remaining', amount_value: 0, payment_due_days_before: 14, payment_due_time: '18:00' },
    ]
  },
  {
    id: 't2',
    template_code: 'TMPL02',
    template_name: 'มัดจำ 3 งวด + ชำระส่วนที่เหลือ',
    description: 'แบ่งมัดจำ 3 งวด 60/45/30 วัน แล้วชำระส่วนที่เหลือ 14 วันก่อนเดินทาง',
    status: 'Active',
    stages: [
      { stage_no: 1, stage_name: 'งวดที่ 1 — มัดจำ', payment_type: 'DEPOSIT', custom_payment_name: null, amount_type: 'FIXED_TOTAL', amount_value: 3000, payment_due_days_before: 60, payment_due_time: '18:00' },
      { stage_no: 2, stage_name: 'งวดที่ 2 — มัดจำ', payment_type: 'DEPOSIT', custom_payment_name: null, amount_type: 'FIXED_TOTAL', amount_value: 3000, payment_due_days_before: 45, payment_due_time: '18:00' },
      { stage_no: 3, stage_name: 'งวดที่ 3 — มัดจำ', payment_type: 'DEPOSIT', custom_payment_name: null, amount_type: 'FIXED_TOTAL', amount_value: 4000, payment_due_days_before: 30, payment_due_time: '18:00' },
      { stage_no: 4, stage_name: 'งวดที่ 4 — ชำระส่วนที่เหลือ', payment_type: 'REMAINING_PAYMENT', custom_payment_name: null, amount_type: 'Remaining', amount_value: 0, payment_due_days_before: 14, payment_due_time: '18:00' },
    ]
  },
  {
    id: 't3',
    template_code: 'TMPL03',
    template_name: 'ชำระเต็มจำนวน',
    description: 'ชำระเต็มจำนวนครั้งเดียวก่อนเดินทาง 30 วัน',
    status: 'Active',
    stages: [
      { stage_no: 1, stage_name: 'งวดที่ 1 — ชำระเต็มจำนวน', payment_type: 'FULL_PAYMENT', custom_payment_name: null, amount_type: 'Remaining', amount_value: 0, payment_due_days_before: 30, payment_due_time: '18:00' },
    ]
  },
]

export default function ConditionTemplatesPage() {
  const [expanded, setExpanded] = useState<string[]>([])
  const [modal, setModal] = useState(false)

  const toggle = (id: string) =>
    setExpanded(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  return (
    <AppLayout title="Condition Templates">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Condition Templates</h1>
          <p className="text-sm text-slate-500">แม่แบบเงื่อนไขการชำระเงิน — ใช้ Copy เพื่อนำไปใส่ใน Stock</p>
        </div>
        <Button size="sm" icon={<PlusCircle size={14} />} onClick={() => setModal(true)}>
          Add Template
        </Button>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-xs text-amber-700 mb-4">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Template เป็นแม่แบบเท่านั้น</p>
          <p>PNR ไม่สามารถผูก Template โดยตรงได้ — ต้อง Copy Template มาเป็น Condition ภายใน Stock ก่อน
            ผ่าน Add Stock Wizard Step 3</p>
        </div>
      </div>

      <div className="space-y-3">
        {mockTemplates.map(t => (
          <Card key={t.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(t.id)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggle(t.id)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {expanded.includes(t.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">{t.template_code}</span>
                    <span className="font-semibold text-slate-800">{t.template_name}</span>
                    <Badge variant="gray">{t.stages.length} Stage</Badge>
                    <Badge variant={t.status === 'Active' ? 'green' : 'gray'}>{t.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{t.description}</p>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button variant="outline" size="sm" icon={<Copy size={13} />} onClick={e => e.stopPropagation()}>
                  Copy to Stock
                </Button>
                <Button variant="ghost" size="sm" icon={<Pencil size={13} />} className="p-1.5" onClick={e => e.stopPropagation()} />
                <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} className="p-1.5 text-red-400" onClick={e => e.stopPropagation()} />
              </div>
            </div>

            {expanded.includes(t.id) && (
              <div className="border-t border-slate-100 px-5 pb-4 pt-3">
                <div className="space-y-2">
                  {t.stages.map(s => (
                    <div key={s.stage_no} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2 text-xs">
                      <span className="w-5 h-5 bg-slate-200 rounded-full flex items-center justify-center text-[11px] font-bold text-slate-500 flex-shrink-0">
                        {s.stage_no}
                      </span>
                      <span className="font-medium text-slate-700 flex-shrink-0">{s.stage_name}</span>
                      <Badge variant="gray">{PAYMENT_TYPE_LABELS[s.payment_type] || s.payment_type}</Badge>
                      <span className="text-slate-600">
                        {s.amount_type === 'Fixed' ? `${s.amount_value.toLocaleString()} THB`
                          : s.amount_type === 'Percent' ? `${s.amount_value}%`
                          : 'ส่วนที่เหลือ'}
                      </span>
                      <span className="text-slate-400">
                        Payment Due: วันเดินทางเริ่มต้น − {s.payment_due_days_before} วัน เวลา {s.payment_due_time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Condition Template"
        footer={<><Button variant="outline" onClick={() => setModal(false)}>ยกเลิก</Button><Button onClick={() => setModal(false)}>บันทึก</Button></>}>
        <div className="space-y-3">
          <Input label="Template Code" required placeholder="TMPL01" />
          <Input label="Template Name" required placeholder="ชื่อ Template" />
          <Textarea label="Description" placeholder="อธิบาย Template..." />
        </div>
      </Modal>
    </AppLayout>
  )
}
