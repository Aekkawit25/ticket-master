import * as XLSX from 'xlsx'
import type { FlightSectorFormData } from '@/types'

// ─── PNR Import Template ──────────────────────────────────────────────────────
/**
 * Generate and download a PNR-only Excel template (.xlsx) for Step 4 Import.
 * - 2-sector (sectors.length ≤ 2): 1 row per PNR, 10 columns
 * - Multi-sector (sectors.length > 2): 1 row per Sector, 11 columns
 * Includes: PNR sheet (headers + empty rows), Example sheet, Sector Reference sheet
 */
export function downloadPnrTemplate(sectors: FlightSectorFormData[]): void {
  const isMultiSector = sectors.length > 2
  const wb = XLSX.utils.book_new()

  const h2 = ['PNR','Seat','วันไป','Flight ไป','From (ไป)','To (ไป)','วันกลับ','Flight กลับ','From (กลับ)','To (กลับ)']
  const hN = ['Import Group','PNR','Seat','Seq','วันที่','Flight','From','To','เวลาออก','เวลาถึง','+Day']

  // ── PNR sheet (data entry) ─────────────────────────────────────────────────
  if (isMultiSector) {
    const pnrWs = XLSX.utils.aoa_to_sheet([
      hN,
      ...Array(15).fill(hN.map(() => '')),
    ])
    pnrWs['!cols'] = [14,12,8,6,12,10,8,8,10,10,6].map(w => ({ wch: w }))
    pnrWs['!freeze'] = { xSplit: 0, ySplit: 1 }
    XLSX.utils.book_append_sheet(wb, pnrWs, 'PNR')

    // Example sheet
    const exampleRows = sectors.map(s => [
      'G1', '', '36', String(s.seq),
      '10/10/2026',
      s.flight_no || `FL${s.seq}`,
      s.dep_airport_code || 'BKK',
      s.arr_airport_code || 'NRT',
      s.dep_time || '08:00',
      s.arr_time || '16:00',
      String(s.arr_day_offset ?? 0),
    ])
    const exWs = XLSX.utils.aoa_to_sheet([
      ['ตัวอย่างข้อมูล (กรอกใน Sheet PNR เท่านั้น)', ...Array(hN.length - 1).fill('')],
      hN,
      ...exampleRows,
      hN.map(() => ''),
      ['G2', 'SD1SD2', '36', ...sectors.map(s => [String(s.seq)]).flat()],
    ])
    exWs['!cols'] = [14,12,8,6,12,10,8,8,10,10,6].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, exWs, 'Example')
  } else {
    const ob  = sectors[0]
    const ret = sectors[sectors.length - 1]

    const pnrWs = XLSX.utils.aoa_to_sheet([
      h2,
      ...Array(15).fill(h2.map(() => '')),
    ])
    pnrWs['!cols'] = [12,8,12,10,8,8,12,12,8,8].map(w => ({ wch: w }))
    pnrWs['!freeze'] = { xSplit: 0, ySplit: 1 }
    XLSX.utils.book_append_sheet(wb, pnrWs, 'PNR')

    // Example sheet
    const exWs = XLSX.utils.aoa_to_sheet([
      ['ตัวอย่างข้อมูล (กรอกใน Sheet PNR เท่านั้น)', ...Array(h2.length - 1).fill('')],
      h2,
      ['SD1SD2','36','10/10/2026', ob?.flight_no||'TG640', ob?.dep_airport_code||'BKK', ob?.arr_airport_code||'NRT',
       '14/10/2026', ret?.flight_no||'TG641', ret?.dep_airport_code||'NRT', ret?.arr_airport_code||'BKK'],
      ['','36','17/10/2026', ob?.flight_no||'TG640', ob?.dep_airport_code||'BKK', ob?.arr_airport_code||'NRT',
       '21/10/2026', ret?.flight_no||'TG641', ret?.dep_airport_code||'NRT', ret?.arr_airport_code||'BKK'],
    ])
    exWs['!cols'] = [12,8,12,10,8,8,12,12,8,8].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, exWs, 'Example')
  }

  // ── Sector Reference sheet ─────────────────────────────────────────────────
  if (sectors.length > 0) {
    const refH = ['Seq','ประเภท','Airline','Flight No.','จาก','ถึง','เวลาออก','เวลาถึง','+Day','Travel Day']
    const refWs = XLSX.utils.aoa_to_sheet([
      ['Sector Template จาก Step 2 — อ้างอิงเท่านั้น ห้ามแก้ไข Sheet นี้', ...Array(refH.length - 1).fill('')],
      refH,
      ...sectors.map(s => [
        s.seq, s.sector_type, s.airline_code, `${s.airline_code}${s.flight_no}`,
        s.dep_airport_code, s.arr_airport_code,
        s.dep_time, s.arr_time, s.arr_day_offset, s.day_offset,
      ]),
    ])
    refWs['!cols'] = refH.map(() => ({ wch: 14 }))
    XLSX.utils.book_append_sheet(wb, refWs, 'Sector Reference')
  }

  // ── Notes sheet ────────────────────────────────────────────────────────────
  const notesWs = XLSX.utils.aoa_to_sheet([
    ['คู่มือการกรอก PNR Import Template'],
    [],
    ['Sheet PNR:', 'กรอกข้อมูล PNR ที่นี่ (ห้ามเปลี่ยนชื่อ Sheet หรือหัวคอลัมน์)'],
    ['Sheet Example:', 'ตัวอย่างข้อมูล — ห้ามกรอกในชีตนี้'],
    ['Sheet Sector Reference:', 'Sector Template จาก Step 2 — ห้ามแก้ไข'],
    [],
    isMultiSector
      ? ['รูปแบบ:', `1 แถว = 1 Sector · ต้องครบ ${sectors.length} Sector ต่อ 1 PNR · ใช้ Import Group รวม Sector ของ Dummy PNR`]
      : ['รูปแบบ:', '1 แถว = 1 PNR'],
    ['วันที่:', 'DD/MM/YYYY เช่น 10/10/2026'],
    ['เวลา:', 'HH:MM เช่น 23:00'],
    ['PNR:', 'ว่างได้ — ระบบจะสร้าง Dummy PNR ให้อัตโนมัติ'],
    ['Dummy PNR:', 'ถ้า PNR ว่าง — Multi-Sector ต้องระบุ Import Group เพื่อรวม Sector เดียวกัน'],
  ])
  notesWs['!cols'] = [{ wch: 24 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, notesWs, 'Notes')

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `PNR_Template_${isMultiSector ? 'Multi' : '2S'}_${date}.xlsx`)
}

