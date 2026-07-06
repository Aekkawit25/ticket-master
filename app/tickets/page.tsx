'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import TicketTable from '@/components/tickets/TicketTable'
import TicketFilter from '@/components/tickets/TicketFilter'
import { SelectTicketTypeModal } from '@/components/tickets/SelectTicketTypeModal'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/card'
import { PlusCircle, Upload, Download, Ticket, Users, Globe } from 'lucide-react'

export default function AllTicketsPage() {
  const router = useRouter()
  const [filters, setFilters] = useState({})
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <AppLayout title="All Tickets">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">All Tickets</h1>
          <p className="text-sm text-slate-500">Stock ตั๋วเครื่องบินทุกประเภท</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => router.push('/import-export/import')}>Import</Button>
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => router.push('/import-export/export')}>Export</Button>
          <Button
            size="sm"
            icon={<PlusCircle size={14} />}
            onClick={() => setModalOpen(true)}
          >
            Add Stock
          </Button>
        </div>
      </div>

      {/* Summary mini cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard title="Group" value={0} icon={<Users size={18} />} color="#05a94f" />
        <StatCard title="FIT" value={0} icon={<Ticket size={18} />} color="#3b82f6" />
        <StatCard title="Ticket + Land" value={0} icon={<Globe size={18} />} color="#8b5cf6" />
      </div>

      {/* Filter */}
      <TicketFilter onFilter={setFilters} showTypeFilter={true} />

      {/* Table */}
      <TicketTable />

      {/* Modal เลือกประเภท Stock */}
      <SelectTicketTypeModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </AppLayout>
  )
}
