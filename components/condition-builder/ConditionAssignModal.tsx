'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, CheckSquare, Square, ChevronRight, AlertTriangle, Info, X } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildRouteText, formatDate } from '@/lib/utils'
import {
  getAvailableSeriesForTemplate, getAvailablePnrsForTemplate,
  getSeriesUsingTemplate, getPnrsWithDirectAssignment,
  assignTemplateToSeries, assignTemplateToPnrs,
  getStockTemplateId, getPnrConditionSource, countPnrOverrides,
} from '@/lib/condition-usage'
import { getConditionTemplates } from '@/lib/condition-storage'
import type { AppConditionTemplate } from '@/lib/condition-schema'
import type { DemoStock, DemoPNR } from '@/lib/demo-storage'

interface Props {
  open: boolean
  onClose: () => void
  template: AppConditionTemplate
  onSaved: (seriesCount: number, pnrCount: number) => void
}

type ModalTab = 'series' | 'pnr'
type Step = 'select' | 'confirm'
type ConflictMode = 'skip' | 'replace'
type PnrOverrideMode = 'keep' | 'replace'

function routeText(stock: DemoStock): string {
  const sectors = (stock.flightSets?.[0]?.sectors ?? stock.sectors)
  return buildRouteText(sectors.map(s => ({ dep_airport_code: s.depAirportCode, arr_airport_code: s.arrAirportCode })))
}

function travelPeriod(stock: DemoStock): string {
  const starts = stock.pnrs.map(p => p.travelStart).filter(Boolean).sort()
  const ends   = stock.pnrs.map(p => p.travelEnd).filter(Boolean).sort()
  if (!starts.length) return '—'
  const first = formatDate(starts[0])
  const last  = ends.length ? formatDate(ends[ends.length - 1]) : ''
  return last && last !== first ? `${first} – ${last}` : first
}

// ─── Series row ───────────────────────────────────────────────────────────────

