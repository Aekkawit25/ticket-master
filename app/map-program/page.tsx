'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import AppLayout from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import {
  Search, Link2, Unlink, X, AlertTriangle, RotateCcw,
  ChevronLeft, ChevronRight, Map, Globe, Plane, BookOpen,
  MoreVertical, CheckCircle2, AlertCircle, Pencil, Info,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MapItem {
  id: string
  groupTour: string
  code: string
  bus: string
  tourName: string
  dateStart: string   // YYYY-MM-DD
  dateEnd: string     // YYYY-MM-DD
  seats: number
  guides: number
  booked: number
}

interface PnrLink {
  pnrCode: string
  status: string
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_DATA: MapItem[] = [
  {
    id: '1',
    groupTour: 'JAPAN',
    code: 'NRT-261128J-NH',
    bus: 'A',
    tourName: 'ZGNRT-2614NH : โตเกียว นาริตะ ฮาโกเน่ โอวาคุดานิ (ชมทุ่งโคเชีย) 5 วัน 4 คืน',
    dateStart: '2026-11-28',
    dateEnd: '2026-12-02',
    seats: 35,
    guides: 1,
    booked: 0,
  },
  {
    id: '2',
    groupTour: 'JAPAN',
    code: 'NRT-261202H-NH',
    bus: 'A',
    tourName: 'ZGNRT-2614NH : โตเกียว นาริตะ ฮาโกเน่ โอวาคุดานิ (ชมทุ่งโคเชีย) 5 วัน 4 คืน',
    dateStart: '2026-12-02',
    dateEnd: '2026-12-06',
    seats: 35,
    guides: 1,
    booked: 0,
  },
]

const PAGE_SIZES = [10, 20, 50, 100]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt4(d: string): string {
  if (!d) return '–'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MapProgramPage() {
  // ── Filters ───────────────────────────────────────────────────────────────
  const [searchCode, setSearchCode] = useState('')
  const [searchName, setSearchName] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'linked' | 'unlinked'>('all')

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // ── PNR link state (id → link info) ──────────────────────────────────────
  const [links, setLinks] = useState<Record<string, PnrLink>>({})

  // ── Dropdown menu ─────────────────────────────────────────────────────────
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // ── Detail modal ──────────────────────────────────────────────────────────
  const [detailItem, setDetailItem] = useState<MapItem | null>(null)

  // ── Link PNR modal ────────────────────────────────────────────────────────
  const [linkItem, setLinkItem] = useState<MapItem | null>(null)
  const [linkStep, setLinkStep] = useState<1 | 2>(1)
  const [linkCode, setLinkCode] = useState('')
  const [linkError, setLinkError] = useState('')

  // ── Unlink modal ──────────────────────────────────────────────────────────
  const [unlinkItem, setUnlinkItem] = useState<MapItem | null>(null)

  // ── Counts ────────────────────────────────────────────────────────────────
  const totalLinked = MOCK_DATA.filter(r => !!links[r.id]).length
  const totalUnlinked = MOCK_DATA.length - totalLinked

  // ── Filter logic ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = MOCK_DATA
    if (activeTab === 'linked') rows = rows.filter(r => !!links[r.id])
    if (activeTab === 'unlinked') rows = rows.filter(r => !links[r.id])
    if (searchCode.trim()) {
      const q = searchCode.toLowerCase()
      rows = rows.filter(r => r.code.toLowerCase().includes(q) || r.groupTour.toLowerCase().includes(q))
    }
    if (searchName.trim()) {
      const q = searchName.toLowerCase()
      rows = rows.filter(r => r.tourName.toLowerCase().includes(q))
    }
    if (dateFrom) rows = rows.filter(r => r.dateStart >= dateFrom)
    if (dateTo) rows = rows.filter(r => r.dateStart <= dateTo)
    return rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, searchCode, searchName, dateFrom, dateTo, links])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const hasFilters = !!(searchCode || searchName || dateFrom || dateTo)

  function resetPage() { setPage(1) }
  function clearFilters() {
    setSearchCode(''); setSearchName('')
    setDateFrom(''); setDateTo(''); setPage(1)
  }

  // ── Link PNR handlers ─────────────────────────────────────────────────────
  function openLink(item: MapItem) {
    setLinkItem(item)
    setLinkStep(1)
    setLinkCode(links[item.id]?.pnrCode || '')
    setLinkError('')
    setOpenMenuId(null)
  }

