'use client'

import { useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, X, Info } from 'lucide-react'

const SHEETS_REQUIRED = [
  { name: 'Stock Info', required: true, desc: 'ข้อมูลหลักของ Stock (Ticket Type, Airline, Currency, ฯลฯ)' },
  { name: 'Flight Segments', required: true, desc: 'Sector ของเส้นทางบิน (ต้องมี Travel Day — ไม่ต้องมีวันที่จริง)' },
  { name: 'Conditions', required: false, desc: 'เงื่อนไขการชำระเงิน (optional)' },
  { name: 'Condition Stages', required: false, desc: 'ขั้นตอนการชำระเงิน (ถ้ามี Conditions)' },
  { name: 'PNR List', required: false, desc: 'PNR Code, Dummy PNR, Travel Start, Seat Total, Fare, Tax, Total, Condition Code, Status, Remark (ไม่ต้องมี Duration / Used / Bal. / Travel End)' },
]

export default function ImportStockPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; imported: number; errors: { row: number; message: string }[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = (f: File) => {
    setFile(f)
    setResult(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleImport = () => {
    if (!file) return
    setUploading(true)
    setTimeout(() => {
      setUploading(false)
      setResult({
        success: true,
        imported: 3,
        errors: [
          { row: 5, message: 'PNR List: Travel Start ว่าง — ต้องกรอกวันเดินทาง' },
          { row: 8, message: 'Flight Segments: Sector แรกต้องเป็น Departure' },
        ],
      })
    }, 1500)
  }

  return (
    <AppLayout title="Import Stock">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Import Stock</h1>
          <p className="text-sm text-slate-500">นำเข้า Stock Ticket จาก Excel</p>
        </div>
        <Button variant="outline" size="sm" icon={<Download size={14} />}>
          Download Template
        </Button>
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        {/* Sheet Requirements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info size={14} />
              โครงสร้าง Excel Template
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {SHEETS_REQUIRED.map(s => (
                <div key={s.name} className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-xl">
                  <Badge variant={s.required ? 'green' : 'gray'}>
                    {s.required ? 'Required' : 'Optional'}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Sheet: {s.name}</p>
                    <p className="text-xs text-slate-400">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Validation Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" />
              กฎ Validation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
              <li>ต้องมี Series Code และ Ticket Type ทุกครั้ง</li>
              <li>Group / Ticket + Land ต้องมี Sector อย่างน้อย 2 รายการ (Departure + Arrival)</li>
              <li>FIT ต้องมี Sector อย่างน้อย 1 รายการ</li>
              <li>Sector แรกต้องเป็น Departure เสมอ</li>
              <li>PNR ต้องมี Travel Start และ Seat Total (Travel End คำนวณจาก Sector Travel Day)</li>
              <li>ไม่ต้อง Import Duration / Used / Bal. / Travel End — ระบบคำนวณให้</li>
              <li>Condition Code ใน PNR ต้องตรงกับ Conditions ที่ Import</li>
              <li>วันที่ต้องอยู่ในรูปแบบ DD MMM YY เช่น 25 Feb 26</li>
              <li>หลัง Import สำเร็จ จะไปหน้า Review ทันที</li>
            </ul>
          </CardContent>
        </Card>

        {/* Upload Zone */}
        <Card>
          <CardContent className="pt-5">
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                dragOver ? 'border-[#05a94f] bg-green-50' : 'border-slate-300 hover:border-slate-400'
              }`}
            >
              {file ? (
                <div>
                  <FileSpreadsheet size={32} className="mx-auto text-green-500 mb-3" />
                  <p className="text-sm font-medium text-slate-700">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                  <button onClick={() => setFile(null)} className="mt-2 text-xs text-red-400 hover:text-red-600 flex items-center gap-1 mx-auto">
                    <X size={12} /> ลบไฟล์
                  </button>
                </div>
              ) : (
                <div>
                  <Upload size={32} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-sm font-medium text-slate-600">ลาก & วางไฟล์ Excel ที่นี่</p>
                  <p className="text-xs text-slate-400 mb-3">หรือ</p>
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-[#05a94f] text-white rounded-lg text-sm font-medium hover:bg-[#048f43] transition-colors">
                    <Upload size={14} />
                    เลือกไฟล์
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  </label>
                  <p className="text-xs text-slate-400 mt-2">รองรับ .xlsx, .xls เท่านั้น</p>
                </div>
              )}
            </div>

            {file && (
              <div className="mt-4">
                <Button
                  className="w-full"
                  loading={uploading}
                  icon={<Upload size={14} />}
                  onClick={handleImport}
                >
                  {uploading ? 'กำลัง Import...' : 'Import Excel'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Result */}
        {result && (
          <Card className={result.success ? 'border-green-200' : 'border-red-200'}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                {result.success ? (
                  <CheckCircle2 size={18} className="text-green-500" />
                ) : (
                  <AlertTriangle size={18} className="text-red-500" />
                )}
                <p className="font-semibold text-slate-800">
                  Import {result.success ? 'สำเร็จ' : 'ล้มเหลว'}
                </p>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Import แล้ว {result.imported} รายการ
                {result.errors.length > 0 && ` · พบ ${result.errors.length} ข้อผิดพลาด`}
              </p>
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-red-700">ข้อผิดพลาด:</p>
                  {result.errors.map((e, i) => (
                    <div key={i} className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-600">
                      Row {e.row}: {e.message}
                    </div>
                  ))}
                </div>
              )}
              {result.success && (
                <Button variant="success" className="mt-3 w-full" icon={<CheckCircle2 size={14} />}>
                  ดู Review ก่อนบันทึก
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  )
}
