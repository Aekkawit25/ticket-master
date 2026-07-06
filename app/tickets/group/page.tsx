'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import TicketTable from '@/components/tickets/TicketTable'
import TicketFilter from '@/components/tickets/TicketFilter'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { PlusCircle, Upload, Download, FileDown, Trash2 } from 'lucide-react'
import { downloadExcelTemplate } from '@/lib/excel-template'
import { parseExcelImport } from '@/lib/excel-import'
import { getDemoStocks, clearDemoStocksByType } from '@/lib/demo-storage'

interface FilterState {
  search: string
  status: string
  airline_code: string
  ticket_type: string
  period_from: string
  period_to: string
}

export default function GroupTicketsPage() {
  const [filters, setFilters] = useState<FilterState>({
    search: '', status: '', airline_code: '', ticket_type: '', period_from: '', period_to: '',
  })
  const [groupCount, setGroupCount] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const refreshCount = () =>
    setGroupCount(getDemoStocks().filter(s => s.ticketType === 'Group').length)

  useEffect(() => {
    refreshCount()
    const handler = () => refreshCount()
    window.addEventListener('demo_stock_updated', handler)
    return () => window.removeEventListener('demo_stock_updated', handler)
  }, [])

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await parseExcelImport(file)
    sessionStorage.setItem('ticket_import_review_data', JSON.stringify(result))
    router.push('/tickets/import-review')
    e.target.value = ''
  }

  const doClear = () => {
    clearDemoStocksByType('Group')
    setConfirmClear(false)
  }

  return (
    <AppLayout title="Group Tickets">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Group Tickets</h1>
          <p className="text-sm text-slate-500">Stock ตั๋วแบบ Group — ต้องมีอย่างน้อย 2 Sector (Departure + Arrival)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" icon={<FileDown size={14} />} onClick={() => downloadExcelTemplate('Group')}>
            Template Excel
          </Button>
          <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>
            Import Excel
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => router.push('/import-export/export')}>Export</Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => setConfirmClear(true)}
            disabled={groupCount === 0}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            ล้างข้อมูล Group
          </Button>
          <Button size="sm" icon={<PlusCircle size={14} />} onClick={() => router.push('/tickets/add?type=Group')}>Add Group Stock</Button>
        </div>
      </div>

      <TicketFilter onFilter={setFilters} showTypeFilter={false} />
      <TicketTable filterType="Group" filters={filters} />

      {/* ── Clear Group Data Modal ── */}
      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="ล้างข้อมูล Group Tickets"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>ยกเลิก</Button>
            <Button variant="danger" onClick={doClear}>ล้างข้อมูล Group</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          ต้องการลบ Stock ประเภท Group ทั้งหมด{' '}
          <strong className="text-red-600">{groupCount} รายการ</strong>{' '}
          ออกจาก localStorage ใช่หรือไม่?
        </p>
        <p className="text-xs text-slate-500 mt-2">
          ข้อมูลประเภทอื่น (FIT / Ticket + Land) จะไม่ถูกลบ — เมื่อสร้าง Stock ใหม่
          ระบบจะบันทึกลง localStorage และแสดงผลทันที
        </p>
        <p className="text-xs text-red-600 mt-2">การกระทำนี้ไม่สามารถยกเลิกได้</p>
      </Modal>
    </AppLayout>
  )
}
