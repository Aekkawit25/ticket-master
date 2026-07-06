'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { PlusCircle, Pencil, Trash2, Search, Package } from 'lucide-react'
import {
  getDemoSuppliers, saveDemoSupplier, deleteDemoSupplier, generateSupplierId,
  type DemoSupplier,
} from '@/lib/demo-storage'

const SUPPLIER_TYPE_OPTIONS = [
  { value: 'BSP',   label: 'BSP' },
  { value: 'GDS',   label: 'GDS' },
  { value: 'AGENT', label: 'Ticketing Agent' },
  { value: 'BANK',  label: 'Bank' },
  { value: 'OTHER', label: 'อื่นๆ' },
]

const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  BSP: 'BSP', GDS: 'GDS', AGENT: 'Ticketing Agent', BANK: 'Bank', OTHER: 'อื่นๆ',
}

function emptySupplier(): DemoSupplier {
  return {
    supplierId: generateSupplierId(),
    supplierCode: '',
    supplierName: '',
    supplierType: 'BSP',
    taxId: null,
    bankAccount: null,
    status: 'Active',
    remark: '',
  }
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<DemoSupplier[]>([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<DemoSupplier>(emptySupplier())
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => { setSuppliers(getDemoSuppliers()) }, [])

  const filtered = suppliers.filter(s =>
    s.supplierCode.toLowerCase().includes(search.toLowerCase()) ||
    s.supplierName.toLowerCase().includes(search.toLowerCase())
  )

  const openAdd = () => { setForm(emptySupplier()); setErrors({}); setModal(true) }
  const openEdit = (s: DemoSupplier) => { setForm({ ...s }); setErrors({}); setModal(true) }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.supplierCode.trim()) e.supplierCode = 'กรุณากรอก Supplier Code'
    if (!form.supplierName.trim()) e.supplierName = 'กรุณากรอก Supplier Name'
    if (!form.supplierType) e.supplierType = 'กรุณาเลือกประเภท'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    saveDemoSupplier({ ...form, supplierCode: form.supplierCode.trim().toUpperCase() })
    setSuppliers(getDemoSuppliers())
    setModal(false)
  }

  const handleDelete = (s: DemoSupplier) => {
    if (!window.confirm(`ลบ Supplier "${s.supplierName}" ใช่หรือไม่?`)) return
    deleteDemoSupplier(s.supplierId)
    setSuppliers(getDemoSuppliers())
  }

  const patch = (p: Partial<DemoSupplier>) => setForm(f => ({ ...f, ...p }))

  return (
    <AppLayout title="Supplier Master">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Supplier Master</h1>
          <p className="text-sm text-slate-500">จัดการข้อมูล Supplier สำหรับการชำระเงิน</p>
        </div>
        <Button size="sm" icon={<PlusCircle size={14} />} onClick={openAdd}>
          เพิ่ม Supplier
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package size={14} />
            {filtered.length} Supplier
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
                <Th>Supplier Code</Th>
                <Th>Supplier Name</Th>
                <Th>ประเภท</Th>
                <Th>Tax ID</Th>
                <Th>สถานะ</Th>
                <Th>Action</Th>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <EmptyRow cols={6} message="ไม่พบ Supplier" />
              ) : (
                filtered.map(s => (
                  <TableRow key={s.supplierId}>
                    <Td>
                      <span className="font-mono text-sm font-semibold text-slate-700">{s.supplierCode}</span>
                    </Td>
                    <Td className="font-medium">{s.supplierName}</Td>
                    <Td>
                      <span className="text-sm text-slate-600">{SUPPLIER_TYPE_LABELS[s.supplierType] ?? s.supplierType}</span>
                    </Td>
                    <Td className="text-slate-500 text-sm">{s.taxId || '—'}</Td>
                    <Td>
                      <Badge variant={s.status === 'Active' ? 'green' : 'gray'}>{s.status}</Badge>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" icon={<Pencil size={13} />} className="p-1.5" onClick={() => openEdit(s)} />
                        <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} className="p-1.5 text-red-400 hover:text-red-600" onClick={() => handleDelete(s)} />
                      </div>
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={form.supplierCode ? `แก้ไข: ${form.supplierCode}` : 'เพิ่ม Supplier'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(false)}>ยกเลิก</Button>
            <Button onClick={handleSave}>บันทึก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Supplier Code"
            value={form.supplierCode}
            onChange={e => patch({ supplierCode: e.target.value.toUpperCase() })}
            maxLength={20}
            required
            error={errors.supplierCode}
          />
          <Input
            label="Supplier Name"
            value={form.supplierName}
            onChange={e => patch({ supplierName: e.target.value })}
            required
            error={errors.supplierName}
          />
          <Select
            label="ประเภท Supplier"
            value={form.supplierType}
            onChange={e => patch({ supplierType: e.target.value as DemoSupplier['supplierType'] })}
            required
            error={errors.supplierType}
            options={SUPPLIER_TYPE_OPTIONS}
          />
          <Input
            label="Tax ID (ถ้ามี)"
            value={form.taxId ?? ''}
            onChange={e => patch({ taxId: e.target.value || null })}
          />
          <Input
            label="Bank Account (ถ้ามี)"
            value={form.bankAccount ?? ''}
            onChange={e => patch({ bankAccount: e.target.value || null })}
          />
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">สถานะ</label>
            <div className="flex gap-2">
              {(['Active', 'Inactive'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => patch({ status: v })}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    form.status === v
                      ? 'bg-[#05a94f] text-white border-[#05a94f]'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            label="หมายเหตุ"
            value={form.remark}
            onChange={e => patch({ remark: e.target.value })}
            rows={2}
          />
        </div>
      </Modal>
    </AppLayout>
  )
}
