'use client'

import { useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Input, Select } from '@/components/ui/input'
import {
  Search, DollarSign, Star, ToggleLeft, ToggleRight, Pencil, CheckCircle2,
} from 'lucide-react'
import {
  getCurrencies, saveCurrencies, initCurrencies, setDefaultCurrency,
  updateCurrency, toggleCurrencyStatus,
  type CurrencyData,
} from '@/lib/currency-storage'

type FilterTab = 'all' | 'common' | 'active' | 'inactive'

export default function CurrenciesPage() {
  const [currencies, setCurrencies] = useState<CurrencyData[]>([])
  const [search,     setSearch]     = useState('')
  const [tab,        setTab]        = useState<FilterTab>('all')
  const [modal,      setModal]      = useState(false)
  const [editItem,   setEditItem]   = useState<CurrencyData | null>(null)
  const [inlineErr,  setInlineErr]  = useState('')

  useEffect(() => {
    setCurrencies(initCurrencies())
    const handler = () => setCurrencies(getCurrencies())
    window.addEventListener('currencies_updated', handler)
    return () => window.removeEventListener('currencies_updated', handler)
  }, [])

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = currencies.filter(c => {
    const q = search.toLowerCase()
    const matchQ =
      c.currencyCode.toLowerCase().includes(q) ||
      c.numericCode.includes(q) ||
      c.currencyName.toLowerCase().includes(q) ||
      c.symbol.toLowerCase().includes(q)
    if (!matchQ) return false
    if (tab === 'common')   return c.isCommon
    if (tab === 'active')   return c.status === 'ACTIVE'
    if (tab === 'inactive') return c.status === 'INACTIVE'
    return true
  })

  const counts = {
    all:      currencies.length,
    common:   currencies.filter(c => c.isCommon).length,
    active:   currencies.filter(c => c.status === 'ACTIVE').length,
    inactive: currencies.filter(c => c.status === 'INACTIVE').length,
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleToggleStatus = (code: string) => {
    const c = currencies.find(x => x.currencyCode === code)
    if (c?.isDefault && c.status === 'ACTIVE') {
      setInlineErr('ไม่สามารถ Inactive Default Currency ได้ — กรุณาเปลี่ยน Default ก่อน')
      setTimeout(() => setInlineErr(''), 4000)
      return
    }
    toggleCurrencyStatus(code)
  }

  const handleSetDefault = (code: string) => {
    const c = currencies.find(x => x.currencyCode === code)
    if (c?.status === 'INACTIVE') {
      setInlineErr('ไม่สามารถตั้ง Default ให้ Currency ที่ INACTIVE ได้')
      setTimeout(() => setInlineErr(''), 3000)
      return
    }
    setDefaultCurrency(code)
  }

  const openEdit = (c: CurrencyData) => {
    setEditItem({ ...c })
    setModal(true)
  }

  const handleSaveEdit = () => {
    if (!editItem) return
    updateCurrency(editItem.currencyCode, {
      symbol:        editItem.symbol,
      displayName:   editItem.displayName || undefined,
      decimalPlaces: editItem.decimalPlaces,
      isCommon:      editItem.isCommon,
    })
    setModal(false)
    setEditItem(null)
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: `ทั้งหมด (${counts.all})`       },
    { key: 'common',   label: `Common (${counts.common})`     },
    { key: 'active',   label: `Active (${counts.active})`     },
    { key: 'inactive', label: `Inactive (${counts.inactive})` },
  ]

  return (
    <AppLayout title="Currencies">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Currencies Master</h1>
          <p className="text-sm text-slate-500">
            ข้อมูลสกุลเงินตามมาตรฐาน ISO 4217 — ใช้ใน Add Stock, PNR, Payment, Refund
          </p>
        </div>
      </div>

      {inlineErr && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {inlineErr}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign size={14} />
            {counts.active} Active / {counts.all} ทั้งหมด
          </CardTitle>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา Code / Numeric / Name / Symbol..."
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#05a94f] w-80"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 mt-1">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-[#05a94f] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <tr>
                  <Th>Code</Th>
                  <Th>Numeric</Th>
                  <Th>Currency Name</Th>
                  <Th>Symbol</Th>
                  <Th className="text-center">Dec</Th>
                  <Th className="text-center">Common</Th>
                  <Th className="text-center">Default</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="border border-slate-200 text-center py-8 text-sm text-slate-400">
                      ไม่พบสกุลเงิน
                    </td>
                  </tr>
                ) : (
                  filtered.map(c => (
                    <TableRow key={c.currencyCode}>
                      <Td>
                        <span className="font-mono font-bold text-[#05a94f]">{c.currencyCode}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-slate-500 text-xs">{c.numericCode}</span>
                      </Td>
                      <Td className="font-medium text-sm">
                        {c.currencyName}
                        {c.displayName && (
                          <span className="ml-1.5 text-xs text-slate-400">({c.displayName})</span>
                        )}
                      </Td>
                      <Td>
                        <span className="font-mono text-slate-700">{c.symbol}</span>
                      </Td>
                      <Td className="text-center">
                        <span className="text-xs font-mono text-slate-600">{c.decimalPlaces}</span>
                      </Td>
                      <Td className="text-center">
                        {c.isCommon ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100">
                            <CheckCircle2 size={12} className="text-emerald-600" />
                          </span>
                        ) : (
                          <span className="inline-block w-5 h-5" />
                        )}
                      </Td>
                      <Td className="text-center">
                        {c.isDefault ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                            <Star size={9} />
                            Default
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSetDefault(c.currencyCode)}
                            className="text-xs text-slate-400 hover:text-amber-600 transition-colors"
                            title="ตั้งเป็น Default"
                          >
                            ตั้งเป็น Default
                          </button>
                        )}
                      </Td>
                      <Td>
                        <Badge variant={c.status === 'ACTIVE' ? 'green' : 'gray'}>
                          {c.status}
                        </Badge>
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
                            onClick={() => handleToggleStatus(c.currencyCode)}
                            title={c.status === 'ACTIVE' ? 'คลิกเพื่อ Inactive' : 'คลิกเพื่อ Active'}
                            className="p-1.5 rounded transition-colors hover:bg-slate-100"
                          >
                            {c.status === 'ACTIVE'
                              ? <ToggleRight size={16} className="text-green-500" />
                              : <ToggleLeft  size={16} className="text-slate-400" />
                            }
                          </button>
                        </div>
                      </Td>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Modal
        open={modal}
        onClose={() => { setModal(false); setEditItem(null) }}
        title={editItem ? `แก้ไข ${editItem.currencyCode} — ${editItem.currencyName}` : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => { setModal(false); setEditItem(null) }}>ยกเลิก</Button>
            <Button onClick={handleSaveEdit}>บันทึก</Button>
          </>
        }
      >
        {editItem && (
          <div className="space-y-3">
            {/* Read-only ISO fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-[10px] text-slate-400 mb-0.5">Currency Code (ISO 4217)</p>
                <p className="font-mono font-bold text-[#05a94f]">{editItem.currencyCode}</p>
              </div>
              <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-[10px] text-slate-400 mb-0.5">Numeric Code</p>
                <p className="font-mono text-slate-700">{editItem.numericCode}</p>
              </div>
            </div>
            <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-[10px] text-slate-400 mb-0.5">Currency Name (ISO 4217)</p>
              <p className="text-sm font-medium text-slate-700">{editItem.currencyName}</p>
            </div>
            <p className="text-[10px] text-slate-400">Currency Code, Numeric Code และ Name เป็นมาตรฐาน ISO 4217 — ไม่สามารถแก้ไขได้</p>

            {/* Editable fields */}
            <Input
              label="Display Name (ชื่อแสดงผลภาษาไทย)"
              value={editItem.displayName ?? ''}
              onChange={e => setEditItem(p => p ? { ...p, displayName: e.target.value } : p)}
              placeholder="เช่น บาทไทย, ดอลลาร์สหรัฐ"
              helper="ชื่อภาษาไทยหรือชื่อสั้นสำหรับแสดงผลใน Dropdown (ไม่บังคับ)"
            />
            <Input
              label="Symbol"
              value={editItem.symbol}
              onChange={e => setEditItem(p => p ? { ...p, symbol: e.target.value } : p)}
              placeholder="เช่น ฿, $, €"
              helper="สัญลักษณ์สกุลเงินที่ใช้แสดงผล"
            />
            <Select
              label="Decimal Places"
              value={String(editItem.decimalPlaces)}
              onChange={e => setEditItem(p => p ? { ...p, decimalPlaces: Number(e.target.value) } : p)}
              options={[
                { value: '0', label: '0 — ไม่มีทศนิยม เช่น JPY, KRW' },
                { value: '2', label: '2 — ทศนิยม 2 ตำแหน่ง เช่น THB, USD' },
                { value: '3', label: '3 — ทศนิยม 3 ตำแหน่ง เช่น KWD, BHD' },
              ]}
            />
            <div className="flex items-center gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editItem.isCommon}
                  onChange={e => setEditItem(p => p ? { ...p, isCommon: e.target.checked } : p)}
                  className="w-4 h-4 rounded accent-[#05a94f]"
                />
                <span className="text-sm font-medium text-slate-700">สกุลเงินที่ใช้บ่อย (Common)</span>
              </label>
              <span className="text-xs text-slate-400">— จะแสดงก่อนในรายการ Dropdown</span>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  )
}
