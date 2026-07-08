'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Lock, Check, AlertTriangle, ListChecks, Users, User, Globe } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { FlightSeriesFormData, TicketType, GroupType } from '@/types'
import { MASTER_AIRLINES } from '@/lib/master-data'
import { getCurrencySelectOptions } from '@/lib/currency-storage'
import { getStockTypeConfigSafe, STOCK_TYPE_CONFIG } from '@/lib/stock-type-config'

const AIRLINES = MASTER_AIRLINES.map(a => ({
  value: a.code,
  label: `${a.code} — ${a.name}`,
}))

// ─── Type options definition ──────────────────────────────────────────────────

interface TypeOption {
  key: string
  label: string
  ticketType: TicketType
  groupType: GroupType | undefined
  description: string
  icon: ReactNode
  selectedCls: string
  hoverCls: string
  iconCls: string
  disabled?: boolean
}

// Visual metadata per StockTypeKey (icons + colors only — text comes from STOCK_TYPE_CONFIG)
const TYPE_VISUAL = {
  GROUP_SERIES: {
    icon: <ListChecks size={18} />,
    selectedCls: 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300',
    hoverCls: 'hover:border-emerald-300 hover:bg-emerald-50/60',
    iconCls: 'text-emerald-600',
  },
  GROUP_ADHOC: {
    icon: <Users size={18} />,
    selectedCls: 'border-amber-400 bg-amber-50 ring-2 ring-amber-300',
    hoverCls: 'hover:border-amber-300 hover:bg-amber-50/60',
    iconCls: 'text-amber-600',
  },
  FIT: {
    icon: <User size={18} />,
    selectedCls: 'border-sky-400 bg-sky-50 ring-2 ring-sky-300',
    hoverCls: '',
    iconCls: 'text-sky-600',
  },
  TICKET_LAND: {
    icon: <Globe size={18} />,
    selectedCls: 'border-violet-400 bg-violet-50 ring-2 ring-violet-300',
    hoverCls: '',
    iconCls: 'text-violet-600',
  },
} as const

