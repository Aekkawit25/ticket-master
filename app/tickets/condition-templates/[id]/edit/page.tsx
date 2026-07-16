'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import ConditionEditorModal from '@/components/condition-builder/ConditionEditorModal'
import { CurrencyCombobox } from '@/components/shared/CurrencyCombobox'
import {
  type AppConditionTemplate,
  type AppCondition,
} from '@/lib/condition-schema'

import { getConditionTemplateById, saveConditionTemplate } from '@/lib/condition-storage'

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
  { value: 'CI', label: 'CI — China Airlines' },
  { value: 'NH', label: 'NH — All Nippon Airways' },
  { value: 'KE', label: 'KE — Korean Air' },
  { value: 'BR', label: 'BR — EVA Air' },
  { value: 'CA', label: 'CA — Air China' },
]

type MetaConfirm = { field: 'airlineCode' | 'currency'; value: string | null }

export default function EditConditionTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [template, setTemplate] = useState<AppConditionTemplate | null>(null)
  const [metaConfirm, setMetaConfirm] = useState<MetaConfirm | null>(null)

  useEffect(() => {
    const t = getConditionTemplateById(id)
    if (!t) { router.replace('/tickets/condition-templates'); return }
    setTemplate(t)
  }, [id, router])

  if (!template) return null

  const setMeta = <K extends keyof AppConditionTemplate>(k: K, v: AppConditionTemplate[K]) =>
    setTemplate(prev => prev ? { ...prev, [k]: v } : prev)

  const requestMetaChange = (field: 'airlineCode' | 'currency', value: string | null) => {
    setMetaConfirm({ field, value })
  }

  const confirmMetaChange = () => {
    if (!metaConfirm) return
    setMeta(metaConfirm.field as keyof AppConditionTemplate, metaConfirm.value as AppConditionTemplate[keyof AppConditionTemplate])
    setMetaConfirm(null)
  }

  const handleSave = (cond: AppCondition) => {
    const updated: AppConditionTemplate = {
      ...template,
      currency: template.currency,
      condition: {
        ...cond,
        airline:  template.airlineCode ?? cond.airline,
        currency: template.currency,
      },
      version:   template.version + 1,
      updatedAt: new Date().toISOString(),
    }
    saveConditionTemplate(updated)
    router.push(`/tickets/condition-templates/${id}`)
  }

  const handleSaveDraft = (cond: AppCondition) => {
    setTemplate(prev => prev ? {
      ...prev,
      condition: { ...cond, airline: prev.airlineCode ?? cond.airline, currency: prev.currency },
    } : prev)
  }

  return (
    <AppLayout title="แก้ไข Template Condition">
      <div className="max-w-[1400px] mx-auto space-y-4">
        {/* Template Metadata */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500">ข้อมูล Template</p>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                เงื่อนไขนี้ใช้กับ Group Booking เท่านั้น
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">สายการบิน</label>
                <Select
                  value={template.airlineCode ?? ''}
                  onChange={e => requestMetaChange('airlineCode', e.target.value || null)}
                  options={AIRLINE_OPTIONS}
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
                  onChange={v => requestMetaChange('currency', v)}
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

      {/* ── Confirmation dialog: changing airline or currency affects the condition ── */}
      {metaConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-start gap-3 p-5 border-b border-slate-100">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle size={16} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  ยืนยันการเปลี่ยน{metaConfirm.field === 'airlineCode' ? 'สายการบิน' : 'สกุลเงิน'}?
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  การเปลี่ยนแปลงนี้จะมีผลกับ Condition ทั้งหมดภายใต้ Template นี้ โดยค่า
                  {metaConfirm.field === 'airlineCode' ? 'สายการบิน' : 'สกุลเงิน'}
                  ของ Condition จะถูกปรับให้ตรงกับ Template โดยอัตโนมัติ
                </p>
              </div>
            </div>
            <div className="flex gap-2 p-4 justify-end">
              <button
                type="button"
                onClick={() => setMetaConfirm(null)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmMetaChange}
                className="px-4 py-2 text-sm rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
              >
                ยืนยันการเปลี่ยนแปลง
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
