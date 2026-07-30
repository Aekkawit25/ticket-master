'use client'

import { useState, useEffect, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { parseISO, isValid } from 'date-fns'
import { formatDate, buildRouteText } from '@/lib/utils'
import { calcTtlDateFromTravelAdjusted, type TtlType } from '@/lib/ttl-utils'
import { adjustDateForHolidays } from '@/lib/holiday-utils'
import { getActiveHolidays } from '@/lib/holiday-storage'
import type { PnrFormValues, PnrModalFlightSet, PnrModalCondition, PnrSectorRow } from '@/lib/pnr-shared-utils'
import { EMPTY_PNR_FORM, validatePnrFormValues, buildSectorRows } from '@/lib/pnr-shared-utils'
import { TimeInput } from '@/components/ui/time-input'
import type { DemoStock } from '@/lib/demo-storage'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SinglePnrMode = 'add_to_series' | 'edit_pnr' | 'create_stock'

export interface SinglePnrModalProps {
  open: boolean
  onClose: () => void
  mode: SinglePnrMode
  flightSets: PnrModalFlightSet[]
  conditions: PnrModalCondition[]
  currency: string
  defaultSeatTotal?: number
  defaultFlightSetId?: string
  defaultConditionCode?: string
  initialValues?: Partial<PnrFormValues>
  stock?: DemoStock
  stockTitle?: string
  onConfirm: (values: PnrFormValues) => Promise<void>
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({
  label, error, required, hint, children,
}: {
  label: string; error?: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-0.5 text-[11px] text-red-500">{error}</p>}
      {hint && !error && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

function displayFsName(name: string) {
  return name === 'Default' ? 'ชุดเที่ยวบินหลัก' : name
}

const TH_BASE = 'px-2 font-semibold text-[11px] text-slate-500 whitespace-nowrap align-middle'

function SectorTable({ rows }: { rows: PnrSectorRow[] }) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-x-auto">
      <table className="text-[11px] border-collapse" style={{ minWidth: 597, width: '100%' }}>
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200" style={{ height: 34 }}>
            <th className={`${TH_BASE} text-center`}   style={{ minWidth: 32,  width: 32  }}>#</th>
            <th className={`${TH_BASE} text-left`}     style={{ minWidth: 56              }}>ประเภท</th>
            <th className={`${TH_BASE} text-left`}     style={{ minWidth: 100             }}>เส้นทาง</th>
            <th className={`${TH_BASE} text-left`}     style={{ minWidth: 75              }}>เที่ยวบิน</th>
            <th className={`${TH_BASE} text-center`}   style={{ minWidth: 88,  width: 88  }}>Dep Date</th>
            <th className={`${TH_BASE} text-center`}   style={{ minWidth: 68,  width: 68  }}>Dep Time</th>
            <th className={`${TH_BASE} text-center`}   style={{ minWidth: 88,  width: 88  }}>Arr Date</th>
            <th className={`${TH_BASE} text-center`}   style={{ minWidth: 90,  width: 90  }}>Arr Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const typeColor = r.sectorType === 'Departure'
              ? 'bg-green-100 text-green-700'
              : r.sectorType === 'Arrival'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-amber-100 text-amber-700'
            return (
              <tr key={r.sectorId} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-1.5 text-center text-slate-400 font-mono whitespace-nowrap">{r.seq}</td>
                <td className="px-2 py-1.5 text-left whitespace-nowrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${typeColor}`}>
                    {(r.sectorType === 'Arrival' ? 'Return' : r.sectorType).slice(0, 3).toUpperCase()}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-left font-mono font-medium text-slate-700 whitespace-nowrap">
                  {r.depAirportCode && r.arrAirportCode
                    ? `${r.depAirportCode} → ${r.arrAirportCode}`
                    : '—'}
                </td>
                <td className="px-2 py-1.5 text-left font-mono text-slate-600 whitespace-nowrap">
                  {r.airlineCode
                    ? `${r.airlineCode}${r.flightNo || '—'}`
                    : '—'}
                </td>
                <td className="px-2 py-1.5 text-center font-mono text-slate-600 whitespace-nowrap">
                  {r.depDate ? formatDate(r.depDate) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-2 py-1.5 text-center text-slate-600 whitespace-nowrap">
                  {r.depTime || <span className="text-slate-300">—</span>}
                </td>
                <td className="px-2 py-1.5 text-center font-mono text-slate-600 whitespace-nowrap">
                  {r.arrDate ? formatDate(r.arrDate) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-2 py-1.5 text-slate-600">
                  <div style={{ display: 'grid', gridTemplateColumns: '44px 22px', columnGap: 4, alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}>
                    <span style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                      {r.arrTime || <span className="text-slate-300">—</span>}
                    </span>
                    <div style={{ width: 22, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                         aria-hidden={r.arrDayOffset <= 0 ? true : undefined}>
                      {r.arrDayOffset > 0 && (
                        <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded"
                              style={{ display: 'inline-block', width: 20, textAlign: 'center', lineHeight: '1.4' }}>
                          +{r.arrDayOffset}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function SinglePnrModal({
  open, onClose, mode,
  flightSets, conditions, currency,
  defaultSeatTotal, defaultFlightSetId, defaultConditionCode,
  initialValues, stock, stockTitle,
  onConfirm,
}: SinglePnrModalProps) {
  const [values, setValues] = useState<PnrFormValues>(EMPTY_PNR_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const fs0 = flightSets[0]

  useEffect(() => {
    if (!open) return
    const fsId = initialValues?.flightSetId || defaultFlightSetId || fs0?.flightSetId || ''
    const condCode = initialValues?.conditionCode
      ?? defaultConditionCode
      ?? (conditions.length === 1 ? conditions[0].code : '')
    setValues({
      ...EMPTY_PNR_FORM,
      flightSetId: fsId,
      seatTotal: initialValues?.seatTotal ?? (defaultSeatTotal ? String(defaultSeatTotal) : ''),
      conditionCode: condCode,
      priceFormat: initialValues?.priceFormat ?? 'FARE',
      ...initialValues,
    })
    setErrors({})
    setSaveError('')
    setSaving(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const patch = useCallback((next: Partial<PnrFormValues>) => {
    setValues(prev => ({ ...prev, ...next }))
    setErrors(prev => {
      const copy = { ...prev }
      Object.keys(next).forEach(k => delete copy[k])
      return copy
    })
    setSaveError('')
  }, [])

  // Auto-fill TTL when condition changes (only if condition has a TTL rule)
  useEffect(() => {
    if (!values.conditionCode) return
    const cond = conditions.find(c => c.code === values.conditionCode)
    if (!cond?.ttlRule) return
    const { calcType, daysBefore, fixedDate, time } = cond.ttlRule
    if (calcType === 'TRAVEL_MINUS_DAYS' && daysBefore != null) {
      patch({ ttlType: 'DAYS_BEFORE', ttlDaysBefore: String(daysBefore), ttlTime: time || '' })
    } else if (calcType === 'FIXED_DATE' && fixedDate) {
      patch({ ttlType: 'FIXED_DATE', ttlDate: fixedDate, ttlTime: time || '' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.conditionCode])

  const selectedFS = flightSets.find(f => f.flightSetId === values.flightSetId) ?? fs0
  const sectorRows: PnrSectorRow[] = buildSectorRows(selectedFS?.sectors ?? [], values.travelStart)

  const routeText = selectedFS
    ? buildRouteText(selectedFS.sectors.map(s => ({
        dep_airport_code: s.depAirportCode ?? '',
        arr_airport_code: s.arrAirportCode ?? '',
      })))
    : ''

  const totalDays = (() => {
    if (!sectorRows.length) return null
    const firstDep = sectorRows[0].depDate
    const lastArr  = sectorRows[sectorRows.length - 1].arrDate
    if (!firstDep || !lastArr) return null
    try {
      const d0 = parseISO(firstDep)
      const dN = parseISO(lastArr)
      if (isValid(d0) && isValid(dN)) return Math.round((dN.getTime() - d0.getTime()) / 86400000) + 1
    } catch { /* ignore */ }
    return null
  })()

  const activeHolidays = getActiveHolidays()
  const { ttlDisplayDate, ttlHolidayReason } = (() => {
    if (values.ttlType === 'FIXED_DATE' && values.ttlDate) {
      const adj = adjustDateForHolidays(values.ttlDate, activeHolidays)
      return { ttlDisplayDate: adj.adjustedDate, ttlHolidayReason: adj.reason }
    }
    if (values.ttlType === 'DAYS_BEFORE' && values.ttlDaysBefore && values.travelStart) {
      const n = parseInt(values.ttlDaysBefore, 10)
      if (!isNaN(n) && n >= 0) {
        const { date, adjustment } = calcTtlDateFromTravelAdjusted(values.travelStart, n, activeHolidays)
        return { ttlDisplayDate: date, ttlHolidayReason: adjustment?.reason ?? null }
      }
    }
    return { ttlDisplayDate: null, ttlHolidayReason: null }
  })()

  const handleConfirm = async () => {
    const errs = validatePnrFormValues(values, { stock })
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    setSaveError('')
    try {
      await onConfirm(values)
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่')
      setSaving(false)
    }
  }

  const isEdit = mode === 'edit_pnr'

  const title = isEdit
    ? `แก้ไข PNR${stockTitle ? ` — ${stockTitle}` : ''}`
    : `เพิ่ม PNR${stockTitle ? ` — ${stockTitle}` : ''}`

  const cls = (field: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${
      errors[field] ? 'border-red-300 focus:ring-red-400/30' : 'border-slate-300'
    }`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการเปลี่ยนแปลง' : 'เพิ่ม PNR'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {saveError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {saveError}
          </div>
        )}

        {/* Flight Set selector (multi-flightset only) */}
        {flightSets.length > 1 && (
          <Field label="Flight Set">
            <select
              value={values.flightSetId}
              onChange={e => patch({ flightSetId: e.target.value })}
              className={cls('flightSetId')}
            >
              {flightSets.map(fs => (
                <option key={fs.flightSetId} value={fs.flightSetId}>
                  {displayFsName(fs.flightSetName)}
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* Flight Set summary */}
        {selectedFS && (
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xs font-semibold text-slate-700">{displayFsName(selectedFS.flightSetName)}</span>
              {routeText && (
                <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                  {routeText}
                </span>
              )}
              <span className="text-[10px] text-slate-400">{selectedFS.sectors.length} Sectors</span>
              {totalDays != null && (
                <span className="text-[10px] text-slate-400">{totalDays} วัน</span>
              )}
              {!values.travelStart && (
                <span className="text-[10px] text-slate-300 italic">ระบุวันเดินทางเริ่มต้นเพื่อดูวันที่</span>
              )}
            </div>
            <SectorTable rows={sectorRows} />
          </div>
        )}

        {/* PNR Code + วันเดินทางเริ่มต้น */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="PNR Code" error={errors.pnrCode}>
            <input
              type="text"
              value={values.pnrCode}
              onChange={e => patch({ pnrCode: e.target.value.toUpperCase() })}
              placeholder="เว้นว่าง = สร้าง Dummy อัตโนมัติ"
              className={cls('pnrCode')}
            />
          </Field>
          <Field label="วันเดินทางเริ่มต้น" required error={errors.travelStart} hint="วันที่ออกเดินทางของ Sector แรก ระบบจะคำนวณวันที่ Sector อื่นให้อัตโนมัติ">
            <input
              type="date"
              value={values.travelStart}
              onChange={e => patch({ travelStart: e.target.value })}
              className={cls('travelStart')}
            />
          </Field>
        </div>

        {/* Seats */}
        <Field label="Seat Total" required error={errors.seatTotal}>
          <div className="relative">
            <input
              type="number"
              min={1}
              value={values.seatTotal}
              onChange={e => patch({ seatTotal: e.target.value })}
              placeholder="จำนวนที่นั่ง"
              className={cls('seatTotal') + ' pr-14'}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
              ที่นั่ง
            </span>
          </div>
        </Field>

        {/* Price */}
        <div className="rounded-xl border border-slate-200 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">ราคา</span>
            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{currency}</span>
          </div>

          {/* Format toggle */}
          <div className="flex gap-2">
            {(['FARE', 'FARE_YQ', 'ALL_IN'] as const).map(fmt => (
              <button
                key={fmt}
                type="button"
                onClick={() => patch({ priceFormat: fmt, fare: '', yq: '', tax: '', allIn: '' })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  values.priceFormat === fmt
                    ? 'bg-[#05a94f] text-white border-[#05a94f]'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-[#05a94f]/50'
                }`}
              >
                {fmt === 'FARE_YQ' ? 'FARE + YQ' : fmt === 'ALL_IN' ? 'ALL IN' : 'FARE'}
              </button>
            ))}
          </div>

          {values.priceFormat === 'FARE' && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Fare" required error={errors.fare}>
                <input type="number" min={0} value={values.fare} onChange={e => patch({ fare: e.target.value })} placeholder="0" className={cls('fare')} />
              </Field>
              <Field label="YQ (ถ้ามี)" error={errors.yq}>
                <input type="number" min={0} value={values.yq} onChange={e => patch({ yq: e.target.value })} placeholder="0" className={cls('yq')} />
              </Field>
              <Field label="Tax (ถ้ามี)" error={errors.tax}>
                <input type="number" min={0} value={values.tax} onChange={e => patch({ tax: e.target.value })} placeholder="0" className={cls('tax')} />
              </Field>
            </div>
          )}

          {values.priceFormat === 'FARE_YQ' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fare + YQ (รวม)" required error={errors.fare}>
                <input type="number" min={0} value={values.fare} onChange={e => patch({ fare: e.target.value })} placeholder="0" className={cls('fare')} />
              </Field>
              <Field label="Tax (ถ้ามี)" error={errors.tax}>
                <input type="number" min={0} value={values.tax} onChange={e => patch({ tax: e.target.value })} placeholder="0" className={cls('tax')} />
              </Field>
            </div>
          )}

          {values.priceFormat === 'ALL_IN' && (
            <Field label="All In (ต่อที่นั่ง)" required error={errors.allIn}>
              <input type="number" min={0} value={values.allIn} onChange={e => patch({ allIn: e.target.value })} placeholder="0" className={cls('allIn')} />
            </Field>
          )}
        </div>

        {/* Condition */}
        <Field label="เงื่อนไข (Condition)">
          <select
            value={values.conditionCode}
            onChange={e => patch({ conditionCode: e.target.value })}
            className={cls('conditionCode')}
          >
            <option value="">— ไม่ระบุ —</option>
            {conditions.map(c => (
              <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
            ))}
          </select>
        </Field>

        {/* TTL */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700">NAME DL (Deadline)</label>
          <div className="flex gap-2 flex-wrap">
            {(['NONE', 'DAYS_BEFORE', 'FIXED_DATE'] as TtlType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => patch({ ttlType: t, ttlDaysBefore: '', ttlDate: '', ttlTime: '' })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  values.ttlType === t
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}
              >
                {t === 'NONE' ? 'ไม่มี' : t === 'DAYS_BEFORE' ? 'ก่อนเดินทาง' : 'วันที่กำหนด'}
              </button>
            ))}
          </div>

          {values.ttlType === 'DAYS_BEFORE' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <Field label="จำนวนวันก่อนวันเดินทางเริ่มต้น" required error={errors.ttlDaysBefore}>
                  <input
                    type="number" min={0}
                    value={values.ttlDaysBefore}
                    onChange={e => patch({ ttlDaysBefore: e.target.value })}
                    placeholder="7"
                    className={cls('ttlDaysBefore')}
                  />
                </Field>
                <Field label="เวลา (ไม่บังคับ)">
                  <TimeInput value={values.ttlTime} onChange={v => patch({ ttlTime: v })} className="border-slate-300 rounded-lg" />
                </Field>
              </div>
              {ttlDisplayDate && (
                <p className="text-[11px] text-slate-500">
                  TTL ตรงกับ{' '}
                  <span className="font-semibold text-slate-700">
                    {formatDate(ttlDisplayDate)}{values.ttlTime && ` ${values.ttlTime}`}
                  </span>
                </p>
              )}
              {ttlHolidayReason && (
                <p className="text-[11px] text-amber-600">ⓘ {ttlHolidayReason}</p>
              )}
            </div>
          )}

          {values.ttlType === 'FIXED_DATE' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="วันที่ NAME DL" required error={errors.ttlDate}>
                <input type="date" value={values.ttlDate} onChange={e => patch({ ttlDate: e.target.value })} className={cls('ttlDate')} />
              </Field>
              <Field label="เวลา (ไม่บังคับ)">
                <TimeInput value={values.ttlTime} onChange={v => patch({ ttlTime: v })} className={cls('ttlTime')} />
              </Field>
            </div>
          )}
        </div>

        {/* Remark */}
        <Field label="หมายเหตุ">
          <textarea
            value={values.remark}
            onChange={e => patch({ remark: e.target.value })}
            rows={2}
            placeholder="หมายเหตุเพิ่มเติม..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
          />
        </Field>
      </div>
    </Modal>
  )
}
