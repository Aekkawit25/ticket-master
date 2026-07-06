'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import ConditionEditorModal from '@/components/condition-builder/ConditionEditorModal'
import {
  type AppConditionTemplate,
  type AppCondition,
  type CondTemplateTicketType,
  defaultTemplate,
  generateTemplateCode,
} from '@/lib/condition-schema'
import { getConditionTemplates, saveConditionTemplate } from '@/lib/condition-storage'

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

export default function AddConditionTemplatePage() {
  const router = useRouter()

  const existingCodes = getConditionTemplates().map(t => t.condition.conditionCode)
  const [template, setTemplate] = useState<AppConditionTemplate>(() =>
    defaultTemplate({
      condition: {
        ...defaultTemplate().condition,
        conditionCode: generateTemplateCode(existingCodes),
      },
    }),
  )

  const setMeta = <K extends keyof AppConditionTemplate>(k: K, v: AppConditionTemplate[K]) =>
    setTemplate(prev => ({ ...prev, [k]: v }))

  const handleSave = (cond: AppCondition) => {
    const now = new Date().toISOString()
    const toSave: AppConditionTemplate = {
      ...template,
      currency: cond.currency || template.currency,
      condition: cond,
      createdAt: now,
      updatedAt: now,
    }
    saveConditionTemplate(toSave)
    router.push('/tickets/condition-templates')
  }

  const handleSaveDraft = (cond: AppCondition) => {
    setTemplate(prev => ({ ...prev, currency: cond.currency || prev.currency, condition: cond }))
  }

  return (
    <AppLayout title="สร้าง Template Condition">
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
          title="สร้าง Condition"
          value={template.condition}
          onChange={cond => setTemplate(prev => ({ ...prev, condition: cond }))}
          currency={template.currency}
          conditionMode="template"
          templateInfo={{
            airlineCode: template.airlineCode ?? '',
            currency: template.currency,
            ticketType: template.ticketType,
          }}
          showBasicInfo
          onCancel={() => router.push('/tickets/condition-templates')}
          onSaveDraft={handleSaveDraft}
          onSave={handleSave}
        />
      </div>
    </AppLayout>
  )
}
