'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardContent } from '@/components/ui/card'
import ConditionEditorModal from '@/components/condition-builder/ConditionEditorModal'
import { CurrencyCombobox } from '@/components/shared/CurrencyCombobox'
import { AirlineCombobox } from '@/components/shared/AirlineCombobox'
import {
  type AppConditionTemplate,
  type AppCondition,
  defaultTemplate,
  generateCondCode,
} from '@/lib/condition-schema'
import { getConditionTemplates, saveConditionTemplate } from '@/lib/condition-storage'

export default function AddConditionTemplatePage() {
  const router = useRouter()
  const [isMounted, setIsMounted] = useState(false)
  const [template, setTemplate] = useState<AppConditionTemplate>(() => defaultTemplate({ ticketType: 'Group' }))
  const [airlineError, setAirlineError] = useState('')

  // Initial mount
  useEffect(() => { setIsMounted(true) }, [])

  // Preview conditionCode whenever airlineCode changes
  useEffect(() => {
    const airline = template.airlineCode
    if (!airline) {
      setTemplate(prev => ({ ...prev, condition: { ...prev.condition, conditionCode: '' } }))
      return
    }
    const existingCodes = getConditionTemplates().map(t => t.condition.conditionCode)
    const preview = generateCondCode(airline, existingCodes)
    setTemplate(prev => ({ ...prev, condition: { ...prev.condition, conditionCode: preview } }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.airlineCode])

  const setMeta = <K extends keyof AppConditionTemplate>(k: K, v: AppConditionTemplate[K]) =>
    setTemplate(prev => ({ ...prev, [k]: v }))

  if (!isMounted) return null

  const handleSave = (cond: AppCondition) => {
    if (!template.airlineCode) {
      setAirlineError('กรุณาเลือกสายการบิน')
      return
    }
    const now = new Date().toISOString()
    // Generate final code fresh at save time (prevent race / duplicate)
    const existingCodes = getConditionTemplates().map(t => t.condition.conditionCode)
    const finalCode = generateCondCode(template.airlineCode, existingCodes)
    const toSave: AppConditionTemplate = {
      ...template,
      currency: template.currency,
      condition: {
        ...cond,
        conditionCode: finalCode,
        airline:  template.airlineCode,
        currency: template.currency,
      },
      createdAt: now,
      updatedAt: now,
    }
    saveConditionTemplate(toSave)
    router.push('/tickets/condition-templates')
  }

  const handleSaveDraft = (cond: AppCondition) => {
    setTemplate(prev => ({
      ...prev,
      condition: { ...cond, airline: prev.airlineCode ?? cond.airline, currency: prev.currency },
    }))
  }

  return (
    <AppLayout title="สร้าง Template Condition">
      <div className="max-w-[1400px] mx-auto space-y-4">
        {/* Template Metadata */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500">ข้อมูล Template</p>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                ใช้สำหรับ Group Booking ของสายการบินที่เลือก
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <AirlineCombobox
                  label="สายการบิน"
                  required
                  showAllOption={false}
                  buttonPlaceholder="เลือกสายการบิน"
                  value={template.airlineCode ?? ''}
                  onChange={v => {
                    setMeta('airlineCode', v || null)
                    if (v) setAirlineError('')
                  }}
                  error={airlineError}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">ประเภทตั๋ว</label>
                <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3">
                  <span className="text-sm font-semibold text-[#05a94f]">Group</span>
                  <span className="text-[10px] text-slate-400 ml-auto">Series / Ad Hoc</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">สกุลเงิน</label>
                <CurrencyCombobox
                  value={template.currency}
                  onChange={v => setMeta('currency', v)}
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
