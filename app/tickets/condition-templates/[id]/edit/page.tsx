'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Users } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardContent } from '@/components/ui/card'
import ConditionEditorModal from '@/components/condition-builder/ConditionEditorModal'
import { CurrencyCombobox } from '@/components/shared/CurrencyCombobox'
import { AirlineCombobox } from '@/components/shared/AirlineCombobox'
import {
  type AppConditionTemplate,
  type AppCondition,
} from '@/lib/condition-schema'
import { getConditionTemplateById, saveConditionTemplate, snapshotTemplateToCondition } from '@/lib/condition-storage'
import { computeUsageStats } from '@/lib/condition-usage'
import { getDemoStocks, saveDemoStock } from '@/lib/demo-storage'

type MetaConfirm = { field: 'airlineCode' | 'currency'; value: string | null }

export default function EditConditionTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [template, setTemplate] = useState<AppConditionTemplate | null>(null)
  const [metaConfirm, setMetaConfirm] = useState<MetaConfirm | null>(null)
  const [pendingCond, setPendingCond] = useState<AppCondition | null>(null)
  const [impactSeries, setImpactSeries] = useState(0)

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

  const doSave = (cond: AppCondition, bumpVersion: boolean, updateSynced: boolean) => {
    const newVersion = bumpVersion ? template.version + 1 : template.version
    const updated: AppConditionTemplate = {
      ...template,
      currency: template.currency,
      condition: {
        ...cond,
        airline:  template.airlineCode ?? cond.airline,
        currency: template.currency,
      },
      version:   newVersion,
      updatedAt: new Date().toISOString(),
    }
    saveConditionTemplate(updated)

    if (updateSynced && bumpVersion) {
      const snapshot = snapshotTemplateToCondition(updated, 'ระบบ')
      for (const stock of getDemoStocks()) {
        const idx = stock.conditions.findIndex(c =>
          c.sourceTemplateId === id &&
          !(c.overrideFields && c.overrideFields.length > 0) &&
          !c.locallyModified
        )
        if (idx < 0) continue
        const newConditions = stock.conditions.map((c, i) =>
          i === idx ? { ...snapshot, condition: { ...snapshot.condition, conditionId: c.condition.conditionId } } : c
        )
        saveDemoStock({ ...stock, conditions: newConditions, updatedAt: new Date().toISOString() })
      }
    }

    router.push(`/tickets/condition-templates/${id}`)
  }

  const handleSave = (cond: AppCondition) => {
    const stats = computeUsageStats(id)
    const seriesCount = stats.series.length
    if (seriesCount > 0) {
      setPendingCond(cond)
      setImpactSeries(seriesCount)
      return
    }
    doSave(cond, true, false)
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
                <AirlineCombobox
                  value={template.airlineCode ?? ''}
                  onChange={v => requestMetaChange('airlineCode', v === '' ? null : v)}
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

      {/* ── Impact modal: template used by Series ── */}
      {pendingCond && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-start gap-3 p-5 border-b border-slate-100">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <Users size={16} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Template นี้ถูกใช้งานอยู่</p>
                <p className="text-xs text-slate-500 mt-1">
                  มี <strong>{impactSeries} Series</strong> ที่ใช้ Template นี้
                  กรุณาเลือกวิธีบันทึก
                </p>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <button
                type="button"
                onClick={() => { doSave(pendingCond, true, false); setPendingCond(null) }}
                className="w-full text-left px-4 py-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition"
              >
                <p className="text-sm font-semibold text-blue-700">สร้าง Version ใหม่</p>
                <p className="text-xs text-blue-500 mt-0.5">ไม่กระทบ Series เดิม — Series จะเห็นป้าย "มี Version ใหม่" และอัปเดตได้เอง</p>
              </button>
              <button
                type="button"
                onClick={() => { doSave(pendingCond, true, true); setPendingCond(null) }}
                className="w-full text-left px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition"
              >
                <p className="text-sm font-semibold text-amber-700">อัปเดต Series ที่ยังไม่ปรับ</p>
                <p className="text-xs text-amber-500 mt-0.5">อัปเดต Series ที่ยัง Sync กับ Template อัตโนมัติ (Series ที่มีการปรับเองจะไม่ถูกแตะ)</p>
              </button>
              <button
                type="button"
                onClick={() => { doSave(pendingCond, false, false); setPendingCond(null) }}
                className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition"
              >
                <p className="text-sm font-semibold text-slate-700">บันทึกโดยไม่เพิ่ม Version</p>
                <p className="text-xs text-slate-400 mt-0.5">สำหรับแก้ไขตัวอักษรหรือข้อมูลเล็กน้อย Series จะไม่เห็นการเปลี่ยนแปลง</p>
              </button>
            </div>
            <div className="flex justify-end px-4 pb-4">
              <button
                type="button"
                onClick={() => setPendingCond(null)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

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
