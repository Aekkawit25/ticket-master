'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { addDays, format as fnsFormat, parseISO, isValid } from 'date-fns'
import { Button } from '@/components/ui/button'
import { TimeInput } from '@/components/ui/time-input'
import { Badge, PnrConfirmationStatusBadge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import {
  PlusCircle, Pencil, Trash2, X, CheckCircle2, AlertTriangle, PlusSquare, ChevronDown,
} from 'lucide-react'
import { PnrActionMenu } from '@/components/tickets/PnrActionMenu'
import { BulkPnrBuilder } from '@/components/shared/BulkPnrBuilder'
import type { BulkPnrFlightSet, BulkPnrCondition } from '@/components/shared/BulkPnrBuilder'
import { formatDate, formatDateTime, formatNumber, calcTravelEndFromSectors, calculatePlusDay, buildRouteText } from '@/lib/utils'
import { calcTtlDateFromTravel, formatTtlDisplay, condTtlTypeToTtlType, type TtlType } from '@/lib/ttl-utils'
import {
  saveDemoStock, calculateStockSummary, checkPNRDuplicatesInSystem, getStockFlightSets,
  getPnrOperationalStatus, getPnrConfirmationStatus,
} from '@/lib/demo-storage'
import type { DemoStock, DemoPNR, DemoLog, DemoSector, DemoFlightSet, PnrSectorSchedule } from '@/lib/demo-storage'
import { buildSectorSchedules, getPnrSectorSchedules } from '@/lib/schedule-resolver'
import { MASTER_AIRLINE_CODE_SET } from '@/lib/master-data'
import { AirlineCell } from '@/components/shared/AirlineCell'
import { TtlField } from '@/components/shared/TtlField'
import type { ConditionTtlInfo } from '@/components/shared/TtlField'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PNRRow {
  id: string
  pnr_code: string | null
  dummy_pnr: string | null
  pnr_type: string
  route: string | null
  travel_start: string
  travel_end: string
  seat_total: number
  seat_used: number
  seat_balance: number
  fare: number
  yq: number
  tax_type: string
  tax: number
  total_amount: number
  price_format: 'FARE' | 'FARE_YQ' | 'ALL_IN'
  breakdown: boolean
  condition: string | null
  condition_code: string | null
  next_ttl: string | null
  ttl_type: TtlType | null
  ttl_days_before: number | null
  ttl_date: string | null
  ttl_time: string | null
  status: string
}

interface PNRFormState {
  pnrCode: string
  travelStart: string
  flightSetId: string
  seatTotal: string
  priceFormat: 'FARE' | 'FARE_YQ' | 'ALL_IN'
  fare: string
  yq: string
  allIn: string
  breakdown: boolean
  taxType: string
  tax: string
  conditionCode: string
  status: string
  remark: string
  ttlType: TtlType
  ttlDaysBefore: string
  ttlDate: string
  ttlTime: string
  sectorOverrides: SectorOverrideForm[]
}

interface SectorOverrideForm {
  sectorId: string
  sectorType: string
  seq: number
  departureDate: string
  departureTime: string
  arrivalDate: string
  arrivalTime: string
  plusDay: number
  isDateOverride: boolean
  isTimeOverride: boolean
}

const EMPTY_FORM: PNRFormState = {
  pnrCode: '', travelStart: '', flightSetId: '', seatTotal: '',
  priceFormat: 'FARE', fare: '', yq: '', allIn: '', breakdown: false,
  taxType: 'separate', tax: '', conditionCode: '', status: 'Pending', remark: '',
  ttlType: 'NONE', ttlDaysBefore: '', ttlDate: '', ttlTime: '',
  sectorOverrides: [],
}

const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  liveStock: DemoStock | null
  mockPNRs: PNRRow[]
  currency: string
  canEdit: boolean
  jumpToEdit: boolean
  onUpdate: (stock: DemoStock) => void
  onDirtyChange: (dirty: boolean) => void
  onJumpDone: () => void
}

// ─── Custom Flight Types & Helpers ───────────────────────────────────────────

interface CfSector {
  sectorId: string; seq: number; sectorType: string; airlineCode: string
  flightNo: string; depAirportCode: string; arrAirportCode: string
  depTime: string; arrTime: string; arrDayOffset: number; dayOffset: number; remark: string
}

const CF_SECTOR_TYPES = ['Departure', 'Transit', 'Arrival']

function normalizeSegmentType(value: unknown): string {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'departure' || v === 'outbound') return 'Departure'
  if (v === 'arrival'   || v === 'return')   return 'Arrival'
  if (v === 'transit'   || v === 'domestic') return 'Transit'
  return String(value ?? '').trim()
}

function ensureUniqueName(name: string, flightSets: DemoFlightSet[], excludeId?: string): string {
  const taken = (n: string) => flightSets.some(
    f => f.flightSetId !== excludeId && f.flightSetName.trim().toLowerCase() === n.trim().toLowerCase()
  )
  if (!taken(name)) return name
  let i = 2
  while (taken(`${name} (${i})`)) i++
  return `${name} (${i})`
}

function autoCustomName(pnr: DemoPNR): string {
  let depDate = '—'
  try { const d = parseISO(pnr.travelStart); if (isValid(d)) depDate = fnsFormat(d, 'dd MMM yy') } catch { /* ignore */ }
  const short = pnr.pnrCode
    ? pnr.pnrCode.slice(-4)
    : (pnr.dummyPnr?.match(/-(\d{4})$/) ?? [])[1] ?? pnr.pnrDisplay?.slice(-4) ?? '????'
  return `Custom - ${depDate} - ${short}`
}

function cfSectorsEqual(a: CfSector[], b: DemoSector[]): boolean {
  if (a.length !== b.length) return false
  return a.every((s, i) => {
    const t = b[i]
    return s.sectorType === t.sectorType && s.airlineCode === t.airlineCode &&
      s.flightNo === t.flightNo && s.depAirportCode === t.depAirportCode &&
      s.arrAirportCode === t.arrAirportCode && s.depTime === t.depTime &&
      s.arrTime === t.arrTime && s.arrDayOffset === t.arrDayOffset && s.dayOffset === t.dayOffset
  })
}

function findMatchingFS(sectors: CfSector[], flightSets: DemoFlightSet[], excludeId: string): DemoFlightSet | null {
  return flightSets.find(fs => fs.flightSetId !== excludeId && cfSectorsEqual(sectors, fs.sectors)) ?? null
}

function validateCfSectors(sectors: CfSector[], minSectors: number): Record<string, string> {
  const errs: Record<string, string> = {}
  if (sectors.length < minSectors) errs._count = `ต้องมีอย่างน้อย ${minSectors} Sector`
  if (sectors.length > 0) {
    const firstType = normalizeSegmentType(sectors[0].sectorType)
    if (firstType !== 'Departure') errs._order = 'Sector แรกต้องเป็น Departure'
  }
  if (sectors.length > 1) {
    const lastType = normalizeSegmentType(sectors[sectors.length - 1].sectorType)
    if (lastType !== 'Arrival' && lastType !== 'Departure') errs._return = 'Sector สุดท้ายต้องเป็น Arrival'
  }
  sectors.forEach((s, i) => {
    if (!String(s.flightNo || '').trim())       errs[`flightNo_${i}`] = 'กรุณาระบุ Flight No.'
    if (!String(s.depAirportCode || '').trim()) errs[`dep_${i}`]      = 'กรุณาระบุ From'
    if (!String(s.arrAirportCode || '').trim()) errs[`arr_${i}`]      = 'กรุณาระบุ To'
    if (!String(s.depTime || '').trim())        errs[`depTime_${i}`]  = 'กรุณาระบุ Dep Time'
    if (!String(s.arrTime || '').trim())        errs[`arrTime_${i}`]  = 'กรุณาระบุ Arr Time'
    if (!s.airlineCode || !MASTER_AIRLINE_CODE_SET.has(s.airlineCode))
      errs[`airline_${i}`] = s.airlineCode ? 'ไม่พบใน Master' : 'กรุณาเลือก Airline'
  })
  // Duplicate flight check
  const flightKeyMap = new Map<string, number[]>()
  sectors.forEach((s, i) => {
    if (s.airlineCode && s.flightNo) {
      const key = `${s.airlineCode}${s.flightNo}`
      const arr = flightKeyMap.get(key) ?? []
      arr.push(i)
      flightKeyMap.set(key, arr)
    }
  })
  flightKeyMap.forEach((indices) => {
    if (indices.length > 1) {
      indices.forEach(i => { errs[`flightNo_${i}`] = 'Flight No ซ้ำ' })
    }
  })
  return errs
}

function buildCfChangeLog(newSectors: CfSector[], oldSectors: DemoSector[]): string {
  const changes: string[] = []
  if (newSectors.length !== oldSectors.length) {
    changes.push(`Segments: ${oldSectors.length} → ${newSectors.length}`)
  } else {
    newSectors.forEach((s, i) => {
      const o = oldSectors[i]; const diffs: string[] = []
      if (s.flightNo !== o.flightNo) diffs.push(`Flight ${o.flightNo}→${s.flightNo}`)
      if (s.depTime !== o.depTime || s.arrTime !== o.arrTime) diffs.push(`Time ${o.depTime}/${o.arrTime}→${s.depTime}/${s.arrTime}`)
      if (s.depAirportCode !== o.depAirportCode || s.arrAirportCode !== o.arrAirportCode) diffs.push(`Route ${o.depAirportCode}-${o.arrAirportCode}→${s.depAirportCode}-${s.arrAirportCode}`)
      if (s.dayOffset !== o.dayOffset) diffs.push(`Travel Day ${o.dayOffset}→${s.dayOffset}`)
      if (diffs.length) changes.push(`Sec ${i + 1}: ${diffs.join(', ')}`)
    })
  }
  return changes.join('; ')
}

// ─── CfSectorTable — inline sector edit for Custom Flight modal ───────────────

interface CfSectorTableProps {
  sectors: CfSector[]
  errors: Record<string, string>
  defaultAirlineCode: string
  onChange: (s: CfSector[]) => void
}

