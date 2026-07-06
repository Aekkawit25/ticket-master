'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHead,
  TableBody,
  Th,
  Td,
  TableRow,
  EmptyRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/card'
import { formatDate, formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  Search,
  X,
  Plus,
  FileText,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  FileCheck,
  XCircle,
} from 'lucide-react'
import {
  getRequisitions,
  REQUISITION_STATUS_INFO,
  type DemoRequisition,
  type RequisitionStatus,
  type RequisitionPaymentStatus,
  type ReqSourceType,
} from '@/lib/requisition-storage'

const PAGE_SIZE = 20

const PAYMENT_STATUS_LABELS: Record<RequisitionPaymentStatus, { label: string; variant: 'yellow' | 'orange' | 'green' }> = {
  UNPAID:         { label: 'รอชำระ',       variant: 'yellow' },
  PARTIALLY_PAID: { label: 'ชำระบางส่วน', variant: 'orange' },
  PAID:           { label: 'ชำระแล้ว',     variant: 'green' },
}

export default function RequisitionsPage() {
  const router = useRouter()

  const [allData, setAllData] = useState<DemoRequisition[]>([])
  const [search, setSearch] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [filterStatus, setFilterStatus] = useState<RequisitionStatus | ''>('')
  const [filterPayment, setFilterPayment] = useState<RequisitionPaymentStatus | ''>('')
  const [filterSource, setFilterSource] = useState<ReqSourceType | ''>('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    setAllData(getRequisitions())
  }, [])

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total    = allData.length
    const draft    = allData.filter(r => r.documentStatus === 'DRAFT').length
    const pending  = allData.filter(r => r.documentStatus === 'PENDING_APPROVAL').length
    const approved = allData.filter(r => r.documentStatus === 'APPROVED').length
    const paid     = allData.filter(r => r.documentStatus === 'PAID').length
    return { total, draft, pending, approved, paid }
  }, [allData])

  // ── Filtered list ──────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allData.filter(r => {
      if (q) {
        const inNo      = (r.requisitionNo ?? '').toLowerCase().includes(q)
        const inPNR     = r.pnrDisplays.some(p => p.toLowerCase().includes(q))
        const inSeries  = (r.seriesCode ?? '').toLowerCase().includes(q)
        const inTitle   = r.documentTitle.toLowerCase().includes(q)
        const inSupplier= (r.supplierSnapshot?.supplierName ?? '').toLowerCase().includes(q)
        if (!inNo && !inPNR && !inSeries && !inTitle && !inSupplier) return false
      }
      if (filterStatus  && r.documentStatus !== filterStatus)  return false
      if (filterPayment && r.paymentStatus  !== filterPayment) return false
      if (filterSource  && r.sourceType     !== filterSource)  return false
      return true
    })
  }, [allData, search, filterStatus, filterPayment, filterSource])

  // ── Pagination ─────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const hasFilter = filterStatus !== '' || filterPayment !== '' || filterSource !== ''

  function clearFilters() {
    setFilterStatus('')
    setFilterPayment('')
    setFilterSource('')
    setSearch('')
  }

  function handleSearchChange(v: string) {
    setSearch(v)
    setPage(1)
  }

  function handleFilterChange() {
    setPage(1)
  }

  return (
    <AppLayout title="ใบเบิก">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">ใบเบิก</h1>
          <p className="text-sm text-slate-500">รายการใบเบิกทั้งหมด</p>
        </div>
        <Button
          icon={<Plus size={14} />}
          onClick={() => router.push('/requisitions/create')}
        >
          สร้างใบเบิก
        </Button>
      </div>

      {/* ── Stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        <StatCard
          title="ทั้งหมด"
          value={formatNumber(stats.total)}
          icon={<FileText size={18} />}
          color="#05a94f"
        />
        <StatCard
          title="ฉบับร่าง"
          value={formatNumber(stats.draft)}
          icon={<Clock size={18} />}
          color="#64748b"
        />
        <StatCard
          title="รออนุมัติ"
          value={formatNumber(stats.pending)}
          icon={<AlertCircle size={18} />}
          color="#f97316"
        />
        <StatCard
          title="อนุมัติแล้ว"
          value={formatNumber(stats.approved)}
          icon={<CheckCircle2 size={18} />}
          color="#3b82f6"
        />
        <StatCard
          title="ชำระแล้ว"
          value={formatNumber(stats.paid)}
          icon={<FileCheck size={18} />}
          color="#05a94f"
        />
      </div>

      {/* ── Search + Filter bar ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4">
        <div className="p-3 flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="ค้นหาเลขที่ใบเบิก, PNR, Series..."
              className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
            />
            {search && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <Button
            variant={showFilter || hasFilter ? 'primary' : 'outline'}
            size="sm"
            icon={<SlidersHorizontal size={14} />}
            onClick={() => setShowFilter(v => !v)}
          >
            ตัวกรอง
            {hasFilter && (
              <span className="ml-1 bg-white/30 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {[filterStatus, filterPayment, filterSource].filter(Boolean).length}
              </span>
            )}
          </Button>

          {hasFilter && (
            <Button variant="ghost" size="sm" icon={<XCircle size={14} />} onClick={clearFilters}>
              ล้างตัวกรอง
            </Button>
          )}
        </div>

        {/* Filter dropdowns */}
        {showFilter && (
          <div className="px-3 pb-3 border-t border-slate-100 pt-3 flex flex-wrap gap-2">
            {/* สถานะเอกสาร */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">สถานะเอกสาร</label>
              <select
                value={filterStatus}
                onChange={e => {
                  setFilterStatus(e.target.value as RequisitionStatus | '')
                  handleFilterChange()
                }}
                className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f] bg-white"
              >
                <option value="">ทั้งหมด</option>
                {(Object.keys(REQUISITION_STATUS_INFO) as RequisitionStatus[]).map(s => (
                  <option key={s} value={s}>
                    {REQUISITION_STATUS_INFO[s].label}
                  </option>
                ))}
              </select>
            </div>

            {/* สถานะการชำระ */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">สถานะการชำระ</label>
              <select
                value={filterPayment}
                onChange={e => {
                  setFilterPayment(e.target.value as RequisitionPaymentStatus | '')
                  handleFilterChange()
                }}
                className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f] bg-white"
              >
                <option value="">ทั้งหมด</option>
                <option value="UNPAID">รอชำระ</option>
                <option value="PARTIALLY_PAID">ชำระบางส่วน</option>
                <option value="PAID">ชำระแล้ว</option>
              </select>
            </div>

            {/* แหล่งที่มา */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">แหล่งที่มา</label>
              <select
                value={filterSource}
                onChange={e => {
                  setFilterSource(e.target.value as ReqSourceType | '')
                  handleFilterChange()
                }}
                className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f] bg-white"
              >
                <option value="">ทั้งหมด</option>
                <option value="PNR">PNR</option>
                <option value="GENERAL">ทั่วไป</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────── */}
      {filtered.length === 0 && !search && !hasFilter ? (
        // Empty state (no data at all)
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-16 flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
            <FileText size={28} className="text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-slate-600 font-medium">ยังไม่มีใบเบิก</p>
            <p className="text-slate-400 text-sm mt-1">เริ่มต้นสร้างใบเบิกใหม่ได้เลย</p>
          </div>
          <Button icon={<Plus size={14} />} onClick={() => router.push('/requisitions/create')}>
            สร้างใบเบิก
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <TableHead>
              <tr>
                <Th>เลขที่ใบเบิก</Th>
                <Th>วันที่เอกสาร</Th>
                <Th>Series</Th>
                <Th>PNR</Th>
                <Th>Supplier</Th>
                <Th>ครบกำหนด</Th>
                <Th className="text-right">ยอดสุทธิ</Th>
                <Th>สกุลเงิน</Th>
                <Th>สถานะเอกสาร</Th>
                <Th>สถานะชำระ</Th>
                <Th>ผู้สร้าง</Th>
                <Th className="text-center">ดู</Th>
              </tr>
            </TableHead>
            <TableBody>
              {pageData.length === 0 ? (
                <EmptyRow cols={12} message="ไม่พบข้อมูลที่ตรงกับการค้นหา" />
              ) : (
                pageData.map(req => (
                  <RequisitionRow
                    key={req.requisitionId}
                    req={req}
                    onView={() => router.push(`/requisitions/${req.requisitionId}`)}
                  />
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                แสดง {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} จาก {filtered.length} รายการ
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ChevronLeft size={14} />}
                  disabled={currentPage <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                />
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => Math.abs(p - currentPage) <= 2)
                  .map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        'w-7 h-7 rounded-md text-xs font-medium transition-colors',
                        p === currentPage
                          ? 'bg-[#05a94f] text-white'
                          : 'hover:bg-slate-100 text-slate-600',
                      )}
                    >
                      {p}
                    </button>
                  ))}
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ChevronRight size={14} />}
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}

