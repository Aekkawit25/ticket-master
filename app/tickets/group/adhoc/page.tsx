'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { StatCard } from '@/components/ui/card'
import { SinglePnrModal } from '@/components/shared/SinglePnrModal'
import {
  getDemoStocks, saveDemoStock, calculateStockSummary, getStockFlightSets, getNextTTL,
  type DemoStock, type DemoPNR, type DemoLog,
} from '@/lib/demo-storage'
import { buildDemoPnrFromForm } from '@/lib/pnr-shared-utils'
import type { PnrFormValues, PnrModalCondition } from '@/lib/pnr-shared-utils'
import { formatDate, formatDateTime } from '@/lib/utils'
import { PlusCircle, Users, List, ChevronRight, ExternalLink, Search, X, Eye } from 'lucide-react'

// ─── SeatBar (mirrors TicketTable pattern) ────────────────────────────────────

function SeatBar({ total, balance }: { total: number; balance: number }) {
  const used  = total - balance
  const pct   = total > 0 ? Math.round((used / total) * 100) : 0
  const color = balance <= 0 ? '#ef4444' : balance / total < 0.2 ? '#f59e0b' : '#05a94f'
  return (
    <div className="flex items-center gap-1.5">
      <div className="progress-bar w-12 shrink-0">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ color }} className="text-xs font-bold whitespace-nowrap">{balance}</span>
      <span className="text-xs text-slate-400 whitespace-nowrap">/ {total}</span>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AdHocTab = 'STANDALONE' | 'IN_SERIES'

interface AdhocStockRow {
  stockId: string
  stockCode: string
  stockName: string
  airlineCode: string
  routeText: string
  periodStart: string
  periodEnd: string
  pnrCount: number
  seatBalance: number
  seatTotal: number
  currency: string
  nearestTtl: string | null  // earliest ttlDateTime across all PNRs
  pnrCodes: string[]         // for search
}

interface AdhocPnrRow {
  pnrId: string
  pnrDisplay: string
  travelStart: string
  travelEnd: string
  seatTotal: number
  seatBalance: number
  ttlDateTime: string | null
  currency: string
  seriesStockId: string
  seriesCode: string
  seriesName: string
  airlineCode: string
  routeText: string
  conditionCode: string
  conditionName: string
}

