'use client'

import { useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { PlusCircle, Pencil, Trash2, Search, Globe } from 'lucide-react'

const mockCountries = [
  { id: '1', country_name: 'Japan', status: 'Active' },
  { id: '2', country_name: 'South Korea', status: 'Active' },
  { id: '3', country_name: 'China', status: 'Active' },
  { id: '4', country_name: 'Taiwan', status: 'Active' },
  { id: '5', country_name: 'Hong Kong', status: 'Active' },
  { id: '6', country_name: 'Singapore', status: 'Active' },
  { id: '7', country_name: 'Malaysia', status: 'Active' },
  { id: '8', country_name: 'Vietnam', status: 'Active' },
  { id: '9', country_name: 'United Kingdom', status: 'Active' },
  { id: '10', country_name: 'France', status: 'Active' },
  { id: '11', country_name: 'Germany', status: 'Active' },
  { id: '12', country_name: 'UAE', status: 'Active' },
  { id: '13', country_name: 'Australia', status: 'Active' },
  { id: '14', country_name: 'USA', status: 'Active' },
]

export default function CountriesPage() {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)

  const filtered = mockCountries.filter(c =>
    c.country_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AppLayout title="Countries">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Countries</h1>
          <p className="text-sm text-slate-500">จัดการข้อมูลประเทศ</p>
        </div>
        <Button size="sm" icon={<PlusCircle size={14} />} onClick={() => setModal(true)}>Add Country</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe size={14} />{filtered.length} ประเทศ</CardTitle>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..."
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#05a94f]" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHead>
              <tr><Th>Country Name</Th><Th>Status</Th><Th>Action</Th></tr>
            </TableHead>
            <TableBody>
              {filtered.map(c => (
                <TableRow key={c.id}>
                  <Td className="font-medium">{c.country_name}</Td>
                  <Td><Badge variant={c.status === 'Active' ? 'green' : 'gray'}>{c.status}</Badge></Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" icon={<Pencil size={13} />} className="p-1.5" />
                      <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} className="p-1.5 text-red-400" />
                    </div>
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Country"
        footer={<><Button variant="outline" onClick={() => setModal(false)}>ยกเลิก</Button><Button onClick={() => setModal(false)}>บันทึก</Button></>}>
        <Input label="Country Name" required placeholder="ชื่อประเทศ (ภาษาอังกฤษ)" />
      </Modal>
    </AppLayout>
  )
}