  function closeLink() {
    setLinkItem(null)
    setLinkCode('')
    setLinkError('')
    setLinkStep(1)
  }

  function validateAndNext() {
    const code = linkCode.trim().toUpperCase()
    if (!code) { setLinkError('กรุณากรอก PNR Code'); return }
    // Check if code already used by another row
    const duplicate = Object.entries(links).find(([id, lnk]) => lnk.pnrCode === code && id !== linkItem!.id)
    if (duplicate) { setLinkError(`PNR ${code} ถูกใช้แล้วในรายการอื่น`); return }
    setLinkError('')
    setLinkStep(2)
  }

  function saveLink() {
    if (!linkItem) return
    setLinks(prev => ({
      ...prev,
      [linkItem.id]: { pnrCode: linkCode.trim().toUpperCase(), status: 'Confirmed' },
    }))
    closeLink()
  }

  // ── Unlink handler ────────────────────────────────────────────────────────
  function saveUnlink() {
    if (!unlinkItem) return
    setLinks(prev => {
      const next = { ...prev }
      delete next[unlinkItem.id]
      return next
    })
    setUnlinkItem(null)
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AppLayout title="Map Program">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
        <span>Ticket Stock</span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-700 font-medium">Map Program</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Map Program</h1>
          <p className="text-sm text-slate-500">เชื่อมโยง PNR กับโปรแกรมทัวร์</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings/countries">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
              <Globe size={13} className="text-slate-400" />
              กำหนดประเทศ
            </span>
          </Link>
          <Link href="/settings/airlines">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
              <Plane size={13} className="text-slate-400" />
              กำหนดสายการบิน
            </span>
          </Link>
          <Link href="/pnr">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
              <Map size={13} className="text-slate-400" />
              ดูสต๊อก PNR
            </span>
          </Link>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <BookOpen size={13} className="text-slate-400" />
            คู่มือการใช้งาน
          </button>
        </div>
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={searchCode}
              onChange={e => { setSearchCode(e.target.value); resetPage() }}
              placeholder="รหัสกรุ๊ป / กลุ่มทัวร์..."
              className="w-full h-8 pl-8 pr-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#05a94f] placeholder-slate-400"
            />
          </div>

          <div className="relative lg:col-span-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={searchName}
              onChange={e => { setSearchName(e.target.value); resetPage() }}
              placeholder="ชื่อรายการทัวร์ / Program Name..."
              className="w-full h-8 pl-8 pr-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#05a94f] placeholder-slate-400"
            />
          </div>

          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); resetPage() }}
            className="w-full h-8 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#05a94f] text-slate-600"
          />

          <div className="flex gap-2">
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); resetPage() }}
              className="flex-1 h-8 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#05a94f] text-slate-600"
            />
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="h-8 px-3 text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
              >
                <X size={12} />
                Clear All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-3">
        {([
          { key: 'all', label: 'ทั้งหมด', count: MOCK_DATA.length },
          { key: 'linked', label: 'เชื่อมโยง PNR แล้ว', count: totalLinked },
          { key: 'unlinked', label: 'ยังไม่เชื่อมโยง PNR', count: totalUnlinked },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); resetPage() }}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              activeTab === tab.key
                ? 'bg-[#05a94f] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
            <span className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[10px] font-bold ${
              activeTab === tab.key ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 w-10">#</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">กลุ่มทัวร์</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">รหัสกรุ๊ป</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 w-12">บัส</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 w-full">ชื่อรายการทัวร์</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">วันที่เดินทาง</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 w-14">ที่นั่ง</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 w-12">ไกด์</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 w-12">จอง</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 w-24 whitespace-nowrap">รายละเอียด</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 w-24">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                        <Map size={22} className="text-slate-400" />
                      </div>
                      <p className="text-slate-400 text-sm">ไม่พบรายการโปรแกรมทัวร์</p>
                      {hasFilters && (
                        <Button size="sm" variant="outline" onClick={clearFilters} icon={<X size={13} />}>
                          Clear Filter
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageItems.map((item, idx) => {
                  const rowNo = (currentPage - 1) * pageSize + idx + 1
                  const link = links[item.id]
                  const isLinked = !!link
                  const isMenuOpen = openMenuId === item.id

                  return (
                    <tr key={item.id} className="hover:bg-green-50 transition-colors">

                      {/* # */}
                      <td className="px-3 py-3 text-center text-xs text-slate-400">{rowNo}</td>

                      {/* กลุ่มทัวร์ */}
                      <td className="px-3 py-3">
                        <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{item.groupTour}</span>
                      </td>

                      {/* รหัสกรุ๊ป */}
                      <td className="px-3 py-3">
                        <span className="font-mono text-xs font-semibold text-[#05a94f] whitespace-nowrap">{item.code}</span>
                      </td>

                      {/* บัส */}
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-slate-100 text-slate-700 text-xs font-bold rounded-md">
                          {item.bus}
                        </span>
                      </td>

                      {/* ชื่อรายการทัวร์ */}
                      <td className="px-3 py-3 max-w-0">
                        <div className="flex flex-col gap-0.5">
                          <p
                            className="text-xs font-medium text-slate-800 truncate"
                            title={item.tourName}
                          >
                            {item.tourName}
                          </p>
                          {!isLinked && (
                            <span className="text-[10px] text-orange-500 font-medium">• ยังไม่เชื่อมโยง PNR</span>
                          )}
                          {isLinked && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-[#05a94f] font-medium">
                              <CheckCircle2 size={9} />
                              PNR: {link.pnrCode}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* วันที่เดินทาง */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-xs text-slate-600">
                          {fmt4(item.dateStart)}
                          {' – '}
                          {fmt4(item.dateEnd)}
                        </span>
                      </td>

                      {/* ที่นั่ง */}
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-semibold text-slate-700">{item.seats}</span>
                      </td>

                      {/* ไกด์ */}
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs text-slate-600">{item.guides}</span>
                      </td>

                      {/* จอง */}
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs text-slate-600">{item.booked > 0 ? item.booked : '–'}</span>
                      </td>

                      {/* รายละเอียด */}
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => setDetailItem(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 transition-colors whitespace-nowrap"
                        >
                          <Info size={11} />
                          รายละเอียด
                        </button>
                      </td>

                      {/* จัดการ */}
                      <td className="px-3 py-3 text-center">
                        <div className="relative inline-flex">
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setOpenMenuId(isMenuOpen ? null : item.id)
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-[#05a94f] rounded-md hover:bg-[#048f43] transition-colors whitespace-nowrap"
                          >
                            จัดการ
                            <MoreVertical size={11} />
                          </button>

                          {isMenuOpen && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                              <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 w-52 divide-y divide-slate-100">

                                {/* เชื่อมโยง PNR */}
                                <button
                                  onClick={() => openLink(item)}
                                  disabled={isLinked}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#05a94f] hover:bg-green-50 font-medium"
                                >
                                  <Link2 size={13} className="flex-shrink-0" />
                                  เชื่อมโยง PNR
                                </button>

                                {/* แก้ไขการเชื่อมโยง */}
                                <button
                                  onClick={() => openLink(item)}
                                  disabled={!isLinked}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Pencil size={13} className="flex-shrink-0 text-slate-400" />
                                  แก้ไขการเชื่อมโยง
                                </button>

                                {/* เปลี่ยน PNR */}
                                <button
                                  onClick={() => openLink(item)}
                                  disabled={!isLinked}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <RotateCcw size={13} className="flex-shrink-0 text-slate-400" />
                                  เปลี่ยน PNR
                                </button>

                                {/* ยกเลิกการเชื่อมโยง */}
                                <button
                                  onClick={() => { setUnlinkItem(item); setOpenMenuId(null) }}
                                  disabled={!isLinked}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Unlink size={13} className="flex-shrink-0" />
                                  ยกเลิกการเชื่อมโยง
                                </button>

                              </div>
                            </>
                          )}
                        </div>
                      </td>

                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ─────────────────────────────────────────────────────── */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <p className="text-xs text-slate-400">
                แสดง {Math.min((currentPage - 1) * pageSize + 1, filtered.length)}–{Math.min(currentPage * pageSize, filtered.length)} จาก {filtered.length} รายการ
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">แสดง</span>
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                  className="h-6 px-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-[#05a94f]"
                >
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="text-xs text-slate-400">รายการ/หน้า</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((p, i, arr) => {
                  const prev = arr[i - 1]
                  return (
                    <span key={p} className="flex items-center">
                      {prev && p - prev > 1 && <span className="w-6 text-center text-xs text-slate-300">…</span>}
                      <button
                        onClick={() => setPage(p)}
                        className={`w-7 h-7 text-xs rounded-md font-medium transition-colors ${
                          p === currentPage
                            ? 'bg-[#05a94f] text-white shadow-sm'
                            : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {p}
                      </button>
                    </span>
                  )
                })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* Modal: รายละเอียด                                                    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        title="รายละเอียดรายการทัวร์"
        size="md"
        footer={<Button variant="outline" onClick={() => setDetailItem(null)}>ปิด</Button>}
      >
        {detailItem && (() => {
          const lnk = links[detailItem.id]
          return (
            <div className="space-y-4">
              {/* Tour Info */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">ข้อมูลโปรแกรมทัวร์</p>
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {[
                    { label: 'กลุ่มทัวร์', val: detailItem.groupTour },
                    { label: 'รหัสกรุ๊ป', val: detailItem.code, mono: true },
                    { label: 'บัส', val: detailItem.bus },
                    { label: 'ชื่อรายการทัวร์', val: detailItem.tourName, wrap: true },
                    { label: 'วันที่เดินทาง', val: `${fmt4(detailItem.dateStart)} – ${fmt4(detailItem.dateEnd)}` },
                    { label: 'ที่นั่ง', val: `${detailItem.seats} ที่นั่ง` },
                    { label: 'ไกด์', val: `${detailItem.guides} คน` },
                    { label: 'จอง', val: detailItem.booked > 0 ? `${detailItem.booked} ที่นั่ง` : '–' },
                  ].map(({ label, val, mono, wrap }) => (
                    <div key={label} className={`flex ${wrap ? 'flex-col gap-1' : 'items-center justify-between'} px-4 py-2.5`}>
                      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
                      <span className={`text-xs font-medium text-slate-800 ${mono ? 'font-mono text-[#05a94f]' : ''} ${wrap ? '' : 'text-right'}`}>
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* PNR Info */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">ข้อมูล PNR</p>
                {lnk ? (
                  <div className="border border-green-200 rounded-xl overflow-hidden divide-y divide-green-100 bg-green-50">
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-slate-500">สถานะ</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#05a94f]">
                        <CheckCircle2 size={12} />
                        เชื่อมโยงแล้ว
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-slate-500">PNR Code</span>
                      <span className="font-mono text-sm font-bold text-[#05a94f] tracking-widest">{lnk.pnrCode}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-slate-500">สถานะ PNR</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{lnk.status}</span>
                    </div>
                  </div>
                ) : (
                  <div className="border border-orange-200 rounded-xl p-4 bg-orange-50 flex items-center gap-3">
                    <AlertTriangle size={16} className="text-orange-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-orange-700">ยังไม่เชื่อมโยง PNR</p>
                      <p className="text-[11px] text-orange-500 mt-0.5">กด "จัดการ" → "เชื่อมโยง PNR" เพื่อเพิ่ม PNR Code</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* Modal: เชื่อมโยง PNR (2-step)                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!linkItem}
        onClose={closeLink}
        title={linkStep === 1 ? 'เชื่อมโยง PNR' : 'ยืนยันการเชื่อมโยง'}
        size="md"
        footer={
          linkStep === 1 ? (
            <>
              <Button variant="outline" onClick={closeLink}>ยกเลิก</Button>
              <Button onClick={validateAndNext} icon={<ChevronRight size={14} />}>ตรวจสอบ</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setLinkStep(1)}>ย้อนกลับ</Button>
              <Button onClick={saveLink} icon={<CheckCircle2 size={14} />}>ยืนยันการเชื่อมโยง</Button>
            </>
          )
        }
      >
        {linkItem && (
          linkStep === 1 ? (
            <div className="space-y-4">
              {/* Info summary */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2.5">
                {[
                  { label: 'รหัสกรุ๊ป', val: linkItem.code, mono: true },
                  { label: 'กลุ่มทัวร์', val: linkItem.groupTour },
                  { label: 'บัส', val: linkItem.bus },
                  { label: 'วันที่เดินทาง', val: `${fmt4(linkItem.dateStart)} – ${fmt4(linkItem.dateEnd)}` },
                  { label: 'ที่นั่งทั้งหมด', val: `${linkItem.seats} ที่นั่ง` },
                ].map(({ label, val, mono }) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
                    <span className={`text-xs font-semibold text-right ${mono ? 'font-mono text-[#05a94f]' : 'text-slate-800'}`}>{val}</span>
                  </div>
                ))}
              </div>

              {/* PNR Code input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  PNR Code จากสายการบิน <span className="text-red-500">*</span>
                </label>
                <input
                  value={linkCode}
                  onChange={e => { setLinkCode(e.target.value.toUpperCase()); setLinkError('') }}
                  placeholder="เช่น ABCDEF"
                  autoFocus
                  className={`w-full h-10 px-4 font-mono text-sm border-2 rounded-lg focus:outline-none tracking-widest uppercase ${
                    linkError ? 'border-red-400 bg-red-50' : 'border-slate-300 focus:border-[#05a94f]'
                  }`}
                />
                {linkError && (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle size={11} />
                    {linkError}
                  </p>
                )}
              </div>

              {/* Warnings */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  ข้อควรระวัง
                </p>
                <ul className="space-y-1">
                  {[
                    'ห้ามใช้ PNR Code ที่มีอยู่แล้วในรายการอื่น',
                    'ตรวจสอบวันเดินทางและสายการบินให้ตรงกันก่อนยืนยัน',
                    'จำนวนที่นั่งคงเหลือต้องเพียงพอต่อความต้องการ',
                  ].map((t, i) => (
                    <li key={i} className="text-[11px] text-amber-600 flex items-start gap-1.5">
                      <span className="flex-shrink-0 mt-0.5">•</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            /* Step 2: Review */
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 p-3.5 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle2 size={16} className="text-[#05a94f] flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">ตรวจสอบข้อมูลก่อนยืนยัน</p>
                  <p className="text-xs text-green-600">หากข้อมูลถูกต้อง กดยืนยันเพื่อบันทึก</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {[
                  { label: 'รหัสกรุ๊ป', val: linkItem.code, mono: true },
                  { label: 'กลุ่มทัวร์', val: linkItem.groupTour },
                  { label: 'บัส', val: linkItem.bus },
                  { label: 'วันที่เดินทาง', val: `${fmt4(linkItem.dateStart)} – ${fmt4(linkItem.dateEnd)}` },
                  { label: 'ที่นั่งทั้งหมด', val: `${linkItem.seats} ที่นั่ง` },
                  { label: 'PNR ที่จะเชื่อมโยง', val: linkCode.trim(), highlight: true },
                ].map(({ label, val, mono, highlight }) => (
                  <div key={label} className={`flex items-center justify-between px-4 py-2.5 ${highlight ? 'bg-green-50' : ''}`}>
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className={`text-xs ${
                      highlight
                        ? 'font-mono font-bold text-[#05a94f] text-base tracking-widest'
                        : mono ? 'font-mono font-semibold text-[#05a94f]' : 'font-medium text-slate-800'
                    }`}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* Modal: ยืนยันยกเลิกการเชื่อมโยง                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!unlinkItem}
        onClose={() => setUnlinkItem(null)}
        title="ยืนยันการยกเลิกเชื่อมโยง"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setUnlinkItem(null)}>ไม่ยกเลิก</Button>
            <Button variant="danger" onClick={saveUnlink}>ยืนยัน ยกเลิกการเชื่อมโยง</Button>
          </>
        }
      >
        {unlinkItem && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-relaxed">
                การยกเลิกเชื่อมโยงจะลบ PNR Code{' '}
                <span className="font-mono font-bold">{links[unlinkItem.id]?.pnrCode}</span>{' '}
                ออกจากรายการนี้
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3.5 space-y-2 divide-y divide-slate-100">
              {[
                { label: 'รหัสกรุ๊ป', val: unlinkItem.code },
                { label: 'กลุ่มทัวร์', val: unlinkItem.groupTour },
                { label: 'บัส', val: unlinkItem.bus },
                { label: 'PNR Code', val: links[unlinkItem.id]?.pnrCode || '–' },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                  <span className="text-xs text-slate-500">{label}</span>
                  <span className="text-xs font-mono font-semibold text-slate-800">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

    </AppLayout>
  )
}
