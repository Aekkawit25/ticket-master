'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import TicketTable from '@/components/tickets/TicketTable'
import TicketFilter from '@/components/tickets/TicketFilter'
import { SelectTicketTypeModal } from '@/components/tickets/SelectTicketTypeModal'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { StatCard } from '@/components/ui/card'
import { PlusCircle, Upload, Download, FileDown, Trash2, Ticket, Users, Globe, ChevronRight, List } from 'lucide-react'
import { downloadExcelTemplate } from '@/lib/excel-template'
import { parseExcelImport } from '@/lib/excel-import'
import { getDemoStocks, clearDemoStocksByType, clearDemoStocksByGroupType, clearAllDemoData } from '@/lib/demo-storage'
import type { TicketType, GroupType } from '@/types'
import { getStockTypeConfig, STOCK_TYPE_CONFIG } from '@/lib/stock-type-config'

// ── Types ──────────────────────────────────────────────────────────────────────

interface FilterState {
  search: string; status: string; airline_code: string
  ticket_type: string; period_from: string; period_to: string
}

export interface TicketStockPageProps {
  fixedTicketType: TicketType | null
  fixedGroupType?: GroupType | null   // only relevant when fixedTicketType === 'Group'
}

// ── Config per type ────────────────────────────────────────────────────────────

interface PageConfig {
  title: string
  breadcrumb: string[]
  subtitle: string
  addLabel: string
  addPath: string | null   // null = show type-selector / group-type modal
  clearLabel: string
  clearNote: string
  searchPlaceholder: string
}

function getConfig(t: TicketType | null, g?: GroupType | null): PageConfig {
  // Group-specific pages — pull everything from central config
  const stConfig = getStockTypeConfig(t ?? '', g)
  if (stConfig) return {
    title: stConfig.pageTitle,
    breadcrumb: stConfig.breadcrumb,
    subtitle: stConfig.subtitle,
    addLabel: stConfig.addButtonText,
    addPath: stConfig.addPath,
    clearLabel: stConfig.clearButtonText,
    clearNote: stConfig.clearNote,
    searchPlaceholder: stConfig.searchPlaceholder,
  }
  // All Group (no specific subtype)
  if (t === 'Group') return {
    title: 'All Group Stocks',
    breadcrumb: ['Ticket Stock', 'All Group'],
    subtitle: 'Stock ตั๋วแบบ Group ทั้งหมด — Series และ Ad Hoc',
    addLabel: 'Add Group Stock',
    addPath: null,
    clearLabel: 'ล้างข้อมูล Group',
    clearNote: 'ข้อมูลประเภทอื่น (FIT / Ticket Only) จะไม่ถูกลบ',
    searchPlaceholder: 'ค้นหา Stock Code, Name, PNR...',
  }
  // All Tickets
  return {
    title: 'All Tickets',
    breadcrumb: ['Ticket Stock', 'All Tickets'],
    subtitle: 'Stock ตั๋วเครื่องบินทุกประเภท',
    addLabel: 'Add Stock',
    addPath: '/tickets/add',
    clearLabel: 'ล้างข้อมูลทั้งหมด',
    clearNote: '',
    searchPlaceholder: 'ค้นหา Stock Code, Name, PNR...',
  }
}

// ── Select Group Type Modal ────────────────────────────────────────────────────

function SelectGroupTypeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()

  const options = [
    {
      label: 'Series',
      description: 'เส้นทางและวันเดินทางกำหนดแน่นอน',
      detail: 'เหมาะสำหรับซีรีส์ที่มีการวางแผนล่วงหน้า เช่น Sweden Aurora Mar 26',
      icon: <List size={22} />,
      color: '#05a94f',
      bg: '#f0fdf4',
      href: '/tickets/add?stockType=SERIES',
    },
    {
      label: 'Ad Hoc',
      description: 'จัดกรุ๊ปพิเศษตามสถานการณ์',
      detail: 'เหมาะสำหรับกรุ๊ปที่จัดขึ้นเป็นกรณีพิเศษ ไม่ได้อยู่ใน Series ปกติ',
      icon: <Users size={22} />,
      color: '#f59e0b',
      bg: '#fffbeb',
      href: '/tickets/add?stockType=AD_HOC',
    },
  ]

  return (
    <Modal open={open} onClose={onClose} title="เลือกประเภท Group Stock" size="lg">
      <p className="text-sm text-slate-500 mb-5">กรุณาเลือกประเภทของ Group ที่ต้องการสร้าง</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {options.map(opt => (
          <div
            key={opt.label}
            className="flex flex-col rounded-xl border-2 border-slate-200 p-5 cursor-pointer transition-all duration-150 hover:shadow-lg"
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLDivElement).style.borderColor = opt.color
              ;(e.currentTarget as HTMLDivElement).style.backgroundColor = opt.bg
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLDivElement).style.borderColor = ''
              ;(e.currentTarget as HTMLDivElement).style.backgroundColor = ''
            }}
            onClick={() => { onClose(); router.push(opt.href) }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 shrink-0"
              style={{ background: opt.bg, color: opt.color, border: `1.5px solid ${opt.color}30` }}
            >
              {opt.icon}
            </div>
            <h4 className="text-base font-bold text-slate-800 mb-1">{opt.label}</h4>
            <p className="text-sm text-slate-600 mb-1">{opt.description}</p>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">{opt.detail}</p>
            <button
              className="mt-auto w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: opt.color }}
              onClick={e => { e.stopPropagation(); onClose(); router.push(opt.href) }}
            >
              เลือกประเภทนี้
              <ChevronRight size={14} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TicketStockPage({ fixedTicketType, fixedGroupType }: TicketStockPageProps) {
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const cfg     = getConfig(fixedTicketType, fixedGroupType)
  const isAll          = fixedTicketType === null
  const isAllGroup     = fixedTicketType === 'Group' && (fixedGroupType === null || fixedGroupType === undefined)
  const isGroupSpecific = fixedTicketType === 'Group' && !!fixedGroupType

  const [filters, setFilters] = useState<FilterState>({
    search: '', status: '', airline_code: '', ticket_type: '', period_from: '', period_to: '',
  })
  const [typeModal,      setTypeModal]      = useState(false)
  const [groupTypeModal, setGroupTypeModal] = useState(false)
  const [confirmClear,   setConfirmClear]   = useState(false)
  const [stockCount,     setStockCount]     = useState(0)
  const [counts,         setCounts]         = useState({ group: 0, series: 0, adhoc: 0, fit: 0, land: 0 })

  const refreshCounts = () => {
    const all = getDemoStocks()
    if (isGroupSpecific) {
      setStockCount(all.filter(s => s.ticketType === 'Group' && s.groupType === fixedGroupType).length)
    } else if (isAllGroup) {
      setStockCount(all.filter(s => s.ticketType === 'Group').length)
      const series = all.filter(s => s.ticketType === 'Group' && s.groupType === 'SERIES').length
      const adhoc  = all.filter(s => s.ticketType === 'Group' && s.groupType === 'ADHOC').length
      setCounts(prev => ({ ...prev, series, adhoc, group: series + adhoc }))
    } else if (fixedTicketType) {
      setStockCount(all.filter(s => s.ticketType === fixedTicketType).length)
    } else {
      const series = all.filter(s => s.ticketType === 'Group' && s.groupType === 'SERIES').length
      const adhoc  = all.filter(s => s.ticketType === 'Group' && s.groupType === 'ADHOC').length
      const fit    = all.filter(s => s.ticketType === 'FIT').length
      const land   = all.filter(s => s.ticketType === 'Ticket + Land').length
      setCounts(prev => ({ ...prev, series, adhoc, group: series + adhoc, fit, land }))
      setStockCount(all.length)
    }
  }

  useEffect(() => {
    refreshCounts()
    const handler = () => refreshCounts()
    window.addEventListener('demo_stock_updated', handler)
    return () => window.removeEventListener('demo_stock_updated', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Import Excel ──────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await parseExcelImport(file)
    if (fixedTicketType && result.stockInfo) {
      result.stockInfo.ticketType = fixedTicketType
    }
    // Enforce groupType on type-specific group pages
    if (isGroupSpecific && result.stockInfo) {
      result.stockInfo.groupType = fixedGroupType as string
    }
    // All Tickets: validate ticketType
    if (!fixedTicketType && result.stockInfo) {
      const t = result.stockInfo.ticketType
      const valid: TicketType[] = ['Group', 'FIT', 'Ticket + Land']
      if (!valid.includes(t as TicketType)) {
        alert('ไม่พบ Ticket Type ที่ถูกต้องในไฟล์ Excel\nกรุณาระบุ GROUP / FIT / TICKET_ONLY ในคอลัมน์ ticket_type ของ Sheet STOCK_INFO')
        e.target.value = ''
        return
      }
    }
    // All Group Tickets: validate groupType
    if (isAllGroup && result.stockInfo) {
      const gt = result.stockInfo.groupType
      if (!gt || !['SERIES', 'ADHOC'].includes(gt)) {
        alert('ไม่พบ Group Type ที่ถูกต้องในไฟล์ Excel\nกรุณาระบุ SERIES หรือ ADHOC ในคอลัมน์ group_type')
        e.target.value = ''
        return
      }
    }
    sessionStorage.setItem('ticket_import_review_data', JSON.stringify(result))
    router.push('/tickets/import-review')
    e.target.value = ''
  }

  // ── Add Stock ─────────────────────────────────────────────────
  const handleAdd = () => {
    if (cfg.addPath) {
      router.push(cfg.addPath)
    } else if (isAllGroup) {
      setGroupTypeModal(true)
    } else {
      setTypeModal(true)
    }
  }

  // ── Clear Demo ────────────────────────────────────────────────
  const doClear = () => {
    if (isGroupSpecific) {
      clearDemoStocksByGroupType(fixedGroupType!)
    } else if (fixedTicketType) {
      clearDemoStocksByType(fixedTicketType)
    } else {
      clearAllDemoData()
    }
    setConfirmClear(false)
    refreshCounts()
  }

  // ── Breadcrumb ────────────────────────────────────────────────
  const breadcrumb = cfg.breadcrumb

  return (
    <AppLayout title={cfg.title}>

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          {/* Breadcrumb */}
          {breadcrumb.length > 1 && (
            <div className="flex items-center gap-1 text-xs text-slate-400 mb-1">
              {breadcrumb.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={10} />}
                  <span className={i === breadcrumb.length - 1 ? 'text-slate-600 font-medium' : ''}>{crumb}</span>
                </span>
              ))}
            </div>
          )}
          <h1 className="text-lg font-bold text-slate-900">{cfg.title}</h1>
          <p className="text-sm text-slate-500">{cfg.subtitle}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Template Excel — type-specific pages only */}
          {fixedTicketType && (
            <Button variant="outline" size="sm" icon={<FileDown size={14} />}
              onClick={() => downloadExcelTemplate(fixedTicketType)}>
              Template Excel
            </Button>
          )}
          {/* Import Excel */}
          <Button variant="outline" size="sm" icon={<Upload size={14} />}
            onClick={() => fileRef.current?.click()}>
            Import Excel
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          {/* Export */}
          <Button variant="outline" size="sm" icon={<Download size={14} />}
            onClick={() => router.push('/import-export/export')}>
            Export
          </Button>
          {/* Clear Demo */}
          <Button
            variant="outline" size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => setConfirmClear(true)}
            disabled={stockCount === 0}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            {cfg.clearLabel}
          </Button>
          {/* Add Stock */}
          <Button size="sm" icon={<PlusCircle size={14} />} onClick={handleAdd}>
            {cfg.addLabel}
          </Button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      {isAll && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard title="Series"      value={counts.series} icon={<List   size={18} />} color="#05a94f" />
          <StatCard title="Ad Hoc"      value={counts.adhoc}  icon={<Users  size={18} />} color="#f59e0b" />
          <StatCard title="FIT"         value={counts.fit}    icon={<Ticket size={18} />} color="#3b82f6" />
          <StatCard title="Ticket Only" value={counts.land}   icon={<Globe  size={18} />} color="#8b5cf6" />
        </div>
      )}
      {isAllGroup && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard title="Group Series" value={counts.series} icon={<List  size={18} />} color="#05a94f" />
          <StatCard title="Group Ad Hoc" value={counts.adhoc}  icon={<Users size={18} />} color="#f59e0b" />
        </div>
      )}

      {/* ── Filter ── */}
      <TicketFilter onFilter={setFilters} showTypeFilter={isAll} searchPlaceholder={cfg.searchPlaceholder} />

      {/* ── Table ── */}
      <TicketTable
        filterType={fixedTicketType ?? undefined}
        filterGroupType={fixedGroupType ?? undefined}
        filters={filters}
      />

      {/* ── Select Type Modal (All Tickets → Add) ── */}
      <SelectTicketTypeModal open={typeModal} onClose={() => setTypeModal(false)} />

      {/* ── Select Group Type Modal (All Group Tickets → Add) ── */}
      <SelectGroupTypeModal open={groupTypeModal} onClose={() => setGroupTypeModal(false)} />

      {/* ── Clear Confirm Modal ── */}
      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title={cfg.clearLabel}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>ยกเลิก</Button>
            <Button variant="danger" onClick={doClear}>{cfg.clearLabel}</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          ต้องการลบ Stock{fixedGroupType ? ` (${fixedGroupType === 'SERIES' ? 'Group Series' : 'Group Ad Hoc'})` : fixedTicketType ? ` ประเภท ${fixedTicketType}` : ''} ทั้งหมด{' '}
          <strong className="text-red-600">{stockCount} รายการ</strong>{' '}
          ออกจาก localStorage ใช่หรือไม่?
        </p>
        {cfg.clearNote && (
          <p className="text-xs text-slate-500 mt-2">{cfg.clearNote}</p>
        )}
        <p className="text-xs text-red-600 mt-2">การกระทำนี้ไม่สามารถยกเลิกได้</p>
      </Modal>

    </AppLayout>
  )
}
