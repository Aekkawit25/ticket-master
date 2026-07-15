'use client'

import { useState, useEffect } from 'react'
import { Plane, CreditCard, Users, Calendar, Tag, Lock, Check, ListChecks, Globe } from 'lucide-react'
import type { ReactNode } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { CurrencyCombobox } from '@/components/shared/CurrencyCombobox'
import { MASTER_AIRLINES } from '@/lib/master-data'
import { getDefaultCurrencyCode } from '@/lib/currency-storage'
import { STOCK_TYPE_CONFIG, type StockType } from '@/lib/stock-type-config'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StockInitialConfig {
  stockType: StockType
  airlineCode: string
  currencyCode: string
  seatsPerPnr: number
  travelDurationDays: number
  priceType: 'FARE' | 'FARE_YQ' | 'ALL_IN'
}

/** Form state allows '' for stockType before user selects one */
interface ModalForm {
  stockType: StockType | ''
  airlineCode: string
  currencyCode: string
  seatsPerPnr: number
  travelDurationDays: number
  priceType: 'FARE' | 'FARE_YQ' | 'ALL_IN'
}

interface Props {
  open: boolean
  /** create: navigate away on cancel  edit: close modal on cancel */
  onClose: () => void
  onConfirm: (config: StockInitialConfig) => void
  initial?: StockInitialConfig
  mode?: 'create' | 'edit'
  /** When provided, type is locked (specific menu); show badge, hide selector */
  lockedStockType?: StockType | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const PRICE_TYPE_LABEL: Record<string, string> = {
  FARE:    'Fare',
  FARE_YQ: 'Fare+YQ',
  ALL_IN:  'All In',
}

const PRICE_TYPES = [
  { value: 'FARE'    as const, label: 'Fare',      desc: 'Fare + Tax + YQ' },
  { value: 'FARE_YQ' as const, label: 'Fare + YQ', desc: 'Fare + YQ เท่านั้น' },
  { value: 'ALL_IN'  as const, label: 'All In',    desc: 'ราคารวมทุกอย่าง' },
]

const AIRLINE_OPTS = MASTER_AIRLINES.map(a => ({ value: a.code, label: `${a.code} — ${a.name}` }))

interface TypeCard {
  key: StockType
  label: string
  desc: string
  icon: ReactNode
  selectedCls: string
  hoverCls: string
  iconCls: string
}

const TYPE_CARDS: TypeCard[] = [
  {
    key: 'SERIES',
    label: STOCK_TYPE_CONFIG.SERIES.displayName,
    desc:  STOCK_TYPE_CONFIG.SERIES.description,
    icon: <ListChecks size={18} />,
    selectedCls: 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200',
    hoverCls:    'hover:border-emerald-200 hover:bg-emerald-50/60',
    iconCls:     'text-emerald-600',
  },
  {
    key: 'AD_HOC',
    label: STOCK_TYPE_CONFIG.AD_HOC.displayName,
    desc:  STOCK_TYPE_CONFIG.AD_HOC.description,
    icon: <Users size={18} />,
    selectedCls: 'border-amber-400 bg-amber-50 ring-2 ring-amber-200',
    hoverCls:    'hover:border-amber-200 hover:bg-amber-50/60',
    iconCls:     'text-amber-600',
  },
  {
    key: 'FIT',
    label: STOCK_TYPE_CONFIG.FIT.displayName,
    desc:  STOCK_TYPE_CONFIG.FIT.description,
    icon: <Plane size={18} />,
    selectedCls: 'border-sky-400 bg-sky-50 ring-2 ring-sky-200',
    hoverCls:    'hover:border-sky-200 hover:bg-sky-50/60',
    iconCls:     'text-sky-600',
  },
  {
    key: 'TICKET_ONLY',
    label: STOCK_TYPE_CONFIG.TICKET_ONLY.displayName,
    desc:  STOCK_TYPE_CONFIG.TICKET_ONLY.description,
    icon: <Globe size={18} />,
    selectedCls: 'border-violet-400 bg-violet-50 ring-2 ring-violet-200',
    hoverCls:    'hover:border-violet-200 hover:bg-violet-50/60',
    iconCls:     'text-violet-600',
  },
]

function mkDefaultForm(lockedStockType?: StockType | null): ModalForm {
  return {
    stockType:          lockedStockType ?? '',
    airlineCode:        '',
    currencyCode:       getDefaultCurrencyCode(),
    seatsPerPnr:        40,
    travelDurationDays: 7,
    priceType:          'FARE',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StockInitialConfigModal({
  open, onClose, onConfirm, initial, mode = 'create', lockedStockType,
}: Props) {
  const showTypeSelector = !lockedStockType

  const [form, setForm]     = useState<ModalForm>(() => mkDefaultForm(lockedStockType))
  const [errors, setErrors] = useState<Partial<Record<keyof ModalForm, string>>>({})

  useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({ ...initial, stockType: lockedStockType ?? initial.stockType })
    } else {
      setForm(mkDefaultForm(lockedStockType))
    }
    setErrors({})
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const validate = (): boolean => {
    const e: Partial<Record<keyof ModalForm, string>> = {}
    if (showTypeSelector && !form.stockType) e.stockType          = 'กรุณาเลือกประเภท Stock'
    if (!form.airlineCode)                   e.airlineCode        = 'กรุณาเลือกสายการบิน'
    if (!form.currencyCode)                  e.currencyCode       = 'กรุณาเลือกสกุลเงิน'
    if ((form.seatsPerPnr ?? 0) < 1)         e.seatsPerPnr        = 'ขั้นต่ำ 1 ที่นั่ง'
    if ((form.travelDurationDays ?? 0) < 1)  e.travelDurationDays = 'ขั้นต่ำ 1 วัน'
    setErrors(e)
    return !Object.keys(e).length
  }

  const handleConfirm = () => {
    if (!validate()) return
    onConfirm({ ...form, stockType: form.stockType as StockType })
  }

  const airline          = MASTER_AIRLINES.find(a => a.code === form.airlineCode)
  const priceLabel       = PRICE_TYPES.find(p => p.value === form.priceType)?.label ?? ''
  const lockedCfg        = lockedStockType ? STOCK_TYPE_CONFIG[lockedStockType] : null
  const selectedTypeCard = TYPE_CARDS.find(c => c.key === form.stockType)

  const inputCls = (err?: string) => cn(
    'h-10 w-full rounded-lg border px-3 text-sm outline-none transition',
    'hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15',
    err ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white',
  )

  const inputClsDays = (err?: string) => cn(
    'h-10 w-full rounded-lg border pl-3 pr-10 text-sm outline-none transition',
    'hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15',
    err ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white',
  )

  const errTxt = (msg?: string) => msg
    ? <p className="mt-1 text-xs text-red-500">{msg}</p>
    : null

  const canSubmit = (!showTypeSelector || !!form.stockType) && !!form.airlineCode

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ตั้งค่าเริ่มต้น Stock"
      noScroll
      style={{ width: 'min(1200px, calc(100vw - 48px))', maxWidth: 'none' }}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={handleConfirm} disabled={!canSubmit}>
            {mode === 'create' ? 'เริ่มสร้าง Stock' : 'บันทึกค่าเริ่มต้น'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* ── Locked type badge (specific menu) ── */}
        {lockedCfg && !showTypeSelector && (() => {
          const card = TYPE_CARDS.find(c => c.key === lockedStockType)
          return (
            <div className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl border-2', card?.selectedCls ?? 'border-slate-200 bg-slate-50')}>
              <div className={card?.iconCls}>{card?.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{lockedCfg.displayName}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/80 text-slate-500 border border-slate-200 shadow-sm">
                    <Lock size={9} />ประเภทที่เลือกจากเมนู
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{lockedCfg.description}</p>
              </div>
            </div>
          )
        })()}

        {/* ── Type selector (All Tickets only) ── */}
        {showTypeSelector && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              ประเภท Stock <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {TYPE_CARDS.map(card => {
                const selected = form.stockType === card.key
                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => { setForm(f => ({ ...f, stockType: card.key })); setErrors(e => ({ ...e, stockType: '' })) }}
                    className={cn(
                      'flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all duration-150',
                      selected ? card.selectedCls : `border-slate-200 bg-white ${card.hoverCls}`
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={selected ? card.iconCls : 'text-slate-400'}>{card.icon}</div>
                      {selected && <Check size={12} className="text-emerald-600" />}
                    </div>
                    <span className={cn('text-sm font-semibold', selected ? 'text-slate-900' : 'text-slate-600')}>
                      {card.label}
                    </span>
                    <span className={cn('text-xs mt-0.5 leading-snug', selected ? 'text-slate-600' : 'text-slate-400')}>
                      {card.desc}
                    </span>
                  </button>
                )
              })}
            </div>
            {errTxt(errors.stockType)}
          </div>
        )}

        {/* ── 4-column row: Airline | Currency | Seats | Travel Days ── */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'minmax(260px, 1.5fr) minmax(190px, 1fr) minmax(190px, 1fr) minmax(190px, 1fr)' }}
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              สายการบินหลัก <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              options={AIRLINE_OPTS}
              value={form.airlineCode}
              onChange={v => { setForm(f => ({ ...f, airlineCode: v })); setErrors(e => ({ ...e, airlineCode: '' })) }}
              placeholder="เลือก Airline..."
              usePortal
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              ที่นั่ง / PNR <span className="text-red-500">*</span>
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
            <div className="relative">
              <input
                type="number" min={1}
                value={form.travelDurationDays}
                onChange={e => setForm(f => ({ ...f, travelDurationDays: Math.max(1, Number(e.target.value) || 1) }))}
                className={inputClsDays(errors.travelDurationDays)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">
                วัน
              </span>
            </div>
            {errTxt(errors.travelDurationDays)}
          </div>
        </div>

        {/* ── Price Format ── */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            รูปแบบราคาที่ได้รับ <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            {PRICE_TYPES.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, priceType: opt.value }))}
                className={cn(
                  'flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all duration-150',
                  form.priceType === opt.value
                    ? 'border-[#05a94f] bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <span className={cn('text-sm font-semibold', form.priceType === opt.value ? 'text-[#05a94f]' : 'text-slate-700')}>
                  {opt.label}
                </span>
                <span className="text-xs text-slate-500 mt-0.5">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Summary ── */}
        {form.airlineCode && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">สรุปค่าเริ่มต้น</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
              {(selectedTypeCard || lockedCfg) && (
                <span className="flex items-center gap-1.5">
                  <div className={cn('shrink-0', selectedTypeCard?.iconCls ?? 'text-[#05a94f]')}>
                    {selectedTypeCard?.icon ?? <ListChecks size={13} />}
                  </div>
                  <strong>{selectedTypeCard?.label ?? lockedCfg?.displayName}</strong>
                </span>
              )}
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