function SeriesRow({
  stock, selected, onToggle, currentTemplateId, thisTemplateId, templateNameMap,
}: {
  stock: DemoStock; selected: boolean; onToggle: () => void
  currentTemplateId: string | null; thisTemplateId: string; templateNameMap: Map<string, string>
}) {
  const isCurrent  = currentTemplateId === thisTemplateId
  const hasOther   = currentTemplateId && !isCurrent
  const currentName = currentTemplateId ? (templateNameMap.get(currentTemplateId) ?? currentTemplateId) : null
  const overrides  = countPnrOverrides(stock)

  return (
    <tr
      className={cn('border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors', selected && 'bg-emerald-50')}
      onClick={onToggle}
    >
      <td className="pl-3 py-2.5 w-8">
        {selected
          ? <CheckSquare size={16} className="text-[#05a94f]" />
          : <Square size={16} className="text-slate-300" />}
      </td>
      <td className="px-3 py-2.5">
        <span className="font-mono text-xs font-semibold text-slate-800">{stock.stockCode}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-slate-700">{stock.groupName}</td>
      <td className="px-3 py-2.5 text-xs text-slate-500">{routeText(stock)}</td>
      <td className="px-3 py-2.5 text-xs text-slate-500">{travelPeriod(stock)}</td>
      <td className="px-3 py-2.5 text-xs text-slate-500 text-right">{stock.pnrs.length}</td>
      <td className="px-3 py-2.5">
        {isCurrent ? (
          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">ใช้งานอยู่</span>
        ) : currentName ? (
          <span className="text-xs text-amber-700 font-medium">{currentName}</span>
        ) : (
          <span className="text-[11px] text-slate-400">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        {overrides > 0 && (
          <span className="text-[10px] text-orange-600">{overrides} Override</span>
        )}
      </td>
    </tr>
  )
}

// ─── PNR row ──────────────────────────────────────────────────────────────────

function PnrRow({
  stock, pnr, selected, onToggle, thisTemplateId, templateNameMap,
}: {
  stock: DemoStock; pnr: DemoPNR; selected: boolean; onToggle: () => void
  thisTemplateId: string; templateNameMap: Map<string, string>
}) {
  const src = getPnrConditionSource(pnr, stock)
  const effTmplId = pnr.conditionTemplateId ?? getStockTemplateId(stock)
  const isCurrent = effTmplId === thisTemplateId
  const hasOther  = effTmplId && !isCurrent
  const condName  = effTmplId ? (templateNameMap.get(effTmplId) ?? effTmplId) : null

  return (
    <tr
      className={cn('border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors', selected && 'bg-emerald-50')}
      onClick={onToggle}
    >
      <td className="pl-3 py-2.5 w-8">
        {selected
          ? <CheckSquare size={16} className="text-[#05a94f]" />
          : <Square size={16} className="text-slate-300" />}
      </td>
      <td className="px-3 py-2.5">
        <span className="font-mono text-xs font-semibold text-slate-800">{pnr.pnrCode || pnr.pnrDisplay}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium',
          pnr.pnrType === 'real' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600')}>
          {pnr.pnrType === 'real' ? 'PNR' : 'Dummy PNR'}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className="font-mono text-[11px] text-slate-500">{stock.stockCode}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-slate-500">{routeText(stock)}</td>
      <td className="px-3 py-2.5 text-xs text-slate-500">{pnr.travelStart ? formatDate(pnr.travelStart) : '—'}</td>
      <td className="px-3 py-2.5 text-xs text-slate-500 text-right">{pnr.seatTotal}</td>
      <td className="px-3 py-2.5">
        {isCurrent ? (
          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">ใช้งานอยู่</span>
        ) : condName ? (
          <span className="text-xs text-amber-700 font-medium">{condName}</span>
        ) : (
          <span className="text-[11px] text-slate-400">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={cn('text-[10px]',
          src === 'direct' ? 'text-orange-600 font-medium' : src === 'series' ? 'text-blue-600' : 'text-slate-400')}>
          {src === 'direct' ? 'กำหนดเฉพาะ PNR' : src === 'series' ? 'รับจาก Series' : '—'}
        </span>
      </td>
    </tr>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function ConditionAssignModal({ open, onClose, template, onSaved }: Props) {
  const [tab, setTab]         = useState<ModalTab>('series')
  const [step, setStep]       = useState<Step>('select')
  const [search, setSearch]   = useState('')
  const [selSeries, setSelSeries] = useState<string[]>([])                           // stockIds
  const [selPnrs,   setSelPnrs]   = useState<{ stockId: string; pnrId: string }[]>([])
  const [conflictMode,    setConflictMode]    = useState<ConflictMode>('replace')
  const [pnrOverrideMode, setPnrOverrideMode] = useState<PnrOverrideMode>('keep')
  const [saving, setSaving]   = useState(false)

  // Reset on open
  useEffect(() => {
    if (open) {
      setTab('series'); setStep('select'); setSearch('')
      setSelSeries([]); setSelPnrs([])
      setConflictMode('replace'); setPnrOverrideMode('keep'); setSaving(false)
    }
  }, [open])

  // Build a map of templateId → conditionName for display
  const templateNameMap = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>()
    for (const t of getConditionTemplates()) {
      map.set(t.templateId, t.condition.conditionName)
    }
    return map
  }, [])

  const availableSeries = useMemo(() => getAvailableSeriesForTemplate(template.airlineCode ?? ''), [template])
  const availablePnrs   = useMemo(() => getAvailablePnrsForTemplate(template.airlineCode ?? ''),   [template])

  const q = search.trim().toLowerCase()
  const filteredSeries = availableSeries.filter(s =>
    !q || s.stockCode.toLowerCase().includes(q) || s.groupName.toLowerCase().includes(q) || routeText(s).toLowerCase().includes(q)
  )
  const filteredPnrs = availablePnrs.filter(({ stock, pnr }) =>
    !q || (pnr.pnrCode || pnr.pnrDisplay).toLowerCase().includes(q) || stock.stockCode.toLowerCase().includes(q) || routeText(stock).toLowerCase().includes(q)
  )

  const toggleSeries = (id: string) =>
    setSelSeries(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const togglePnr = (stockId: string, pnrId: string) =>
    setSelPnrs(prev => prev.some(p => p.pnrId === pnrId)
      ? prev.filter(p => p.pnrId !== pnrId)
      : [...prev, { stockId, pnrId }])

  const toggleAllSeries = () =>
    setSelSeries(selSeries.length === filteredSeries.length ? [] : filteredSeries.map(s => s.stockId))
  const toggleAllPnrs = () =>
    setSelPnrs(selPnrs.length === filteredPnrs.length ? [] : filteredPnrs.map(({ stock, pnr }) => ({ stockId: stock.stockId, pnrId: pnr.pnrId })))

  const totalSelected = selSeries.length + selPnrs.length

  // Conflict analysis
  const seriesConflicts = selSeries.filter(id => {
    const stock = availableSeries.find(s => s.stockId === id)
    if (!stock) return false
    const tid = getStockTemplateId(stock)
    return tid && tid !== template.templateId
  })
  const pnrConflicts = selPnrs.filter(({ pnrId, stockId }) => {
    const stock = availableSeries.find(s => s.stockId === stockId)
    if (!stock) return false
    const pnr = stock.pnrs.find(p => p.pnrId === pnrId)
    if (!pnr) return false
    return pnr.conditionTemplateId && pnr.conditionTemplateId !== template.templateId
  })
  const hasConflicts = seriesConflicts.length > 0 || pnrConflicts.length > 0

  const overridePnrCount = selSeries.reduce((sum, id) => {
    const stock = availableSeries.find(s => s.stockId === id)
    return sum + (stock ? countPnrOverrides(stock) : 0)
  }, 0)

  const handleSave = async () => {
    setSaving(true)
    let seriesCount = 0
    let pnrCount = 0
    if (selSeries.length > 0) {
      seriesCount = assignTemplateToSeries({
        template, stockIds: selSeries, conflictMode, pnrOverrideMode, performedBy: 'User',
      })
    }
    if (selPnrs.length > 0) {
      pnrCount = assignTemplateToPnrs({
        template, assignments: selPnrs, conflictMode, performedBy: 'User',
      })
    }
    setSaving(false)
    onSaved(seriesCount, pnrCount)
  }

  const modalTitle = step === 'select'
    ? 'เลือก Series หรือ PNR ที่จะใช้ Condition'
    : 'ยืนยันการกำหนด Condition'

  const footer = step === 'select' ? (
    <>
      <span className="text-xs text-slate-500 mr-auto">
        เลือกแล้ว: {selSeries.length > 0 && `${selSeries.length} Series`}
        {selSeries.length > 0 && selPnrs.length > 0 && ', '}
        {selPnrs.length > 0 && `${selPnrs.length} PNR`}
        {totalSelected === 0 && '—'}
      </span>
      <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
      <Button
        disabled={totalSelected === 0}
        icon={<ChevronRight size={14} />}
        onClick={() => setStep('confirm')}
      >
        ยืนยัน
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={() => setStep('select')}>กลับ</Button>
      <Button disabled={saving} onClick={handleSave}>
        {saving ? 'กำลังบันทึก…' : 'บันทึก'}
      </Button>
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} size="2xl" footer={footer}>
      {step === 'select' && (
        <div className="space-y-3">
          {/* Condition info banner */}
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <Info size={14} className="text-emerald-700 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-800">
                {template.condition.conditionCode} — {template.condition.conditionName}
              </p>
              <p className="text-[10px] text-emerald-700">{template.airlineCode} · {template.currency}</p>
            </div>
          </div>

          {/* Internal tabs */}
          <div className="flex gap-0 border-b border-slate-200">
            {(['series', 'pnr'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setSearch('') }}
                className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  tab === t ? 'border-[#05a94f] text-[#05a94f]' : 'border-transparent text-slate-500 hover:text-slate-700')}
              >
                {t === 'series' ? `เลือก Series (${availableSeries.length})` : `เลือก PNR (${availablePnrs.length})`}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 px-3 h-9 bg-slate-50 border border-slate-200 rounded-xl">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'series' ? 'ค้นหา Series Code, ชื่อ, Route…' : 'ค้นหา PNR Code, Series, Route…'}
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
            />
            {search && <button onClick={() => setSearch('')}><X size={12} className="text-slate-400 hover:text-slate-600" /></button>}
          </div>

          {/* Series table */}
          {tab === 'series' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs min-w-[680px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                    <th className="pl-3 py-2.5 w-8">
                      <button onClick={toggleAllSeries}>
                        {selSeries.length === filteredSeries.length && filteredSeries.length > 0
                          ? <CheckSquare size={14} className="text-[#05a94f]" />
                          : <Square size={14} className="text-slate-300" />}
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-left">Code</th>
                    <th className="px-3 py-2.5 text-left">ชื่อ</th>
                    <th className="px-3 py-2.5 text-left">Route</th>
                    <th className="px-3 py-2.5 text-left">ช่วงวันเดินทาง</th>
                    <th className="px-3 py-2.5 text-right">PNR</th>
                    <th className="px-3 py-2.5 text-left">Condition ปัจจุบัน</th>
                    <th className="px-3 py-2.5 text-left">Override</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSeries.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-sm text-slate-400">ไม่พบ Series สำหรับสายการบินนี้</td></tr>
                  ) : filteredSeries.map(stock => (
                    <SeriesRow
                      key={stock.stockId} stock={stock}
                      selected={selSeries.includes(stock.stockId)}
                      onToggle={() => toggleSeries(stock.stockId)}
                      currentTemplateId={getStockTemplateId(stock)}
                      thisTemplateId={template.templateId}
                      templateNameMap={templateNameMap}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* PNR table */}
          {tab === 'pnr' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs min-w-[820px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                    <th className="pl-3 py-2.5 w-8">
                      <button onClick={toggleAllPnrs}>
                        {selPnrs.length === filteredPnrs.length && filteredPnrs.length > 0
                          ? <CheckSquare size={14} className="text-[#05a94f]" />
                          : <Square size={14} className="text-slate-300" />}
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-left">PNR</th>
                    <th className="px-3 py-2.5 text-left">ประเภท</th>
                    <th className="px-3 py-2.5 text-left">Series</th>
                    <th className="px-3 py-2.5 text-left">Route</th>
                    <th className="px-3 py-2.5 text-left">วันขาไป</th>
                    <th className="px-3 py-2.5 text-right">Seat</th>
                    <th className="px-3 py-2.5 text-left">Condition ปัจจุบัน</th>
                    <th className="px-3 py-2.5 text-left">แหล่งที่มา</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPnrs.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-8 text-sm text-slate-400">ไม่พบ PNR สำหรับสายการบินนี้</td></tr>
                  ) : filteredPnrs.map(({ stock, pnr }) => (
                    <PnrRow
                      key={pnr.pnrId} stock={stock} pnr={pnr}
                      selected={selPnrs.some(p => p.pnrId === pnr.pnrId)}
                      onToggle={() => togglePnr(stock.stockId, pnr.pnrId)}
                      thisTemplateId={template.templateId}
                      templateNameMap={templateNameMap}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 2: Confirm ─────────────────────────────────────────────── */}
      {step === 'confirm' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-slate-700 mb-2">สรุปการกำหนด</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-32">Condition ที่กำหนด</span>
              <span className="text-xs font-semibold text-slate-800">
                {template.condition.conditionCode} — {template.condition.conditionName}
              </span>
            </div>
            {selSeries.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-32">Series ที่เลือก</span>
                <span className="text-xs text-slate-700">{selSeries.length} Series</span>
                {seriesConflicts.length > 0 && (
                  <span className="text-[10px] text-amber-600">({seriesConflicts.length} มี Condition เดิม)</span>
                )}
              </div>
            )}
            {selPnrs.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-32">PNR ที่เลือก</span>
                <span className="text-xs text-slate-700">{selPnrs.length} PNR</span>
                {pnrConflicts.length > 0 && (
                  <span className="text-[10px] text-amber-600">({pnrConflicts.length} มี Condition โดยตรงเดิม)</span>
                )}
              </div>
            )}
          </div>

          {/* Conflict handling */}
          {hasConflicts && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                <p className="text-xs font-semibold text-amber-800">
                  พบรายการที่มี Condition อื่นอยู่แล้ว — กรุณาเลือกวิธีดำเนินการ
                </p>
              </div>
              <div className="space-y-2 pl-5">
                {(['skip', 'replace'] as const).map(mode => (
                  <label key={mode} className="flex items-center gap-2 cursor-pointer group">
                    <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                      conflictMode === mode ? 'border-[#05a94f] bg-[#05a94f]' : 'border-slate-300')}>
                      {conflictMode === mode && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-xs text-slate-700">
                      {mode === 'skip' ? 'ข้ามรายการที่มี Condition แล้ว' : 'แทนที่ Condition เดิมทั้งหมด'}
                    </span>
                    <input type="radio" className="sr-only" checked={conflictMode === mode} onChange={() => setConflictMode(mode)} />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* PNR override handling for selected series */}
          {overridePnrCount > 0 && (
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Info size={14} className="text-blue-600 shrink-0" />
                <p className="text-xs font-semibold text-blue-800">
                  มี {overridePnrCount} PNR ที่กำหนด Condition โดยตรงอยู่ภายใน Series ที่เลือก
                </p>
              </div>
              <div className="space-y-2 pl-5">
                {(['keep', 'replace'] as const).map(mode => (
                  <label key={mode} className="flex items-center gap-2 cursor-pointer">
                    <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                      pnrOverrideMode === mode ? 'border-[#05a94f] bg-[#05a94f]' : 'border-slate-300')}>
                      {pnrOverrideMode === mode && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-xs text-slate-700">
                      {mode === 'keep' ? 'คง Condition เฉพาะของ PNR ไว้ (แนะนำ)' : 'เปลี่ยน PNR ทั้งหมดให้รับ Condition จาก Series'}
                    </span>
                    <input type="radio" className="sr-only" checked={pnrOverrideMode === mode} onChange={() => setPnrOverrideMode(mode)} />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Selected items preview */}
          {selSeries.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Series ที่จะกำหนด</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selSeries.map(id => {
                  const stock = availableSeries.find(s => s.stockId === id)
                  if (!stock) return null
                  const tid = getStockTemplateId(stock)
                  const isConflict = tid && tid !== template.templateId
                  return (
                    <div key={id} className="flex items-center gap-2 text-xs py-1">
                      <span className="font-mono font-semibold text-slate-700 w-28 shrink-0">{stock.stockCode}</span>
                      <span className="text-slate-500 flex-1 truncate">{stock.groupName}</span>
                      {isConflict && conflictMode === 'replace' && (
                        <span className="text-[10px] text-amber-600 shrink-0">แทนที่ Condition เดิม</span>
                      )}
                      {isConflict && conflictMode === 'skip' && (
                        <span className="text-[10px] text-slate-400 shrink-0">ข้าม</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
