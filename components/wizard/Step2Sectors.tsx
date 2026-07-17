'use client'

import { Fragment, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { PlusCircle, Trash2, AlertTriangle, Info, Pencil, Copy, Star, CheckCircle2 } from 'lucide-react'
import { TimeInput } from '@/components/ui/time-input'
import { isValidHHmm, sameAirport } from '@/lib/time-utils'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import type { FlightSectorFormData, FlightScheduleFormData, SectorType, TicketType, TripType } from '@/types'
import { getActiveAirports, getAirportByCode, type StoredAirport } from '@/lib/airport-storage'
import { getCountryByCode } from '@/lib/country-storage'
import { AirlineCell } from '@/components/shared/AirlineCell'

const SECTOR_TYPE_OPTIONS: { value: SectorType; label: string; text: string }[] = [
  { value: 'Departure', label: 'Departure', text: 'text-green-600' },
  { value: 'Transit',   label: 'Transit',   text: 'text-amber-600' },
  { value: 'Arrival',   label: 'Return',    text: 'text-purple-600' },
]

const MIDDLE_TYPE_OPTIONS = SECTOR_TYPE_OPTIONS.filter(o => o.value === 'Transit')

// ─── Helper: compute +Day ─────────────────────────────────────────────────────
function calcArrDayOffset(depTime: string, arrTime: string): number {
  if (!depTime || !arrTime) return 0
  if (!isValidHHmm(depTime) || !isValidHHmm(arrTime)) return 0
  return arrTime < depTime ? 1 : 0
}

// ─── Airport Autocomplete Cell ─────────────────────────────────────────────────
// airports = Active airports only, passed from parent component
function AirportCell({
  value, onChange, airports,
}: {
  value: string
  onChange: (v: string) => void
  airports: StoredAirport[]
}) {
  const [text, setText]       = useState(value)
  const [open, setOpen]       = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos]         = useState({ top: 0, left: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { setText(value) }, [value])

  const filtered = airports.filter(a =>
    a.code.startsWith(text.toUpperCase()) ||
    a.name.toLowerCase().includes(text.toLowerCase()) ||
    a.city.toLowerCase().includes(text.toLowerCase())
  ).slice(0, 10)

  const select = (code: string) => { onChange(code); setText(code); setOpen(false) }

  const reposition = () => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + 2, left: r.left })
  }

  useEffect(() => {
    if (!open) return
    const update = () => reposition()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false)
      const upper = text.toUpperCase()
      const match = airports.find(a => a.code === upper)
      if (text && !match) {
        // Typed text doesn't match any active airport — revert
        setText(value)
      } else if (match && upper !== value) {
        // Typed a valid code directly (not via click) — accept it
        onChange(upper)
      }
    }, 150)
  }

  // Warn if current saved value is not in active airports
  const isUnknown = value && !airports.some(a => a.code === value)

  const dropdown = mounted && open && filtered.length > 0
    ? createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 300, zIndex: 9999 }}
          className="bg-white border border-slate-300 rounded-lg shadow-xl overflow-hidden"
        >
          {filtered.map(a => (
            <button
              key={a.code}
              type="button"
              onMouseDown={e => { e.preventDefault(); select(a.code) }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-50 transition-colors',
                a.code === value && 'bg-blue-50'
              )}
            >
              <span className="font-mono font-bold text-xs text-[#05a94f] w-9 shrink-0">{a.code}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-700 font-medium truncate">{a.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{a.city}, {a.countryCode}</p>
              </div>
            </button>
          ))}
        </div>,
        document.body
      )
    : null

  return (
    <div className={cn('relative w-full', isUnknown && 'bg-amber-50/80')}>
      <input
        ref={inputRef}
        value={text}
        onChange={e => { setText(e.target.value.toUpperCase()); setOpen(true) }}
        onFocus={() => { reposition(); setOpen(true) }}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && filtered[0]) select(filtered[0].code)
        }}
        maxLength={5}
        placeholder="BKK"
        className="w-full h-full px-2 py-[5px] text-xs font-mono font-semibold uppercase bg-transparent outline-none focus:bg-blue-50 placeholder:text-slate-300"
      />
      {dropdown}
    </div>
  )
}

// ─── Table cell wrapper ───────────────────────────────────────────────────────
function XL({ children, className, center, readOnly, title }: {
  children: React.ReactNode; className?: string; center?: boolean; readOnly?: boolean; title?: string
}) {
  return (
    <td title={title} className={cn('border border-slate-200 p-0 relative align-middle', readOnly && 'bg-slate-50/80', center && 'text-center', className)}>
      {children}
    </td>
  )
}

// ─── Build route text ─────────────────────────────────────────────────────────
// Open Jaw routes use ' / ' separator: BKK-HND / KIX-BKK
function buildRoute(sectors: FlightSectorFormData[]): string {
  if (!sectors.length) return ''
  const segments: string[] = []
  let seg: string[] = []
  if (sectors[0]?.dep_airport_code) seg.push(sectors[0].dep_airport_code)
  for (let i = 0; i < sectors.length; i++) {
    const arr = sectors[i].arr_airport_code
    if (arr) seg.push(arr)
    if (i < sectors.length - 1) {
      const nextDep = sectors[i + 1].dep_airport_code
      if (arr && nextDep && arr !== nextDep) {
        segments.push(seg.filter(Boolean).join('-'))
        seg = [nextDep]
      }
    }
  }
  if (seg.length) segments.push(seg.filter(Boolean).join('-'))
  return segments.filter(Boolean).join(' / ')
}


// ─── Default blank sector ─────────────────────────────────────────────────────
function blankSector(seq: number, type: SectorType, airlineCode: string, depFrom = ''): FlightSectorFormData {
  return {
    seq, sector_type: type,
    airline_code: airlineCode, flight_no: '',
    dep_airport_code: depFrom, arr_airport_code: '',
    dep_time: '08:00', arr_time: '16:00',
    arr_day_offset: 0, day_offset: 1, remark: '',
  }
}

