'use client'

import { useState, useEffect, useCallback } from 'react'
import { addDays, format as fnsFormat, parseISO, isValid } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge, PNRStatusBadge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import { Modal } from '@/components/ui/modal'
import {
  PlusCircle, Pencil, Trash2, Copy, RefreshCw, X, CheckCircle2, AlertTriangle, PlusSquare, Route, ChevronDown,
} from 'lucide-react'
import { BulkPnrBuilder } from '@/components/shared/BulkPnrBuilder'
import type { BulkPnrFlightSet, BulkPnrCondition } from '@/components/shared/BulkPnrBuilder'
import { formatDate, formatDateTime, formatNumber, calcTTLDatetime, calcTravelEndFromSectors } from '@/lib/utils'
import {
  saveDemoStock, calculateStockSummary, checkPNRDuplicatesInSystem, getStockFlightSets,
} from '@/lib/demo-storage'
import type { DemoStock, DemoPNR, DemoLog, DemoSector, DemoFlightSet } from '@/lib/demo-storage'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PNRRow {
  id: string
  pnr_code: string | null
  dummy_pnr: string | null
  pnr_type: string
  flight_set_name: string
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
  condition: string | null
  condition_code: string | null
  next_ttl: string | null
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
}

const EMPTY_FORM: PNRFormState = {
  pnrCode: '', travelStart: '', flightSetId: '', seatTotal: '',
  priceFormat: 'FARE', fare: '', yq: '', allIn: '', breakdown: false,
  taxType: 'separate', tax: '', conditionCode: '', status: 'Pending', remark: '',
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
    if (!s.airlineCode)                         errs[`airline_${i}`]  = 'กรุณาระบุ Airline'
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
                <input value={s.airlineCode} maxLength={3}
                  onChange={e => update(i, { airlineCode: e.target.value.toUpperCase() })}
                  className="w-full border border-slate-300 rounded px-1 py-0.5 text-[11px] font-mono uppercase focus:outline-none focus:ring-1 focus:ring-[#05a94f]"
                  placeholder={defaultAirlineCode || 'TG'} />
              </td>
              <td className="px-1 py-1">
                <input value={s.flightNo}
                  onChange={e => update(i, { flightNo: e.target.value.toUpperCase() })}
                  className={`w-full border rounded px-1 py-0.5 text-[11px] font-mono uppercase focus:outline-none focus:ring-1 focus:ring-[#05a94f] ${errors[`flightNo_${i}`] ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="TG676" />
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
                <input type="time" value={s.depTime} onChange={e => update(i, { depTime: e.target.value })}
                  className="w-full border border-slate-300 rounded px-1 py-0.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-[#05a94f]" />
              </td>
              <td className="px-1 py-1">
                <input type="time" value={s.arrTime} onChange={e => update(i, { arrTime: e.target.value })}
                  className="w-full border border-slate-300 rounded px-1 py-0.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-[#05a94f]" />
              </td>
              <td className="px-1 py-1">
                <select value={s.arrDayOffset} onChange={e => update(i, { arrDayOffset: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded px-0.5 py-0.5 text-[11px] text-center focus:outline-none focus:ring-1 focus:ring-[#05a94f]">
                  {[0,1,2,3].map(d => <option key={d} value={d}>{d === 0 ? '0' : `+${d}`}</option>)}
                </select>
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

function PNRCell({ code, dummy, type }: { code: string | null; dummy: string | null; type: string }) {
  const display = code || dummy
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xs font-bold">
        {display || <span className="text-slate-300 italic font-normal text-[10px]">ไม่ระบุ</span>}
      </span>
      {code ? (
        <span className="inline-flex w-fit px-1.5 py-px rounded text-[9px] font-medium bg-blue-50 text-blue-600 border border-blue-200">PNR จริง</span>
      ) : dummy ? (
        <span className="inline-flex w-fit px-1.5 py-px rounded text-[9px] font-medium bg-amber-50 text-amber-600 border border-amber-200">Dummy</span>
      ) : null}
    </div>
  )
}

function TaxCell({ taxType, tax }: { taxType: string; tax: number }) {
  if (taxType === 'included') return <span className="text-slate-400 italic text-[10px]">รวมใน Fare</span>
  if (taxType === 'pending') return <span className="text-amber-500 italic text-[10px]">รอระบุ</span>
  return <>{formatNumber(tax)}</>
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // Jump to Add PNR when triggered from dropdown
  useEffect(() => {
    if (jumpToEdit && liveStock) {
      openAdd()
      onJumpDone()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToEdit])

  const openAdd = () => {
    const firstFlightSetId = liveStock ? getStockFlightSets(liveStock)[0]?.flightSetId ?? '' : ''
    const activeConds = (liveStock?.conditions ?? []).filter(c => c.condition.status === 'Active')
    const autoCode = activeConds.length === 1 ? activeConds[0].condition.conditionCode : (liveStock?.defaultConditionCode ?? '')
    setEditingPnrId(null)
    setForm({ ...EMPTY_FORM, flightSetId: firstFlightSetId, conditionCode: autoCode })
    setErrors({})
    setShowPNRModal(true)
    onDirtyChange(true)
  }

  const openEdit = (pnr: DemoPNR) => {
    const firstFlightSetId = liveStock ? getStockFlightSets(liveStock)[0]?.flightSetId ?? '' : ''
    setEditingPnrId(pnr.pnrId)
    const fmt = pnr.priceFormat ?? 'FARE'
    const hasBreakdown = fmt === 'ALL_IN' && pnr.fare > 0
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
      tax:           String(pnr.tax),
      conditionCode: pnr.conditionCode || '',
      status:        pnr.status || 'Pending',
      remark:        pnr.remark || '',
    })
    setErrors({})
    setShowPNRModal(true)
    onDirtyChange(true)
  }

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
    if (priceFormat === 'FARE_YQ') {
      fare    = Number(form.fare) || 0
      yqAmt   = Number(form.yq)  || 0
      tax     = Number(form.tax) || 0
      taxType = 'separate'
      total   = fare + yqAmt + tax
    } else if (priceFormat === 'ALL_IN') {
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
    } else { // FARE
      fare    = Number(form.fare) || 0
      yqAmt   = 0
      taxType = form.taxType || 'separate'
      tax     = taxType === 'separate' ? (Number(form.tax) || 0) : 0
      total   = fare + tax
    }
    const isReal       = !!form.pnrCode.trim()
    const pnrCode      = isReal ? form.pnrCode.trim() : ''
    const pnrDisplay   = isReal ? pnrCode : (existingPnr?.dummyPnr || generateDummy(travelStart, stock))
    const dummyPnr     = isReal ? '' : pnrDisplay

    const flightSets = getStockFlightSets(stock)
    const selectedFS = flightSets.find(f => f.flightSetId === form.flightSetId) ?? flightSets[0]
    const fsSectors  = selectedFS?.sectors ?? stock.sectors

    const travelEnd = calcTravelEndFromSectors(
      travelStart,
      fsSectors.map(s => ({ sector_type: s.sectorType, day_offset: s.dayOffset }))
    ) ?? existingPnr?.travelEnd ?? ''

    const sectorDates = fsSectors.map(s => {
      try { const d = addDays(parseISO(travelStart), s.dayOffset - 1); return { sectorType: s.sectorType, date: fnsFormat(d, 'yyyy-MM-dd') } }
      catch { return { sectorType: s.sectorType, date: '' } }
    })

    let ttlDateTime: string | null = null
    const linkedSc = stock.conditions.find(c => c.condition.conditionCode === form.conditionCode)
    const linkedCond = linkedSc?.condition
    if (linkedCond?.ttlRule) {
      const rule = linkedCond.ttlRule
      if (rule.calcType === 'TRAVEL_MINUS_DAYS') {
        ttlDateTime = calcTTLDatetime(travelStart, 'Travel Start', rule.daysBefore, rule.time)
      } else if (rule.calcType === 'MANUAL_DATE' && rule.fixedDate) {
        const [h, m] = (rule.time || '18:00').split(':').map(Number)
        const d = new Date(rule.fixedDate); d.setHours(h, m, 0, 0)
        ttlDateTime = d.toISOString()
      }
    }

    let ttlDate: string | null = null, ttlTimeStr: string | null = null
    if (ttlDateTime) {
      try { const d = parseISO(ttlDateTime); if (isValid(d)) { ttlDate = fnsFormat(d, 'yyyy-MM-dd'); ttlTimeStr = fnsFormat(d, 'HH:mm') } }
      catch { /* keep null */ }
    }

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
      seatTotal,
      seatUsed:       existingPnr?.seatUsed ?? 0,
      seatBalance:    seatTotal - (existingPnr?.seatUsed ?? 0),
      priceFormat,
      fare,
      yq:             yqAmt,
      taxType,
      tax,
      fareIncludesTax: taxType === 'included',
      taxStatus,
      total,
      conditionCode:  form.conditionCode || '',
      ttlDate,
      ttlTime:        ttlTimeStr,
      ttlDateTime,
      status:         form.status || 'Pending',
      remark:         form.remark || '',
    }
  }, [form, liveStock])

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {}
    if (!form.travelStart) errs.travelStart = 'กรุณาระบุ Travel Start'
    if (!form.seatTotal || Number(form.seatTotal) <= 0) errs.seatTotal = 'กรุณาระบุ Seat Total (> 0)'
    const fmt = form.priceFormat ?? 'FARE'
    if (fmt === 'FARE') {
      if (form.fare === '' || isNaN(Number(form.fare)) || Number(form.fare) < 0) errs.fare = 'กรุณาระบุ Fare (≥ 0)'
      if (form.taxType === 'separate' && (form.tax === '' || isNaN(Number(form.tax)) || Number(form.tax) < 0))
        errs.tax = 'กรุณาระบุ Tax (≥ 0)'
    } else if (fmt === 'FARE_YQ') {
      if (form.fare === '' || isNaN(Number(form.fare)) || Number(form.fare) < 0) errs.fare = 'กรุณาระบุ Fare (≥ 0)'
      if (form.yq === '' || isNaN(Number(form.yq)) || Number(form.yq) < 0) errs.yq = 'กรุณาระบุ YQ (≥ 0)'
    } else { // ALL_IN
      if (form.allIn === '' || isNaN(Number(form.allIn)) || Number(form.allIn) <= 0) errs.allIn = 'กรุณาระบุ All In (> 0)'
    }
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

    const updatedPnr: DemoPNR = { ...cfPnr, flightSetId: newFS.flightSetId, travelEnd: newTravelEnd, sectorDates: newSectorDates }
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
      return { ...p, travelEnd: newTravelEnd, sectorDates: newSectorDates }
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
      const flightSets = getStockFlightSets(liveStock)
      const oldFS = flightSets.find(f => f.flightSetId === cfPnr.flightSetId) ?? flightSets[0]
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
      const updatedPnr: DemoPNR = { ...cfPnr, flightSetId: cfDupFS.flightSetId, travelEnd: newTravelEnd, sectorDates: newSectorDates }
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
  const pnrRows: PNRRow[] = liveStock
    ? liveStock.pnrs.map(p => ({
        id: p.pnrId,
        pnr_code: p.pnrCode || null,
        dummy_pnr: p.dummyPnr || null,
        pnr_type: p.pnrType,
        flight_set_name: liveFlightSets.find(f => f.flightSetId === p.flightSetId)?.flightSetName ?? liveFlightSets[0]?.flightSetName ?? 'Default',
        travel_start: p.travelStart,
        travel_end: p.travelEnd,
        seat_total: p.seatTotal,
        seat_used: p.seatUsed,
        seat_balance: p.seatBalance,
        price_format: p.priceFormat ?? 'FARE',
        fare: p.priceFormat === 'ALL_IN' ? p.total : p.fare,
        yq: p.yq ?? 0,
        tax_type: p.taxType,
        tax: p.priceFormat === 'FARE_YQ' ? (p.yq ?? 0) + p.tax : p.tax,
        total_amount: p.total,
        condition: liveStock.conditions.find(c => c.condition.conditionCode === p.conditionCode)?.condition.conditionName || null,
        condition_code: p.conditionCode || null,
        next_ttl: p.ttlDateTime,
        status: p.status,
      }))
    : mockPNRs

  const conditions = liveStock?.conditions ?? []
  const pnrStatuses = ['Pending', 'Confirmed', 'Ticketed', 'Cancelled', 'Expired', 'Closed']

  const activeConditions = conditions.filter(c => c.condition.status === 'Active')
  const noCond = (liveStock?.pnrs ?? []).filter(p => !p.conditionCode)

  const calcTtlFromCode = (pnr: DemoPNR, condCode: string) => {
    const sc = conditions.find(c => c.condition.conditionCode === condCode)
    const rule = sc?.condition.ttlRule
    if (!rule) return { ttlDate: null as string | null, ttlTime: null as string | null, ttlDateTime: null as string | null }
    let ttlDT: string | null = null
    if (rule.calcType === 'TRAVEL_MINUS_DAYS') {
      ttlDT = calcTTLDatetime(pnr.travelStart, 'Travel Start', rule.daysBefore, rule.time)
    } else if (rule.calcType === 'MANUAL_DATE' && rule.fixedDate) {
      const [h, m] = (rule.time || '18:00').split(':').map(Number)
      const d = new Date(rule.fixedDate); d.setHours(h, m, 0, 0)
      ttlDT = d.toISOString()
    }
    let ttlDate = null as string | null, ttlTime = null as string | null
    if (ttlDT) {
      try {
        const d = parseISO(ttlDT)
        if (isValid(d)) { ttlDate = fnsFormat(d, 'yyyy-MM-dd'); ttlTime = fnsFormat(d, 'HH:mm') }
      } catch { /* */ }
    }
    return { ttlDate, ttlTime, ttlDateTime: ttlDT }
  }

  const applyConditionChange = (pnrIds: string[], newCode: string) => {
    if (!liveStock) return
    const now = new Date().toISOString()
    const condName = conditions.find(c => c.condition.conditionCode === newCode)?.condition.conditionName ?? newCode
    const updatedPnrs = liveStock.pnrs.map(p => {
      if (!pnrIds.includes(p.pnrId)) return p
      const ttl = newCode ? calcTtlFromCode(p, newCode) : { ttlDate: null, ttlTime: null, ttlDateTime: null }
      return { ...p, conditionCode: newCode, ...ttl }
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

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2 text-sm text-[#05a94f] bg-green-50 border border-green-200 rounded-xl px-3 py-2">
          <CheckCircle2 size={14} /> {toast}
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
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHead>
            <tr>
              {canEdit && (
                <Th className="w-8 text-center">
                  <input
                    type="checkbox"
                    checked={pnrRows.length > 0 && selectedPnrIds.size === pnrRows.length}
                    ref={el => { if (el) el.indeterminate = selectedPnrIds.size > 0 && selectedPnrIds.size < pnrRows.length }}
                    onChange={e => setSelectedPnrIds(e.target.checked ? new Set(pnrRows.map(r => r.id)) : new Set())}
                    className="rounded border-slate-300 accent-[#05a94f]"
                  />
                </Th>
              )}
              <Th>PNR</Th>
              <Th>Flight Set</Th>
              <Th className="text-center w-[60px]">Day</Th>
              <Th>Dep Date</Th>
              <Th>Arr Date</Th>
              <Th className="text-right">Seat</Th>
              <Th className="text-right">Used</Th>
              <Th className="text-right">Bal.</Th>
              <Th className="text-right">Fare</Th>
              <Th className="text-right">Tax/YQ</Th>
              <Th className="text-right">Total</Th>
              <Th>Condition</Th>
              <Th>TTL Date</Th>
              <Th>Status</Th>
              {canEdit && <Th className="text-center">Actions</Th>}
            </tr>
          </TableHead>
          <TableBody>
            {pnrRows.length === 0 ? (
              <EmptyRow cols={canEdit ? 16 : 14} message="ยังไม่มีข้อมูล PNR" />
            ) : (
              pnrRows.map(p => {
                const demoPnr = liveStock?.pnrs.find(dp => dp.pnrId === p.id)
                return (
                  <TableRow key={p.id} className={selectedPnrIds.has(p.id) ? 'bg-emerald-50/40' : ''}>
                    {canEdit && (
                      <Td className="text-center">
                        <input
                          type="checkbox"
                          checked={selectedPnrIds.has(p.id)}
                          onChange={e => setSelectedPnrIds(prev => {
                            const s = new Set(prev)
                            e.target.checked ? s.add(p.id) : s.delete(p.id)
                            return s
                          })}
                          className="rounded border-slate-300 accent-[#05a94f]"
                        />
                      </Td>
                    )}
                    <Td><PNRCell code={p.pnr_code} dummy={p.dummy_pnr} type={p.pnr_type} /></Td>
                    <Td className="text-xs">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium whitespace-nowrap">
                        {p.flight_set_name}
                      </span>
                    </Td>
                    <Td className="text-center text-xs font-semibold tracking-wide text-slate-600">{dayAbbr(p.travel_start)}</Td>
                    <Td className="text-xs">{p.travel_start ? formatDate(p.travel_start) : '—'}</Td>
                    <Td className="text-xs">{p.travel_end ? formatDate(p.travel_end) : '—'}</Td>
                    <Td className="text-right text-sm">{p.seat_total}</Td>
                    <Td className="text-right text-sm text-slate-400">{p.seat_used}</Td>
                    <Td className="text-right">
                      <span className={`font-bold text-sm ${p.seat_balance === 0 ? 'text-red-500' : p.seat_balance / p.seat_total < 0.2 ? 'text-orange-500' : 'text-[#05a94f]'}`}>
                        {p.seat_balance}
                      </span>
                    </Td>
                    <Td className="text-right text-xs">
                      <div className="flex flex-col items-end gap-0.5">
                        {formatNumber(p.fare)}
                        {p.price_format === 'ALL_IN' && (
                          <span className="text-[9px] bg-blue-100 text-blue-600 font-bold px-1.5 py-0 rounded-full leading-4">ALL IN</span>
                        )}
                        {p.price_format === 'FARE_YQ' && (
                          <span className="text-[9px] bg-amber-100 text-amber-600 font-bold px-1.5 py-0 rounded-full leading-4">+YQ</span>
                        )}
                      </div>
                    </Td>
                    <Td className="text-right text-xs"><TaxCell taxType={p.tax_type} tax={p.tax} /></Td>
                    <Td className="text-right text-xs font-bold">{formatNumber(p.total_amount)}</Td>
                    <Td className="text-xs">
                      {canEdit ? (
                        <div className="relative inline-block min-w-[120px]">
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
                    </Td>
                    <Td className="text-xs text-slate-700">
                      {p.next_ttl ? formatDateTime(p.next_ttl) : '—'}
                    </Td>
                    <Td><PNRStatusBadge status={p.status} /></Td>
                    {canEdit && (
                      <Td>
                        {demoPnr ? (
                          <div className="flex items-center gap-1 justify-center">
                            <button title="แก้ไข" onClick={() => openEdit(demoPnr)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button title="Custom Flight" onClick={() => openCustomFlight(demoPnr)} className="p-1 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors">
                              <Route size={13} />
                            </button>
                            <button title="Duplicate" onClick={() => handleDuplicate(demoPnr)} className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors">
                              <Copy size={13} />
                            </button>
                            {demoPnr.pnrType === 'dummy' && (
                              <button title="เปลี่ยนเป็น PNR จริง" onClick={() => { setConvertingPnr(demoPnr); setShowConvertModal(true) }} className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors">
                                <RefreshCw size={13} />
                              </button>
                            )}
                            <button title="ลบ" onClick={() => { setDeletingPnr(demoPnr); setShowDeleteModal(true) }} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ) : <span className="text-slate-300 text-[10px] text-center block">—</span>}
                      </Td>
                    )}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
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
            <Button onClick={handleSavePNR} disabled={saving}>
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
              <select value={form.flightSetId} onChange={e => setForm(f => ({ ...f, flightSetId: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30">
                {liveFlightSets.map(fs => (
                  <option key={fs.flightSetId} value={fs.flightSetId}>{fs.flightSetName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sector Dates Preview */}
          {form.travelStart && liveStock && (() => {
            const previewFS = liveFlightSets.find(f => f.flightSetId === form.flightSetId) ?? liveFlightSets[0]
            const previewSectors = previewFS?.sectors ?? liveStock.sectors
            return (
              <div className="bg-slate-50 rounded-lg p-3 text-xs">
                <p className="font-medium text-slate-400 mb-1.5">Sector Dates (คำนวณจาก Travel Start · {previewFS?.flightSetName})</p>
                <div className="flex flex-wrap gap-2">
                  {previewSectors.map(s => {
                    try {
                      const d = addDays(parseISO(form.travelStart), s.dayOffset - 1)
                      return (
                        <span key={s.sectorId} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-1">
                          <span className={s.sectorType === 'Departure' ? 'text-green-600 font-medium' : s.sectorType === 'Arrival' ? 'text-purple-600 font-medium' : 'text-slate-500 font-medium'}>{s.sectorType}</span>
                          <span className="font-mono text-slate-700">{fnsFormat(d, 'dd MMM yy')}</span>
                        </span>
                      )
                    } catch { return null }
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
                {pnrStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Travel Start */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Travel Start <span className="text-red-500">*</span></label>
              <input type="date" value={form.travelStart} onChange={e => setForm(f => ({ ...f, travelStart: e.target.value }))}
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

          {/* Price Format Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">รูปแบบราคาที่ได้รับ</label>
            <div className="flex gap-2">
              {([
                { v: 'FARE',    label: 'FARE',        desc: 'ค่าตั๋วอย่างเดียว' },
                { v: 'FARE_YQ', label: 'FARE + YQ',   desc: 'Fare + ค่าน้ำมัน YQ' },
                { v: 'ALL_IN',  label: 'ALL IN',       desc: 'รวมภาษีทั้งหมด' },
              ] as const).map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, priceFormat: opt.v }))}
                  className={`flex-1 border-2 rounded-lg px-2 py-2 text-center transition-all ${
                    form.priceFormat === opt.v
                      ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f]'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div className="text-[10px] opacity-60">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* FARE mode */}
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
                <label className="block text-xs font-medium text-slate-700 mb-1">รายละเอียดภาษี/ค่าธรรมเนียม</label>
                <select value={form.taxType} onChange={e => setForm(f => ({ ...f, taxType: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30">
                  <option value="separate">แยก Tax</option>
                  <option value="included">รวมใน Fare</option>
                  <option value="pending">รอระบุ</option>
                </select>
              </div>
              {form.taxType === 'separate' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tax ({currency}) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" placeholder="0" value={form.tax}
                    onChange={e => setForm(f => ({ ...f, tax: e.target.value }))}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${errors.tax ? 'border-red-400' : 'border-slate-300'}`}
                  />
                  {errors.tax && <p className="text-xs text-red-500 mt-1">{errors.tax}</p>}
                </div>
              )}
            </div>
          )}

          {/* FARE + YQ mode */}
          {form.priceFormat === 'FARE_YQ' && (
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
                <label className="block text-xs font-medium text-slate-700 mb-1">YQ ({currency}) <span className="text-red-500">*</span></label>
                <input type="number" min="0" placeholder="0" value={form.yq}
                  onChange={e => setForm(f => ({ ...f, yq: e.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${errors.yq ? 'border-red-400' : 'border-slate-300'}`}
                />
                {errors.yq && <p className="text-xs text-red-500 mt-1">{errors.yq}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tax อื่น ๆ ({currency})</label>
                <input type="number" min="0" placeholder="0 (optional)" value={form.tax}
                  onChange={e => setForm(f => ({ ...f, tax: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
                />
              </div>
            </div>
          )}

          {/* ALL IN mode */}
          {form.priceFormat === 'ALL_IN' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">All In / Total ({currency}) <span className="text-red-500">*</span></label>
                <input type="number" min="0" placeholder="0" value={form.allIn}
                  onChange={e => setForm(f => ({ ...f, allIn: e.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${errors.allIn ? 'border-red-400' : 'border-slate-300'}`}
                />
                {errors.allIn && <p className="text-xs text-red-500 mt-1">{errors.allIn}</p>}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.breakdown} onChange={e => setForm(f => ({ ...f, breakdown: e.target.checked }))}
                  className="rounded border-slate-300 accent-[#05a94f]"
                />
                <span className="text-xs text-slate-600">ระบุรายละเอียด Fare / YQ / Tax</span>
              </label>
              {form.breakdown && (
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
                    <label className="block text-xs font-medium text-slate-700 mb-1">Tax อื่น ๆ ({currency})</label>
                    <input type="number" min="0" placeholder="0" value={form.tax}
                      onChange={e => setForm(f => ({ ...f, tax: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30"
                    />
                  </div>
                </div>
              )}
              {form.breakdown && form.allIn !== '' && (
                (() => {
                  const bkSum = (Number(form.fare)||0) + (Number(form.yq)||0) + (Number(form.tax)||0)
                  const allIn = Number(form.allIn)||0
                  return bkSum !== allIn && allIn > 0 ? (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <AlertTriangle size={11} />
                      <span>Fare + YQ + Tax = {formatNumber(bkSum)} ≠ All In {formatNumber(allIn)}</span>
                    </div>
                  ) : null
                })()
              )}
            </div>
          )}

          {/* Total preview (readonly) */}
          {(form.priceFormat === 'FARE' ? form.fare !== '' : form.priceFormat === 'FARE_YQ' ? form.fare !== '' || form.yq !== '' : form.allIn !== '') && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
              <span className="text-slate-500 font-medium">Total ({currency})</span>
              <span className="font-bold text-slate-800 text-sm">
                {form.priceFormat === 'FARE' && formatNumber((Number(form.fare)||0) + (form.taxType === 'separate' ? Number(form.tax)||0 : 0))}
                {form.priceFormat === 'FARE_YQ' && formatNumber((Number(form.fare)||0) + (Number(form.yq)||0) + (Number(form.tax)||0))}
                {form.priceFormat === 'ALL_IN' && formatNumber(Number(form.allIn)||0)}
              </span>
            </div>
          )}

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
            <p>Flight Set <strong>"{cfMultiFS.flightSetName}"</strong> ถูกใช้งานโดย&nbsp;
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
            <p>Flight Segments ที่แก้ไขตรงกับ <strong>"{cfDupFS.flightSetName}"</strong> ที่มีอยู่แล้ว</p>
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
                ? <>เปลี่ยน Condition เป็น <strong>"{conditions.find(c => c.condition.conditionCode === condChangeConfirm.newCode)?.condition.conditionName ?? condChangeConfirm.newCode}"</strong> สำหรับ {condChangeConfirm.pnrIds.length} PNR</>
                : <>ลบ Condition ออกจาก {condChangeConfirm.pnrIds.length} PNR</>
              }
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-1">
              <p className="font-semibold text-amber-700 flex items-center gap-1.5"><AlertTriangle size={12} /> ผลกระทบ</p>
              <ul className="space-y-0.5 text-amber-600 list-disc list-inside">
                <li>TTL Date จะถูกคำนวณใหม่ตาม Condition ที่เลือก</li>
                <li>Payment Schedule อาจเปลี่ยนแปลง</li>
                <li>เงื่อนไข Refund และ No-show จะใช้ตาม Condition ใหม่</li>
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
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
function dayAbbr(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try { const d = parseISO(dateStr); return isValid(d) ? DAY_ABBR[d.getDay()] : '—' } catch { return '—' }
}

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
