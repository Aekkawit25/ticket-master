'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { format as dateFmt } from 'date-fns'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import { Badge, StockStatusBadge, TicketTypeBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { cn, formatDateTime, formatNumber, formatStockPeriod } from '@/lib/utils'
import {
  Eye, Pencil, Copy, PlusCircle, FileUp, FileDown,
  XCircle, Lock, Trash2, MoreHorizontal, FileJson,
  CheckCircle, AlertCircle,
} from 'lucide-react'
import type { FlightSeries, TicketType, StockStatus } from '@/types'
import {
  getDemoStocks,
  demoStockToFlightSeries,
  clearAllDemoData,
  exportAllStocksJSON,
  getDemoStockById,
  saveDemoStock,
  deleteDemoStock,
  calculateStockSummary,
  checkPNRDuplicatesInSystem,
  type DemoStock,
  type DemoPNR,
} from '@/lib/demo-storage'

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface TableFilters {
  search?: string
  status?: string
  airline_code?: string
  period_from?: string
  period_to?: string
}

interface TicketTableProps {
  tickets?: FlightSeries[]
  filterType?: TicketType
  filters?: TableFilters
  loading?: boolean
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function SeatBar({ total, balance }: { total: number; balance: number }) {
  const used = total - balance
  const pct = total > 0 ? Math.round((used / total) * 100) : 0
  const color = balance <= 0 ? '#ef4444' : balance / total < 0.2 ? '#f59e0b' : '#05a94f'
  return (
    <div className="flex items-center gap-2">
      <div className="progress-bar w-14 hidden sm:block">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ color }} className="text-xs font-bold">{balance}</span>
      <span className="text-xs text-slate-400">/ {total}</span>
    </div>
  )
}

