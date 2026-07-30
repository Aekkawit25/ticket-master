'use client'

import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { formatDateTimeThai } from '@/lib/utils'
import { splitIsoDateTime } from '@/lib/pnr-applied-condition'
import { AlertTriangle } from 'lucide-react'

export type TtlTemplateConflictDecision = 'KEEP' | 'CHANGE'

interface TtlTemplateConflictModalProps {
  open: boolean
  templateName: string
  /** The PNR's currently-locked NAME DL, as a resolved ISO datetime. */
  currentIso: string | null
  /** What the Template's own NAME DL rule would resolve to for this PNR. */
  templateIso: string | null
  onDecide: (decision: TtlTemplateConflictDecision) => void
  onCancel: () => void
}

/**
 * Shown when a Template Condition is applied to a PNR whose NAME DL is
 * already locked, and the Template's own NAME DL would resolve to a
 * different date/time. Default emphasis is "keep existing NAME DL" —
 * changing to the Template's value requires an explicit, separate click.
 */
export function TtlTemplateConflictModal({
  open, templateName, currentIso, templateIso, onDecide, onCancel,
}: TtlTemplateConflictModalProps) {
  const current = splitIsoDateTime(currentIso)
  const template = splitIsoDateTime(templateIso)

  return (
    <Modal open={open} onClose={onCancel} title="NAME DL ไม่ตรงกับ Template Condition" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            PNR นี้มีการกำหนด NAME DL ไว้แล้ว แต่ค่าจาก Template
            <strong className="mx-1">{templateName}</strong>
            ไม่ตรงกัน — ระบบจะไม่เขียนทับ NAME DL เดิมโดยอัตโนมัติ กรุณาเลือกวิธีดำเนินการ
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">NAME DL เดิม (ล็อกไว้)</p>
            <p className="text-sm font-bold text-slate-800">{formatDateTimeThai(current.date, current.time)}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">NAME DL จาก Template</p>
            <p className="text-sm font-bold text-blue-800">{formatDateTimeThai(template.date, template.time)}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <Button onClick={() => onDecide('KEEP')} className="w-full justify-center">
            เก็บ NAME DL เดิม (แนะนำ)
          </Button>
          <Button variant="outline" onClick={() => onDecide('CHANGE')} className="w-full justify-center">
            เปลี่ยนเป็นค่าจาก Template Condition
          </Button>
          <Button variant="ghost" onClick={onCancel} className="w-full justify-center text-slate-500">
            ยกเลิก
          </Button>
        </div>
      </div>
    </Modal>
  )
}
