'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  X, FileUp, ChevronLeft, AlertCircle, CheckCircle,
  AlertTriangle, Trash2, Download,
} from 'lucide-react'
import {
  isHeaderRow, normalizePastedRows, validatePastedRows,
  parseMultiSectorPaste, groupMultiSectorRows, validatePNRGroups, groupsToPastedRows,
  AIRLINE_CODES, AIRPORT_CODES,
  type PastedExcelRow, type ValidatedPastedRow, type ValidatedPNRGroup,
  type FieldKey, type MultiSectorFieldKey, type SectorTemplate,
  type PastedMultiSectorRow,
} from '@/lib/paste-excel'
import { parsePnrExcelFile } from '@/lib/excel-import'
import { downloadPnrTemplate } from '@/lib/excel-template'
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
  value, onChange, type = 'text', uppercase = false, transform,
  error, warning, id, className = '',
}: {
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'date' | 'number'
  uppercase?: boolean
  transform?: (v: string) => string
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
        onChange={e => {
          let v = uppercase ? e.target.value.toUpperCase() : e.target.value
          if (transform) v = transform(v)
          onChange(v)
        }}
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
interface ImportExcelModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (rows: PastedExcelRow[]) => void
  existingPnrCodes: string[]
  sectors: FlightSectorFormData[]
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ImportExcelModal({
  open, onClose, onConfirm, existingPnrCodes, sectors,
}: ImportExcelModalProps) {
  const [view, setView]               = useState<'upload' | 'preview'>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError]     = useState<string | null>(null)
  const [parsing, setParsing]         = useState(false)
  const [rows, setRows]               = useState<ValidatedPastedRow[]>([])
  const [groups, setGroups]           = useState<ValidatedPNRGroup[]>([])
  const [submitting, setSubmitting]   = useState(false)
  const [successMsg, setSuccessMsg]   = useState('')
  const [isDragging, setIsDragging]   = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isMultiSector = sectors.length > 2
  const templates     = buildSectorTemplates(sectors)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView('upload')
      setSelectedFile(null)
      setFileError(null)
      setParsing(false)
      setRows([])
      setGroups([])
      setSubmitting(false)
      setSuccessMsg('')
    }
  }, [open])

  const focusField = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); (el as HTMLInputElement).focus() }
  }, [])

  const handleFile = useCallback((file: File) => {
    setSelectedFile(file)
    setFileError(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleImport = useCallback(async () => {
    if (!selectedFile || parsing) return
    setParsing(true)
    setFileError(null)

    const { rows: rawRows, error } = await parsePnrExcelFile(selectedFile)

    if (error || rawRows.length === 0) {
      setFileError(error ?? 'ไม่พบข้อมูลในไฟล์')
      setParsing(false)
      return
    }

    const hasHeader = isHeaderRow(rawRows[0])

    if (isMultiSector) {
      const multiRows = parseMultiSectorPaste(rawRows, hasHeader)
      const rawGroups = groupMultiSectorRows(multiRows)
      setGroups(validatePNRGroups(rawGroups, existingPnrCodes, templates, AIRLINE_CODES, AIRPORT_CODES))
    } else {
      const normalized = normalizePastedRows(rawRows, hasHeader)
      setRows(validatePastedRows(normalized, existingPnrCodes, AIRLINE_CODES, AIRPORT_CODES, templates))
    }

    setParsing(false)
    setView('preview')
  }, [selectedFile, parsing, isMultiSector, existingPnrCodes, templates])

  // ── Two-sector: re-validate after cell edit ────────────────────────────────
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
      const rg = groupMultiSectorRows(updated.flatMap(g => g.sectors))
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
          ...(patch.pnrCode     !== undefined ? { pnrCode:     patch.pnrCode }     : {}),
          ...(patch.importGroup !== undefined ? { importGroup: patch.importGroup } : {}),
          ...(patch.seatCount   !== undefined ? { seatCount:   patch.seatCount }   : {}),
        }))
        return { ...g, ...patch, sectors: newSectors }
      })
      const rg = groupMultiSectorRows(updated.flatMap(g => g.sectors))
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
  const canConfirm  = totalCount > 0 && errorCount === 0 && !submitting
  const confirmCount = isMultiSector
    ? groups.filter(g => g.status !== 'ERROR').length
    : rows.filter(r => r.status !== 'ERROR').length

  const firstErrRow2   = rows.find(r => r.status === 'ERROR')
  const firstErrField2 = firstErrRow2 ? (Object.keys(firstErrRow2.fieldErrors)[0] as FieldKey) : undefined
  const firstErrGroup  = groups.find(g => g.status === 'ERROR')
  const firstErrGSIdx  = firstErrGroup ? firstErrGroup.sectorFieldErrors.findIndex(fe => Object.keys(fe).length > 0) : -1
  const firstErrGField = (firstErrGSIdx >= 0 && firstErrGroup)
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
              <button type="button" onClick={() => setView('upload')}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                <ChevronLeft size={16} />
              </button>
            )}
            <FileUp size={16} className="text-[#05a94f]" />
            <h2 className="text-sm font-bold text-slate-800">
              {view === 'upload' ? 'Import Excel' : 'ตรวจสอบข้อมูล'}
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

        {/* ── UPLOAD VIEW ──────────────────────────────────────────────────── */}
        {view === 'upload' && (
          <div className="flex flex-col gap-4 p-5 overflow-y-auto">

            {/* Column format guide */}
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-blue-700">รูปแบบคอลัมน์ (Sheet &quot;PNR&quot;)</p>
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
                      {(isMultiSector
                        ? ['Import Group','PNR','Seat','Seq','วันที่','Flight','From','To','เวลาออก','เวลาถึง','+Day']
                        : ['PNR','Seat','วันไป','Flight ไป','From (ไป)','To (ไป)','วันกลับ','Flight กลับ','From (กลับ)','To (กลับ)']
                      ).map((h, i) => (
                        <th key={i} className="border border-blue-200 px-2 py-1 text-blue-700 font-semibold whitespace-nowrap">
                          {i + 1}. {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                </table>
              </div>
              <p className="text-[10px] text-blue-500 mt-2">
                {isMultiSector
                  ? `· PNR ว่าง = Dummy PNR · ต้องระบุ Import Group ถ้า PNR ว่าง · ${sectors.length} แถวต่อ 1 PNR`
                  : '· PNR ว่าง = Dummy PNR (ระบบสร้างรหัสให้อัตโนมัติ) · วันที่: DD/MM/YYYY · เที่ยวบิน เช่น TG640'
                }
              </p>
            </div>

            {/* Sector template reference */}
            {templates.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Sector Template (Step 2) — ระบบจะตรวจสอบกับข้อมูลที่ Import</p>
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
                          <td className="border border-slate-300 px-2 py-1 font-mono">{t.airlineCode || ''}{t.flightNo || '—'}</td>
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

            {/* Download template */}
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl">
              <div>
                <p className="text-xs font-semibold text-green-800">ดาวน์โหลด Template Excel</p>
                <p className="text-[10px] text-green-600 mt-0.5">
                  Template สร้างตาม Sector Step 2 ปัจจุบัน · {sectors.length} Sector · {isMultiSector ? 'Multi-Sector' : '2-Sector'} mode
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadPnrTemplate(sectors)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 border border-green-400 hover:bg-green-100 rounded-lg transition-colors shrink-0"
              >
                <Download size={12} /> ดาวน์โหลด Template
              </button>
            </div>

            {/* File upload zone */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                อัปโหลดไฟล์ Excel (.xlsx)
              </label>
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors select-none',
                  isDragging
                    ? 'border-[#05a94f] bg-green-50'
                    : selectedFile && !fileError
                      ? 'border-green-400 bg-green-50'
                      : 'border-slate-300 hover:border-[#05a94f] hover:bg-green-50/30',
                )}
              >
                <FileUp size={28} className={cn(
                  'transition-colors',
                  selectedFile && !fileError ? 'text-green-500' : 'text-slate-300'
                )} />
                {selectedFile ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-700">{selectedFile.name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {(selectedFile.size / 1024).toFixed(1)} KB · คลิกเพื่อเปลี่ยนไฟล์
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm text-slate-500">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">รองรับเฉพาะ .xlsx</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              {fileError && (
                <div className="flex items-center gap-2 mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle size={13} className="text-red-500 shrink-0" />
                  <p className="text-xs text-red-600">{fileError}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                ยกเลิก
              </button>
              <button type="button" onClick={handleImport}
                disabled={!selectedFile || parsing}
                className={cn(
                  'px-5 py-2 text-xs font-semibold rounded-xl transition-colors',
                  selectedFile && !parsing
                    ? 'bg-[#05a94f] text-white hover:bg-[#048f43]'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed',
                )}>
                {parsing ? 'กำลังอ่านไฟล์...' : 'ตรวจสอบข้อมูล'}
              </button>
            </div>
          </div>
        )}

        {/* ── PREVIEW VIEW ─────────────────────────────────────────────────── */}
        {view === 'preview' && (
          <>
            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200 shrink-0 text-xs">
              <span className="text-slate-500">
                ทั้งหมด <span className="font-bold text-slate-700">{totalCount} PNR</span>
              </span>
              {errorCount > 0 && (
                <button type="button"
                  onClick={() => {
                    if (!isMultiSector && firstErrRow2 && firstErrField2)
                      focusField(`import-r${firstErrRow2.rowIndex}-${firstErrField2}`)
                    else if (isMultiSector && firstErrGroup && firstErrGField && firstErrGSIdx >= 0)
                      focusField(`import-ms-${firstErrGroup.groupKey}-${firstErrGSIdx}-${firstErrGField}`)
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
              <span className="text-slate-400">
                Seat รวม <span className="font-bold text-slate-600">{seatTotal.toLocaleString('en-US')}</span>
              </span>
              {successMsg && <span className="ml-auto font-semibold text-[#05a94f]">{successMsg}</span>}
            </div>

            <div className="overflow-auto flex-1 min-h-0">

              {/* ── Two-sector preview ──────────────────────────────────────── */}
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
                              id={`import-r${rid}-pnrCode`}
                              transform={v => v.replace(/[^A-Z0-9]/g, '').slice(0, 7)}
                              onChange={v => updateCell(rid, { pnrCode: v, isDummy: !v })}
                              className="font-mono" />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell type="number" value={String(d.seatCount || '')} error={fe.seatCount}
                              id={`import-r${rid}-seatCount`}
                              onChange={v => updateCell(rid, { seatCount: parseInt(v, 10) || 0 })}
                              className="text-center" />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell type="date" value={d.outboundDate} error={fe.outboundDate}
                              id={`import-r${rid}-outboundDate`}
                              onChange={v => updateCell(rid, { outboundDate: v })} />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell uppercase value={d.outboundFlight} error={fe.outboundFlight} warning={fw.outboundFlight}
                              id={`import-r${rid}-outboundFlight`}
                              onChange={v => updateCell(rid, { outboundFlight: v.toUpperCase(), outboundAirlineCode: parseFlightCodeAirline(v) })}
                              className="font-mono" />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell uppercase value={d.outboundFrom} error={fe.outboundFrom} warning={fw.outboundFrom}
                              id={`import-r${rid}-outboundFrom`}
                              onChange={v => updateCell(rid, { outboundFrom: v.toUpperCase() })} />
                            <div className="text-[9px] text-slate-300 text-center my-0.5 select-none">↓</div>
                            <ECell uppercase value={d.outboundTo} error={fe.outboundTo} warning={fw.outboundTo}
                              id={`import-r${rid}-outboundTo`}
                              onChange={v => updateCell(rid, { outboundTo: v.toUpperCase() })} />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell type="date" value={d.returnDate} error={fe.returnDate}
                              id={`import-r${rid}-returnDate`}
                              onChange={v => updateCell(rid, { returnDate: v })} />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell uppercase value={d.returnFlight} error={fe.returnFlight} warning={fw.returnFlight}
                              id={`import-r${rid}-returnFlight`}
                              onChange={v => updateCell(rid, { returnFlight: v.toUpperCase(), returnAirlineCode: parseFlightCodeAirline(v) })}
                              className="font-mono" />
                          </td>
                          <td className="border border-slate-200 p-0.5 align-top">
                            <ECell uppercase value={d.returnFrom} error={fe.returnFrom} warning={fw.returnFrom}
                              id={`import-r${rid}-returnFrom`}
                              onChange={v => updateCell(rid, { returnFrom: v.toUpperCase() })} />
                            <div className="text-[9px] text-slate-300 text-center my-0.5 select-none">↓</div>
                            <ECell uppercase value={d.returnTo} error={fe.returnTo} warning={fw.returnTo}
                              id={`import-r${rid}-returnTo`}
                              onChange={v => updateCell(rid, { returnTo: v.toUpperCase() })} />
                          </td>
                          <td className="border border-slate-200 px-2 py-1 align-top">
                            {issues.map((iss, k) => (
                              <div key={k}
                                className={cn('text-[10px] cursor-pointer hover:underline mb-0.5',
                                  r.errors.includes(iss) ? 'text-red-500' : 'text-yellow-600')}
                                onClick={() => iss.fields[0] && focusField(`import-r${rid}-${iss.fields[0]}`)}>
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

              {/* ── Multi-sector preview ─────────────────────────────────────── */}
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
                        const fe   = g.sectorFieldErrors[si]   ?? {}
                        const fw   = g.sectorFieldWarnings[si] ?? {}
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
                                  id={`import-ms-${g.groupKey}-0-importGroup`}
                                  onChange={v => updateGroupField(g.groupKey, { importGroup: v })} />
                              </td>
                            )}
                            {first && (
                              <td className="border border-slate-200 p-0.5 align-middle" rowSpan={g.sectors.length}>
                                <ECell uppercase value={g.pnrCode}
                                  id={`import-ms-${g.groupKey}-0-pnrCode`}
                                  transform={v => v.replace(/[^A-Z0-9]/g, '').slice(0, 7)}
                                  onChange={v => updateGroupField(g.groupKey, { pnrCode: v })}
                                  className="font-mono" />
                              </td>
                            )}
                            {first && (
                              <td className="border border-slate-200 p-0.5 align-middle text-center" rowSpan={g.sectors.length}>
                                <ECell type="number" value={String(g.seatCount || '')}
                                  id={`import-ms-${g.groupKey}-0-seatCount`}
                                  onChange={v => updateGroupField(g.groupKey, { seatCount: parseInt(v, 10) || 0 })}
                                  className="text-center" />
                              </td>
                            )}
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell type="number" value={String(s.seq || '')} error={fe.seq}
                                id={`import-ms-${g.groupKey}-${si}-seq`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, { seq: parseInt(v, 10) || 0 })}
                                className="text-center" />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell type="date" value={s.travelDate} error={fe.travelDate}
                                id={`import-ms-${g.groupKey}-${si}-travelDate`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, { travelDate: v })} />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell uppercase value={s.flightNo} error={fe.flightNo} warning={fw.flightNo}
                                id={`import-ms-${g.groupKey}-${si}-flightNo`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, {
                                  flightNo: v.toUpperCase(), airlineCode: parseFlightCodeAirline(v),
                                })}
                                className="font-mono" />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell uppercase value={s.depAirportCode} error={fe.depAirportCode} warning={fw.depAirportCode}
                                id={`import-ms-${g.groupKey}-${si}-depAirportCode`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, { depAirportCode: v.toUpperCase() })} />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell uppercase value={s.arrAirportCode} error={fe.arrAirportCode} warning={fw.arrAirportCode}
                                id={`import-ms-${g.groupKey}-${si}-arrAirportCode`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, { arrAirportCode: v.toUpperCase() })} />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell value={s.depTime} error={fe.depTime}
                                id={`import-ms-${g.groupKey}-${si}-depTime`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, {
                                  depTime: v,
                                  plusDay: s.arrTime && v ? (s.arrTime < v ? 1 : 0) : s.plusDay,
                                })} />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top">
                              <ECell value={s.arrTime} error={fe.arrTime}
                                id={`import-ms-${g.groupKey}-${si}-arrTime`}
                                onChange={v => updateGroupSectorCell(g.groupKey, si, {
                                  arrTime: v,
                                  plusDay: v && s.depTime ? (v < s.depTime ? 1 : 0) : s.plusDay,
                                })} />
                            </td>
                            <td className="border border-slate-200 p-0.5 align-top text-center">
                              <div className="px-1.5 py-[3px] text-[11px] font-medium text-slate-600">
                                {s.arrTime && s.depTime ? (s.arrTime < s.depTime ? '+1' : '0') : String(s.plusDay)}
                              </div>
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
                                {!g.errors.length && !g.warnings.length && (
                                  <span className="text-[10px] text-green-600">—</span>
                                )}
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
                <button type="button" onClick={() => setView('upload')}
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
