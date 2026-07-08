'use client'

import { useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { PlusCircle, Pencil, Trash2, ToggleLeft, ToggleRight, Search, Globe } from 'lucide-react'
import {
  getCountries, saveCountries,
  type CountryData,
} from '@/lib/country-storage'
import { getAirports } from '@/lib/airport-storage'

const BLANK: CountryData = {
  countryCode: '',
  countryName: '',
  displayName: '',
  status: 'Active',
}

export default function CountriesPage() {
  const [countries, setCountries] = useState<CountryData[]>([])
  const [search,    setSearch]    = useState('')
  const [modal,     setModal]     = useState(false)
  const [editItem,  setEditItem]  = useState<CountryData>({ ...BLANK })
  const [isNew,     setIsNew]     = useState(true)
  const [errors,    setErrors]    = useState<Partial<Record<string, string>>>({})
  const [inlineErr, setInlineErr] = useState('')

  useEffect(() => {
    setCountries(getCountries())
    const handler = () => setCountries(getCountries())
    window.addEventListener('countries_updated', handler)
    return () => window.removeEventListener('countries_updated', handler)
  }, [])

  const filtered = countries.filter(c => {
    const q = search.toLowerCase()
    return (
      c.countryCode.toLowerCase().includes(q) ||
      c.countryName.toLowerCase().includes(q) ||
      c.displayName.toLowerCase().includes(q)
    )
  })

  const activeCount = countries.filter(c => c.status === 'Active').length

  const isUsedByAirport = (code: string) =>
    getAirports().some(a => a.countryCode === code)

  const openAdd = () => {
    setEditItem({ ...BLANK })
    setIsNew(true)
    setErrors({})
    setInlineErr('')
    setModal(true)
  }

  const openEdit = (c: CountryData) => {
    setEditItem({ ...c })
    setIsNew(false)
    setErrors({})
    setInlineErr('')
    setModal(true)
  }

  const handleToggleStatus = (code: string) => {
    const updated = countries.map(c =>
      c.countryCode === code
        ? { ...c, status: c.status === 'Active' ? 'Inactive' as const : 'Active' as const }
        : c
    )
    setCountries(updated)
    saveCountries(updated)
  }

  const handleDelete = (code: string) => {
    if (isUsedByAirport(code)) {
      setInlineErr(`ไม่สามารถลบประเทศนี้ได้ เนื่องจากมีสนามบินที่ใช้งานอยู่`)
      setTimeout(() => setInlineErr(''), 4000)
      return
    }
    if (!window.confirm('ลบประเทศนี้หรือไม่?')) return
    const updated = countries.filter(c => c.countryCode !== code)
    setCountries(updated)
    saveCountries(updated)
  }

  const validate = (): boolean => {
    const e: Partial<Record<string, string>> = {}
    const code = editItem.countryCode.trim().toUpperCase()
    if (!code)
      e.countryCode = 'กรุณาระบุ Country Code'
    else if (!/^[A-Z]{3}$/.test(code))
      e.countryCode = 'Country Code ต้องเป็นตัวอักษร 3 ตัวพิมพ์ใหญ่เท่านั้น'
    else if (isNew && countries.some(c => c.countryCode === code))
      e.countryCode = 'Country Code นี้มีอยู่แล้ว'

    if (!editItem.countryName.trim())
      e.countryName = 'กรุณาระบุ Country Name'
    else if (isNew && countries.some(c => c.countryName.toLowerCase() === editItem.countryName.trim().toLowerCase()))
      e.countryName = 'Country Name นี้มีอยู่แล้ว'

    if (!editItem.displayName.trim())
      e.displayName = 'กรุณาระบุ Display Name'

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    const code = editItem.countryCode.trim().toUpperCase()
    const item: CountryData = {
      countryCode: code,
      countryName: editItem.countryName.trim(),
      displayName: editItem.displayName.trim(),
      status: editItem.status,
    }
    const updated = isNew
      ? [...countries, item]
      : countries.map(c => c.countryCode === code ? item : c)
    setCountries(updated)
    saveCountries(updated)
    setModal(false)
  }

  return (
    <AppLayout title="Countries">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Countries</h1>
          <p className="text-sm text-slate-500">
            จัดการข้อมูลประเทศ (ISO Alpha-3) — ใช้ใน Airport Master และ Ticket Filter
          </p>
        </div>
        <Button size="sm" icon={<PlusCircle size={14} />} onClick={openAdd}>
          Add Country
        </Button>
      </div>

      {inlineErr && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {inlineErr}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe size={14} />
            {activeCount} Active / {countries.length} ทั้งหมด
          </CardTitle>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา Code / Country Name / Display Name..."
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#05a94f] w-80"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHead>
              <tr>
                <Th>Code (ISO α-3)</Th>
                <Th>Country Name</Th>
                <Th>Display Name</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-slate-200 text-center py-8 text-sm text-slate-400">
                    ไม่พบประเทศ
                  </td>
                </tr>
              ) : (
                filtered.map(c => (
                  <TableRow key={c.countryCode}>
                    <Td>
                      <span className="font-mono font-bold text-[#05a94f]">{c.countryCode}</span>
                    </Td>
                    <Td className="font-medium">{c.countryName}</Td>
                    <Td className="text-sm text-slate-600">{c.displayName}</Td>
                    <Td>
                      <Badge variant={c.status === 'Active' ? 'green' : 'gray'}>{c.status}</Badge>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="sm"
                          icon={<Pencil size={13} />}
                          className="p-1.5"
                          onClick={() => openEdit(c)}
                          title="แก้ไข"
                        />
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(c.countryCode)}
                          title={c.status === 'Active' ? 'คลิกเพื่อ Inactive' : 'คลิกเพื่อ Active'}
                          className="p-1.5 rounded transition-colors hover:bg-slate-100"
                        >
                          {c.status === 'Active'
                            ? <ToggleRight size={16} className="text-green-500" />
                            : <ToggleLeft  size={16} className="text-slate-400" />
                          }
                        </button>
                        <Button
                          variant="ghost" size="sm"
                          icon={<Trash2 size={13} />}
                          className="p-1.5 text-red-400 hover:text-red-600"
                          onClick={() => handleDelete(c.countryCode)}
                          title={isUsedByAirport(c.countryCode) ? 'มีสนามบินใช้งานอยู่' : 'ลบ'}
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
        title={isNew ? 'Add Country' : `แก้ไข ${editItem.countryCode}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(false)}>ยกเลิก</Button>
            <Button onClick={handleSave}>บันทึก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Country Code (ISO Alpha-3)"
            required
            placeholder="เช่น THA, JPN, USA"
            maxLength={3}
            value={editItem.countryCode}
            onChange={e => setEditItem(p => ({ ...p, countryCode: e.target.value.toUpperCase() }))}
            error={errors.countryCode}
            disabled={!isNew}
            helper="ตัวอักษรพิมพ์ใหญ่ 3 ตัว ตามมาตรฐาน ISO 3166-1 Alpha-3"
          />
          <Input
            label="Country Name"
            required
            placeholder="เช่น Thailand, Japan, United States"
            value={editItem.countryName}
            onChange={e => setEditItem(p => ({ ...p, countryName: e.target.value }))}
            error={errors.countryName}
          />
          <Input
            label="Display Name"
            required
            placeholder="เช่น Thailand, Japan, USA"
            value={editItem.displayName}
            onChange={e => setEditItem(p => ({ ...p, displayName: e.target.value }))}
            error={errors.displayName}
            helper="ชื่อสั้นสำหรับแสดงผล (เช่น UAE แทน United Arab Emirates)"
          />
        </div>
      </Modal>
    </AppLayout>
  )
}