// ── Row component ───────────────────────────────────────────

function RequisitionRow({
  req,
  onView,
}: {
  req: DemoRequisition
  onView: () => void
}) {
  const statusInfo = REQUISITION_STATUS_INFO[req.documentStatus]
  const paymentInfo = PAYMENT_STATUS_LABELS[req.paymentStatus]

  // PNR display: show max 2, then +N more
  const pnrText = (() => {
    if (!req.pnrDisplays || req.pnrDisplays.length === 0) return '—'
    if (req.pnrDisplays.length <= 2) return req.pnrDisplays.join(', ')
    const visible = req.pnrDisplays.slice(0, 2).join(', ')
    const remaining = req.pnrDisplays.length - 2
    return `${visible} +${remaining} อื่น ๆ`
  })()

  return (
    <TableRow onClick={onView}>
      <Td>
        <span className="font-mono font-semibold text-slate-800">
          {req.requisitionNo ?? (
            <span className="text-slate-400 font-normal not-italic">— รอบันทึก —</span>
          )}
        </span>
      </Td>
      <Td className="whitespace-nowrap">{formatDate(req.documentDate)}</Td>
      <Td className="whitespace-nowrap">
        <span className="font-mono text-xs">{req.seriesCode ?? '—'}</span>
      </Td>
      <Td className="max-w-[140px]">
        <span className="text-xs">{pnrText}</span>
      </Td>
      <Td className="max-w-[160px]">
        <span className="text-xs line-clamp-2">
          {req.supplierSnapshot?.supplierName ?? '—'}
        </span>
      </Td>
      <Td className="whitespace-nowrap">{formatDate(req.dueDate)}</Td>
      <Td className="text-right whitespace-nowrap font-mono">
        {formatCurrency(req.netAmount, req.currencyCode)}
      </Td>
      <Td className="text-xs">{req.currencyCode}</Td>
      <Td>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </Td>
      <Td>
        <Badge variant={paymentInfo.variant}>{paymentInfo.label}</Badge>
      </Td>
      <Td className="text-xs text-slate-500">{req.createdBy}</Td>
      <Td className="text-center">
        <button
          onClick={e => {
            e.stopPropagation()
            onView()
          }}
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-[#05a94f] transition-colors"
          title="ดูรายละเอียด"
        >
          <Eye size={14} />
        </button>
      </Td>
    </TableRow>
  )
}
