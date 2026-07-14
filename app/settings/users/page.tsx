'use client'

import { useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { PlusCircle, Pencil, Users } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DemoUserMeta {
  userId: string
  name: string
  role: string
  email: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEMO_USERS: DemoUserMeta[] = [
  { userId: 'u-admin', name: 'Admin User',  email: 'admin@company.com',   role: 'Admin'   },
  { userId: 'u-mgr',   name: 'Manager A',   email: 'manager@company.com', role: 'Manager' },
  { userId: 'u-staff', name: 'Staff B',     email: 'staff@company.com',   role: 'Staff'   },
  { userId: 'u-view',  name: 'Viewer C',    email: 'viewer@company.com',  role: 'Viewer'  },
]

const roleColor: Record<string, 'green' | 'blue' | 'yellow' | 'gray'> = {
  Admin: 'green', Manager: 'blue', Staff: 'yellow', Viewer: 'gray',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [modal, setModal] = useState(false)

  return (
    <AppLayout title="Users">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">จัดการสิทธิ์ผู้ใช้งานระบบ</p>
        </div>
        <Button size="sm" icon={<PlusCircle size={14} />} onClick={() => setModal(true)}>Add User</Button>
      </div>

      {/* Permission Info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { role: 'Admin',   desc: 'ทำได้ทุกอย่าง',                            color: 'border-green-200 bg-green-50' },
          { role: 'Manager', desc: 'สร้าง/แก้ไข/ปิด Stock, Import/Export',   color: 'border-blue-200 bg-blue-50' },
          { role: 'Staff',   desc: 'เพิ่ม PNR, แก้ไขบางส่วน',                color: 'border-amber-200 bg-amber-50' },
          { role: 'Viewer',  desc: 'ดูข้อมูลเท่านั้น',                         color: 'border-slate-200 bg-slate-50' },
        ].map(r => (
          <div key={r.role} className={`rounded-xl border p-3 ${r.color}`}>
            <p className="text-xs font-bold text-slate-700">{r.role}</p>
            <p className="text-xs text-slate-500 mt-0.5">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users size={14} />{DEMO_USERS.length} Users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHead>
              <tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Action</Th></tr>
            </TableHead>
            <TableBody>
              {DEMO_USERS.map(u => (
                <TableRow key={u.userId}>
                  <Td className="font-medium">{u.name}</Td>
                  <Td className="text-sm text-slate-500">{u.email}</Td>
                  <Td><Badge variant={roleColor[u.role] || 'gray'}>{u.role}</Badge></Td>
                  <Td>
                    <Button variant="ghost" size="sm" icon={<Pencil size={13} />} className="p-1.5" />
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Add User Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} title="Add User"
        footer={<><Button variant="outline" onClick={() => setModal(false)}>ยกเลิก</Button><Button onClick={() => setModal(false)}>บันทึก</Button></>}>
        <div className="space-y-3">
          <Input label="Name" required placeholder="ชื่อ-นามสกุล" />
          <Input label="Email" type="email" required placeholder="email@company.com" />
          <Select label="Role" required value="Staff"
            options={[
              { value: 'Admin', label: 'Admin' },
              { value: 'Manager', label: 'Manager' },
              { value: 'Staff', label: 'Staff' },
              { value: 'Viewer', label: 'Viewer' },
            ]} onChange={() => {}} />
        </div>
      </Modal>

    </AppLayout>
  )
}
