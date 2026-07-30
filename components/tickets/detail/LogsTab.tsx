'use client'

import { useState, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import { FileDown, X } from 'lucide-react'
import type { DemoStock } from '@/lib/demo-storage'

interface LogsTabProps {
  liveStock: DemoStock
}

const ACTION_FILTER_OPTIONS = [
  { value: '', label: 'ทุกประเภท' },
  { value: 'เพิ่ม PNR', label: 'เพิ่ม PNR' },
  { value: 'แก้ไข PNR', label: 'แก้ไข PNR' },
  { value: 'ลบ PNR', label: 'ลบ PNR' },
  { value: 'นำเวลาบิน', label: 'นำเวลาบิน' },
  { value: 'คืนค่า', label: 'คืนค่า Schedule' },
  { value: 'Duplicate', label: 'Duplicate PNR' },
  { value: 'ยกเลิก', label: 'ยกเลิก PNR' },
  { value: 'ปิด PNR', label: 'ปิด PNR' },
  { value: 'เปลี่ยน Condition', label: 'เปลี่ยน Condition' },
]

function getActionBadgeVariant(action: string): 'green' | 'blue' | 'red' | 'yellow' | 'gray' {
  if (action.includes('เพิ่ม') || action.includes('Duplicate')) return 'green'
  if (action.includes('ลบ') || action.includes('ยกเลิก')) return 'red'
  if (action.includes('แก้ไข') || action.includes('นำเวลา') || action.includes('เปลี่ยน')) return 'blue'
  if (action.includes('คืนค่า') || action.includes('ปิด')) return 'yellow'
  return 'gray'
}

export function LogsTab({ liveStock }: LogsTabProps) {
  const [filterPnr, setFilterPnr]           = useState('')
  const [filterAction, setFilterAction]     = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo]     = useState('')
  const printRef = useRef<HTMLDivElement>(null)

  const allLogs = liveStock.logs

  const pnrOptions = useMemo(() => {
    const names = new Set<string>()
    allLogs.forEach(l => { if (l.pnrDisplay) names.add(l.pnrDisplay) })
    return Array.from(names).sort()
  }, [allLogs])

  const filtered = useMemo(() => {
    return allLogs.filter(l => {
      if (filterPnr && l.pnrDisplay !== filterPnr) return false
      if (filterAction && !l.action.includes(filterAction)) return false
      if (filterDateFrom && l.createdAt < filterDateFrom) return false
      if (filterDateTo && l.createdAt > filterDateTo + 'T23:59:59') return false
      return true
    })
  }, [allLogs, filterPnr, filterAction, filterDateFrom, filterDateTo])

  const hasFilter = !!(filterPnr || filterAction || filterDateFrom || filterDateTo)

  const clearFilters = () => {
    setFilterPnr('')
    setFilterAction('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const exportExcel = () => {
    const rows: Record<string, string>[] = []
    filtered.forEach(l => {
      const base = {
        'Date/Time': formatDateTime(l.createdAt),
        'ประเภท': l.action,
        'PNR': l.pnrDisplay || '',
        'Scope': l.scope === 'batch' ? `Batch (${l.affectedPnrCount} PNR)` : l.scope === 'single' ? 'เฉพาะ PNR นี้' : '',
        'ผู้บันทึก': l.createdBy,
        'รายละเอียด': l.message,
        'Sector': '',
        'Field': '',
        'ค่าเดิม': '',
        'ค่าใหม่': '',
      }
      if (l.sectorChanges && l.sectorChanges.length > 0) {
        l.sectorChanges.forEach((sc, i) => {
          rows.push({
            ...base,
            'รายละเอียด': i === 0 ? base['รายละเอียด'] : '',
            'Sector': `S${sc.sectorSeq} (${sc.sectorType})`,
            'Field': sc.field,
            'ค่าเดิม': sc.oldValue,
            'ค่าใหม่': sc.newValue,
          })
        })
      } else {
        rows.push(base)
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [18, 18, 12, 16, 12, 45, 16, 10, 12, 12].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Log')
    XLSX.writeFile(wb, `audit-log-${liveStock.stockCode}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const printPdf = () => {
    const content = printRef.current
    if (!content) return
    const win = window.open('', '_blank', 'width=1000,height=700')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="utf-8" />
        <title>Audit Log — ${liveStock.stockCode}</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; font-size: 11px; color: #1e293b; margin: 20px; }
          h2 { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
          p.sub { font-size: 10px; color: #64748b; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th { background: #f1f5f9; font-weight: 600; border: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; }
          td { border: 1px solid #e2e8f0; padding: 4px 6px; vertical-align: top; }
          .changes { margin-top: 4px; }
          .change-row { display: flex; gap: 6px; align-items: center; font-size: 9.5px; }
          .old { color: #94a3b8; text-decoration: line-through; }
          .arrow { color: #cbd5e1; }
          .new { color: #d97706; font-weight: 600; }
          .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
          .badge-blue { background: #eff6ff; color: #1d4ed8; }
          .badge-green { background: #f0fdf4; color: #16a34a; }
          .badge-red { background: #fef2f2; color: #dc2626; }
          .badge-yellow { background: #fffbeb; color: #b45309; }
          .badge-gray { background: #f8fafc; color: #64748b; }
          @media print { @page { margin: 1.2cm; size: A4 landscape; } }
        </style>
      </head>
      <body>
        <h2>Audit Log — ${liveStock.stockCode} · ${liveStock.groupName}</h2>
        <p class="sub">แสดง ${filtered.length} รายการ · พิมพ์: ${new Date().toLocaleString('th-TH')}</p>
        ${content.innerHTML}
        <script>window.onload = () => { window.print(); }<\/script>
      </body>
      </html>
    `)
    win.document.close()
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">PNR</label>
            <select value={filterPnr} onChange={e => setFilterPnr(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 min-w-[130px]">
              <option value="">ทุก PNR</option>
              {pnrOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">ประเภท</label>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 min-w-[140px]">
              {ACTION_FILTER_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">จากวันที่</label>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30" />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">ถึงวันที่</label>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30" />
          </div>
          {hasFilter && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors pb-1.5">
              <X size={11} /> ล้างตัวกรอง
            </button>
          )}
          <div className="ml-auto flex gap-1.5 pb-0.5">
            <Button size="sm" variant="outline" icon={<FileDown size={12} />} onClick={exportExcel}>
              Excel
            </Button>
            <Button size="sm" variant="outline" icon={<FileDown size={12} />} onClick={printPdf}>
              PDF
            </Button>
          </div>
        </div>
        {hasFilter && (
          <p className="text-[10px] text-slate-400 mt-1.5">
            แสดง {filtered.length} / {allLogs.length} รายการ
          </p>
        )}
      </div>

      {/* Log table (also used as print source) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Print-hidden header for the printable table */}
        <div ref={printRef} style={{ display: 'contents' }}>
          <Table>
            <TableHead>
              <tr>
                <Th style={{ minWidth: 130 }}>Date/Time</Th>
                <Th style={{ minWidth: 110 }}>ประเภท</Th>
                <Th style={{ minWidth: 100 }}>PNR</Th>
                <Th>รายละเอียด</Th>
                <Th style={{ minWidth: 90 }}>Scope</Th>
                <Th style={{ minWidth: 80 }}>ผู้บันทึก</Th>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <EmptyRow cols={6} message="ไม่พบ Log ตามเงื่อนไขที่เลือก" />
              ) : (
                filtered.map((l, idx) => (
                  <TableRow key={l.logId ?? idx}>
                    <Td className="text-xs text-slate-500 whitespace-nowrap align-top">
                      {formatDateTime(l.createdAt)}
                    </Td>
                    <Td className="align-top">
                      <Badge variant={getActionBadgeVariant(l.action)}>{l.action}</Badge>
                    </Td>
                    <Td className="text-xs font-mono font-bold align-top">
                      {l.pnrDisplay || '—'}
                    </Td>
                    <Td className="text-xs text-slate-700 align-top">
                      <p className="leading-relaxed">{l.message}</p>
                      {l.sectorChanges && l.sectorChanges.length > 0 && (
                        <div className="mt-1.5 space-y-0.5 pl-1 border-l-2 border-amber-200">
                          {l.sectorChanges.map((sc, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-slate-400 font-medium whitespace-nowrap">
                                S{sc.sectorSeq} {sc.field}:
                              </span>
                              <span className="text-slate-400 line-through">{sc.oldValue}</span>
                              <span className="text-slate-300">→</span>
                              <span className="text-amber-600 font-semibold">{sc.newValue}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td className="text-xs align-top">
                      {l.scope === 'batch'
                        ? <span className="text-amber-600 font-medium">Batch · {l.affectedPnrCount} PNR</span>
                        : l.scope === 'single'
                          ? <span className="text-slate-400">เฉพาะ PNR นี้</span>
                          : <span className="text-slate-300">—</span>}
                    </Td>
                    <Td className="text-xs font-medium align-top">{l.createdBy}</Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