// ─── Empty sectors for a new blank schedule ───────────────────────────────────
function emptySectors(tripType: TripType, airlineCode: string): FlightSectorFormData[] {
  const dep = blankSector(1, 'Departure', airlineCode)
  if (tripType === 'One-way') return [dep]
  const arr: FlightSectorFormData = {
    seq: 2, sector_type: 'Arrival',
    airline_code: airlineCode, flight_no: '',
    dep_airport_code: '', arr_airport_code: '',
    dep_time: '17:00', arr_time: '22:00',
    arr_day_offset: 0, day_offset: 1, remark: '',
  }
  return [dep, arr]
}

// ─── Schedule Name Modal ──────────────────────────────────────────────────────

interface ScheduleNameModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (name: string) => void
  title: string
  fieldLabel: string
  confirmLabel: string
  defaultValue: string
  existingNames: string[]
  sourceName?: string
}

function ScheduleNameModal({
  open, onClose, onConfirm, title, fieldLabel, confirmLabel, defaultValue, existingNames, sourceName,
}: ScheduleNameModalProps) {
  const [name, setName] = useState(defaultValue)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setName(defaultValue); setError('') }
  }, [open, defaultValue])

  const handleConfirm = () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('กรุณาระบุชื่อชุดเที่ยวบิน'); return }
    if (trimmed.length > 100) { setError('ชื่อต้องไม่เกิน 100 ตัวอักษร'); return }
    const lowerExisting = existingNames.map(n => n.trim().toLowerCase())
    if (lowerExisting.includes(trimmed.toLowerCase())) {
      setError('มีชื่อชุดเที่ยวบินนี้อยู่แล้ว กรุณาระบุชื่ออื่น')
      return
    }
    onConfirm(trimmed)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={handleConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {sourceName !== undefined && (
          <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <span className="text-slate-500">ชุดต้นทาง: </span>
            <span className="font-semibold text-slate-700">{sourceName}</span>
          </div>
        )}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">
            {fieldLabel} <span className="text-red-400">*</span>
          </label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            maxLength={100}
            placeholder="เช่น TG703/704 รอบกลางคืน"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      </div>
    </Modal>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Step2Props {
  schedules: FlightScheduleFormData[]
  onChange: (schedules: FlightScheduleFormData[]) => void
  ticketType: TicketType
  tripType: TripType
  airlineCode: string
  onTripTypeChange: (t: TripType) => void
}

export default function Step2Sectors({ schedules, onChange, ticketType, tripType, airlineCode, onTripTypeChange }: Step2Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [addModalOpen, setAddModalOpen]     = useState(false)
  const [copyModalOpen, setCopyModalOpen]   = useState(false)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const successTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstErrorRowRef   = useRef<HTMLTableRowElement | null>(null)
  const prevSameCountRef   = useRef(0)

  // ── Airport master data (Active only) ──────────────────────────────────────
  const [airports, setAirports] = useState<StoredAirport[]>([])
  useEffect(() => {
    setAirports(getActiveAirports())
    const handler = () => setAirports(getActiveAirports())
    window.addEventListener('airports_updated', handler)
    return () => window.removeEventListener('airports_updated', handler)
  }, [])

  // Track schedules where user has manually set Arrival From (Open Jaw intent)
  const arrFromManualRef = useRef(new Set<string>())
  // Track schedules where user has manually set Arrival To (overriding home-airport default)
  const arrToManualRef   = useRef(new Set<string>())

  const showSuccess = (msg: string) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
    setSuccessMsg(msg)
    successTimerRef.current = setTimeout(() => setSuccessMsg(''), 3000)
  }

  // Clamp activeIdx if schedules array shrinks
  const safeIdx = Math.min(activeIdx, Math.max(0, schedules.length - 1))
  const schedule = schedules[safeIdx] ?? schedules[0]
  const sectors = schedule?.sectors ?? []

  // On tab switch: initialize Open Jaw / manual-To flags from existing sector data
  useEffect(() => {
    const last = sectors[sectors.length - 1]
    const prev = sectors[sectors.length - 2]
    const id   = schedule?.scheduleId ?? ''
    if (last && prev) {
      const openJaw = last.dep_airport_code !== '' && prev.arr_airport_code !== '' &&
                      last.dep_airport_code !== prev.arr_airport_code
      if (openJaw) arrFromManualRef.current.add(id)
      else arrFromManualRef.current.delete(id)
      const home = sectors[0]?.dep_airport_code ?? ''
      const manualTo = last.arr_airport_code !== '' && home !== '' && last.arr_airport_code !== home
      if (manualTo) arrToManualRef.current.add(id)
      else arrToManualRef.current.delete(id)
    }
  }, [safeIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const firstArrCode  = sectors[0]?.arr_airport_code
  const destAirport   = firstArrCode ? getAirportByCode(firstArrCode) : null
  const countryLookup = destAirport ? getCountryByCode(destAirport.countryCode) : null
  const countryInfo   = destAirport
    ? {
        countryCode: destAirport.countryCode,
        countryName: countryLookup?.displayName ?? destAirport.countryCode,
      }
    : null

  // All names for duplicate validation
  const allNames = schedules.map(s => s.scheduleName)
  const otherNames = schedules.filter((_, i) => i !== safeIdx).map(s => s.scheduleName)

  // Helper: update the active schedule's sectors + sync country info
  const updateSectors = (newSectors: FlightSectorFormData[]) => {
    const lastIdx = newSectors.length - 1
    const schedId = schedule?.scheduleId ?? ''
    const normalised = newSectors.map((s, i) => {
      let r = { ...s }
      // Sector 1: Travel Day always 1
      if (i === 0) r.day_offset = 1
      // Arrival sector (last, multi-sector): From auto-syncs unless user set Open Jaw
      if (i === lastIdx && lastIdx > 0) {
        if (!arrFromManualRef.current.has(schedId)) {
          r.dep_airport_code = newSectors[i - 1].arr_airport_code
        }
        // Arrival To auto-syncs to homeAirport unless user manually changed it
        if (!arrToManualRef.current.has(schedId)) {
          r.arr_airport_code = newSectors[0].dep_airport_code
        }
      }
      return r
    })
    const firstArr = normalised[0]?.arr_airport_code
    const ap = firstArr ? getAirportByCode(firstArr) : null
    const cl = ap ? getCountryByCode(ap.countryCode) : null
    const updated: FlightScheduleFormData = {
      ...schedule,
      sectors: normalised,
      countryCode: ap?.countryCode,
      countryName: cl?.displayName ?? ap?.countryCode,
      destinationAirport: firstArr || undefined,
    }
    onChange(schedules.map((s, i) => i === safeIdx ? updated : s))
  }

  // ─── Schedule handlers ──────────────────────────────────────────────────────

  const handleAddSchedule = (name: string) => {
    const noMain = !schedules.some(s => s.isMain)
    const newSch: FlightScheduleFormData = {
      scheduleId: `SCH-${Date.now()}`,
      scheduleName: name,
      isMain: noMain,
      remark: '',
      sectors: emptySectors(tripType, airlineCode),
    }
    const next = [...schedules, newSch]
    onChange(next)
    setActiveIdx(next.length - 1)
    setAddModalOpen(false)
    showSuccess('เพิ่มชุดเที่ยวบินใหม่เรียบร้อยแล้ว')
  }

  const handleDuplicateSchedule = (name: string) => {
    const src = schedules[safeIdx]
    const newSch: FlightScheduleFormData = {
      ...src,
      scheduleId: `SCH-${Date.now()}`,
      scheduleName: name,
      isMain: false,
      sourceScheduleId: src.scheduleId,
      sectors: src.sectors.map(s => ({ ...s })),
    }
    const next = [...schedules, newSch]
    onChange(next)
    setActiveIdx(next.length - 1)
    setCopyModalOpen(false)
    showSuccess('คัดลอกชุดเที่ยวบินเรียบร้อยแล้ว')
  }

  const handleRenameSchedule = (name: string) => {
    onChange(schedules.map((s, i) => i === safeIdx ? { ...s, scheduleName: name } : s))
    setRenameModalOpen(false)
    showSuccess('เปลี่ยนชื่อชุดเที่ยวบินเรียบร้อยแล้ว')
  }

  const handleDeleteSchedule = () => {
    if (schedules.length <= 1) return
    if (schedule?.isMain) {
      window.alert('กรุณาตั้งชุดอื่นเป็นชุดหลักก่อนลบ')
      return
    }
    if (!window.confirm(`ลบ "${schedule?.scheduleName}" หรือไม่?`)) return
    const next = schedules.filter((_, i) => i !== safeIdx)
    onChange(next)
    setActiveIdx(Math.min(safeIdx, next.length - 1))
  }

  const setAsMain = (idx: number) => {
    onChange(schedules.map((s, i) => ({ ...s, isMain: i === idx })))
  }

  const canDelete = schedules.length > 1 && !schedule?.isMain

  // ── Validation ───────────────────────────────────────────────────────────────
  const isValid = (() => {
    if (!sectors.length) return false
    if (sectors[0].sector_type !== 'Departure') return false
    if (tripType === 'One-way') {
      if (sectors.length === 1) return true
      return sectors[sectors.length - 1].sector_type === 'Arrival'
    }
    // Round-trip and Multi-city: min 2 sectors, last must be Arrival
    return sectors.length >= 2 && sectors[sectors.length - 1].sector_type === 'Arrival'
  })()

  // ── Row state helpers ─────────────────────────────────────────────────────────
  const isTypeLocked = (idx: number) => {
    if (idx === 0) return true                                        // Departure — always locked
    if (sectors.length > 1 && idx === sectors.length - 1) return true // Arrival — always locked
    if (tripType === 'One-way' && sectors.length <= 1) return true    // 1-sector One-way has no middle
    return false                                                       // Transit — dropdown (Transit only)
  }

  const canDeleteRow = (idx: number) =>
    tripType !== 'One-way' && idx > 0 && idx < sectors.length - 1 && sectors.length > 2

  const canAdd = tripType === 'Round-trip' || tripType === 'Multi-city'

  // ── Trip Type change ──────────────────────────────────────────────────────────
  const handleTripTypeChange = (newType: TripType) => {
    if (newType === tripType) return
    // Reset Open Jaw tracking when trip type changes
    arrFromManualRef.current.delete(schedule?.scheduleId ?? '')

    if (newType === 'One-way') {
      // Keep all sectors; relabel first=Departure, last=Arrival (if >1), middle=Transit
      const base = sectors.length ? [...sectors] : [blankSector(1, 'Departure', airlineCode)]
      const n = base.length
      const normalized = base.map((s, i) => ({
        ...s, seq: i + 1,
        sector_type: (i === 0 ? 'Departure' : n > 1 && i === n - 1 ? 'Arrival' : 'Transit') as SectorType,
      }))
      updateSectors(normalized)
      onTripTypeChange(newType)
      return
    }

    if (newType === 'Round-trip') {
      // Keep all sectors; relabel first=Departure, last=Arrival, middle=Transit
      // If only 1 sector exists, append a blank Arrival
      const base = sectors.length ? [...sectors] : [blankSector(1, 'Departure', airlineCode)]
      if (base.length === 1) {
        base.push({
          seq: 2, sector_type: 'Arrival', airline_code: airlineCode, flight_no: '',
          dep_airport_code: base[0].arr_airport_code || '', arr_airport_code: base[0].dep_airport_code || '',
          dep_time: '17:00', arr_time: '22:00', arr_day_offset: 0, day_offset: 1, remark: '',
        })
      }
      const n = base.length
      const normalized = base.map((s, i) => ({
        ...s, seq: i + 1,
        sector_type: (i === 0 ? 'Departure' : i === n - 1 ? 'Arrival' : 'Transit') as SectorType,
      }))
      updateSectors(normalized)
      onTripTypeChange(newType)
      return
    }

    // Multi-city — keep all sectors; relabel first/last, normalize middle
    const base = sectors.length ? [...sectors] : [blankSector(1, 'Departure', airlineCode, 'BKK')]
    if (base.length === 1) {
      const prev = base[0]
      base.push({ seq: 2, sector_type: 'Arrival', airline_code: airlineCode, flight_no: '', dep_airport_code: prev.arr_airport_code || '', arr_airport_code: prev.dep_airport_code || '', dep_time: '17:00', arr_time: '22:00', arr_day_offset: 0, day_offset: 1, remark: '' })
    }
    const n = base.length
    const normalized = base.map((s, i) => ({
      ...s, seq: i + 1,
      sector_type: (i === 0 ? 'Departure' : i === n - 1 ? 'Arrival' : 'Transit') as SectorType,
    }))
    updateSectors(normalized)
    onTripTypeChange(newType)
  }

  // ── Row update ────────────────────────────────────────────────────────────────
  const update = (idx: number, patch: Partial<FlightSectorFormData>) => {
    updateSectors(sectors.map((s, i) => {
      if (i !== idx) return s
      const u = { ...s, ...patch }
      if (patch.dep_time !== undefined || patch.arr_time !== undefined) {
        u.arr_day_offset = calcArrDayOffset(u.dep_time, u.arr_time)
      }
      return u
    }))
  }

  // ── Add Sector (Multi-city only) ──────────────────────────────────────────────
  const addSector = () => {
    if (!canAdd) return
    let insertAt = sectors.length
    for (let i = sectors.length - 1; i >= 0; i--) {
      if (sectors[i].sector_type === 'Arrival') { insertAt = i; break }
    }
    const prev = sectors[insertAt - 1]
    const newSector = blankSector(insertAt + 1, 'Transit', airlineCode, prev?.arr_airport_code || '')
    updateSectors(
      [...sectors.slice(0, insertAt), newSector, ...sectors.slice(insertAt)]
        .map((s, i) => ({ ...s, seq: i + 1 }))
    )
  }

  // ── Delete row ────────────────────────────────────────────────────────────────
  const deleteRow = (idx: number) => {
    if (!canDeleteRow(idx)) return
    updateSectors(sectors.filter((_, i) => i !== idx).map((s, i) => ({ ...s, seq: i + 1 })))
  }

  // ── Same-airport detection ────────────────────────────────────────────────────
  // Computed reactively: any sector where both From and To are filled and equal
  const sameAirportSet = new Set(
    sectors.reduce<number[]>((acc, s, i) => {
      if (sameAirport(s.dep_airport_code, s.arr_airport_code)) acc.push(i)
      return acc
    }, [])
  )
  const firstSameAirportIdx = sameAirportSet.size > 0 ? Math.min(...[...sameAirportSet]) : -1

  // Scroll to first offending row when errors first appear (0 → >0 transition)
  useEffect(() => {
    const cur = sameAirportSet.size
    if (cur > 0 && prevSameCountRef.current === 0) {
      firstErrorRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    prevSameCountRef.current = cur
  }, [sameAirportSet.size]) // eslint-disable-line react-hooks/exhaustive-deps

  // Skip route calculation when any sector has matching From/To
  const route = sameAirportSet.size > 0 ? '' : buildRoute(sectors)

  // Home airport = Sector 1 From (Thai airport)
  const homeAirport = sectors[0]?.dep_airport_code ?? ''

  // Transit continuity errors + Open Jaw detection (Arrival From may differ legitimately)
  const routeGaps: { sectorA: number; sectorB: number; codeA: string; codeB: string }[] = []
  const openJawSegments: { from: string; to: string }[] = []
  for (let i = 0; i < sectors.length - 1; i++) {
    const toCode   = sectors[i].arr_airport_code
    const fromCode = sectors[i + 1].dep_airport_code
    if (toCode && fromCode && toCode !== fromCode) {
      if (i === sectors.length - 2) {
        // Gap before Arrival sector = Open Jaw (info only, not an error)
        openJawSegments.push({ from: toCode, to: fromCode })
      } else {
        // Transit gap = actual route continuity error
        routeGaps.push({ sectorA: i + 1, sectorB: i + 2, codeA: toCode, codeB: fromCode })
      }
    }
  }

  // Return-airport mismatch: last sector To must equal homeAirport (multi-sector only)
  const lastTo = sectors[sectors.length - 1]?.arr_airport_code ?? ''
  const returnMismatch =
    sectors.length > 1 && homeAirport !== '' && lastTo !== '' && lastTo !== homeAirport

  // Duplicate Flight No detection within the active schedule
  const flightKeyMap = new Map<string, number[]>()
  sectors.forEach((s, i) => {
    if (s.airline_code && s.flight_no) {
      const key = `${s.airline_code}${s.flight_no}`
      const arr = flightKeyMap.get(key) ?? []
      arr.push(i)
      flightKeyMap.set(key, arr)
    }
  })
  const duplicateFlightKeys = new Set<string>(
    [...flightKeyMap.entries()].filter(([, idxs]) => idxs.length > 1).map(([key]) => key)
  )
  const isDupeFlight = (s: FlightSectorFormData) =>
    !!(s.airline_code && s.flight_no && duplicateFlightKeys.has(`${s.airline_code}${s.flight_no}`))

  // Travel Day validation
  const travelDayErrors: { sector: number; msg: string }[] = sectors.map((s, i) => {
    if (i === 0) return null   // Sector 1 is always locked to 1
    if (s.day_offset === 0 || s.day_offset === undefined || s.day_offset === null)
      return { sector: i + 1, msg: 'กรุณาระบุ Travel Day' }
    if (s.day_offset < 1)
      return { sector: i + 1, msg: 'Travel Day ต้องเริ่มต้นที่ 1 เท่านั้น' }
    return null
  }).filter((e): e is { sector: number; msg: string } => e !== null)

  const COLS = 12

  return (
    <div className="space-y-3">
      {/* Success message */}
      {successMsg && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
          <CheckCircle2 size={13} className="shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Schedule tabs + content */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">

        {/* Tab bar */}
        <div className="flex items-center flex-wrap gap-0 border-b border-slate-200 bg-slate-50 px-3 pt-2">
          {schedules.map((sch, idx) => (
            <button
              key={sch.scheduleId}
              type="button"
              onClick={() => setActiveIdx(idx)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-t-lg border border-b-0 mr-1 mb-0 transition-colors flex items-center gap-1.5 whitespace-nowrap',
                idx === safeIdx
                  ? 'bg-white border-slate-300 text-[#05a94f]'
                  : 'bg-slate-100 border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              <span>{sch.scheduleName}</span>
              {sch.isMain && (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                  ชุดหลัก
                </span>
              )}
            </button>
          ))}
          {/* Add schedule button */}
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="px-2 py-1 text-xs text-slate-400 hover:text-[#05a94f] flex items-center gap-1 ml-1 whitespace-nowrap"
          >
            <PlusCircle size={12} />เพิ่มชุดเที่ยวบิน
          </button>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-b border-slate-100 flex-wrap">
          {/* Rename */}
          <button
            type="button"
            onClick={() => setRenameModalOpen(true)}
            className="text-xs px-2 py-1 rounded bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 flex items-center gap-1 transition-colors"
          >
            <Pencil size={11} />เปลี่ยนชื่อ
          </button>

          {/* Copy */}
          <button
            type="button"
            onClick={() => setCopyModalOpen(true)}
            className="text-xs px-2 py-1 rounded bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 flex items-center gap-1 transition-colors"
          >
            <Copy size={11} />คัดลอกชุด
          </button>

          {/* Set as main */}
          {schedule && !schedule.isMain && (
            <button
              type="button"
              onClick={() => setAsMain(safeIdx)}
              className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 flex items-center gap-1 transition-colors"
            >
              <Star size={11} />ตั้งเป็นชุดหลัก
            </button>
          )}

          {/* Delete */}
          <button
            type="button"
            onClick={handleDeleteSchedule}
            disabled={!canDelete}
            title={
              schedules.length <= 1 ? 'ไม่สามารถลบชุดเดียวที่เหลือ'
              : schedule?.isMain ? 'กรุณาตั้งชุดอื่นเป็นชุดหลักก่อนลบ'
              : 'ลบชุดเที่ยวบินนี้'
            }
            className={cn(
              'text-xs px-2 py-1 rounded border flex items-center gap-1 transition-colors',
              canDelete
                ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                : 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
            )}
          >
            <Trash2 size={11} />ลบชุด
          </button>

          {/* Country info (right-aligned) */}
          {countryInfo && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
              <span className="font-semibold">{countryInfo.countryName}</span>
              <span className="text-blue-400">({countryInfo.countryCode})</span>
              <span className="text-blue-300">— จาก {firstArrCode}</span>
            </div>
          )}
          {!countryInfo && firstArrCode && (
            <div className="ml-auto flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              <AlertTriangle size={11} />
              ไม่พบประเทศของสนามบิน {firstArrCode}
            </div>
          )}
        </div>

        {/* Trip Type + Add Sector */}
        <div className="px-3 py-2 border-b border-slate-100">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-slate-600 shrink-0">Trip Type</span>

            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs bg-slate-50">
              {(['One-way', 'Round-trip', 'Multi-city'] as TripType[]).map(tt => {
                const disabled = tt === 'One-way' && (ticketType === 'Group' || ticketType === 'Ticket + Land')
                return (
                  <button
                    key={tt}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleTripTypeChange(tt)}
                    title={disabled ? 'Group/Ticket+Land ต้องมี Return — ไม่รองรับ One-way' : undefined}
                    className={cn(
                      'px-3 py-1.5 font-medium transition-colors border-r border-slate-200 last:border-r-0',
                      tripType === tt ? 'bg-[#05a94f] text-white'
                        : disabled ? 'text-slate-300 cursor-not-allowed'
                        : 'text-slate-600 hover:bg-white'
                    )}
                  >
                    {tt}
                  </button>
                )
              })}
            </div>

            <span className="text-xs text-slate-400 flex-1 min-w-0">
              {tripType === 'One-way' && 'Departure แรก · Transit ระหว่างทาง (ถ้ามี) · Return สุดท้าย'}
              {tripType === 'Round-trip' && 'อย่างน้อย 2 Sectors · Departure → Transit (ถ้ามี) → Return · ปลายทางต้องกลับต้นทาง'}
              {tripType === 'Multi-city' && 'สามารถเพิ่ม Sector ระหว่าง Departure และ Return ได้'}
            </span>

            <button
              type="button"
              onClick={addSector}
              disabled={!canAdd}
              title={!canAdd ? 'เพิ่ม Sector ได้เฉพาะ Round-trip และ Multi-city' : 'แทรก Sector ก่อน Return'}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shrink-0',
                canAdd
                  ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                  : 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
              )}
            >
              <PlusCircle size={13} />
              เพิ่ม Sector
            </button>
          </div>
        </div>

        {/* Route bar */}
        <div className="px-3 py-1.5 border-b border-slate-100">
          <div className="flex items-center gap-3 flex-wrap">
            <div className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs flex-1 min-w-0',
              isValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            )}>
              <span className={cn('font-medium shrink-0', isValid ? 'text-green-700' : 'text-red-700')}>Route:</span>
              <span className="font-mono font-bold truncate text-slate-700">
                {route || '— กรุณาเลือก From / To Airport'}
              </span>
            </div>
            <div className={cn(
              'text-xs px-3 py-1.5 rounded-lg shrink-0 font-medium',
              isValid ? 'bg-slate-50 text-slate-500' : 'bg-red-50 text-red-600'
            )}>
              {sectors.length} Sector{sectors.length !== 1 ? 's' : ''}
              {tripType === 'One-way'    && ' (≥ 1)'}
              {tripType === 'Round-trip' && ' (≥ 2)'}
              {tripType === 'Multi-city' && ' (≥ 2)'}
            </div>
          </div>
        </div>

        {/* Sector table */}
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs w-full" style={{ minWidth: 920 }}>

            <colgroup>
              <col style={{ width: 32 }} />
              <col style={{ width: 106 }} />
              <col style={{ width: 68 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 78 }} />
              <col style={{ width: 78 }} />
              <col style={{ width: 54 }} />
              <col style={{ width: 90 }} />
              <col />
              <col style={{ width: 32 }} />
            </colgroup>

            <thead>
              <tr className="bg-slate-100 select-none">
                <th className="border border-slate-300 px-2 py-2 text-center text-slate-500 font-medium whitespace-nowrap">#</th>
                <th className="border border-slate-300 px-2 py-2 text-left text-slate-600 font-semibold whitespace-nowrap">
                  Sector Type <span className="text-red-400">*</span>
                </th>
                <th className="border border-slate-300 px-2 py-2 text-left text-slate-600 font-semibold whitespace-nowrap">
                  Airline <span className="text-red-400">*</span>
                </th>
                <th className="border border-slate-300 px-2 py-2 text-left text-slate-600 font-semibold whitespace-nowrap">
                  Flight No <span className="text-red-400">*</span>
                </th>
                <th className="border border-slate-300 px-2 py-2 text-left text-slate-600 font-semibold whitespace-nowrap">
                  From <span className="text-red-400">*</span>
                </th>
                <th className="border border-slate-300 px-2 py-2 text-left text-slate-600 font-semibold whitespace-nowrap">
                  To <span className="text-red-400">*</span>
                </th>
                <th className="border border-slate-300 px-2 py-2 text-center text-slate-600 font-semibold whitespace-nowrap">Dep Time</th>
                <th className="border border-slate-300 px-2 py-2 text-center text-slate-600 font-semibold whitespace-nowrap">Arr Time</th>
                <th
                  className="border border-slate-300 px-2 py-2 text-center text-amber-600 font-semibold bg-amber-50/60 whitespace-nowrap"
                  title="+Day = ข้ามวันถึงปลายทาง คำนวณจาก Dep Time vs Arr Time"
                >
                  +Day ✦
                </th>
                <th
                  className="border border-slate-300 px-2 py-2 text-center text-slate-600 font-semibold whitespace-nowrap"
                  title="Travel Day = ลำดับวันเดินทาง (Day 1 = วันเดินทางเริ่มต้น, Day 2 = วันถัดไป)"
                >
                  Travel Day
                </th>
                <th className="border border-slate-300 px-2 py-2 text-left text-slate-600 font-semibold whitespace-nowrap">Remark</th>
                <th className="border border-slate-300 bg-slate-100"></th>
              </tr>
            </thead>

            <tbody>
              {sectors.length === 0 ? (
                <tr>
                  <td colSpan={COLS} className="border border-slate-200 text-center py-8 text-slate-400">
                    ยังไม่มี Sector
                  </td>
                </tr>
              ) : (
                sectors.map((s, idx) => {
                  const locked    = isTypeLocked(idx)
                  const deletable = canDeleteRow(idx)
                  const rowBg     = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                  const typeOpt   = SECTOR_TYPE_OPTIONS.find(o => o.value === s.sector_type)
                  const isSameAP  = sameAirportSet.has(idx)

                  return (
                    <Fragment key={idx}>
                    <tr
                      ref={idx === firstSameAirportIdx ? firstErrorRowRef : undefined}
                      className={cn('group hover:bg-blue-50/30 transition-colors', rowBg)}
                    >

                      {/* # */}
                      <td className="border border-slate-200 text-center text-slate-400 font-medium select-none bg-slate-50 text-[11px] align-middle">
                        {idx + 1}
                      </td>

                      {/* Sector Type */}
                      <XL className={locked ? 'bg-slate-50/70' : ''}>
                        {locked ? (
                          <div className={cn('px-2 py-[5px] text-xs font-semibold select-none', typeOpt?.text || 'text-slate-700')}>
                            {s.sector_type}
                          </div>
                        ) : (
                          <select
                            value={s.sector_type}
                            onChange={e => update(idx, { sector_type: e.target.value as SectorType })}
                            className={cn('w-full h-full px-2 py-[5px] text-xs bg-transparent appearance-none outline-none cursor-pointer focus:bg-blue-50 font-medium', typeOpt?.text || 'text-slate-700')}
                          >
                            {MIDDLE_TYPE_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        )}
                      </XL>

                      {/* Airline */}
                      <XL>
                        <AirlineCell
                          value={s.airline_code}
                          onChange={v => update(idx, { airline_code: v })}
                        />
                      </XL>

                      {/* Flight No */}
                      <XL className={isDupeFlight(s) ? 'bg-red-50/60' : ''}>
                        <input
                          value={s.flight_no}
                          onChange={e => update(idx, { flight_no: e.target.value.replace(/\D/g, '') })}
                          placeholder="701"
                          inputMode="numeric"
                          title={isDupeFlight(s) ? `Flight No ซ้ำกับแถวอื่นใน Flight Set นี้` : undefined}
                          className={cn('w-full h-full px-2 py-[5px] text-xs font-mono bg-transparent outline-none focus:bg-blue-50 placeholder:text-slate-300', isDupeFlight(s) && 'text-red-500')}
                        />
                      </XL>

                      {/* From */}
                      <XL className={cn(!s.dep_airport_code ? 'bg-red-50/60' : '', isSameAP && 'border-red-400 bg-red-50/40')}>
                        {idx === 0 ? (
                          <AirportCell
                            airports={airports.filter(a => a.countryCode === 'THA')}
                            value={s.dep_airport_code}
                            onChange={v => update(idx, { dep_airport_code: v })}
                          />
                        ) : idx === sectors.length - 1 ? (
                          <AirportCell
                            airports={airports}
                            value={s.dep_airport_code}
                            onChange={v => {
                              const prevTo = sectors[idx - 1]?.arr_airport_code ?? ''
                              const id     = schedule?.scheduleId ?? ''
                              if (v !== prevTo) arrFromManualRef.current.add(id)
                              else arrFromManualRef.current.delete(id)
                              update(idx, { dep_airport_code: v })
                            }}
                          />
                        ) : (
                          <AirportCell
                            airports={airports}
                            value={s.dep_airport_code}
                            onChange={v => update(idx, { dep_airport_code: v })}
                          />
                        )}
                      </XL>

                      {/* To */}
                      <XL className={cn(!s.arr_airport_code ? 'bg-red-50/60' : '', isSameAP && 'border-red-400 bg-red-50/40')}>
                        <AirportCell
                          airports={airports}
                          value={s.arr_airport_code}
                          onChange={v => {
                            if (idx === sectors.length - 1 && sectors.length > 1) {
                              const home = sectors[0]?.dep_airport_code ?? ''
                              const id   = schedule?.scheduleId ?? ''
                              if (v !== home) arrToManualRef.current.add(id)
                              else arrToManualRef.current.delete(id)
                            }
                            update(idx, { arr_airport_code: v })
                          }}
                        />
                      </XL>

                      {/* Dep Time */}
                      <XL center>
                        <TimeInput compact value={s.dep_time} onChange={v => update(idx, { dep_time: v })} className="w-full" />
                      </XL>

                      {/* Arr Time */}
                      <XL center>
                        <TimeInput compact value={s.arr_time} onChange={v => update(idx, { arr_time: v })} className="w-full" />
                      </XL>

                      {/* +Day (auto) */}
                      <XL center readOnly className="bg-amber-50/50">
                        <span className={cn(
                          'px-2 py-[5px] text-xs font-semibold select-none',
                          (!isValidHHmm(s.dep_time) || !isValidHHmm(s.arr_time))
                            ? 'text-slate-300'
                            : s.arr_day_offset > 0 ? 'text-amber-600' : 'text-slate-400'
                        )}>
                          {(!isValidHHmm(s.dep_time) || !isValidHHmm(s.arr_time)) ? '—' : s.arr_day_offset > 0 ? `+${s.arr_day_offset}` : '0'}
                        </span>
                      </XL>

                      {/* Travel Day */}
                      <XL center readOnly={idx === 0} className={cn(
                        idx === 0 ? 'bg-slate-50/80' : '',
                        idx > 0 && (!s.day_offset || s.day_offset < 1) ? 'bg-red-50/60' : ''
                      )}>
                        {idx === 0 ? (
                          <span className="px-2 py-[5px] text-xs font-semibold text-slate-500 select-none w-full flex items-center justify-center">
                            1
                          </span>
                        ) : (
                          <input
                            type="number"
                            value={s.day_offset === 0 ? '' : s.day_offset}
                            onChange={e => {
                              const raw = e.target.value
                              if (raw === '') { update(idx, { day_offset: 0 }); return }
                              const n = parseInt(raw, 10)
                              update(idx, { day_offset: isNaN(n) ? 1 : Math.max(1, n) })
                            }}
                            onBlur={e => {
                              const n = parseInt(e.target.value, 10)
                              if (!n || n < 1) update(idx, { day_offset: 1 })
                            }}
                            min={1}
                            title="Travel Day — ลำดับวันเดินทาง (Day 1 = วันเดินทางเริ่มต้น)"
                            className={cn(
                              'w-full text-center px-1 py-[5px] text-xs bg-transparent outline-none focus:bg-blue-50',
                              (!s.day_offset || s.day_offset < 1) ? 'text-red-500' : ''
                            )}
                          />
                        )}
                      </XL>

                      {/* Remark */}
                      <XL title={s.remark || undefined}>
                        <input
                          value={s.remark}
                          onChange={e => update(idx, { remark: e.target.value })}
                          placeholder="หมายเหตุ..."
                          className="w-full h-full px-2 py-[5px] text-xs bg-transparent outline-none focus:bg-blue-50 placeholder:text-slate-300 text-slate-500 truncate"
                        />
                      </XL>

                      {/* Delete */}
                      <td className="border border-slate-200 text-center bg-slate-50 align-middle">
                        <button
                          type="button"
                          onClick={() => deleteRow(idx)}
                          disabled={!deletable}
                          title={!deletable
                            ? (locked ? 'ไม่สามารถลบ Departure หรือ Return' : 'ลบได้เฉพาะ Round-trip และ Multi-city')
                            : 'ลบ Sector นี้'
                          }
                          className={cn(
                            'w-full h-full flex items-center justify-center py-[5px] transition-colors',
                            deletable ? 'text-slate-300 hover:text-red-500 hover:bg-red-50' : 'text-slate-200 cursor-not-allowed'
                          )}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                    {isSameAP && (
                      <tr>
                        <td colSpan={COLS} className="border border-red-200 bg-red-50 px-3 py-1.5">
                          <span className="flex items-center gap-1.5 text-xs text-red-600">
                            <AlertTriangle size={11} className="shrink-0" />
                            สนามบินต้นทางและปลายทางต้องไม่เป็นสนามบินเดียวกัน
                          </span>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer legend */}
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 space-y-1">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-[11px] text-slate-400">ประเภท Sector:</span>
            {SECTOR_TYPE_OPTIONS.map(o => (
              <span key={o.value} className={cn('text-[11px] font-medium', o.text)}>● {o.label}</span>
            ))}
            <span className="text-[11px] text-slate-300 ml-auto">* จำเป็นต้องกรอก</span>
          </div>
          <div className="flex items-start gap-4 flex-wrap text-[11px] text-slate-500">
            <span>
              <span className="font-medium text-amber-600">+Day ✦</span>
              {' '}= ข้ามวันถึงปลายทาง คำนวณอัตโนมัติ เช่น Dep 23:00 / Arr 02:00 → <strong>+1</strong> · ไม่ซ้อนใน Arr Time
            </span>
            <span>
              <span className="font-medium text-blue-600">Travel Day</span>
              {' '}เริ่มจาก 1 เสมอ โดย Day 1 คือวันเดียวกับวันเดินทางเริ่มต้น · สูตร: <strong>Sector Date = วันเดินทางเริ่มต้น + (Travel Day − 1)</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Validation error */}
      {!isValid && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertTriangle size={13} className="shrink-0" />
          <span>
            {tripType === 'One-way'    && (sectors.length > 1 ? 'One-way Sector สุดท้ายต้องเป็น Return' : 'One-way ต้องมี Departure อย่างน้อย 1 Sector')}
            {tripType === 'Round-trip' && (sectors.length < 2 ? 'Round-trip ต้องมีอย่างน้อย 2 Sectors' : 'Round-trip Sector สุดท้ายต้องเป็น Return')}
            {tripType === 'Multi-city' && 'Multi-city ต้องมีอย่างน้อย 2 Sector — Departure (แรก) + Return (สุดท้าย)'}
          </span>
        </div>
      )}

      {/* Duplicate Flight No errors (blocking) */}
      {duplicateFlightKeys.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertTriangle size={13} className="shrink-0" />
          <span>
            พบ Flight No ซ้ำใน Flight Set นี้:{' '}
            <strong>{[...duplicateFlightKeys].join(', ')}</strong>
            {' '}— กรุณาแก้ไขก่อนดำเนินการต่อ
          </span>
        </div>
      )}

      {/* Same-airport errors (blocking) */}
      {sameAirportSet.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertTriangle size={13} className="shrink-0" />
          <span>
            พบสนามบินต้นทางและปลายทางเหมือนกัน (Sector{' '}
            {[...sameAirportSet].map(i => i + 1).join(', ')})
            {' '}— กรุณาแก้ไขก่อนดำเนินการต่อ
          </span>
        </div>
      )}

      {/* Route continuity warnings (non-blocking) */}
      {routeGaps.length > 0 && (
        <div className="space-y-1">
          {routeGaps.map(g => (
            <div key={`${g.sectorA}-${g.sectorB}`} className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <AlertTriangle size={13} className="shrink-0" />
              <span>
                เส้นทางไม่ต่อเนื่องจาก Sector {g.sectorA} (<strong>{g.codeA}</strong>) ถึง Sector {g.sectorB} (<strong>{g.codeB}</strong>) — กรุณาตรวจสอบ
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Open Jaw info (non-blocking) */}
      {openJawSegments.map((oj, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          <Info size={13} className="shrink-0" />
          <span>
            Open Jaw: เดินทางภาคพื้นดินจาก <strong>{oj.from}</strong> ไป <strong>{oj.to}</strong>
          </span>
        </div>
      ))}

      {/* Return airport mismatch (non-blocking warning) */}
      {returnMismatch && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          <AlertTriangle size={13} className="shrink-0" />
          <span>
            สนามบินขากลับไม่ตรงกับต้นทาง: เริ่มจาก <strong>{homeAirport}</strong> แต่กลับ <strong>{lastTo}</strong> — กรุณาตรวจสอบ
          </span>
        </div>
      )}

      {/* Travel Day validation errors */}
      {travelDayErrors.length > 0 && (
        <div className="space-y-1">
          {travelDayErrors.map(e => (
            <div key={e.sector} className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertTriangle size={13} className="shrink-0" />
              <span>Sector {e.sector}: {e.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Info reminder */}
      {isValid && sectors.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
          <Info size={13} className="shrink-0 mt-0.5" />
          <span>
            Sector เป็น <strong>แม่แบบเส้นทางบิน</strong> — ไม่ต้องใส่วันที่เดินทาง
            · วันเดินทางจริงกำหนดที่ PNR ใน Step 4 โดย <strong>Sector Date = วันเดินทางเริ่มต้น + (Travel Day − 1)</strong>
            · Route แสดงอัตโนมัติจาก From/To
          </span>
        </div>
      )}

      {/* Add Schedule Modal */}
      <ScheduleNameModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onConfirm={handleAddSchedule}
        title="เพิ่มชุดเที่ยวบินใหม่"
        fieldLabel="ชื่อชุดเที่ยวบิน"
        confirmLabel="เพิ่มชุดเที่ยวบิน"
        defaultValue=""
        existingNames={allNames}
      />

      {/* Copy Schedule Modal */}
      <ScheduleNameModal
        open={copyModalOpen}
        onClose={() => setCopyModalOpen(false)}
        onConfirm={handleDuplicateSchedule}
        title="คัดลอกชุดเที่ยวบิน"
        fieldLabel="ชื่อชุดใหม่"
        confirmLabel="คัดลอก"
        defaultValue={`สำเนา - ${schedule?.scheduleName ?? ''}`}
        existingNames={allNames}
        sourceName={schedule?.scheduleName}
      />

      {/* Rename Schedule Modal */}
      <ScheduleNameModal
        open={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        onConfirm={handleRenameSchedule}
        title="เปลี่ยนชื่อชุดเที่ยวบิน"
        fieldLabel="ชื่อชุดเที่ยวบิน"
        confirmLabel="บันทึกชื่อ"
        defaultValue={schedule?.scheduleName ?? ''}
        existingNames={otherNames}
      />
    </div>
  )
}