function CfSectorTable({ sectors, errors, defaultAirlineCode, onChange }: CfSectorTableProps) {
  const update = (idx: number, rawPatch: Partial<CfSector>) => {
    const patch: Partial<CfSector> = rawPatch.sectorType !== undefined
      ? { ...rawPatch, sectorType: normalizeSegmentType(rawPatch.sectorType) }
      : rawPatch
    onChange(sectors.map((s, i) => {
      if (i !== idx) return s
      const m = { ...s, ...patch }
      if (('depTime' in patch || 'arrTime' in patch) && !('arrDayOffset' in patch))
        m.arrDayOffset = m.arrTime < m.depTime ? 1 : 0
      return m
    }))
  }

  const addSec = () => {
    const maxSeq = sectors.reduce((m, s) => Math.max(m, s.seq), 0)
    onChange([...sectors, {
      sectorId: newId('SEC'), seq: maxSeq + 1, sectorType: 'Transit',
      airlineCode: defaultAirlineCode, flightNo: '', depAirportCode: '', arrAirportCode: '',
      depTime: '08:00', arrTime: '10:00', arrDayOffset: 0, dayOffset: 1, remark: '',
    }])
  }

  const removeSec = (idx: number) =>
    onChange(sectors.filter((_, i) => i !== idx).map((s, i) => ({ ...s, seq: i + 1 })))

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
        <colgroup>
          <col style={{ width: 26 }} /><col style={{ width: 90 }} /><col style={{ width: 58 }} />
          <col style={{ width: 80 }} /><col style={{ width: 60 }} /><col style={{ width: 60 }} />
          <col style={{ width: 76 }} /><col style={{ width: 76 }} /><col style={{ width: 48 }} />
          <col style={{ width: 68 }} /><col /><col style={{ width: 32 }} />
        </colgroup>
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {['#','Type','Airline','Flight No.','From','To','Dep','Arr','+Day','Travel Day','Remark',''].map(h => (
              <th key={h} className="px-1.5 h-8 text-[10px] font-semibold text-slate-500 text-center whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sectors.map((s, i) => (
            <tr key={s.sectorId} className="border-b border-slate-100 last:border-0 align-middle">
              <td className="px-1.5 py-1 text-[10px] text-center text-slate-400">{i + 1}</td>
              <td className="px-1 py-1">
                <select value={s.sectorType} onChange={e => update(i, { sectorType: e.target.value })}
                  className="w-full border border-slate-300 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#05a94f]">
                  {CF_SECTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </td>
              <td className="px-1 py-1">
                <AirlineCell
                  value={s.airlineCode}
                  onChange={v => update(i, { airlineCode: v })}
                  inputClassName={`border rounded px-1 py-0.5 ${errors[`airline_${i}`] ? 'border-red-400' : 'border-slate-300'}`}
                />
              </td>
              <td className="px-1 py-1">
                <input value={s.flightNo}
                  onChange={e => update(i, { flightNo: e.target.value.replace(/\D/g, '') })}
                  className={`w-full border rounded px-1 py-0.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-[#05a94f] ${errors[`flightNo_${i}`] ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="701" inputMode="numeric" />
              </td>
              <td className="px-1 py-1">
                <input value={s.depAirportCode} maxLength={3}
                  onChange={e => update(i, { depAirportCode: e.target.value.toUpperCase() })}
                  className={`w-full border rounded px-1 py-0.5 text-[11px] font-mono uppercase focus:outline-none focus:ring-1 focus:ring-[#05a94f] ${errors[`dep_${i}`] ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="BKK" />
              </td>
              <td className="px-1 py-1">
                <input value={s.arrAirportCode} maxLength={3}
                  onChange={e => update(i, { arrAirportCode: e.target.value.toUpperCase() })}
                  className={`w-full border rounded px-1 py-0.5 text-[11px] font-mono uppercase focus:outline-none focus:ring-1 focus:ring-[#05a94f] ${errors[`arr_${i}`] ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="NRT" />
              </td>
              <td className="px-1 py-1">
                <TimeInput compact value={s.depTime} onChange={v => update(i, { depTime: v })}
                  className="w-full border border-slate-300 rounded focus-within:ring-1 focus-within:ring-[#05a94f] focus-within:border-[#05a94f]" />
              </td>
              <td className="px-1 py-1">
                <TimeInput compact value={s.arrTime} onChange={v => update(i, { arrTime: v })}
                  className="w-full border border-slate-300 rounded focus-within:ring-1 focus-within:ring-[#05a94f] focus-within:border-[#05a94f]" />
              </td>
              <td className="px-1 py-1">
                <div className="w-full rounded px-0.5 py-[3px] text-[11px] text-center bg-slate-50 text-slate-600 font-medium border border-slate-200">
                  {s.arrDayOffset === 0 ? '0' : `+${s.arrDayOffset}`}
                </div>
              </td>
              <td className="px-1 py-1">
                <input type="number" min="1" value={s.dayOffset}
                  onChange={e => update(i, { dayOffset: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-full border border-slate-300 rounded px-1 py-0.5 text-[11px] text-center focus:outline-none focus:ring-1 focus:ring-[#05a94f]" />
              </td>
              <td className="px-1 py-1">
                <input value={s.remark} onChange={e => update(i, { remark: e.target.value })}
                  className="w-full border border-slate-300 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#05a94f]"
                  placeholder="—" />
              </td>
              <td className="px-1 py-1 text-center">
                <button onClick={() => removeSec(i)} disabled={sectors.length <= 1}
                  className="p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <Trash2 size={11} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 border-t border-slate-100">
        <button onClick={addSec}
          className="inline-flex items-center gap-1 text-[11px] text-[#05a94f] hover:text-green-700 font-medium">
          <PlusCircle size={12} /> เพิ่ม Segment
        </button>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PNRCell({ code, dummy, route }: { code: string | null; dummy: string | null; type?: string; route?: string | null }) {
  const display = code || dummy
  const routeLabel = route ? `Route: ${route}` : null
  return (
    <div className="flex flex-col items-start" style={{ gap: 3, minWidth: 0 }}>
      {/* บรรทัด 1: PNR Code */}
      <span className="font-mono text-xs font-bold whitespace-nowrap" style={{ wordBreak: 'normal', overflowWrap: 'normal' }}>
        {display || <span className="text-slate-300 italic font-normal text-[10px]">ไม่ระบุ</span>}
      </span>
      {/* บรรทัด 2: Route */}
      <span
        className="text-[10px] text-slate-400 font-medium"
        style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
        title={routeLabel ?? undefined}
      >
        {routeLabel ?? <span className="italic text-slate-300">Route: ยังไม่ระบุ</span>}
      </span>
      {/* บรรทัด 3: Badge ประเภทรหัส */}
      {code ? (
        <span className="inline-flex w-fit px-1.5 py-px rounded text-[9px] font-medium bg-blue-50 text-blue-600 border border-blue-200 whitespace-nowrap">มี PNR แล้ว</span>
      ) : dummy ? (
        <span className="inline-flex w-fit px-1.5 py-px rounded text-[9px] font-medium bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">Dummy</span>
      ) : null}
    </div>
  )
}

function computeSectorOverrides(
  fsSectors: DemoSector[],
  travelStart: string,
  existingOverrides?: SectorOverrideForm[]
): SectorOverrideForm[] {
  return fsSectors.map((sec, i) => {
    const existing = existingOverrides?.[i] ?? existingOverrides?.find(s => s.sectorId === sec.sectorId)
    const useDepOverride = !!(existing?.isDateOverride && existing?.departureDate)
    const useArrOverride = !!(existing?.isDateOverride && existing?.arrivalDate)
    const useTimeOverride = !!(existing?.isTimeOverride)

    let depDate = ''
    if (useDepOverride) {
      depDate = existing!.departureDate
    } else if (travelStart) {
      try {
        const [ty, tm, td] = travelStart.split('-').map(Number)
        const local = new Date(ty, tm - 1, td)
        local.setDate(local.getDate() + ((sec.dayOffset ?? 1) - 1))
        depDate = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
      } catch { /* empty */ }
    }

    const basePlusDay = sec.arrDayOffset ?? 0
    let arrDate = depDate
    if (!useArrOverride) {
      if (basePlusDay > 0 && depDate) {
        const [y, m, d] = depDate.split('-').map(Number)
        const local = new Date(y, m - 1, d)
        local.setDate(local.getDate() + basePlusDay)
        arrDate = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
      }
    } else {
      arrDate = existing!.arrivalDate
    }

    // Recompute plusDay from actual dates when both are overridden
    let finalPlusDay = basePlusDay
    if (existing?.isDateOverride && depDate && arrDate) {
      try {
        const [dy, dm, dd] = depDate.split('-').map(Number)
        const [ay, am, ad] = arrDate.split('-').map(Number)
        const diff = Math.round((new Date(ay, am - 1, ad).getTime() - new Date(dy, dm - 1, dd).getTime()) / 86400000)
        finalPlusDay = Math.max(0, diff)
      } catch { /* empty */ }
    } else if (existing?.plusDay !== undefined && !existing?.isDateOverride) {
      finalPlusDay = existing.plusDay
    }

    return {
      sectorId: sec.sectorId,
      sectorType: sec.sectorType,
      seq: sec.seq,
      departureDate: depDate,
      departureTime: useTimeOverride ? (existing!.departureTime || sec.depTime || '') : (sec.depTime || ''),
      arrivalDate: arrDate,
      arrivalTime: useTimeOverride ? (existing!.arrivalTime || sec.arrTime || '') : (sec.arrTime || ''),
      plusDay: finalPlusDay,
      isDateOverride: useDepOverride || useArrOverride,
      isTimeOverride: useTimeOverride,
    }
  })
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PNRTab({ liveStock, mockPNRs, currency, canEdit, jumpToEdit, onUpdate, onDirtyChange, onJumpDone }: Props) {
  const [showPNRModal, setShowPNRModal]   = useState(false)
  const [editingPnrId, setEditingPnrId]  = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingPnr, setDeletingPnr]    = useState<DemoPNR | null>(null)
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [convertingPnr, setConvertingPnr] = useState<DemoPNR | null>(null)
  const [convertCode, setConvertCode]    = useState('')
  const [convertError, setConvertError]  = useState('')
  const [showBulkAdd, setShowBulkAdd]    = useState(false)

  const [form, setForm]     = useState<PNRFormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')

  const [selectedPnrIds, setSelectedPnrIds] = useState<Set<string>>(new Set())
  const [condChangeConfirm, setCondChangeConfirm] = useState<{ pnrIds: string[]; newCode: string } | null>(null)
  const [showBulkCond, setShowBulkCond]     = useState(false)
  const [bulkCondCode, setBulkCondCode]     = useState('')
  const [detailPnr, setDetailPnr]           = useState<PNRRow | null>(null)

  // Custom Flight state
  const [showCFModal, setShowCFModal]           = useState(false)
  const [cfMode, setCfMode]                     = useState<'create' | 'edit'>('create')
  const [cfEditFsId, setCfEditFsId]             = useState<string | null>(null)   // edit: FS ที่ต้อง update
  const [cfSourceFsId, setCfSourceFsId]         = useState<string | null>(null)   // FS ต้นทางที่ copy sectors มา
  const [cfEditAffectsCount, setCfEditAffectsCount] = useState(1)
  const [cfPnr, setCfPnr]                       = useState<DemoPNR | null>(null)
  const [cfSectors, setCfSectors]               = useState<CfSector[]>([])
  const [cfSetName, setCfSetName]               = useState('')
  const [cfErrors, setCfErrors]                 = useState<Record<string, string>>({})
  const [cfSaving, setCfSaving]                 = useState(false)
  const [cfDupFS, setCfDupFS]                  = useState<DemoFlightSet | null>(null)
  const [showCFDupConfirm, setShowCFDupConfirm] = useState(false)
  // Case C — custom FS used by multiple PNRs
  const [showCFMultiConfirm, setShowCFMultiConfirm] = useState(false)
  const [cfMultiPnr, setCfMultiPnr]             = useState<DemoPNR | null>(null)
  const [cfMultiFS, setCfMultiFS]               = useState<DemoFlightSet | null>(null)

  // PNR operational status modals
  const [closingPnr, setClosingPnr]             = useState<DemoPNR | null>(null)
  const [showClosePnrModal, setShowClosePnrModal] = useState(false)
  const [cancellingPnr, setCancellingPnr]       = useState<DemoPNR | null>(null)
  const [showCancelPnrModal, setShowCancelPnrModal] = useState(false)
  const [cancelReason, setCancelReason]         = useState('')
  const [cancelReasonError, setCancelReasonError] = useState('')
  const [showBulkCancel, setShowBulkCancel]     = useState(false)
  const [bulkCancelReason, setBulkCancelReason] = useState('')
  const [bulkCancelReasonError, setBulkCancelReasonError] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleTravelStartChange = (newDate: string) => {
    setForm(prev => {
      const allFS = liveStock ? getStockFlightSets(liveStock) : []
      const fs = allFS.find(f => f.flightSetId === prev.flightSetId) ?? allFS[0]
      const fsSectors = fs?.sectors ?? liveStock?.sectors ?? []
      return { ...prev, travelStart: newDate, sectorOverrides: computeSectorOverrides(fsSectors, newDate, prev.sectorOverrides) }
    })
  }

  const handleFlightSetChange = (newFsId: string) => {
    setForm(prev => {
      const allFS = liveStock ? getStockFlightSets(liveStock) : []
      const fs = allFS.find(f => f.flightSetId === newFsId) ?? allFS[0]
      const fsSectors = fs?.sectors ?? liveStock?.sectors ?? []
      const newOverrides = prev.travelStart ? computeSectorOverrides(fsSectors, prev.travelStart) : []
      return { ...prev, flightSetId: newFsId, sectorOverrides: newOverrides }
    })
  }

  const updateSectorDate = (idx: number, field: 'departureDate' | 'arrivalDate', value: string) => {
    setForm(prev => {
      const allFS = liveStock ? getStockFlightSets(liveStock) : []
      const fs = allFS.find(f => f.flightSetId === prev.flightSetId) ?? allFS[0]
      const fsSectors = fs?.sectors ?? liveStock?.sectors ?? []
      const base = prev.sectorOverrides.length > 0
        ? [...prev.sectorOverrides]
        : computeSectorOverrides(fsSectors, prev.travelStart)
      const ov = { ...(base[idx] ?? { sectorId: fsSectors[idx]?.sectorId ?? '', sectorType: fsSectors[idx]?.sectorType ?? '', seq: idx + 1, departureDate: '', departureTime: '', arrivalDate: '', arrivalTime: '', plusDay: 0, isDateOverride: false, isTimeOverride: false }) }
      if (field === 'departureDate') {
        ov.departureDate = value
        ov.isDateOverride = true
        // Keep arrivalDate fixed; recalculate plusDay from both dates
        const pd = calculatePlusDay(value, ov.arrivalDate)
        ov.plusDay = pd !== null ? pd : 0
      } else {
        ov.arrivalDate = value
        ov.isDateOverride = true
        const pd = calculatePlusDay(ov.departureDate, value)
        ov.plusDay = pd !== null ? pd : 0
      }
      base[idx] = ov
      return { ...prev, sectorOverrides: base }
    })
  }

  const updateSectorTime = (idx: number, field: 'departureTime' | 'arrivalTime', value: string) => {
    setForm(prev => {
      if (idx >= prev.sectorOverrides.length) return prev
      const newOverrides = [...prev.sectorOverrides]
      newOverrides[idx] = { ...newOverrides[idx], [field]: value, isTimeOverride: true }
      return { ...prev, sectorOverrides: newOverrides }
    })
  }

  const openAdd = () => {
    const allFS = liveStock ? getStockFlightSets(liveStock) : []
    const firstFlightSetId = allFS[0]?.flightSetId ?? ''
    const activeConds = (liveStock?.conditions ?? []).filter(c => c.condition.status === 'Active')
    const autoCode = activeConds.length === 1 ? activeConds[0].condition.conditionCode : (liveStock?.defaultConditionCode ?? '')
    setEditingPnrId(null)
    setForm({ ...EMPTY_FORM, flightSetId: firstFlightSetId, conditionCode: autoCode, sectorOverrides: [] })
    setErrors({})
    setShowPNRModal(true)
    onDirtyChange(true)
  }

  const openEdit = (pnr: DemoPNR) => {
    const allFS = liveStock ? getStockFlightSets(liveStock) : []
    const firstFlightSetId = allFS[0]?.flightSetId ?? ''
    const pnrFS = allFS.find(f => f.flightSetId === pnr.flightSetId) ?? allFS[0]
    const fsSectors = pnrFS?.sectors ?? liveStock?.sectors ?? []

    const existingOverrides: SectorOverrideForm[] = (pnr.sectorSchedules ?? []).map(sc => ({
      sectorId: sc.flightSetSectorId,
      sectorType: sc.sectorType,
      seq: sc.sequence,
      departureDate: sc.departureDate,
      departureTime: sc.departureTime,
      arrivalDate: sc.arrivalDate,
      arrivalTime: sc.arrivalTime,
      plusDay: sc.plusDay,
      isDateOverride: sc.isDateOverride,
      isTimeOverride: sc.isTimeOverride,
    }))
    const sectorOverrides = computeSectorOverrides(fsSectors, pnr.travelStart || '', existingOverrides)

    setEditingPnrId(pnr.pnrId)
    const fmt = pnr.priceFormat ?? 'FARE'
    const hasBreakdown = fmt === 'ALL_IN' && (pnr.breakdown ?? (pnr.fare > 0))
    setForm({
      pnrCode:       pnr.pnrCode || '',
      travelStart:   pnr.travelStart || '',
      flightSetId:   pnr.flightSetId || firstFlightSetId,
      seatTotal:     String(pnr.seatTotal),
      priceFormat:   fmt,
      fare:          fmt === 'ALL_IN' && !hasBreakdown ? '' : String(pnr.fare),
      yq:            String(pnr.yq ?? 0),
      allIn:         fmt === 'ALL_IN' ? String(pnr.total) : '',
      breakdown:     hasBreakdown,
      taxType:       pnr.taxType || 'separate',
      tax:           pnr.tax != null ? String(pnr.tax) : '',
      conditionCode: pnr.conditionCode || '',
      status:        pnr.status || 'Pending',
      remark:        pnr.remark || '',
      ttlType:       pnr.ttlType ?? (pnr.ttlDate ? 'FIXED_DATE' : 'NONE'),
      ttlDaysBefore: pnr.ttlDaysBefore != null ? String(pnr.ttlDaysBefore) : '',
      ttlDate:       pnr.ttlDate || '',
      ttlTime:       pnr.ttlTime || '',
      sectorOverrides,
    })
    setErrors({})
    setShowPNRModal(true)
    onDirtyChange(true)
  }

  // Jump to Add PNR when triggered from dropdown
  useEffect(() => {
    if (jumpToEdit && liveStock) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openAdd()
      onJumpDone()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToEdit])

  const closeModal = () => {
    setShowPNRModal(false)
    setEditingPnrId(null)
    setForm(EMPTY_FORM)
    setErrors({})
    onDirtyChange(false)
  }

  // Build PNR object from form
  const buildPnrFromForm = useCallback((existingPnr?: DemoPNR): DemoPNR => {
    const stock = liveStock!
    const travelStart  = form.travelStart
    const seatTotal    = Number(form.seatTotal)
    const priceFormat  = form.priceFormat ?? 'FARE'

    let fare: number, yqAmt: number, tax: number, total: number, taxType: string
    if (priceFormat === 'FARE') {
      fare    = Number(form.fare) || 0
      yqAmt   = Number(form.yq)  || 0   // optional, 0 if blank
      tax     = Number(form.tax) || 0   // optional, 0 if blank
      taxType = 'separate'
      total   = fare + yqAmt + tax
    } else if (priceFormat === 'FARE_YQ') {
      fare    = Number(form.fare) || 0  // combined Fare+YQ entered by user
      yqAmt   = 0
      tax     = Number(form.tax) || 0   // optional other tax
      taxType = 'separate'
      total   = fare + tax
    } else { // ALL_IN
      total   = Number(form.allIn) || 0
      if (form.breakdown) {
        fare    = Number(form.fare) || 0
        yqAmt   = Number(form.yq)  || 0
        tax     = Number(form.tax) || 0
        taxType = 'separate'
      } else {
        fare    = 0
        yqAmt   = 0
        tax     = 0
        taxType = 'included'
      }
    }
    const isReal       = !!form.pnrCode.trim()
    const pnrCode      = isReal ? form.pnrCode.trim() : ''
    const pnrDisplay   = isReal ? pnrCode : (existingPnr?.dummyPnr || generateDummy(travelStart, stock))
    const dummyPnr     = isReal ? '' : pnrDisplay

    const flightSets = getStockFlightSets(stock)
    const selectedFS = flightSets.find(f => f.flightSetId === form.flightSetId) ?? flightSets[0]
    const fsSectors  = selectedFS?.sectors ?? stock.sectors

    const sectorSchedules: PnrSectorSchedule[] = form.sectorOverrides.length > 0
      ? form.sectorOverrides.map(ov => {
          const pd = calculatePlusDay(ov.departureDate, ov.arrivalDate)
          return {
            flightSetSectorId: ov.sectorId,
            sequence: ov.seq,
            sectorType: ov.sectorType as PnrSectorSchedule['sectorType'],
            departureDate: ov.departureDate,
            departureTime: ov.departureTime,
            arrivalDate: ov.arrivalDate,
            arrivalTime: ov.arrivalTime,
            plusDay: pd !== null && pd >= 0 ? pd : Math.max(0, ov.plusDay),
            departureDayOffset: fsSectors.find(s => s.sectorId === ov.sectorId)?.dayOffset ?? 1,
            isDateOverride: ov.isDateOverride,
            isTimeOverride: ov.isTimeOverride,
            sourceType: (ov.isDateOverride || ov.isTimeOverride) ? 'manual' as const : 'calculated' as const,
          }
        })
      : buildSectorSchedules(fsSectors, travelStart)

    const arrivalSchedules = sectorSchedules.filter(s => s.sectorType === 'Arrival')
    const lastSchedule = arrivalSchedules.length ? arrivalSchedules[arrivalSchedules.length - 1] : sectorSchedules[sectorSchedules.length - 1]
    const travelEnd = lastSchedule?.arrivalDate
      ?? calcTravelEndFromSectors(travelStart, fsSectors.map(s => ({ sector_type: s.sectorType, day_offset: s.dayOffset })))
      ?? existingPnr?.travelEnd ?? ''

    const sectorDates = fsSectors.map(s => {
      try { const d = addDays(parseISO(travelStart), s.dayOffset - 1); return { sectorType: s.sectorType, date: fnsFormat(d, 'yyyy-MM-dd') } }
      catch { return { sectorType: s.sectorType, date: '' } }
    })

    // TTL computation — depends on ttlType
    let ttlDate: string | null = null
    const ttlTimeStr: string | null = form.ttlTime || null
    if (form.ttlType === 'DAYS_BEFORE') {
      const n = parseInt(form.ttlDaysBefore, 10)
      if (!isNaN(n) && n >= 0 && travelStart) {
        ttlDate = calcTtlDateFromTravel(travelStart, n)
      }
    } else if (form.ttlType === 'FIXED_DATE') {
      ttlDate = form.ttlDate || null
    }
    const ttlDateTime: string | null = ttlDate ? (ttlTimeStr ? `${ttlDate}T${ttlTimeStr}:00` : `${ttlDate}T00:00:00`) : null

    const taxStatus: 'completed' | 'included' | 'pending' =
      taxType === 'included' ? 'included' : taxType === 'pending' ? 'pending' : 'completed'

    return {
      pnrId:          existingPnr?.pnrId ?? newId('PNR'),
      pnrCode,
      dummyPnr,
      pnrType:        isReal ? 'real' : 'dummy',
      pnrDisplay,
      flightSetId:    selectedFS?.flightSetId ?? flightSets[0]?.flightSetId ?? 'fset-default',
      travelStart,
      travelEnd,
      sectorDates,
      sectorSchedules,
      seatTotal,
      seatUsed:       existingPnr?.seatUsed ?? 0,
      seatBalance:    seatTotal - (existingPnr?.seatUsed ?? 0),
      priceFormat,
      breakdown:      priceFormat === 'ALL_IN' ? form.breakdown : undefined,
      fare,
      yq:             yqAmt,
      taxType,
      tax,
      fareIncludesTax: taxType === 'included',
      taxStatus,
      total,
      conditionCode:  form.conditionCode || '',
      ttlType:        form.ttlType,
      ttlDaysBefore:  form.ttlType === 'DAYS_BEFORE' ? (parseInt(form.ttlDaysBefore, 10) || null) : null,
      ttlDate,
      ttlTime:        ttlTimeStr,
      ttlDateTime,
      status:         form.status || 'Pending',
      pnrStatus:      existingPnr?.pnrStatus ?? 'PENDING',
      confirmationStatus: existingPnr?.confirmationStatus ?? (form.status === 'Confirmed' ? 'CONFIRMED' : 'PENDING_CONFIRMATION'),
      activatedAt:    existingPnr?.activatedAt ?? null,
      activatedBy:    existingPnr?.activatedBy ?? null,
      closedAt:       existingPnr?.closedAt ?? null,
      closedBy:       existingPnr?.closedBy ?? null,
      cancelledAt:    existingPnr?.cancelledAt ?? null,
      cancelledBy:    existingPnr?.cancelledBy ?? null,
      cancellationReason: existingPnr?.cancellationReason ?? null,
      remark:         form.remark || '',
    }
  }, [form, liveStock])

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {}
    if (!form.travelStart) errs.travelStart = 'กรุณาระบุ Travel Start'
    if (!form.seatTotal || Number(form.seatTotal) <= 0) errs.seatTotal = 'กรุณาระบุ Seat Total (> 0)'
    const fmt = form.priceFormat ?? 'FARE'
    if (fmt === 'FARE') {
      if (form.fare === '' || isNaN(Number(form.fare)) || Number(form.fare) <= 0) errs.fare = 'กรุณาระบุ Fare (> 0)'
    } else if (fmt === 'FARE_YQ') {
      if (form.fare === '' || isNaN(Number(form.fare)) || Number(form.fare) <= 0) errs.fare = 'กรุณาระบุ Fare + YQ (> 0)'
    } else { // ALL_IN
      if (form.allIn === '' || isNaN(Number(form.allIn)) || Number(form.allIn) <= 0) errs.allIn = 'กรุณาระบุ All In (> 0)'
      if (form.breakdown) {
        const fareC  = Math.round((Number(form.fare)||0) * 100)
        const yqC    = Math.round((Number(form.yq)||0)  * 100)
        const taxC   = Math.round((Number(form.tax)||0)  * 100)
        const allInC = Math.round((Number(form.allIn)||0) * 100)
        const bkC    = fareC + yqC + taxC
        if (allInC > 0 && bkC !== allInC) {
          const diff = (bkC - allInC) / 100
          errs.breakdown = `ส่วนต่าง ${diff > 0 ? '+' : ''}${formatNumber(diff)} — รวม Fare+YQ+Tax ต้องเท่ากับ All In`
        }
      }
    }
    // TTL validation
    if (form.ttlType === 'DAYS_BEFORE') {
      if (form.ttlDaysBefore === '') errs.ttl = 'กรุณาระบุจำนวนวันก่อนเดินทาง'
      else {
        const n = parseInt(form.ttlDaysBefore, 10)
        if (isNaN(n) || n < 0) errs.ttl = 'จำนวนวันต้องไม่น้อยกว่า 0'
        else if (!form.travelStart) errs.ttl = 'กรุณาระบุวันเดินทางก่อนคำนวณ TTL'
      }
    } else if (form.ttlType === 'FIXED_DATE') {
      if (!form.ttlDate) errs.ttl = 'กรุณาเลือกวันที่กำหนดส่ง NAME'
    }
    // Sector date validation — arr must not be before dep
    form.sectorOverrides.forEach((ov, i) => {
      if (ov.isDateOverride && ov.departureDate && ov.arrivalDate) {
        const pd = calculatePlusDay(ov.departureDate, ov.arrivalDate)
        if (pd !== null && pd < 0) {
          errs[`sectorDate_${i}`] = `Sector ${ov.seq}: Arr Date ต้องไม่ก่อน Dep Date`
        }
      }
    })
    if (form.pnrCode.trim()) {
      const dup = checkPNRDuplicatesInSystem([{ pnr_code: form.pnrCode.trim() }])
      if (dup.hasConflicts) {
        const s = dup.conflicts[0]?.conflictingStock
        // Allow same stock (editing existing PNR in same stock)
        if (!s || (s.stockId !== liveStock?.stockId)) {
          errs.pnrCode = s
            ? `PNR "${form.pnrCode}" มีอยู่ใน Stock ${s.stockCode} — ${s.groupName} (${s.status})`
            : `PNR "${form.pnrCode}" มีอยู่แล้วในระบบ`
        }
      }
    }
    return errs
  }

  const handleSavePNR = () => {
    if (!liveStock) return
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)

    const isEdit = !!editingPnrId
    const existingPnr = isEdit ? liveStock.pnrs.find(p => p.pnrId === editingPnrId) : undefined
    const newPnr = buildPnrFromForm(existingPnr)
    const now = new Date().toISOString()

    const log: DemoLog = {
      logId: newId('LOG'),
      action: isEdit ? 'แก้ไข PNR' : 'เพิ่ม PNR',
      message: isEdit
        ? `แก้ไข PNR ${newPnr.pnrDisplay}: วันเดินทาง ${formatDate(newPnr.travelStart)}`
        : `เพิ่ม PNR ${newPnr.pnrDisplay}: วันเดินทาง ${formatDate(newPnr.travelStart)}, Seat ${newPnr.seatTotal}`,
      createdAt: now,
      createdBy: 'System',
    }

    const newPnrs = isEdit
      ? liveStock.pnrs.map(p => p.pnrId === editingPnrId ? newPnr : p)
      : [...liveStock.pnrs, newPnr]

    const updated: DemoStock = {
      ...liveStock,
      pnrs: newPnrs,
      summary: calculateStockSummary(newPnrs),
      updatedAt: now,
      logs: [log, ...liveStock.logs],
    }

    saveDemoStock(updated)
    onUpdate(updated)
    setSaving(false)
    closeModal()
    showToast(isEdit ? 'แก้ไข PNR สำเร็จ' : 'เพิ่ม PNR สำเร็จ')
  }

  const handleDeletePNR = () => {
    if (!liveStock || !deletingPnr) return
    const now = new Date().toISOString()
    const log: DemoLog = {
      logId: newId('LOG'),
      action: 'ลบ PNR',
      message: `ลบ PNR: ${deletingPnr.pnrDisplay}, Seat: ${deletingPnr.seatTotal}`,
      createdAt: now,
      createdBy: 'System',
    }
    const newPnrs = liveStock.pnrs.filter(p => p.pnrId !== deletingPnr.pnrId)
    const updated: DemoStock = { ...liveStock, pnrs: newPnrs, summary: calculateStockSummary(newPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setShowDeleteModal(false)
    setDeletingPnr(null)
    showToast('ลบ PNR สำเร็จ')
  }

  const handleResetSchedule = (pnr: DemoPNR) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p =>
      p.pnrId === pnr.pnrId ? { ...p, sectorSchedules: [] as PnrSectorSchedule[] } : p
    )
    const log: DemoLog = { logId: newId('LOG'), action: 'คืนค่า Schedule', message: `คืนค่า Sector Schedule จาก Flight Set สำหรับ PNR ${pnr.pnrDisplay}`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    showToast('คืนค่า Schedule เรียบร้อยแล้ว')
  }

  const handleDuplicate = (pnr: DemoPNR) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const dup: DemoPNR = { ...pnr, pnrId: newId('PNR'), pnrCode: '', dummyPnr: generateDummy(pnr.travelStart, liveStock), pnrType: 'dummy', pnrDisplay: '', seatUsed: 0, seatBalance: pnr.seatTotal, ttlDate: null, ttlTime: null, ttlDateTime: null }
    dup.pnrDisplay = dup.dummyPnr
    const log: DemoLog = { logId: newId('LOG'), action: 'Duplicate PNR', message: `Duplicate: ${pnr.pnrDisplay} → ${dup.pnrDisplay}`, createdAt: now, createdBy: 'System' }
    const newPnrs = [...liveStock.pnrs, dup]
    const updated: DemoStock = { ...liveStock, pnrs: newPnrs, summary: calculateStockSummary(newPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    showToast('Duplicate PNR สำเร็จ')
  }

  const handleClosePnr = () => {
    if (!liveStock || !closingPnr) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p =>
      p.pnrId !== closingPnr.pnrId ? p : { ...p, pnrStatus: 'CLOSED' as const, closedAt: now, closedBy: 'System' }
    )
    const log: DemoLog = { logId: newId('LOG'), action: 'ปิด PNR', message: `ปิด PNR ${closingPnr.pnrDisplay}`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setShowClosePnrModal(false)
    setClosingPnr(null)
    showToast('ปิด PNR สำเร็จ')
  }

  const handleCancelPnr = () => {
    if (!liveStock || !cancellingPnr) return
    if (!cancelReason.trim()) { setCancelReasonError('กรุณาระบุเหตุผลการยกเลิก'); return }
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p =>
      p.pnrId !== cancellingPnr.pnrId ? p : { ...p, pnrStatus: 'CANCELLED' as const, cancelledAt: now, cancelledBy: 'System', cancellationReason: cancelReason.trim() }
    )
    const log: DemoLog = { logId: newId('LOG'), action: 'ยกเลิก PNR', message: `ยกเลิก PNR ${cancellingPnr.pnrDisplay} — เหตุผล: ${cancelReason.trim()}`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setShowCancelPnrModal(false)
    setCancellingPnr(null)
    setCancelReason('')
    setCancelReasonError('')
    showToast('ยกเลิก PNR สำเร็จ')
  }

  const handleActivatePnr = (pnr: DemoPNR) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p =>
      p.pnrId !== pnr.pnrId ? p : { ...p, pnrStatus: 'ACTIVE' as const, activatedAt: now, activatedBy: 'System' }
    )
    const log: DemoLog = { logId: newId('LOG'), action: 'เปิดใช้งาน PNR', message: `เปิดใช้งาน PNR ${pnr.pnrDisplay}`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    showToast('เปิดใช้งาน PNR สำเร็จ')
  }

  const handleBulkActivatePnr = (pnrIds: Set<string>) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p => {
      if (!pnrIds.has(p.pnrId)) return p
      if (getPnrOperationalStatus(p) !== 'PENDING') return p
      return { ...p, pnrStatus: 'ACTIVE' as const, activatedAt: now, activatedBy: 'System' }
    })
    const log: DemoLog = { logId: newId('LOG'), action: 'เปิดใช้งาน PNR (bulk)', message: `เปิดใช้งาน ${pnrIds.size} PNR พร้อมกัน`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setSelectedPnrIds(new Set())
    showToast(`เปิดใช้งาน ${pnrIds.size} PNR สำเร็จ`)
  }

  const handleBulkClosePnr = (pnrIds: Set<string>) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p => {
      if (!pnrIds.has(p.pnrId)) return p
      if (getPnrOperationalStatus(p) !== 'ACTIVE') return p
      return { ...p, pnrStatus: 'CLOSED' as const, closedAt: now, closedBy: 'System' }
    })
    const log: DemoLog = { logId: newId('LOG'), action: 'ปิด PNR (bulk)', message: `ปิด ${pnrIds.size} PNR พร้อมกัน`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setSelectedPnrIds(new Set())
    showToast(`ปิด ${pnrIds.size} PNR สำเร็จ`)
  }

  const handleBulkCancelPnr = (pnrIds: Set<string>, reason: string) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const updatedPnrs = liveStock.pnrs.map(p => {
      if (!pnrIds.has(p.pnrId)) return p
      const opStatus = getPnrOperationalStatus(p)
      if (opStatus !== 'PENDING' && opStatus !== 'ACTIVE') return p
      return { ...p, pnrStatus: 'CANCELLED' as const, cancelledAt: now, cancelledBy: 'System', cancellationReason: reason }
    })
    const log: DemoLog = { logId: newId('LOG'), action: 'ยกเลิก PNR (bulk)', message: `ยกเลิก ${pnrIds.size} PNR พร้อมกัน — เหตุผล: ${reason}`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setSelectedPnrIds(new Set())
    showToast(`ยกเลิก ${pnrIds.size} PNR สำเร็จ`)
  }

  const handleConvertToReal = () => {
    if (!liveStock || !convertingPnr) return
    if (!convertCode.trim()) { setConvertError('กรุณาระบุ PNR Code'); return }
    const dup = checkPNRDuplicatesInSystem([{ pnr_code: convertCode.trim() }])
    if (dup.hasConflicts) {
      const s = dup.conflicts[0]?.conflictingStock
      setConvertError(s ? `PNR "${convertCode}" มีอยู่ใน Stock ${s.stockCode}` : `PNR "${convertCode}" มีอยู่แล้วในระบบ`)
      return
    }
    const now = new Date().toISOString()
    const log: DemoLog = { logId: newId('LOG'), action: 'เปลี่ยน Dummy → PNR จริง', message: `${convertingPnr.dummyPnr} → ${convertCode.trim()}`, createdAt: now, createdBy: 'System' }
    const updated_pnr: DemoPNR = { ...convertingPnr, pnrCode: convertCode.trim(), dummyPnr: '', pnrType: 'real', pnrDisplay: convertCode.trim() }
    const newPnrs = liveStock.pnrs.map(p => p.pnrId === convertingPnr.pnrId ? updated_pnr : p)
    const updated: DemoStock = { ...liveStock, pnrs: newPnrs, summary: calculateStockSummary(newPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setShowConvertModal(false)
    setConvertingPnr(null)
    setConvertCode('')
    setConvertError('')
    showToast('เปลี่ยนเป็น PNR จริงสำเร็จ')
  }

  // ─── Custom Flight functions ─────────────────────────────────────────────────

  const openCFModal = (pnr: DemoPNR, fs: DemoFlightSet, mode: 'create' | 'edit', affectsCount = 1) => {
    const initSectors: CfSector[] = (fs.sectors ?? []).map((s, i) => ({
      sectorId: s.sectorId ?? newId('SEC'),
      seq: i + 1,
      sectorType: normalizeSegmentType(s.sectorType),
      airlineCode: s.airlineCode,
      flightNo: s.flightNo,
      depAirportCode: s.depAirportCode,
      arrAirportCode: s.arrAirportCode,
      depTime: s.depTime,
      arrTime: s.arrTime,
      arrDayOffset: s.arrDayOffset ?? (s.arrTime < s.depTime ? 1 : 0),
      dayOffset: s.dayOffset,
      remark: s.remark ?? '',
    }))
    setCfPnr(pnr)
    setCfMode(mode)
    // edit: ID ของ FS ที่จะ update in-place
    // create: null (สร้างใหม่)
    setCfEditFsId(mode === 'edit' ? fs.flightSetId : null)
    // sourceFlightSetId: FS ต้นทางที่ copy sectors มา (ใช้สำหรับ no-change detection + duplicate exclude)
    // ทั้ง create และ edit ใช้ ID เดียวกัน (FS ปัจจุบันที่โหลดมา)
    setCfSourceFsId(fs.flightSetId)
    setCfEditAffectsCount(affectsCount)
    setCfSectors(initSectors)
    setCfSetName(mode === 'edit' ? fs.flightSetName : autoCustomName(pnr))
    setCfErrors({})
    setCfDupFS(null)
    setCfSaving(false)
    setShowCFModal(true)
  }

  const openCustomFlight = (pnr: DemoPNR) => {
    if (!liveStock) return
    const flightSets = getStockFlightSets(liveStock)
    const fs = flightSets.find(f => f.flightSetId === pnr.flightSetId) ?? flightSets[0]
    const usedCount = liveStock.pnrs.filter(p => p.flightSetId === fs.flightSetId).length

    // Case B: edit mode — custom FS created by this PNR, used only by this PNR
    if (fs.isCustom && fs.createdFromPnrId === pnr.pnrId && usedCount === 1) {
      openCFModal(pnr, fs, 'edit', 1)
      return
    }

    // Case C: custom FS used by multiple PNRs — ask before proceeding
    if (fs.isCustom && usedCount > 1) {
      setCfMultiPnr(pnr)
      setCfMultiFS(fs)
      setShowCFMultiConfirm(true)
      return
    }

    // Case A: create mode (default FS or single-use custom owned by another PNR)
    openCFModal(pnr, fs, 'create')
  }

  const createAndLinkCustomFS = (sectorsToSave: CfSector[], finalName: string) => {
    if (!liveStock || !cfPnr) return
    const now = new Date().toISOString()
    const newFS: DemoFlightSet = {
      flightSetId: newId('FSET'),
      flightSetName: finalName,
      isCustom: true,
      createdFromPnrId: cfPnr.pnrId,
      sectors: sectorsToSave.map((s, i) => ({
        sectorId: s.sectorId,
        seq: i + 1,
        sectorType: s.sectorType,
        airlineCode: s.airlineCode,
        flightNo: s.flightNo,
        depAirportCode: s.depAirportCode,
        arrAirportCode: s.arrAirportCode,
        depTime: s.depTime,
        arrTime: s.arrTime,
        arrDayOffset: s.arrDayOffset,
        dayOffset: s.dayOffset,
        remark: s.remark,
      })),
    }
    const flightSets = getStockFlightSets(liveStock)
    const oldFS = flightSets.find(f => f.flightSetId === cfPnr.flightSetId) ?? flightSets[0]

    const newTravelEnd = calcTravelEndFromSectors(
      cfPnr.travelStart,
      newFS.sectors.map(s => ({ sector_type: s.sectorType, day_offset: s.dayOffset }))
    ) ?? cfPnr.travelEnd

    const newSectorDates = newFS.sectors.map(s => {
      try { const d = addDays(parseISO(cfPnr.travelStart), s.dayOffset - 1); return { sectorType: s.sectorType, date: fnsFormat(d, 'yyyy-MM-dd') } }
      catch { return { sectorType: s.sectorType, date: '' } }
    })

    const changeDesc = buildCfChangeLog(sectorsToSave, oldFS?.sectors ?? liveStock.sectors)
    const log: DemoLog = {
      logId: newId('LOG'),
      action: 'Create Custom Flight',
      message: `PNR ${cfPnr.pnrDisplay}: สร้าง Custom Flight "${newFS.flightSetName}"${changeDesc ? ` — ${changeDesc}` : ''}`,
      createdAt: now, createdBy: 'System',
    }

    const newSectorSchedules = buildSectorSchedules(newFS.sectors, cfPnr.travelStart)
    const updatedPnr: DemoPNR = { ...cfPnr, flightSetId: newFS.flightSetId, travelEnd: newTravelEnd, sectorDates: newSectorDates, sectorSchedules: newSectorSchedules }
    const newPnrs = liveStock.pnrs.map(p => p.pnrId === cfPnr.pnrId ? updatedPnr : p)
    const updated: DemoStock = {
      ...liveStock,
      flightSets: [...flightSets, newFS],
      pnrs: newPnrs,
      summary: calculateStockSummary(newPnrs),
      updatedAt: now,
      logs: [log, ...liveStock.logs],
    }
    saveDemoStock(updated)
    onUpdate(updated)
    setCfSaving(false)
    setShowCFModal(false)
    setCfPnr(null)
    showToast(`สร้าง Custom Flight "${newFS.flightSetName}" สำเร็จ`)
  }

  const updateExistingFS = (sectorsToSave: CfSector[], finalName: string) => {
    if (!liveStock || !cfPnr || !cfEditFsId) return
    const now = new Date().toISOString()
    const flightSets = getStockFlightSets(liveStock)
    const existingFS = flightSets.find(f => f.flightSetId === cfEditFsId)
    if (!existingFS) return

    const updatedDemoSectors: DemoSector[] = sectorsToSave.map((s, i) => ({
      sectorId: s.sectorId, seq: i + 1, sectorType: s.sectorType,
      airlineCode: s.airlineCode, flightNo: s.flightNo,
      depAirportCode: s.depAirportCode, arrAirportCode: s.arrAirportCode,
      depTime: s.depTime, arrTime: s.arrTime,
      arrDayOffset: s.arrDayOffset, dayOffset: s.dayOffset, remark: s.remark,
    }))
    const updatedFS: DemoFlightSet = { ...existingFS, flightSetName: finalName, sectors: updatedDemoSectors }

    // Recalculate travelEnd + sectorDates for ALL PNRs using this FS
    const updatedPnrs = liveStock.pnrs.map(p => {
      if (p.flightSetId !== cfEditFsId) return p
      const newTravelEnd = calcTravelEndFromSectors(
        p.travelStart, updatedDemoSectors.map(s => ({ sector_type: s.sectorType, day_offset: s.dayOffset }))
      ) ?? p.travelEnd
      const newSectorDates = updatedDemoSectors.map(s => {
        try { const d = addDays(parseISO(p.travelStart), s.dayOffset - 1); return { sectorType: s.sectorType, date: fnsFormat(d, 'yyyy-MM-dd') } }
        catch { return { sectorType: s.sectorType, date: '' } }
      })
      return { ...p, travelEnd: newTravelEnd, sectorDates: newSectorDates, sectorSchedules: buildSectorSchedules(updatedDemoSectors, p.travelStart) }
    })

    const changeDesc = buildCfChangeLog(sectorsToSave, existingFS.sectors)
    const log: DemoLog = {
      logId: newId('LOG'), action: 'Edit Custom Flight',
      message: `แก้ไข Flight Set "${existingFS.flightSetName}"${finalName !== existingFS.flightSetName ? ` → "${finalName}"` : ''}${changeDesc ? ` — ${changeDesc}` : ''} (PNR: ${cfPnr.pnrDisplay})`,
      createdAt: now, createdBy: 'System',
    }

    const updatedFlightSets = flightSets.map(f => f.flightSetId === cfEditFsId ? updatedFS : f)
    const isFirstFS = updatedFlightSets[0]?.flightSetId === cfEditFsId
    const updated: DemoStock = {
      ...liveStock,
      sectors: isFirstFS ? updatedDemoSectors : liveStock.sectors,
      flightSets: updatedFlightSets,
      pnrs: updatedPnrs,
      summary: calculateStockSummary(updatedPnrs),
      updatedAt: now,
      logs: [log, ...liveStock.logs],
    }
    saveDemoStock(updated)
    onUpdate(updated)
    setCfSaving(false)
    setShowCFModal(false)
    setCfPnr(null)
    showToast(`แก้ไข "${finalName}" สำเร็จ${cfEditAffectsCount > 1 ? ` (กระทบ ${cfEditAffectsCount} PNR)` : ''}`)
  }

  const handleSaveCF = () => {
    if (!liveStock || !cfPnr) return

    const flightSets = getStockFlightSets(liveStock)
    const minSectors = liveStock.ticketType === 'FIT' ? 1 : 2

    // ── Normalize sectors (prevent stale value / case mismatch) ──────────────
    const normalizedSectors = cfSectors.map(s => ({ ...s, sectorType: normalizeSegmentType(s.sectorType) }))
    setCfSectors(normalizedSectors)

    if (process.env.NODE_ENV !== 'production') {
      console.log('[CustomFlight] mode:', cfMode,
        '| editFsId:', cfEditFsId ?? '—',
        '| sourceFsId:', cfSourceFsId ?? '—',
        '| pnrId:', cfPnr.pnrId,
        '\n segments:', normalizedSectors.map(s => ({
          type: s.sectorType, airline: s.airlineCode, flightNo: s.flightNo,
          from: s.depAirportCode, to: s.arrAirportCode,
          depTime: s.depTime, arrTime: s.arrTime, plusDay: s.arrDayOffset, travelDay: s.dayOffset,
        }))
      )
    }

    // ── Name validation ──────────────────────────────────────────────────────
    const nameErrs: Record<string, string> = {}
    if (!cfSetName.trim()) {
      nameErrs.cfName = 'กรุณาระบุชื่อ Flight Set'
    } else if (cfMode === 'edit' && cfEditFsId) {
      // Edit: ชื่อเดิมใช้ได้ เช็ก duplicate เฉพาะเมื่อเปลี่ยนชื่อ
      const editFSOriginalName = flightSets.find(f => f.flightSetId === cfEditFsId)?.flightSetName ?? ''
      if (cfSetName.trim().toLowerCase() !== editFSOriginalName.trim().toLowerCase()) {
        const dup = flightSets.find(f => f.flightSetId !== cfEditFsId && f.flightSetName.trim().toLowerCase() === cfSetName.trim().toLowerCase())
        if (dup) nameErrs.cfName = 'ชื่อซ้ำกับ Flight Set ที่มีอยู่'
      }
    }

    // Create: auto-suffix ชื่อซ้ำ ไม่แสดง error (UX ดีกว่า)
    const finalName = cfMode === 'create'
      ? ensureUniqueName(cfSetName.trim(), flightSets)
      : cfSetName.trim()

    const sectorErrs = validateCfSectors(normalizedSectors, minSectors)
    const allErrs = { ...nameErrs, ...sectorErrs }
    if (Object.keys(allErrs).length) { setCfErrors(allErrs); return }

    // ── No-change detection (ใช้ cfSourceFsId — ไม่ใช่ cfPnr.flightSetId) ──
    // sourceFS คือ FS ที่เราโหลด sectors มา ทั้ง create/edit
    const sourceFS = cfSourceFsId ? flightSets.find(f => f.flightSetId === cfSourceFsId) : null
    const basesSectors = sourceFS?.sectors ?? liveStock.sectors
    const sectorsUnchanged = cfSectorsEqual(normalizedSectors, basesSectors)
    const nameUnchanged    = cfMode === 'edit' && finalName === (sourceFS?.flightSetName ?? '')
    if (sectorsUnchanged && (cfMode === 'create' || nameUnchanged)) {
      showToast('ไม่มีการเปลี่ยนแปลงข้อมูล Flight')
      setShowCFModal(false)
      setCfPnr(null)
      return
    }

    // ── Edit mode: update in-place using cfEditFsId ───────────────────────────
    if (cfMode === 'edit' && cfEditFsId) {
      setCfSaving(true)
      updateExistingFS(normalizedSectors, finalName)
      return
    }

    // ── Create mode: check for duplicate segment content ──────────────────────
    // exclude cfSourceFsId (FS ต้นทาง) จากการ match
    const matchFS = findMatchingFS(normalizedSectors, flightSets, cfSourceFsId ?? '')
    if (matchFS) {
      setCfDupFS(matchFS)
      setShowCFDupConfirm(true)
      return
    }

    setCfSaving(true)
    createAndLinkCustomFS(normalizedSectors, finalName)
  }

  const confirmUseDupFS = (useExisting: boolean) => {
    if (!liveStock || !cfPnr) return
    setShowCFDupConfirm(false)
    if (useExisting && cfDupFS) {
      const now = new Date().toISOString()
      const newTravelEnd = calcTravelEndFromSectors(
        cfPnr.travelStart,
        cfDupFS.sectors.map(s => ({ sector_type: s.sectorType, day_offset: s.dayOffset }))
      ) ?? cfPnr.travelEnd
      const newSectorDates = cfDupFS.sectors.map(s => {
        try { const d = addDays(parseISO(cfPnr.travelStart), s.dayOffset - 1); return { sectorType: s.sectorType, date: fnsFormat(d, 'yyyy-MM-dd') } }
        catch { return { sectorType: s.sectorType, date: '' } }
      })
      const log: DemoLog = {
        logId: newId('LOG'),
        action: 'Assign PNR to Existing Flight Set',
        message: `PNR ${cfPnr.pnrDisplay}: เปลี่ยนไปใช้ Flight Set "${cfDupFS.flightSetName}" (มีอยู่แล้ว)`,
        createdAt: now, createdBy: 'System',
      }
      const newSectorSchedules = buildSectorSchedules(cfDupFS.sectors, cfPnr.travelStart)
      const updatedPnr: DemoPNR = { ...cfPnr, flightSetId: cfDupFS.flightSetId, travelEnd: newTravelEnd, sectorDates: newSectorDates, sectorSchedules: newSectorSchedules }
      const newPnrs = liveStock.pnrs.map(p => p.pnrId === cfPnr.pnrId ? updatedPnr : p)
      const updated: DemoStock = {
        ...liveStock,
        pnrs: newPnrs,
        summary: calculateStockSummary(newPnrs),
        updatedAt: now,
        logs: [log, ...liveStock.logs],
      }
      saveDemoStock(updated)
      onUpdate(updated)
      setShowCFModal(false)
      setCfPnr(null)
      showToast(`เปลี่ยนไปใช้ Flight Set "${cfDupFS.flightSetName}"`)
    } else {
      const flightSetsNow = liveStock ? getStockFlightSets(liveStock) : []
      const dedupedName = ensureUniqueName(cfSetName.trim(), flightSetsNow)
      setCfSaving(true)
      createAndLinkCustomFS(cfSectors, dedupedName)
    }
    setCfDupFS(null)
  }

  // Derive PNRRow[] display
  const liveFlightSets = liveStock ? getStockFlightSets(liveStock) : []

  // Build route text from flight set sectors → stock sectors → stock routeText
  const buildPnrRoute = (pnr: DemoPNR): string | null => {
    const fs = liveFlightSets.find(f => f.flightSetId === pnr.flightSetId) ?? liveFlightSets[0]
    const fsSectors = fs?.sectors
    if (fsSectors && fsSectors.length > 0) {
      const sorted = [...fsSectors].sort((a, b) => a.seq - b.seq)
      const route = buildRouteText(sorted.map(s => ({ dep_airport_code: s.depAirportCode, arr_airport_code: s.arrAirportCode })))
      if (route) return route
    }
    if (liveStock?.sectors && liveStock.sectors.length > 0) {
      const route = buildRouteText(liveStock.sectors.map(s => ({ dep_airport_code: s.depAirportCode, arr_airport_code: s.arrAirportCode })))
      if (route) return route
    }
    return liveStock?.routeText || null
  }

  const pnrRows: PNRRow[] = liveStock
    ? liveStock.pnrs.map(p => ({
        id: p.pnrId,
        pnr_code: p.pnrCode || null,
        dummy_pnr: p.dummyPnr || null,
        pnr_type: p.pnrType,
        route: buildPnrRoute(p),
        travel_start: p.travelStart,
        travel_end: p.travelEnd,
        seat_total: p.seatTotal,
        seat_used: p.seatUsed,
        seat_balance: p.seatBalance,
        price_format: p.priceFormat ?? 'FARE',
        breakdown: p.breakdown ?? false,
        fare: p.fare,
        yq: p.yq ?? 0,
        tax_type: p.taxType,
        tax: p.tax ?? 0,
        total_amount: p.total,
        condition: liveStock.conditions.find(c => c.condition.conditionCode === p.conditionCode)?.condition.conditionName || null,
        condition_code: p.conditionCode || null,
        next_ttl: p.ttlDateTime,
        ttl_type: p.ttlType ?? null,
        ttl_days_before: p.ttlDaysBefore ?? null,
        ttl_date: p.ttlDate,
        ttl_time: p.ttlTime,
        status: p.status,
      }))
    : mockPNRs

  const conditions = liveStock?.conditions ?? []
  const pnrStatuses = ['Pending', 'Confirmed']
  const pnrStatusLabels: Record<string, string> = { Pending: 'รอยืนยัน', Confirmed: 'ยืนยันแล้ว' }

  const activeConditions = conditions.filter(c => c.condition.status === 'Active')
  const noCond = (liveStock?.pnrs ?? []).filter(p => !p.conditionCode)

  const applyConditionChange = (pnrIds: string[], newCode: string) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const condName = conditions.find(c => c.condition.conditionCode === newCode)?.condition.conditionName ?? newCode
    const updatedPnrs = liveStock.pnrs.map(p => {
      if (!pnrIds.includes(p.pnrId)) return p
      return { ...p, conditionCode: newCode }
    })
    const log: DemoLog = {
      logId: newId('LOG'),
      action: 'เปลี่ยน Condition',
      message: newCode ? `เปลี่ยน Condition เป็น "${condName}" (${pnrIds.length} PNR)` : `ลบ Condition ออก (${pnrIds.length} PNR)`,
      createdAt: now, createdBy: 'System',
    }
    const updated: DemoStock = { ...liveStock, pnrs: updatedPnrs, summary: calculateStockSummary(updatedPnrs), updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setSelectedPnrIds(new Set())
    setCondChangeConfirm(null)
    setShowBulkCond(false)
    showToast(newCode ? `เปลี่ยน Condition เป็น "${condName}" (${pnrIds.length} PNR)` : `ลบ Condition ออก (${pnrIds.length} PNR)`)
  }

  const breakdownMismatch = form.priceFormat === 'ALL_IN' && form.breakdown
    ? Math.round((Number(form.fare)||0)*100) + Math.round((Number(form.yq)||0)*100) + Math.round((Number(form.tax)||0)*100) !== Math.round((Number(form.allIn)||0)*100)
    : false

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2 text-sm text-[#05a94f] bg-green-50 border border-green-200 rounded-xl px-3 py-2">
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      {/* Active-series notification */}
      {canEdit && liveStock?.status === 'Active' && (
        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
          <AlertTriangle size={13} className="shrink-0" />
          PNR ใหม่ที่เพิ่มใน Series Active จะเริ่มต้นเป็น <strong>PENDING</strong> — ต้องเปิดใช้งานด้วยตนเอง
        </div>
      )}

      {/* Action Bar */}
      {canEdit && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" icon={<PlusCircle size={13} />} onClick={openAdd}>เพิ่ม PNR</Button>
            <Button size="sm" variant="outline" icon={<PlusSquare size={13} />} onClick={() => setShowBulkAdd(true)}>เพิ่มหลาย PNR</Button>
            <Button size="sm" variant="outline" disabled title="Coming soon">Import PNR</Button>
            {selectedPnrIds.size > 0 && (
              <>
                <span className="text-xs text-slate-500 ml-1">เลือก {selectedPnrIds.size} PNR</span>
                <Button size="sm" variant="outline" onClick={() => { setBulkCondCode(''); setShowBulkCond(true) }}>
                  เปลี่ยน Condition
                </Button>
                {liveStock?.status === 'Active' && (
                  <Button size="sm" variant="outline"
                    onClick={() => handleBulkActivatePnr(selectedPnrIds)}
                    className="border-green-300 text-green-700 hover:bg-green-50">
                    เปิดใช้งาน
                  </Button>
                )}
                <Button size="sm" variant="outline"
                  onClick={() => handleBulkClosePnr(selectedPnrIds)}
                  className="border-slate-400 text-slate-600 hover:bg-slate-50">
                  ปิด PNR
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => { setBulkCancelReason(''); setBulkCancelReasonError(''); setShowBulkCancel(true) }}
                  className="border-red-300 text-red-600 hover:bg-red-50">
                  ยกเลิก PNR
                </Button>
                <button onClick={() => setSelectedPnrIds(new Set())} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                  <X size={12} />
                </button>
              </>
            )}
          </div>
          {noCond.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              <AlertTriangle size={12} />
              <span>{noCond.length} PNR ยังไม่ได้ระบุ Condition</span>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 h-9">
                {canEdit && (
                  <th className="sticky left-0 z-20 bg-slate-50 w-8 px-2 text-center border-r border-slate-100">
                    <input
                      type="checkbox"
                      checked={pnrRows.length > 0 && selectedPnrIds.size === pnrRows.length}
                      ref={el => { if (el) el.indeterminate = selectedPnrIds.size > 0 && selectedPnrIds.size < pnrRows.length }}
                      onChange={e => setSelectedPnrIds(e.target.checked ? new Set(pnrRows.map(r => r.id)) : new Set())}
                      className="rounded border-slate-300 accent-[#05a94f]"
                    />
                  </th>
                )}
                <th className={`${canEdit ? 'sticky left-8 z-20' : 'sticky left-0 z-20'} bg-slate-50 min-w-[190px] px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap border-r border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.04)]`}>PNR</th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[50px]">Sec</th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[48px]">Day</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[80px]">Dep Date</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[64px]">Dep Time</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[80px]">Arr Date</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[64px]">Arr Time</th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[48px]">+Day</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[48px]">Seat</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[48px]">Used</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[55px]">Bal.</th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[85px]">ประเภทราคา</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[75px]">Fare</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[65px]">Tax</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[65px]">YQ</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[85px]">ยอดสุทธิ</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[125px]">Condition</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[115px]">TTL Date</th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[90px]">การยืนยัน</th>
                {canEdit && (
                  <th className="sticky right-0 z-20 bg-slate-50 w-[64px] px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-l border-slate-200 shadow-[-2px_0_4px_rgba(0,0,0,0.04)]">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {pnrRows.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 21 : 19} className="px-4 py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูล PNR</td>
                </tr>
              ) : (
                pnrRows.map((p, pIdx) => {
                  const demoPnr = liveStock?.pnrs.find(dp => dp.pnrId === p.id)
                  const allFS = liveStock ? getStockFlightSets(liveStock) : []
                  const liveFS = allFS.find(f => f.flightSetId === demoPnr?.flightSetId) ?? allFS[0]
                  const sectSched = (demoPnr && liveFS) ? getPnrSectorSchedules(demoPnr, liveFS) : []
                  const rowCount = Math.max(sectSched.length, 1)
                  const isSelected = selectedPnrIds.has(p.id)
                  const bgClass = isSelected ? 'bg-emerald-50/40' : 'bg-white'
                  const sectorRows: (typeof sectSched[0] | null)[] = sectSched.length > 0 ? sectSched : [null]

                  return (
                    <Fragment key={p.id}>
                      {sectorRows.map((sc, si) => {
                        const isFirstRow = si === 0
                        const rowBorderClass = isFirstRow
                          ? (pIdx === 0 ? '' : 'border-t border-slate-200')
                          : 'border-t border-slate-100'

                        return (
                          <tr key={si} className={`${bgClass} hover:bg-slate-50/60 transition-colors ${rowBorderClass}`}>
                            {/* Checkbox (PNR-level, rowspan) */}
                            {isFirstRow && canEdit && (
                              <td rowSpan={rowCount} className="sticky left-0 z-10 bg-inherit w-8 px-2 text-center align-top pt-2 border-r border-slate-100">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={e => setSelectedPnrIds(prev => {
                                    const s = new Set(prev)
                                    if (e.target.checked) s.add(p.id); else s.delete(p.id)
                                    return s
                                  })}
                                  className="rounded border-slate-300 accent-[#05a94f]"
                                />
                              </td>
                            )}
                            {/* PNR cell (PNR-level, rowspan) */}
                            {isFirstRow && (
                              <td rowSpan={rowCount} className={`${canEdit ? 'sticky left-8 z-10' : 'sticky left-0 z-10'} bg-inherit min-w-[190px] px-2 py-1.5 align-top border-r border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.04)]`}>
                                <PNRCell code={p.pnr_code} dummy={p.dummy_pnr} type={p.pnr_type} route={p.route} />
                              </td>
                            )}

                            {/* Sector badge */}
                            <td className="px-2 py-1.5 text-center">
                              {sc ? (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                  sc.sectorType === 'Departure' ? 'bg-green-100 text-green-700' :
                                  sc.sectorType === 'Arrival'   ? 'bg-purple-100 text-purple-700' :
                                                                  'bg-amber-100 text-amber-700'
                                }`}>S{sc.sequence}</span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            {/* Day */}
                            <td className="px-2 py-1.5 text-center font-semibold tracking-wide text-slate-600 whitespace-nowrap">
                              {sc?.departureDate ? (() => {
                                try {
                                  const [y, m, d] = sc.departureDate.split('-').map(Number)
                                  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(y, m - 1, d).getDay()]
                                } catch { return '—' }
                              })() : '—'}
                            </td>
                            {/* Dep Date */}
                            <td className="px-2 py-1.5 whitespace-nowrap">{sc?.departureDate ? formatDate(sc.departureDate) : '—'}</td>
                            {/* Dep Time */}
                            <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">
                              {sc?.departureTime ? sc.departureTime : <span className="text-slate-300 italic text-[10px]">ยังไม่ระบุ</span>}
                            </td>
                            {/* Arr Date */}
                            <td className="px-2 py-1.5 whitespace-nowrap">{sc?.arrivalDate ? formatDate(sc.arrivalDate) : '—'}</td>
                            {/* Arr Time */}
                            <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">
                              {sc?.arrivalTime ? sc.arrivalTime : <span className="text-slate-300 italic text-[10px]">ยังไม่ระบุ</span>}
                            </td>
                            {/* +Day */}
                            <td className="px-2 py-1.5 text-center whitespace-nowrap">
                              {sc
                                ? sc.plusDay > 0 ? <span className="text-amber-600 font-bold">+{sc.plusDay}</span> : <span className="text-slate-400">0</span>
                                : '—'}
                            </td>

                            {/* PNR-level cells (first row only, rowspan) */}
                            {isFirstRow && (
                              <>
                                {/* Seat */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right font-semibold align-top">{p.seat_total}</td>
                                {/* Used */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right text-slate-400 align-top">{p.seat_used}</td>
                                {/* Balance */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right align-top">
                                  <span className={`font-bold ${p.seat_balance === 0 ? 'text-red-500' : p.seat_balance / p.seat_total < 0.2 ? 'text-orange-500' : 'text-[#05a94f]'}`}>
                                    {p.seat_balance}
                                  </span>
                                </td>
                                {/* Price type */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-center align-top">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                    p.price_format === 'FARE_YQ' ? 'bg-amber-100 text-amber-700' :
                                    p.price_format === 'ALL_IN'  ? 'bg-blue-100 text-blue-700' :
                                                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {p.price_format === 'FARE_YQ' ? 'FARE+YQ' : p.price_format === 'ALL_IN' ? 'ALL IN' : 'FARE'}
                                  </span>
                                </td>
                                {/* Fare */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right font-semibold tabular-nums align-top">
                                  {p.fare > 0 ? formatNumber(p.fare) : <span className="text-slate-300">—</span>}
                                </td>
                                {/* Tax */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right tabular-nums text-slate-600 align-top">
                                  {p.price_format === 'ALL_IN'
                                    ? <span className="text-[10px] text-slate-400 italic">รวมแล้ว</span>
                                    : p.tax > 0 ? formatNumber(p.tax) : p.tax === 0 ? '0' : <span className="text-slate-300">—</span>}
                                </td>
                                {/* YQ */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right tabular-nums text-slate-600 align-top">
                                  {(p.price_format === 'FARE_YQ' || p.price_format === 'ALL_IN')
                                    ? <span className="text-[10px] text-slate-400 italic">รวมแล้ว</span>
                                    : p.yq > 0 ? formatNumber(p.yq) : p.yq === 0 ? '0' : <span className="text-slate-300">—</span>}
                                </td>
                                {/* Net total */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-right font-bold tabular-nums text-slate-800 align-top">
                                  {p.total_amount > 0 ? formatNumber(p.total_amount) : <span className="text-slate-300">—</span>}
                                </td>
                                {/* Condition */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 align-top">
                                  {canEdit ? (
                                    <div className="relative inline-block min-w-[110px]">
                                      <select
                                        value={p.condition_code ?? ''}
                                        onChange={e => {
                                          const v = e.target.value
                                          if (v !== (p.condition_code ?? ''))
                                            setCondChangeConfirm({ pnrIds: [p.id], newCode: v })
                                        }}
                                        className={`text-[10px] font-semibold rounded-full pl-2.5 pr-6 py-0.5 border appearance-none cursor-pointer w-full ${
                                          p.condition_code
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-400'
                                            : 'bg-slate-100 border-slate-200 text-slate-400 hover:border-slate-400'
                                        }`}
                                      >
                                        <option value="">— ไม่ระบุ —</option>
                                        {activeConditions.map(c => (
                                          <option key={c.condition.conditionCode} value={c.condition.conditionCode}>
                                            {c.condition.conditionName}
                                          </option>
                                        ))}
                                        {p.condition_code && !activeConditions.find(c => c.condition.conditionCode === p.condition_code) && (
                                          <option value={p.condition_code ?? ''}>{p.condition} (ปิดใช้งาน)</option>
                                        )}
                                      </select>
                                      <ChevronDown size={9} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                                    </div>
                                  ) : (
                                    p.condition ? <Badge variant="green">{p.condition}</Badge> : <span className="text-slate-300 italic text-[10px]">ไม่ระบุ</span>
                                  )}
                                </td>
                                {/* TTL Date — date first, then label */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-slate-700 align-top">
                                  {p.ttl_type === 'NONE' || (!p.ttl_type && !p.ttl_date) ? (
                                    <span className="text-slate-300">ไม่ระบุ</span>
                                  ) : (
                                    <div className="flex flex-col gap-0.5">
                                      {p.ttl_date && (
                                        <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">{formatTtlDisplay(p.ttl_date, p.ttl_time)}</span>
                                      )}
                                      {!p.ttl_date && p.next_ttl && (
                                        <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">{formatDateTime(p.next_ttl)}</span>
                                      )}
                                      {p.ttl_type === 'DAYS_BEFORE' && p.ttl_days_before != null && (
                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">ก่อนเดินทาง {p.ttl_days_before} วัน</span>
                                      )}
                                      {p.ttl_type === 'FIXED_DATE' && (
                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">วันที่กำหนดเอง</span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                {/* การยืนยัน */}
                                <td rowSpan={rowCount} className="px-2 py-1.5 text-center align-top">
                                  <PnrConfirmationStatusBadge status={demoPnr ? getPnrConfirmationStatus(demoPnr) : 'PENDING_CONFIRMATION'} />
                                </td>
                                {/* Actions */}
                                {canEdit && (
                                  <td rowSpan={rowCount} className="sticky right-0 z-10 bg-inherit px-1.5 py-1.5 align-top border-l border-slate-200 shadow-[-2px_0_4px_rgba(0,0,0,0.04)]">
                                    {demoPnr ? (() => {
                                      const opStatus = getPnrOperationalStatus(demoPnr)
                                      const canOperate = opStatus === 'PENDING' || opStatus === 'ACTIVE'
                                      return (
                                        <div className="flex items-center gap-0.5 justify-center">
                                          {canOperate && (
                                            <button
                                              title="แก้ไข"
                                              onClick={() => openEdit(demoPnr)}
                                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                            >
                                              <Pencil size={12} />
                                            </button>
                                          )}
                                          <PnrActionMenu
                                            opStatus={opStatus}
                                            isDummy={demoPnr.pnrType === 'dummy'}
                                            stockActive={liveStock?.status === 'Active'}
                                            canOperate={canOperate}
                                            onEditFlight={() => openCustomFlight(demoPnr)}
                                            onDuplicate={() => handleDuplicate(demoPnr)}
                                            onConvert={() => { setConvertingPnr(demoPnr); setShowConvertModal(true) }}
                                            onResetSchedule={() => handleResetSchedule(demoPnr)}
                                            onActivate={() => handleActivatePnr(demoPnr)}
                                            onClose={() => { setClosingPnr(demoPnr); setShowClosePnrModal(true) }}
                                            onCancel={() => { setCancellingPnr(demoPnr); setCancelReason(''); setCancelReasonError(''); setShowCancelPnrModal(true) }}
                                            onDelete={() => { setDeletingPnr(demoPnr); setShowDeleteModal(true) }}
                                          />
                                        </div>
                                      )
                                    })() : <span className="text-slate-300 text-center block">—</span>}
                                  </td>
                                )}
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
      </div>

      {/* Add/Edit PNR Modal */}
      <Modal
        open={showPNRModal}
        onClose={closeModal}
        title={editingPnrId ? `แก้ไข PNR${liveStock ? ` — ${liveStock.stockCode}` : ''}` : `เพิ่ม PNR — ${liveStock?.stockCode}`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>ยกเลิก</Button>
            <Button onClick={handleSavePNR} disabled={saving || breakdownMismatch}>
              {saving ? 'กำลังบันทึก...' : editingPnrId ? 'บันทึกการเปลี่ยนแปลง' : 'เพิ่ม PNR'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Flight Set Selector */}
          {liveStock && liveFlightSets.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Flight Set</label>
              <select value={form.flightSetId} onChange={e => handleFlightSetChange(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30">
                {liveFlightSets.map(fs => (
                  <option key={fs.flightSetId} value={fs.flightSetId}>{fs.flightSetName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sector Schedule — editable per-sector */}
          {liveStock && (() => {
            const previewFS = liveFlightSets.find(f => f.flightSetId === form.flightSetId) ?? liveFlightSets[0]
            const fsSectors = previewFS?.sectors ?? liveStock.sectors
            if (!fsSectors.length) return null
            const hasOverride = form.sectorOverrides.some(s => s.isDateOverride || s.isTimeOverride)
            return (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">ตารางเที่ยวบิน · {previewFS?.flightSetName}</span>
                  {hasOverride && <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">มีการแก้ไข</span>}
                </div>
                <div className="p-3 space-y-2">
                  {fsSectors.map((sec, i) => {
                    const ov = form.sectorOverrides.find(s => s.sectorId === sec.sectorId) ?? form.sectorOverrides[i]
                    const depDate = ov?.departureDate ?? ''
                    const depTime = ov?.isTimeOverride ? (ov.departureTime ?? '') : (sec.depTime ?? '')
                    const arrDate = ov?.arrivalDate ?? ''
                    const arrTime = ov?.isTimeOverride ? (ov.arrivalTime ?? '') : (sec.arrTime ?? '')
                    const isOv = !!(ov?.isDateOverride || ov?.isTimeOverride)
                    const computedPd = calculatePlusDay(depDate, arrDate)
                    const pdErr = computedPd !== null && computedPd < 0
                    const pdWarn = computedPd === 0 && depTime && arrTime && arrTime < depTime
                    return (
                      <div key={sec.sectorId} className={`rounded-lg border p-2.5 ${isOv ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            sec.sectorType === 'Departure' ? 'bg-green-100 text-green-700' :
                            sec.sectorType === 'Arrival'   ? 'bg-purple-100 text-purple-700' :
                                                              'bg-amber-100 text-amber-700'
                          }`}>S{sec.seq}</span>
                          <span className="text-[10px] text-slate-500">{sec.sectorType}</span>
                          {isOv && <span className="ml-auto text-[9px] text-amber-600 font-medium">แก้ไขแล้ว</span>}
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Dep Date</label>
                            <input type="date" value={depDate}
                              onChange={e => updateSectorDate(i, 'departureDate', e.target.value)}
                              className={`w-full border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${pdErr ? 'border-red-300' : 'border-slate-200'}`}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Dep Time</label>
                            <input type="text" placeholder="HH:mm" maxLength={5} value={depTime}
                              onChange={e => updateSectorTime(i, 'departureTime', e.target.value)}
                              className="w-full border border-slate-200 rounded-md px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Arr Date</label>
                            <input type="date" value={arrDate}
                              onChange={e => updateSectorDate(i, 'arrivalDate', e.target.value)}
                              className={`w-full border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${pdErr ? 'border-red-300' : 'border-slate-200'}`}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Arr Time</label>
                            <input type="text" placeholder="HH:mm" maxLength={5} value={arrTime}
                              onChange={e => updateSectorTime(i, 'arrivalTime', e.target.value)}
                              className="w-full border border-slate-200 rounded-md px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">+Day</label>
                            <div className={`w-full rounded-md px-2 py-1 text-xs text-center font-medium border ${
                              pdErr ? 'border-red-300 bg-red-50 text-red-600' :
                              pdWarn ? 'border-amber-300 bg-amber-50 text-amber-700' :
                              'border-slate-200 bg-slate-50 text-slate-600'
                            }`}>
                              {computedPd === null ? '—' : computedPd < 0 ? '—' : computedPd === 0 ? '0' : `+${computedPd}`}
                            </div>
                            {pdWarn && <p className="text-[9px] text-amber-600 mt-0.5">⚠ เที่ยวบินข้ามวัน?</p>}
                          </div>
                        </div>
                        {errors[`sectorDate_${i}`] && (
                          <p className="text-[10px] text-red-500 mt-1.5">{errors[`sectorDate_${i}`]}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          <div className="grid grid-cols-2 gap-3">
            {/* PNR Code */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                PNR Code <span className="text-slate-400 font-normal">(ว่าง = Dummy)</span>
              </label>
              <input
                type="text" placeholder="เช่น TG1234" value={form.pnrCode}
                onChange={e => setForm(f => ({ ...f, pnrCode: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${errors.pnrCode ? 'border-red-400' : 'border-slate-300'}`}
              />
              {errors.pnrCode && <p className="text-xs text-red-500 mt-1">{errors.pnrCode}</p>}
            </div>
            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30">
                {pnrStatuses.map(s => <option key={s} value={s}>{pnrStatusLabels[s]}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Travel Start */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Travel Start <span className="text-red-500">*</span></label>
              <input type="date" value={form.travelStart} onChange={e => handleTravelStartChange(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${errors.travelStart ? 'border-red-400' : 'border-slate-300'}`}
              />
              {errors.travelStart && <p className="text-xs text-red-500 mt-1">{errors.travelStart}</p>}
            </div>
            {/* Seat Total */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Seat Total <span className="text-red-500">*</span></label>
              <input type="number" min="1" placeholder="จำนวนที่นั่ง" value={form.seatTotal}
                onChange={e => setForm(f => ({ ...f, seatTotal: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${errors.seatTotal ? 'border-red-400' : 'border-slate-300'}`}
              />
              {errors.seatTotal && <p className="text-xs text-red-500 mt-1">{errors.seatTotal}</p>}
            </div>
          </div>

          {/* ─── Price Section ─── */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Format selector header */}
            <div className="bg-slate-50 border-b border-slate-200 px-3 py-2">
              <p className="text-xs font-medium text-slate-600 mb-2">สายการบินแจ้งราคามาแบบใด?</p>
              <div className="flex gap-1.5">
                {([
                  { v: 'FARE',    label: 'FARE',      desc: 'ยังไม่รวม YQ / Tax' },
                  { v: 'FARE_YQ', label: 'FARE + YQ', desc: 'ยังไม่รวม Tax' },
                  { v: 'ALL_IN',  label: 'ALL IN',    desc: 'รวม Fare + YQ + Tax' },
                ] as const).map(opt => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, priceFormat: opt.v, fare: '', yq: '', tax: '', allIn: '', breakdown: false }))}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-center border-2 transition-all ${
                      form.priceFormat === opt.v
                        ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f]'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-[11px] font-bold">{opt.label}</div>
                    <div className="text-[10px] opacity-60">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Fields */}
            <div className="p-3 space-y-3">
              {/* FARE mode: Fare required + YQ optional + Tax optional */}
              {form.priceFormat === 'FARE' && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Fare ({currency}) <span className="text-red-500">*</span></label>
                    <input type="number" min="0" placeholder="0" value={form.fare}
                      onChange={e => setForm(f => ({ ...f, fare: e.target.value }))}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${errors.fare ? 'border-red-400' : 'border-slate-300'}`}
                    />
                    {errors.fare && <p className="text-xs text-red-500 mt-1">{errors.fare}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      YQ ({currency}) <span className="text-slate-400 font-normal text-[10px]">optional</span>
                    </label>
                    <input type="number" min="0" placeholder="0" value={form.yq}
                      onChange={e => setForm(f => ({ ...f, yq: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tax ({currency}) <span className="text-slate-400 font-normal text-[10px]">optional</span>
                    </label>
                    <input type="number" min="0" placeholder="0" value={form.tax}
                      onChange={e => setForm(f => ({ ...f, tax: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
                    />
                  </div>
                </div>
              )}

              {/* FARE+YQ mode: single combined field + optional Tax */}
              {form.priceFormat === 'FARE_YQ' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Fare + YQ ({currency}) <span className="text-red-500">*</span></label>
                    <input type="number" min="0" placeholder="0" value={form.fare}
                      onChange={e => setForm(f => ({ ...f, fare: e.target.value }))}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${errors.fare ? 'border-red-400' : 'border-slate-300'}`}
                    />
                    {errors.fare && <p className="text-xs text-red-500 mt-1">{errors.fare}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tax ({currency}) <span className="text-slate-400 font-normal text-[10px]">optional</span>
                    </label>
                    <input type="number" min="0" placeholder="0" value={form.tax}
                      onChange={e => setForm(f => ({ ...f, tax: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
                    />
                  </div>
                </div>
              )}

              {/* ALL IN mode */}
              {form.priceFormat === 'ALL_IN' && (() => {
                const fareC  = Math.round((Number(form.fare)||0) * 100)
                const yqC    = Math.round((Number(form.yq)||0)  * 100)
                const taxC   = Math.round((Number(form.tax)||0)  * 100)
                const allInC = Math.round((Number(form.allIn)||0) * 100)
                const bkC    = fareC + yqC + taxC
                const diffC  = bkC - allInC
                const bkSum  = bkC / 100
                const diff   = diffC / 100
                const isMatch = allInC > 0 && diffC === 0
                return (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">All In / Total ({currency}) <span className="text-red-500">*</span></label>
                      <input type="number" min="0" placeholder="0" value={form.allIn}
                        onChange={e => setForm(f => ({ ...f, allIn: e.target.value }))}
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${errors.allIn ? 'border-red-400' : 'border-slate-300'}`}
                      />
                      {errors.allIn && <p className="text-xs text-red-500 mt-1">{errors.allIn}</p>}
                    </div>
                    {!form.breakdown ? (
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, breakdown: true }))}
                        className="flex items-center gap-1.5 text-xs text-[#05a94f] hover:text-emerald-700 font-medium transition-colors"
                      >
                        <PlusCircle size={12} /> เพิ่มรายละเอียดแยก Fare / YQ / Tax
                      </button>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between bg-slate-50 border-b border-slate-200 px-3 py-2">
                          <span className="text-xs font-medium text-slate-700">รายละเอียดราคา</span>
                          <button type="button"
                            onClick={() => setForm(f => ({ ...f, breakdown: false, fare: '', yq: '', tax: '' }))}
                            className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                          >
                            ยกเลิกรายละเอียด
                          </button>
                        </div>
                        <div className="p-3 space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Fare ({currency})</label>
                              <input type="number" min="0" placeholder="0" value={form.fare}
                                onChange={e => setForm(f => ({ ...f, fare: e.target.value }))}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">YQ ({currency})</label>
                              <input type="number" min="0" placeholder="0" value={form.yq}
                                onChange={e => setForm(f => ({ ...f, yq: e.target.value }))}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Tax ({currency})</label>
                              <input type="number" min="0" placeholder="0" value={form.tax}
                                onChange={e => setForm(f => ({ ...f, tax: e.target.value }))}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
                              />
                            </div>
                          </div>
                          <div className="border-t border-slate-100 pt-2 space-y-1">
                            <div className="flex items-center justify-between text-xs text-slate-500 px-0.5">
                              <span>รวมจากรายละเอียด</span>
                              <span className="font-semibold text-slate-700">{formatNumber(bkSum)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-500 px-0.5">
                              <span>All In / Total</span>
                              <span className="font-semibold text-slate-700">{formatNumber(Number(form.allIn)||0)}</span>
                            </div>
                            <div className={`flex items-center justify-between text-xs font-bold rounded-lg px-2.5 py-1.5 ${
                              allInC === 0 ? 'bg-slate-50 text-slate-400'
                              : isMatch   ? 'bg-emerald-50 text-[#05a94f]'
                              :             'bg-red-50 text-red-600'
                            }`}>
                              <span className="flex items-center gap-1">
                                {isMatch && <CheckCircle2 size={11} />}
                                {!isMatch && allInC > 0 && <AlertTriangle size={11} />}
                                ส่วนต่าง
                              </span>
                              <span>{diffC === 0 ? '0 ✓' : `${diff > 0 ? '+' : ''}${formatNumber(diff)}`}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Total (readonly) */}
              <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                form.priceFormat === 'ALL_IN' && !form.breakdown ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'
              }`}>
                <span className="text-slate-500 font-medium">Total ({currency})</span>
                <span className="font-bold text-slate-800 text-sm">
                  {form.priceFormat === 'FARE' && formatNumber((Number(form.fare)||0) + (Number(form.yq)||0) + (Number(form.tax)||0))}
                  {form.priceFormat === 'FARE_YQ' && formatNumber((Number(form.fare)||0) + (Number(form.tax)||0))}
                  {form.priceFormat === 'ALL_IN' && formatNumber(Number(form.allIn)||0)}
                </span>
              </div>
            </div>
          </div>

          {/* Condition */}
          {conditions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Condition</label>
              <select value={form.conditionCode} onChange={e => setForm(f => ({ ...f, conditionCode: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30">
                <option value="">— ไม่ระบุ —</option>
                {conditions.map(c => <option key={c.condition.conditionCode} value={c.condition.conditionCode}>{c.condition.conditionCode} — {c.condition.conditionName}</option>)}
              </select>
            </div>
          )}

          {/* TTL */}
          {(() => {
            const selCond = conditions.find(c => c.condition.conditionCode === form.conditionCode)
            const condTtlRule = selCond?.condition.ttlRule
            const condInfo: ConditionTtlInfo | null = (condTtlRule && condTtlRule.calcType !== 'NOT_SET') ? {
              code: selCond!.condition.conditionCode,
              name: selCond!.condition.conditionName,
              calcType: condTtlRule.calcType,
              daysBefore: condTtlRule.daysBefore,
              fixedDate: condTtlRule.fixedDate || undefined,
              time: condTtlRule.time || undefined,
            } : null
            const applyConditionTtl = condInfo ? () => {
              const ttlType = condTtlTypeToTtlType(condInfo.calcType)
              const ttlDaysBefore = ttlType === 'DAYS_BEFORE' ? String(condInfo.daysBefore ?? 30) : ''
              const ttlDate = ttlType === 'FIXED_DATE' ? (condInfo.fixedDate ?? '') : ''
              const ttlTime = condInfo.time ?? ''
              setForm(f => ({ ...f, ttlType, ttlDaysBefore, ttlDate, ttlTime }))
            } : undefined
            return (
              <TtlField
                travelDate={form.travelStart || null}
                ttlType={form.ttlType}
                ttlDaysBefore={form.ttlDaysBefore}
                ttlDate={form.ttlDate}
                ttlTime={form.ttlTime}
                conditionInfo={condInfo}
                error={errors.ttl}
                onChange={updates => setForm(f => ({ ...f, ...updates }))}
                onApplyCondition={applyConditionTtl}
              />
            )
          })()}

          {/* Remark */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Remark</label>
            <textarea rows={2} placeholder="บันทึกเพิ่มเติม" value={form.remark}
              onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
            />
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeletingPnr(null) }}
        title="ยืนยันการลบ PNR"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowDeleteModal(false); setDeletingPnr(null) }}>ยกเลิก</Button>
            <Button variant="danger" onClick={handleDeletePNR}>ยืนยันการลบ</Button>
          </>
        }
      >
        {deletingPnr && (
          <div className="space-y-3">
            <p className="text-sm">ต้องการลบ PNR <strong className="font-mono">{deletingPnr.pnrDisplay}</strong> หรือไม่?</p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs space-y-1">
              <p className="font-semibold text-red-700 flex items-center gap-1.5"><AlertTriangle size={12} /> ผลกระทบ</p>
              <ul className="space-y-0.5 text-red-600 list-disc list-inside">
                <li>ที่นั่งรวม: −{deletingPnr.seatTotal} ที่นั่ง</li>
                <li>Grand Total: −{formatNumber(deletingPnr.total, 0)} {currency}</li>
                <li>Payment Schedule ของ PNR นี้จะถูกลบทั้งหมด</li>
                <li>ประวัติ TTL และ Payment ของ PNR นี้จะไม่สามารถกู้คืนได้</li>
              </ul>
            </div>
          </div>
        )}
      </Modal>

      {/* Close PNR Modal */}
      <Modal
        open={showClosePnrModal}
        onClose={() => { setShowClosePnrModal(false); setClosingPnr(null) }}
        title="ยืนยันการปิด PNR"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowClosePnrModal(false); setClosingPnr(null) }}>ยกเลิก</Button>
            <Button onClick={handleClosePnr}>ยืนยันปิด PNR</Button>
          </>
        }
      >
        {closingPnr && (
          <div className="space-y-3">
            <p className="text-sm">ต้องการปิด PNR <strong className="font-mono">{closingPnr.pnrDisplay}</strong> หรือไม่?</p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">ผลของการปิด PNR</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>สถานะการใช้งานจะเปลี่ยนเป็น &ldquo;ปิดแล้ว&rdquo;</li>
                <li>PNR จะไม่สามารถใช้งานได้อีกจนกว่าจะเปิดใหม่</li>
                <li>ข้อมูลที่นั่งและราคายังคงบันทึกไว้</li>
              </ul>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel PNR Modal */}
      <Modal
        open={showCancelPnrModal}
        onClose={() => { setShowCancelPnrModal(false); setCancellingPnr(null); setCancelReason(''); setCancelReasonError('') }}
        title="ยกเลิก PNR"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowCancelPnrModal(false); setCancellingPnr(null); setCancelReason(''); setCancelReasonError('') }}>ปิด</Button>
            <Button variant="danger" onClick={handleCancelPnr}>ยืนยันยกเลิก PNR</Button>
          </>
        }
      >
        {cancellingPnr && (
          <div className="space-y-3">
            <p className="text-sm">ต้องการยกเลิก PNR <strong className="font-mono">{cancellingPnr.pnrDisplay}</strong> หรือไม่?</p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1">
              <p className="font-semibold flex items-center gap-1"><AlertTriangle size={11} /> คำเตือน</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>สถานะการใช้งานจะเปลี่ยนเป็น &ldquo;ยกเลิก&rdquo; ถาวร</li>
                <li>ที่นั่งที่ยังเหลืออยู่จะไม่นับในยอดรวม</li>
              </ul>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">เหตุผลการยกเลิก <span className="text-red-500">*</span></label>
              <textarea
                value={cancelReason}
                onChange={e => { setCancelReason(e.target.value); setCancelReasonError('') }}
                rows={3}
                placeholder="ระบุเหตุผลที่ยกเลิก PNR นี้..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400"
              />
              {cancelReasonError && <p className="text-xs text-red-500">{cancelReasonError}</p>}
            </div>
          </div>
        )}
      </Modal>

      {/* Convert Dummy to Real Modal */}
      <Modal
        open={showConvertModal}
        onClose={() => { setShowConvertModal(false); setConvertingPnr(null); setConvertCode(''); setConvertError('') }}
        title="เปลี่ยนเป็น PNR จริง"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowConvertModal(false); setConvertingPnr(null); setConvertCode(''); setConvertError('') }}>ยกเลิก</Button>
            <Button onClick={handleConvertToReal}>บันทึก</Button>
          </>
        }
      >
        {convertingPnr && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">เปลี่ยน <strong className="font-mono text-amber-600">{convertingPnr.dummyPnr}</strong> เป็น PNR จริง</p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">PNR Code จริง <span className="text-red-500">*</span></label>
              <input
                type="text" placeholder="เช่น TG9999" value={convertCode}
                onChange={e => { setConvertCode(e.target.value); setConvertError('') }}
                className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${convertError ? 'border-red-400' : 'border-slate-300'}`}
              />
              {convertError && <p className="text-xs text-red-500 mt-1">{convertError}</p>}
            </div>
          </div>
        )}
      </Modal>

      {/* Case C — Multi-PNR Confirm Modal */}
      {cfMultiPnr && cfMultiFS && (
        <Modal
          open={showCFMultiConfirm}
          onClose={() => { setShowCFMultiConfirm(false); setCfMultiPnr(null); setCfMultiFS(null) }}
          title="Flight Set นี้ถูกใช้งานโดยหลาย PNR"
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => { setShowCFMultiConfirm(false); setCfMultiPnr(null); setCfMultiFS(null) }}>ยกเลิก</Button>
              <Button variant="outline" onClick={() => {
                const cnt = liveStock?.pnrs.filter(p => p.flightSetId === cfMultiFS!.flightSetId).length ?? 1
                setShowCFMultiConfirm(false)
                openCFModal(cfMultiPnr!, cfMultiFS!, 'edit', cnt)
                setCfMultiPnr(null); setCfMultiFS(null)
              }}>แก้ไข Flight Set นี้ (กระทบทุก PNR)</Button>
              <Button onClick={() => {
                setShowCFMultiConfirm(false)
                openCFModal(cfMultiPnr!, cfMultiFS!, 'create')
                setCfMultiPnr(null); setCfMultiFS(null)
              }}>สร้าง Custom Flight ใหม่ (เฉพาะ PNR นี้)</Button>
            </>
          }
        >
          <div className="space-y-2 text-sm">
            <p>Flight Set <strong>&ldquo;{cfMultiFS.flightSetName}&rdquo;</strong> ถูกใช้งานโดย&nbsp;
              <span className="font-bold text-orange-600">
                {liveStock?.pnrs.filter(p => p.flightSetId === cfMultiFS!.flightSetId).length ?? 1} PNR
              </span>
            </p>
            <p className="text-slate-500 text-xs">คุณต้องการแก้ไขแบบใด?</p>
          </div>
        </Modal>
      )}

      {/* Custom Flight Modal */}
      {cfPnr && (
        <Modal
          open={showCFModal}
          onClose={() => { setShowCFModal(false); setCfPnr(null) }}
          title={cfMode === 'edit' ? `Edit Custom Flight — ${cfPnr.pnrDisplay}` : `Custom Flight — ${cfPnr.pnrDisplay}`}
          size="2xl"
          footer={
            <>
              <Button variant="ghost" onClick={() => { setShowCFModal(false); setCfPnr(null) }}>ยกเลิก</Button>
              <Button onClick={handleSaveCF} disabled={cfSaving}>
                {cfSaving ? 'กำลังบันทึก...' : cfMode === 'edit' ? 'บันทึกการแก้ไข' : 'บันทึก Custom Flight'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {/* Flight Set Name */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ชื่อ Flight Set <span className="text-red-500">*</span>
              </label>
              <input
                value={cfSetName}
                onChange={e => { setCfSetName(e.target.value); setCfErrors(v => ({ ...v, cfName: '' })) }}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${cfErrors.cfName ? 'border-red-400' : 'border-slate-300'}`}
                placeholder="เช่น Custom - 25 Feb 26 - AB12"
              />
              {cfErrors.cfName && <p className="text-xs text-red-500 mt-1">{cfErrors.cfName}</p>}
            </div>

            {/* Error summary */}
            {(cfErrors._count || cfErrors._order || cfErrors._return) && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-0.5">
                {cfErrors._count  && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={11} />{cfErrors._count}</p>}
                {cfErrors._order  && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={11} />{cfErrors._order}</p>}
                {cfErrors._return && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={11} />{cfErrors._return}</p>}
              </div>
            )}

            {/* Sector edit table */}
            <div>
              <p className="text-xs font-medium text-slate-700 mb-1.5">แก้ไข Flight Segments</p>
              <CfSectorTable
                sectors={cfSectors}
                errors={cfErrors}
                defaultAirlineCode={liveStock?.airlineCode ?? ''}
                onChange={s => { setCfSectors(s); setCfErrors({}) }}
              />
            </div>

            <p className="text-[10px] text-slate-400">
              {cfMode === 'edit'
                ? cfEditAffectsCount > 1
                  ? `ระบบจะแก้ไข Flight Set เดิม กระทบ PNR ที่ใช้ชุดนี้ทั้งหมด (${cfEditAffectsCount} PNR)`
                  : 'ระบบจะแก้ไข Flight Set เดิม ไม่สร้างชุดใหม่'
                : 'ระบบจะสร้าง Flight Set ใหม่อัตโนมัติและผูกกับ PNR นี้เท่านั้น'
              }
            </p>
          </div>
        </Modal>
      )}

      {/* Duplicate Flight Set Confirm Modal */}
      <Modal
        open={showCFDupConfirm}
        onClose={() => setShowCFDupConfirm(false)}
        title="Flight Segments ซ้ำกับ Flight Set ที่มีอยู่"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCFDupConfirm(false)}>ยกเลิก</Button>
            <Button variant="outline" onClick={() => confirmUseDupFS(true)}>ใช้ Flight Set เดิม</Button>
            <Button onClick={() => confirmUseDupFS(false)}>สร้างใหม่</Button>
          </>
        }
      >
        {cfDupFS && (
          <div className="space-y-2 text-sm">
            <p>Flight Segments ที่แก้ไขตรงกับ <strong>&ldquo;{cfDupFS.flightSetName}&rdquo;</strong> ที่มีอยู่แล้ว</p>
            <p className="text-slate-500 text-xs">คุณต้องการใช้ Flight Set เดิมหรือสร้างใหม่?</p>
          </div>
        )}
      </Modal>

      {/* Confirm Condition Change */}
      {condChangeConfirm && (
        <Modal
          open={true}
          onClose={() => setCondChangeConfirm(null)}
          title="ยืนยันการเปลี่ยน Condition"
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setCondChangeConfirm(null)}>ยกเลิก</Button>
              <Button onClick={() => applyConditionChange(condChangeConfirm.pnrIds, condChangeConfirm.newCode)}>ดำเนินการต่อ</Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm">
              {condChangeConfirm.newCode
                ? <>เปลี่ยน Condition เป็น <strong>&ldquo;{conditions.find(c => c.condition.conditionCode === condChangeConfirm.newCode)?.condition.conditionName ?? condChangeConfirm.newCode}&rdquo;</strong> สำหรับ {condChangeConfirm.pnrIds.length} PNR</>
                : <>ลบ Condition ออกจาก {condChangeConfirm.pnrIds.length} PNR</>
              }
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-1">
              <p className="font-semibold text-amber-700 flex items-center gap-1.5"><AlertTriangle size={12} /> ผลกระทบ</p>
              <ul className="space-y-0.5 text-amber-600 list-disc list-inside">
                <li>Payment Schedule อาจเปลี่ยนแปลง</li>
                <li>เงื่อนไข Refund และ No-show จะใช้ตาม Condition ใหม่</li>
                <li>TTL ของแต่ละ PNR ยังคงเดิม — แก้ไขได้ในฟอร์ม PNR</li>
              </ul>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Condition Change Modal */}
      <Modal
        open={showBulkCond}
        onClose={() => setShowBulkCond(false)}
        title={`เปลี่ยน Condition — ${selectedPnrIds.size} PNR`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowBulkCond(false)}>ยกเลิก</Button>
            <Button
              disabled={bulkCondCode === ''}
              onClick={() => {
                setShowBulkCond(false)
                setCondChangeConfirm({ pnrIds: Array.from(selectedPnrIds), newCode: bulkCondCode })
              }}
            >
              ดำเนินการต่อ
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">เลือก Condition ที่ต้องการใช้กับ {selectedPnrIds.size} PNR ที่เลือกไว้</p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Condition <span className="text-red-500">*</span></label>
            <select
              value={bulkCondCode}
              onChange={e => setBulkCondCode(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
            >
              <option value="">— เลือก Condition —</option>
              {activeConditions.map(c => (
                <option key={c.condition.conditionCode} value={c.condition.conditionCode}>
                  {c.condition.conditionName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Bulk Cancel PNR Modal */}
      <Modal
        open={showBulkCancel}
        onClose={() => setShowBulkCancel(false)}
        title={`ยกเลิก PNR — ${selectedPnrIds.size} รายการ`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowBulkCancel(false)}>ยกเลิก</Button>
            <Button variant="danger" onClick={() => {
              if (!bulkCancelReason.trim()) { setBulkCancelReasonError('กรุณาระบุเหตุผล'); return }
              setShowBulkCancel(false)
              handleBulkCancelPnr(selectedPnrIds, bulkCancelReason.trim())
            }}>ยืนยันยกเลิก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">ยกเลิก PNR ที่เลือก <strong>{selectedPnrIds.size} รายการ</strong> หรือไม่?</p>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1">
            <p className="font-semibold flex items-center gap-1"><AlertTriangle size={11} /> ผลกระทบ</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>PNR ที่มีสถานะ PENDING หรือ ACTIVE จะถูกยกเลิกถาวร</li>
              <li>PNR ที่เป็น CLOSED/CANCELLED แล้วจะไม่ถูกกระทบ</li>
            </ul>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">เหตุผลการยกเลิก <span className="text-red-500">*</span></label>
            <textarea
              value={bulkCancelReason}
              onChange={e => { setBulkCancelReason(e.target.value); setBulkCancelReasonError('') }}
              rows={2}
              placeholder="ระบุเหตุผล..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400"
            />
            {bulkCancelReasonError && <p className="text-xs text-red-500">{bulkCancelReasonError}</p>}
          </div>
        </div>
      </Modal>

      {/* Bulk Add PNR — shared BulkPnrBuilder */}
      {liveStock && (() => {
        const builderFlightSets: BulkPnrFlightSet[] = getStockFlightSets(liveStock).map(fs => ({
          flightSetId:   fs.flightSetId,
          flightSetName: fs.flightSetName,
          sectors: fs.sectors.map(s => ({
            sectorType:     s.sectorType,
            dayOffset:      s.dayOffset,
            depAirportCode: s.depAirportCode,
            arrAirportCode: s.arrAirportCode,
          })),
        }))
        const builderConditions: BulkPnrCondition[] = liveStock.conditions
          .filter(sc => sc.condition.status === 'Active')
          .map(sc => ({
            code:   sc.condition.conditionCode,
            name:   sc.condition.conditionName,
            stages: sc.condition.stages.map(st => ({
              paymentBaseDate:      st.dueType === 'TRAVEL_MINUS_DAYS' ? 'Travel Start' : 'Created Date',
              paymentDueDaysBefore: st.dueDays,
              paymentDueTime:       st.dueTime,
            })),
            ttlRule: {
              calcType:   sc.condition.ttlRule.calcType,
              baseDate:   'Travel Start',
              daysBefore: sc.condition.ttlRule.daysBefore,
              date:       sc.condition.ttlRule.fixedDate,
              time:       sc.condition.ttlRule.time,
            },
          }))
        return (
          <BulkPnrBuilder
            open={showBulkAdd}
            onClose={() => setShowBulkAdd(false)}
            mode="add_to_existing"
            flightSets={builderFlightSets}
            conditions={builderConditions}
            currency={currency}
            stock={liveStock}
            onSaved={(updated, count) => {
              onUpdate(updated)
              setShowBulkAdd(false)
              showToast(`เพิ่ม PNR จำนวน ${count} รายการสำเร็จ`)
            }}
          />
        )
      })()}

      {/* Price Breakdown Detail Modal */}
      <Modal
        open={!!detailPnr}
        onClose={() => setDetailPnr(null)}
        title="รายละเอียดราคา"
        size="sm"
        footer={<Button variant="ghost" onClick={() => setDetailPnr(null)}>ปิด</Button>}
      >
        {detailPnr && (() => {
          const p = detailPnr
          const fmt = p.price_format
          const sumFromDetail = p.fare + p.yq + p.tax
          const diff = Math.round(p.total_amount * 100) - Math.round(sumFromDetail * 100)
          const rows: { label: string; value: number; muted?: boolean }[] = fmt === 'FARE'
            ? [
                { label: 'Fare', value: p.fare },
                { label: 'YQ', value: p.yq },
                { label: 'Tax', value: p.tax },
              ]
            : fmt === 'FARE_YQ'
              ? [
                  { label: 'Fare + YQ (รวม)', value: p.fare },
                  { label: 'Tax', value: p.tax },
                ]
              : [
                  { label: 'Fare', value: p.fare },
                  { label: 'YQ', value: p.yq },
                  { label: 'Tax', value: p.tax },
                  { label: 'รวมจากรายละเอียด', value: sumFromDetail },
                ]
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  fmt === 'FARE' ? 'bg-slate-100 text-slate-600' : fmt === 'FARE_YQ' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {fmt === 'FARE' ? 'FARE' : fmt === 'FARE_YQ' ? 'FARE + YQ' : 'ALL IN'}
                </span>
                <span className="text-xs text-slate-500">PNR: {p.pnr_code ?? p.dummy_pnr ?? '—'}</span>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.label} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-500 text-xs">{r.label}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800 tabular-nums">
                          {formatNumber(r.value)} THB
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {fmt === 'ALL_IN' && p.breakdown && (
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                  diff === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                }`}>
                  <span>ส่วนต่าง (All In − รายละเอียด)</span>
                  <span className="font-bold tabular-nums">{diff === 0 ? '0' : (diff / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })} THB</span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                <span className="text-xs font-semibold text-slate-600">ยอดสุทธิ</span>
                <span className="text-base font-bold text-slate-800 tabular-nums">{formatNumber(p.total_amount)} THB</span>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateDummy(travelStart: string, stock: DemoStock): string {
  const typeMap: Record<string, string> = { 'Group': 'GRP', 'FIT': 'FIT', 'Ticket + Land': 'TNL' }
  const typeCode = typeMap[stock.ticketType] ?? 'UNK'
  const airline  = (stock.airlineCode || 'XX').toUpperCase()
  const yymm = travelStart?.length >= 7 ? travelStart.slice(2, 4) + travelStart.slice(5, 7) : '0000'
  const groupKey = `${typeCode}${airline}${yymm}`
  let max = 0
  for (const p of stock.pnrs) {
    if (p.dummyPnr) {
      const m = p.dummyPnr.match(/^DMY-([A-Z0-9]+)-(\d{4})$/)
      if (m && m[1] === groupKey) max = Math.max(max, parseInt(m[2], 10))
    }
  }
  return `DMY-${groupKey}-${String(max + 1).padStart(4, '0')}`
}