function MenuBtn({
  icon, label, onClick, disabled, tooltip, danger,
}: {
  icon: ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  tooltip?: string
  danger?: boolean
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={tooltip}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left',
        disabled
          ? 'text-slate-300 cursor-not-allowed'
          : danger
            ? 'text-red-600 hover:bg-red-50'
            : 'text-slate-700 hover:bg-slate-50',
      )}
    >
      {icon} {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────

interface MenuPos { top: number; left: number; openUp: boolean }
interface ToastItem { id: string; message: string; type: 'success' | 'error' }

interface ConfirmDialogState {
  title: string
  message: ReactNode
  confirmLabel: string
  variant: 'danger' | 'warning'
  onConfirm: () => void
}

interface ImportRow {
  rowNum: number
  pnrCode: string
  travelStart: string
  seatTotal: number
  fare: number
  taxType: string
  tax: number
  total: number
  conditionCode: string
  remark: string
  errors: string[]
}

interface ImportModalState {
  stock: DemoStock
  rows: ImportRow[]
}

// ─────────────────────────────────────────────────────────────
// Pure helpers (outside component)
// ─────────────────────────────────────────────────────────────

function withLog(stock: DemoStock, action: string, message: string): DemoStock {
  return {
    ...stock,
    updatedAt: new Date().toISOString(),
    logs: [
      ...stock.logs,
      {
        logId: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        action,
        message,
        createdAt: new Date().toISOString(),
        createdBy: 'System',
      },
    ],
  }
}

function getPerms(ticket: FlightSeries) {
  const s = ticket.status
  const isDemo = ticket.id.startsWith('STK-')
  return {
    canAddPNR:      isDemo && (s === 'Draft' || s === 'Active'),
    canDuplicate:   isDemo,
    canImport:      isDemo && (s === 'Draft' || s === 'Active'),
    canExportExcel: true,
    canClose:       isDemo && (s === 'Draft' || s === 'Active'),
    canCancel:      isDemo && (s === 'Draft' || s === 'Active'),
    canDelete:      isDemo && s === 'Draft',
    canExportJSON:  isDemo,
  }
}

function disabledTip(ticket: FlightSeries, key: keyof ReturnType<typeof getPerms>): string {
  if (!ticket.id.startsWith('STK-')) return 'ใช้ได้เฉพาะ Demo Stock'
  if (ticket.status === 'Closed') return 'Stock ถูกปิดแล้ว'
  if (ticket.status === 'Cancelled') return 'Stock ถูกยกเลิกแล้ว'
  if (key === 'canDelete') return 'ลบได้เฉพาะ Stock สถานะ Draft'
  return 'ไม่สามารถดำเนินการได้'
}

function genStockCode(ticketType: TicketType): string {
  const prefix = ticketType === 'Group' ? 'GRP' : ticketType === 'FIT' ? 'FIT' : 'LND'
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `${prefix}${yy}${mm}${rand}`
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export default function TicketTable({ tickets, filterType, filters, loading }: TicketTableProps) {
  const router = useRouter()
  const importFileRef = useRef<HTMLInputElement>(null)
  const importTargetRef = useRef<string | null>(null)

  // ── State ──────────────────────────────────────────────────
  const [actionOpen, setActionOpen] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
  const [mounted, setMounted] = useState(false)
  const [demoStocks, setDemoStocks] = useState<FlightSeries[]>([])
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [cancelModal, setCancelModal] = useState<{ stockId: string; stockCode: string } | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [importModal, setImportModal] = useState<ImportModalState | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  // ── Effects ────────────────────────────────────────────────
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    refreshDemos()
    const handler = () => refreshDemos()
    window.addEventListener('demo_stock_updated', handler)
    return () => window.removeEventListener('demo_stock_updated', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!actionOpen) return
    const close = () => { setActionOpen(null); setMenuPos(null) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [actionOpen])

  // ── Helpers ────────────────────────────────────────────────
  const refreshDemos = () => {
    setDemoStocks(getDemoStocks().map(demoStockToFlightSeries))
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = `t-${Date.now()}`
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }

  const closeMenu = () => { setActionOpen(null); setMenuPos(null) }

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    if (actionOpen === id) { closeMenu(); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const W = 200
    const H = 340
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < H && rect.top > H
    const rawLeft = rect.right - W
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - W - 8))
    setMenuPos({ top: openUp ? rect.top - H : rect.bottom + 4, left, openUp })
    setActionOpen(id)
  }

  const handleClearDemo = () => {
    if (!confirm('ล้างข้อมูล Demo ทั้งหมด?')) return
    clearAllDemoData()
    setDemoStocks([])
  }

  // ── Action: Add PNR ────────────────────────────────────────
  const handleAddPNR = (ticket: FlightSeries) => {
    closeMenu()
    router.push(`/tickets/${ticket.id}/edit`)
  }

  // ── Action: Duplicate ──────────────────────────────────────
  const handleDuplicate = (ticket: FlightSeries) => {
    closeMenu()
    const stock = getDemoStockById(ticket.id)
    if (!stock) { showToast('Duplicate ใช้ได้เฉพาะ Demo Stock', 'error'); return }

    setConfirmDialog({
      title: 'Duplicate Stock',
      message: (
        <div className="space-y-1 text-sm">
          <p>คัดลอกโครงสร้าง Stock <strong>{stock.stockCode}</strong> "{stock.groupName}" ไปยัง Stock ใหม่ สถานะ Draft?</p>
          <p className="text-slate-500 text-xs">PNR จริง, Seat Used, Booking, TTL จะไม่ถูกคัดลอก</p>
        </div>
      ),
      confirmLabel: 'Duplicate',
      variant: 'warning',
      onConfirm: () => {
        const newCode = genStockCode(stock.ticketType)
        const newId = `STK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const nowISO = new Date().toISOString()
        const newStock: DemoStock = {
          ...stock,
          stockId: newId,
          stockCode: newCode,
          status: 'Draft',
          pnrs: [],
          createdAt: nowISO,
          updatedAt: nowISO,
          summary: calculateStockSummary([]),
          logs: [{
            logId: `LOG-${Date.now()}`,
            action: 'DUPLICATE_STOCK',
            message: `คัดลอกจาก ${stock.stockCode} (${stock.stockId})`,
            createdAt: nowISO,
            createdBy: 'System',
          }],
        }
        saveDemoStock(newStock)
        refreshDemos()
        showToast(`Duplicate สำเร็จ: ${newCode}`, 'success')
        setConfirmDialog(null)
      },
    })
  }

  // ── Action: Import Excel ────────────────────────────────────
  const handleImportExcel = (ticket: FlightSeries) => {
    closeMenu()
    const stock = getDemoStockById(ticket.id)
    if (!stock) { showToast('Import ใช้ได้เฉพาะ Demo Stock', 'error'); return }
    importTargetRef.current = ticket.id
    importFileRef.current?.click()
  }

  const processImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !importTargetRef.current) return

    const stock = getDemoStockById(importTargetRef.current)
    if (!stock) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        // Build system-wide PNR map (excluding this stock so existing PNRs don't self-conflict)
        const systemPNRMap = new Map<string, { stockCode: string; groupName: string }>()
        getDemoStocks().forEach(s => {
          if (s.stockId === stock.stockId) return
          s.pnrs.forEach(p => {
            const code = p.pnrCode.trim().toUpperCase()
            if (code) systemPNRMap.set(code, { stockCode: s.stockCode, groupName: s.groupName })
          })
        })
        // Also include current stock's existing PNRs as in-stock duplicates
        const stockCodes = new Set(
          stock.pnrs.map(p => p.pnrCode.trim().toUpperCase()).filter(Boolean)
        )
        const seenInFile = new Set<string>()

        const rows: ImportRow[] = rawRows.map((row, i) => {
          const pnrCode     = String(row['PNR Code']       ?? row['pnr_code']       ?? '').trim()
          const travelStart = String(row['Travel Start']   ?? row['travel_start']   ?? '').trim()
          const seatTotal   = Number(row['Seat Total']     ?? row['seat_total']     ?? 0)
          const fare        = Number(row['Fare']           ?? row['fare']           ?? 0)
          const taxType     = String(row['Tax Type']       ?? row['tax_type']       ?? 'separate').trim().toLowerCase()
          const tax         = Number(row['Tax Amount']     ?? row['Tax']            ?? row['tax'] ?? 0)
          const total       = fare + (taxType === 'included' ? 0 : tax)
          const condCode    = String(row['Condition Code'] ?? row['condition_code'] ?? '').trim()
          const remark      = String(row['Remark']         ?? row['remark']         ?? '').trim()

          const errors: string[] = []
          if (!pnrCode) {
            errors.push('PNR Code ว่าง')
          } else {
            const upper = pnrCode.toUpperCase()
            if (stockCodes.has(upper)) {
              errors.push('PNR ซ้ำกับที่มีอยู่ใน Stock นี้')
            } else if (systemPNRMap.has(upper)) {
              const { stockCode, groupName } = systemPNRMap.get(upper)!
              errors.push(`PNR ซ้ำกับ Stock ${stockCode} — ${groupName}`)
            }
            if (seenInFile.has(upper)) errors.push('PNR ซ้ำในไฟล์ Excel')
            seenInFile.add(upper)
          }
          if (!travelStart)   errors.push('Travel Start ว่าง')
          if (seatTotal <= 0) errors.push('Seat Total ต้องมากกว่า 0')
          if (fare <= 0)      errors.push('Fare ต้องมากกว่า 0')

          return { rowNum: i + 2, pnrCode, travelStart, seatTotal, fare, taxType, tax, total, conditionCode: condCode, remark, errors }
        })

        setImportModal({ stock, rows })
      } catch {
        showToast('ไม่สามารถอ่านไฟล์ Excel ได้', 'error')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const confirmImport = () => {
    if (!importModal) return
    const { stock, rows } = importModal
    if (rows.some(r => r.errors.length > 0)) return

    const newPNRs: DemoPNR[] = rows.map(row => ({
      pnrId:          `PNR-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      pnrCode:        row.pnrCode,
      dummyPnr:       '',
      pnrType:        'real' as const,
      pnrDisplay:     row.pnrCode,
      travelStart:    row.travelStart,
      travelEnd:      row.travelStart,
      sectorDates:    [],
      seatTotal:      row.seatTotal,
      seatUsed:       0,
      seatBalance:    row.seatTotal,
      fare:           row.fare,
      taxType:        row.taxType,
      tax:            row.tax,
      fareIncludesTax: row.taxType === 'included',
      taxStatus:      (row.taxType === 'included' ? 'included' : row.taxType === 'pending' ? 'pending' : 'completed') as DemoPNR['taxStatus'],
      total:          row.total,
      conditionCode:  row.conditionCode,
      ttlDate:        null,
      ttlTime:        null,
      ttlDateTime:    null,
      status:         'Pending',
      remark:         row.remark,
    }))

    const updatedPNRs = [...stock.pnrs, ...newPNRs]
    const updated = withLog(
      { ...stock, pnrs: updatedPNRs, summary: calculateStockSummary(updatedPNRs) },
      'IMPORT_EXCEL',
      `Import ${rows.length} PNR จาก Excel เข้า ${stock.stockCode}`,
    )
    saveDemoStock(updated)
    refreshDemos()
    showToast(`Import สำเร็จ ${rows.length} PNR เข้า ${stock.stockCode}`, 'success')
    setImportModal(null)
  }

  // ── Action: Export Excel ────────────────────────────────────
  const handleExportExcel = (ticket: FlightSeries) => {
    closeMenu()
    try {
      const wb = XLSX.utils.book_new()
      const stock = ticket.id.startsWith('STK-') ? getDemoStockById(ticket.id) : null

      // Sheet 1: Stock Info
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Series Code', ticket.stock_code],
        ['Type',        ticket.ticket_type],
        ['Series Name', ticket.group_name],
        ['Airline',     ticket.airline_code],
        ['Route',       ticket.route_text ?? ''],
        ['Status',      ticket.status],
        ['Currency',    ticket.currency],
        ['Period',      formatStockPeriod(ticket.period_start, ticket.period_end)],
        ['PNR Count',   ticket.pnr_count   ?? 0],
        ['Seat Total',  ticket.seat_total  ?? 0],
        ['Seat Used',   ticket.seat_used   ?? 0],
        ['Seat Balance', ticket.seat_balance ?? 0],
        ['TTL Date',    ticket.nearest_ttl ? formatDateTime(ticket.nearest_ttl) : ''],
      ]), 'Stock Info')

      if (stock) {
        // Sheet 2: PNRs
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
          ['PNR Code', 'Travel Start', 'Travel End', 'Seat Total', 'Seat Used', 'Seat Balance', 'Fare', 'Tax Type', 'Tax', 'Total', 'Condition', 'TTL DateTime', 'Status', 'Remark'],
          ...stock.pnrs.map(p => [
            p.pnrDisplay || p.pnrCode, p.travelStart, p.travelEnd,
            p.seatTotal, p.seatUsed, p.seatBalance,
            p.fare, p.taxType, p.tax, p.total,
            p.conditionCode, p.ttlDateTime ?? '', p.status, p.remark,
          ]),
        ]), 'PNRs')

        // Sheet 3: Sectors
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
          ['Seq', 'Type', 'Airline', 'Flight No', 'Dep Airport', 'Arr Airport', 'Dep Time', 'Arr Time'],
          ...stock.sectors.map(s => [s.seq, s.sectorType, s.airlineCode, s.flightNo, s.depAirportCode, s.arrAirportCode, s.depTime, s.arrTime]),
        ]), 'Sectors')

        // Sheet 4: Conditions
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
          ['Code', 'Name', 'Stage', 'Payment Type', 'Amount Type', 'Amount', 'Base Date', 'Due Days Before', 'TTL Time'],
          ...stock.conditions.flatMap(sc =>
            sc.condition.stages.map(st => [sc.condition.conditionCode, sc.condition.conditionName, st.stageName, st.paymentType, st.calcType, st.amount, st.dueType, st.dueDays, st.dueTime])
          ),
        ]), 'Conditions')

        const updated = withLog(stock, 'EXPORT_EXCEL', `Export Excel GroupTicket_${stock.stockCode}`)
        saveDemoStock(updated)
        refreshDemos()
      }

      const dateStr = dateFmt(new Date(), 'yyyyMMdd')
      const filename = `GroupTicket_${ticket.stock_code}_${dateStr}.xlsx`
      XLSX.writeFile(wb, filename)
      showToast(`Export Excel: ${filename}`, 'success')
    } catch {
      showToast('Export Excel ล้มเหลว', 'error')
    }
  }

  // ── Action: Close Stock ────────────────────────────────────
  const handleCloseStock = (ticket: FlightSeries) => {
    closeMenu()
    const stock = getDemoStockById(ticket.id)
    if (!stock) { showToast('ไม่พบข้อมูล Stock', 'error'); return }

    const pendingPNRs = stock.pnrs.filter(p => p.status === 'Pending').length
    const seatBal    = stock.summary.seatBalance
    const hasTTL     = stock.pnrs.some(p => p.ttlDateTime && new Date(p.ttlDateTime) > new Date())
    const hasWarnings = pendingPNRs > 0 || seatBal > 0 || hasTTL

    setConfirmDialog({
      title: 'Close Stock',
      message: (
        <div className="space-y-3 text-sm">
          <p>ต้องการปิด Stock <strong>{stock.stockCode}</strong> หรือไม่?
            <span className="block text-xs text-slate-500 mt-0.5">หลังปิดจะไม่สามารถเพิ่มหรือแก้ไข PNR ได้</span>
          </p>
          {hasWarnings && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs space-y-0.5">
              <p className="font-semibold mb-1">รายการที่ยังค้างอยู่:</p>
              {pendingPNRs > 0 && <p>• PNR Pending: {pendingPNRs} รายการ</p>}
              {seatBal > 0    && <p>• Seat Balance: {seatBal} ที่นั่ง</p>}
              {hasTTL         && <p>• มี TTL ที่ยังไม่ครบกำหนด</p>}
            </div>
          )}
        </div>
      ),
      confirmLabel: 'Close Stock',
      variant: 'warning',
      onConfirm: () => {
        const updated = withLog(
          { ...stock, status: 'Closed' as StockStatus },
          'CLOSE_STOCK',
          `ปิด Stock ${stock.stockCode}`,
        )
        saveDemoStock(updated)
        refreshDemos()
        showToast(`Stock ${stock.stockCode} ปิดแล้ว`, 'success')
        setConfirmDialog(null)
      },
    })
  }

  // ── Action: Cancel Stock ───────────────────────────────────
  const handleCancelStock = (ticket: FlightSeries) => {
    closeMenu()
    if (!ticket.id.startsWith('STK-')) { showToast('Cancel ใช้ได้เฉพาะ Demo Stock', 'error'); return }
    setCancelReason('')
    setCancelModal({ stockId: ticket.id, stockCode: ticket.stock_code })
  }

  const confirmCancelStock = () => {
    if (!cancelModal || !cancelReason.trim()) return
    const stock = getDemoStockById(cancelModal.stockId)
    if (!stock) return
    const updated = withLog(
      { ...stock, status: 'Cancelled' as StockStatus },
      'CANCEL_STOCK',
      `ยกเลิก Stock ${stock.stockCode} — เหตุผล: ${cancelReason}`,
    )
    saveDemoStock(updated)
    refreshDemos()
    showToast(`Stock ${stock.stockCode} ถูกยกเลิกแล้ว`, 'success')
    setCancelModal(null)
  }

  // ── Action: Delete ─────────────────────────────────────────
  const handleDelete = (ticket: FlightSeries) => {
    closeMenu()
    const stock = getDemoStockById(ticket.id)
    if (!stock) { showToast('ไม่พบข้อมูล Stock', 'error'); return }
    if (stock.pnrs.some(p => p.seatUsed > 0)) {
      showToast('ไม่สามารถลบ Stock ที่มีการใช้งาน Seat แล้ว', 'error')
      return
    }
    setConfirmDialog({
      title: 'Delete Stock',
      message: (
        <div className="space-y-1 text-sm">
          <p>ต้องการลบ Stock <strong>{stock.stockCode}</strong> "{stock.groupName}" หรือไม่?</p>
          <p className="text-red-500 text-xs">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
        </div>
      ),
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        deleteDemoStock(stock.stockId)
        refreshDemos()
        showToast(`ลบ Stock ${stock.stockCode} สำเร็จ`, 'success')
        setConfirmDialog(null)
      },
    })
  }

  // ── Action: Export JSON ────────────────────────────────────
  const handleExportJSON = (ticket: FlightSeries) => {
    closeMenu()
    const stock = getDemoStockById(ticket.id)
    if (!stock) return
    const blob = new Blob([JSON.stringify(stock, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `GroupTicket_${stock.stockCode}.json`
    a.click()
    URL.revokeObjectURL(url)
    const updated = withLog(stock, 'EXPORT_JSON', `Export JSON GroupTicket_${stock.stockCode}.json`)
    saveDemoStock(updated)
    refreshDemos()
    showToast(`Export JSON: GroupTicket_${stock.stockCode}.json`, 'success')
  }

  // ── Data ────────────────────────────────────────────────────
  const baseTickets: FlightSeries[] = tickets ?? demoStocks
  const filtered   = filterType ? baseTickets.filter(t => t.ticket_type === filterType) : baseTickets
  const demoCount  = demoStocks.filter(d => !filterType || d.ticket_type === filterType).length

  // Apply user search/status/airline/period filters on top of type filter
  const displayTickets = filters ? filtered.filter(t => {
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const matches =
        t.stock_code.toLowerCase().includes(q) ||
        (t.group_name || '').toLowerCase().includes(q) ||
        (t.airline_code || '').toLowerCase().includes(q) ||
        (t.route_text || '').toLowerCase().includes(q)
      if (!matches) return false
    }
    if (filters.status && t.status !== filters.status) return false
    if (filters.airline_code && !(t.airline_code || '').toLowerCase().includes(filters.airline_code.toLowerCase())) return false
    if (filters.period_from && t.period_start && t.period_start < filters.period_from) return false
    if (filters.period_to && t.period_end && t.period_end > filters.period_to) return false
    return true
  }) : filtered

  const activeTicket = displayTickets.find(t => t.id === actionOpen) ?? null
  const perms      = activeTicket ? getPerms(activeTicket) : null

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Demo banner */}
      {demoCount > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
          <span>{demoCount} รายการ Demo (บันทึกใน localStorage)</span>
          <div className="flex gap-2">
            <button onClick={exportAllStocksJSON} className="flex items-center gap-1 hover:text-amber-900">
              <FileJson size={12} /> Export JSON
            </button>
            <button onClick={handleClearDemo} className="flex items-center gap-1 hover:text-red-600 text-red-500">
              <Trash2 size={12} /> Clear Demo Data
            </button>
          </div>
        </div>
      )}

      {/* Hidden import file input */}
      <input
        ref={importFileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={processImportFile}
      />

      <Table>
        <TableHead>
          <tr>
            <Th>Series Code</Th>
            <Th className="hidden md:table-cell">Type</Th>
            <Th>Series Name</Th>
            <Th className="hidden sm:table-cell">Airline</Th>
            <Th className="hidden lg:table-cell">Route</Th>
            <Th className="hidden lg:table-cell" title="ช่วงวันเดินทาง คำนวณจาก Dep Date แรกสุดถึง Dep Date ท้ายสุดของ PNR">Period</Th>
            <Th className="hidden sm:table-cell">PNR</Th>
            <Th>Seat (Bal/Total)</Th>
            <Th className="hidden xl:table-cell">TTL Date</Th>
            <Th>Status</Th>
            <Th>Action</Th>
          </tr>
        </TableHead>
        <TableBody>
          {loading ? (
            <EmptyRow cols={11} message="กำลังโหลด..." />
          ) : displayTickets.length === 0 ? (
            filters && Object.values(filters).some(v => v) ? (
              <EmptyRow cols={11} message="ไม่พบรายการที่ตรงกับ Filter" />
            ) : (
              <tr>
                <td colSpan={11} className="px-3 py-14 text-center">
                  <p className="text-slate-400 text-sm mb-3">
                    {filterType === 'Group'
                      ? 'ยังไม่มีข้อมูล Group Ticket'
                      : filterType === 'FIT'
                        ? 'ยังไม่มีข้อมูล FIT Ticket'
                        : filterType === 'Ticket + Land'
                          ? 'ยังไม่มีข้อมูล Ticket + Land'
                          : 'ยังไม่มีข้อมูล'}
                  </p>
                  {filterType === 'Group' && (
                    <Button size="sm" icon={<PlusCircle size={14} />} onClick={() => router.push('/tickets/add?type=Group')}>Add Group Stock</Button>
                  )}
                  {filterType === 'FIT' && (
                    <Button size="sm" icon={<PlusCircle size={14} />} onClick={() => router.push('/tickets/add?type=FIT')}>Add FIT Stock</Button>
                  )}
                  {filterType === 'Ticket + Land' && (
                    <Button size="sm" icon={<PlusCircle size={14} />} onClick={() => router.push('/tickets/add?type=Ticket+Land')}>Add Ticket+Land Stock</Button>
                  )}
                </td>
              </tr>
            )
          ) : (
            displayTickets.map(t => (
              <TableRow key={t.id}>
                <Td>
                  <Link href={`/tickets/${t.id}`} className="font-mono text-xs font-semibold text-[#05a94f] hover:underline">
                    {t.stock_code}
                  </Link>
                  {t.id.startsWith('STK-') && (
                    <span className="ml-1 inline-flex items-center px-1 py-px text-[9px] font-bold bg-amber-100 text-amber-600 rounded">DEMO</span>
                  )}
                </Td>
                <Td className="hidden md:table-cell">
                  <TicketTypeBadge type={t.ticket_type} />
                </Td>
                <Td>
                  <p className="text-sm font-medium text-slate-800 max-w-[160px] truncate">{t.group_name}</p>
                  <p className="text-xs text-slate-400 hidden lg:block">{t.destination}</p>
                </Td>
                <Td className="hidden sm:table-cell">
                  <Badge variant="gray">{t.airline_code}</Badge>
                </Td>
                <Td className="hidden lg:table-cell font-mono text-xs">{t.route_text || '-'}</Td>
                <Td className="hidden lg:table-cell text-xs">
                  {formatStockPeriod(t.period_start, t.period_end)}
                </Td>
                <Td className="hidden sm:table-cell text-center">
                  <span className="text-sm font-medium">{t.pnr_count ?? 0}</span>
                </Td>
                <Td>
                  <SeatBar total={t.seat_total ?? 0} balance={t.seat_balance ?? 0} />
                </Td>
                <Td className="hidden xl:table-cell text-xs text-slate-700">
                  {t.nearest_ttl ? formatDateTime(t.nearest_ttl) : <span className="text-slate-400">—</span>}
                </Td>
                <Td><StockStatusBadge status={t.status} /></Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" icon={<Eye size={14} />} className="p-1.5" title="View" onClick={() => router.push(`/tickets/${t.id}`)} />
                    {(t.status === 'Draft' || t.status === 'Active') ? (
                      <Button variant="ghost" size="sm" icon={<Pencil size={14} />} className="p-1.5" title="Edit" onClick={() => router.push(`/tickets/${t.id}/edit`)} />
                    ) : (
                      <Button
                        variant="ghost" size="sm" icon={<Pencil size={14} />}
                        className="p-1.5 opacity-30 cursor-not-allowed"
                        title={`ไม่สามารถแก้ไขได้ (${t.status})`}
                        disabled
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<MoreHorizontal size={14} />}
                      className={cn('p-1.5', actionOpen === t.id && 'bg-slate-100')}
                      onClick={e => openMenu(e, t.id)}
                    />
                  </div>
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* ── Portal: Action Dropdown ── */}
      {mounted && activeTicket && menuPos && perms && createPortal(
        <>
          {/* backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={closeMenu}
          />
          {/* dropdown */}
          <div
            style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: 200, zIndex: 9999 }}
            className="bg-white border border-slate-200 rounded-xl shadow-xl py-1 text-sm max-h-80 overflow-y-auto"
          >
            <MenuBtn
              icon={<PlusCircle size={14} className={perms.canAddPNR ? 'text-green-500' : ''} />}
              label="Add PNR"
              onClick={() => handleAddPNR(activeTicket)}
              disabled={!perms.canAddPNR}
              tooltip={!perms.canAddPNR ? disabledTip(activeTicket, 'canAddPNR') : undefined}
            />
            <MenuBtn
              icon={<Copy size={14} />}
              label="Duplicate"
              onClick={() => handleDuplicate(activeTicket)}
              disabled={!perms.canDuplicate}
              tooltip={!perms.canDuplicate ? disabledTip(activeTicket, 'canDuplicate') : undefined}
            />
            <MenuBtn
              icon={<FileUp size={14} />}
              label="Import Excel"
              onClick={() => handleImportExcel(activeTicket)}
              disabled={!perms.canImport}
              tooltip={!perms.canImport ? disabledTip(activeTicket, 'canImport') : undefined}
            />
            <MenuBtn
              icon={<FileDown size={14} />}
              label="Export Excel"
              onClick={() => handleExportExcel(activeTicket)}
            />
            <div className="border-t border-slate-100 my-1" />
            <MenuBtn
              icon={<Lock size={14} />}
              label="Close Stock"
              onClick={() => handleCloseStock(activeTicket)}
              disabled={!perms.canClose}
              tooltip={!perms.canClose ? disabledTip(activeTicket, 'canClose') : undefined}
            />
            <MenuBtn
              icon={<XCircle size={14} />}
              label="Cancel Stock"
              onClick={() => handleCancelStock(activeTicket)}
              disabled={!perms.canCancel}
              tooltip={!perms.canCancel ? disabledTip(activeTicket, 'canCancel') : undefined}
              danger
            />
            {perms.canDelete && (
              <MenuBtn
                icon={<Trash2 size={14} />}
                label="Delete"
                onClick={() => handleDelete(activeTicket)}
                danger
              />
            )}
            {perms.canExportJSON && (
              <MenuBtn
                icon={<FileJson size={14} />}
                label="Export JSON"
                onClick={() => handleExportJSON(activeTicket)}
              />
            )}
          </div>
        </>,
        document.body,
      )}

      {/* ── Portal: Confirm Dialog ── */}
      {mounted && confirmDialog && createPortal(
        <Modal
          open
          onClose={() => setConfirmDialog(null)}
          title={confirmDialog.title}
          size="sm"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirmDialog(null)}>ยกเลิก</Button>
              <Button
                variant={confirmDialog.variant === 'danger' ? 'danger' : 'primary'}
                size="sm"
                onClick={confirmDialog.onConfirm}
                className={confirmDialog.variant === 'warning' ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
              >
                {confirmDialog.confirmLabel}
              </Button>
            </>
          }
        >
          <div className="text-slate-700">{confirmDialog.message}</div>
        </Modal>,
        document.body,
      )}

      {/* ── Portal: Cancel Reason Modal ── */}
      {mounted && cancelModal && createPortal(
        <Modal
          open
          onClose={() => setCancelModal(null)}
          title="Cancel Stock"
          size="sm"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setCancelModal(null)}>ปิด</Button>
              <Button
                variant="danger"
                size="sm"
                onClick={confirmCancelStock}
                disabled={!cancelReason.trim()}
              >
                ยืนยันการยกเลิก
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <p>ยกเลิก Stock <strong>{cancelModal.stockCode}</strong></p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                เหตุผลการยกเลิก <span className="text-red-500">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                rows={3}
                placeholder="ระบุเหตุผล..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f] resize-none"
              />
            </div>
          </div>
        </Modal>,
        document.body,
      )}

      {/* ── Portal: Import Review Modal ── */}
      {mounted && importModal && createPortal(
        <Modal
          open
          onClose={() => setImportModal(null)}
          title={`Import Excel → ${importModal.stock.stockCode}`}
          size="lg"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setImportModal(null)}>ยกเลิก</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={confirmImport}
                disabled={importModal.rows.some(r => r.errors.length > 0) || importModal.rows.length === 0}
              >
                Import {importModal.rows.length} PNR
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {importModal.rows.some(r => r.errors.length > 0) && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
                <AlertCircle size={14} />
                พบข้อผิดพลาด {importModal.rows.filter(r => r.errors.length > 0).length} แถว — กรุณาแก้ไขไฟล์ก่อน Import
              </div>
            )}
            {importModal.rows.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">ไม่พบข้อมูลในไฟล์ Excel</p>
            )}
            {importModal.rows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      {['แถว', 'PNR Code', 'Travel Start', 'Seat', 'Fare', 'Tax', 'Total', 'Condition', 'ข้อผิดพลาด'].map(h => (
                        <th key={h} className="border-b border-slate-200 px-2 py-1.5 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importModal.rows.map((row, i) => (
                      <tr key={i} className={row.errors.length > 0 ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="border-b border-slate-100 px-2 py-1 text-slate-400">{row.rowNum}</td>
                        <td className="border-b border-slate-100 px-2 py-1 font-mono font-medium">{row.pnrCode || '—'}</td>
                        <td className="border-b border-slate-100 px-2 py-1">{row.travelStart || '—'}</td>
                        <td className="border-b border-slate-100 px-2 py-1 text-right">{row.seatTotal}</td>
                        <td className="border-b border-slate-100 px-2 py-1 text-right">{formatNumber(row.fare)}</td>
                        <td className="border-b border-slate-100 px-2 py-1 text-right">{formatNumber(row.tax)}</td>
                        <td className="border-b border-slate-100 px-2 py-1 text-right font-medium">{formatNumber(row.total)}</td>
                        <td className="border-b border-slate-100 px-2 py-1">{row.conditionCode || '-'}</td>
                        <td className="border-b border-slate-100 px-2 py-1 text-red-600">{row.errors.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-slate-400">
              รูปแบบคอลัมน์: <span className="font-mono">PNR Code, Travel Start, Seat Total, Fare, Tax Type (included/separate/pending), Tax Amount, Condition Code, Remark</span>
            </p>
          </div>
        </Modal>,
        document.body,
      )}

      {/* ── Portal: Toast Notifications ── */}
      {mounted && toasts.length > 0 && createPortal(
        <div className="fixed bottom-5 right-5 z-[10000] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 320 }}>
          {toasts.map(t => (
            <div
              key={t.id}
              className={cn(
                'flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white',
                t.type === 'success' ? 'bg-emerald-500' : 'bg-red-500',
              )}
            >
              {t.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
