'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import ConditionEditorModal from '@/components/condition-builder/ConditionEditorModal'
import {
  type AppConditionTemplate,
  type AppCondition,
  type CondTemplateTicketType,
} from '@/lib/condition-schema'

import { getConditionTemplateById, saveConditionTemplate } from '@/lib/condition-storage'

const TICKET_TYPE_OPTIONS: { value: CondTemplateTicketType; label: string }[] = [
  { value: 'All',         label: 'ทุกประเภท' },
  { value: 'Group',       label: 'Group' },
  { value: 'FIT',         label: 'FIT' },
  { value: 'Ticket+Land', label: 'Ticket + Land' },
]

const AIRLINE_OPTIONS = [
  { value: '',   label: 'ทุกสายการบิน' },
  { value: 'TG', label: 'TG — Thai Airways' },
  { value: 'VZ', label: 'VZ — Thai VietJet' },
  { value: 'FD', label: 'FD — Thai AirAsia' },
  { value: 'SQ', label: 'SQ — Singapore Airlines' },
  { value: 'QR', label: 'QR — Qatar Airways' },
  { value: 'EK', label: 'EK — Emirates' },
  { value: 'MH', label: 'MH — Malaysia Airlines' },
  { value: 'CX', label: 'CX — Cathay Pacific' },
  { value: 'JL', label: 'JL — Japan Airlines' },
]

const CURRENCY_OPTIONS = [
  { value: 'THB', label: 'THB' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'JPY', label: 'JPY' },
]

export default function EditConditionTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [template, setTemplate] = useState<AppConditionTemplate | null>(null)

  useEffect(() => {
    const t = getConditionTemplateById(id)
    if (!t) { router.replace('/tickets/condition-templates'); return }
    setTemplate(t)
  }, [id, router])

  if (!template) return null

  const setMeta = <K extends keyof AppConditionTemplate>(k: K, v: AppConditionTemplate[K]) =>
    setTemplate(prev => prev ? { ...prev, [k]: v } : prev)

  const handleSave = (cond: AppCondition) => {
    const updated: AppConditionTemplate = {
      ...template,
      currency:  cond.currency || template.currency,
      condition: cond,
      version:   template.version + 1,
      updatedAt: new Date().toISOString(),
    }
    saveConditionTemplate(updated)
    router.push(`/tickets/condition-templates/${id}`)
  }

  const handleSaveDraft = (cond: AppCondition) => {
    setTemplate(prev => prev ? { ...prev, currency: cond.currency || prev.currency, condition: cond } : prev)
  }

  return (
    <AppLayout title="แก้ไข Template Condition">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Template Metadata */}
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-semibold text-slate-500 mb-3">ข้อมูล Template</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">สายการบิน</label>
                <Select
                  value={template.airlineCode ?? ''}
                  onChange={e => setMeta('airlineCode', e.target.value || null)}
                  options={AIRLINE_OPTIONS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">ประเภทตั๋ว</label>
                <Select
                  value={template.ticketType}
                  onChange={e => setMeta('ticketType', e.target.value as CondTemplateTicketType)}
                  options={TICKET_TYPE_OPTIONS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">สกุลเงิน</label>
                <Select
                  value={template.currency}
                  onChange={e => setMeta('currency', e.target.value)}
                  options={CURRENCY_OPTIONS}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Condition Editor */}
        <ConditionEditorModal
          mode="page"
          title="แก้ไข Condition"
          value={template.condition}
          onChange={cond => setTemplate(prev => prev ? { ...prev, condition: cond } : prev)}
          currency={template.currency}
          conditionMode="template"
          templateInfo={{
            airlineCode: template.airlineCode ?? '',
            currency: template.currency,
            ticketType: template.ticketType,
          }}
          showBasicInfo
          onCancel={() => router.push(`/tickets/condition-templates/${id}`)}
          onSaveDraft={handleSaveDraft}
          onSave={handleSave}
        />
      </div>
    </AppLayout>
  )
}
