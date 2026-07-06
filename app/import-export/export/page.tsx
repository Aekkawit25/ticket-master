'use client'

import { useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { FileDown, CheckSquare, Square } from 'lucide-react'

const EXPORT_SECTIONS = [
  { id: 'stock', label: 'Stock Summary', desc: 'ข้อมูลหลักของ Stock ทั้งหมด' },
  { id: 'pnr', label: 'PNR List', desc: 'รายการ PNR พร้อม Fare/Tax/Total' },
  { id: 'sectors', label: 'Flight Segments', desc: 'Sector ของแต่ละ Stock' },
  { id: 'conditions', label: 'Conditions & Stages', desc: 'เงื่อนไขการชำระเงิน' },
  { id: 'payment', label: 'Payment Schedule', desc: 'ตาราง Payment ของทุก PNR' },
  { id: 'seat', label: 'Seat Usage', desc: 'ประวัติการใช้ Seat' },
  { id: 'logs', label: 'Activity Logs', desc: 'ประวัติการเปลี่ยนแปลงทั้งหมด' },
]

export default function ExportPage() {
  const [selected, setSelected] = useState<string[]>(['stock', 'pnr', 'payment'])
  const [filters, setFilters] = useState({ ticket_type: '', status: '', period_from: '', period_to: '' })
  const [exporting, setExporting] = useState(false)

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  const handleExport = () => {
    setExporting(true)
    setTimeout(() => {
      setExporting(false)
      alert('Export Excel สำเร็จ (ระบบยังต้องเชื่อมต่อ Supabase)')
    }, 1200)
  }

  return (
    <AppLayout title="Export Excel">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Export Excel</h1>
          <p className="text-sm text-slate-500">ส่งออกข้อมูลเป็น Excel (.xlsx)</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        {/* Filters */}
        <Card>
          <CardHeader><CardTitle>Filter ข้อมูลที่ต้อง Export</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Ticket Type" value={filters.ticket_type}
                onChange={e => setFilters(p => ({ ...p, ticket_type: e.target.value }))}
                options={[
                  { value: 'Group', label: 'Group' },
                  { value: 'FIT', label: 'FIT' },
                  { value: 'Ticket + Land', label: 'Ticket + Land' },
                ]} placeholder="ทุกประเภท" />
              <Select label="Status" value={filters.status}
                onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}
                options={[
                  { value: 'Draft', label: 'Draft' },
                  { value: 'Active', label: 'Active' },
                  { value: 'Closed', label: 'Closed' },
                  { value: 'Cancelled', label: 'Cancelled' },
                ]} placeholder="ทุก Status" />
              <Input label="Period จาก" type="date" value={filters.period_from}
                onChange={e => setFilters(p => ({ ...p, period_from: e.target.value }))} />
              <Input label="Period ถึง" type="date" value={filters.period_to}
                onChange={e => setFilters(p => ({ ...p, period_to: e.target.value }))} />
            </div>
          </CardContent>
        </Card>

        {/* Sections to include */}
        <Card>
          <CardHeader>
            <CardTitle>เลือก Sheet ที่ต้อง Export</CardTitle>
            <button onClick={() => setSelected(EXPORT_SECTIONS.map(s => s.id))} className="text-xs text-[#05a94f] hover:underline">
              เลือกทั้งหมด
            </button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {EXPORT_SECTIONS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    selected.includes(s.id)
                      ? 'border-[#05a94f] bg-green-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {selected.includes(s.id)
                    ? <CheckSquare size={16} className="text-[#05a94f] flex-shrink-0" />
                    : <Square size={16} className="text-slate-300 flex-shrink-0" />
                  }
                  <div>
                    <p className="text-sm font-medium text-slate-700">{s.label}</p>
                    <p className="text-xs text-slate-400">{s.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Export Button */}
        <Button
          className="w-full"
          size="lg"
          loading={exporting}
          icon={<FileDown size={16} />}
          disabled={selected.length === 0}
          onClick={handleExport}
        >
          Export Excel ({selected.length} Sheet)
        </Button>

        {/* Note */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
          <p className="font-medium">หมายเหตุ:</p>
          <ul className="mt-1 list-disc list-inside space-y-0.5">
            <li>วันที่ใน Excel จะแสดงเป็นรูปแบบ DD MMM YY เช่น 25 Feb 26</li>
            <li>ตัวเลขใช้หน่วย Currency ของแต่ละ Stock</li>
            <li>ไฟล์จะถูก Download โดยอัตโนมัติ</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  )
}