const TYPE_OPTIONS: TypeOption[] = [
  {
    key: 'group-series',
    label: STOCK_TYPE_CONFIG.GROUP_SERIES.displayName,
    ticketType: 'Group',
    groupType: 'SERIES',
    description: STOCK_TYPE_CONFIG.GROUP_SERIES.description,
    ...TYPE_VISUAL.GROUP_SERIES,
  },
  {
    key: 'group-adhoc',
    label: STOCK_TYPE_CONFIG.GROUP_ADHOC.displayName,
    ticketType: 'Group',
    groupType: 'ADHOC',
    description: STOCK_TYPE_CONFIG.GROUP_ADHOC.description,
    ...TYPE_VISUAL.GROUP_ADHOC,
  },
  {
    key: 'fit',
    label: STOCK_TYPE_CONFIG.FIT.displayName,
    ticketType: 'FIT',
    groupType: undefined,
    description: STOCK_TYPE_CONFIG.FIT.description,
    ...TYPE_VISUAL.FIT,
    disabled: true,
  },
  {
    key: 'ticket-land',
    label: STOCK_TYPE_CONFIG.TICKET_LAND.displayName,
    ticketType: 'Ticket + Land',
    groupType: undefined,
    description: STOCK_TYPE_CONFIG.TICKET_LAND.description,
    ...TYPE_VISUAL.TICKET_LAND,
    disabled: true,
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Step1Props {
  data: FlightSeriesFormData
  onChange: (data: Partial<FlightSeriesFormData>) => void
  errors?: Partial<Record<keyof FlightSeriesFormData, string>>
  isTypeLocked?: boolean
  typeConfirmed?: boolean
  onTypeConfirm?: () => void
}

export default function Step1StockInfo({
  data,
  onChange,
  errors = {},
  isTypeLocked = false,
  typeConfirmed = false,
  onTypeConfirm,
}: Step1Props) {
  const [currencyOptions, setCurrencyOptions] = useState<{ value: string; label: string }[]>([])
  const [pendingType, setPendingType] = useState<{ ticketType: TicketType; groupType?: GroupType } | null>(null)

  useEffect(() => {
    setCurrencyOptions(getCurrencySelectOptions())
    const handler = () => setCurrencyOptions(getCurrencySelectOptions())
    window.addEventListener('currencies_updated', handler)
    return () => window.removeEventListener('currencies_updated', handler)
  }, [])

  const isCurrentType = (opt: TypeOption) => {
    if (!typeConfirmed) return false
    if (data.ticket_type !== opt.ticketType) return false
    if (opt.groupType !== undefined) return data.group_type === opt.groupType
    return !data.group_type
  }

  const hasData = !!(data.group_name || data.airline_code)

  const applyType = (ticketType: TicketType, groupType?: GroupType) => {
    onChange({ ticket_type: ticketType, group_type: groupType })
    if (!typeConfirmed) onTypeConfirm?.()
  }

  const handleTypeClick = (opt: TypeOption) => {
    if (opt.disabled) return
    if (isCurrentType(opt)) return
    if (typeConfirmed && hasData) {
      setPendingType({ ticketType: opt.ticketType, groupType: opt.groupType })
      return
    }
    applyType(opt.ticketType, opt.groupType)
  }

  const applyPendingType = () => {
    if (!pendingType) return
    applyType(pendingType.ticketType, pendingType.groupType)
    setPendingType(null)
  }

  const lockedOpt = TYPE_OPTIONS.find(
    o => o.ticketType === data.ticket_type && o.groupType === data.group_type,
  )

  // Derive all labels/prefix from central config
  const typeConfig = getStockTypeConfigSafe(data.ticket_type, data.group_type)
  const codePrefix    = typeConfig.prefix
  const codeLabel     = typeConfig.codeLabel
  const nameLabel     = typeConfig.nameLabel
  const namePlaceholder = typeConfig.key === 'GROUP_ADHOC'
    ? 'เช่น Japan Cherry Blossom Apr 26'
    : 'เช่น Sweden Aurora Mar 26'
  const nameHelper = typeConfig.key === 'GROUP_ADHOC' ? 'ชื่อ Group Ad Hoc' : 'ชื่อ Stock หรือชื่อซีรีส์'
  const runningNumber = data.stock_code.startsWith(codePrefix)
    ? data.stock_code.slice(codePrefix.length)
    : data.stock_code

  const pendingLabel = pendingType
    ? (pendingType.ticketType === 'Group' && pendingType.groupType === 'SERIES' ? 'Group Series'
      : pendingType.ticketType === 'Group' && pendingType.groupType === 'ADHOC' ? 'Group Ad Hoc'
      : pendingType.ticketType)
    : ''

  return (
    <div className="space-y-4">
      {/* ───── ประเภท Stock ───── */}
      <Card>
        <CardHeader>
          <CardTitle>ประเภท Stock</CardTitle>
        </CardHeader>
        <CardContent>
          {isTypeLocked ? (
            /* Read-only locked card — always renders from config, never empty */
            (() => {
              const visual = TYPE_VISUAL[typeConfig.key]
              return (
                <div className={`relative p-4 rounded-xl border-2 ${visual.selectedCls}`}>
                  <span className="absolute top-2.5 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/80 text-slate-500 border border-slate-200 shadow-sm">
                    <Lock size={9} />ล็อค
                  </span>
                  <div className="flex items-start gap-3 pr-16">
                    <div className={`mt-0.5 ${visual.iconCls}`}>{visual.icon}</div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-slate-900">{typeConfig.displayName}</span>
                      <p className="text-xs text-slate-500 mt-0.5">{typeConfig.description}</p>
                    </div>
                  </div>
                </div>
              )
            })()
          ) : (
            /* Interactive 4-column type selector (1 col mobile → 2 col tablet → 4 col desktop) */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {TYPE_OPTIONS.map(opt => {
                const selected = isCurrentType(opt)
                const disabled = !!opt.disabled
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleTypeClick(opt)}
                    className={`text-left p-4 rounded-xl border-2 transition-all relative ${
                      disabled
                        ? 'border-slate-200 bg-slate-50 cursor-not-allowed'
                        : selected
                          ? opt.selectedCls
                          : `border-slate-200 bg-white ${opt.hoverCls} cursor-pointer`
                    }`}
                  >
                    {disabled && (
                      <span className="absolute top-2 right-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-400 leading-none">
                        Coming Soon
                      </span>
                    )}
                    <div className={disabled ? 'opacity-60' : undefined}>
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 ${selected ? opt.iconCls : 'text-slate-400'}`}>
                          {opt.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-semibold ${selected ? 'text-slate-900' : 'text-slate-600'}`}>
                              {opt.label}
                            </span>
                            {selected && <Check size={13} className={opt.iconCls} />}
                          </div>
                          <p className={`text-xs mt-0.5 ${selected ? 'text-slate-600' : 'text-slate-400'}`}>
                            {opt.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ───── ข้อมูลหลักของ Stock ───── */}
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลหลักของ Stock</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* ── Stock Code: prefix badge (locked) + running number (auto) ── */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">
                {codeLabel}<span className="text-red-500 ml-0.5">*</span>
              </label>
              <div className={`flex items-stretch rounded-lg border overflow-hidden ${errors.stock_code ? 'border-red-400' : 'border-slate-300'}`}>
                <span className="flex items-center px-3 bg-slate-100 border-r border-slate-200 text-sm font-bold text-slate-500 select-none whitespace-nowrap tracking-wide">
                  {codePrefix}
                </span>
                <input
                  type="text"
                  readOnly
                  value={runningNumber}
                  className="flex-1 px-3 py-2 text-sm bg-slate-50 text-slate-600 cursor-not-allowed outline-none font-mono"
                />
              </div>
              {errors.stock_code
                ? <p className="text-xs text-red-500">{errors.stock_code}</p>
                : <p className="text-xs text-slate-400">Prefix ตามประเภท Stock ไม่สามารถแก้ไขได้</p>
              }
            </div>

            <Input
              label={nameLabel}
              required
              value={data.group_name}
              onChange={e => onChange({ group_name: e.target.value })}
              error={errors.group_name}
              placeholder={namePlaceholder}
              helper={nameHelper}
            />
            <SearchableSelect
              label="Airline"
              required
              options={AIRLINES}
              value={data.airline_code}
              onChange={v => onChange({ airline_code: v })}
              placeholder="เลือกสายการบิน..."
              error={errors.airline_code}
            />
            <SearchableSelect
              label="Currency"
              required
              options={currencyOptions}
              value={data.currency}
              onChange={v => onChange({ currency: v })}
              placeholder="เลือกสกุลเงิน..."
              error={errors.currency}
            />
          </div>
        </CardContent>
      </Card>

      {/* ───── Remark ───── */}
      <Card>
        <CardContent>
          <Textarea
            label="Remark"
            value={data.remark}
            onChange={e => onChange({ remark: e.target.value })}
            placeholder="หมายเหตุเพิ่มเติม..."
            rows={2}
          />
        </CardContent>
      </Card>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        <p className="font-medium mb-1">หมายเหตุ:</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>Route จะสร้างอัตโนมัติจาก Sector ใน Step 2</li>
          <li>Period จะคำนวณอัตโนมัติจาก PNR ใน Step 4</li>
          <li>Trip Type (One-way / Round-trip / Multi-city) กำหนดได้ใน Step 2 Flight Segments</li>
          <li><strong>{nameLabel}</strong> = {typeConfig.key === 'GROUP_ADHOC' ? 'ชื่อ Group เช่น "Japan Cherry Blossom Apr 26"' : 'ชื่อ Series เช่น "Sweden Aurora Mar 26"'}</li>
          <li>Currency แสดงเฉพาะสกุลเงินที่ ACTIVE จาก Currencies Master (ISO 4217)</li>
          {(data.ticket_type === 'Group' || data.ticket_type === 'Ticket + Land') && (
            <li>{data.ticket_type} ต้องมี Sector ขั้นต่ำ 2 รายการ (Departure + Arrival)</li>
          )}
          {data.ticket_type === 'FIT' && (
            <li>FIT รองรับ One-way (1 Sector), Round-trip และ Multi-city (≥ 2 Sector)</li>
          )}
        </ul>
      </div>

      {/* Confirm type change dialog */}
      {pendingType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle size={20} className="text-amber-500 shrink-0" />
              <h3 className="font-semibold text-slate-900">เปลี่ยนประเภท Stock?</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              ข้อมูล Sectors จะถูก reset เนื่องจากประเภทที่เลือกใหม่มีรูปแบบแตกต่างกัน
              ต้องการเปลี่ยนเป็น <strong>{pendingLabel}</strong> หรือไม่?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingType(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={applyPendingType}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600"
              >
                เปลี่ยนประเภท
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
