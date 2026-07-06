'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import TicketTable from '@/components/tickets/TicketTable'
import TicketFilter from '@/components/tickets/TicketFilter'
import { Button } from '@/components/ui/button'
import { PlusCircle, Upload, Download, FileDown } from 'lucide-react'
import { useState } from 'react'
import { downloadExcelTemplate } from '@/lib/excel-template'
import { parseExcelImport } from '@/lib/excel-import'

interface FilterState {
  search: string
  status: string
  airline_code: string
  ticket_type: string
  period_from: string
  period_to: string
}

export default function LandTicketsPage() {
  const [filters, setFilters] = useState<FilterState>({
    search: '', status: '', airline_code: '', ticket_type: '', period_from: '', period_to: '',
  })
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await parseExcelImport(file)
    sessionStorage.setItem('ticket_import_review_data', JSON.stringify(result))
    router.push('/tickets/import-review')
    e.target.value = ''
  }

  return (
    <AppLayout title="Ticket + Land">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Ticket + Land</h1>
          <p className="text-sm text-slate-500">ตั๋วเครื่องบินพร้อม Land Package — ต้องมีอย่างน้อย 2 Sector</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" icon={<FileDown size={14} />} onClick={() => downloadExcelTemplate('Ticket + Land')}>
            Template Excel
          </Button>
          <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>
            Import Excel
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => router.push('/import-export/export')}>Export</Button>
          <Button size="sm" icon={<PlusCircle size={14} />} onClick={() => router.push('/tickets/add?type=Ticket+Land')}>Add Ticket + Land</Button>
        </div>
      </div>

      <TicketFilter onFilter={setFilters} showTypeFilter={false} />
      <TicketTable filterType="Ticket + Land" filters={filters} />
    </AppLayout>
  )
}
