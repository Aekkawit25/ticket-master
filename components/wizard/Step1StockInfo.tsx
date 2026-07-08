'use client'

import { Input, Select, Textarea } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { FlightSeriesFormData } from '@/types'
import { MASTER_AIRLINES } from '@/lib/master-data'

const AIRLINES = MASTER_AIRLINES.map(a => ({
  value: a.code,
  label: `${a.code} — ${a.name}`,
}))


// ─── Component ────────────────────────────────────────────────────────────────

interface Step1Props {
  data: FlightSeriesFormData
  onChange: (data: Partial<FlightSeriesFormData>) => void
  errors?: Partial<Record<keyof FlightSeriesFormData, string>>
}

export default function Step1StockInfo({ data, onChange, errors = {} }: Step1Props) {
  return (
    <div className="space-y-4">
      {/* Card: Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลหลักของ Stock</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Series Code"
              required
              value={data.stock_code}
              onChange={e => onChange({ stock_code: e.target.value })}
              error={errors.stock_code}
              placeholder="เช่น GRP2601"
              helper="รหัส Series (ไม่ซ้ำกัน)"
            />
            <Input
              label="Series Name"
              required
              value={data.group_name}
              onChange={e => onChange({ group_name: e.target.value })}
              error={errors.group_name}
              placeholder="เช่น Sweden Aurora Mar 26"
              helper="ชื่อ Stock หรือชื่อซีรีส์"
            />
            <SearchableSelect
              label="Airline"
              required
              options={AIRLINES}
              value={data.airline_code}
              onChange={v => onChange({ airline_code: v })}
              placeholder="เลือกสายการบิน..."
              error={errors.airline_code}
            />
          </div>
        </CardContent>
      </Card>

      {/* Card: Settings */}
      <Card>
        <CardHeader>
          <CardTitle>การตั้งค่า</CardTitle>
          <p className="text-xs text-slate-400">Trip Type กำหนดได้ใน Step 2 Flight Segments</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Currency"
              required
              value={data.currency}
              onChange={e => onChange({ currency: e.target.value })}
              options={[
                { value: 'THB', label: 'THB — บาทไทย' },
                { value: 'JPY', label: 'JPY — เยนญี่ปุ่น' },
                { value: 'KRW', label: 'KRW — วอนเกาหลี' },
                { value: 'USD', label: 'USD — ดอลลาร์สหรัฐ' },
                { value: 'EUR', label: 'EUR — ยูโร' },
                { value: 'GBP', label: 'GBP — ปอนด์อังกฤษ' },
              ]}
            />
            <Select
              label="Status"
              required
              value={data.status}
              onChange={e => onChange({ status: e.target.value as 'Draft' | 'Active' })}
              options={[
                { value: 'Draft', label: 'Draft — ยังไม่เผยแพร่' },
                { value: 'Active', label: 'Active — เปิดใช้งาน' },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Card: Remark */}
      <Card>
        <CardContent>
          <Textarea
            label="Remark"
            value={data.remark}
            onChange={e => onChange({ remark: e.target.value })}
            placeholder="หมายเหตุเพิ่มเติม..."
            rows={2}
          />
        </CardContent>
      </Card>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        <p className="font-medium mb-1">หมายเหตุ:</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>Route จะสร้างอัตโนมัติจาก Sector ใน Step 2</li>
          <li>Period จะคำนวณอัตโนมัติจาก PNR ใน Step 4</li>
          <li>Trip Type (One-way / Round-trip / Multi-city) กำหนดได้ใน Step 2 Flight Segments</li>
          <li><strong>Series Name</strong> = ชื่อ Series เช่น "Sweden Aurora Mar 26"</li>
          {(data.ticket_type === 'Group' || data.ticket_type === 'Ticket + Land') && (
            <li>{data.ticket_type} ต้องมี Sector ขั้นต่ำ 2 รายการ (Departure + Arrival)</li>
          )}
          {data.ticket_type === 'FIT' && (
            <li>FIT รองรับ One-way (1 Sector), Round-trip และ Multi-city (≥ 2 Sector)</li>
          )}
        </ul>
      </div>
    </div>
  )
}
