'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Pencil, PlusCircle, Trash2, CheckCircle2, AlertTriangle, X, Copy, PlaneTakeoff } from 'lucide-react'
import { TimeInput } from '@/components/ui/time-input'
import { saveDemoStock, getStockFlightSets } from '@/lib/demo-storage'
import type { DemoStock, DemoSector, DemoFlightSet, DemoLog } from '@/lib/demo-storage'
import { MASTER_AIRLINE_CODE_SET } from '@/lib/master-data'
import { AirlineCell } from '@/components/shared/AirlineCell'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SectorDisplayRow {
  seq: number
  sector_type: string
  airline_code: string
  flight_no: string
  dep_airport_code: string
  arr_airport_code: string
  dep_time: string
  arr_time: string
  arr_day_offset: number
  day_offset: number
  remark: string
}

interface EditSector {
  sectorId: string
  seq: number
  sectorType: string
  airlineCode: string
  flightNo: string
  depAirportCode: string
  arrAirportCode: string
  depTime: string
  arrTime: string
  arrDayOffset: number
  dayOffset: number
  remark: string
}

const SECTOR_TYPES = ['Departure', 'Transit', 'Arrival']

function getArrDayOffset(arrDayOffset: number | undefined | null, depTime: string, arrTime: string): number {
  if (arrDayOffset !== undefined && arrDayOffset !== null) return arrDayOffset
  if (!depTime || !arrTime) return 0
  return arrTime < depTime ? 1 : 0
}

function formatArrDay(value: number): string {
  return value === 0 ? '0' : `+${value}`
}

function buildRouteTextFromSectors(sectors: { depAirportCode?: string; arrAirportCode?: string }[]): string {
  if (!sectors.length) return ''
  const points: string[] = []
  sectors.forEach((s, i) => { if (i === 0) points.push(s.depAirportCode ?? ''); points.push(s.arrAirportCode ?? '') })
  const deduped: string[] = []
  points.forEach(p => { if (p && deduped[deduped.length - 1] !== p) deduped.push(p) })
  return deduped.join('-')
}

const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  liveStock: DemoStock | null
  mockSectors: SectorDisplayRow[]
  ticketType: string
  canEdit: boolean
  jumpToEdit: boolean
  onUpdate: (stock: DemoStock) => void
  onDirtyChange: (dirty: boolean) => void
  onJumpDone: () => void
}

// ─── Sector Edit Table ────────────────────────────────────────────────────────

interface SectorEditTableProps {
  sectors: EditSector[]
  minSectors: number
  errors: Record<string, string>
  defaultAirlineCode: string
  onChange: (sectors: EditSector[]) => void
  onAdd: () => void
  onRemove: (idx: number) => void
}

