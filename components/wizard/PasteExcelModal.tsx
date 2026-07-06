'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  X, ClipboardPaste, ChevronLeft, AlertCircle, CheckCircle,
  AlertTriangle, Trash2,
} from 'lucide-react'
import {
  parsePastedExcel, isHeaderRow, normalizePastedRows, validatePastedRows,
  parseMultiSectorPaste, groupMultiSectorRows, validatePNRGroups, groupsToPastedRows,
  PASTE_COLUMN_GUIDE, PASTE_MULTI_SECTOR_COLUMN_GUIDE,
  AIRLINE_CODES, AIRPORT_CODES,
  type PastedExcelRow, type ValidatedPastedRow, type ValidatedPNRGroup,
  type FieldKey, type MultiSectorFieldKey, type SectorTemplate,
  type PastedMultiSectorRow,
} from '@/lib/paste-excel'
import type { FlightSectorFormData } from '@/types'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildSectorTemplates(sectors: FlightSectorFormData[]): SectorTemplate[] {
  return sectors.map(s => ({
    seq:            s.seq,
    sectorType:     s.sector_type,
    airlineCode:    s.airline_code,
    flightNo:       s.flight_no,
    depAirportCode: s.dep_airport_code,
    arrAirportCode: s.arr_airport_code,
    depTime:        s.dep_time,
    arrTime:        s.arr_time,
    plusDay:        s.arr_day_offset,
    dayOffset:      s.day_offset,
  }))
}

function parseFlightCodeAirline(v: string): string {
  const m = v.toUpperCase().match(/^([A-Z]{2,3})/)
  return m?.[1] ?? ''
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, isDummy = false }: { status: 'READY' | 'WARNING' | 'ERROR'; isDummy?: boolean }) {
  if (status === 'ERROR')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-600">
        <AlertCircle size={9} /> Error
      </span>
    )
  if (isDummy)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
        <AlertTriangle size={9} /> Dummy PNR
      </span>
    )
  if (status === 'WARNING')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-100 text-yellow-700">
        <AlertTriangle size={9} /> คำเตือน
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
      <CheckCircle size={9} /> พร้อม
    </span>
  )
}

