'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Save, CheckCircle2, X, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StockStatusBadge } from '@/components/ui/badge'
import WizardStepper from '@/components/wizard/WizardStepper'
import type { TicketType, StockStatus } from '@/types'

const MIN_SECTORS: Record<TicketType, string> = {
  'Group': 'ขั้นต่ำ 2 Sectors',
  'FIT': 'ขั้นต่ำ 1 Sector',
  'Ticket + Land': 'ขั้นต่ำ 2 Sectors',
}

interface WizardLayoutProps {
  step: number
  totalSteps?: number
  pageTitle: string
  subtitle: string
  ticketType?: TicketType
  stockStatus?: StockStatus
  error?: string
  saving?: boolean
  isLastStep?: boolean
  confirmDisabled?: boolean
  nextDisabled?: boolean
  cancelHref?: string
  onBack: () => void
  onNext: () => void
  onSaveDraft?: () => void
  onConfirm: () => void
  /** If provided, the status badge in the header becomes a clickable button */
  onManageStatus?: () => void
  children: React.ReactNode
}

/**
 * WizardLayout — shared shell for all wizard steps.
 *
 * Container ใช้ max-w-7xl คงที่ตลอด ไม่มีการสลับ max-width ระหว่าง Step
 * เพื่อให้ Header / Stepper / Content / Footer ไม่กระโดดเมื่อเปลี่ยน Step
 */
export default function WizardLayout({
  step,
  totalSteps = 4,
  pageTitle,
  subtitle,
  ticketType,
  stockStatus,
  error,
  saving,
  isLastStep = false,
  confirmDisabled = false,
  nextDisabled = false,
  cancelHref = '/tickets',
  onBack,
  onNext,
  onSaveDraft,
  onConfirm,
  onManageStatus,
  children,
}: WizardLayoutProps) {
  const router = useRouter()

  const saveDraftLabel = stockStatus && stockStatus !== 'Draft' ? 'บันทึกการแก้ไข' : 'Save Draft'

  return (
    <div className="max-w-[1400px] mx-auto w-full">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
            <Link href={cancelHref} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
              <ChevronLeft size={16} />
            </Link>
            <h1 className="text-lg font-bold text-slate-900 whitespace-nowrap">{pageTitle}</h1>
            {ticketType && (
              <>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#05a94f] text-white whitespace-nowrap">
                  {ticketType}
                </span>
                <span className="text-xs text-slate-500 whitespace-nowrap">{MIN_SECTORS[ticketType]}</span>
                <span
                  className="text-slate-400 hover:text-slate-600 cursor-help shrink-0"
                  title="ประเภทตั๋วถูกกำหนดจากเมนูที่เลือก หากต้องการเปลี่ยนประเภท กรุณาย้อนกลับไปเลือกเมนูใหม่"
                >
                  <Lock size={13} />
                </span>
              </>
            )}
            {stockStatus && (
              onManageStatus
                ? (
                  <button
                    type="button"
                    onClick={onManageStatus}
                    className="hover:opacity-75 transition-opacity cursor-pointer"
                    title="คลิกเพื่อจัดการสถานะ Stock"
                  >
                    <StockStatusBadge status={stockStatus} />
                  </button>
                )
                : <StockStatusBadge status={stockStatus} />
            )}
          </div>
          <p className="text-sm text-slate-500 ml-5">{subtitle}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {onSaveDraft && (
            <Button
              variant="outline"
              size="sm"
              icon={<Save size={14} />}
              loading={saving}
              onClick={onSaveDraft}
            >
              {saveDraftLabel}
            </Button>
          )}
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => router.push(cancelHref)}>Cancel</Button>
        </div>
      </div>

      {/* ── Stepper ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 shadow-sm">
        <WizardStepper currentStep={step} />
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Step Content ── */}
      <div className="mb-5">
        {children}
      </div>

      {/* ── Bottom Navigation (sticky) ── */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-sm sticky bottom-4">
        <Button
          variant="outline"
          icon={<ChevronLeft size={16} />}
          onClick={onBack}
          disabled={step === 1}
        >
          ย้อนกลับ
        </Button>

        <div className="text-xs text-slate-400">Step {step} / {totalSteps}</div>

        {isLastStep ? (
          <Button
            icon={<CheckCircle2 size={16} />}
            loading={saving}
            onClick={onConfirm}
            variant="success"
            disabled={confirmDisabled}
          >
            Confirm & Save
          </Button>
        ) : (
          <Button icon={<ChevronRight size={16} />} onClick={onNext} disabled={nextDisabled}>
            ถัดไป
          </Button>
        )}
      </div>

    </div>
  )
}
