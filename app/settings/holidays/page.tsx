'use client'

import { useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { PlusCircle, Pencil, Trash2, ToggleLeft, ToggleRight, Search, CalendarOff } from 'lucide-react'
import { formatDateThai } from '@/lib/utils'
import {
  getHolidays, saveHolidays, HOLIDAY_TYPE_LABELS,
  type HolidayData, type HolidayType,
} from '@/lib/holiday-storage'

const BLANK: HolidayData = {
  id: '',
  date: '',
  name: '',
  type: 'COMPANY',
  status: 'Active',
}

const TYPE_OPTIONS = (Object.keys(HOLIDAY_TYPE_LABELS) as HolidayType[]).map(t => ({
  value: t, label: HOLIDAY_TYPE_LABELS[t],
}))

const TYPE_BADGE: Record<HolidayType, 'blue' | 'purple' | 'gray'> = {
  PUBLIC: 'blue',
  COMPANY: 'purple',
  OTHER: 'gray',
}

export default function HolidaysPage() {
  const [holidays,  setHolidays]  = useState<HolidayData[]>([])
  const [search,    setSearch]    = useState('')
  const [typeFilter, setTypeFilter] = useState<HolidayType | ''>('')
  const [modal,     setModal]     = useState(false)
  const [editItem,  setEditItem]  = useState<HolidayData>({ ...BLANK })
  const [isNew,     setIsNew]     = useState(true)
  const [errors,    setErrors]    = useState<Partial<Record<string, string>>>({})

  useEffect(() => {
    setHolidays(getHolidays())
    const handler = () => setHolidays(getHolidays())
    window.addEventListener('holidays_updated', handler)
    return () => window.removeEventListener('holidays_updated', handler)
  }, [])

  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date))

  const filtered = sorted.filter(h => {
    const q = search.toLowerCase()
    const matchesSearch = h.name.toLowerCase().includes(q) || h.date.includes(q)
    const matchesType = !typeFilter || h.type === typeFilter
    return matchesSearch && matchesType
  })

  const activeCount = holidays.filter(h => h.status === 'Active').length

  const openAdd = () => {
    setEditItem({ ...BLANK, id: `HOL-${Date.now()}` })
    setIsNew(true)
    setErrors({})
    setModal(true)
  }

  const openEdit = (h: HolidayData) => {
    setEditItem({ ...h })
    setIsNew(false)
    setErrors({})
    setModal(true)
  }

  const handleToggleStatus = (id: string) => {
    const updated = holidays.map(h =>
      h.id === id
        ? { ...h, status: h.status === 'Active' ? 'Inactive' as const : 'Active' as const }
        : h
    )
    setHolidays(updated)
    saveHolidays(updated)
  }

  const handleDelete = (id: string) => {
    if (!window.confirm('ลบวันหยุดนี้หรือไม่?')) return
    const updated = holidays.filter(h => h.id !== id)
    setHolidays(updated)
    saveHolidays(updated)
  }

  const validate = (): boolean => {
    const e: Partial<Record<string, string>> = {}
    if (!editItem.date) e.date = 'กรุณาระบุวันที่'
    else if (isNew && holidays.some(h => h.date === editItem.date && h.name.trim() === editItem.name.trim()))
      e.date = 'มีวันหยุดนี้ในวันที่เดียวกันอยู่แล้ว'
    if (!editItem.name.trim()) e.name = 'กรุณาระบุชื่อวันหยุด'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    const item: HolidayData = {
      id: editItem.id || `HOL-${Date.now()}`,
      date: editItem.date,
      name: editItem.name.trim(),
      type: editItem.type,
      status: editItem.status,
    }
    const updated = isNew
      ? [...holidays, item]
      : holidays.map(h => h.id === item.id ? item : h)
    setHolidays(updated)
    saveHolidays(updated)
    setModal(false)
  }

  return (
    <AppLayout title="Holidays">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Holidays (ปฏิทินวันหยุด)</h1>
          <p className="text-sm text-slate-500">
            จัดการวันหยุดราชการ / วันหยุดบริษัท / วันหยุดอื่น — ใช้คำนวณเลื่อนวันที่ NAME DL ให้ตรงกับวันทำการเสมอ
            (วันเสาร์–อาทิตย์ถือเป็นวันหยุดโดยอัตโนมัติ ไม่ต้องเพิ่มในตารางนี้)
          </p>
        </div>
        <Button size="sm" icon={<PlusCircle size={14} />} onClick={openAdd}>
          Add Holiday
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarOff size={14} />
            {activeCount} Active / {holidays.length} ทั้งหมด
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อวันหยุด / วันที่ (YYYY-MM-DD)..."
                className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#05a94f] w-72"
              />
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as HolidayType | '')}
              className="px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#05a94f]"
            >
              <option value="">ทุกประเภท</option>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHead>
              <tr>
                <Th>วันที่</Th>
                <Th>ชื่อวันหยุด</Th>
                <Th>ประเภท</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-slate-200 text-center py-8 text-sm text-slate-400">
                    ไม่พบวันหยุด
                  </td>
                </tr>
              ) : (
                filtered.map(h => (
                  <TableRow key={h.id}>
                    <Td className="font-mono font-semibold text-slate-700">{formatDateThai(h.date)}</Td>
                    <Td className="font-medium">{h.name}</Td>
                    <Td>
                      <Badge variant={TYPE_BADGE[h.type]}>{HOLIDAY_TYPE_LABELS[h.type]}</Badge>
                    </Td>
                    <Td>
                      <Badge variant={h.status === 'Active' ? 'green' : 'gray'}>{h.status}</Badge>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="sm"
                          icon={<Pencil size={13} />}
                          className="p-1.5"
                          onClick={() => openEdit(h)}
                          title="แก้ไข"
                        />
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(h.id)}
                          title={h.status === 'Active' ? 'คลิกเพื่อ Inactive' : 'คลิกเพื่อ Active'}
                          className="p-1.5 rounded transition-colors hover:bg-slate-100"
                        >
                          {h.status === 'Active'
                            ? <ToggleRight size={16} className="text-green-500" />
                            : <ToggleLeft  size={16} className="text-slate-400" />
                          }
                        </button>
                        <Button
                          variant="ghost" size="sm"
                          icon={<Trash2 size={13} />}
                          className="p-1.5 text-red-400 hover:text-red-600"
                          onClick={() => handleDelete(h.id)}
                          title="ลบ"
                        />
                      </div>
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={isNew ? 'Add Holiday' : `แก้ไข ${editItem.name}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(false)}>ยกเลิก</Button>
            <Button onClick={handleSave}>บันทึก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="วันที่"
            type="date"
            required
            value={editItem.date}
            onChange={e => setEditItem(p => ({ ...p, date: e.target.value }))}
            error={errors.date}
          />
          <Input
            label="ชื่อวันหยุด"
            required
            placeholder="เช่น วันสงกรานต์, วันหยุดประจำปีบริษัท"
            value={editItem.name}
            onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))}
            error={errors.name}
          />
          <Select
            label="ประเภท"
            required
            options={TYPE_OPTIONS}
            value={editItem.type}
            onChange={e => setEditItem(p => ({ ...p, type: e.target.value as HolidayType }))}
          />
        </div>
      </Modal>
    </AppLayout>
  )
}