// ─── Full Stock Import Template ───────────────────────────────────────────────
export function downloadExcelTemplate(ticketType: 'Group' | 'FIT' | 'Ticket + Land'): void {
  const wb = XLSX.utils.book_new()

  // ── README sheet ──────────────────────────────────────────────────────────────
  const readmeData = [
    ['คู่มือการกรอกข้อมูล Excel Template'],
    [],
    ['STOCK_INFO: กรอกข้อมูลหลักของ Stock 1 รายการ'],
    ['FLIGHT_SECTORS: กรอกข้อมูล Sector / เส้นทางบิน'],
    ['CONDITIONS: กรอก Payment Condition (ไม่บังคับ)'],
    ['PNR_LIST: กรอกข้อมูล PNR (travelStart บังคับ, pnrCode ไม่บังคับ)'],
    [],
    ['รูปแบบวันที่: DD/MM/YYYY หรือ YYYY-MM-DD'],
    ['taxType: separate = แยก Tax, included = รวมใน Fare, pending = ยังไม่ระบุ'],
    ['PNR Code ว่างได้ — ระบบจะสร้าง Dummy PNR ตอน Review'],
    ['Import แล้วระบบจะพาไปหน้า Review ก่อน ยังไม่บันทึกทันที'],
    ['ห้ามลบหรือเปลี่ยนชื่อ Sheet และ Column Headers'],
  ]
  const wsReadme = XLSX.utils.aoa_to_sheet(readmeData)
  XLSX.utils.book_append_sheet(wb, wsReadme, 'README')

  // ── STOCK_INFO sheet ──────────────────────────────────────────────────────────
  const stockCodeExample =
    ticketType === 'Group'
      ? 'GRP-2606-001'
      : ticketType === 'FIT'
      ? 'FIT-2606-001'
      : 'TNL-2606-001'
  const tripTypeExample = ticketType === 'FIT' ? 'One-way' : 'Round-trip'

  const stockInfoData = [
    ['stockCode', 'ticketType', 'groupName', 'airlineCode', 'country', 'destination', 'currency', 'status', 'tripType', 'remark'],
    [stockCodeExample, ticketType, '(ชื่อกรุ๊ป)', 'TG', 'Japan', 'Tokyo, Japan', 'THB', 'Draft', tripTypeExample, ''],
  ]
  const wsStockInfo = XLSX.utils.aoa_to_sheet(stockInfoData)
  XLSX.utils.book_append_sheet(wb, wsStockInfo, 'STOCK_INFO')

  // ── FLIGHT_SECTORS sheet ──────────────────────────────────────────────────────
  const sectorsHeader = ['seq', 'sectorType', 'airlineCode', 'flightNo', 'from', 'to', 'depTime', 'arrTime', 'arrDayOffset', 'dayOffset', 'remark']

  let sectorsRows: (string | number)[][]
  if (ticketType === 'FIT') {
    // One-way: 1 Departure sector
    sectorsRows = [
      [1, 'Departure', 'TG', 'TG676', 'BKK', 'NRT', '08:00', '16:00', 0, 0, ''],
    ]
  } else {
    // Round-trip: Departure + Arrival
    sectorsRows = [
      [1, 'Departure', 'TG', 'TG676', 'BKK', 'NRT', '08:00', '16:00', 0, 0, ''],
      [2, 'Arrival',   'TG', 'TG677', 'NRT', 'BKK', '17:00', '22:00', 0, 4, ''],
    ]
  }
  const wsSectors = XLSX.utils.aoa_to_sheet([sectorsHeader, ...sectorsRows])
  XLSX.utils.book_append_sheet(wb, wsSectors, 'FLIGHT_SECTORS')

  // ── CONDITIONS sheet ──────────────────────────────────────────────────────────
  const conditionsData = [
    ['conditionCode', 'conditionName', 'description', 'conditionStatus', 'stageSeq', 'stageName', 'paymentType', 'amountType', 'amount', 'percent', 'baseDate', 'dueDaysBefore', 'ttlTime', 'remark'],
    ['COND01', 'มัดจำ + ชำระครั้งเดียว', '', 'Active', 1, 'มัดจำ', 'Deposit', 'Fixed', 5000, '', 'Travel Start', 30, '18:00', ''],
    ['COND01', 'มัดจำ + ชำระครั้งเดียว', '', 'Active', 2, 'ชำระส่วนที่เหลือ', 'Final Payment', 'Remaining', '', '', 'Travel Start', 14, '18:00', ''],
  ]
  const wsConditions = XLSX.utils.aoa_to_sheet(conditionsData)
  XLSX.utils.book_append_sheet(wb, wsConditions, 'CONDITIONS')

  // ── PNR_LIST sheet ────────────────────────────────────────────────────────────
  const pnrData = [
    ['pnrCode', 'travelStart', 'seatTotal', 'fare', 'taxType', 'tax', 'conditionCode', 'status', 'remark'],
    ['', '2026-03-10', 20, 240000, 'separate', 60000, 'COND01', 'Pending', ''],
    ['', '2026-03-14', 20, 240000, 'included', 0,     'COND01', 'Pending', ''],
  ]
  const wsPNR = XLSX.utils.aoa_to_sheet(pnrData)
  XLSX.utils.book_append_sheet(wb, wsPNR, 'PNR_LIST')

  // ── MASTER_DATA sheet ─────────────────────────────────────────────────────────
  const masterData = [
    // Headers
    ['ticketType', 'tripType', 'sectorType', 'taxType', 'status', 'pnrStatus', 'paymentType', 'amountType', 'baseDate', 'currency'],
    // Values (max 4 rows to cover all columns)
    ['Group',          'One-way',    'Outbound',  'separate', 'Draft',     'Pending',   'Deposit',       'Fixed',     'Travel Start', 'THB'],
    ['FIT',            'Round-trip', 'Transit',   'included', 'Active',    'Confirmed', 'Final Payment', 'Percent',   'Travel End',   'USD'],
    ['Ticket + Land',  '',           'Domestic',  'pending',  'Closed',    '',          'Full Payment',  'Remaining', '',             'EUR'],
    ['',               '',           'Return',    '',         'Cancelled', '',          '',              '',          '',             'JPY'],
  ]
  const wsMaster = XLSX.utils.aoa_to_sheet(masterData)
  XLSX.utils.book_append_sheet(wb, wsMaster, 'MASTER_DATA')

  // ── Write file ────────────────────────────────────────────────────────────────
  const filename = `ticket-stock-template-${ticketType.toLowerCase().replace(/\s+/g, '-').replace(/\+/g, 'and')}.xlsx`
  XLSX.writeFile(wb, filename)
}
