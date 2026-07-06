import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

const STEPS = [
  { no: 1, label: 'Stock Info' },
  { no: 2, label: 'Flight Segments' },
  { no: 3, label: 'Conditions' },
  { no: 4, label: 'PNR & Seats' },
  { no: 5, label: 'Review & Save' },
]

interface WizardStepperProps {
  currentStep: number
}

export default function WizardStepper({ currentStep }: WizardStepperProps) {
  return (
    <div className="flex items-center w-full overflow-x-auto pb-2">
      {STEPS.map((step, idx) => {
        const done = currentStep > step.no
        const active = currentStep === step.no
        return (
          <div key={step.no} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all',
                  done ? 'step-done' : active ? 'step-active border-2' : 'step-pending'
                )}
              >
                {done ? <Check size={14} /> : step.no}
              </div>
              <span
                className={cn(
                  'text-xs mt-1 text-center whitespace-nowrap font-medium',
                  active ? 'text-[#05a94f]' : done ? 'text-slate-600' : 'text-slate-400'
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn('h-0.5 flex-1 mx-2 rounded-full transition-all', done ? 'bg-[#05a94f]' : 'bg-slate-200')} />
            )}
          </div>
        )
      })}
    </div>
  )
}
