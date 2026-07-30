'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { PlusCircle, Pencil, Trash2, Search, Plane, ExternalLink } from 'lucide-react'
import { MASTER_AIRLINES } from '@/lib/master-data'

type AirlineRow = { airline_code: string; airline_name: string; status: string }

const baseAirlines: AirlineRow[] = MASTER_AIRLINES.map(a => ({
  airline_code: a.code,
  airline_name: a.name,
  status: 'Active',
}))

export default function AirlinesPage() {
  const router = useRouter()
  const [airlines, setAirlines] = useState<AirlineRow[]>(baseAirlines)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [editItem, setEditItem] = useState<AirlineRow | null>(null)

  const filtered = airlines.filter(a =>
    a.airline_code.toLowerCase().includes(search.toLowerCase()) ||
    a.airline_name.toLowerCase().includes(search.toLowerCase())
  )

  const openAdd = () => { setEditItem({ airline_code: '', airline_name: '', status: 'Active' }); setModal(true) }
  const openEdit = (a: AirlineRow) => { setEditItem({ ...a }); setModal(true) }

  return (
    <AppLayout title="Airlines">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Airlines</h1>
          <p className="text-sm text-slate-500">จัดการข้อมูลสายการบิน</p>
        </div>
        <Button size="sm" icon={<PlusCircle size={14} />} onClick={openAdd}>
          Add Airline
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane size={14} />
            {filtered.length} สายการบิน
          </CardTitle>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา..."
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#05a94f]"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHead>
              <tr>
                <Th>Airline Code</Th>
                <Th>Airline Name</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.map(a => (
                <TableRow key={a.airline_code}>
                  <Td>
                    <button
                      onClick={() => router.push(`/settings/airlines/${a.airline_code}`)}
                      className="flex items-center gap-2 hover:text-[#05a94f] transition-colors group"
                    >
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center group-hover:bg-green-50">
                        <span className="text-xs font-bold text-slate-700 group-hover:text-[#05a94f]">{a.airline_code}</span>
                      </div>
                    </button>
                  </Td>
                  <Td>
                    <button
                      onClick={() => router.push(`/settings/airlines/${a.airline_code}`)}
                      className="font-medium text-left hover:text-[#05a94f] transition-colors"
                    >
                      {a.airline_name}
                    </button>
                  </Td>
                  <Td><Badge variant={a.status === 'Active' ? 'green' : 'gray'}>{a.status}</Badge></Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<ExternalLink size={13} />}
                        className="p-1.5 text-slate-400 hover:text-[#05a94f]"
                        onClick={() => router.push(`/settings/airlines/${a.airline_code}`)}
                        title="ดูรายละเอียด"
                      />
                      <Button variant="ghost" size="sm" icon={<Pencil size={13} />} className="p-1.5" onClick={() => openEdit(a)} />
                      <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} className="p-1.5 text-red-400 hover:text-red-600" />
                    </div>
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editItem?.airline_code ? 'แก้ไข Airline' : 'Add Airline'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(false)}>ยกเลิก</Button>
            <Button onClick={() => setModal(false)}>บันทึก</Button>
          </>
        }
      >
        {editItem && (
          <div className="space-y-3">
            <Input label="Airline Code" value={editItem.airline_code} onChange={e => setEditItem(p => p ? { ...p, airline_code: e.target.value.toUpperCase() } : p)} maxLength={5} required />
            <Input label="Airline Name" value={editItem.airline_name} onChange={e => setEditItem(p => p ? { ...p, airline_name: e.target.value } : p)} required />
          </div>
        )}
      </Modal>
    </AppLayout>
  )
}
