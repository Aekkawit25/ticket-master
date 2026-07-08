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
import { PlusCircle, Upload, Download, FileDown, Trash2, Ticket, Users, Globe } from 'lucide-react'
import { downloadExcelTemplate } from '@/lib/excel-template'
import { parseExcelImport } from '@/lib/excel-import'
import { getDemoStocks, clearDemoStocksByType, clearAllDemoData } from '@/lib/demo-storage'
import type { TicketType } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface FilterState {
  search: string; status: string; airline_code: string
  ticket_type: string; period_from: string; period_to: string
}

export interface TicketStockPageProps {
  fixedTicketType: TicketType | null  // null = All Tickets
}

// ── Config per type ────────────────────────────────────────────────────────────

interface PageConfig {
  title: string
  subtitle: string
  addLabel: string
  addPath: string | null   // null = show type-selector modal
  clearLabel: string
  clearNote: string
}

function getConfig(t: TicketType | null): PageConfig {
  if (t === 'Group') return {
    title: 'Group Tickets',
    subtitle: 'Stock ตั๋วแบบ Group — ต้องมีอย่างน้อย 2 Sector (Departure + Arrival)',
    addLabel: 'Add Group Stock',
    addPath: '/tickets/add?type=Group',
    clearLabel: 'ล้างข้อมูล Group',
    clearNote: 'ข้อมูลประเภทอื่น (FIT / Ticket + Land) จะไม่ถูกลบ',
  }
  if (t === 'FIT') return {
    title: 'FIT Tickets',
    subtitle: 'Free Individual Traveler — รองรับ One-way, Round-trip, Multi-city',
    addLabel: 'Add FIT Stock',
    addPath: '/tickets/add?type=FIT',
    clearLabel: 'ล้างข้อมูล FIT',
    clearNote: 'ข้อมูลประเภทอื่น (Group / Ticket + Land) จะไม่ถูกลบ',
  }
  if (t === 'Ticket + Land') return {
    title: 'Ticket + Land',
    subtitle: 'ตั๋วเครื่องบินพร้อม Land Package — ต้องมีอย่างน้อย 2 Sector',
    addLabel: 'Add Ticket + Land',
    addPath: '/tickets/add?type=Ticket+Land',
    clearLabel: 'ล้างข้อมูล Ticket+Land',
    clearNote: 'ข้อมูลประเภทอื่น (Group / FIT) จะไม่ถูกลบ',
  }
  return {
    title: 'All Tickets',
    subtitle: 'Stock ตั๋วเครื่องบินทุกประเภท',
    addLabel: 'Add Stock',
    addPath: null,
    clearLabel: 'ล้างข้อมูลทั้งหมด',
    clearNote: '',
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TicketStockPage({ fixedTicketType }: TicketStockPageProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const cfg     = getConfig(fixedTicketType)
  const isAll   = fixedTicketType === null

  const [filters, setFilters] = useState<FilterState>({
    search: '', status: '', airline_code: '', ticket_type: '', period_from: '', period_to: '',
  })
  const [typeModal,    setTypeModal]    = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [stockCount,   setStockCount]   = useState(0)
  const [counts,       setCounts]       = useState({ group: 0, fit: 0, land: 0 })

  const refreshCounts = () => {
    const all = getDemoStocks()
    if (fixedTicketType) {
      setStockCount(all.filter(s => s.ticketType === fixedTicketType).length)
    } else {
      const g = all.filter(s => s.ticketType === 'Group').length
      const f = all.filter(s => s.ticketType === 'FIT').length
      const l = all.filter(s => s.ticketType === 'Ticket + Land').length
      setCounts({ group: g, fit: f, land: l })
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
    // Req #12/#13: enforce ticket type for type-specific pages
    if (fixedTicketType && result.stockInfo) {
      result.stockInfo.ticketType = fixedTicketType
    }
    // Req #14: All Tickets page — validate ticketType exists
    if (!fixedTicketType && result.stockInfo) {
      const t = result.stockInfo.ticketType
      const valid: TicketType[] = ['Group', 'FIT', 'Ticket + Land']
      if (!valid.includes(t as TicketType)) {
        alert('ไม่พบ Ticket Type ที่ถูกต้องในไฟล์ Excel\nกรุณาระบุ GROUP / FIT / TICKET_LAND ในคอลัมน์ ticket_type ของ Sheet STOCK_INFO')
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
    } else {
      setTypeModal(true)
    }
  }

  // ── Clear Demo ────────────────────────────────────────────────
  const doClear = () => {
    if (fixedTicketType) {
      clearDemoStocksByType(fixedTicketType)
    } else {
      clearAllDemoData()
    }
    setConfirmClear(false)
    refreshCounts()
  }

  return (
    <AppLayout title={cfg.title}>

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
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

      {/* ── Stat cards (All Tickets only) ── */}
      {isAll && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard title="Group"       value={counts.group} icon={<Users  size={18} />} color="#05a94f" />
          <StatCard title="FIT"         value={counts.fit}   icon={<Ticket size={18} />} color="#3b82f6" />
          <StatCard title="Ticket+Land" value={counts.land}  icon={<Globe  size={18} />} color="#8b5cf6" />
        </div>
      )}

      {/* ── Filter ── */}
      <TicketFilter onFilter={setFilters} showTypeFilter={isAll} />

      {/* ── Table (req #10: same columns; Type column hidden on type-specific pages via TicketTable) ── */}
      <TicketTable
        filterType={fixedTicketType ?? undefined}
        filters={filters}
      />

      {/* ── Select Type Modal (All Tickets → Add) ── */}
      <SelectTicketTypeModal open={typeModal} onClose={() => setTypeModal(false)} />

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
          ต้องการลบ Stock{fixedTicketType ? ` ประเภท ${fixedTicketType}` : ''} ทั้งหมด{' '}
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
