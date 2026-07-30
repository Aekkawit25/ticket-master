'use client'

import { useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { PlusCircle, Pencil, ToggleLeft, ToggleRight, Search, Building2 } from 'lucide-react'
import { getAirports, saveAirports, type StoredAirport } from '@/lib/airport-storage'
import { getActiveCountries, getCountryByCode, type CountryData } from '@/lib/country-storage'

const BLANK: StoredAirport = { code: '', name: '', city: '', countryCode: '', status: 'Active' }

export default function AirportsPage() {
  const [airports,   setAirports]   = useState<StoredAirport[]>([])
  const [countries,  setCountries]  = useState<CountryData[]>([])
  const [search,     setSearch]     = useState('')
  const [modal,      setModal]      = useState(false)
  const [editItem,   setEditItem]   = useState<StoredAirport>({ ...BLANK })
  const [isNew,      setIsNew]      = useState(true)
  const [errors,     setErrors]     = useState<Partial<Record<string, string>>>({})

  useEffect(() => {
    setAirports(getAirports())
    setCountries(getActiveCountries())
    const apHandler = () => setAirports(getAirports())
    const ctHandler = () => setCountries(getActiveCountries())
    window.addEventListener('airports_updated',  apHandler)
    window.addEventListener('countries_updated', ctHandler)
    return () => {
      window.removeEventListener('airports_updated',  apHandler)
      window.removeEventListener('countries_updated', ctHandler)
    }
  }, [])

  const countryOptions = countries.map(c => ({
    value: c.countryCode,
    label: `${c.countryCode} — ${c.displayName}`,
    subtitle: c.countryName !== c.displayName ? c.countryName : undefined,
  }))

  const filtered = airports.filter(a => {
    const q = search.toLowerCase()
    const countryName = getCountryByCode(a.countryCode)?.displayName ?? a.countryCode
    return (
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.countryCode.toLowerCase().includes(q) ||
      countryName.toLowerCase().includes(q)
    )
  })

  const activeCount = airports.filter(a => a.status === 'Active').length

  const openAdd = () => {
    setEditItem({ ...BLANK })
    setIsNew(true)
    setErrors({})
    setModal(true)
  }

  const openEdit = (a: StoredAirport) => {
    setEditItem({ ...a })
    setIsNew(false)
    setErrors({})
    setModal(true)
  }

  const handleToggleStatus = (code: string) => {
    const updated = airports.map(a =>
      a.code === code
        ? { ...a, status: a.status === 'Active' ? 'Inactive' as const : 'Active' as const }
        : a
    )
    setAirports(updated)
    saveAirports(updated)
  }

  const validate = (): boolean => {
    const e: Partial<Record<string, string>> = {}
    const code = editItem.code.trim().toUpperCase()
    if (!code)
      e.code = 'กรุณาระบุ Airport Code'
    else if (!/^[A-Z0-9]{2,5}$/.test(code))
      e.code = 'Code ต้องเป็น 2–5 ตัวอักษร/ตัวเลขเท่านั้น'
    else if (isNew && airports.some(a => a.code === code))
      e.code = 'Airport Code นี้มีอยู่แล้ว'
    if (!editItem.name.trim())  e.name = 'กรุณาระบุชื่อสนามบิน'
    if (!editItem.city.trim())  e.city = 'กรุณาระบุเมือง'
    if (!editItem.countryCode)  e.countryCode = 'กรุณาเลือกประเทศ'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    const code = editItem.code.trim().toUpperCase()
    const item: StoredAirport = {
      code,
      name:        editItem.name.trim(),
      city:        editItem.city.trim(),
      countryCode: editItem.countryCode,
      status:      editItem.status,
    }
    const updated = isNew
      ? [...airports, item]
      : airports.map(a => a.code === code ? item : a)
    setAirports(updated)
    saveAirports(updated)
    setModal(false)
  }

  return (
    <AppLayout title="Airports">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Airports</h1>
          <p className="text-sm text-slate-500">
            จัดการข้อมูลสนามบิน — เฉพาะ <span className="text-green-600 font-medium">Active</span> ที่ใช้ใน Flight Segment ได้
          </p>
        </div>
        <Button size="sm" icon={<PlusCircle size={14} />} onClick={openAdd}>
          Add Airport
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 size={14} />
            {activeCount} Active / {airports.length} ทั้งหมด
          </CardTitle>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา Code / ชื่อ / เมือง / ประเทศ..."
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#05a94f] w-72"
            />
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border border-slate-200 text-center py-8 text-sm text-slate-400">
                    ไม่พบสนามบิน
                  </td>
                </tr>
              ) : (
                filtered.map(a => {
                  const countryData = getCountryByCode(a.countryCode)
                  return (
                    <TableRow key={a.code}>
                      <Td>
                        <span className="font-mono font-bold text-[#05a94f]">{a.code}</span>
                      </Td>
                      <Td className="font-medium">{a.name}</Td>
                      <Td className="text-sm text-slate-600">{a.city}</Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold text-slate-500">{a.countryCode}</span>
                          {countryData && (
                            <span className="text-sm text-slate-700">{countryData.displayName}</span>
                          )}
                          {!countryData && (
                            <span className="text-xs text-amber-600">— ไม่พบในระบบ</span>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <Badge variant={a.status === 'Active' ? 'green' : 'gray'}>{a.status}</Badge>
                      </Td>
                      <Td>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="sm"
                            icon={<Pencil size={13} />}
                            className="p-1.5"
                            onClick={() => openEdit(a)}
                            title="แก้ไข"
                          />
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(a.code)}
                            title={a.status === 'Active' ? 'คลิกเพื่อ Inactive' : 'คลิกเพื่อ Active'}
                            className="p-1.5 rounded transition-colors hover:bg-slate-100"
                          >
                            {a.status === 'Active'
                              ? <ToggleRight size={16} className="text-green-500" />
                              : <ToggleLeft  size={16} className="text-slate-400" />
                            }
                          </button>
                        </div>
                      </Td>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={isNew ? 'Add Airport' : `แก้ไข ${editItem.code}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(false)}>ยกเลิก</Button>
            <Button onClick={handleSave}>บันทึก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Airport Code (IATA)"
            required
            placeholder="เช่น BKK, CTS, NRT"
            maxLength={5}
            value={editItem.code}
            onChange={e => setEditItem(p => ({ ...p, code: e.target.value.toUpperCase() }))}
            error={errors.code}
            disabled={!isNew}
          />
          <Input
            label="Airport Name"
            required
            placeholder="เช่น New Chitose Airport"
            value={editItem.name}
            onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))}
            error={errors.name}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="City"
              required
              placeholder="เช่น Sapporo"
              value={editItem.city}
              onChange={e => setEditItem(p => ({ ...p, city: e.target.value }))}
              error={errors.city}
            />
            <div>
              <SearchableSelect
                label="Country"
                required
                options={countryOptions}
                value={editItem.countryCode}
                onChange={v => setEditItem(p => ({ ...p, countryCode: v }))}
                placeholder="เลือกประเทศ..."
                error={errors.countryCode}
              />
            </div>
          </div>
        </div>
      </Modal>
    </AppLayout>
  )
}