// ─── Editable cell ────────────────────────────────────────────────────────────
function ECell({
  value, onChange, type = 'text', uppercase = false,
  error, warning, id, className = '',
}: {
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'date' | 'number'
  uppercase?: boolean
  error?: string
  warning?: string
  id?: string
  className?: string
}) {
  const hasErr  = Boolean(error)
  const hasWarn = !hasErr && Boolean(warning)
  return (
    <div className="flex flex-col min-w-0">
      <input
        id={id}
        type={type}
        value={value}
        title={error ?? warning ?? undefined}
        onChange={e => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
        className={cn(
          'w-full px-1.5 py-[3px] text-[11px] rounded border outline-none transition-colors',
          hasErr  ? 'border-red-500 bg-red-50 text-red-700 focus:ring-1 focus:ring-red-300'
          : hasWarn ? 'border-yellow-400 bg-yellow-50 text-yellow-700 focus:ring-1 focus:ring-yellow-200'
          : 'border-transparent hover:border-slate-300 focus:border-blue-400 focus:bg-blue-50 bg-transparent',
          className,
        )}
      />
      {hasErr  && <span className="text-[9px] text-red-500 leading-tight mt-0.5 px-0.5 break-words">{error}</span>}
      {hasWarn && <span className="text-[9px] text-yellow-600 leading-tight mt-0.5 px-0.5 break-words">{warning}</span>}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface PasteExcelModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (rows: PastedExcelRow[]) => void
  existingPnrCodes: string[]
  sectors: FlightSectorFormData[]
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PasteExcelModal({
  open, onClose, onConfirm, existingPnrCodes, sectors,
}: PasteExcelModalProps) {
  const [view, setView]             = useState<'paste' | 'preview'>('paste')
  const [rawText, setRawText]       = useState('')
  const [hasHeader, setHasHeader]   = useState(false)
  const [rows, setRows]             = useState<ValidatedPastedRow[]>([])
  const [groups, setGroups]         = useState<ValidatedPNRGroup[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const isMultiSector = sectors.length > 2
  const templates     = buildSectorTemplates(sectors)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView('paste'); setRawText(''); setHasHeader(false)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]); setGroups([]); setSubmitting(false); setSuccessMsg('')
    }
  }, [open])

  const focusField = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); (el as HTMLInputElement).focus() }
  }, [])

  const rawParsed    = parsePastedExcel(rawText)
  const dataRowCount = (() => {
    if (!rawParsed.length) return 0
    const skip = hasHeader ?? isHeaderRow(rawParsed[0])
    return skip ? rawParsed.length - 1 : rawParsed.length
  })()

  const handleTextChange = useCallback((text: string) => {
    setRawText(text)
    const p = parsePastedExcel(text)
    if (p.length > 0) setHasHeader(isHeaderRow(p[0]))
  }, [])

  const handleCheck = useCallback(() => {
    if (isMultiSector) {
      const multiRows = parseMultiSectorPaste(rawParsed, hasHeader)
      const rawGroups = groupMultiSectorRows(multiRows)
      setGroups(validatePNRGroups(rawGroups, existingPnrCodes, templates, AIRLINE_CODES, AIRPORT_CODES))
    } else {
      const normalized = normalizePastedRows(rawParsed, hasHeader)
      setRows(validatePastedRows(normalized, existingPnrCodes, AIRLINE_CODES, AIRPORT_CODES, templates))
    }
    setView('preview')
  }, [rawParsed, hasHeader, isMultiSector, existingPnrCodes, templates])

  // ── Two-sector re-validate after cell edit ─────────────────────────────────
  const updateCell = useCallback((rowIdx: number, patch: Partial<PastedExcelRow>) => {
    setRows(prev => {
      const updated = prev.map(r =>
        r.rowIndex === rowIdx ? { ...r, data: { ...r.data, ...patch } } : r
      )
      return validatePastedRows(updated.map(r => r.data), existingPnrCodes, AIRLINE_CODES, AIRPORT_CODES, templates)
        .map((v, i) => ({ ...v, rowIndex: i + 1 }))
    })
  }, [existingPnrCodes, templates])

  // ── Multi-sector: re-validate after sector cell edit ───────────────────────
  const updateGroupSectorCell = useCallback((
    groupKey: string, sectorIdx: number, patch: Partial<PastedMultiSectorRow>,
  ) => {
    setGroups(prev => {
      const updated = prev.map(g =>
        g.groupKey === groupKey
          ? { ...g, sectors: g.sectors.map((s, i) => i === sectorIdx ? { ...s, ...patch } : s) }
          : g
      )
      const allSectors = updated.flatMap(g => g.sectors)
      const rg = groupMultiSectorRows(allSectors)
      return validatePNRGroups(rg, existingPnrCodes, templates, AIRLINE_CODES, AIRPORT_CODES)
    })
  }, [existingPnrCodes, templates])

  // ── Multi-sector: re-validate after group-level field edit ─────────────────
  const updateGroupField = useCallback((
    groupKey: string,
    patch: { pnrCode?: string; importGroup?: string; seatCount?: number },
  ) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.groupKey !== groupKey) return g
        const newSectors = g.sectors.map(s => ({
          ...s,
          ...(patch.pnrCode      !== undefined ? { pnrCode:      patch.pnrCode }      : {}),
          ...(patch.importGroup  !== undefined ? { importGroup:  patch.importGroup }  : {}),
          ...(patch.seatCount    !== undefined ? { seatCount:    patch.seatCount }    : {}),
        }))
        return { ...g, ...patch, sectors: newSectors }
      })
      const allSectors = updated.flatMap(g => g.sectors)
      const rg = groupMultiSectorRows(allSectors)
      return validatePNRGroups(rg, existingPnrCodes, templates, AIRLINE_CODES, AIRPORT_CODES)
    })
  }, [existingPnrCodes, templates])

  // ── Confirm ────────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (submitting) return
    let confirmed: PastedExcelRow[]
    if (isMultiSector) {
      confirmed = groupsToPastedRows(groups.filter(g => g.status !== 'ERROR'))
    } else {
      confirmed = rows.filter(r => r.status !== 'ERROR').map(r => r.data)
    }
    if (!confirmed.length) return
    setSubmitting(true)
    onConfirm(confirmed)
    setSuccessMsg(`เพิ่ม PNR เข้าตารางแล้ว ${confirmed.length} รายการ`)
    setTimeout(onClose, 1200)
  }, [submitting, isMultiSector, groups, rows, onConfirm, onClose])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalCount = isMultiSector ? groups.length : rows.length
  const errorCount = isMultiSector
    ? groups.filter(g => g.status === 'ERROR').length
    : rows.filter(r => r.status === 'ERROR').length
  const dummyCount = isMultiSector
    ? groups.filter(g => g.isDummy && g.status !== 'ERROR').length
    : rows.filter(r => r.data.isDummy && r.status !== 'ERROR').length
  const readyCount = isMultiSector
    ? groups.filter(g => g.status === 'READY').length
    : rows.filter(r => r.status === 'READY').length
  const totalFieldErrors = isMultiSector
    ? groups.reduce((s, g) => s + g.sectorFieldErrors.reduce((ss, fe) => ss + Object.keys(fe).length, 0), 0)
    : rows.reduce((s, r) => s + Object.keys(r.fieldErrors).length, 0)
  const seatTotal = isMultiSector
    ? groups.filter(g => g.status !== 'ERROR').reduce((s, g) => s + g.seatCount, 0)
    : rows.filter(r => r.status !== 'ERROR').reduce((s, r) => s + r.data.seatCount, 0)
  const canConfirm = totalCount > 0 && errorCount === 0 && !submitting
  const confirmCount = isMultiSector
    ? groups.filter(g => g.status !== 'ERROR').length
    : rows.filter(r => r.status !== 'ERROR').length

  // First error for summary click-to-focus
  const firstErrRow2    = rows.find(r => r.status === 'ERROR')
  const firstErrField2  = firstErrRow2 ? (Object.keys(firstErrRow2.fieldErrors)[0] as FieldKey) : undefined
  const firstErrGroup   = groups.find(g => g.status === 'ERROR')
  const firstErrGSIdx   = firstErrGroup ? firstErrGroup.sectorFieldErrors.findIndex(fe => Object.keys(fe).length > 0) : -1
  const firstErrGField  = (firstErrGSIdx >= 0 && firstErrGroup)
    ? (Object.keys(firstErrGroup.sectorFieldErrors[firstErrGSIdx])[0] as MultiSectorFieldKey)
    : undefined

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-6xl max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            {view === 'preview' && (
              <button type="button" onClick={() => setView('paste')}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                <ChevronLeft size={16} />
              </button>
            )}
            <ClipboardPaste size={16} className="text-[#05a94f]" />
            <h2 className="text-sm font-bold text-slate-800">
              {view === 'paste' ? 'วางจาก Excel' : 'ตรวจสอบข้อมูล'}
            </h2>
            {view === 'preview' && (
              <span className="text-xs text-slate-400">
                — {isMultiSector ? `Multi-Sector ${sectors.length} Sector` : '2 Sector'} · คลิก Cell เพื่อแก้ไข
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        {/* ── PASTE VIEW ──────────────────────────────────────────────────── */}
        {view === 'paste' && (
          <div className="flex flex-col gap-4 p-5 overflow-y-auto">
            {/* Column guide */}
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-blue-700">รูปแบบคอลัมน์</p>
                {isMultiSector && (
                  <span className="text-[10px] text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">
                    Multi-Sector: 1 แถว = 1 Sector ({sectors.length} Sector ต่อ PNR)
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="text-[11px] border-collapse w-full">
                  <thead>
                    <tr className="bg-blue-100/60">
                      {(isMultiSector ? PASTE_MULTI_SECTOR_COLUMN_GUIDE : PASTE_COLUMN_GUIDE).map(c => (
                        <th key={c.no} className="border border-blue-200 px-2 py-1 text-blue-700 font-semibold whitespace-nowrap">
                          {c.no}. {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {(isMultiSector ? PASTE_MULTI_SECTOR_COLUMN_GUIDE : PASTE_COLUMN_GUIDE).map(c => (
                        <td key={c.no} className="border border-blue-200 px-2 py-1 text-slate-600 text-center font-mono whitespace-nowrap">
                          {c.example}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-blue-500 mt-2">
                {isMultiSector
                  ? `· PNR ว่าง = Dummy PNR · ต้องระบุ Import Group ถ้า PNR ว่าง · วาง ${sectors.length} แถวต่อ 1 PNR · Seq ตรงกับ Step 2`
                  : '· PNR ว่าง = Dummy PNR (ระบบสร้างรหัสให้อัตโนมัติ) · วันที่: DD/MM/YYYY · เที่ยวบิน เช่น TG640'
                }
              </p>
            </div>

            {/* Sector template reference */}
            {templates.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Sector Template (Step 2) — ระบบจะตรวจสอบกับข้อมูลที่วาง</p>
                <div className="overflow-x-auto">
                  <table className="text-[10px] border-collapse">
                    <thead>
                      <tr className="bg-slate-200/60">
                        {['Seq','Type','Flight','From','To','Dep','Arr','+Day','Travel Day'].map(h => (
                          <th key={h} className="border border-slate-300 px-2 py-1 font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {templates.map(t => (
                        <tr key={t.seq}>
                          <td className="border border-slate-300 px-2 py-1 text-center font-medium">{t.seq}</td>
                          <td className="border border-slate-300 px-2 py-1">{t.sectorType}</td>
                          <td className="border border-slate-300 px-2 py-1 font-mono">{t.flightNo || '—'}</td>
                          <td className="border border-slate-300 px-2 py-1">{t.depAirportCode || '—'}</td>
                          <td className="border border-slate-300 px-2 py-1">{t.arrAirportCode || '—'}</td>
                          <td className="border border-slate-300 px-2 py-1">{t.depTime || '—'}</td>
                          <td className="border border-slate-300 px-2 py-1">{t.arrTime || '—'}</td>
                          <td className="border border-slate-300 px-2 py-1 text-center">{t.plusDay}</td>
                          <td className="border border-slate-300 px-2 py-1 text-center">{t.dayOffset}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">วางข้อมูลจาก Excel</label>
                {rawText && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">{dataRowCount} แถวข้อมูล</span>
                    <button type="button" onClick={() => { setRawText(''); setHasHeader(false) }}
                      className="text-[11px] text-red-400 hover:text-red-600">ล้างข้อมูล</button>
                  </div>
                )}
              </div>
              <textarea
                value={rawText}
                onChange={e => handleTextChange(e.target.value)}
                onPaste={e => {
                  const p = parsePastedExcel(e.clipboardData.getData('text'))
                  if (p.length) setHasHeader(isHeaderRow(p[0]))
                }}
                placeholder={isMultiSector
                  ? `G1\t\t36\t1\t10/10/2026\tTG701\tBKK\tNRT\t23:00\t16:00\t1\nG1\t\t36\t2\t11/10/2026\tTG999\tNRT\tCTS\t08:00\t10:00\t0`
                  : `SD1SD2\t36\t10/10/2026\tTG640\tBKK\tNRT\t14/10/2026\tTG641\tNRT\tBKK\n\t36\t17/10/2026\tTG640\tBKK\tNRT\t21/10/2026\tTG641\tNRT\tBKK`
                }
                className="w-full h-48 px-3 py-2.5 text-xs font-mono border border-slate-300 rounded-xl resize-none outline-none focus:border-[#05a94f] focus:ring-1 focus:ring-[#05a94f]/20 text-slate-700 placeholder:text-slate-300"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 accent-[#05a94f]" />
              <span className="text-xs text-slate-600">แถวแรกเป็นชื่อคอลัมน์</span>
              {rawText && isHeaderRow(parsePastedExcel(rawText)[0]) && (
                <span className="text-[10px] text-blue-500">(ตรวจพบอัตโนมัติ)</span>
              )}
            </label>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                ยกเลิก
              </button>
              <button type="button" onClick={handleCheck}
                disabled={!rawText.trim() || dataRowCount === 0}
                className={cn(
                  'px-5 py-2 text-xs font-semibold rounded-xl transition-colors',
                  rawText.trim() && dataRowCount > 0
                    ? 'bg-[#05a94f] text-white hover:bg-[#048f43]'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed',
                )}>
                ตรวจสอบข้อมูล ({dataRowCount} แถว)
              </button>
            </div>
          </div>
        )}

        {/* ── PREVIEW VIEW ─────────────────────────────────────────────────── */}
        {view === 'preview' && (
          <>
            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200 shrink-0 text-xs">
              <span className="text-slate-500">ทั้งหมด <span className="font-bold text-slate-700">{totalCount} PNR</span></span>
              {errorCount > 0 && (
                <button type="button"
                  onClick={() => {
                    if (!isMultiSector && firstErrRow2 && firstErrField2)
                      focusField(`paste-r${firstErrRow2.rowIndex}-${firstErrField2}`)
                    else if (isMultiSector && firstErrGroup && firstErrGField && firstErrGSIdx >= 0)
                      focusField(`paste-ms-${firstErrGroup.groupKey}-${firstErrGSIdx}-${firstErrGField}`)
                  }}
                  className="inline-flex items-center gap-1 text-red-600 font-semibold hover:underline">
                  <AlertCircle size={11} /> Error {totalFieldErrors} ช่อง ใน {errorCount} PNR
                </button>
              )}
              {dummyCount > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                  <AlertTriangle size={11} /> Dummy PNR {dummyCount} รายการ
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-green-700 font-semibold">
                <CheckCircle size={11} /> พร้อมเพิ่ม {readyCount + dummyCount} PNR
              </span>
              <span className="text-slate-400">Seat รวม <span className="font-bold text-slate-600">{seatTotal.toLocaleString('th-TH')}</span></span>
              {successMsg && <span className="ml-auto font-semibold text-[#05a94f]">{successMsg}</span>}
            </div>

            <div className="overflow-auto flex-1 min-h-0">

              {/* ── Two-sector preview ─────────────────────────────────────── */}
              {!isMultiSector && (
                <table className="text-[11px] border-collapse w-full" style={{ minWidth: 1020 }}>
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-500 text-center" style={{ width: 28 }}>#</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold text-center" style={{ width: 80 }}>สถานะ</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 108 }}>PNR</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold text-center" style={{ width: 60 }}>Seat</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 100 }}>วันไป</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 80 }}>เที่ยวบินไป</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 88 }}>จาก→ถึง (ไป)</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 100 }}>วันกลับ</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 84 }}>เที่ยวบินกลับ</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 88 }}>จาก→ถึง (กลับ)</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ minWidth: 150 }}>ข้อผิดพลาด</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-400 text-center bg-slate-50" style={{ width: 36 }}>ลบ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const d = r.data; const fe = r.fieldErrors; const fw = r.fieldWarnings; const rid = r.rowIndex
                      const issues = [...r.errors, ...r.warnings]
                      return (
                        <tr key={rid} className="hover:bg-slate-50/60">
                          <td className="border border-slate-200 text-center text-slate-400 bg-slate-50 select-none align-top pt-2">{rid}</td>
                          <td className="border border-slate-200 text-center p-1.5 align-top">
                            <StatusBadge status={r.status} isDummy={d.isDummy} />
                            {d.isDummy && r.status !== 'ERROR' && (
                              <div className="text-[9px] text-amber-600 mt-0.5 text-center">ระบบสร้างรหัสให้</div>
                            )}
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell uppercase value={d.pnrCode} error={fe.pnrCode} warning={fw.pnrCode}
                              id={`paste-r${rid}-pnrCode`}
                              onChange={v => updateCell(rid, { pnrCode: v, isDummy: !v })}
                              className="font-mono" />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell type="number" value={String(d.seatCount || '')} error={fe.seatCount}
                              id={`paste-r${rid}-seatCount`}
                              onChange={v => updateCell(rid, { seatCount: parseInt(v, 10) || 0 })}
                              className="text-center" />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell type="date" value={d.outboundDate} error={fe.outboundDate}
                              id={`paste-r${rid}-outboundDate`}
                              onChange={v => updateCell(rid, { outboundDate: v })} />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell uppercase value={d.outboundFlight} error={fe.outboundFlight} warning={fw.outboundFlight}
                              id={`paste-r${rid}-outboundFlight`}
                              onChange={v => updateCell(rid, { outboundFlight: v.toUpperCase(), outboundAirlineCode: parseFlightCodeAirline(v) })}
                              className="font-mono" />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell uppercase value={d.outboundFrom} error={fe.outboundFrom} warning={fw.outboundFrom}
                              id={`paste-r${rid}-outboundFrom`}
                              onChange={v => updateCell(rid, { outboundFrom: v.toUpperCase() })} />
                            <div className="text-[9px] text-slate-300 text-center my-0.5 select-none">↓</div>
                            <ECell uppercase value={d.outboundTo} error={fe.outboundTo} warning={fw.outboundTo}
                              id={`paste-r${rid}-outboundTo`}
                              onChange={v => updateCell(rid, { outboundTo: v.toUpperCase() })} />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell type="date" value={d.returnDate} error={fe.returnDate}
                              id={`paste-r${rid}-returnDate`}
                              onChange={v => updateCell(rid, { returnDate: v })} />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell uppercase value={d.returnFlight} error={fe.returnFlight} warning={fw.returnFlight}
                              id={`paste-r${rid}-returnFlight`}
                              onChange={v => updateCell(rid, { returnFlight: v.toUpperCase(), returnAirlineCode: parseFlightCodeAirline(v) })}
                              className="font-mono" />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell uppercase value={d.returnFrom} error={fe.returnFrom} warning={fw.returnFrom}
                              id={`paste-r${rid}-returnFrom`}
                              onChange={v => updateCell(rid, { returnFrom: v.toUpperCase() })} />
                            <div className="text-[9px] text-slate-300 text-center my-0.5 select-none">↓</div>
                            <ECell uppercase value={d.returnTo} error={fe.returnTo} warning={fw.returnTo}
                              id={`paste-r${rid}-returnTo`}
                              onChange={v => updateCell(rid, { returnTo: v.toUpperCase() })} />
                          </td>
                          <td className="border border-slate-200 px-2 py-1 align-top">
                            {issues.map((iss, k) => (
                              <div key={k}
                                className={cn('text-[10px] cursor-pointer hover:underline mb-0.5',
                                  r.errors.includes(iss) ? 'text-red-500' : 'text-yellow-600')}
                                onClick={() => iss.fields[0] && focusField(`paste-r${rid}-${iss.fields[0]}`)}>
                                <span className="font-semibold">[{iss.col}]</span> {iss.message}
                              </div>
                            ))}
                          </td>
                          <td className="border border-slate-200 bg-slate-50 text-center align-top">
                            <button type="button"
                              onClick={() => setRows(prev => {
                                const f = prev.filter(x => x.rowIndex !== rid).map(x => x.data)
                                return validatePastedRows(f, existingPnrCodes, AIRLINE_CODES, AIRPORT_CODES, templates)
                                  .map((v, i) => ({ ...v, rowIndex: i + 1 }))
                              })}
                              className="p-1.5 mt-0.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded">
                              <Trash2 size={11} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}

              {/* ── Multi-sector preview ───────────────────────────────────── */}
              {isMultiSector && (
                <table className="text-[11px] border-collapse w-full" style={{ minWidth: 900 }}>
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 80 }}>สถานะ</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 80 }}>Import Group</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 108 }}>PNR</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold text-center" style={{ width: 52 }}>Seat</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold text-center" style={{ width: 36 }}>Seq</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 100 }}>วันที่</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 76 }}>เที่ยวบิน</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 52 }}>จาก</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 52 }}>ถึง</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 68 }}>เวลาออก</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ width: 68 }}>เวลาถึง</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold text-center" style={{ width: 44 }}>+Day</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-600 font-semibold" style={{ minWidth: 140 }}>ข้อผิดพลาด</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-slate-400 text-center bg-slate-50" style={{ width: 36 }}>ลบ</th>
                    </tr>
                  </thead>
                  {groups.map(g => (
                    <tbody key={g.groupKey} className="border-t-2 border-slate-300">
                      {g.sectors.map((s, si) => {
                        const fe = g.sectorFieldErrors[si] ?? {}
                        const fw = g.sectorFieldWarnings[si] ?? {}
                        const first = si === 0
                        return (
                          <tr key={si} className={cn('hover:bg-slate-50/60', first ? 'bg-slate-50/40' : '')}>
                            {first && (
                              <td className="border border-slate-200 text-center p-1.5 align-middle" rowSpan={g.sectors.length}>
                                <StatusBadge status={g.status} isDummy={g.isDummy} />
                                {g.isDummy && g.status !== 'ERROR' && (
                                  <div className="text-[9px] text-amber-600 mt-0.5">ระบบสร้างรหัสให้</div>
                                )}
                              </td>
                            )}
                            {first && (
                              <td className="border border-slate-200 p-0.5 align-middle" rowSpan={g.sectors.length}>
                                <ECell value={g.importGroup}
                                  id={`paste-ms-${g.groupKey}-0-importGroup`}
                                  onChange={v => updateGroupField(g.groupKey, { importGroup: v })} />
                              </td>
                            )}
                            {first && (
                              <td className="border border-slate-200 p-0.5 align-middle" rowSpan={g.sectors.length}>
                                <ECell uppercase value={g.pnrCode}
                                  id={`paste-ms-${g.groupKey}-0-pnrCode`}
                                  onChange={v => updateGroupField(g.groupKey, { pnrCode: v.toUpperCase() })}
                                  className="font-mono" />
                              </td>
                            )}
                            {first && (
                              <td className="border border-slate-200 p-0.5 align-middle text-center" rowSpan={g.sectors.length}>
                                <ECell type="number" value={String(g.seatCount || '')}
                                  id={`paste-ms-${g.groupKey}-0-seatCount`}
                                  onChange={v => updateGroupField(g.groupKey, { seatCount: parseInt(v, 10) || 0 })}
                                  className="text-center" />
                              </td>
                            )}
                            {/* Sector-level editable cells */}
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell type="number" value={String(s.seq || '')} error={fe.seq}
                                id={`paste-ms-${g.groupKey}-${si}-seq`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, { seq: parseInt(v, 10) || 0 })}
                                className="text-center" />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell type="date" value={s.travelDate} error={fe.travelDate}
                                id={`paste-ms-${g.groupKey}-${si}-travelDate`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, { travelDate: v })} />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell uppercase value={s.flightNo} error={fe.flightNo} warning={fw.flightNo}
                                id={`paste-ms-${g.groupKey}-${si}-flightNo`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, {
                                  flightNo: v.toUpperCase(), airlineCode: parseFlightCodeAirline(v),
                                })}
                                className="font-mono" />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell uppercase value={s.depAirportCode} error={fe.depAirportCode} warning={fw.depAirportCode}
                                id={`paste-ms-${g.groupKey}-${si}-depAirportCode`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, { depAirportCode: v.toUpperCase() })} />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell uppercase value={s.arrAirportCode} error={fe.arrAirportCode} warning={fw.arrAirportCode}
                                id={`paste-ms-${g.groupKey}-${si}-arrAirportCode`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, { arrAirportCode: v.toUpperCase() })} />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell value={s.depTime} error={fe.depTime}
                                id={`paste-ms-${g.groupKey}-${si}-depTime`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, { depTime: v })} />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell value={s.arrTime} error={fe.arrTime}
                                id={`paste-ms-${g.groupKey}-${si}-arrTime`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, { arrTime: v })} />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell type="number" value={String(s.plusDay)} error={fe.plusDay}
                                id={`paste-ms-${g.groupKey}-${si}-plusDay`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, { plusDay: parseInt(v, 10) || 0 })}
                                className="text-center" />
                            </td>
                            {first && (
                              <td className="border border-slate-200 px-2 py-1 align-top" rowSpan={g.sectors.length}>
                                {g.errors.map((e, k) => (
                                  <div key={k} className="text-[10px] text-red-500 mb-0.5">
                                    <span className="font-semibold">[{e.col}]</span> {e.message}
                                  </div>
                                ))}
                                {g.warnings.map((w, k) => (
                                  <div key={k} className="text-[10px] text-yellow-600 mb-0.5">
                                    <span className="font-semibold">[{w.col}]</span> {w.message}
                                  </div>
                                ))}
                                {!g.errors.length && !g.warnings.length && <span className="text-[10px] text-green-600">—</span>}
                              </td>
                            )}
                            {first && (
                              <td className="border border-slate-200 bg-slate-50 text-center align-middle" rowSpan={g.sectors.length}>
                                <button type="button"
                                  onClick={() => {
                                    const rem = groups.filter(x => x.groupKey !== g.groupKey).flatMap(x => x.sectors)
                                    const rg = groupMultiSectorRows(rem)
                                    setGroups(validatePNRGroups(rg, existingPnrCodes, templates, AIRLINE_CODES, AIRPORT_CODES))
                                  }}
                                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded">
                                  <Trash2 size={11} />
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  ))}
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setView('paste')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">
                  <ChevronLeft size={13} /> กลับ
                </button>
                {errorCount > 0 && (
                  <button type="button"
                    onClick={() => {
                      if (isMultiSector) {
                        const good = groups.filter(g => g.status !== 'ERROR').flatMap(g => g.sectors)
                        const rg = groupMultiSectorRows(good)
                        setGroups(validatePNRGroups(rg, existingPnrCodes, templates, AIRLINE_CODES, AIRPORT_CODES))
                      } else {
                        const f = rows.filter(r => r.status !== 'ERROR').map(r => r.data)
                        setRows(validatePastedRows(f, existingPnrCodes, AIRLINE_CODES, AIRPORT_CODES, templates)
                          .map((v, i) => ({ ...v, rowIndex: i + 1 })))
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 border border-red-200 hover:bg-red-50 rounded-lg">
                    <Trash2 size={12} /> ลบรายการที่ผิด ({errorCount})
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose}
                  className="px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">
                  ยกเลิก
                </button>
                <button type="button" onClick={handleConfirm} disabled={!canConfirm}
                  title={errorCount > 0 ? `ยังมี Error ${totalFieldErrors} ช่อง — แก้ไขหรือลบรายการที่ผิดก่อน` : undefined}
                  className={cn(
                    'px-5 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                    canConfirm
                      ? 'bg-[#05a94f] text-white hover:bg-[#048f43] shadow-sm'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed',
                  )}>
                  เพิ่มเข้าตาราง PNR ({confirmCount} รายการ)
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
