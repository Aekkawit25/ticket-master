'use client'

import { useState } from 'react'
import { cn, formatDateThai, formatDateTimeThai } from '@/lib/utils'
import { TimeInput } from '@/components/ui/time-input'
import { calcTtlDateFromTravel, type TtlType } from '@/lib/ttl-utils'

// ─── Props ─────────────────────────────────────────────────────────────────────
interface TtlEditorProps {
  pnrCode?: string
  travelDate?: string | null      // first dep date of the PNR
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

const IN = 'h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#05a94f] focus:ring-2 focus:ring-[#05a94f]/15'
const LABEL = 'block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wide'
const SECTION = 'space-y-1.5'

// ─── Component ─────────────────────────────────────────────────────────────────
export function TtlEditor({ pnrCode, travelDate, ttlType, ttlDaysBefore, ttlDate, ttlTime, onSave, onClose }: TtlEditorProps) {
  const [type, setType] = useState<TtlType>(ttlType)
  const [daysBefore, setDaysBefore] = useState(ttlDaysBefore != null ? String(ttlDaysBefore) : '')
  const [date, setDate] = useState(ttlDate ?? '')
  const [time, setTime] = useState(ttlTime ?? '')
  const [error, setError] = useState<string | null>(null)

  // ── derived ──
  const daysNum = parseInt(daysBefore, 10)
  const daysValid = daysBefore !== '' && !isNaN(daysNum) && daysNum >= 0

  const computedDate = type === 'DAYS_BEFORE' && travelDate && daysValid
    ? calcTtlDateFromTravel(travelDate, daysNum)
    : null

  // For FIXED_DATE: validate that ttl date is not after travel date
  const fixedDateAfterTravel = type === 'FIXED_DATE' && date && travelDate && date > travelDate

  // Result shown for DAYS_BEFORE or FIXED_DATE
  const resultDate = type === 'DAYS_BEFORE' ? computedDate : (type === 'FIXED_DATE' ? (date || null) : null)
  const resultDisplay = resultDate ? formatDateTimeThai(resultDate, time || null) : null

  // ── save ──
  const handleSave = () => {
    setError(null)
    if (type === 'NONE') {
      onSave({ ttlType: 'NONE', ttlDaysBefore: null, ttlDate: null, ttlTime: null })
      return
    }
    if (type === 'DAYS_BEFORE') {
      if (!daysValid) { setError('กรุณาระบุจำนวนวัน (0 ขึ้นไป)'); return }
      if (!travelDate) { setError('ไม่สามารถคำนวณ TTL ได้ เนื่องจากยังไม่มีวันเดินทาง'); return }
      if (!computedDate) { setError('ไม่สามารถคำนวณวันที่ TTL ได้'); return }
      onSave({ ttlType: 'DAYS_BEFORE', ttlDaysBefore: daysNum, ttlDate: computedDate, ttlTime: time || null })
      return
    }
    if (type === 'FIXED_DATE') {
      if (!date) { setError('กรุณาระบุวันที่กำหนดส่ง'); return }
      if (fixedDateAfterTravel) { setError('วันที่กำหนดส่งต้องไม่เกินวันเดินทางแรก'); return }
      onSave({ ttlType: 'FIXED_DATE', ttlDaysBefore: null, ttlDate: date, ttlTime: time || null })
      return
    }
  }

  const canSave = !(
    (type === 'DAYS_BEFORE' && (!travelDate || !daysValid)) ||
    (type === 'FIXED_DATE' && (!date || !!fixedDateAfterTravel))
  )

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800 leading-snug">NAME DL (Deadline)</p>
          {pnrCode && (
            <p className="text-[11px] text-slate-400 mt-0.5">PNR: <span className="font-mono">{pnrCode}</span></p>
          )}
        </div>
        <button type="button" onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors text-base leading-none shrink-0 mt-0.5">×</button>
      </div>

      <div className="px-4 pt-3.5 pb-3 space-y-4">

        {/* ── Section 1: วิธีการกำหนด ── */}
        <div className={SECTION}>
          <label className={LABEL}>วิธีการกำหนด</label>
          <select
            value={type}
            onChange={e => { setType(e.target.value as TtlType); setError(null) }}
            className={cn(IN, 'w-full cursor-pointer appearance-none pr-7')}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
          >
            <option value="NONE">ไม่ระบุ</option>
            <option value="DAYS_BEFORE">ก่อนวันเดินทาง</option>
            <option value="FIXED_DATE">วันที่กำหนดเอง</option>
          </select>
        </div>

        {/* ── Section 2a: NONE ── */}
        {type === 'NONE' && (
          <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2.5">
            PNR รายการนี้ไม่มีการกำหนดวันส่งรายชื่อผู้โดยสาร
          </p>
        )}

        {/* ── Section 2b: DAYS_BEFORE ── */}
        {type === 'DAYS_BEFORE' && (
          <div className="space-y-3">
            {/* Travel date reference */}
            <div className={SECTION}>
              <label className={LABEL}>วันเดินทางที่ใช้อ้างอิง</label>
              {travelDate ? (
                <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  <p className="text-sm font-semibold text-slate-700">{formatDateThai(travelDate)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">คำนวณจากวันเดินทางแรกของ PNR</p>
                </div>
              ) : (
                <div className="bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                  <p className="text-xs text-amber-700">กรุณาระบุวันเดินทางของ Sector แรกก่อนกำหนด NAME DL</p>
                </div>
              )}
            </div>

            {/* Days + time on one row */}
            <div className={SECTION}>
              <label className={LABEL}>กำหนดส่งล่วงหน้า</label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="number"
                  min={0}
                  value={daysBefore}
                  onChange={e => { setDaysBefore(e.target.value); setError(null) }}
                  placeholder="30"
                  autoFocus
                  disabled={!travelDate}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                  style={{ width: 80 }}
                  className={cn(IN, !travelDate && 'opacity-40 cursor-not-allowed')}
                />
                <span className="text-sm text-slate-600 shrink-0">วัน</span>
                <span className="text-sm text-slate-400 shrink-0 ml-2">เวลา</span>
                <TimeInput
                  value={time}
                  onChange={setTime}
                  compact
                  placeholder="HH:mm"
                  disabled={!travelDate}
                  className={cn('border border-slate-200 rounded-lg bg-white w-[100px]', !travelDate && 'opacity-40')}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Section 2c: FIXED_DATE ── */}
        {type === 'FIXED_DATE' && (
          <div className={SECTION}>
            <label className={LABEL}>วันที่กำหนดส่ง</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={date}
                onChange={e => { setDate(e.target.value); setError(null) }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                style={{ width: 160 }}
                className={IN}
              />
              <span className="text-sm text-slate-400 shrink-0">เวลา</span>
              <TimeInput
                value={time}
                onChange={setTime}
                compact
                placeholder="HH:mm"
                className="border border-slate-200 rounded-lg bg-white w-[100px]"
              />
            </div>
            {fixedDateAfterTravel && travelDate && (
              <p className="text-[11px] text-red-500 mt-1.5">
                วันที่กำหนดส่งต้องไม่เกินวันเดินทาง ({formatDateThai(travelDate)})
              </p>
            )}
          </div>
        )}

        {/* ── Section 3: ผลลัพธ์ ── */}
        {(type === 'DAYS_BEFORE' || type === 'FIXED_DATE') && (
          <div>
            <label className={LABEL}>ผลลัพธ์</label>
            {resultDisplay ? (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
                <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide mb-0.5">กำหนดส่ง NAME DL</p>
                <p className="text-base font-bold text-emerald-800 leading-tight">{resultDisplay}</p>
                {type === 'DAYS_BEFORE' && daysValid && (
                  <p className="text-[10px] text-emerald-600 mt-0.5">ก่อนวันเดินทาง {daysNum} วัน</p>
                )}
                {type === 'FIXED_DATE' && (
                  <p className="text-[10px] text-emerald-600 mt-0.5">วันที่กำหนดเอง</p>
                )}
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
                <p className="text-xs text-slate-400">
                  {type === 'DAYS_BEFORE' && !travelDate ? 'ไม่มีวันเดินทางอ้างอิง' :
                   type === 'DAYS_BEFORE' && !daysValid ? 'กรอกจำนวนวันเพื่อดูผลลัพธ์' :
                   'กรอกข้อมูลเพื่อดูผลลัพธ์'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <p className="text-[11px] text-red-500">{error}</p>
        )}

        {/* ── Actions ── */}
        <div className="flex justify-end gap-2 pt-1">
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
            disabled={!canSave}
            className={cn(
              'px-4 py-1.5 text-xs font-semibold text-white rounded-lg transition-colors',
              canSave ? 'bg-[#05a94f] hover:bg-[#048f43]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            )}
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}
