'use client'

import { useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { PlusCircle, Pencil, Trash2, Search, Building2 } from 'lucide-react'

const mockAirports = [
  { airport_code: 'BKK', airport_name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand', status: 'Active' },
  { airport_code: 'DMK', airport_name: 'Don Mueang International Airport', city: 'Bangkok', country: 'Thailand', status: 'Active' },
  { airport_code: 'NRT', airport_name: 'Narita International Airport', city: 'Tokyo', country: 'Japan', status: 'Active' },
  { airport_code: 'HND', airport_name: 'Haneda Airport', city: 'Tokyo', country: 'Japan', status: 'Active' },
  { airport_code: 'KIX', airport_name: 'Kansai International Airport', city: 'Osaka', country: 'Japan', status: 'Active' },
  { airport_code: 'ICN', airport_name: 'Incheon International Airport', city: 'Seoul', country: 'South Korea', status: 'Active' },
  { airport_code: 'HKG', airport_name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'China', status: 'Active' },
  { airport_code: 'SIN', airport_name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore', status: 'Active' },
  { airport_code: 'LHR', airport_name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom', status: 'Active' },
  { airport_code: 'CDG', airport_name: 'Paris Charles de Gaulle Airport', city: 'Paris', country: 'France', status: 'Active' },
  { airport_code: 'DXB', airport_name: 'Dubai International Airport', city: 'Dubai', country: 'UAE', status: 'Active' },
]

export default function AirportsPage() {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)

  const filtered = mockAirports.filter(a =>
    a.airport_code.toLowerCase().includes(search.toLowerCase()) ||
    a.airport_name.toLowerCase().includes(search.toLowerCase()) ||
    a.city.toLowerCase().includes(search.toLowerCase()) ||
    a.country.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AppLayout title="Airports">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Airports</h1>
          <p className="text-sm text-slate-500">จัดการข้อมูลสนามบิน</p>
        </div>
        <Button size="sm" icon={<PlusCircle size={14} />} onClick={() => setModal(true)}>
          Add Airport
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 size={14} />
            {filtered.length} สนามบิน
          </CardTitle>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..."
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#05a94f]" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHead>
              <tr>
                <Th>Code</Th>
                <Th>Airport Name</Th>
                <Th>City</Th>
                <Th>Country</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.map(a => (
                <TableRow key={a.airport_code}>
                  <Td className="font-mono font-bold text-[#05a94f]">{a.airport_code}</Td>
                  <Td className="font-medium">{a.airport_name}</Td>
                  <Td className="text-sm text-slate-600">{a.city}</Td>
                  <Td className="text-sm text-slate-600">{a.country}</Td>
                  <Td><Badge variant={a.status === 'Active' ? 'green' : 'gray'}>{a.status}</Badge></Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" icon={<Pencil size={13} />} className="p-1.5" />
                      <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} className="p-1.5 text-red-400 hover:text-red-600" />
                    </div>
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Airport"
        footer={<><Button variant="outline" onClick={() => setModal(false)}>ยกเลิก</Button><Button onClick={() => setModal(false)}>บันทึก</Button></>}>
        <div className="space-y-3">
          <Input label="Airport Code" required placeholder="เช่น BKK" maxLength={5} />
          <Input label="Airport Name" required placeholder="ชื่อสนามบิน" />
          <Input label="City" placeholder="เมือง" />
          <Input label="Country" placeholder="ประเทศ" />
        </div>
      </Modal>
    </AppLayout>
  )
}