const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GroupAdHocPage() {
  const router = useRouter()

  // Read initial tab from URL (window.location available only client-side)
  const [tab, setTab] = useState<AdHocTab>('STANDALONE')
  const [search, setSearch] = useState('')
  const [allStocks, setAllStocks] = useState<DemoStock[]>([])

  // Add modal state
  const [showAddModal, setShowAddModal]         = useState(false)
  const [showSeriesPicker, setShowSeriesPicker] = useState(false)
  const [seriesSearch, setSeriesSearch]         = useState('')
  const [selectedSeries, setSelectedSeries]     = useState<DemoStock | null>(null)
  const [showPnrForm, setShowPnrForm]           = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const refresh = () => setAllStocks(getDemoStocks())

  // Init from URL + subscribe to updates
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search)
      setTab(p.get('view') === 'series' ? 'IN_SERIES' : 'STANDALONE')
    }
    refresh()
    const h = () => refresh()
    window.addEventListener('demo_stock_updated', h)
    return () => window.removeEventListener('demo_stock_updated', h)
  }, [])

  // Switch tab — reset search, update URL
  const switchTab = (next: AdHocTab) => {
    setTab(next)
    setSearch('')
    const url = new URL(window.location.href)
    url.searchParams.set('view', next === 'IN_SERIES' ? 'series' : 'adhoc')
    router.replace(url.pathname + url.search, { scroll: false })
  }

  // ─── Derived data ─────────────────────────────────────────────────────────

  const standaloneStocks = useMemo(
    () => allStocks.filter(s => s.ticketType === 'Group' && s.groupType === 'ADHOC'),
    [allStocks]
  )

  const seriesWithAdhoc = useMemo(
    () => allStocks.filter(
      s => s.ticketType === 'Group' && s.groupType === 'SERIES'
        && s.pnrs.some(p => p.sourceType === 'AD_HOC')
    ),
    [allStocks]
  )

  const allSeries = useMemo(
    () => allStocks.filter(s => s.ticketType === 'Group' && s.groupType === 'SERIES'),
    [allStocks]
  )

  const totalAdhocPnrInSeries = useMemo(
    () => seriesWithAdhoc.reduce((n, s) => n + s.pnrs.filter(p => p.sourceType === 'AD_HOC').length, 0),
    [seriesWithAdhoc]
  )

  // ─── STANDALONE rows ──────────────────────────────────────────────────────

  const standaloneRows: AdhocStockRow[] = useMemo(() => {
    const q = search.trim().toLowerCase()
    return standaloneStocks
      .map(s => {
        const dates = s.pnrs.map(p => p.travelStart).filter(Boolean).sort()
        const pnrCodes = s.pnrs.map(p => (p.pnrDisplay || p.pnrCode || p.dummyPnr).toLowerCase())
        return {
          stockId: s.stockId,
          stockCode: s.stockCode,
          stockName: s.groupName,
          airlineCode: s.airlineCode,
          routeText: s.routeText ?? '',
          periodStart: dates[0] ?? '',
          periodEnd: dates[dates.length - 1] ?? '',
          pnrCount: s.pnrs.length,
          seatBalance: s.summary.seatBalance,
          seatTotal: s.summary.seatTotal,
          currency: s.currency,
          nearestTtl: getNextTTL(s.pnrs),
          pnrCodes,
        }
      })
      .filter(r => !q
        || r.stockCode.toLowerCase().includes(q)
        || r.stockName.toLowerCase().includes(q)
        || r.airlineCode.toLowerCase().includes(q)
        || r.routeText.toLowerCase().includes(q)
        || r.pnrCodes.some(c => c.includes(q))
      )
  }, [standaloneStocks, search])

  // ─── IN_SERIES rows ───────────────────────────────────────────────────────

  const inSeriesRows: AdhocPnrRow[] = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result: AdhocPnrRow[] = []
    seriesWithAdhoc.forEach(series => {
      series.pnrs.filter(p => p.sourceType === 'AD_HOC').forEach(pnr => {
        const sc = series.conditions.find(c => c.condition.conditionCode === pnr.conditionCode)
        result.push({
          pnrId: pnr.pnrId,
          pnrDisplay: pnr.pnrDisplay || pnr.pnrCode || pnr.dummyPnr || pnr.pnrId,
          travelStart: pnr.travelStart,
          travelEnd: pnr.travelEnd,
          seatTotal: pnr.seatTotal,
          seatBalance: pnr.seatBalance,
          ttlDateTime: pnr.ttlDateTime ?? null,
          currency: series.currency,
          seriesStockId: series.stockId,
          seriesCode: series.stockCode,
          seriesName: series.groupName,
          airlineCode: series.airlineCode,
          routeText: series.routeText ?? '',
          conditionCode: pnr.conditionCode || '',
          conditionName: sc?.condition.conditionName || '',
        })
      })
    })
    if (!q) return result
    return result.filter(r =>
      r.pnrDisplay.toLowerCase().includes(q)
      || r.seriesCode.toLowerCase().includes(q)
      || r.seriesName.toLowerCase().includes(q)
      || r.airlineCode.toLowerCase().includes(q)
      || r.routeText.toLowerCase().includes(q)
      || r.conditionCode.toLowerCase().includes(q)
      || r.conditionName.toLowerCase().includes(q)
    )
  }, [seriesWithAdhoc, search])

  // ─── Series picker ────────────────────────────────────────────────────────

  const filteredSeries = allSeries.filter(s => {
    const q = seriesSearch.toLowerCase()
    return !q || s.stockCode.toLowerCase().includes(q) || s.groupName.toLowerCase().includes(q)
  })

  const seriesConditions: PnrModalCondition[] = useMemo(() => {
    if (!selectedSeries) return []
    return selectedSeries.conditions
      .filter(c => c.condition.status === 'Active')
      .map(c => ({
        code: c.condition.conditionCode,
        name: c.condition.conditionName,
        ttlRule: c.condition.ttlRule ? {
          calcType: c.condition.ttlRule.calcType as 'TRAVEL_MINUS_DAYS' | 'FIXED_DATE' | 'NONE',
          daysBefore: c.condition.ttlRule.daysBefore ?? null,
          fixedDate: c.condition.ttlRule.fixedDate ?? null,
          time: c.condition.ttlRule.time ?? null,
        } : undefined,
      }))
  }, [selectedSeries])

  const seriesDefaultCondCode = useMemo(() => {
    if (!selectedSeries) return ''
    const active = selectedSeries.conditions.filter(c => c.condition.status === 'Active')
    if (active.length === 1) return active[0].condition.conditionCode
    return selectedSeries.defaultConditionCode || ''
  }, [selectedSeries])

  const seriesFlightSets = useMemo(
    () => selectedSeries ? getStockFlightSets(selectedSeries) : [],
    [selectedSeries]
  )

  const handleAddAdhocToSeries = async (vals: PnrFormValues) => {
    if (!selectedSeries) return
    const flightSet = seriesFlightSets.find(fs => fs.flightSetId === vals.flightSetId) ?? seriesFlightSets[0]
    if (!flightSet) throw new Error('ไม่พบ Flight Set')
    const newPnr: DemoPNR = {
      ...buildDemoPnrFromForm(vals, selectedSeries, flightSet, undefined, 'AD_HOC'),
      sourceType: 'AD_HOC',
    }
    const now = new Date().toISOString()
    const log: DemoLog = {
      logId: newId('LOG'),
      action: 'เพิ่ม Ad Hoc PNR',
      message: `เพิ่ม PNR Ad Hoc: ${newPnr.pnrDisplay}, Seat ${newPnr.seatTotal}`,
      createdAt: now,
      createdBy: 'System',
    }
    const newPnrs = [...selectedSeries.pnrs, newPnr]
    const updated: DemoStock = {
      ...selectedSeries,
      pnrs: newPnrs,
      summary: calculateStockSummary(newPnrs),
      updatedAt: now,
      logs: [log, ...selectedSeries.logs],
    }
    saveDemoStock(updated)
    setShowPnrForm(false)
    setSelectedSeries(null)
    setSeriesSearch('')
    showToast(`เพิ่ม Ad Hoc PNR เข้า ${selectedSeries.stockCode} สำเร็จ`)
  }

  // ─── Shared search bar ────────────────────────────────────────────────────

  const searchPlaceholder = tab === 'STANDALONE'
    ? 'ค้นหา Ad Hoc Code, Name, Airline, Route, PNR...'
    : 'ค้นหา PNR, Series, Condition, Airline, Route...'

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Group Ad Hoc">

      {/* Toast */}
      {toast && (
        <div className="mb-3 flex items-center gap-2 text-sm text-[#05a94f] bg-green-50 border border-green-200 rounded-xl px-3 py-2">
          <span>✓</span> {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-1 text-xs text-slate-400 mb-1">
            <span>Ticket Stock</span>
            <ChevronRight size={10} />
            <span className="text-slate-600 font-medium">Group Ad Hoc</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900">Group Ad Hoc</h1>
          <p className="text-sm text-slate-500">Ad Hoc และ PNR Ad Hoc ที่เพิ่มเข้าไปใน Series</p>
        </div>
        <Button size="sm" icon={<PlusCircle size={14} />} onClick={() => setShowAddModal(true)}>
          Add Group Ad Hoc
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <StatCard title="Ad Hoc"             value={standaloneStocks.length}  icon={<Users size={18} />} color="#f59e0b" />
        <StatCard title="Ad Hoc ใน Series"   value={totalAdhocPnrInSeries}    icon={<List  size={18} />} color="#8b5cf6" />
        <StatCard title="Series ที่มี Ad Hoc" value={seriesWithAdhoc.length}   icon={<List  size={18} />} color="#3b82f6" />
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {([
          { key: 'STANDALONE' as AdHocTab, label: 'Ad Hoc',           count: standaloneStocks.length },
          { key: 'IN_SERIES'  as AdHocTab, label: 'Ad Hoc ใน Series', count: totalAdhocPnrInSeries  },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              tab === t.key
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {t.label}
            <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
              tab === t.key ? 'bg-amber-200 text-amber-800' : 'bg-slate-100 text-slate-500'
            }`}>{t.count}</span>
          </button>
        ))}

        {/* Search — scoped to active tab */}
        <div className="ml-auto relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            key={tab}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#05a94f] w-64"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Table: Ad Hoc (STANDALONE) ─────────────────────────────────────── */}
      {tab === 'STANDALONE' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 h-9">
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[120px]">Ad Hoc Code</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[140px]">Ad Hoc Name</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[52px]">Airline</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[90px]">Route</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[100px]">Period</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[50px]">PNR</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[150px]">Seat (Bal/Total)</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[110px]">NAME DL</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[52px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {standaloneRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">
                    {search ? 'ไม่พบ Ad Hoc ที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูล Ad Hoc'}
                  </td>
                </tr>
              ) : standaloneRows.map((row, idx) => {
                const border = idx === 0 ? '' : 'border-t border-slate-100'
                const period = row.periodStart
                  ? (row.periodStart === row.periodEnd
                      ? formatDate(row.periodStart)
                      : `${formatDate(row.periodStart)} – ${formatDate(row.periodEnd)}`)
                  : '—'
                const ttlText = row.nearestTtl ? formatDateTime(row.nearestTtl) : null
                return (
                  <tr key={row.stockId} className={`bg-white hover:bg-slate-50/60 transition-colors ${border}`}>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs font-bold text-slate-800">{row.stockCode}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-slate-700 font-medium">{row.stockName || '—'}</span>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                        {row.airlineCode}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{row.routeText || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{period}</td>
                    <td className="px-2 py-2.5 text-center text-xs font-semibold text-slate-700">{row.pnrCount}</td>
                    <td className="px-3 py-2.5">
                      <SeatBar total={row.seatTotal} balance={row.seatBalance} />
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {ttlText
                        ? <span className="text-slate-700">{ttlText}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <button
                        title="ดูรายละเอียด"
                        onClick={() => router.push(`/tickets/${row.stockId}`)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                      >
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Table: Ad Hoc ใน Series (IN_SERIES) ───────────────────────────── */}
      {tab === 'IN_SERIES' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 h-9">
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[120px]">PNR</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[110px]">Ad Hoc Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[120px]">Series ที่เชื่อมโยง</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[52px]">Airline</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[80px]">Route</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[90px]">Period</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[130px]">Seat (Bal/Total)</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[100px]">Condition</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[110px]">NAME DL</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[44px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inSeriesRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-400">
                    {search ? 'ไม่พบ PNR Ad Hoc ที่ตรงกับการค้นหา' : 'ยังไม่มี PNR Ad Hoc ที่เพิ่มเข้าไปใน Series'}
                  </td>
                </tr>
              ) : inSeriesRows.map((row, idx) => {
                const border = idx === 0 ? '' : 'border-t border-slate-100'
                const period = row.travelEnd && row.travelEnd !== row.travelStart
                  ? `${formatDate(row.travelStart)} – ${formatDate(row.travelEnd)}`
                  : formatDate(row.travelStart)
                const ttlText = row.ttlDateTime ? formatDateTime(row.ttlDateTime) : null
                return (
                  <tr key={row.pnrId} className={`bg-white hover:bg-slate-50/60 transition-colors ${border}`}>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs font-bold text-slate-800">{row.pnrDisplay}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-slate-500">PNR Ad Hoc ใน Series</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => router.push(`/tickets/${row.seriesStockId}?tab=pnr`)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        <span className="font-mono font-bold">{row.seriesCode}</span>
                        <ExternalLink size={10} />
                      </button>
                      <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{row.seriesName}</div>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                        {row.airlineCode}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-slate-600">{row.routeText || '—'}</td>
                    <td className="px-2 py-2.5 text-xs text-slate-600 whitespace-nowrap">{period || '—'}</td>
                    <td className="px-3 py-2.5">
                      <SeatBar total={row.seatTotal} balance={row.seatBalance} />
                    </td>
                    <td className="px-3 py-2.5">
                      {row.conditionCode ? (
                        <div>
                          <span className="font-mono text-[11px] font-bold text-slate-800">{row.conditionCode}</span>
                          {row.conditionName && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[90px]" title={row.conditionName}>
                              {row.conditionName}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-amber-500 font-medium">ยังไม่ระบุ</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {ttlText
                        ? <span className="text-slate-700">{ttlText}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <button
                        title="เปิด Series ที่เชื่อมโยง"
                        onClick={() => router.push(`/tickets/${row.seriesStockId}?tab=pnr`)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                      >
                        <ExternalLink size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Group Ad Hoc Modal ────────────────────────────────────────── */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Group Ad Hoc"
        size="lg"
      >
        <p className="text-sm text-slate-500 mb-5">เลือกรูปแบบการสร้าง Ad Hoc</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            className="flex flex-col rounded-xl border-2 border-slate-200 p-5 cursor-pointer transition-all hover:border-purple-400 hover:bg-purple-50/30"
            onClick={() => { setShowAddModal(false); setShowSeriesPicker(true) }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-purple-50 text-purple-600 border border-purple-200">
              <List size={22} />
            </div>
            <h4 className="text-base font-bold text-slate-800 mb-1">เพิ่ม Ad Hoc ใน Series</h4>
            <p className="text-sm text-slate-600 mb-1">เพิ่ม PNR ประเภท Ad Hoc เข้าไปใน Series ที่มีอยู่</p>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">PNR จะถูกเพิ่มเข้า Series เดิม และแสดง Badge &quot;Ad Hoc&quot; ในตาราง PNR</p>
            <button className="mt-auto w-full py-2 px-4 rounded-lg text-sm font-semibold text-white bg-purple-500 hover:bg-purple-600 transition-colors">
              เลือก Series <ChevronRight size={14} className="inline ml-1" />
            </button>
          </div>
          <div
            className="flex flex-col rounded-xl border-2 border-slate-200 p-5 cursor-pointer transition-all hover:border-amber-400 hover:bg-amber-50/30"
            onClick={() => { setShowAddModal(false); router.push('/tickets/add?stockType=AD_HOC') }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-amber-50 text-amber-600 border border-amber-200">
              <Users size={22} />
            </div>
            <h4 className="text-base font-bold text-slate-800 mb-1">สร้าง Ad Hoc</h4>
            <p className="text-sm text-slate-600 mb-1">สร้าง Stock ประเภท Ad Hoc ใหม่ โดยใช้โครงสร้างเดียวกับ Series</p>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">รองรับหลาย PNR ใช้ขั้นตอนและ Validation ชุดเดียวกับ Series</p>
            <button className="mt-auto w-full py-2 px-4 rounded-lg text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors">
              สร้าง Ad Hoc <ChevronRight size={14} className="inline ml-1" />
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Series Picker Modal ───────────────────────────────────────────── */}
      <Modal
        open={showSeriesPicker}
        onClose={() => { setShowSeriesPicker(false); setSeriesSearch('') }}
        title="เลือก Series ที่ต้องการเพิ่ม Ad Hoc PNR"
        size="lg"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={seriesSearch}
              onChange={e => setSeriesSearch(e.target.value)}
              placeholder="ค้นหา Series Code, Series Name..."
              autoFocus
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#05a94f]"
            />
          </div>
          <div className="max-h-[360px] overflow-y-auto space-y-1.5">
            {filteredSeries.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">ไม่พบ Series</p>
            ) : filteredSeries.map(s => (
              <button
                key={s.stockId}
                onClick={() => {
                  setSelectedSeries(s)
                  setShowSeriesPicker(false)
                  setSeriesSearch('')
                  setShowPnrForm(true)
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 hover:border-[#05a94f] hover:bg-emerald-50/30 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-800">{s.stockCode}</span>
                    <span className="ml-2 text-xs text-slate-600">{s.groupName}</span>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {s.airlineCode} · {s.routeText} · {s.pnrs.length} PNR ·{' '}
                      {s.pnrs.filter(p => p.sourceType === 'AD_HOC').length > 0
                        ? <span className="text-amber-600">มี Ad Hoc {s.pnrs.filter(p => p.sourceType === 'AD_HOC').length} PNR</span>
                        : 'ยังไม่มี Ad Hoc'}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-400 shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* ── PNR Form Modal (Add Ad Hoc to selected Series) ───────────────── */}
      {selectedSeries && (
        <SinglePnrModal
          open={showPnrForm}
          onClose={() => { setShowPnrForm(false); setSelectedSeries(null) }}
          mode="add_to_series"
          flightSets={seriesFlightSets}
          conditions={seriesConditions}
          currency={selectedSeries.currency}
          defaultConditionCode={seriesDefaultCondCode}
          stock={selectedSeries}
          stockTitle={`${selectedSeries.stockCode} — Ad Hoc PNR`}
          onConfirm={handleAddAdhocToSeries}
        />
      )}

    </AppLayout>
  )
}