function SectorEditTable({ sectors, minSectors, errors, defaultAirlineCode, onChange, onAdd, onRemove }: SectorEditTableProps) {
  const update = (idx: number, patch: Partial<EditSector>) => {
    onChange(sectors.map((s, i) => {
      if (i !== idx) return s
      const merged = { ...s, ...patch }
      if (('depTime' in patch || 'arrTime' in patch) && !('arrDayOffset' in patch)) {
        merged.arrDayOffset = merged.arrTime < merged.depTime ? 1 : 0
      }
      return merged
    }))
  }
  return (
    <div className="overflow-x-auto">
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
        <colgroup>
          <col style={{ width: 32 }} /><col style={{ width: 100 }} /><col style={{ width: 64 }} />
          <col style={{ width: 88 }} /><col style={{ width: 72 }} /><col style={{ width: 72 }} />
          <col style={{ width: 88 }} /><col style={{ width: 88 }} /><col style={{ width: 54 }} />
          <col style={{ width: 80 }} /><col /><col style={{ width: 40 }} />
        </colgroup>
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {['#','Type','Airline','Flight No.','From','To','Dep','Arr','+Day','Travel Day','Remark',''].map(h => (
              <th key={h} className="px-2 h-9 text-xs font-semibold text-slate-500 text-center whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sectors.map((s, i) => (
            <tr key={s.sectorId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 align-middle">
              <td className="px-2 py-2 text-xs text-center text-slate-400">{i + 1}</td>
              <td className="px-1 py-1.5">
                <select value={s.sectorType} onChange={e => update(i, { sectorType: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#05a94f]">
                  {SECTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </td>
              <td className="px-1 py-1.5">
                <AirlineCell
                  value={s.airlineCode}
                  onChange={v => update(i, { airlineCode: v })}
                  inputClassName={`border rounded-md px-1.5 py-1 ${errors[`airline_${i}`] ? 'border-red-400' : 'border-slate-300'}`}
                />
              </td>
              <td className="px-1 py-1.5">
                <input value={s.flightNo} onChange={e => update(i, { flightNo: e.target.value.replace(/\D/g, '') })}
                  className={`w-full border rounded-md px-1.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#05a94f] ${errors[`flightNo_${i}`] ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="701" inputMode="numeric" />
              </td>
              <td className="px-1 py-1.5">
                <input value={s.depAirportCode} onChange={e => update(i, { depAirportCode: e.target.value.toUpperCase() })}
                  className={`w-full border rounded-md px-1.5 py-1 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-[#05a94f] ${errors[`dep_${i}`] ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="BKK" maxLength={3} />
              </td>
              <td className="px-1 py-1.5">
                <input value={s.arrAirportCode} onChange={e => update(i, { arrAirportCode: e.target.value.toUpperCase() })}
                  className={`w-full border rounded-md px-1.5 py-1 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-[#05a94f] ${errors[`arr_${i}`] ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="NRT" maxLength={3} />
              </td>
              <td className="px-1 py-1.5">
                <TimeInput compact value={s.depTime} onChange={v => update(i, { depTime: v })}
                  className="w-full border border-slate-300 rounded-md focus-within:ring-1 focus-within:ring-[#05a94f] focus-within:border-[#05a94f]" />
              </td>
              <td className="px-1 py-1.5">
                <TimeInput compact value={s.arrTime} onChange={v => update(i, { arrTime: v })}
                  className="w-full border border-slate-300 rounded-md focus-within:ring-1 focus-within:ring-[#05a94f] focus-within:border-[#05a94f]" />
              </td>
              <td className="px-1 py-1.5 text-center">
                <select value={s.arrDayOffset} onChange={e => update(i, { arrDayOffset: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-md px-1 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-[#05a94f]">
                  {[0,1,2,3].map(d => <option key={d} value={d}>{d === 0 ? '0' : `+${d}`}</option>)}
                </select>
              </td>
              <td className="px-1 py-1.5">
                <input type="number" min="1" value={s.dayOffset}
                  onChange={e => update(i, { dayOffset: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-full border border-slate-300 rounded-md px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-[#05a94f]" />
              </td>
              <td className="px-1 py-1.5">
                <input value={s.remark} onChange={e => update(i, { remark: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#05a94f] truncate"
                  placeholder="—" />
              </td>
              <td className="px-2 py-1.5 text-center">
                <button onClick={() => onRemove(i)} disabled={sectors.length <= minSectors}
                  className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2.5 border-t border-slate-100">
        <Button size="sm" variant="outline" icon={<PlusCircle size={13} />} onClick={onAdd}>เพิ่ม Segment</Button>
      </div>
    </div>
  )
}

// ─── Read-only Sector Table ───────────────────────────────────────────────────

function SectorReadTable({ sectors }: { sectors: DemoSector[] }) {
  if (!sectors.length) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">
        ยังไม่มี Segment — กด <span className="font-medium text-slate-600">แก้ไข Segment</span> เพื่อเพิ่ม
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', minWidth: 760 }}>
        <colgroup>
          <col style={{ width: 32 }} /><col style={{ width: 88 }} /><col style={{ width: 68 }} />
          <col style={{ width: 80 }} /><col style={{ width: 52 }} /><col style={{ width: 52 }} />
          <col style={{ width: 72 }} /><col style={{ width: 72 }} /><col style={{ width: 52 }} />
          <col style={{ width: 80 }} />
        </colgroup>
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {['#','Type','Airline','Flight','From','To','Dep Time','Arr Time','+Day','Travel Day','Remark'].map(h => (
              <th key={h} className="px-3 h-9 text-xs font-semibold text-slate-500 text-center whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sectors.map((s, i) => {
            const arrDay = getArrDayOffset(s.arrDayOffset, s.depTime, s.arrTime)
            return (
              <tr key={s.sectorId} className={`border-b border-slate-100 last:border-0 ${i % 2 === 0 ? '' : 'bg-slate-50/40'} hover:bg-slate-50 align-middle`}>
                <td className="px-3 py-2.5 text-xs text-center text-slate-400">{s.seq}</td>
                <td className="px-3 py-2.5 text-xs text-center overflow-hidden text-ellipsis whitespace-nowrap">
                  <span className={`font-medium ${s.sectorType === 'Departure' ? 'text-green-600' : s.sectorType === 'Arrival' ? 'text-purple-600' : 'text-slate-500'}`}>{s.sectorType}</span>
                </td>
                <td className="px-3 py-2.5 text-center overflow-hidden">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600">{s.airlineCode}</span>
                </td>
                <td className="px-3 py-2.5 text-xs font-mono font-bold text-center overflow-hidden text-ellipsis whitespace-nowrap">{s.airlineCode}{s.flightNo}</td>
                <td className="px-3 py-2.5 text-xs font-mono font-bold text-center">{s.depAirportCode}</td>
                <td className="px-3 py-2.5 text-xs font-mono font-bold text-center">{s.arrAirportCode}</td>
                <td className="px-3 py-2.5 text-xs font-mono text-center whitespace-nowrap">{s.depTime}</td>
                <td className="px-3 py-2.5 text-xs font-mono text-center whitespace-nowrap">{s.arrTime}</td>
                <td className="px-3 py-2.5 text-xs text-center">
                  {arrDay === 0 ? <span className="text-slate-400">0</span> : <span className="font-semibold text-orange-500">{formatArrDay(arrDay)}</span>}
                </td>
                <td className="px-3 py-2.5 text-xs text-center text-slate-500">{s.dayOffset ?? 1}</td>
                <td className="px-3 py-2.5 text-xs text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap" title={s.remark || '—'}>{s.remark || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SegmentsTab({ liveStock, mockSectors, ticketType, canEdit, jumpToEdit, onUpdate, onDirtyChange, onJumpDone }: Props) {
  // Per-flight-set edit
  const [activeEditSetId, setActiveEditSetId] = useState<string | null>(null)
  const [editSectors, setEditSectors]         = useState<EditSector[]>([])
  const [errors, setErrors]                   = useState<Record<string, string>>({})
  const [showConfirm, setShowConfirm]         = useState(false)
  const [saving, setSaving]                   = useState(false)
  const [toast, setToast]                     = useState('')

  // Rename modal
  const [renameSetId, setRenameSetId]   = useState<string | null>(null)
  const [renameName, setRenameName]     = useState('')
  const [renameError, setRenameError]   = useState('')

  // Delete confirm
  const [deleteSetId, setDeleteSetId] = useState<string | null>(null)

  // Add Flight Set modal
  const [showAddSet, setShowAddSet]     = useState(false)
  const [addName, setAddName]           = useState('')
  const [addFrom, setAddFrom]           = useState<'empty' | 'copy'>('empty')
  const [addCopyId, setAddCopyId]       = useState('')
  const [addNameError, setAddNameError] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const flightSets = liveStock ? getStockFlightSets(liveStock) : []
  const minSectors = ticketType === 'FIT' ? 1 : 2

  useEffect(() => {
    if (jumpToEdit && liveStock && flightSets.length > 0) {
      enterEditSet(flightSets[0].flightSetId)
      onJumpDone()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToEdit])

  // ── Per-set edit ────────────────────────────────────────────────────────────

  const enterEditSet = (setId: string) => {
    const fs = flightSets.find(f => f.flightSetId === setId)
    if (!fs) return
    setEditSectors(fs.sectors.map(s => ({ ...s })))
    setErrors({})
    setActiveEditSetId(setId)
    onDirtyChange(true)
  }

  const cancelEdit = () => {
    setActiveEditSetId(null)
    setEditSectors([])
    setErrors({})
    onDirtyChange(false)
  }

  const addSectorToEdit = () => {
    const maxSeq = editSectors.reduce((m, s) => Math.max(m, s.seq), 0)
    setEditSectors(prev => [...prev, {
      sectorId: newId('SEC'),
      seq: maxSeq + 1,
      sectorType: 'Transit',
      airlineCode: liveStock?.airlineCode || '',
      flightNo: '',
      depAirportCode: '',
      arrAirportCode: '',
      depTime: '08:00',
      arrTime: '10:00',
      arrDayOffset: 0,
      dayOffset: 1,
      remark: '',
    }])
  }

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {}
    if (editSectors.length < minSectors) errs._count = `${ticketType} ต้องมีอย่างน้อย ${minSectors} Sector`
    if (editSectors.length > 0 && editSectors[0].sectorType !== 'Departure') errs._order = 'Sector แรกต้องเป็น Departure'
    if (editSectors.length > 1 && ticketType !== 'FIT') {
      const lastType = editSectors[editSectors.length - 1].sectorType
      if (lastType !== 'Arrival' && lastType !== 'Departure') errs._return = 'Sector สุดท้ายต้องเป็น Arrival'
    }
    editSectors.forEach((s, i) => {
      if (!s.airlineCode || !MASTER_AIRLINE_CODE_SET.has(s.airlineCode))
        errs[`airline_${i}`] = s.airlineCode ? 'ไม่พบใน Master' : 'กรุณาเลือก Airline'
      if (!s.flightNo)        errs[`flightNo_${i}`] = 'กรุณาระบุ Flight No.'
      if (!s.depAirportCode)  errs[`dep_${i}`]      = 'กรุณาระบุ From'
      if (!s.arrAirportCode)  errs[`arr_${i}`]      = 'กรุณาระบุ To'
    })
    // Duplicate flight check
    const flightKeyMap = new Map<string, number[]>()
    editSectors.forEach((s, i) => {
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

  const handleSaveSet = () => {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setShowConfirm(true)
  }

  const confirmSaveSet = () => {
    if (!liveStock || !activeEditSetId) return
    setSaving(true)
    const now = new Date().toISOString()
    const activeFS = flightSets.find(f => f.flightSetId === activeEditSetId)!
    const isFirst   = flightSets[0]?.flightSetId === activeEditSetId

    const newSectors: DemoSector[] = editSectors.map((s, i) => ({
      sectorId: s.sectorId, seq: i + 1,
      sectorType: s.sectorType, airlineCode: s.airlineCode,
      flightNo: s.flightNo, depAirportCode: s.depAirportCode,
      arrAirportCode: s.arrAirportCode, depTime: s.depTime, arrTime: s.arrTime,
      arrDayOffset: s.arrDayOffset, dayOffset: s.dayOffset, remark: s.remark,
    }))
    const newRoute = buildRouteTextFromSectors(newSectors)
    const updatedSets: DemoFlightSet[] = flightSets.map(fs =>
      fs.flightSetId === activeEditSetId ? { ...fs, sectors: newSectors } : fs
    )
    const log: DemoLog = {
      logId: newId('LOG'), action: 'แก้ไข Flight Segments',
      message: `Flight Set "${activeFS.flightSetName}": ${newSectors.length} Sectors, Route: ${newRoute}`,
      createdAt: now, createdBy: 'System',
    }
    const updated: DemoStock = {
      ...liveStock,
      sectors: isFirst ? newSectors : liveStock.sectors,
      routeText: isFirst ? newRoute : liveStock.routeText,
      flightSets: updatedSets,
      updatedAt: now,
      logs: [log, ...liveStock.logs],
    }
    saveDemoStock(updated)
    onUpdate(updated)
    setSaving(false)
    setShowConfirm(false)
    setActiveEditSetId(null)
    setEditSectors([])
    onDirtyChange(false)
    showToast(`บันทึก Flight Set "${activeFS.flightSetName}" สำเร็จ`)
  }

  // ── Copy ────────────────────────────────────────────────────────────────────

  const handleCopySet = (sourceId: string) => {
    const source = flightSets.find(f => f.flightSetId === sourceId)
    if (!source || !liveStock) return
    const now = new Date().toISOString()
    const existingNames = flightSets.map(f => f.flightSetName)
    let copyName = `${source.flightSetName} Copy`
    let suffix = 2
    while (existingNames.includes(copyName)) copyName = `${source.flightSetName} Copy ${suffix++}`

    const newFS: DemoFlightSet = {
      flightSetId: newId('FSET'),
      flightSetName: copyName,
      sectors: source.sectors.map(s => ({ ...s, sectorId: newId('SEC') })),
    }
    const log: DemoLog = { logId: newId('LOG'), action: 'คัดลอก Flight Set', message: `คัดลอก "${source.flightSetName}" → "${copyName}"`, createdAt: now, createdBy: 'System' }
    saveDemoStock({ ...liveStock, flightSets: [...flightSets, newFS], updatedAt: now, logs: [log, ...liveStock.logs] })
    onUpdate({ ...liveStock, flightSets: [...flightSets, newFS], updatedAt: now, logs: [log, ...liveStock.logs] })
    showToast(`คัดลอกเป็น "${copyName}" สำเร็จ`)
  }

  // ── Rename ──────────────────────────────────────────────────────────────────

  const openRename = (fs: DemoFlightSet) => { setRenameSetId(fs.flightSetId); setRenameName(fs.flightSetName); setRenameError('') }

  const handleRenameSet = () => {
    if (!renameSetId || !liveStock) return
    const trimmed = renameName.trim()
    if (!trimmed) { setRenameError('กรุณาระบุชื่อ'); return }
    const currentName = flightSets.find(f => f.flightSetId === renameSetId)?.flightSetName ?? ''
    if (trimmed !== currentName && flightSets.filter(f => f.flightSetId !== renameSetId).map(f => f.flightSetName).includes(trimmed)) {
      setRenameError('มีชื่อ Flight Set นี้แล้ว'); return
    }
    const now = new Date().toISOString()
    const updatedSets = flightSets.map(f => f.flightSetId === renameSetId ? { ...f, flightSetName: trimmed } : f)
    const log: DemoLog = { logId: newId('LOG'), action: 'เปลี่ยนชื่อ Flight Set', message: `"${currentName}" → "${trimmed}"`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = { ...liveStock, flightSets: updatedSets, updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setRenameSetId(null)
    setRenameName('')
    showToast(`เปลี่ยนชื่อเป็น "${trimmed}" สำเร็จ`)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  const tryDeleteSet = (setId: string) => {
    const inUse = (liveStock?.pnrs ?? []).some(p => p.flightSetId === setId)
    if (inUse) { showToast('ไม่สามารถลบได้ เนื่องจากมี PNR ใช้งาน Flight Set นี้อยู่'); return }
    setDeleteSetId(setId)
  }

  const handleDeleteSet = () => {
    if (!deleteSetId || !liveStock) return
    const fsName = flightSets.find(f => f.flightSetId === deleteSetId)?.flightSetName ?? ''
    const now = new Date().toISOString()
    const updatedSets = flightSets.filter(f => f.flightSetId !== deleteSetId)
    const log: DemoLog = { logId: newId('LOG'), action: 'ลบ Flight Set', message: `ลบ Flight Set "${fsName}"`, createdAt: now, createdBy: 'System' }
    const updated: DemoStock = {
      ...liveStock,
      flightSets: updatedSets,
      sectors: updatedSets[0]?.sectors ?? liveStock.sectors,
      routeText: buildRouteTextFromSectors(updatedSets[0]?.sectors ?? liveStock.sectors),
      updatedAt: now,
      logs: [log, ...liveStock.logs],
    }
    saveDemoStock(updated)
    onUpdate(updated)
    setDeleteSetId(null)
    showToast(`ลบ Flight Set "${fsName}" สำเร็จ`)
  }

  // ── Add Flight Set ──────────────────────────────────────────────────────────

  const openAddSet = () => {
    setAddName('')
    setAddFrom('empty')
    setAddCopyId(flightSets[0]?.flightSetId ?? '')
    setAddNameError('')
    setShowAddSet(true)
  }

  const handleAddFlightSet = () => {
    const trimmed = addName.trim()
    if (!trimmed) { setAddNameError('กรุณาระบุชื่อ Flight Set'); return }
    if (flightSets.map(f => f.flightSetName).includes(trimmed)) { setAddNameError('มีชื่อ Flight Set นี้แล้ว'); return }
    if (!liveStock) return
    const copySource = addFrom === 'copy' ? flightSets.find(f => f.flightSetId === addCopyId) : null
    const newFS: DemoFlightSet = {
      flightSetId: newId('FSET'),
      flightSetName: trimmed,
      sectors: copySource ? copySource.sectors.map(s => ({ ...s, sectorId: newId('SEC') })) : [],
    }
    const now = new Date().toISOString()
    const log: DemoLog = {
      logId: newId('LOG'), action: 'เพิ่ม Flight Set',
      message: `เพิ่ม "${trimmed}"${copySource ? ` (คัดลอกจาก "${copySource.flightSetName}")` : ' (ว่างเปล่า)'}`,
      createdAt: now, createdBy: 'System',
    }
    const updated: DemoStock = { ...liveStock, flightSets: [...flightSets, newFS], updatedAt: now, logs: [log, ...liveStock.logs] }
    saveDemoStock(updated)
    onUpdate(updated)
    setShowAddSet(false)
    showToast(`เพิ่ม Flight Set "${trimmed}" สำเร็จ`)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!liveStock) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <SectorReadTable sectors={mockSectors.map((s, i) => ({
          sectorId: `mock-${i}`, seq: s.seq, sectorType: s.sector_type,
          airlineCode: s.airline_code, flightNo: s.flight_no,
          depAirportCode: s.dep_airport_code, arrAirportCode: s.arr_airport_code,
          depTime: s.dep_time, arrTime: s.arr_time,
          arrDayOffset: s.arr_day_offset, dayOffset: s.day_offset, remark: s.remark,
        }))} />
      </div>
    )
  }

  const activeFS     = flightSets.find(f => f.flightSetId === activeEditSetId)
  const deletingFS   = flightSets.find(f => f.flightSetId === deleteSetId)
  const activeSetPnrCount = (liveStock.pnrs ?? []).filter(p => p.flightSetId === deleteSetId).length

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2 text-sm text-[#05a94f] bg-green-50 border border-green-200 rounded-xl px-3 py-2">
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      {/* Action Bar */}
      {canEdit && !activeEditSetId && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" icon={<PlusCircle size={13} />} onClick={openAddSet}>เพิ่ม Flight Set</Button>
        </div>
      )}

      {/* Edit Mode Banner */}
      {activeEditSetId && activeFS && (
        <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <Pencil size={14} />
            <span className="font-medium">กำลังแก้ไข Segments ของ <strong>{activeFS.flightSetName}</strong></span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={cancelEdit}>ยกเลิก</Button>
            <Button size="sm" onClick={handleSaveSet}>บันทึกการเปลี่ยนแปลง</Button>
          </div>
        </div>
      )}

      {/* Global validation errors */}
      {Object.keys(errors).filter(k => k.startsWith('_')).map(k => (
        <p key={k} className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={11} /> {errors[k]}</p>
      ))}

      {/* Flight Set Cards */}
      <div className="space-y-4">
        {flightSets.map((fs, fsIdx) => {
          const fsRoute    = buildRouteTextFromSectors(fs.sectors)
          const isEditing  = activeEditSetId === fs.flightSetId
          const pnrCount   = (liveStock.pnrs ?? []).filter(p => p.flightSetId === fs.flightSetId).length
          const canDelete  = canEdit && flightSets.length > 1 && pnrCount === 0
          const deleteTitle = flightSets.length <= 1
            ? 'ต้องมีอย่างน้อย 1 Flight Set'
            : pnrCount > 0 ? `มี PNR ใช้งานอยู่ ${pnrCount} รายการ` : 'ลบ Flight Set'

          return (
            <div key={fs.flightSetId}
              className={`rounded-xl border overflow-hidden transition-all ${isEditing ? 'border-blue-300 shadow-md' : 'border-slate-200'}`}>
              {/* Card Header */}
              <div className={`flex items-center justify-between gap-3 px-4 py-3 border-b ${isEditing ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isEditing ? 'bg-blue-100' : 'bg-white border border-slate-200'}`}>
                    <PlaneTakeoff size={14} className={isEditing ? 'text-blue-600' : 'text-slate-500'} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Flight Set</span>
                      {fsIdx === 0 && !fs.isCustom && (
                        <span className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-semibold bg-green-100 text-green-700">Default</span>
                      )}
                      {fs.isCustom && (
                        <span className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-semibold bg-orange-100 text-orange-700">Custom</span>
                      )}
                      {pnrCount > 0 && (
                        <span className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                          Used by {pnrCount} PNR
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">{fs.flightSetName}</h3>
                      <span className="text-xs text-slate-400 hidden sm:block">
                        Route: <span className="font-mono font-semibold text-slate-600">{fsRoute || '—'}</span>
                        {' · '}
                        Segments: <span className="font-semibold text-slate-600">{fs.sectors.length}</span>
                      </span>
                    </div>
                    {fs.isCustom && fs.createdFromPnrId && (() => {
                      const srcPnr = liveStock.pnrs?.find(p => p.pnrId === fs.createdFromPnrId)
                      return srcPnr ? (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          สร้างจาก PNR: <span className="font-mono text-slate-500">{srcPnr.pnrDisplay}</span>
                        </p>
                      ) : null
                    })()}
                  </div>
                </div>

                {canEdit && !activeEditSetId && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button title="แก้ไข Segment" onClick={() => enterEditSet(fs.flightSetId)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors whitespace-nowrap">
                      <Pencil size={11} /> แก้ไข Segment
                    </button>
                    <button title="แก้ไขชื่อ" onClick={() => openRename(fs)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors whitespace-nowrap">
                      <Pencil size={11} /> ชื่อ
                    </button>
                    <button title="คัดลอก Flight Set" onClick={() => handleCopySet(fs.flightSetId)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-green-700 hover:bg-green-50 rounded-md transition-colors whitespace-nowrap">
                      <Copy size={11} /> คัดลอก
                    </button>
                    <button title={deleteTitle} onClick={() => tryDeleteSet(fs.flightSetId)} disabled={!canDelete}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>

              {/* Sectors */}
              {isEditing ? (
                <SectorEditTable
                  sectors={editSectors}
                  minSectors={minSectors}
                  errors={errors}
                  defaultAirlineCode={liveStock.airlineCode}
                  onChange={setEditSectors}
                  onAdd={addSectorToEdit}
                  onRemove={idx => setEditSectors(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, seq: i + 1 })))}
                />
              ) : (
                <SectorReadTable sectors={fs.sectors} />
              )}
            </div>
          )
        })}
      </div>

      {/* Save Confirm Modal */}
      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="ยืนยันการแก้ไข Segments"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowConfirm(false)}>ยกเลิก</Button>
            <Button onClick={confirmSaveSet} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'ยืนยัน'}</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>บันทึกการแก้ไข Segments ของ <strong>{activeFS?.flightSetName}</strong>?</p>
          {activeEditSetId === flightSets[0]?.flightSetId && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">
              <p className="font-semibold text-amber-700 flex items-center gap-1.5 mb-1"><AlertTriangle size={12} /> Primary Flight Set</p>
              <p className="text-amber-600">
                การแก้ไขนี้จะอัปเดต Route ของ Stock ({(liveStock.pnrs ?? []).filter(p => p.flightSetId === flightSets[0]?.flightSetId || !p.flightSetId).length} PNR)
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* Rename Modal */}
      <Modal
        open={!!renameSetId}
        onClose={() => { setRenameSetId(null); setRenameName(''); setRenameError('') }}
        title="แก้ไขชื่อ Flight Set"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setRenameSetId(null); setRenameName(''); setRenameError('') }}>ยกเลิก</Button>
            <Button onClick={handleRenameSet}>บันทึก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">ชื่อ Flight Set <span className="text-red-500">*</span></label>
            <input
              type="text" value={renameName} maxLength={50} autoFocus
              onChange={e => { setRenameName(e.target.value); setRenameError('') }}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${renameError ? 'border-red-400' : 'border-slate-300'}`}
              placeholder="เช่น TG670-671, Morning Flight"
            />
            {renameError && <p className="text-xs text-red-500 mt-1">{renameError}</p>}
            <p className="text-xs text-slate-400 mt-1">{renameName.length}/50</p>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        open={!!deleteSetId}
        onClose={() => setDeleteSetId(null)}
        title="ยืนยันการลบ Flight Set"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteSetId(null)}>ยกเลิก</Button>
            <Button variant="danger" onClick={handleDeleteSet} disabled={activeSetPnrCount > 0}>ลบ Flight Set</Button>
          </>
        }
      >
        {deletingFS && (
          <div className="space-y-3 text-sm">
            <p>ต้องการลบ Flight Set <strong>&ldquo;{deletingFS.flightSetName}&rdquo;</strong> และ {deletingFS.sectors.length} Segment ใช่หรือไม่?</p>
            {activeSetPnrCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600">
                ไม่สามารถลบ Flight Set นี้ได้ เนื่องจากมี PNR ใช้งานอยู่ {activeSetPnrCount} รายการ
              </div>
            )}
            <p className="text-xs text-red-500">การลบไม่สามารถยกเลิกได้</p>
          </div>
        )}
      </Modal>

      {/* Add Flight Set Modal */}
      <Modal
        open={showAddSet}
        onClose={() => setShowAddSet(false)}
        title="เพิ่ม Flight Set ใหม่"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAddSet(false)}>ยกเลิก</Button>
            <Button onClick={handleAddFlightSet}>เพิ่ม Flight Set</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">ชื่อ Flight Set <span className="text-red-500">*</span></label>
            <input
              type="text" value={addName} maxLength={50} autoFocus
              onChange={e => { setAddName(e.target.value); setAddNameError('') }}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 ${addNameError ? 'border-red-400' : 'border-slate-300'}`}
              placeholder="เช่น TG670-671, Morning Flight"
            />
            {addNameError && <p className="text-xs text-red-500 mt-1">{addNameError}</p>}
            <p className="text-xs text-slate-400 mt-1">{addName.length}/50</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">วิธีเริ่มต้น</label>
            <div className="grid grid-cols-2 gap-2">
              {(['empty', 'copy'] as const).map(opt => (
                <button key={opt} type="button" onClick={() => setAddFrom(opt)}
                  className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left ${addFrom === opt ? 'border-[#05a94f] bg-green-50 text-[#05a94f]' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {opt === 'empty' ? '📄 สร้างเปล่า' : '⧉ คัดลอกจาก Flight Set เดิม'}
                </button>
              ))}
            </div>
            {addFrom === 'copy' && flightSets.length > 0 && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">คัดลอกจาก</label>
                <select value={addCopyId} onChange={e => setAddCopyId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30">
                  {flightSets.map(f => (
                    <option key={f.flightSetId} value={f.flightSetId}>{f.flightSetName} ({f.sectors.length} Segments)</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
