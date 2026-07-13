'use client'

import { useState, useEffect } from 'react'
import { cn, formatTravelDate } from '@/lib/utils'
import { TimeInput } from '@/components/ui/time-input'
import { calcTtlDateFromTravel, formatTtlDisplay, type TtlType } from '@/lib/ttl-utils'

// ─── Props ─────────────────────────────────────────────────────────────────────
interface TtlEditorProps {
  pos: { top: number; left: number; width: number }
  travelDate?: string | null   // for DAYS_BEFORE calculation
  ttlType: TtlType
  ttlDaysBefore?: number | null
  ttlDate?: string | null
  ttlTime?: string | null
  onSave: (val: {
    ttlType: TtlType
    ttlDaysBefore: number | null
    ttlDate: string | null
    ttlTime: string | null
  }) => void
  onClose: () => void
}

// ─── Input style ───────────────────────────────────────────────────────────────
const inCls = 'h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15'

// ─── Component ─────────────────────────────────────────────────────────────────
export function TtlEditor({ pos, travelDate, ttlType, ttlDaysBefore, ttlDate, ttlTime, onSave, onClose }: TtlEditorProps) {
  const [type, setType] = useState<TtlType>(ttlType)
  const [daysBefore, setDaysBefore] = useState(ttlDaysBefore != null ? String(ttlDaysBefore) : '')
  const [date, setDate] = useState(ttlDate ?? '')
  const [time, setTime] = useState(ttlTime ?? '')
  const [error, setError] = useState<string | null>(null)

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Close on scroll / resize
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [onClose])

  // Computed preview date (for DAYS_BEFORE)
  const computedDate = type === 'DAYS_BEFORE' && travelDate && daysBefore !== ''
    ? calcTtlDateFromTravel(travelDate, parseInt(daysBefore, 10))
    : null

  const previewDate = type === 'DAYS_BEFORE' ? computedDate : (type === 'FIXED_DATE' ? date || null : null)
  const previewText = previewDate ? formatTtlDisplay(previewDate, time || null) : null

  const handleSave = () => {
    setError(null)
    if (type === 'NONE') {
      onSave({ ttlType: 'NONE', ttlDaysBefore: null, ttlDate: null, ttlTime: null })
      return
    }
    if (type === 'DAYS_BEFORE') {
      const n = parseInt(daysBefore, 10)
      if (daysBefore === '' || isNaN(n) || n < 0) {
        setError('กรุณาระบุจำนวนวันก่อนเดินทาง (0 ขึ้นไป)')
        return
      }
      onSave({ ttlType: 'DAYS_BEFORE', ttlDaysBefore: n, ttlDate: computedDate, ttlTime: time || null })
      return
    }
    if (type === 'FIXED_DATE') {
      if (!date) {
        setError('กรุณาระบุวันที่กำหนดส่ง NAME')
        return
      }
      onSave({ ttlType: 'FIXED_DATE', ttlDaysBefore: null, ttlDate: date, ttlTime: time || null })
      return
    }
  }

  return (
    <div
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
      className="bg-white border border-slate-200 rounded-xl shadow-2xl"
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">แก้ไขกำหนดส่ง NAME (TTL)</span>
        <button type="button" onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors text-base leading-none">×</button>
      </div>

      <div className="px-4 pt-3 pb-3 space-y-3">
        {/* Type selector */}
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1.5">รูปแบบการกำหนด</label>
          <select
            value={type}
            onChange={e => { setType(e.target.value as TtlType); setError(null) }}
            className={cn(inCls, 'w-full cursor-pointer appearance-none')}
          >
            <option value="NONE">ไม่ระบุ</option>
            <option value="DAYS_BEFORE">ก่อนวันเดินทาง</option>
            <option value="FIXED_DATE">วันที่กำหนดเอง</option>
          </select>
        </div>

        {/* Dynamic fields */}
        {type === 'NONE' && (
          <p className="text-xs text-slate-400">PNR รายการนี้จะไม่มีการกำหนดวันส่ง NAME</p>
        )}

        {type === 'DAYS_BEFORE' && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-600 shrink-0">กำหนดส่งก่อนวันเดินทาง</span>
              <input
                type="number"
                min={0}
                value={daysBefore}
                onChange={e => { setDaysBefore(e.target.value); setError(null) }}
                placeholder="30"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                style={{ width: 72 }}
                className={cn(inCls)}
              />
              <span className="text-xs text-slate-600 shrink-0">วัน</span>
              <span className="text-xs text-slate-400 shrink-0">เวลา</span>
              <TimeInput
                value={time}
                onChange={setTime}
                compact
                placeholder="HH:mm"
                className="border border-slate-300 rounded-lg bg-white w-28"
              />
            </div>
            {travelDate ? (
              previewDate ? (
                <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
                  กำหนดส่ง NAME วันที่ {formatTravelDate(previewDate)}{time ? ` เวลา ${time}` : ''}
                </p>
              ) : daysBefore !== '' ? (
                <p className="text-[11px] text-slate-400 italic">ไม่สามารถคำนวณวันที่ได้</p>
              ) : null
            ) : (
              <p className="text-[11px] text-amber-600">ไม่สามารถคำนวณ (ไม่มีวันเดินทาง)</p>
            )}
            <p className="text-[10px] text-slate-400">ไม่ระบุเวลาได้ ระบบจะบันทึกเฉพาะวันที่ TTL</p>
          </div>
        )}

        {type === 'FIXED_DATE' && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-600 shrink-0">วันที่กำหนดส่ง</span>
              <input
                type="date"
                value={date}
                onChange={e => { setDate(e.target.value); setError(null) }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                style={{ width: 150 }}
                className={cn(inCls)}
              />
              <span className="text-xs text-slate-400 shrink-0">เวลา</span>
              <TimeInput
                value={time}
                onChange={setTime}
                compact
                placeholder="HH:mm"
                className="border border-slate-300 rounded-lg bg-white w-28"
              />
            </div>
            {previewText && (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
                กำหนดส่ง NAME วันที่ {formatTravelDate(date)}{time ? ` เวลา ${time}` : ''}
              </p>
            )}
            <p className="text-[10px] text-slate-400">ไม่ระบุเวลาได้ ระบบจะบันทึกเฉพาะวันที่ TTL</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-[11px] text-red-500">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-1.5 text-xs font-semibold text-white bg-[#05a94f] hover:bg-[#048f43] rounded-lg transition-colors"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}
