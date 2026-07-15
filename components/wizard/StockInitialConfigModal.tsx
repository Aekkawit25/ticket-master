'use client'

import { useState, useEffect } from 'react'
import { Plane, CreditCard, Users, Calendar, Tag } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { CurrencyCombobox } from '@/components/shared/CurrencyCombobox'
import { MASTER_AIRLINES } from '@/lib/master-data'
import { getDefaultCurrencyCode } from '@/lib/currency-storage'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StockInitialConfig {
  airlineCode: string
  currencyCode: string
  seatsPerPnr: number
  travelDurationDays: number
  priceType: 'FARE' | 'FARE_YQ' | 'ALL_IN'
}

interface Props {
  open: boolean
  /** create mode: navigate away; edit mode: cancel & close */
  onClose: () => void
  onConfirm: (config: StockInitialConfig) => void
  initial?: StockInitialConfig
  mode?: 'create' | 'edit'
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const PRICE_TYPE_LABEL: Record<string, string> = {
  FARE:    'Fare',
  FARE_YQ: 'Fare+YQ',
  ALL_IN:  'All In',
}

const PRICE_TYPES = [
  { value: 'FARE'    as const, label: 'Fare',      desc: 'Fare + Tax + YQ (แสดงแยก 3 ช่อง)' },
  { value: 'FARE_YQ' as const, label: 'Fare + YQ', desc: 'Fare + YQ เท่านั้น (ไม่มี Tax)' },
  { value: 'ALL_IN'  as const, label: 'All In',    desc: 'ราคารวมทุกอย่าง (ช่องเดียว)' },
]

const AIRLINE_OPTS = MASTER_AIRLINES.map(a => ({ value: a.code, label: `${a.code} — ${a.name}` }))

function mkDefault(): StockInitialConfig {
  return {
    airlineCode: '',
    currencyCode: getDefaultCurrencyCode(),
    seatsPerPnr: 40,
    travelDurationDays: 7,
    priceType: 'FARE',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StockInitialConfigModal({
  open, onClose, onConfirm, initial, mode = 'create',
}: Props) {
  const [form, setForm]     = useState<StockInitialConfig>(mkDefault)
  const [errors, setErrors] = useState<Partial<Record<keyof StockInitialConfig, string>>>({})

  useEffect(() => {
    if (open) {
      setForm(initial ?? mkDefault())
      setErrors({})
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const validate = (): boolean => {
    const e: Partial<Record<keyof StockInitialConfig, string>> = {}
    if (!form.airlineCode)                 e.airlineCode       = 'กรุณาเลือกสายการบิน'
    if (!form.currencyCode)                e.currencyCode      = 'กรุณาเลือกสกุลเงิน'
    if ((form.seatsPerPnr ?? 0) < 1)      e.seatsPerPnr       = 'ขั้นต่ำ 1 ที่นั่ง'
    if ((form.travelDurationDays ?? 0) < 1) e.travelDurationDays = 'ขั้นต่ำ 1 วัน'
    setErrors(e)
    return !Object.keys(e).length
  }

  const handleConfirm = () => { if (validate()) onConfirm(form) }

  const airline    = MASTER_AIRLINES.find(a => a.code === form.airlineCode)
  const priceLabel = PRICE_TYPES.find(p => p.value === form.priceType)?.label ?? ''

  const inputCls = (err?: string) => cn(
    'h-10 w-full rounded-lg border px-3 text-sm outline-none transition',
    'hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15',
    err ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white',
  )
  const errTxt = (msg?: string) => msg
    ? <p className="mt-1 text-xs text-red-500">{msg}</p>
    : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ตั้งค่าเริ่มต้น Stock"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={handleConfirm}>
            {mode === 'create' ? 'เริ่มสร้าง Stock' : 'บันทึกค่าเริ่มต้น'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {mode === 'create' && (
          <p className="text-sm text-slate-500 -mt-1">
            กำหนดค่าเริ่มต้นก่อนสร้าง Stock — สามารถแก้ไขได้ทีหลังในแต่ละขั้นตอน
          </p>
        )}

        {/* Row 1: Airline | Currency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              สายการบินหลัก <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              options={AIRLINE_OPTS}
              value={form.airlineCode}
              onChange={v => { setForm(f => ({ ...f, airlineCode: v })); setErrors(e => ({ ...e, airlineCode: '' })) }}
              placeholder="เลือก Airline..."
            />
            {errTxt(errors.airlineCode)}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              สกุลเงิน <span className="text-red-500">*</span>
            </label>
            <CurrencyCombobox
              value={form.currencyCode}
              onChange={v => { setForm(f => ({ ...f, currencyCode: v })); setErrors(e => ({ ...e, currencyCode: '' })) }}
            />
            {errTxt(errors.currencyCode)}
          </div>
        </div>

        {/* Row 2: Seats | Travel Days */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              ที่นั่ง / PNR (ค่าเริ่มต้น) <span className="text-red-500">*</span>
            </label>
            <input
              type="number" min={1}
              value={form.seatsPerPnr}
              onChange={e => setForm(f => ({ ...f, seatsPerPnr: Math.max(1, Number(e.target.value) || 1) }))}
              className={inputCls(errors.seatsPerPnr)}
            />
            {errTxt(errors.seatsPerPnr)}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              จำนวนวันเดินทาง <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={1}
                value={form.travelDurationDays}
                onChange={e => setForm(f => ({ ...f, travelDurationDays: Math.max(1, Number(e.target.value) || 1) }))}
                className={inputCls(errors.travelDurationDays)}
              />
              <span className="text-sm text-slate-500 shrink-0">วัน</span>
            </div>
            {errTxt(errors.travelDurationDays)}
          </div>
        </div>

        {/* Row 3: Price Format */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            รูปแบบราคาที่ได้รับ <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            {PRICE_TYPES.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, priceType: opt.value }))}
                className={cn(
                  'flex flex-col items-start p-3.5 rounded-xl border-2 text-left transition-all duration-150',
                  form.priceType === opt.value
                    ? 'border-[#05a94f] bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <span className={cn(
                  'text-sm font-semibold mb-0.5',
                  form.priceType === opt.value ? 'text-[#05a94f]' : 'text-slate-700'
                )}>
                  {opt.label}
                </span>
                <span className="text-xs text-slate-500 leading-relaxed">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        {form.airlineCode && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2.5">สรุปค่าเริ่มต้น</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-700">
              <span className="flex items-center gap-1.5">
                <Plane size={13} className="text-[#05a94f]" />
                <strong>{form.airlineCode}</strong>
                {airline && <span className="text-slate-400">— {airline.name}</span>}
              </span>
              <span className="flex items-center gap-1.5">
                <CreditCard size={13} className="text-[#05a94f]" />
                {form.currencyCode}
              </span>
              <span className="flex items-center gap-1.5">
                <Users size={13} className="text-[#05a94f]" />
                {form.seatsPerPnr} ที่นั่ง/PNR
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar size={13} className="text-[#05a94f]" />
                {form.travelDurationDays} วัน
              </span>
              <span className="flex items-center gap-1.5">
                <Tag size={13} className="text-[#05a94f]" />
                {priceLabel}
              </span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
