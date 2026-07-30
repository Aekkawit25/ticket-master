'use client'

import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

interface UnsavedWarningModalProps {
  open: boolean
  onBack: () => void
  onSaveAndContinue: () => void
  onDiscardAndContinue: () => void
}

export function UnsavedWarningModal({
  open, onBack, onSaveAndContinue, onDiscardAndContinue,
}: UnsavedWarningModalProps) {
  return (
    <Modal open={open} onClose={onBack} title="มีการเปลี่ยนแปลงที่ยังไม่บันทึก" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800">
            มีการเปลี่ยนแปลงข้อมูลที่ยังไม่ได้บันทึก
            หากดำเนินการต่อโดยไม่บันทึก ข้อมูลที่แก้ไขจะหายไป
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="outline" className="w-full justify-center" onClick={onBack}>
            ย้อนกลับ (บันทึกก่อน)
          </Button>
          <Button className="w-full justify-center" onClick={onSaveAndContinue}>
            บันทึกแล้วดำเนินการต่อ
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-center text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={onDiscardAndContinue}
          >
            ดำเนินการต่อโดยไม่บันทึก
          </Button>
        </div>
      </div>
    </Modal>
  )
}
