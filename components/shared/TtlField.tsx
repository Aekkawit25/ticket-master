'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { TimeInput } from '@/components/ui/time-input'
import { calcTtlDateFromTravelAdjusted, formatTtlDisplay, type TtlType } from '@/lib/ttl-utils'
import { adjustDateForHolidays } from '@/lib/holiday-utils'
import { getActiveHolidays } from '@/lib/holiday-storage'
import { formatTravelDate } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ConditionTtlInfo {
  code: string
  name: string
  calcType: string   // 'TRAVEL_MINUS_DAYS' | 'MANUAL_DATE' | 'NOT_SET' | ...
  daysBefore?: number
  fixedDate?: string
  time?: string
}

export interface TtlFieldValue {
  ttlType: TtlType
  ttlDaysBefore: string   // string for input binding, parsed on save
  ttlDate: string
  ttlTime: string
}

interface TtlFieldProps extends TtlFieldValue {
  travelDate?: string | null
  conditionInfo?: ConditionTtlInfo | null
  error?: string | null
  onChange: (updates: Partial<TtlFieldValue>) => void
  onApplyCondition?: () => void
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const inCls = 'h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15'

// ─── Component ─────────────────────────────────────────────────────────────────

export function TtlField({ ttlType, ttlDaysBefore, ttlDate, ttlTime, travelDate, conditionInfo, error, onChange, onApplyCondition }: TtlFieldProps) {
  const holidays = useMemo(() => getActiveHolidays(), [])

  // Computed preview date for DAYS_BEFORE — holiday-adjusted (never lands on Sat/Sun or an active holiday)
  const { computedDate, holidayReason } = useMemo(() => {
    if (ttlType !== 'DAYS_BEFORE' || !travelDate || ttlDaysBefore === '') return { computedDate: null, holidayReason: null }
    const n = parseInt(ttlDaysBefore, 10)
    if (isNaN(n) || n < 0) return { computedDate: null, holidayReason: null }
    const { date, adjustment } = calcTtlDateFromTravelAdjusted(travelDate, n, holidays)
    return { computedDate: date, holidayReason: adjustment?.reason ?? null }
  }, [ttlType, travelDate, ttlDaysBefore, holidays])

  const fixedDateAdjustment = ttlType === 'FIXED_DATE' && ttlDate ? adjustDateForHolidays(ttlDate, holidays) : null

  const previewDate = ttlType === 'DAYS_BEFORE' ? computedDate : ttlType === 'FIXED_DATE' ? (fixedDateAdjustment?.adjustedDate ?? null) : null
  const previewText = previewDate ? formatTtlDisplay(previewDate, ttlTime || null) : null
  const previewHolidayReason = ttlType === 'DAYS_BEFORE' ? holidayReason : (fixedDateAdjustment?.reason ?? null)

  // Condition TTL summary text
  const condTtlLabel = conditionInfo ? (() => {
    if (conditionInfo.calcType === 'TRAVEL_MINUS_DAYS') {
      return `ก่อนวันเดินทาง ${conditionInfo.daysBefore ?? 0} วัน${conditionInfo.time ? ` เวลา ${conditionInfo.time}` : ''}`
    }
    if (conditionInfo.calcType === 'MANUAL_DATE') {
      return `วันที่กำหนดเอง${conditionInfo.fixedDate ? ` — ${formatTtlDisplay(conditionInfo.fixedDate, conditionInfo.time ?? null)}` : ''}`
    }
    return null
  })() : null

  const handleTypeChange = (newType: TtlType) => {
    onChange({ ttlType: newType, ttlDaysBefore: '', ttlDate: '', ttlTime: '' })
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-3 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-slate-700">NAME DL (Deadline)</label>
        {conditionInfo && condTtlLabel && onApplyCondition && (
          <button
            type="button"
            onClick={onApplyCondition}
            className="flex items-center gap-1 text-[10px] text-emerald-700 hover:text-emerald-900 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md transition-colors whitespace-nowrap"
          >
            <RefreshCw size={10} />
            ใช้ค่าจาก Condition
          </button>
        )}
      </div>

      {/* Type selector */}
      <div>
        <label className="block text-[11px] font-medium text-slate-500 mb-1.5">รูปแบบการกำหนด</label>
        <select
          value={ttlType}
          onChange={e => handleTypeChange(e.target.value as TtlType)}
          className={cn(inCls, 'w-full cursor-pointer appearance-none')}
        >
          <option value="NONE">ไม่ระบุ</option>
          <option value="DAYS_BEFORE">ก่อนวันเดินทาง</option>
          <option value="FIXED_DATE">วันที่กำหนดเอง</option>
        </select>
      </div>

      {/* NONE */}
      {ttlType === 'NONE' && (
        <p className="text-xs text-slate-400">PNR รายการนี้จะไม่มีการกำหนดวันส่ง NAME</p>
      )}

      {/* DAYS_BEFORE */}
      {ttlType === 'DAYS_BEFORE' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-600 shrink-0">กำหนดส่งก่อนวันเดินทาง</span>
            <input
              type="number"
              min={0}
              value={ttlDaysBefore}
              onChange={e => onChange({ ttlDaysBefore: e.target.value })}
              placeholder="30"
              style={{ width: 80 }}
              className={cn(inCls)}
            />
            <span className="text-xs text-slate-600 shrink-0">วัน</span>
            <span className="text-xs text-slate-400 shrink-0">เวลา</span>
            <TimeInput
              value={ttlTime}
              onChange={v => onChange({ ttlTime: v })}
              compact
              placeholder="HH:mm"
              className="border border-slate-300 rounded-lg bg-white w-28"
            />
          </div>
          {!travelDate && (
            <p className="text-[11px] text-amber-600">กรุณาระบุวันเดินทางก่อนกำหนด NAME DL</p>
          )}
          {travelDate && previewDate && (
            <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
              <p>วันที่ NAME DL {formatTravelDate(previewDate)}{ttlTime ? ` เวลา ${ttlTime}` : ''}</p>
              {previewHolidayReason && <p className="text-amber-600 mt-1">ⓘ {previewHolidayReason}</p>}
            </div>
          )}
          {travelDate && ttlDaysBefore !== '' && !previewDate && (
            <p className="text-[11px] text-slate-400 italic">ไม่สามารถคำนวณวันที่ได้</p>
          )}
          <p className="text-[10px] text-slate-400">ไม่ระบุเวลาได้ ระบบจะบันทึกเฉพาะวันที่ NAME DL</p>
        </div>
      )}

      {/* FIXED_DATE */}
      {ttlType === 'FIXED_DATE' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-600 shrink-0">วันที่กำหนดส่ง</span>
            <input
              type="date"
              value={ttlDate}
              onChange={e => onChange({ ttlDate: e.target.value })}
              style={{ width: 150 }}
              className={cn(inCls)}
            />
            <span className="text-xs text-slate-400 shrink-0">เวลา</span>
            <TimeInput
              value={ttlTime}
              onChange={v => onChange({ ttlTime: v })}
              compact
              placeholder="HH:mm"
              className="border border-slate-300 rounded-lg bg-white w-28"
            />
          </div>
          {previewText && (
            <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
              <p>วันที่ NAME DL {formatTravelDate(previewDate)}{ttlTime ? ` เวลา ${ttlTime}` : ''}</p>
              {previewHolidayReason && <p className="text-amber-600 mt-1">ⓘ {previewHolidayReason}</p>}
            </div>
          )}
          <p className="text-[10px] text-slate-400">ไม่ระบุเวลาได้ ระบบจะบันทึกเฉพาะวันที่ NAME DL</p>
        </div>
      )}

      {/* Validation error */}
      {error && <p className="text-[11px] text-red-500">{error}</p>}

      {/* Condition source info */}
      {conditionInfo && condTtlLabel && (
        <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
          ค่าจาก Condition <strong className="text-slate-700">{conditionInfo.code}</strong>{' '}
          — {conditionInfo.name}: <span className="text-slate-600">{condTtlLabel}</span>
        </div>
      )}
    </div>
  )
}
